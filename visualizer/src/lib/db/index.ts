import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

function getDbPath(): string {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), '..', 'data');
  return path.join(dataDir, 'fiat-lux.db');
}

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  const dataDir = path.dirname(dbPath);

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations on first connection
  runMigrations(db);

  return db;
}

function runMigrations(database: Database.Database): void {
  const schemaPath = path.join(__dirname, 'schema.sql');

  // In production, schema.sql might not be at __dirname, so we embed it
  const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Files table
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('schedule', 'invoice', 'healthcare', 'unknown')),
  file_path TEXT NOT NULL,
  original_mime_type TEXT,
  visualization TEXT,
  chat_history TEXT,
  initial_prompt TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_type ON files(file_type);

-- Source files table
CREATE TABLE IF NOT EXISTS source_files (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_source_files_file_id ON source_files(file_id);

-- File shares table
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
`;

  database.exec(schema);
}

// Check if any users exist (for initial setup)
export function hasUsers(): boolean {
  const db = getDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  return result.count > 0;
}

// Check if migration from old storage.json is needed
export function needsMigration(): boolean {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), '..', 'data');
  const storageJsonPath = path.join(dataDir, 'storage.json');
  return fs.existsSync(storageJsonPath) && !hasUsers();
}
