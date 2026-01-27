/**
 * Migration script for existing data
 *
 * This script migrates data from the old storage.json format to the new SQLite database.
 * It should be run once after setting up the new auth system.
 *
 * Usage: npx tsx scripts/migrate-data.ts <user-email>
 *
 * The script will:
 * 1. Read files from storage.json
 * 2. Find the user by email (must exist already)
 * 3. Migrate all files to that user
 * 4. Move files from /data/imports/ to /data/users/{userId}/imports/
 * 5. Archive the old storage.json
 */

import { promises as fs } from 'fs';
import path from 'path';

// We need to manually set up the db path before importing
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '..', 'data');
process.env.DATA_DIR = DATA_DIR;

import { getDb } from '../src/lib/db';

interface OldSourceFile {
  id: string;
  originalName: string;
  filePath: string;
  mimeType?: string;
  addedAt: string;
}

interface OldFile {
  id: string;
  originalName: string;
  displayName: string;
  fileType: string;
  importedAt: string;
  filePath: string;
  originalMimeType?: string;
  visualization?: string;
  chatHistory?: { role: string; content: string }[];
  sourceFiles?: OldSourceFile[];
  initialPrompt?: string;
}

interface OldStorage {
  files: OldFile[];
}

async function main() {
  const userEmail = process.argv[2];

  if (!userEmail) {
    console.error('Usage: npx tsx scripts/migrate-data.ts <user-email>');
    console.error('');
    console.error('The user must already exist (register first, then run this script).');
    process.exit(1);
  }

  const storageFile = path.join(DATA_DIR, 'storage.json');
  const oldImportsDir = path.join(DATA_DIR, 'imports');

  // Check if storage.json exists
  try {
    await fs.access(storageFile);
  } catch {
    console.log('No storage.json found. Nothing to migrate.');
    process.exit(0);
  }

  // Get database and find user
  const db = getDb();
  const userStmt = db.prepare('SELECT id FROM users WHERE email = ?');
  const user = userStmt.get(userEmail) as { id: string } | undefined;

  if (!user) {
    console.error(`User with email "${userEmail}" not found.`);
    console.error('Please register the user first, then run this script.');
    process.exit(1);
  }

  const userId = user.id;
  console.log(`Found user: ${userId}`);

  // Create user imports directory
  const userImportsDir = path.join(DATA_DIR, 'users', userId, 'imports');
  await fs.mkdir(userImportsDir, { recursive: true });
  console.log(`Created user imports directory: ${userImportsDir}`);

  // Read old storage
  const storageContent = await fs.readFile(storageFile, 'utf-8');
  const oldStorage: OldStorage = JSON.parse(storageContent);

  console.log(`Found ${oldStorage.files.length} files to migrate`);

  // Prepare statements
  const insertFileStmt = db.prepare(`
    INSERT INTO files (id, user_id, original_name, display_name, file_type, file_path, original_mime_type, visualization, chat_history, initial_prompt, imported_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSourceFileStmt = db.prepare(`
    INSERT INTO source_files (id, file_id, original_name, file_path, mime_type, added_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let migratedFiles = 0;
  let migratedSourceFiles = 0;
  let errors: string[] = [];

  for (const file of oldStorage.files) {
    try {
      // Move main file content
      const oldFilePath = path.join(oldImportsDir, file.filePath);
      const newFilePath = path.join(userImportsDir, file.filePath);

      try {
        await fs.copyFile(oldFilePath, newFilePath);
      } catch (e) {
        console.warn(`  Warning: Could not copy file ${file.filePath}: ${e}`);
      }

      // Insert file into database
      insertFileStmt.run(
        file.id,
        userId,
        file.originalName,
        file.displayName,
        file.fileType,
        file.filePath,
        file.originalMimeType || null,
        file.visualization || null,
        file.chatHistory ? JSON.stringify(file.chatHistory) : null,
        file.initialPrompt || null,
        file.importedAt
      );

      migratedFiles++;
      console.log(`  Migrated file: ${file.displayName} (${file.id})`);

      // Migrate source files
      if (file.sourceFiles && file.sourceFiles.length > 0) {
        for (const sf of file.sourceFiles) {
          try {
            // Move source file content
            const oldSfPath = path.join(oldImportsDir, sf.filePath);
            const newSfPath = path.join(userImportsDir, sf.filePath);

            try {
              await fs.copyFile(oldSfPath, newSfPath);
            } catch (e) {
              console.warn(`    Warning: Could not copy source file ${sf.filePath}: ${e}`);
            }

            // Insert source file into database
            insertSourceFileStmt.run(
              sf.id,
              file.id,
              sf.originalName,
              sf.filePath,
              sf.mimeType || null,
              sf.addedAt
            );

            migratedSourceFiles++;
          } catch (e) {
            errors.push(`Source file ${sf.id}: ${e}`);
          }
        }
      }
    } catch (e) {
      errors.push(`File ${file.id}: ${e}`);
    }
  }

  // Archive old storage.json
  const archivePath = path.join(DATA_DIR, `storage.json.migrated-${Date.now()}`);
  await fs.rename(storageFile, archivePath);
  console.log(`\nArchived old storage.json to: ${archivePath}`);

  // Summary
  console.log('\n=== Migration Complete ===');
  console.log(`Files migrated: ${migratedFiles}/${oldStorage.files.length}`);
  console.log(`Source files migrated: ${migratedSourceFiles}`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    errors.forEach(e => console.log(`  - ${e}`));
  }
}

main().catch(console.error);
