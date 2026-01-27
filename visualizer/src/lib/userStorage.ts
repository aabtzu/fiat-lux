import { promises as fs } from 'fs';
import path from 'path';
import { getDb } from './db';

export type FileType = 'schedule' | 'invoice' | 'healthcare' | 'unknown';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SourceFile {
  id: string;
  originalName: string;
  filePath: string;
  mimeType?: string;
  addedAt: string;
}

export interface ImportedFile {
  id: string;
  userId: string;
  originalName: string;
  displayName: string;
  fileType: FileType;
  importedAt: string;
  filePath: string;
  originalMimeType?: string;
  visualization?: string;
  chatHistory?: ChatMessage[];
  sourceFiles?: SourceFile[];
  initialPrompt?: string;
}

export type AccessLevel = 'owner' | 'edit' | 'view' | 'none';

interface DbFile {
  id: string;
  user_id: string;
  original_name: string;
  display_name: string;
  file_type: string;
  file_path: string;
  original_mime_type: string | null;
  visualization: string | null;
  chat_history: string | null;
  initial_prompt: string | null;
  imported_at: string;
  updated_at: string;
}

interface DbSourceFile {
  id: string;
  file_id: string;
  original_name: string;
  file_path: string;
  mime_type: string | null;
  added_at: string;
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

function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), '..', 'data');
}

function getUserImportsDir(userId: string): string {
  return path.join(getDataDir(), 'users', userId, 'imports');
}

async function ensureUserDir(userId: string): Promise<void> {
  const dir = getUserImportsDir(userId);
  await fs.mkdir(dir, { recursive: true });
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function dbFileToImportedFile(row: DbFile, sourceFiles: SourceFile[] = []): ImportedFile {
  return {
    id: row.id,
    userId: row.user_id,
    originalName: row.original_name,
    displayName: row.display_name,
    fileType: row.file_type as FileType,
    importedAt: row.imported_at,
    filePath: row.file_path,
    originalMimeType: row.original_mime_type || undefined,
    visualization: row.visualization || undefined,
    chatHistory: row.chat_history ? JSON.parse(row.chat_history) : undefined,
    initialPrompt: row.initial_prompt || undefined,
    sourceFiles,
  };
}

function getSourceFilesForFile(fileId: string): SourceFile[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM source_files WHERE file_id = ? ORDER BY added_at');
  const rows = stmt.all(fileId) as DbSourceFile[];

  return rows.map((row) => ({
    id: row.id,
    originalName: row.original_name,
    filePath: row.file_path,
    mimeType: row.mime_type || undefined,
    addedAt: row.added_at,
  }));
}

export function detectFileType(content: string, filename: string): FileType {
  const lowerContent = content.toLowerCase();
  const lowerName = filename.toLowerCase();

  if (
    /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*[,:\s]/.test(lowerContent) &&
    /\d{1,2}:\d{2}\s*(am|pm)/i.test(content)
  ) {
    return 'schedule';
  }

  if (
    lowerName.includes('invoice') ||
    /\b(invoice|bill\s*to|amount\s*due|total|subtotal)\b/.test(lowerContent)
  ) {
    return 'invoice';
  }

  if (
    lowerName.includes('health') ||
    lowerName.includes('medical') ||
    lowerName.includes('eob') ||
    /\b(patient|diagnosis|procedure|copay|deductible|claim)\b/.test(lowerContent)
  ) {
    return 'healthcare';
  }

  return 'unknown';
}

// Get files for a specific user
export function getFilesForUser(userId: string): ImportedFile[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM files WHERE user_id = ? ORDER BY imported_at DESC');
  const rows = stmt.all(userId) as DbFile[];

  return rows.map((row) => {
    const sourceFiles = getSourceFilesForFile(row.id);
    return dbFileToImportedFile(row, sourceFiles);
  });
}

// Get files shared with a user
export function getFilesSharedWithUser(userId: string): ImportedFile[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT f.*, fs.can_edit
    FROM files f
    JOIN file_shares fs ON f.id = fs.file_id
    WHERE fs.share_type = 'user' AND fs.shared_with_user_id = ?
    ORDER BY f.imported_at DESC
  `);
  const rows = stmt.all(userId) as (DbFile & { can_edit: number })[];

  return rows.map((row) => {
    const sourceFiles = getSourceFilesForFile(row.id);
    return dbFileToImportedFile(row, sourceFiles);
  });
}

// Get a specific file with ownership check
export function getFileForUser(fileId: string, userId: string): ImportedFile | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?');
  const row = stmt.get(fileId, userId) as DbFile | null;

  if (!row) return null;

  const sourceFiles = getSourceFilesForFile(row.id);
  return dbFileToImportedFile(row, sourceFiles);
}

// Get file by ID (no ownership check - for internal use)
export function getFileById(fileId: string): ImportedFile | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM files WHERE id = ?');
  const row = stmt.get(fileId) as DbFile | null;

  if (!row) return null;

  const sourceFiles = getSourceFilesForFile(row.id);
  return dbFileToImportedFile(row, sourceFiles);
}

// Check user's access level to a file
export function getUserAccessLevel(userId: string, fileId: string): AccessLevel {
  const db = getDb();

  // Check if owner
  const ownerStmt = db.prepare('SELECT id FROM files WHERE id = ? AND user_id = ?');
  const ownerRow = ownerStmt.get(fileId, userId);
  if (ownerRow) return 'owner';

  // Check if shared with user
  const shareStmt = db.prepare(`
    SELECT can_edit FROM file_shares
    WHERE file_id = ? AND share_type = 'user' AND shared_with_user_id = ?
  `);
  const shareRow = shareStmt.get(fileId, userId) as { can_edit: number } | null;

  if (shareRow) {
    return shareRow.can_edit ? 'edit' : 'view';
  }

  return 'none';
}

// Add a new file for a user
export async function addFileForUser(
  userId: string,
  content: string,
  originalName: string,
  displayName?: string,
  fileType?: FileType,
  originalMimeType?: string,
  initialPrompt?: string
): Promise<ImportedFile> {
  await ensureUserDir(userId);

  const id = generateId();
  const detectedType = fileType || detectFileType(content, originalName);
  const fileName = `${id}.txt`;
  const filePath = path.join(getUserImportsDir(userId), fileName);

  // Write content to file
  await fs.writeFile(filePath, content);

  // Insert into database
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO files (id, user_id, original_name, display_name, file_type, file_path, original_mime_type, initial_prompt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    userId,
    originalName,
    displayName || originalName.replace(/\.[^/.]+$/, ''),
    detectedType,
    fileName,
    originalMimeType || null,
    initialPrompt || null
  );

  return {
    id,
    userId,
    originalName,
    displayName: displayName || originalName.replace(/\.[^/.]+$/, ''),
    fileType: detectedType,
    importedAt: new Date().toISOString(),
    filePath: fileName,
    originalMimeType,
    initialPrompt,
    sourceFiles: [],
  };
}

// Add a source file to an existing document
export async function addSourceFileForUser(
  userId: string,
  documentId: string,
  content: string,
  originalName: string,
  mimeType?: string
): Promise<SourceFile | null> {
  // Verify ownership
  const file = getFileForUser(documentId, userId);
  if (!file) return null;

  await ensureUserDir(userId);

  const id = generateId();
  const fileName = `${id}.txt`;
  const filePath = path.join(getUserImportsDir(userId), fileName);

  await fs.writeFile(filePath, content);

  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO source_files (id, file_id, original_name, file_path, mime_type)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, documentId, originalName, fileName, mimeType || null);

  return {
    id,
    originalName,
    filePath: fileName,
    mimeType,
    addedAt: new Date().toISOString(),
  };
}

// Get file content
export async function getFileContent(userId: string, filePath: string): Promise<string> {
  const fullPath = path.join(getUserImportsDir(userId), filePath);
  return fs.readFile(fullPath, 'utf-8');
}

// Update file state (visualization and chat history)
export async function updateFileState(
  fileId: string,
  userId: string,
  visualization: string,
  chatHistory: ChatMessage[]
): Promise<boolean> {
  // Check access - need at least edit permission
  const accessLevel = getUserAccessLevel(userId, fileId);
  if (accessLevel === 'none' || accessLevel === 'view') {
    return false;
  }

  const db = getDb();
  const stmt = db.prepare(`
    UPDATE files
    SET visualization = ?, chat_history = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  const result = stmt.run(visualization, JSON.stringify(chatHistory), fileId);

  return result.changes > 0;
}

// Update file display name
export function updateFileName(fileId: string, userId: string, displayName: string): boolean {
  // Only owner can rename
  const accessLevel = getUserAccessLevel(userId, fileId);
  if (accessLevel !== 'owner') {
    return false;
  }

  const db = getDb();
  const stmt = db.prepare(`
    UPDATE files
    SET display_name = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `);
  const result = stmt.run(displayName, fileId, userId);

  return result.changes > 0;
}

// Delete a file
export async function deleteFile(fileId: string, userId: string): Promise<boolean> {
  // Only owner can delete
  const file = getFileForUser(fileId, userId);
  if (!file) return false;

  const db = getDb();

  // Get source files to delete
  const sourceFiles = getSourceFilesForFile(fileId);

  // Delete file content
  try {
    const filePath = path.join(getUserImportsDir(userId), file.filePath);
    await fs.unlink(filePath);
  } catch {
    // File might not exist
  }

  // Delete source file contents
  for (const sf of sourceFiles) {
    try {
      const sfPath = path.join(getUserImportsDir(userId), sf.filePath);
      await fs.unlink(sfPath);
    } catch {
      // File might not exist
    }
  }

  // Delete from database (cascades to source_files and file_shares)
  const stmt = db.prepare('DELETE FROM files WHERE id = ? AND user_id = ?');
  const result = stmt.run(fileId, userId);

  return result.changes > 0;
}

// Delete a source file
export async function deleteSourceFile(
  documentId: string,
  sourceFileId: string,
  userId: string
): Promise<boolean> {
  // Only owner can delete source files
  const file = getFileForUser(documentId, userId);
  if (!file) return false;

  const db = getDb();

  // Get source file info
  const sfStmt = db.prepare('SELECT * FROM source_files WHERE id = ? AND file_id = ?');
  const sf = sfStmt.get(sourceFileId, documentId) as DbSourceFile | null;
  if (!sf) return false;

  // Delete file content
  try {
    const filePath = path.join(getUserImportsDir(userId), sf.file_path);
    await fs.unlink(filePath);
  } catch {
    // File might not exist
  }

  // Delete from database
  const delStmt = db.prepare('DELETE FROM source_files WHERE id = ?');
  const result = delStmt.run(sourceFileId);

  return result.changes > 0;
}

// Get template visualization from same file type
export function getTemplateVisualization(
  userId: string,
  fileType: FileType,
  excludeId?: string
): { displayName: string; visualization: string } | null {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT display_name, visualization FROM files
    WHERE user_id = ? AND file_type = ? AND visualization IS NOT NULL
    ${excludeId ? 'AND id != ?' : ''}
    LIMIT 1
  `);

  const params = excludeId ? [userId, fileType, excludeId] : [userId, fileType];
  const row = stmt.get(...params) as { display_name: string; visualization: string } | null;

  if (!row) return null;

  return {
    displayName: row.display_name,
    visualization: row.visualization,
  };
}
