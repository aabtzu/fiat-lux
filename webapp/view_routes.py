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
    with db() as conn:
        rows = conn.execute(
            "SELECT id, original_name, mime_type FROM source_files"
            " WHERE file_id = ? ORDER BY added_at",
            (file_id,)
        ).fetchall()
    return [dict(r) for r in rows]


_REREAD_PATTERN = re.compile(
    r'\b(re-?read|original (data|document)|all (data|items)|missing data|'
    r'from the source|don\'t see|where is|repopulate|reload|start over|'
    r'regenerate|raw data|the file)\b',
    re.IGNORECASE,
)

_CHART_PATTERN = re.compile(
    r'\b(bar chart|line chart|pie chart|chart|graph|plot|histogram|'
    r'by month|by week|by day|by year|over time|trend)\b',
    re.IGNORECASE,
)

_CHART_REMOVE_PATTERN = re.compile(
    r'\b(delete|remove|hide|get rid of|take out|drop|clear)\b',
    re.IGNORECASE,
)

def _needs_full_reread(message: str) -> bool:
    return bool(_REREAD_PATTERN.search(message))

def _is_chart_request(message: str) -> bool:
    """True only for ADD-a-chart requests, not remove/delete."""
    return bool(_CHART_PATTERN.search(message)) and not bool(_CHART_REMOVE_PATTERN.search(message))

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

        if current_html and not _needs_full_reread(message):
            doc_data = _extract_document_data(current_html)
            if doc_data and _is_chart_request(message):
                current_app.logger.info('chat: fast chart path (Haiku + data JSON)')
                result = bot.generate_chart_append(doc_data, message)
                if result.get('html'):
                    result['html'] = _inject_chart(current_html, result['html'])
            else:
                current_app.logger.info('chat: refine path (Sonnet + full HTML, %d chars)', len(current_html))
                result = bot.refine(current_html, message)
        else:
            current_app.logger.info('chat: full process path (Sonnet + document text)')
            text = _read_text(file['user_id'], file['file_path'])
            result = bot.process(text, message)

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
        return jsonify({'error': str(e)}), 500
