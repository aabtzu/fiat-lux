"""
SQLite database connection and schema initialisation for Fiat Lux.

Schema is identical to the existing fiat-lux.db used by the Next.js app,
so the same data file can be used during migration.
"""

import os
import sqlite3
from contextlib import contextmanager

_DB_PATH: str = None


def init_db_path(data_dir: str) -> str:
    global _DB_PATH
    _DB_PATH = os.path.join(data_dir, 'fiat-lux.db')
    return _DB_PATH


def get_db_path() -> str:
    if not _DB_PATH:
        raise RuntimeError("DB path not initialised — call init_db_path() first")
    return _DB_PATH


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db():
    """Context manager that yields a connection and commits on exit."""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'unknown',
  file_path TEXT NOT NULL,
  original_mime_type TEXT,
  visualization TEXT,
  chat_history TEXT,
  instructions TEXT,
  initial_prompt TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_type ON files(file_type);

CREATE TABLE IF NOT EXISTS source_files (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_style_ref INTEGER NOT NULL DEFAULT 0,
  original_file_path TEXT,
  csv_file_path TEXT
);
CREATE INDEX IF NOT EXISTS idx_source_files_file_id ON source_files(file_id);

CREATE TABLE IF NOT EXISTS file_shares (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  share_type TEXT NOT NULL CHECK(share_type IN ('link', 'user')),
  share_token TEXT UNIQUE,
  shared_with_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  can_edit INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_shares_file_id ON file_shares(file_id);
CREATE INDEX IF NOT EXISTS idx_shares_token ON file_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_shares_user ON file_shares(shared_with_user_id);
"""


def initialise_schema():
    """Create tables if they don't exist. Safe to call on every startup."""
    with db() as conn:
        conn.executescript(SCHEMA)
        # Migrations for existing DBs
        existing = {r[1] for r in conn.execute("PRAGMA table_info(source_files)")}
        if 'is_style_ref' not in existing:
            conn.execute("ALTER TABLE source_files ADD COLUMN is_style_ref INTEGER NOT NULL DEFAULT 0")
        if 'original_file_path' not in existing:
            conn.execute("ALTER TABLE source_files ADD COLUMN original_file_path TEXT")
        if 'csv_file_path' not in existing:
            conn.execute("ALTER TABLE source_files ADD COLUMN csv_file_path TEXT")
        if 'document_model' not in existing:
            conn.execute("ALTER TABLE source_files ADD COLUMN document_model TEXT")
        if 'role' not in existing:
            conn.execute("ALTER TABLE source_files ADD COLUMN role TEXT DEFAULT 'data'")

        files_cols = {r[1] for r in conn.execute("PRAGMA table_info(files)")}
        if 'instructions' not in files_cols:
            conn.execute("ALTER TABLE files ADD COLUMN instructions TEXT")
    print(f"[db] Schema ready — {get_db_path()}")
