import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getFileById, getUserAccessLevel, getFileContent, getTemplateVisualization } from '@/lib/userStorage';

const AGENTS_URL = process.env.AGENTS_SERVICE_URL || 'http://localhost:5002';

// Keywords that require re-reading the original document
const NEEDS_FULL_CONTEXT_PATTERNS = [
  /re-?read/i,
  /original\s+(data|document|file)/i,
  /all\s+(the\s+)?(data|items|courses|entries)/i,
  /missing\s+(data|items|courses|entries)/i,
  /from\s+(the\s+)?(source|document|file)/i,
  /don'?t\s+see/i,
  /where\s+(is|are)/i,
  /repopulate/i,
  /reload/i,
  /start\s+over/i,
  /regenerate/i,
  /source\s*(file|data)/i,
  /uploaded?\s*(file|document)/i,
  /the\s+file/i,
  /raw\s+data/i,
];

const CSV_EXPORT_PATTERNS = [
  /export.*csv/i,
  /csv.*export/i,
  /download.*csv/i,
  /save.*csv/i,
  /export.*table/i,
  /export.*data/i,
  /get.*csv/i,
  /as\s+csv/i,
  /to\s+csv/i,
  /csv\s+file/i,
];

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { fileId, message, currentVisualization, additionalFileIds } = await request.json();

    if (!fileId || !message) {
      return NextResponse.json({ error: 'Missing fileId or message' }, { status: 400 });
    }

    const accessLevel = getUserAccessLevel(user.id, fileId);
    if (accessLevel === 'none') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // ── CSV export ────────────────────────────────────────────────────────
    if (CSV_EXPORT_PATTERNS.some(p => p.test(message)) && currentVisualization) {
      const res = await fetch(`${AGENTS_URL}/api/agents/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: message, current_html: currentVisualization }),
      });
      const data = await res.json();
      if (!data.success) {
        return NextResponse.json({ error: data.error }, { status: 500 });
      }
      return NextResponse.json({
        visualization: null,
        message: "Here's your CSV export. The download should start automatically.",
        csvData: data.csv,
      });
    }

    // ── Refinement (skip document context — cheaper) ──────────────────────
    const needsFullContext = NEEDS_FULL_CONTEXT_PATTERNS.some(p => p.test(message));
    const isRefinement = currentVisualization && !needsFullContext;

    if (isRefinement) {
      const res = await fetch(`${AGENTS_URL}/api/agents/visualize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refine: true,
          current_html: currentVisualization,
          request: message,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        return NextResponse.json({ error: data.error }, { status: 500 });
      }
      return NextResponse.json({
        visualization: data.visualization,
        message: data.message,
      });
    }

    // ── Full context (initial viz or re-read) ─────────────────────────────
    const file = getFileById(fileId);
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const content = await getFileContent(file.userId, file.filePath);

    // Collect source files
    const documentTexts: string[] = [content];
    if (file.sourceFiles && file.sourceFiles.length > 0) {
      for (const sf of file.sourceFiles) {
        documentTexts.push(await getFileContent(file.userId, sf.filePath));
      }
    }

    // Additional context files
    if (additionalFileIds && additionalFileIds.length > 0) {
      for (const addId of additionalFileIds) {
        if (getUserAccessLevel(user.id, addId) !== 'none') {
          const addFile = getFileById(addId);
          if (addFile) {
            documentTexts.push(await getFileContent(addFile.userId, addFile.filePath));
          }
        }
      }
    }

    // Template for style matching
    let templateHtml: string | undefined;
    let templateName: string | undefined;
    if (!currentVisualization) {
      const template = getTemplateVisualization(user.id, file.fileType, fileId);
      if (template) {
        templateHtml = template.visualization;
        templateName = template.displayName;
      }
    }

    const res = await fetch(`${AGENTS_URL}/api/agents/visualize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document_text: documentTexts.length === 1 ? documentTexts[0] : documentTexts,
        request: message,
        current_html: currentVisualization || undefined,
        template_html: templateHtml,
        template_name: templateName,
      }),
    });

    const data = await res.json();
    if (!data.success) {
      return NextResponse.json({ error: data.error }, { status: 500 });
    }

    return NextResponse.json({
      visualization: data.visualization,
      message: data.message,
    });

  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      { status: 500 }
    );
  }
}
