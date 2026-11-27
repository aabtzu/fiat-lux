"""
Debug blueprint for Fiat Lux.

Only registered when DEBUG_SECRET env var is set.
All routes require the secret as a Bearer token or ?secret= query param.

Mount point: /debug
"""

import os
import json
from flask import Blueprint, request, jsonify
from db import db

debug_bp = Blueprint('debug', __name__, url_prefix='/debug')

_SECRET = os.environ.get('DEBUG_SECRET', '')


def _check_auth() -> bool:
    secret = request.args.get('secret') or ''
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        secret = secret or auth_header[7:]
    return secret == _SECRET


@debug_bp.before_request
def require_secret():
    if not _SECRET:
        return jsonify({'error': 'Debug not enabled'}), 403
    if not _check_auth():
        return jsonify({'error': 'Unauthorized'}), 401


@debug_bp.route('/files')
def list_files():
    with db() as conn:
        rows = conn.execute(
            "SELECT id, display_name, original_name, file_type, folder, updated_at"
            " FROM files ORDER BY updated_at DESC"
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@debug_bp.route('/viz/<file_id>')
def get_viz(file_id: str):
    with db() as conn:
        row = conn.execute(
            "SELECT id, display_name, visualization, updated_at FROM files WHERE id = ?",
            (file_id,),
        ).fetchone()
    if not row:
        return jsonify({'error': 'Not found'}), 404
    return jsonify({
        'id': row['id'],
        'display_name': row['display_name'],
        'updated_at': row['updated_at'],
        'visualization': row['visualization'],
    })


@debug_bp.route('/chat/<file_id>')
def get_chat(file_id: str):
    with db() as conn:
        row = conn.execute(
            "SELECT id, display_name, chat_history, updated_at FROM files WHERE id = ?",
            (file_id,),
        ).fetchone()
    if not row:
        return jsonify({'error': 'Not found'}), 404
    history = json.loads(row['chat_history'] or '[]')
    return jsonify({
        'id': row['id'],
        'display_name': row['display_name'],
        'updated_at': row['updated_at'],
        'chat_history': history,
    })


@debug_bp.route('/set-viz/<file_id>', methods=['POST'])
def set_viz(file_id: str):
    """Replace a file's visualization HTML. Body: {"visualization": "<html>..."}"""
    data = request.get_json(force=True)
    if 'visualization' not in data:
        return jsonify({'error': 'Missing visualization field'}), 400
    with db() as conn:
        result = conn.execute(
            "UPDATE files SET visualization = ?, updated_at = datetime('now') WHERE id = ?",
            (data['visualization'], file_id),
        )
        if result.rowcount == 0:
            return jsonify({'error': 'Not found'}), 404
    return jsonify({'ok': True, 'id': file_id})
