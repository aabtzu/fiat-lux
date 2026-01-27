import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createShareLink,
  shareWithUser,
  getSharesForFile,
  revokeShare,
  findUsersByEmailPrefix,
} from '@/lib/sharing';
import { getFileForUser } from '@/lib/userStorage';

// GET - List shares for a file
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('fileId');
  const searchEmail = searchParams.get('searchEmail');

  // User search endpoint
  if (searchEmail) {
    const users = findUsersByEmailPrefix(searchEmail, user.id);
    return NextResponse.json({ users });
  }

  if (!fileId) {
    return NextResponse.json({ error: 'fileId required' }, { status: 400 });
  }

  // Verify ownership
  const file = getFileForUser(fileId, user.id);
  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const shares = getSharesForFile(fileId, user.id);
  return NextResponse.json({ shares });
}

// POST - Create a share
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { fileId, type, email, canEdit } = body;

    if (!fileId || !type) {
      return NextResponse.json({ error: 'fileId and type required' }, { status: 400 });
    }

    // Verify ownership
    const file = getFileForUser(fileId, user.id);
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    let share;

    if (type === 'link') {
      share = createShareLink(fileId, user.id, canEdit || false);
    } else if (type === 'user') {
      if (!email) {
        return NextResponse.json({ error: 'email required for user share' }, { status: 400 });
      }
      share = shareWithUser(fileId, user.id, email, canEdit || false);
      if (!share) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: 'Invalid share type' }, { status: 400 });
    }

    return NextResponse.json({ share });
  } catch (error) {
    console.error('Error creating share:', error);
    return NextResponse.json({ error: 'Failed to create share' }, { status: 500 });
  }
}

// DELETE - Revoke a share
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const shareId = searchParams.get('id');

  if (!shareId) {
    return NextResponse.json({ error: 'Share ID required' }, { status: 400 });
  }

  const success = revokeShare(shareId, user.id);
  if (!success) {
    return NextResponse.json({ error: 'Share not found or unauthorized' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
