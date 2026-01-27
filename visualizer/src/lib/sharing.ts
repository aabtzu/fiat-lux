import { getDb } from './db';
import { randomBytes } from 'crypto';

export interface Share {
  id: string;
  fileId: string;
  shareType: 'link' | 'user';
  shareToken: string | null;
  sharedWithUserId: string | null;
  sharedWithEmail?: string;
  canEdit: boolean;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
}

interface DbShare {
  id: string;
  file_id: string;
  share_type: string;
  share_token: string | null;
  shared_with_user_id: string | null;
  can_edit: number;
  created_by: string;
  created_at: string;
  expires_at: string | null;
}

interface DbShareWithEmail extends DbShare {
  shared_with_email?: string;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function generateShareToken(): string {
  return randomBytes(16).toString('hex');
}

function dbShareToShare(row: DbShareWithEmail): Share {
  return {
    id: row.id,
    fileId: row.file_id,
    shareType: row.share_type as 'link' | 'user',
    shareToken: row.share_token,
    sharedWithUserId: row.shared_with_user_id,
    sharedWithEmail: row.shared_with_email,
    canEdit: row.can_edit === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Create a share link for a file
 */
export function createShareLink(
  fileId: string,
  createdBy: string,
  canEdit: boolean = false,
  expiresInDays?: number
): Share {
  const db = getDb();

  // Check if a link share already exists
  const existingStmt = db.prepare(`
    SELECT * FROM file_shares
    WHERE file_id = ? AND share_type = 'link'
  `);
  const existing = existingStmt.get(fileId) as DbShare | null;

  if (existing) {
    return dbShareToShare(existing);
  }

  const id = generateId();
  const token = generateShareToken();
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const stmt = db.prepare(`
    INSERT INTO file_shares (id, file_id, share_type, share_token, can_edit, created_by, expires_at)
    VALUES (?, ?, 'link', ?, ?, ?, ?)
  `);
  stmt.run(id, fileId, token, canEdit ? 1 : 0, createdBy, expiresAt);

  return {
    id,
    fileId,
    shareType: 'link',
    shareToken: token,
    sharedWithUserId: null,
    canEdit,
    createdBy,
    createdAt: new Date().toISOString(),
    expiresAt,
  };
}

/**
 * Share a file with a specific user by email
 */
export function shareWithUser(
  fileId: string,
  createdBy: string,
  userEmail: string,
  canEdit: boolean = false
): Share | null {
  const db = getDb();

  // Find the user by email
  const userStmt = db.prepare('SELECT id FROM users WHERE email = ?');
  const user = userStmt.get(userEmail) as { id: string } | null;

  if (!user) {
    return null; // User not found
  }

  // Check if already shared with this user
  const existingStmt = db.prepare(`
    SELECT * FROM file_shares
    WHERE file_id = ? AND share_type = 'user' AND shared_with_user_id = ?
  `);
  const existing = existingStmt.get(fileId, user.id) as DbShare | null;

  if (existing) {
    // Update existing share
    const updateStmt = db.prepare(`
      UPDATE file_shares SET can_edit = ? WHERE id = ?
    `);
    updateStmt.run(canEdit ? 1 : 0, existing.id);
    return dbShareToShare({ ...existing, can_edit: canEdit ? 1 : 0 });
  }

  const id = generateId();

  const stmt = db.prepare(`
    INSERT INTO file_shares (id, file_id, share_type, shared_with_user_id, can_edit, created_by)
    VALUES (?, ?, 'user', ?, ?, ?)
  `);
  stmt.run(id, fileId, user.id, canEdit ? 1 : 0, createdBy);

  return {
    id,
    fileId,
    shareType: 'user',
    shareToken: null,
    sharedWithUserId: user.id,
    sharedWithEmail: userEmail,
    canEdit,
    createdBy,
    createdAt: new Date().toISOString(),
    expiresAt: null,
  };
}

/**
 * Get all shares for a file
 */
export function getSharesForFile(fileId: string, userId: string): Share[] {
  const db = getDb();

  // Verify ownership
  const ownerStmt = db.prepare('SELECT id FROM files WHERE id = ? AND user_id = ?');
  const owner = ownerStmt.get(fileId, userId);
  if (!owner) {
    return [];
  }

  const stmt = db.prepare(`
    SELECT fs.*, u.email as shared_with_email
    FROM file_shares fs
    LEFT JOIN users u ON fs.shared_with_user_id = u.id
    WHERE fs.file_id = ?
  `);
  const rows = stmt.all(fileId) as DbShareWithEmail[];

  return rows.map(dbShareToShare);
}

/**
 * Revoke a share
 */
export function revokeShare(shareId: string, userId: string): boolean {
  const db = getDb();

  // Get the share and verify ownership of the file
  const shareStmt = db.prepare(`
    SELECT fs.* FROM file_shares fs
    JOIN files f ON fs.file_id = f.id
    WHERE fs.id = ? AND f.user_id = ?
  `);
  const share = shareStmt.get(shareId, userId);

  if (!share) {
    return false;
  }

  const deleteStmt = db.prepare('DELETE FROM file_shares WHERE id = ?');
  const result = deleteStmt.run(shareId);

  return result.changes > 0;
}

/**
 * Validate a share token and return the file ID
 */
export function validateShareToken(token: string): { fileId: string; canEdit: boolean } | null {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT file_id, can_edit, expires_at FROM file_shares
    WHERE share_type = 'link' AND share_token = ?
  `);
  const row = stmt.get(token) as { file_id: string; can_edit: number; expires_at: string | null } | null;

  if (!row) {
    return null;
  }

  // Check expiration
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return null;
  }

  return {
    fileId: row.file_id,
    canEdit: row.can_edit === 1,
  };
}

/**
 * Get share link token for a file (if exists)
 */
export function getShareLinkToken(fileId: string): string | null {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT share_token FROM file_shares
    WHERE file_id = ? AND share_type = 'link'
  `);
  const row = stmt.get(fileId) as { share_token: string } | null;

  return row?.share_token || null;
}

/**
 * Find user by email (for autocomplete)
 */
export function findUsersByEmailPrefix(prefix: string, excludeUserId: string, limit: number = 5): { id: string; email: string; displayName: string | null }[] {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT id, email, display_name FROM users
    WHERE email LIKE ? AND id != ?
    LIMIT ?
  `);
  const rows = stmt.all(`${prefix}%`, excludeUserId, limit) as { id: string; email: string; display_name: string | null }[];

  return rows.map(row => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
  }));
}
