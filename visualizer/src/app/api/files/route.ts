import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  getFilesForUser,
  getFilesSharedWithUser,
  addFileForUser,
  addSourceFileForUser,
  updateFileName,
  deleteFile,
  deleteSourceFile,
  SourceFile,
} from '@/lib/userStorage';
import { extractDocument, getMimeType } from '@/lib/documentExtractor';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownedFiles = getFilesForUser(user.id);
  const sharedFiles = getFilesSharedWithUser(user.id);

  return NextResponse.json({
    owned: ownedFiles,
    shared: sharedFiles,
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  console.log('POST /api/files - user:', user ? user.email : 'null');
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll('file') as File[];
    const displayName = formData.get('displayName') as string | null;
    const documentId = formData.get('documentId') as string | null;
    const initialPrompt = formData.get('initialPrompt') as string | null;

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

        const sourceFile = await addSourceFileForUser(
          user.id,
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

    // Determine display name
    const finalDisplayName = displayName ||
      (files.length === 1
        ? files[0].name.replace(/\.[^/.]+$/, '')
        : `${files.length} files`);

    // Create the document for this user
    const importedFile = await addFileForUser(
      user.id,
      combinedText,
      files.length === 1 ? files[0].name : `${files.length} files`,
      finalDisplayName,
      mainFileType as 'schedule' | 'invoice' | 'healthcare' | 'unknown',
      extractions[0]?.mimeType,
      initialPrompt || undefined
    );

    // Add source files for each uploaded file
    for (const extraction of extractions) {
      await addSourceFileForUser(
        user.id,
        importedFile.id,
        extraction.text,
        extraction.fileName,
        extraction.mimeType
      );
    }

    // Refetch to get source files
    const { getFileForUser } = await import('@/lib/userStorage');
    const fileWithSources = getFileForUser(importedFile.id, user.id);

    return NextResponse.json(fileWithSources || importedFile);
  } catch (error) {
    console.error('Error uploading file:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to upload file';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Stack:', errorStack);
    return NextResponse.json(
      { error: errorMessage, details: errorStack },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, displayName } = await request.json();

    if (!id || !displayName) {
      return NextResponse.json({ error: 'Missing id or displayName' }, { status: 400 });
    }

    const updated = updateFileName(id, user.id, displayName);

    if (!updated) {
      return NextResponse.json({ error: 'File not found or access denied' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating file:', error);
    return NextResponse.json({ error: 'Failed to update file' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const sourceFileId = searchParams.get('sourceFileId');

    if (!id) {
      return NextResponse.json({ error: 'No file ID provided' }, { status: 400 });
    }

    // If sourceFileId is provided, remove just that source file
    if (sourceFileId) {
      const removed = await deleteSourceFile(id, sourceFileId, user.id);
      if (!removed) {
        return NextResponse.json({ error: 'Source file not found or access denied' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    // Otherwise delete the entire document
    const deleted = await deleteFile(id, user.id);

    if (!deleted) {
      return NextResponse.json({ error: 'File not found or access denied' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
