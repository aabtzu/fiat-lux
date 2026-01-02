import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getFile, getFileContent } from '@/lib/storage';

const anthropic = new Anthropic();

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are a visualization expert. Your job is to create beautiful, clear HTML/CSS visualizations of data.

When given document content and user instructions, you generate a complete HTML visualization.

IMPORTANT RULES:
1. Output ONLY the HTML content - no markdown, no code fences, no explanations
2. Use inline styles or a <style> tag - no external CSS
3. Use modern CSS (flexbox, grid, etc.) for layouts
4. Make it visually appealing with good colors, spacing, and typography
5. The visualization should be self-contained and render correctly when inserted into a div
6. Use semantic colors (blue for info, green for success, red for important, etc.)
7. For schedules: consider calendar grids, timeline views, or card layouts
8. For invoices: consider tables with clear totals, or itemized card views
9. For healthcare: consider summary cards, cost breakdowns, or timeline views
10. Be creative but prioritize clarity and readability
11. Always include a title/header for the visualization
12. Use relative units (rem, %, etc.) so it scales well

Start with a reasonable default visualization based on the document type, then refine based on user feedback.`;

export async function POST(request: NextRequest) {
  try {
    const { fileId, message, history, currentVisualization } = await request.json();

    if (!fileId || !message) {
      return NextResponse.json({ error: 'Missing fileId or message' }, { status: 400 });
    }

    // Get the file content
    const file = await getFile(fileId);
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const content = await getFileContent(file);

    // Build the messages array
    const messages: Anthropic.MessageParam[] = [];

    // Add context about the document
    const contextMessage = `Here is the document content to visualize:

---
Document: ${file.displayName}
Type: ${file.fileType}
---
${content}
---

${currentVisualization ? `Current visualization HTML:\n${currentVisualization}\n---\n` : ''}`;

    // Add conversation history
    if (history && history.length > 0) {
      // First message includes context
      messages.push({
        role: 'user',
        content: contextMessage + '\n\n' + history[0].content,
      });

      // Add rest of history
      for (let i = 1; i < history.length; i++) {
        messages.push({
          role: history[i].role,
          content: history[i].content,
        });
      }

      // Add current message
      messages.push({
        role: 'user',
        content: message,
      });
    } else {
      // First message
      messages.push({
        role: 'user',
        content: contextMessage + '\n\nUser request: ' + message,
      });
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages,
    });

    const assistantContent = response.content[0];
    if (assistantContent.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected response type' }, { status: 500 });
    }

    // Clean up the response - remove any markdown code fences if present
    let html = assistantContent.text;
    html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '');
    html = html.trim();

    return NextResponse.json({
      visualization: html,
      message: 'Visualization updated',
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      { status: 500 }
    );
  }
}
