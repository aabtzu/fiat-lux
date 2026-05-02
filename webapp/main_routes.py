"""
Main blueprint — dashboard and file management.

Phase 1: dashboard placeholder.
Phase 2: upload, list, rename, delete, state save/load.
"""

from flask import Blueprint, render_template, redirect, url_for
from auth import requires_auth, get_current_user
from db import db

main_bp = Blueprint('main', __name__)


@main_bp.route('/')
def index():
    if get_current_user():
        return redirect(url_for('main.dashboard'))
    return redirect(url_for('main.about'))


@main_bp.route('/dashboard')
@requires_auth
def dashboard():
    user = get_current_user()
    with db() as conn:
        owned = conn.execute(
            "SELECT id, display_name, file_type, folder, original_name, imported_at"
            " FROM files WHERE user_id = ? ORDER BY imported_at DESC",
            (user['id'],)
        ).fetchall()
        shared = conn.execute(
            """SELECT f.id, f.display_name, f.file_type, f.folder, f.original_name, f.imported_at,
                      u.display_name AS owner_name, u.email AS owner_email
               FROM files f
               JOIN file_shares s ON s.file_id = f.id
               JOIN users u ON u.id = f.user_id
               WHERE s.shared_with_user_id = ?
                 AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))
               ORDER BY f.imported_at DESC""",
            (user['id'],)
        ).fetchall()
    return render_template('dashboard.html', user=user,
                           files=[dict(f) for f in owned],
                           shared_files=[dict(f) for f in shared])


@main_bp.route('/about')
def about():
    return render_template('about.html')
