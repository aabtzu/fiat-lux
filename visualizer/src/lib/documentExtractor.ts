import Anthropic from '@anthropic-ai/sdk';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';

const anthropic = new Anthropic();

export type SupportedMimeType =
  | 'text/plain'
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp';

export interface ExtractionResult {
  text: string;
  structured?: Record<string, unknown>;
  fileType: 'schedule' | 'invoice' | 'healthcare' | 'unknown';
}

const EXTRACTION_PROMPT = `You are analyzing a document to extract its content.

First, identify what type of document this is:
- "schedule" - class schedules, work schedules, calendars, timetables
- "invoice" - bills, invoices, receipts, payment requests
- "healthcare" - medical bills, EOBs, insurance claims, prescriptions
- "unknown" - anything else

Then extract ALL the text content from the document, preserving the structure as much as possible. Be thorough - include every item, every row, every entry. Do not summarize or skip anything.

For schedules: include every course/class with its code, title, days, times, location, instructor.
For invoices: include every line item with dates, descriptions, amounts.
For healthcare: include every service, date, provider, and all cost columns.

Respond in this exact JSON format:
{
  "fileType": "schedule" | "invoice" | "healthcare" | "unknown",
  "extractedText": "the complete extracted text content, preserving structure"
}`;

export async function extractFromImage(
  imageData: Buffer,
  mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
): Promise<ExtractionResult> {
  const base64 = imageData.toString('base64');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: base64,
            },
          },
          {
            type: 'text',
            text: EXTRACTION_PROMPT,
          },
        ],
      },
    ],
  });

  return parseExtractionResponse(response);
}

export async function extractFromPdf(pdfBuffer: Buffer): Promise<ExtractionResult> {
  // Use Claude's native PDF support
  const base64 = pdfBuffer.toString('base64');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            },
          },
          {
            type: 'text',
            text: EXTRACTION_PROMPT,
          },
        ],
      },
    ],
  });

  return parseExtractionResponse(response);
}

export async function extractFromDocx(docxBuffer: Buffer): Promise<ExtractionResult> {
  const result = await mammoth.extractRawText({ buffer: docxBuffer });
  return await classifyAndStructure(result.value);
}

export async function extractFromExcel(excelBuffer: Buffer): Promise<ExtractionResult> {
  const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
  const textParts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      textParts.push(`=== Sheet: ${sheetName} ===\n${csv}`);
    }
  }

  const text = textParts.join('\n\n');
  return await classifyAndStructure(text);
}

export async function extractFromText(text: string): Promise<ExtractionResult> {
  return await classifyAndStructure(text);
}

async function classifyAndStructure(text: string): Promise<ExtractionResult> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `${EXTRACTION_PROMPT}\n\nDocument content:\n\n${text}`,
      },
    ],
  });

  return parseExtractionResponse(response);
}

function parseExtractionResponse(response: Anthropic.Message): ExtractionResult {
  const content = response.content[0];

  if (content.type !== 'text') {
    return { text: '', fileType: 'unknown' };
  }

  try {
    // Try to parse as JSON
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        text: parsed.extractedText || content.text,
        structured: parsed.structured,
        fileType: parsed.fileType || 'unknown',
      };
    }
  } catch (e) {
    // JSON parsing failed, use raw text
  }

  return {
    text: content.text,
    fileType: 'unknown',
  };
}

export async function extractDocument(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ExtractionResult> {
  // Handle by mime type
  if (mimeType.startsWith('image/')) {
    return extractFromImage(
      fileBuffer,
      mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    );
  }

  if (mimeType === 'application/pdf') {
    return extractFromPdf(fileBuffer);
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileName.endsWith('.docx')) {
    return extractFromDocx(fileBuffer);
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel' ||
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls')) {
    return extractFromExcel(fileBuffer);
  }

  // Default: treat as text
  const text = fileBuffer.toString('utf-8');
  return extractFromText(text);
}

export function getMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();

  const mimeTypes: Record<string, string> = {
    'txt': 'text/plain',
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc': 'application/msword',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'xls': 'application/vnd.ms-excel',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'csv': 'text/csv',
    'json': 'application/json',
  };

  return mimeTypes[ext || ''] || 'text/plain';
}
