"""
Authentication for Fiat Lux Flask app.

Email/password auth with bcrypt hashing and DB-backed sessions.
Sessions are stored in the `sessions` table; the session ID is kept in
a signed Flask cookie.

Public API:
    register(email, password, display_name)  → user dict or raises ValueError
    login(email, password)                   → user dict or raises ValueError
    logout()                                 → clears session cookie
    get_current_user()                       → user dict or None
    requires_auth                            → decorator (redirects to /login)
    requires_auth_api                        → decorator (returns 401 JSON)
"""

import os
import secrets
import bcrypt
from datetime import datetime, timedelta, timezone
from functools import wraps
from flask import session, redirect, url_for, jsonify, request
from db import db


SESSION_COOKIE = 'fl_session'
SESSION_DAYS   = 7
_ID_BYTES      = 16


def _gen_id() -> str:
    return secrets.token_hex(_ID_BYTES)


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def _check_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


# ---------------------------------------------------------------------------
# User operations
# ---------------------------------------------------------------------------

def get_user_by_email(email: str) -> dict | None:
    with db() as conn:
        row = conn.execute(
            "SELECT id, email, password_hash, display_name, created_at "
            "FROM users WHERE email = ?", (email.lower().strip(),)
        ).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: str) -> dict | None:
    with db() as conn:
        row = conn.execute(
            "SELECT id, email, display_name, created_at "
            "FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    return dict(row) if row else None


def register(email: str, password: str, display_name: str = None) -> dict:
    """
    Create a new user. Raises ValueError for invalid input or duplicate email.
    Returns the new user dict (no password_hash).
    """
    email = email.lower().strip()

    if not email or '@' not in email:
        raise ValueError("Invalid email address")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    if get_user_by_email(email):
        raise ValueError("An account with that email already exists")

    user_id    = _gen_id()
    pw_hash    = _hash_password(password)
    disp_name  = (display_name or '').strip() or email.split('@')[0]

    with db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)",
            (user_id, email, pw_hash, disp_name),
        )

    return {'id': user_id, 'email': email, 'display_name': disp_name}


def login(email: str, password: str) -> dict:
    """
    Verify credentials and create a session. Raises ValueError on failure.
    Returns the user dict (no password_hash) — call set_session() after.
    """
    user = get_user_by_email(email)
    if not user or not _check_password(password, user['password_hash']):
        raise ValueError("Invalid email or password")

    session_id = _gen_id()
    expires_at = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat()

    with db() as conn:
        conn.execute(
            "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
            (session_id, user['id'], expires_at),
        )

    del user['password_hash']
    return user, session_id


def logout_session(session_id: str):
    """Delete session from DB."""
    with db() as conn:
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))


def _validate_session(session_id: str) -> dict | None:
    """Return user dict if session is valid and not expired, else None."""
    with db() as conn:
        row = conn.execute(
            "SELECT s.user_id, s.expires_at, u.id, u.email, u.display_name "
            "FROM sessions s JOIN users u ON s.user_id = u.id "
            "WHERE s.id = ?", (session_id,)
        ).fetchone()

    if not row:
        return None

    expires_at = datetime.fromisoformat(row['expires_at'])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        return None

    return {'id': row['id'], 'email': row['email'], 'display_name': row['display_name']}


# ---------------------------------------------------------------------------
# Request helpers
# ---------------------------------------------------------------------------

_DEV_USER = {'id': '1769470813561-9fgy4v2', 'email': 'aabtzu@gmail.com', 'display_name': 'amit'}


def get_current_user() -> dict | None:
    """Return the authenticated user for this request, or None."""
    if _LOCAL_DEV:
        return _DEV_USER
    session_id = session.get(SESSION_COOKIE)
    if not session_id:
        return None
    return _validate_session(session_id)


def set_session(session_id: str):
    """Store session ID in Flask signed cookie."""
    session[SESSION_COOKIE] = session_id
    session.permanent = True


def clear_session():
    """Remove session from cookie."""
    session.pop(SESSION_COOKIE, None)


# ---------------------------------------------------------------------------
# Decorators
# ---------------------------------------------------------------------------

_LOCAL_DEV = os.getenv('LOCAL_DEV', '').lower() in ('1', 'true', 'yes')


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
