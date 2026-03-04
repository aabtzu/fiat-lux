"""
View blueprint — file view page + DocumentBot chat/visualization API.

GET  /view/<file_id>       — view page (auth required)
POST /api/chat/<file_id>   — generate or refine visualization via DocumentBot
"""

import json
import os
import re
from flask import Blueprint, render_template, request, jsonify, current_app
from auth import requires_auth, requires_auth_api, get_current_user
from db import db

view_bp = Blueprint('view', __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_file(file_id, user_id):
    """Return (file_dict, access_level) or (None, 'none')."""
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM files WHERE id = ? AND user_id = ?",
            (file_id, user_id)
        ).fetchone()
        if row:
            return dict(row), 'owner'

        row = conn.execute(
            """SELECT f.*, s.can_edit FROM files f
               JOIN file_shares s ON s.file_id = f.id
               WHERE f.id = ? AND s.shared_with_user_id = ?
                 AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))""",
            (file_id, user_id)
        ).fetchone()
        if row:
            return dict(row), 'edit' if row['can_edit'] else 'view'

    return None, 'none'


def _read_text(user_id, filename):
    data_dir = current_app.config['DATA_DIR']
    path = os.path.join(data_dir, 'users', user_id, 'imports', filename)
    with open(path, encoding='utf-8') as f:
        return f.read()


def _get_source_files(file_id):
    """Return source file metadata for display (chips in header)."""
    with db() as conn:
        rows = conn.execute(
            "SELECT id, original_name, mime_type, is_style_ref FROM source_files"
            " WHERE file_id = ? ORDER BY added_at",
            (file_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def _get_style_refs(file_id, user_id):
    """Return raw bytes for any style-reference source files."""
    with db() as conn:
        rows = conn.execute(
            "SELECT sf.original_name, sf.mime_type, sf.original_file_path"
            " FROM source_files sf JOIN files f ON f.id = sf.file_id"
            " WHERE sf.file_id = ? AND f.user_id = ? AND sf.is_style_ref = 1"
            " AND sf.original_file_path IS NOT NULL"
            " ORDER BY sf.added_at",
            (file_id, user_id)
        ).fetchall()

    refs = []
    data_dir = current_app.config['DATA_DIR']
    for r in rows:
        path = os.path.join(data_dir, 'users', user_id, 'imports', r['original_file_path'])
        try:
            with open(path, 'rb') as f:
                refs.append({'name': r['original_name'], 'mime_type': r['mime_type'], 'bytes': f.read()})
        except FileNotFoundError:
            pass
    return refs


def _get_document_text(file, file_id):
    """Concatenate all source files in order. Prefers CSV over text when available.
    Falls back to files.file_path for old records."""
    with db() as conn:
        rows = conn.execute(
            "SELECT original_name, file_path, csv_file_path FROM source_files"
            " WHERE file_id = ? ORDER BY added_at",
            (file_id,)
        ).fetchall()
    if rows:
        def _best_path(sf):
            # CSV is more compact and structured — Claude handles it better for tabular data
            return sf['csv_file_path'] if sf['csv_file_path'] else sf['file_path']
        if len(rows) == 1:
            return _read_text(file['user_id'], _best_path(rows[0]))
        parts = [
            f"=== {sf['original_name']} ===\n{_read_text(file['user_id'], _best_path(sf))}"
            for sf in rows
        ]
        return '\n\n'.join(parts)
    # Fallback: old records with a combined file_path blob
    if file.get('file_path'):
        return _read_text(file['user_id'], file['file_path'])
    return ''



_REREAD_PATTERN = re.compile(
    r'\b(re-?read|original (data|document)|all (data|items)|missing data|'
    r'from the source|don\'t see|where is|repopulate|reload|start over|'
    r'regenerate|raw data|the file)\b',
    re.IGNORECASE,
)

_INCORPORATE_PATTERN = re.compile(r'new data added|incorporate', re.IGNORECASE)

_CHART_PATTERN = re.compile(
    r'\b(bar chart|line chart|pie chart|chart|graph|plot|histogram|'
    r'by month|by week|by day|by year|over time|trend)\b',
    re.IGNORECASE,
)

# Must have a clear addition signal to use the fast append path
_CHART_ADD_PATTERN = re.compile(
    r'\b(add|show|create|give|include|append|put|insert)\b',
    re.IGNORECASE,
)

_CHART_REMOVE_PATTERN = re.compile(
    r'\b(delete|remove|hide|get rid of|take out|drop|clear)\b',
    re.IGNORECASE,
)

# "make X a chart" / "change X to a chart" → replacement, needs full HTML context
_CHART_REPLACE_PATTERN = re.compile(
    r'\b(make|change|replace|convert|turn|swap)\b',
    re.IGNORECASE,
)

def _needs_full_reread(message: str) -> bool:
    return bool(_REREAD_PATTERN.search(message))

def _incorporate_pattern_match(message: str) -> bool:
    return bool(_INCORPORATE_PATTERN.search(message))

def _is_chart_request(message: str) -> bool:
    """True only for clearly add-a-new-chart requests (has addition verb + chart noun, no remove/replace)."""
    return (bool(_CHART_PATTERN.search(message))
            and bool(_CHART_ADD_PATTERN.search(message))
            and not bool(_CHART_REMOVE_PATTERN.search(message))
            and not bool(_CHART_REPLACE_PATTERN.search(message)))

def _extract_document_data(html: str) -> str | None:
    """Extract the window.DOCUMENT_DATA JSON array from visualization HTML."""
    m = re.search(r'window\.DOCUMENT_DATA\s*=\s*(\[[\s\S]*?\]);', html)
    return m.group(1) if m else None

def _inject_chart(base_html: str, chart_html: str) -> str:
    """Append chart component into existing visualization HTML."""
    if '</body>' in base_html:
        return base_html.replace('</body>', f'{chart_html}\n</body>', 1)
    return base_html + '\n' + chart_html


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@view_bp.route('/view/<file_id>')
@requires_auth
def view_file(file_id):
    user = get_current_user()
    file, access = _get_file(file_id, user['id'])
    if not file:
        return "File not found", 404

    chat_history = []
    if file.get('chat_history'):
        try:
            chat_history = json.loads(file['chat_history'])
        except Exception:
            pass

    return render_template('view.html',
        file=file,
        access=access,
        chat_history=chat_history,
        source_files=_get_source_files(file_id),
    )


@view_bp.route('/api/chat/<file_id>', methods=['POST'])
@requires_auth_api
def chat(file_id):
    user = get_current_user()
    file, access = _get_file(file_id, user['id'])
    if not file:
        return jsonify({'error': 'File not found'}), 404
    if access == 'view':
        return jsonify({'error': 'Read-only access'}), 403

    data        = request.get_json() or {}
    message     = data.get('message', '').strip()
    history     = data.get('history', [])
    current_html = data.get('currentHtml', '') or file.get('visualization') or ''

    if not message:
        return jsonify({'error': 'Message required'}), 400

    try:
        from fiat_lux_agents import DocumentBot
        bot = DocumentBot()
        style_refs = _get_style_refs(file_id, user['id'])

        if current_html and not _needs_full_reread(message):
            if current_html and _incorporate_pattern_match(message):
                # Refine the existing visualization, augmented with all source data,
                # so the model can add the new rows while keeping the existing structure.
                source_text = _get_document_text(file, file_id)
                augmented = f"{message}\n\n--- Source data (all files) ---\n{source_text}"
                current_app.logger.info('chat: incorporate path (Sonnet + HTML + source data)')
                result = bot.refine(current_html, augmented, style_refs=style_refs or None)
            else:
                doc_data = _extract_document_data(current_html)
                if doc_data and _is_chart_request(message):
                    current_app.logger.info('chat: fast chart path (Haiku + data JSON)')
                    result = bot.generate_chart_append(doc_data, message)
                    if result.get('html'):
                        result['html'] = _inject_chart(current_html, result['html'])
                else:
                    current_app.logger.info('chat: refine path (Sonnet + full HTML, %d chars)', len(current_html))
                    result = bot.refine(current_html, message, style_refs=style_refs or None)
        else:
            current_app.logger.info('chat: full process path (Sonnet + document text)')
            text = _get_document_text(file, file_id)
            result = bot.process(text, message, style_refs=style_refs or None)

        new_html = result.get('html') or current_html or None
        new_history = history + [
            {'role': 'user',      'content': message},
            {'role': 'assistant', 'content': result.get('message', '')},
        ]

        with db() as conn:
            conn.execute(
                "UPDATE files SET visualization=?, chat_history=?, updated_at=datetime('now')"
                " WHERE id=?",
                (new_html, json.dumps(new_history), file_id)
            )

        return jsonify({
            'message': result.get('message', ''),
            'html':    result.get('html'),
        })

    except Exception as e:
        current_app.logger.error('Chat error', exc_info=True)
        msg = str(e) if current_app.debug else 'Something went wrong generating the visualization. Please try again.'
        return jsonify({'error': msg}), 500


@view_bp.route('/api/export-python/<file_id>', methods=['POST'])
@requires_auth_api
def export_python(file_id):
    user = get_current_user()
    file, access = _get_file(file_id, user['id'])
    if not file:
        return jsonify({'error': 'File not found'}), 404

    data = request.get_json() or {}
    current_html = data.get('currentHtml', '') or file.get('visualization') or ''
    if not current_html:
        return jsonify({'error': 'No visualization to convert'}), 400

    try:
        from fiat_lux_agents import DocumentBot
        bot = DocumentBot()
        result = bot.to_python(current_html)
        return jsonify({'code': result.get('code'), 'message': result.get('message', '')})
    except Exception as e:
        current_app.logger.error('export_python error', exc_info=True)
        return jsonify({'error': str(e)}), 500
