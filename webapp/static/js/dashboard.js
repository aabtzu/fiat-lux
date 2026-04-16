/**
 * dashboard.js — upload, delete, rename
 */

import { postJSON, showToast } from './app.js';

const uploadArea   = document.getElementById('upload-area');
const fileInput    = document.getElementById('file-input');
const uploadIdle   = document.getElementById('upload-idle');
const uploadProgress = document.getElementById('upload-progress');
const uploadStatus = document.getElementById('upload-status');
const fileList     = document.getElementById('file-list');

// ---------------------------------------------------------------------------
// Tabs (owned / shared)
// ---------------------------------------------------------------------------

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => {
      const active = b.dataset.tab === tab;
      b.classList.toggle('text-amber-600', active);
      b.classList.toggle('border-amber-500', active);
      b.classList.toggle('text-gray-400', !active);
      b.classList.toggle('border-transparent', !active);
    });
    document.getElementById('panel-owned').classList.toggle('hidden', tab !== 'owned');
    document.getElementById('panel-shared').classList.toggle('hidden', tab !== 'shared');
  });
});

// Modal elements
const uploadModal    = document.getElementById('upload-modal');
const modalBackdrop  = document.getElementById('modal-backdrop');
const modalName      = document.getElementById('modal-name');
const modalPrompt    = document.getElementById('modal-prompt');
const modalFileChips = document.getElementById('modal-file-chips');
const modalMultiHint = document.getElementById('modal-multi-hint');
const modalCancel    = document.getElementById('modal-cancel');
const modalUpload    = document.getElementById('modal-upload');

let pendingFiles = null;

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

uploadArea.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) openModal(fileInput.files);
});

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});
['dragleave', 'drop'].forEach((evt) =>
  uploadArea.addEventListener(evt, () => uploadArea.classList.remove('drag-over'))
);
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files.length) openModal(e.dataTransfer.files);
});

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

function openModal(files) {
  pendingFiles = files;

  // Pre-fill name from the first file (best guess for any count)
  const firstName = files[0].name;
  modalName.value = firstName.includes('.') ? firstName.slice(0, firstName.lastIndexOf('.')) : firstName;

  // Render file chips
  modalFileChips.innerHTML = Array.from(files).map(f =>
    `<span class="file-chip">${escHtml(f.name)}</span>`
  ).join('');

  // Show multi-file hint when more than one file
  modalMultiHint.classList.toggle('hidden', files.length <= 1);

  modalPrompt.value = '';
  uploadModal.classList.remove('hidden');
  modalName.focus();
  modalName.select();
}

function closeModal() {
  uploadModal.classList.add('hidden');
  pendingFiles = null;
  fileInput.value = '';
}

modalCancel.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !uploadModal.classList.contains('hidden')) closeModal();
});

modalUpload.addEventListener('click', async () => {
  if (!pendingFiles) return;
  const files = Array.from(pendingFiles);  // copy before closeModal clears fileInput
  const displayName = modalName.value.trim();
  const initialPrompt = modalPrompt.value.trim();
  closeModal();
  await handleUpload(files, displayName, initialPrompt);
});

// Allow Enter in name field to submit
modalName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); modalUpload.click(); }
});

async function handleUpload(files, displayName = '', initialPrompt = '') {
  setUploading(true);

  const formData = new FormData();
  for (const f of files) formData.append('file', f);
  if (displayName)   formData.append('displayName', displayName);
  if (initialPrompt) formData.append('initialPrompt', initialPrompt);

  try {
    const res = await fetch('/api/files', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    prependFileCard(data);
    showToast('File uploaded successfully');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setUploading(false);
    fileInput.value = '';
  }
}

function setUploading(active) {
  uploadIdle.classList.toggle('hidden', active);
  uploadProgress.classList.toggle('hidden', !active);
  uploadArea.style.pointerEvents = active ? 'none' : '';
}

// ---------------------------------------------------------------------------
// File card helpers
// ---------------------------------------------------------------------------

const _BADGE_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
];

function badgeClass(type) {
  if (!type || type === 'unknown') return 'bg-gray-100 text-gray-500';
  let h = 0;
  for (const ch of type) h = (h * 31 + ch.charCodeAt(0)) & 0xFFFF;
  return _BADGE_COLORS[h % _BADGE_COLORS.length];
}

function prependFileCard(file) {
  // Remove empty state if present
  const empty = document.getElementById('empty-state');
  if (empty) empty.remove();

  // Ensure cards container exists
  let cards = document.getElementById('file-cards');
  if (!cards) {
    cards = document.createElement('div');
    cards.id = 'file-cards';
    cards.className = 'space-y-3';
    fileList.appendChild(cards);
  }

  const card = buildCard(file);
  cards.prepend(card);
  attachCardListeners(card);
}

function buildCard(file) {
  const date = (file.imported_at || '').slice(0, 10) || '—';
  const type = file.file_type || 'unknown';

  const div = document.createElement('div');
  div.className = 'file-card';
  div.dataset.id = file.id;
  div.innerHTML = `
    <div class="flex items-center gap-3">
      <span class="file-type-badge ${badgeClass(type)}">${type}</span>
      <div>
        <p class="file-name font-medium text-gray-800" title="Double-click to rename">${escHtml(file.display_name)}</p>
        <p class="text-xs text-gray-400">${escHtml(file.original_name)} · ${date}</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <a href="/view/${file.id}" class="text-sm text-blue-500 hover:text-blue-600 font-medium">Open</a>
      <button class="duplicate-btn text-gray-300 hover:text-amber-400 transition" data-id="${file.id}" title="Duplicate (new data)">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
        </svg>
      </button>
      <button class="delete-btn text-gray-300 hover:text-red-400 transition" data-id="${file.id}" title="Delete">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
      </button>
    </div>`;
  return div;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Delete (event delegation on file-list)
// ---------------------------------------------------------------------------

fileList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.delete-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  if (!confirm('Delete this file?')) return;

  try {
    const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    const card = fileList.querySelector(`.file-card[data-id="${id}"]`);
    card?.remove();
    if (!document.querySelector('.file-card')) showEmptyState();
    showToast('File deleted');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ---------------------------------------------------------------------------
// Duplicate (event delegation on file-list)
// ---------------------------------------------------------------------------

fileList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.duplicate-btn');
  if (!btn) return;
  const id = btn.dataset.id;

  try {
    btn.disabled = true;
    const res = await fetch(`/api/files/${id}/duplicate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    prependFileCard({ ...data, imported_at: new Date().toISOString() });
    showToast('Duplicated — drop new files to replace data');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

function showEmptyState() {
  const cards = document.getElementById('file-cards');
  if (cards) cards.remove();
  const empty = document.createElement('div');
  empty.id = 'empty-state';
  empty.className = 'empty-state';
  empty.textContent = 'No files yet. Upload your first document to get started.';
  fileList.appendChild(empty);
}

// ---------------------------------------------------------------------------
// Rename (double-click on name)
// ---------------------------------------------------------------------------

fileList.addEventListener('dblclick', (e) => {
  const nameEl = e.target.closest('.file-name');
  if (!nameEl || nameEl.contentEditable === 'true') return;
  const card = nameEl.closest('.file-card');
  if (!card) return;
  startRename(nameEl, card.dataset.id);
});

function startRename(el, id) {
  const original = el.textContent;
  el.contentEditable = 'true';
  el.classList.add('outline', 'outline-2', 'outline-blue-400', 'rounded', 'px-1');
  el.focus();

  const finish = async () => {
    el.contentEditable = 'false';
    el.classList.remove('outline', 'outline-2', 'outline-blue-400', 'rounded', 'px-1');
    const newName = el.textContent.trim();
    if (!newName || newName === original) { el.textContent = original; return; }

    try {
      const res = await fetch(`/api/files/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: newName }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      showToast('Renamed');
    } catch (err) {
      el.textContent = original;
      showToast(err.message, 'error');
    }
  };

  el.addEventListener('blur', finish, { once: true });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { el.textContent = original; el.blur(); }
  }, { once: true });
}

// Attach listeners to server-rendered cards (for future use — currently using delegation)
function attachCardListeners(card) {
  // Delegation handles everything; this is a no-op hook for extensions
}
