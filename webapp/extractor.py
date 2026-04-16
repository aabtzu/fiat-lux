"""
Document text extraction for Fiat Lux.

Supports:
  PDF, images (JPG/PNG/GIF/WEBP) → Claude API
  DOCX                            → python-docx (optional, falls back to text)
  XLSX / XLS / CSV                → pandas
  plain text / JSON               → read directly

Returns {'text': str, 'file_type': str}
where file_type ∈ {'schedule', 'invoice', 'healthcare', 'unknown'}
"""

import logging
import os
import re
import json
import base64

logger = logging.getLogger(__name__)

import anthropic

MIME_TYPES = {
    'txt':  'text/plain',
    'pdf':  'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc':  'application/msword',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'xls':  'application/vnd.ms-excel',
    'jpg':  'image/jpeg',
    'jpeg': 'image/jpeg',
    'png':  'image/png',
    'gif':  'image/gif',
    'webp': 'image/webp',
    'csv':  'text/csv',
}

_EXTRACTION_PROMPT = """You are analyzing a document to extract its content.

First, identify the document type with a short label (1-3 words, lowercase).
Use plain descriptive labels like "class schedule", "medical bill", "rental agreement",
"tax return", "bank statement", "purchase invoice", etc.
Use "unknown" only if you truly cannot determine the type.

Then extract ALL the text content, preserving structure as much as possible.
Be thorough — include every item, every row, every entry. Do not summarize or skip anything.

Also extract:
- "tableData": if the document contains tabular data (tables, itemized lists, structured records
  with consistent columns), extract every row as a JSON array of objects.
  Use consistent, short snake_case keys derived from the column headers.
  Set to null if the document has no clear tabular structure.
- "metadata": a flat object of non-tabular header/footer fields — names, IDs, addresses,
  dates, reference numbers, provider info, patient info. Use snake_case keys.
  Set to null if there are no such fields.
- "summary": a flat object of totals, counts, date ranges, or aggregate values stated
  in the document (e.g. total_billed, session_count, date_range). Set to null if none.

Respond in this exact JSON format:
{
  "fileType": "your short label here",
  "extractedText": "the complete extracted text content",
  "tableData": [{"col1": "val1", "col2": "val2"}, ...] or null,
  "metadata": {"provider_name": "...", "patient_name": "..."} or null,
  "summary": {"total_billed": 1050.00, "session_count": 3} or null
}"""


def get_mime_type(filename: str) -> str:
    ext = filename.lower().rsplit('.', 1)[-1] if '.' in filename else ''
    return MIME_TYPES.get(ext, 'text/plain')


def _client() -> anthropic.Anthropic:
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        raise RuntimeError('ANTHROPIC_API_KEY not set')
    return anthropic.Anthropic(api_key=api_key)


def _parse(text: str) -> dict:
    try:
        m = re.search(r'\{[\s\S]*\}', text)
        if m:
            parsed = json.loads(m.group(0))
            ft = (parsed.get('fileType') or 'unknown').strip().lower()
            td = parsed.get('tableData')
            md = parsed.get('metadata')
            sm = parsed.get('summary')
            return {
                'text':       parsed.get('extractedText', text),
                'file_type':  ft or 'unknown',
                'table_data': td if isinstance(td, list) and td else None,
                'metadata':   md if isinstance(md, dict) and md else None,
                'summary':    sm if isinstance(sm, dict) and sm else None,
            }
    except Exception:
        logger.warning('Failed to parse Claude extraction response', exc_info=True)
    return {'text': text, 'file_type': 'unknown', 'table_data': None, 'metadata': None, 'summary': None}


def _via_claude_image(file_bytes: bytes, mime_type: str) -> dict:
    b64 = base64.standard_b64encode(file_bytes).decode()
    resp = _client().messages.create(
        model='claude-sonnet-4-6',
        max_tokens=8192,
        messages=[{'role': 'user', 'content': [
            {'type': 'image', 'source': {'type': 'base64', 'media_type': mime_type, 'data': b64}},
            {'type': 'text', 'text': _EXTRACTION_PROMPT},
        ]}],
    )
    return _parse(resp.content[0].text)


_PDF_CLAUDE_PAGE_LIMIT = 5   # use Claude native PDF for small docs; pypdf for larger ones


def _via_claude_pdf(file_bytes: bytes) -> dict:
    # Check page count cheaply before deciding extraction path
    page_count = _pdf_page_count(file_bytes)
    if page_count > _PDF_CLAUDE_PAGE_LIMIT:
        return _extract_pdf_text_fallback(file_bytes)

    b64 = base64.standard_b64encode(file_bytes).decode()
    try:
        resp = _client().messages.create(
            model='claude-sonnet-4-6',
            max_tokens=8192,
            messages=[{'role': 'user', 'content': [
                {'type': 'document', 'source': {'type': 'base64', 'media_type': 'application/pdf', 'data': b64}},
                {'type': 'text', 'text': _EXTRACTION_PROMPT},
            ]}],
        )
        return _parse(resp.content[0].text)
    except Exception as e:
        if 'pages' in str(e).lower() or '400' in str(e):
            return _extract_pdf_text_fallback(file_bytes)
        raise


def _pdf_page_count(file_bytes: bytes) -> int:
    try:
        from pypdf import PdfReader
        from io import BytesIO
        return len(PdfReader(BytesIO(file_bytes)).pages)
    except Exception:
        return 0


def _extract_pdf_text_fallback(file_bytes: bytes) -> dict:
    """Extract text from PDF using pypdf (no page limit), classify with a short sample."""
    try:
        from pypdf import PdfReader
        from io import BytesIO
        reader = PdfReader(BytesIO(file_bytes))
        pages = [page.extract_text() or '' for page in reader.pages]
        text = '\n\n'.join(f'[Page {i+1}]\n{t}' for i, t in enumerate(pages) if t.strip())
        if not text.strip():
            return {'text': '[No extractable text found in PDF]', 'file_type': 'unknown', 'table_data': None, 'metadata': None, 'summary': None}
        return {'text': text, 'file_type': _classify_type_only(text[:3000]), 'table_data': None, 'metadata': None, 'summary': None}
    except ImportError:
        return {'text': '[pypdf not installed — install it to support large PDFs]', 'file_type': 'unknown', 'table_data': None, 'metadata': None, 'summary': None}


def _classify_type_only(sample: str) -> str:
    """Classify document type from a short text sample. Returns a short lowercase label."""
    try:
        resp = _client().messages.create(
            model='claude-haiku-4-5-20251001',
            max_tokens=32,
            messages=[{'role': 'user', 'content': (
                'What type of document is this? Reply with a short label only '
                '(1-3 words, lowercase) like "medical bill", "class schedule", '
                '"bank statement", "invoice", "contract", or "unknown".\n\n' + sample
            )}],
        )
        return resp.content[0].text.strip().lower()[:50]
    except Exception:
        return 'unknown'


def _df_to_records(df) -> list:
    """Convert DataFrame to JSON-safe records, capped at 5000 rows."""
    import math
    rows = df.head(5000).to_dict(orient='records')
    # Replace NaN/inf with None for JSON safety
    clean = []
    for row in rows:
        clean.append({k: (None if isinstance(v, float) and (math.isnan(v) or math.isinf(v)) else v)
                      for k, v in row.items()})
    return clean


def _classify_text(text: str) -> dict:
    resp = _client().messages.create(
        model='claude-sonnet-4-6',
        max_tokens=8192,
        messages=[{'role': 'user', 'content': f'{_EXTRACTION_PROMPT}\n\nDocument content:\n\n{text}'}],
    )
    return _parse(resp.content[0].text)


def extract_document(file_bytes: bytes, mime_type: str, filename: str) -> dict:
    """
    Extract text and classify a document.
    Returns {'text': str, 'file_type': str}.
    """
    if mime_type.startswith('image/'):
        return _via_claude_image(file_bytes, mime_type)

    if mime_type == 'application/pdf':
        return _via_claude_pdf(file_bytes)

    if (mime_type == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            or filename.lower().endswith('.docx')):
        try:
            from docx import Document
            from io import BytesIO
            doc = Document(BytesIO(file_bytes))
            text = '\n'.join(p.text for p in doc.paragraphs if p.text.strip())
            return _classify_text(text)
        except ImportError:
            pass  # fall through to plain text

    if (mime_type in ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                      'application/vnd.ms-excel')
            or filename.lower().endswith(('.xlsx', '.xls'))):
        import pandas as pd
        from io import BytesIO
        xl = pd.ExcelFile(BytesIO(file_bytes))
        first_df = xl.parse(xl.sheet_names[0])
        parts = [f'=== Sheet: {s} ===\n{xl.parse(s).to_csv(index=False)}' for s in xl.sheet_names]
        result = _classify_text('\n\n'.join(parts))
        result['table_data'] = _df_to_records(first_df)
        return result

    if mime_type == 'text/csv' or filename.lower().endswith('.csv'):
        import pandas as pd
        from io import BytesIO
        df = pd.read_csv(BytesIO(file_bytes))
        result = _classify_text(df.to_csv(index=False))
        result['table_data'] = _df_to_records(df)
        return result

    # Default: plain text
    try:
        text = file_bytes.decode('utf-8')
    except UnicodeDecodeError:
        text = file_bytes.decode('latin-1')
    return _classify_text(text)
