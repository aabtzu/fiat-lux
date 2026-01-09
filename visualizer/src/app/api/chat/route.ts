import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getFile, getFileContent, getSourceFileContent } from '@/lib/storage';

const anthropic = new Anthropic();

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are a visualization expert. Your job is to create beautiful, clear HTML/CSS visualizations of data AND answer questions about the data.

When given document content and user instructions, you either:
1. Generate/update an HTML visualization, OR
2. Answer a question about the data without changing the visualization

RESPONSE FORMAT:
- For visualization changes: Write a brief description, then output HTML after "---HTML---"
- For questions/analysis (no viz change needed): Just write your answer, do NOT include "---HTML---"

Example visualization response:
Created a weekly calendar grid showing all 8 courses with color-coded time blocks.
---HTML---
<div>...</div>

Example question response:
About 19 hours per week total, with 16 hours (83%) in architecture courses.

ANSWER STYLE:
- Be concise by default. Give the key answer first, then only essential details.
- If the user asks for "more detail", "explain", or "break it down", give a thorough response.
- If the user asks you to be "brief", "shorter", or "just the answer", be extremely concise.
- Remember the user's preference for the rest of the conversation.

Use your judgment: if the user is asking a question about the data (totals, counts, comparisons, summaries), answer it directly. If they want to see something differently or add/change the visualization, generate new HTML.

IMPORTANT RULES:
1. Always include the brief description before ---HTML---
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
const REFINEMENT_SYSTEM_PROMPT = `You are a visualization expert. You can refine visualizations OR answer questions about the displayed data.

RESPONSE FORMAT:
- For visualization changes: Write a brief description, then output HTML after "---HTML---"
- For questions/analysis (no viz change needed): Just write your answer, do NOT include "---HTML---"

RULES FOR VISUALIZATION CHANGES:
1. First, write a brief 1-sentence description of what you changed
2. Then output the complete updated HTML on a new line after "---HTML---"
3. Preserve the existing data and structure unless asked to change it
4. Apply the requested changes while keeping everything else intact
5. Use inline styles or a <style> tag - no external CSS
6. Maintain any existing JavaScript functionality

ANSWER STYLE:
- Be concise by default. Give the key answer first, then only essential details.
- If the user asks for "more detail", "explain", or "break it down", give a thorough response.
- If the user asks you to be "brief", "shorter", or "just the answer", be extremely concise.
- Remember the user's preference for the rest of the conversation.

Use your judgment: if the user is asking a question (totals, counts, comparisons, "how many", "what is"), answer it directly from the data in the visualization. If they want to change how something looks, generate new HTML.`;

// Keywords that indicate the user needs access to original document data
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
];

export async function POST(request: NextRequest) {
  try {
    const { fileId, message, history, currentVisualization, additionalFileIds } = await request.json();

    if (!fileId || !message) {
      return NextResponse.json({ error: 'Missing fileId or message' }, { status: 400 });
    }

    // Check if this is a refinement request (has existing visualization and history)
    // But also check if the user is asking for original data (needs full context)
    const needsFullContext = NEEDS_FULL_CONTEXT_PATTERNS.some(pattern => pattern.test(message));
    const isRefinement = currentVisualization && history && history.length > 0 && !needsFullContext;

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

      // Parse response: message before ---HTML---, HTML after (if present)
      const responseText = assistantContent.text;
      const htmlMarker = '---HTML---';
      const markerIndex = responseText.indexOf(htmlMarker);

      // If no HTML marker, this is a question-only response
      if (markerIndex === -1) {
        return NextResponse.json({
          visualization: null,
          message: responseText.trim(),
        });
      }

      const chatMessage = responseText.substring(0, markerIndex).trim();
      let html = responseText.substring(markerIndex + htmlMarker.length).trim();
      html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '');
      html = html.trim();

      return NextResponse.json({
        visualization: html,
        message: chatMessage,
      });
    }

    // Full context flow for initial generation or when adding new data
    const file = await getFile(fileId);
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const content = await getFileContent(file);

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

    // Parse response: message before ---HTML---, HTML after (if present)
    const responseText = assistantContent.text;
    const htmlMarker = '---HTML---';
    const markerIndex = responseText.indexOf(htmlMarker);

    // If no HTML marker, this is a question-only response
    if (markerIndex === -1) {
      return NextResponse.json({
        visualization: null,
        message: responseText.trim(),
      });
    }

    const chatMessage = responseText.substring(0, markerIndex).trim();
    let html = responseText.substring(markerIndex + htmlMarker.length).trim();
    html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '');
    html = html.trim();

    return NextResponse.json({
      visualization: html,
      message: chatMessage,
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      { status: 500 }
    );
  }
}
