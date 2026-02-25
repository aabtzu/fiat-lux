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

import os
import re
import json
import base64

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

Respond in this exact JSON format:
{
  "fileType": "your short label here",
  "extractedText": "the complete extracted text content"
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
            return {
                'text': parsed.get('extractedText', text),
                'file_type': ft or 'unknown',
            }
    except Exception:
        pass
    return {'text': text, 'file_type': 'unknown'}


def _via_claude_image(file_bytes: bytes, mime_type: str) -> dict:
    b64 = base64.standard_b64encode(file_bytes).decode()
    resp = _client().messages.create(
        model='claude-sonnet-4-6',
        max_tokens=4096,
        messages=[{'role': 'user', 'content': [
            {'type': 'image', 'source': {'type': 'base64', 'media_type': mime_type, 'data': b64}},
            {'type': 'text', 'text': _EXTRACTION_PROMPT},
        ]}],
    )
    return _parse(resp.content[0].text)


def _via_claude_pdf(file_bytes: bytes) -> dict:
    b64 = base64.standard_b64encode(file_bytes).decode()
    try:
        resp = _client().messages.create(
            model='claude-sonnet-4-6',
            max_tokens=4096,
            messages=[{'role': 'user', 'content': [
                {'type': 'document', 'source': {'type': 'base64', 'media_type': 'application/pdf', 'data': b64}},
                {'type': 'text', 'text': _EXTRACTION_PROMPT},
            ]}],
        )
        return _parse(resp.content[0].text)
    except Exception as e:
        # Fall back to text extraction if PDF is too large or unsupported
        if 'pages' in str(e).lower() or '400' in str(e):
            return _extract_pdf_text_fallback(file_bytes)
        raise


def _extract_pdf_text_fallback(file_bytes: bytes) -> dict:
    """Extract text from PDF using pypdf (no page limit)."""
    try:
        from pypdf import PdfReader
        from io import BytesIO
        reader = PdfReader(BytesIO(file_bytes))
        pages = [page.extract_text() or '' for page in reader.pages]
        text = '\n\n'.join(f'[Page {i+1}]\n{t}' for i, t in enumerate(pages) if t.strip())
        return _classify_text(text or '[No extractable text found in PDF]')
    except ImportError:
        return {'text': '[pypdf not installed — install it to support large PDFs]', 'file_type': 'unknown'}


def _classify_text(text: str) -> dict:
    resp = _client().messages.create(
        model='claude-sonnet-4-6',
        max_tokens=4096,
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
        parts = [f'=== Sheet: {s} ===\n{xl.parse(s).to_csv(index=False)}' for s in xl.sheet_names]
        return _classify_text('\n\n'.join(parts))

    if mime_type == 'text/csv' or filename.lower().endswith('.csv'):
        import pandas as pd
        from io import BytesIO
        df = pd.read_csv(BytesIO(file_bytes))
        return _classify_text(df.to_csv(index=False))

    # Default: plain text
    try:
        text = file_bytes.decode('utf-8')
    except UnicodeDecodeError:
        text = file_bytes.decode('latin-1')
    return _classify_text(text)
