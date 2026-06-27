"""
URL fetching and text extraction for Fiat Lux.

Handles:
  Google Docs (public)  — export as plain text via /export?format=txt
  Generic web pages     — trafilatura article extraction
  Plain text URLs       — returned as-is

Security: resolves hostname to IP before request to block SSRF against
private/loopback networks.
"""

import ipaddress
import logging
import re
import socket
from urllib.parse import urlparse

import requests
import trafilatura

logger = logging.getLogger(__name__)

_FETCH_TIMEOUT = 15
_MAX_BYTES = 5 * 1024 * 1024  # 5 MB

_PRIVATE_NETWORKS = [
    ipaddress.ip_network('10.0.0.0/8'),
    ipaddress.ip_network('172.16.0.0/12'),
    ipaddress.ip_network('192.168.0.0/16'),
    ipaddress.ip_network('127.0.0.0/8'),
    ipaddress.ip_network('169.254.0.0/16'),
    ipaddress.ip_network('100.64.0.0/10'),
    ipaddress.ip_network('::1/128'),
    ipaddress.ip_network('fc00::/7'),
    ipaddress.ip_network('fe80::/10'),
]

_GDOC_RE = re.compile(
    r'docs\.google\.com/document/d/([A-Za-z0-9_-]+)'
)
_GSHEET_RE = re.compile(
    r'docs\.google\.com/spreadsheets/d/([A-Za-z0-9_-]+)'
)

_HEADERS = {
    'User-Agent': 'FiatLux/1.0 (document import; +https://fiatlux.ai)',
    'Accept': 'text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
}


def _is_safe_url(url: str) -> tuple[bool, str]:
    """Return (safe, reason). Resolves hostname to block private IPs."""
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        return False, 'Only http:// and https:// URLs are supported.'
    host = parsed.hostname
    if not host:
        return False, 'Could not parse hostname from URL.'
    try:
        addrs = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False, f'Could not resolve hostname: {host}'
    for info in addrs:
        try:
            ip = ipaddress.ip_address(info[4][0])
            if any(ip in net for net in _PRIVATE_NETWORKS):
                return False, 'URL resolves to a private or internal address.'
        except ValueError:
            pass
    return True, ''


def _google_doc_export_url(url: str) -> str | None:
    m = _GDOC_RE.search(url)
    if m:
        return f'https://docs.google.com/document/d/{m.group(1)}/export?format=txt'
    return None


def _google_sheet_export_url(url: str) -> str | None:
    m = _GSHEET_RE.search(url)
    if m:
        return f'https://docs.google.com/spreadsheets/d/{m.group(1)}/export?format=csv'
    return None


def fetch_url(url: str) -> dict:
    """Fetch a URL and return {'text': str, 'title': str, 'source_type': str}.

    source_type ∈ {'gdoc', 'gsheet', 'article', 'text'}

    Raises ValueError with a user-friendly message on failure.
    """
    url = url.strip()
    safe, reason = _is_safe_url(url)
    if not safe:
        raise ValueError(reason)

    # Google Sheets → export as CSV
    gsheet_url = _google_sheet_export_url(url)
    if gsheet_url:
        return _fetch_google_sheet(gsheet_url, url)

    # Google Docs → export as plain text
    gdoc_url = _google_doc_export_url(url)
    if gdoc_url:
        return _fetch_google_doc(gdoc_url, url)

    # Generic URL
    return _fetch_webpage(url)


def _fetch_google_doc(export_url: str, original_url: str) -> dict:
    try:
        resp = requests.get(export_url, timeout=_FETCH_TIMEOUT, headers=_HEADERS)
    except requests.RequestException as e:
        raise ValueError(f'Could not fetch Google Doc: {e}') from e

    if resp.status_code == 403 or (
        '<html' in resp.text[:500].lower() and 'sign in' in resp.text[:2000].lower()
    ):
        raise ValueError(
            'This Google Doc is private. Open the doc, click Share → '
            '"Anyone with the link" → Viewer, then try again.'
        )
    if not resp.ok:
        raise ValueError(f'Google Docs returned HTTP {resp.status_code}.')

    text = resp.text[:_MAX_BYTES]
    title = _title_from_url(original_url) or 'Google Doc'
    return {'text': text, 'title': title, 'source_type': 'gdoc'}


def _fetch_google_sheet(export_url: str, original_url: str) -> dict:
    try:
        resp = requests.get(export_url, timeout=_FETCH_TIMEOUT, headers=_HEADERS)
    except requests.RequestException as e:
        raise ValueError(f'Could not fetch Google Sheet: {e}') from e

    if resp.status_code == 403 or (
        '<html' in resp.text[:500].lower() and 'sign in' in resp.text[:2000].lower()
    ):
        raise ValueError(
            'This Google Sheet is private. Open the sheet, click Share → '
            '"Anyone with the link" → Viewer, then try again.'
        )
    if not resp.ok:
        raise ValueError(f'Google Sheets returned HTTP {resp.status_code}.')

    text = resp.text[:_MAX_BYTES]
    title = _title_from_url(original_url) or 'Google Sheet'
    return {'text': text, 'title': title, 'source_type': 'gsheet'}


def _fetch_webpage(url: str) -> dict:
    try:
        resp = requests.get(
            url, timeout=_FETCH_TIMEOUT, headers=_HEADERS,
            allow_redirects=True, stream=True,
        )
        content_type = resp.headers.get('content-type', '')
        raw = b''
        for chunk in resp.iter_content(chunk_size=65536):
            raw += chunk
            if len(raw) >= _MAX_BYTES:
                break
        resp.close()
    except requests.RequestException as e:
        raise ValueError(f'Could not fetch URL: {e}') from e

    if not resp.ok:
        raise ValueError(f'The URL returned HTTP {resp.status_code}.')

    if 'text/plain' in content_type:
        return {
            'text': raw.decode('utf-8', errors='replace'),
            'title': _title_from_url(url),
            'source_type': 'text',
        }

    html = raw.decode('utf-8', errors='replace')
    text = trafilatura.extract(
        html,
        include_comments=False,
        include_tables=True,
        no_fallback=False,
    )
    if not text or len(text.strip()) < 100:
        raise ValueError(
            'Could not extract readable text from this page. '
            'It may require login, be mostly images, or block automated access.'
        )

    title = trafilatura.extract_metadata(html)
    title = (title.title if title else None) or _title_from_url(url)
    return {'text': text, 'title': title, 'source_type': 'article'}


def _title_from_url(url: str) -> str:
    """Fallback: derive a readable name from the URL path."""
    path = urlparse(url).path.rstrip('/')
    segment = path.split('/')[-1] if path else ''
    # Strip common extensions
    segment = re.sub(r'\.(html?|php|aspx?|jsp)$', '', segment, flags=re.IGNORECASE)
    # Replace separators with spaces, title-case
    name = re.sub(r'[-_]+', ' ', segment).strip().title()
    return name or urlparse(url).netloc
