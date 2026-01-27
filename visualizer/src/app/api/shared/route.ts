import { NextRequest, NextResponse } from 'next/server';
import { validateShareToken } from '@/lib/sharing';
import { getFileById, getFileContent } from '@/lib/userStorage';

// GET - Get shared file by token
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const shareInfo = validateShareToken(token);
  if (!shareInfo) {
    return NextResponse.json({ error: 'Invalid or expired share link' }, { status: 404 });
  }

  const file = getFileById(shareInfo.fileId);
  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // Return file info (without full content for now)
  return NextResponse.json({
    file: {
      id: file.id,
      displayName: file.displayName,
      fileType: file.fileType,
      visualization: file.visualization,
      chatHistory: file.chatHistory || [],
      sourceFiles: file.sourceFiles || [],
    },
    canEdit: shareInfo.canEdit,
  });
}
