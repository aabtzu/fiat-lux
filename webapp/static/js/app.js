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
 * Show a styled confirm dialog matching the rest of the app's modals.
 * Returns a Promise that resolves true if the user confirms, false otherwise.
 *
 * Options:
 *   title       — heading text (default: "Are you sure?")
 *   message     — body text (required)
 *   confirmText — confirm button label (default: "Confirm")
 *   cancelText  — cancel button label (default: "Cancel")
 *   danger      — if true, confirm button uses red styling (for destructive actions)
 */
export function showConfirm(message, options = {}) {
  const {
    title       = 'Are you sure?',
    confirmText = 'Confirm',
    cancelText  = 'Cancel',
    danger      = false,
  } = options;

  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-50 flex items-center justify-center px-4';
    wrap.innerHTML = `
      <div class="absolute inset-0 bg-black bg-opacity-40" data-role="backdrop"></div>
      <div class="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-2">${escapeHtml(title)}</h2>
        <p class="text-sm text-gray-600 mb-5">${escapeHtml(message)}</p>
        <div class="flex justify-end gap-2">
          <button data-role="cancel"
                  class="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition">
            ${escapeHtml(cancelText)}
          </button>
          <button data-role="confirm"
                  class="px-4 py-1.5 ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'} text-white rounded-lg text-sm font-medium transition">
            ${escapeHtml(confirmText)}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    const close = (value) => {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter')  close(true);
    };

    wrap.querySelector('[data-role="confirm"]').addEventListener('click', () => close(true));
    wrap.querySelector('[data-role="cancel"]').addEventListener('click',  () => close(false));
    wrap.querySelector('[data-role="backdrop"]').addEventListener('click', () => close(false));
    document.addEventListener('keydown', onKey);

    wrap.querySelector('[data-role="confirm"]').focus();
  });
}

/**
 * Show a styled text-input modal with optional autocomplete suggestions.
 * Returns a Promise that resolves to the entered string, or null if cancelled.
 *
 * Options:
 *   title       — heading text (default: "Enter a value")
 *   message     — body / hint text under the heading
 *   placeholder — input placeholder
 *   defaultValue — pre-filled value
 *   suggestions — array of strings (rendered as a datalist for autocomplete + chips for one-click)
 *   confirmText, cancelText — button labels
 *   allowEmpty  — if true, empty string is a valid result (default: false)
 */
export function showInput(options = {}) {
  const {
    title       = 'Enter a value',
    message     = '',
    placeholder = '',
    defaultValue = '',
    suggestions = [],
    confirmText = 'Save',
    cancelText  = 'Cancel',
    allowEmpty  = false,
  } = options;

  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-50 flex items-center justify-center px-4';

    const chips = suggestions.length
      ? `<div class="flex flex-wrap gap-1.5 mb-3">
          ${suggestions.map(s => `<button type="button" data-suggest="${escapeHtml(s)}"
              class="suggestion-chip px-2 py-1 text-xs rounded-full bg-amber-50 text-amber-700
                     border border-amber-200 hover:bg-amber-100 transition">
              ${escapeHtml(s)}
            </button>`).join('')}
        </div>`
      : '';

    wrap.innerHTML = `
      <div class="absolute inset-0 bg-black bg-opacity-40" data-role="backdrop"></div>
      <div class="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-1">${escapeHtml(title)}</h2>
        ${message ? `<p class="text-sm text-gray-500 mb-3">${escapeHtml(message)}</p>` : ''}
        ${chips}
        <input type="text" data-role="input"
               value="${escapeHtml(defaultValue)}"
               placeholder="${escapeHtml(placeholder)}"
               class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                      focus:ring-2 focus:ring-amber-400 focus:border-transparent outline-none">
        <div class="flex justify-end gap-2 mt-4">
          <button data-role="cancel"
                  class="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition">
            ${escapeHtml(cancelText)}
          </button>
          <button data-role="confirm"
                  class="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition">
            ${escapeHtml(confirmText)}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    const input = wrap.querySelector('[data-role="input"]');

    const close = (value) => {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const submit = () => {
      const value = input.value.trim();
      if (!value && !allowEmpty) return;
      close(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter' && document.activeElement === input) {
        e.preventDefault();
        submit();
      }
    };

    wrap.querySelector('[data-role="confirm"]').addEventListener('click', submit);
    wrap.querySelector('[data-role="cancel"]').addEventListener('click',  () => close(null));
    wrap.querySelector('[data-role="backdrop"]').addEventListener('click', () => close(null));
    wrap.querySelectorAll('.suggestion-chip').forEach(c => {
      c.addEventListener('click', () => {
        input.value = c.dataset.suggest;
        input.focus();
      });
    });
    document.addEventListener('keydown', onKey);

    input.focus();
    input.select();
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
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
