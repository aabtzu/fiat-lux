"""
Auth blueprint — /login, /register, /logout, /api/auth/me
"""

from flask import Blueprint, render_template, request, redirect, url_for, jsonify, flash
from auth import (
    register, login, logout_session, get_current_user,
    set_session, clear_session, SESSION_COOKIE
)
from flask import session

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login', methods=['GET', 'POST'])
def login_page():
    if get_current_user():
        return redirect(url_for('main.dashboard'))

    if request.method == 'POST':
        email    = request.form.get('email', '').strip()
        password = request.form.get('password', '')
        try:
            user, session_id = login(email, password)
            set_session(session_id)
            next_url = request.args.get('next') or url_for('main.dashboard')
            return redirect(next_url)
        except ValueError as e:
            flash(str(e), 'error')

    return render_template('login.html')


@auth_bp.route('/register', methods=['GET', 'POST'])
def register_page():
    if get_current_user():
        return redirect(url_for('main.dashboard'))

    if request.method == 'POST':
        email        = request.form.get('email', '').strip()
        password     = request.form.get('password', '')
        display_name = request.form.get('display_name', '').strip()
        try:
            user       = register(email, password, display_name)
            _, session_id = login(email, password)
            set_session(session_id)
            return redirect(url_for('main.dashboard'))
        except ValueError as e:
            flash(str(e), 'error')

    return render_template('register.html')


@auth_bp.route('/logout')
def logout():
    session_id = session.get(SESSION_COOKIE)
    if session_id:
        logout_session(session_id)
    clear_session()
    return redirect(url_for('auth.login_page'))


@auth_bp.route('/api/auth/me')
def me():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    return jsonify(user)
