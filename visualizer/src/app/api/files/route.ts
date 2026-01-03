import { NextRequest, NextResponse } from 'next/server';
import { getStorage, deleteFile, updateFileName, addSourceFile, removeSourceFile, SourceFile, generateId, ensureDirectories } from '@/lib/storage';
import { extractDocument, getMimeType } from '@/lib/documentExtractor';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '..', 'data');
const IMPORTS_DIR = path.join(DATA_DIR, 'imports');

export async function GET() {
  const storage = await getStorage();
  return NextResponse.json(storage.files);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('file') as File[];
    const displayName = formData.get('displayName') as string | null;
    const documentId = formData.get('documentId') as string | null;

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // If documentId is provided, add files to existing document
    if (documentId) {
      const addedSourceFiles: SourceFile[] = [];

      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType = file.type || getMimeType(file.name);
        const extraction = await extractDocument(buffer, mimeType, file.name);

        const sourceFile = await addSourceFile(
          documentId,
          extraction.text,
          file.name,
          mimeType
        );

        if (sourceFile) {
          addedSourceFiles.push(sourceFile);
        }
      }

      return NextResponse.json({ sourceFiles: addedSourceFiles });
    }

    // Create new document entry
    await ensureDirectories();

    // Process all files
    const extractions: { text: string; fileType: string; fileName: string; mimeType: string }[] = [];

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = file.type || getMimeType(file.name);
      const extraction = await extractDocument(buffer, mimeType, file.name);
      extractions.push({
        text: extraction.text,
        fileType: extraction.fileType,
        fileName: file.name,
        mimeType,
      });
    }

    // Combine all extracted text for the main document
    const combinedText = extractions.map((e, i) =>
      files.length > 1 ? `=== File ${i + 1}: ${e.fileName} ===\n${e.text}` : e.text
    ).join('\n\n');

    // Use the first file's type, or 'unknown' if mixed
    const fileTypes = [...new Set(extractions.map(e => e.fileType))];
    const mainFileType = fileTypes.length === 1 ? fileTypes[0] : 'unknown';

    // Create the main document
    const mainId = generateId();
    const mainFileName = `${mainId}.txt`;
    const mainFilePath = path.join(IMPORTS_DIR, mainFileName);
    await fs.writeFile(mainFilePath, combinedText);

    // Create source file entries for each uploaded file
    const sourceFiles: SourceFile[] = [];
    for (let i = 0; i < extractions.length; i++) {
      const sourceId = generateId();
      const sourceFileName = `${sourceId}.txt`;
      const sourceFilePath = path.join(IMPORTS_DIR, sourceFileName);
      await fs.writeFile(sourceFilePath, extractions[i].text);

      sourceFiles.push({
        id: sourceId,
        originalName: extractions[i].fileName,
        filePath: sourceFileName,
        mimeType: extractions[i].mimeType,
        addedAt: new Date().toISOString(),
      });
    }

    // Determine display name
    const finalDisplayName = displayName ||
      (files.length === 1
        ? files[0].name.replace(/\.[^/.]+$/, '')
        : `${files.length} files`);

    // Save to storage
    const storage = await getStorage();
    const importedFile = {
      id: mainId,
      originalName: files.length === 1 ? files[0].name : `${files.length} files`,
      displayName: finalDisplayName,
      fileType: mainFileType as 'schedule' | 'invoice' | 'healthcare' | 'unknown',
      importedAt: new Date().toISOString(),
      filePath: mainFileName,
      sourceFiles,
    };

    storage.files.unshift(importedFile);
    const { saveStorage } = await import('@/lib/storage');
    await saveStorage(storage);

    return NextResponse.json(importedFile);
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload file' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, displayName } = await request.json();

    if (!id || !displayName) {
      return NextResponse.json({ error: 'Missing id or displayName' }, { status: 400 });
    }

    const updated = await updateFileName(id, displayName);

    if (!updated) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating file:', error);
    return NextResponse.json({ error: 'Failed to update file' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const sourceFileId = searchParams.get('sourceFileId');

    if (!id) {
      return NextResponse.json({ error: 'No file ID provided' }, { status: 400 });
    }

    // If sourceFileId is provided, remove just that source file
    if (sourceFileId) {
      const removed = await removeSourceFile(id, sourceFileId);
      if (!removed) {
        return NextResponse.json({ error: 'Source file not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    // Otherwise delete the entire document
    const deleted = await deleteFile(id);

    if (!deleted) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
