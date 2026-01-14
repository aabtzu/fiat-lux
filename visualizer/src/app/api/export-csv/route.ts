import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { JSDOM } from 'jsdom';

const anthropic = new Anthropic();

// Try to extract data directly from HTML structure
function tryDirectExtraction(html: string): { tables: Array<{ id: string; name: string; csvData: string }> } | null {
  try {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const tables: Array<{ id: string; name: string; csvData: string }> = [];

    // Look for HTML tables first
    const htmlTables = doc.querySelectorAll('table');
    htmlTables.forEach((table, idx) => {
      const rows: string[][] = [];
      table.querySelectorAll('tr').forEach(tr => {
        const cells: string[] = [];
        tr.querySelectorAll('th, td').forEach(cell => {
          let text = cell.textContent?.trim() || '';
          // Remove commas from numbers
          text = text.replace(/\$?([\d,]+)\.(\d{2})/, (_, num, dec) => '$' + num.replace(/,/g, '') + '.' + dec);
          if (text.includes(',') || text.includes('"')) {
            text = '"' + text.replace(/"/g, '""') + '"';
          }
          cells.push(text);
        });
        if (cells.length > 0) rows.push(cells);
      });
      if (rows.length > 1) {
        tables.push({
          id: `table_${idx + 1}`,
          name: `Table ${idx + 1}`,
          csvData: rows.map(r => r.join(',')).join('\n')
        });
      }
    });

    // Look for div-based item structures (common in visualizations)
    const items = doc.querySelectorAll('.item');
    if (items.length > 0) {
      const rows: string[][] = [];
      // Define all possible columns - check across ALL items which columns exist
      const selectors = ['item-name', 'item-code', 'quantity', 'category', 'original-price', 'discount', 'final-price'];
      const foundSelectors: string[] = [];

      // Check all items to find which columns are used anywhere
      selectors.forEach(sel => {
        for (const item of Array.from(items)) {
          if (item.querySelector(`.${sel}`)) {
            foundSelectors.push(sel);
            break;
          }
        }
      });

      // Build header row
      const headerCells = foundSelectors.map(sel =>
        sel.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      );

      // Check if any item is a special order
      const hasSpecialOrder = Array.from(items).some(item => item.classList.contains('special-order'));
      if (hasSpecialOrder) {
        headerCells.push('Special Order');
        foundSelectors.push('special-order');
      }

      if (headerCells.length >= 2) {
        rows.push(headerCells);

        items.forEach(item => {
          const rowCells: string[] = [];
          foundSelectors.forEach(sel => {
            if (sel === 'special-order') {
              rowCells.push(item.classList.contains('special-order') ? 'Yes' : '');
            } else {
              const el = item.querySelector(`.${sel}`);
              let text = el?.textContent?.trim() || '';
              // Remove commas from numbers for clean CSV
              text = text.replace(/\$([\d,]+)\.(\d{2})/, (_, num, dec) => '$' + num.replace(/,/g, '') + '.' + dec);
              text = text.replace(/-\$([\d,]+)\.(\d{2})/, (_, num, dec) => '-$' + num.replace(/,/g, '') + '.' + dec);
              if (text.includes(',') || text.includes('"')) {
                text = '"' + text.replace(/"/g, '""') + '"';
              }
              rowCells.push(text);
            }
          });
          rows.push(rowCells);
        });

        if (rows.length > 1) {
          tables.push({
            id: 'line_items',
            name: 'Line Items',
            csvData: rows.map(r => r.join(',')).join('\n')
          });
        }
      }
    }

    return tables.length > 0 ? { tables } : null;
  } catch (e) {
    console.error('Direct extraction failed:', e);
    return null;
  }
}

const IDENTIFY_TABLES_PROMPT = `Analyze this HTML visualization and identify all distinct tables or data collections that could be exported as CSV.

For each table/data collection found, provide:
1. A short descriptive name (e.g., "Line Items", "Order Summary", "Payment History")
2. A brief description of what data it contains
3. The approximate number of rows

IMPORTANT: Focus on actual data tables, not navigation menus, headers, or decorative elements.
For invoices/orders, distinguish between:
- Itemized line items (the main detailed data)
- Summary totals (usually smaller, aggregate data)
- Charts/graphs (visual representations)

Output as JSON array:
[
  {"id": "line_items", "name": "Line Items", "description": "Detailed list of ordered products", "rowCount": 15},
  {"id": "summary", "name": "Order Summary", "description": "Totals by category", "rowCount": 4}
]

If no exportable tables are found, return: []`;

const EXTRACT_TABLE_PROMPT = `Extract the specified table/data from this HTML visualization as CSV format.

RULES:
1. Output ONLY the CSV data, nothing else - no explanation, no markdown, no code blocks
2. First row should be column headers
3. Use comma as delimiter
4. CRITICAL: Every row MUST have the same number of columns as the header row
5. If a cell is empty/missing in the visualization, output an empty value (two commas with nothing between: ,,)
6. NEVER skip columns - if a row has no value for a column, leave it empty but maintain column position
7. For monetary values like "$23,759" - remove the comma from the number (output as $23759 or 23759)
8. For any other values containing commas that can't be simplified, wrap in double quotes
9. Escape double quotes by doubling them
10. Extract ALL rows of data, don't truncate
11. Clean up any HTML entities or formatting artifacts
12. Keep numbers as clean values for easy spreadsheet use (no thousand separators)

Example with missing values (note empty cells maintain column alignment):
Item,Price,Discount,Final
Widget A,100.00,10.00,90.00
Widget B,,,50.00
Widget C,200.00,,200.00

Table to extract: `;

export async function POST(request: NextRequest) {
  try {
    const { html, action, tableId, tableName } = await request.json();

    if (!html) {
      return NextResponse.json({ error: 'Missing HTML content' }, { status: 400 });
    }

    if (action === 'identify') {
      // Try direct extraction first
      const directResult = tryDirectExtraction(html);
      if (directResult && directResult.tables.length > 0) {
        // Return table info without csvData for identify action
        const tables = directResult.tables.map(t => ({
          id: t.id,
          name: t.name,
          description: `Extracted directly from HTML structure`,
          rowCount: t.csvData.split('\n').length - 1,
          _csvData: t.csvData // Store for later extraction
        }));
        return NextResponse.json({ tables, directExtraction: true });
      }

      // Fall back to LLM identification
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: `${IDENTIFY_TABLES_PROMPT}\n\nHTML:\n${html}`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return NextResponse.json({ error: 'Unexpected response' }, { status: 500 });
      }

      try {
        // Extract JSON array from response (handle markdown and explanatory text)
        let jsonStr = content.text;

        // Try to find JSON array in the response
        const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        } else {
          // Fallback: strip markdown and try to parse
          jsonStr = jsonStr.trim().replace(/^```json?\n?/i, '').replace(/\n?```$/i, '');
        }

        const tables = JSON.parse(jsonStr);
        return NextResponse.json({ tables });
      } catch (parseError) {
        // If parsing fails, log and return empty array
        console.error('Failed to parse table identification response:', content.text.substring(0, 500));
        return NextResponse.json({ tables: [], parseError: 'Failed to parse LLM response' });
      }
    }

    if (action === 'extract') {
      if (!tableId && !tableName) {
        return NextResponse.json({ error: 'Missing tableId or tableName' }, { status: 400 });
      }

      // Try direct extraction first
      const directResult = tryDirectExtraction(html);
      if (directResult) {
        const table = directResult.tables.find(t => t.id === tableId || t.name === tableName);
        if (table) {
          return NextResponse.json({ csvData: table.csvData, directExtraction: true });
        }
      }

      // Fall back to LLM extraction
      const tableDescription = tableName || tableId;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16384,
        messages: [
          {
            role: 'user',
            content: `${EXTRACT_TABLE_PROMPT}"${tableDescription}"\n\nHTML:\n${html}`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return NextResponse.json({ error: 'Unexpected response' }, { status: 500 });
      }

      // Clean up CSV output
      let csvData = content.text.trim();
      csvData = csvData.replace(/^```csv?\n?/i, '').replace(/\n?```$/i, '');

      return NextResponse.json({ csvData });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Export CSV error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Export failed' },
      { status: 500 }
    );
  }
}
