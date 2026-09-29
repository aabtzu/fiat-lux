"""
Authentication for Fiat Lux Flask app.

Email/password auth. Session data (user id, email, display_name) is stored
in Flask's signed cookie — no sessions table.

Uses fiat_lux_agents.auth.AuthDB for password hashing and credential
verification. User creation uses direct SQL because fiat-lux generates
text primary keys (AuthDB assumes integer auto-increment ids).

Public API:
    register(email, password, display_name)  → user dict or raises ValueError
    login(email, password)                   → user dict or raises ValueError
    get_current_user()                       → user dict or None
    set_session(user)                        → stores user in Flask session
    clear_session()                          → removes user from Flask session
    requires_auth                            → decorator (redirects to /login)
    requires_auth_api                        → decorator (returns 401 JSON)
"""

import os
import secrets
from functools import wraps
from flask import session, redirect, url_for, jsonify, request
from fiat_lux_agents.auth.db import AuthDB
from db import db

_SESSION_KEY = 'fl_user'

_auth_db = AuthDB(db, use_postgres=False, login_field="email", has_display_name=True)


def _gen_id() -> str:
    return secrets.token_hex(16)


# ---------------------------------------------------------------------------
# User operations
# ---------------------------------------------------------------------------

def get_user_by_id(user_id: str) -> dict | None:
    with db() as conn:
        row = conn.execute(
            "SELECT id, email, display_name, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return dict(row) if row else None


def register(email: str, password: str, display_name: str = None) -> dict:
    """Create a new user. Raises ValueError for invalid input or duplicate email."""
    email = email.lower().strip()

    if not email or '@' not in email:
        raise ValueError("Invalid email address")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    if _auth_db.email_exists(email):
        raise ValueError("An account with that email already exists")

    from fiat_lux_agents.auth.db import hash_password
    user_id   = _gen_id()
    pw_hash   = hash_password(password)
    disp_name = (display_name or '').strip() or email.split('@')[0]

    with db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)",
            (user_id, email, pw_hash, disp_name),
        )

    return {'id': user_id, 'email': email, 'display_name': disp_name}


def login(email: str, password: str) -> dict:
    """Verify credentials. Raises ValueError on failure. Returns user dict."""
    user = _auth_db.authenticate(email, password)
    if not user:
        raise ValueError("Invalid email or password")
    return user


# ---------------------------------------------------------------------------
# Session helpers
# ---------------------------------------------------------------------------

_DEV_USER = {'id': '1769470813561-9fgy4v2', 'email': 'aabtzu@gmail.com', 'display_name': 'amit'}
_LOCAL_DEV = os.getenv('LOCAL_DEV', '').lower() in ('1', 'true', 'yes')


def get_current_user() -> dict | None:
    """Return the authenticated user for this request, or None."""
    if _LOCAL_DEV:
        return _DEV_USER
    return session.get(_SESSION_KEY)


def set_session(user: dict):
    """Store user dict in Flask signed cookie."""
    session[_SESSION_KEY] = {
        'id': user['id'],
        'email': user['email'],
        'display_name': user.get('display_name'),
    }
    session.permanent = True


def clear_session():
    """Remove user from session."""
    session.pop(_SESSION_KEY, None)


# ---------------------------------------------------------------------------
# Decorators
# ---------------------------------------------------------------------------

def requires_auth(f):
    """Redirect unauthenticated users to /login (for HTML routes)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not _LOCAL_DEV and not get_current_user():
            return redirect(url_for('auth.login_page', next=request.path))
        return f(*args, **kwargs)
    return decorated


def requires_auth_api(f):
    """Return 401 JSON for unauthenticated API requests."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not _LOCAL_DEV and not get_current_user():
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated
