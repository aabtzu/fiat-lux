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
        files = conn.execute(
            "SELECT id, display_name, file_type, original_name, imported_at"
            " FROM files WHERE user_id = ? ORDER BY imported_at DESC",
            (user['id'],)
        ).fetchall()
    return render_template('dashboard.html', user=user, files=[dict(f) for f in files])


@main_bp.route('/about')
def about():
    return render_template('about.html')
