"""
File management blueprint.

POST   /api/files          — upload one or more files
GET    /api/files          — list owned + shared files
PATCH  /api/files/<id>     — rename
DELETE /api/files/<id>     — delete
"""

import os
import secrets
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

    if not uploaded:
        return jsonify({'error': 'No files provided'}), 400

    try:
        extractions = []
        for f in uploaded:
            file_bytes = f.read()
            mime = f.mimetype or get_mime_type(f.filename)
            result = extract_document(file_bytes, mime, f.filename)
            extractions.append({
                'text_file':    _save_text(user['id'], result['text']),
                'file_type':    result['file_type'],
                'original_name': f.filename,
                'mime_type':    mime,
            })

        # Adding files to an existing document
        if document_id:
            with db() as conn:
                added = []
                for e in extractions:
                    sf_id = _gen_id()
                    conn.execute(
                        "INSERT INTO source_files (id, file_id, original_name, file_path, mime_type)"
                        " VALUES (?,?,?,?,?)",
                        (sf_id, document_id, e['original_name'], e['text_file'], e['mime_type']),
                    )
                    added.append({'id': sf_id, 'original_name': e['original_name']})
            return jsonify({'sourceFiles': added})

        # New document — combine all extracted texts
        if len(extractions) > 1:
            parts = [
                f"=== File {i+1}: {e['original_name']} ===\n{_read_text(user['id'], e['text_file'])}"
                for i, e in enumerate(extractions)
            ]
            combined = '\n\n'.join(parts)
        else:
            combined = _read_text(user['id'], extractions[0]['text_file'])

        file_types = list({e['file_type'] for e in extractions})
        main_type  = file_types[0] if len(file_types) == 1 else 'unknown'
        orig_name  = extractions[0]['original_name'] if len(extractions) == 1 else f'{len(extractions)} files'
        final_name = display_name or orig_name.rsplit('.', 1)[0]

        combined_file = _save_text(user['id'], combined)
        file_id = _gen_id()

        with db() as conn:
            conn.execute(
                "INSERT INTO files"
                " (id, user_id, original_name, display_name, file_type, file_path, original_mime_type, initial_prompt)"
                " VALUES (?,?,?,?,?,?,?,?)",
                (file_id, user['id'], orig_name, final_name, main_type,
                 combined_file, extractions[0]['mime_type'], initial_prompt or None),
            )
            for e in extractions:
                conn.execute(
                    "INSERT INTO source_files (id, file_id, original_name, file_path, mime_type)"
                    " VALUES (?,?,?,?,?)",
                    (_gen_id(), file_id, e['original_name'], e['text_file'], e['mime_type']),
                )

        return jsonify({
            'id':           file_id,
            'display_name': final_name,
            'file_type':    main_type,
            'original_name': orig_name,
        })

    except Exception as e:
        current_app.logger.error('Upload error', exc_info=True)
        return jsonify({'error': str(e)}), 500


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


@file_bp.route('/api/files/<file_id>', methods=['DELETE'])
@requires_auth_api
def delete_file_route(file_id):
    user = get_current_user()
    with db() as conn:
        cur = conn.execute(
            "DELETE FROM files WHERE id=? AND user_id=?",
            (file_id, user['id']),
        )
    if cur.rowcount == 0:
        return jsonify({'error': 'File not found or access denied'}), 404
    return jsonify({'success': True})
