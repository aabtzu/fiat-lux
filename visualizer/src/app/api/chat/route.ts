import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getFile, getFileContent, getSourceFileContent, getStructuredContent } from '@/lib/storage';

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

DATA-DRIVEN APPROACH (CRITICAL for large datasets):
- ALWAYS use a data-driven approach: define data as a JavaScript array/object, then render it dynamically
- Example structure:
  <script>
    const data = [
      {date: "2025-01-01", description: "Item 1", amount: 100},
      {date: "2025-01-02", description: "Item 2", amount: 200},
    ];
    function renderTable() {
      const tbody = document.getElementById('tableBody');
      tbody.innerHTML = data.map(row => \`<tr><td>\${row.date}</td><td>\${row.description}</td><td>$\${row.amount}</td></tr>\`).join('');
    }
    document.addEventListener('DOMContentLoaded', renderTable);
  </script>
- This keeps HTML small regardless of data size
- Makes sorting, filtering, and searching easy to implement
- Avoids output truncation issues with large datasets

JAVASCRIPT RULES (CRITICAL):
- Prefer CSS-only solutions (hover effects, :target, details/summary, checkbox hacks) over JavaScript when possible
- When using JavaScript for interactivity:
  - ALL functions must be defined inline in a <script> tag within your HTML
  - Define data arrays at the top of the script
  - Use template literals to render data dynamically
  - For sorting: sort the data array, then re-render
  - For modals: pass an index or ID to look up data, don't duplicate data in HTML
- Test mentally: if your HTML were inserted into an empty div, would all functions exist?

HANDLING NEW DATA FILES:
- When new files are added to an existing visualization, analyze if the new data is similar to existing data
- If SIMILAR (same type, same columns/fields): automatically incorporate into the existing visualization, update totals/summaries, add new rows to tables
- If DIFFERENT: briefly describe what the new data contains, suggest how it could be incorporated (new section, separate table, combined view), and ask the user what they'd prefer
- Always mention what was added: "I've added X new records from [filename]" or "The new file contains [description] - how would you like me to incorporate it?"

Start with a reasonable default visualization based on the document type, then refine based on user feedback.`;

// Shorter system prompt for refinement requests (no document context needed)
const REFINEMENT_SYSTEM_PROMPT = `You are a visualization expert refining an existing HTML/CSS visualization.

IMPORTANT RULES:
1. Output ONLY the updated HTML content - no markdown, no code fences, no explanations
2. Preserve the existing data and structure unless asked to change it
3. Apply the requested changes while keeping everything else intact
4. Use inline styles or a <style> tag - no external CSS
5. Maintain any existing JavaScript functionality

You will receive the current visualization HTML and a modification request. Make the requested changes and return the complete updated HTML.`;

export async function POST(request: NextRequest) {
  try {
    const { fileId, message, history, currentVisualization, additionalFileIds } = await request.json();

    if (!fileId || !message) {
      return NextResponse.json({ error: 'Missing fileId or message' }, { status: 400 });
    }

    // Check if this is a refinement request (has existing visualization and history)
    const isRefinement = currentVisualization && history && history.length > 0;

    // For refinements, we skip loading document content entirely
    if (isRefinement) {
      const messages: Anthropic.MessageParam[] = [
        {
          role: 'user',
          content: `Current visualization HTML:\n\n${currentVisualization}\n\n---\n\nPlease make this change: ${message}`,
        },
      ];

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16384,
        system: REFINEMENT_SYSTEM_PROMPT,
        messages,
      });

      const assistantContent = response.content[0];
      if (assistantContent.type !== 'text') {
        return NextResponse.json({ error: 'Unexpected response type' }, { status: 500 });
      }

      let html = assistantContent.text;
      html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '');
      html = html.trim();

      return NextResponse.json({
        visualization: html,
        message: 'Visualization updated',
      });
    }

    // Full context flow for initial generation or when adding new data
    const file = await getFile(fileId);
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Prefer structured data (compact JSON) over raw text
    const structuredContent = getStructuredContent(file);
    const content = structuredContent
      ? `[Structured Data - JSON]\n${structuredContent}`
      : await getFileContent(file);

    // Get source files content (files that are part of this document)
    let sourceFilesContext = '';
    if (file.sourceFiles && file.sourceFiles.length > 0) {
      for (const sf of file.sourceFiles) {
        const sfContent = await getSourceFileContent(sf);
        sourceFilesContext += `\n---\nSource File: ${sf.originalName}\n---\n${sfContent}\n`;
      }
    }

    // Get additional context files (from other documents, if any)
    let additionalContext = '';
    if (additionalFileIds && additionalFileIds.length > 0) {
      for (const addFileId of additionalFileIds) {
        const addFile = await getFile(addFileId);
        if (addFile) {
          const addContent = await getFileContent(addFile);
          additionalContext += `\n---\nAdditional Document: ${addFile.displayName}\nType: ${addFile.fileType}\n---\n${addContent}\n`;
        }
      }
    }

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
${sourceFilesContext}${additionalContext}
${currentVisualization ? `Current visualization HTML:\n${currentVisualization}\n---\n` : ''}`;

    // First message includes full context with caching
    // Document context is cached, user request is not
    messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: contextMessage,
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: 'User request: ' + message,
        },
      ],
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16384,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
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
