import { NextRequest, NextResponse } from 'next/server';
import { getStorage, addExtractedFile, deleteFile, updateFileName } from '@/lib/storage';
import { extractDocument, getMimeType } from '@/lib/documentExtractor';

export async function GET() {
  const storage = await getStorage();
  return NextResponse.json(storage.files);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const displayName = formData.get('displayName') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Get file as buffer for binary file support
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine mime type
    const mimeType = file.type || getMimeType(file.name);

    // Extract content using LLM
    const extraction = await extractDocument(buffer, mimeType, file.name);

    // Save the extracted file
    const importedFile = await addExtractedFile(
      extraction.text,
      file.name,
      extraction.fileType,
      displayName || undefined,
      mimeType,
      extraction.structured
    );

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

    if (!id) {
      return NextResponse.json({ error: 'No file ID provided' }, { status: 400 });
    }

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
