import { promises as fs } from 'fs';
import path from 'path';

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
  originalName: string;
  displayName: string;
  fileType: FileType;
  importedAt: string;
  filePath: string;
  originalMimeType?: string;
  structured?: Record<string, unknown>;
  visualization?: string;
  chatHistory?: ChatMessage[];
  sourceFiles?: SourceFile[];
}

export interface StorageData {
  files: ImportedFile[];
}

const DATA_DIR = path.join(process.cwd(), '..', 'data');
const IMPORTS_DIR = path.join(DATA_DIR, 'imports');
const STORAGE_FILE = path.join(DATA_DIR, 'storage.json');

export async function ensureDirectories(): Promise<void> {
  await fs.mkdir(IMPORTS_DIR, { recursive: true });
}

export async function getStorage(): Promise<StorageData> {
  try {
    const data = await fs.readFile(STORAGE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { files: [] };
  }
}

export async function saveStorage(data: StorageData): Promise<void> {
  await fs.writeFile(STORAGE_FILE, JSON.stringify(data, null, 2));
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function detectFileType(content: string, filename: string): FileType {
  const lowerContent = content.toLowerCase();
  const lowerName = filename.toLowerCase();

  // Schedule detection: look for day/time patterns
  if (
    /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*[,:\s]/.test(lowerContent) &&
    /\d{1,2}:\d{2}\s*(am|pm)/i.test(content)
  ) {
    return 'schedule';
  }

  // Invoice detection
  if (
    lowerName.includes('invoice') ||
    /\b(invoice|bill\s*to|amount\s*due|total|subtotal)\b/.test(lowerContent)
  ) {
    return 'invoice';
  }

  // Healthcare detection
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

export async function addFile(
  content: string,
  originalName: string,
  displayName?: string
): Promise<ImportedFile> {
  await ensureDirectories();

  const id = generateId();
  const fileType = detectFileType(content, originalName);
  const fileName = `${id}.txt`;
  const filePath = path.join(IMPORTS_DIR, fileName);

  await fs.writeFile(filePath, content);

  const importedFile: ImportedFile = {
    id,
    originalName,
    displayName: displayName || originalName.replace(/\.[^/.]+$/, ''),
    fileType,
    importedAt: new Date().toISOString(),
    filePath: fileName,
  };

  const storage = await getStorage();
  storage.files.unshift(importedFile);
  await saveStorage(storage);

  return importedFile;
}

export async function addExtractedFile(
  extractedText: string,
  originalName: string,
  fileType: FileType,
  displayName?: string,
  originalMimeType?: string,
  structured?: Record<string, unknown>
): Promise<ImportedFile> {
  await ensureDirectories();

  const id = generateId();
  const fileName = `${id}.txt`;
  const filePath = path.join(IMPORTS_DIR, fileName);

  await fs.writeFile(filePath, extractedText);

  const importedFile: ImportedFile = {
    id,
    originalName,
    displayName: displayName || originalName.replace(/\.[^/.]+$/, ''),
    fileType,
    importedAt: new Date().toISOString(),
    filePath: fileName,
    originalMimeType,
    structured,
  };

  const storage = await getStorage();
  storage.files.unshift(importedFile);
  await saveStorage(storage);

  return importedFile;
}

export async function getFile(id: string): Promise<ImportedFile | null> {
  const storage = await getStorage();
  return storage.files.find((f) => f.id === id) || null;
}

export async function getFileContent(file: ImportedFile): Promise<string> {
  const filePath = path.join(IMPORTS_DIR, file.filePath);
  return fs.readFile(filePath, 'utf-8');
}

export async function updateFileState(
  id: string,
  visualization: string,
  chatHistory: ChatMessage[]
): Promise<boolean> {
  const storage = await getStorage();
  const fileIndex = storage.files.findIndex((f) => f.id === id);

  if (fileIndex === -1) return false;

  storage.files[fileIndex].visualization = visualization;
  storage.files[fileIndex].chatHistory = chatHistory;
  await saveStorage(storage);

  return true;
}

export async function updateFileName(
  id: string,
  displayName: string
): Promise<boolean> {
  const storage = await getStorage();
  const fileIndex = storage.files.findIndex((f) => f.id === id);

  if (fileIndex === -1) return false;

  storage.files[fileIndex].displayName = displayName;
  await saveStorage(storage);

  return true;
}

export async function deleteFile(id: string): Promise<boolean> {
  const storage = await getStorage();
  const fileIndex = storage.files.findIndex((f) => f.id === id);

  if (fileIndex === -1) return false;

  const file = storage.files[fileIndex];
  const filePath = path.join(IMPORTS_DIR, file.filePath);

  try {
    await fs.unlink(filePath);
  } catch {
    // File might already be deleted
  }

  // Also delete source files
  if (file.sourceFiles) {
    for (const sf of file.sourceFiles) {
      try {
        await fs.unlink(path.join(IMPORTS_DIR, sf.filePath));
      } catch {
        // File might already be deleted
      }
    }
  }

  storage.files.splice(fileIndex, 1);
  await saveStorage(storage);

  return true;
}

export async function addSourceFile(
  documentId: string,
  extractedText: string,
  originalName: string,
  mimeType?: string
): Promise<SourceFile | null> {
  await ensureDirectories();

  const storage = await getStorage();
  const fileIndex = storage.files.findIndex((f) => f.id === documentId);

  if (fileIndex === -1) return null;

  const sourceId = generateId();
  const fileName = `${sourceId}.txt`;
  const filePath = path.join(IMPORTS_DIR, fileName);

  await fs.writeFile(filePath, extractedText);

  const sourceFile: SourceFile = {
    id: sourceId,
    originalName,
    filePath: fileName,
    mimeType,
    addedAt: new Date().toISOString(),
  };

  if (!storage.files[fileIndex].sourceFiles) {
    storage.files[fileIndex].sourceFiles = [];
  }
  storage.files[fileIndex].sourceFiles.push(sourceFile);
  await saveStorage(storage);

  return sourceFile;
}

export async function getSourceFileContent(sourceFile: SourceFile): Promise<string> {
  const filePath = path.join(IMPORTS_DIR, sourceFile.filePath);
  return fs.readFile(filePath, 'utf-8');
}

export async function removeSourceFile(documentId: string, sourceFileId: string): Promise<boolean> {
  const storage = await getStorage();
  const fileIndex = storage.files.findIndex((f) => f.id === documentId);

  if (fileIndex === -1) return false;

  const file = storage.files[fileIndex];
  if (!file.sourceFiles) return false;

  const sfIndex = file.sourceFiles.findIndex((sf) => sf.id === sourceFileId);
  if (sfIndex === -1) return false;

  const sf = file.sourceFiles[sfIndex];
  try {
    await fs.unlink(path.join(IMPORTS_DIR, sf.filePath));
  } catch {
    // File might already be deleted
  }

  file.sourceFiles.splice(sfIndex, 1);
  await saveStorage(storage);

  return true;
}

export function getFileTypeLabel(type: FileType): string {
  const labels: Record<FileType, string> = {
    schedule: 'Schedule',
    invoice: 'Invoice',
    healthcare: 'Healthcare',
    unknown: 'Document',
  };
  return labels[type];
}

export function getFileTypeIcon(type: FileType): string {
  const icons: Record<FileType, string> = {
    schedule: 'calendar',
    invoice: 'receipt',
    healthcare: 'heart',
    unknown: 'file',
  };
  return icons[type];
}
