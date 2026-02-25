/**
 * app.js — global utilities loaded on every page
 */

/**
 * POST JSON to a URL and return the parsed response.
 */
export async function postJSON(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

/**
 * Show a temporary toast message at the top of the page.
 */
export function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.className = [
    'fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-lg text-sm shadow-lg transition-opacity duration-300',
    type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200',
  ].join(' ');
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
