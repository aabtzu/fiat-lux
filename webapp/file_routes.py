"""
File management blueprint.

POST   /api/files          — upload one or more files
GET    /api/files          — list owned + shared files
PATCH  /api/files/<id>     — rename
DELETE /api/files/<id>     — delete
"""

import os
import secrets
import anthropic
from flask import Blueprint, request, jsonify, current_app
from auth import requires_auth_api, get_current_user
from db import db
from extractor import extract_document, get_mime_type

file_bp = Blueprint('files', __name__)


def _gen_id() -> str:
    return secrets.token_hex(16)


def _user_imports_dir(user_id: str) -> str:
    data_dir = current_app.config['DATA_DIR']
    d = os.path.join(data_dir, 'users', user_id, 'imports')
    os.makedirs(d, exist_ok=True)
    return d


def _save_text(user_id: str, text: str) -> str:
    """Write extracted text to a .txt file. Returns the filename (stored in DB)."""
    filename = f'{_gen_id()}.txt'
    with open(os.path.join(_user_imports_dir(user_id), filename), 'w', encoding='utf-8') as f:
        f.write(text)
    return filename


def _save_csv(user_id: str, records: list) -> str:
    """Write table_data records to a .csv file. Returns the filename."""
    import pandas as pd
    filename = f'{_gen_id()}.csv'
    pd.DataFrame(records).to_csv(
        os.path.join(_user_imports_dir(user_id), filename), index=False
    )
    return filename


def _save_bytes(user_id: str, data: bytes, ext: str) -> str:
    """Save raw file bytes. Returns the filename (stored in DB)."""
    filename = f'{_gen_id()}.{ext}'
    with open(os.path.join(_user_imports_dir(user_id), filename), 'wb') as f:
        f.write(data)
    return filename


def _read_text(user_id: str, filename: str) -> str:
    with open(os.path.join(_user_imports_dir(user_id), filename), encoding='utf-8') as f:
        return f.read()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@file_bp.route('/api/files', methods=['GET'])
@requires_auth_api
def list_files():
    user = get_current_user()
    with db() as conn:
        owned = conn.execute(
            "SELECT id, display_name, file_type, original_name, imported_at "
            "FROM files WHERE user_id = ? ORDER BY imported_at DESC",
            (user['id'],)
        ).fetchall()
        shared = conn.execute(
            """SELECT f.id, f.display_name, f.file_type, f.original_name, f.imported_at
               FROM files f
               JOIN file_shares s ON s.file_id = f.id
               WHERE s.shared_with_user_id = ?
                 AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))
               ORDER BY f.imported_at DESC""",
            (user['id'],)
        ).fetchall()
    return jsonify({
        'owned':  [dict(r) for r in owned],
        'shared': [dict(r) for r in shared],
    })


@file_bp.route('/api/files', methods=['POST'])
@requires_auth_api
def upload_files():
    user = get_current_user()
    uploaded      = request.files.getlist('file')
    display_name  = request.form.get('displayName', '').strip()
    document_id   = request.form.get('documentId', '').strip()
    initial_prompt = request.form.get('initialPrompt', '').strip()
    is_style_ref  = request.form.get('isStyleRef', '').lower() in ('1', 'true')

    if not uploaded:
        return jsonify({'error': 'No files provided'}), 400

    try:
        extractions = []
        for f in uploaded:
            file_bytes = f.read()
            mime = f.mimetype or get_mime_type(f.filename)
            result = extract_document(file_bytes, mime, f.filename)
            ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else 'bin'
            td = result.get('table_data')
            extractions.append({
                'text_file':          _save_text(user['id'], result['text']),
                'file_type':          result['file_type'],
                'original_name':      f.filename,
                'mime_type':          mime,
                'original_file_path': _save_bytes(user['id'], file_bytes, ext) if is_style_ref else None,
                'csv_file_path':      _save_csv(user['id'], td) if td else None,
            })

        # Adding files to an existing document
        if document_id:
            with db() as conn:
                added = []
                for e in extractions:
                    sf_id = _gen_id()
                    conn.execute(
                        "INSERT INTO source_files"
                        " (id, file_id, original_name, file_path, mime_type,"
                        "  is_style_ref, original_file_path, csv_file_path)"
                        " VALUES (?,?,?,?,?,?,?,?)",
                        (sf_id, document_id, e['original_name'], e['text_file'], e['mime_type'],
                         1 if is_style_ref else 0, e['original_file_path'], e['csv_file_path']),
                    )
                    added.append({'id': sf_id, 'original_name': e['original_name']})
            return jsonify({'sourceFiles': added})

        # source_files is the canonical list — no combined blob needed
        file_types = list({e['file_type'] for e in extractions})
        main_type  = file_types[0] if len(file_types) == 1 else 'unknown'
        orig_name  = extractions[0]['original_name'] if len(extractions) == 1 else f'{len(extractions)} files'
        final_name = display_name or orig_name.rsplit('.', 1)[0]

        file_id = _gen_id()

        with db() as conn:
            conn.execute(
                "INSERT INTO files"
                " (id, user_id, original_name, display_name, file_type, file_path, original_mime_type, initial_prompt)"
                " VALUES (?,?,?,?,?,?,?,?)",
                (file_id, user['id'], orig_name, final_name, main_type,
                 '', extractions[0]['mime_type'], initial_prompt or None),
            )
            for e in extractions:
                conn.execute(
                    "INSERT INTO source_files"
                    " (id, file_id, original_name, file_path, mime_type, csv_file_path)"
                    " VALUES (?,?,?,?,?,?)",
                    (_gen_id(), file_id, e['original_name'], e['text_file'],
                     e['mime_type'], e['csv_file_path']),
                )

        return jsonify({
            'id':           file_id,
            'display_name': final_name,
            'file_type':    main_type,
            'original_name': orig_name,
        })

    except anthropic.APIStatusError as e:
        current_app.logger.error('Claude API error during upload', exc_info=True)
        return jsonify({'error': 'The AI service returned an error. Please try again.'}), 502
    except anthropic.APIConnectionError:
        current_app.logger.error('Claude API connection error', exc_info=True)
        return jsonify({'error': 'Could not reach the AI service. Check your connection and try again.'}), 502
    except RuntimeError as e:
        if 'ANTHROPIC_API_KEY' in str(e):
            return jsonify({'error': 'Server configuration error: API key not set.'}), 500
        current_app.logger.error('Upload runtime error', exc_info=True)
        return jsonify({'error': 'Something went wrong processing your file. Please try again.'}), 500
    except Exception as e:
        current_app.logger.error('Upload error', exc_info=True)
        return jsonify({'error': 'Could not process the file. Make sure it\'s a supported format (PDF, Word, Excel, CSV, image, or text).'}), 500


@file_bp.route('/api/source-files/<sf_id>', methods=['DELETE'])
@requires_auth_api
def delete_source_file(sf_id):
    user = get_current_user()
    with db() as conn:
        row = conn.execute(
            """SELECT sf.file_path FROM source_files sf
               JOIN files f ON f.id = sf.file_id
               WHERE sf.id = ? AND f.user_id = ?""",
            (sf_id, user['id'])
        ).fetchone()
        if not row:
            return jsonify({'error': 'Not found or access denied'}), 404
        conn.execute("DELETE FROM source_files WHERE id = ?", (sf_id,))

    try:
        os.remove(os.path.join(_user_imports_dir(user['id']), row['file_path']))
    except FileNotFoundError:
        pass
    return jsonify({'success': True})


@file_bp.route('/api/files/<file_id>', methods=['PATCH'])
@requires_auth_api
def rename_file(file_id):
    user = get_current_user()
    data = request.get_json() or {}
    new_name = data.get('displayName', '').strip()
    if not new_name:
        return jsonify({'error': 'displayName required'}), 400

    with db() as conn:
        cur = conn.execute(
            "UPDATE files SET display_name=?, updated_at=datetime('now')"
            " WHERE id=? AND user_id=?",
            (new_name, file_id, user['id']),
        )
    if cur.rowcount == 0:
        return jsonify({'error': 'File not found or access denied'}), 404
    return jsonify({'success': True})


@file_bp.route('/api/files/<file_id>/duplicate', methods=['POST'])
@requires_auth_api
def duplicate_file(file_id):
    """Create a copy of a visualization with no source files — for reuse with new data."""
    user = get_current_user()
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM files WHERE id=? AND user_id=?",
            (file_id, user['id'])
        ).fetchone()
        if not row:
            return jsonify({'error': 'File not found or access denied'}), 404

        file = dict(row)
        new_id   = _gen_id()
        new_name = file['display_name'] + ' (Copy)'

        conn.execute(
            "INSERT INTO files"
            " (id, user_id, original_name, display_name, file_type,"
            "  file_path, original_mime_type, visualization, chat_history, initial_prompt)"
            " VALUES (?,?,?,?,?,?,?,?,NULL,NULL)",
            (new_id, user['id'], file['original_name'], new_name, file['file_type'],
             '', file.get('original_mime_type', ''), file.get('visualization')),
        )

    return jsonify({
        'id':           new_id,
        'display_name': new_name,
        'file_type':    file['file_type'],
        'original_name': file['original_name'],
    })


@file_bp.route('/api/files/<file_id>', methods=['DELETE'])
@requires_auth_api
def delete_file_route(file_id):
    user = get_current_user()
    with db() as conn:
        row = conn.execute(
            "SELECT file_path FROM files WHERE id=? AND user_id=?",
            (file_id, user['id']),
        ).fetchone()
        if not row:
            return jsonify({'error': 'File not found or access denied'}), 404

        src_rows = conn.execute(
            "SELECT file_path FROM source_files WHERE file_id=?",
            (file_id,),
        ).fetchall()

        conn.execute("DELETE FROM source_files WHERE file_id=?", (file_id,))
        conn.execute("DELETE FROM files WHERE id=?", (file_id,))

    # Clean up extracted text files from disk (file_path may be '' for new-model records)
    imports_dir = _user_imports_dir(user['id'])
    paths = [r['file_path'] for r in src_rows]
    if row['file_path']:
        paths.append(row['file_path'])
    for path in paths:
        try:
            os.remove(os.path.join(imports_dir, path))
        except FileNotFoundError:
            pass

    return jsonify({'success': True})
