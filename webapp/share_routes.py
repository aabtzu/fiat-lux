"""
Share blueprint.

GET    /api/shares/<file_id>          — list shares for a file (owner only)
POST   /api/shares/<file_id>          — create link or user share
DELETE /api/shares/revoke/<share_id>  — revoke a share
GET    /api/users/search?q=           — autocomplete users by email

GET    /shared/<token>                — public shared view (no auth required)
"""

import secrets
from flask import Blueprint, request, jsonify, render_template
from auth import requires_auth_api, get_current_user
from db import db

share_bp = Blueprint('shares', __name__)


def _gen_id():
    return secrets.token_hex(16)


def _gen_token():
    return secrets.token_urlsafe(24)


def _get_owned_file(file_id, user_id):
    with db() as conn:
        row = conn.execute(
            "SELECT id FROM files WHERE id=? AND user_id=?",
            (file_id, user_id)
        ).fetchone()
    return row is not None


# ---------------------------------------------------------------------------
# API — shares management
# ---------------------------------------------------------------------------

@share_bp.route('/api/shares/<file_id>', methods=['GET'])
@requires_auth_api
def list_shares(file_id):
    user = get_current_user()
    if not _get_owned_file(file_id, user['id']):
        return jsonify({'error': 'File not found or access denied'}), 404

    with db() as conn:
        rows = conn.execute(
            """SELECT s.id, s.share_type, s.share_token, s.can_edit, s.created_at,
                      u.email  AS shared_with_email,
                      u.display_name AS shared_with_name
               FROM file_shares s
               LEFT JOIN users u ON u.id = s.shared_with_user_id
               WHERE s.file_id = ?
               ORDER BY s.created_at DESC""",
            (file_id,)
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@share_bp.route('/api/shares/<file_id>', methods=['POST'])
@requires_auth_api
def create_share(file_id):
    user = get_current_user()
    if not _get_owned_file(file_id, user['id']):
        return jsonify({'error': 'File not found or access denied'}), 404

    data = request.get_json() or {}
    share_type = data.get('shareType', 'link')
    share_id = _gen_id()

    if share_type == 'link':
        token = _gen_token()
        with db() as conn:
            conn.execute(
                "INSERT INTO file_shares (id, file_id, share_type, share_token, can_edit, created_by)"
                " VALUES (?,?,?,?,0,?)",
                (share_id, file_id, 'link', token, user['id'])
            )
        return jsonify({'id': share_id, 'share_type': 'link', 'share_token': token})

    if share_type == 'user':
        email = data.get('email', '').strip().lower()
        if not email:
            return jsonify({'error': 'email required'}), 400

        with db() as conn:
            target = conn.execute(
                "SELECT id, email, display_name FROM users WHERE LOWER(email)=?",
                (email,)
            ).fetchone()
            if not target:
                return jsonify({'error': 'User not found'}), 404
            if target['id'] == user['id']:
                return jsonify({'error': 'Cannot share with yourself'}), 400
            existing = conn.execute(
                "SELECT id FROM file_shares WHERE file_id=? AND shared_with_user_id=?",
                (file_id, target['id'])
            ).fetchone()
            if existing:
                return jsonify({'error': 'Already shared with this user'}), 409
            conn.execute(
                "INSERT INTO file_shares (id, file_id, share_type, shared_with_user_id, can_edit, created_by)"
                " VALUES (?,?,?,?,0,?)",
                (share_id, file_id, 'user', target['id'], user['id'])
            )
        return jsonify({
            'id': share_id,
            'share_type': 'user',
            'shared_with_email':  target['email'],
            'shared_with_name':   target['display_name'],
        })

    return jsonify({'error': 'Invalid shareType'}), 400


@share_bp.route('/api/shares/revoke/<share_id>', methods=['DELETE'])
@requires_auth_api
def revoke_share(share_id):
    user = get_current_user()
    with db() as conn:
        cur = conn.execute(
            """DELETE FROM file_shares WHERE id=?
               AND file_id IN (SELECT id FROM files WHERE user_id=?)""",
            (share_id, user['id'])
        )
    if cur.rowcount == 0:
        return jsonify({'error': 'Share not found or access denied'}), 404
    return jsonify({'success': True})


# ---------------------------------------------------------------------------
# API — user search (email autocomplete)
# ---------------------------------------------------------------------------

@share_bp.route('/api/users/search')
@requires_auth_api
def search_users():
    user = get_current_user()
    q = request.args.get('q', '').strip().lower()
    if len(q) < 2:
        return jsonify([])
    with db() as conn:
        rows = conn.execute(
            "SELECT id, email, display_name FROM users"
            " WHERE LOWER(email) LIKE ? AND id != ? LIMIT 8",
            (f'{q}%', user['id'])
        ).fetchall()
    return jsonify([dict(r) for r in rows])


# ---------------------------------------------------------------------------
# Public shared view
# ---------------------------------------------------------------------------

@share_bp.route('/shared/<token>')
def shared_view(token):
    with db() as conn:
        row = conn.execute(
            """SELECT f.*
               FROM files f
               JOIN file_shares s ON s.file_id = f.id
               WHERE s.share_token = ?
                 AND s.share_type = 'link'
                 AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))""",
            (token,)
        ).fetchone()
    if not row:
        return "Link not found or expired", 404
    return render_template('shared.html', file=dict(row))
