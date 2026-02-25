/**
 * share.js — share dialog for the view page
 */

import { showToast } from './app.js';

const modal        = document.getElementById('share-modal');
const backdrop     = document.getElementById('share-backdrop');
const closeBtn     = document.getElementById('share-close');
const docNameEl    = document.getElementById('share-doc-name');
const tabBtns      = document.querySelectorAll('.share-tab-btn');
const tabLink      = document.getElementById('share-tab-link');
const tabPeople    = document.getElementById('share-tab-people');

// Link tab
const linkLoading  = document.getElementById('share-link-loading');
const linkArea     = document.getElementById('share-link-area');
const linkInput    = document.getElementById('share-link-input');
const linkCopy     = document.getElementById('share-link-copy');
const createLink   = document.getElementById('share-create-link');
const linkList     = document.getElementById('share-link-list');

// People tab
const emailInput   = document.getElementById('share-email-input');
const suggestions  = document.getElementById('share-suggestions');
const inviteBtn    = document.getElementById('share-invite-btn');
const peopleList   = document.getElementById('share-people-list');

let fileId   = null;
let fileName = null;

// ---------------------------------------------------------------------------
// Open / close
// ---------------------------------------------------------------------------

// Triggered from view page Share button
document.getElementById('share-btn')?.addEventListener('click', (e) => {
  const btn = e.currentTarget;
  fileId   = btn.dataset.id;
  fileName = btn.dataset.name;
  openModal();
});

// Triggered from dashboard file card share buttons (event delegation)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.share-btn');
  if (!btn) return;
  fileId   = btn.dataset.id;
  fileName = btn.dataset.name;
  openModal();
});

function openModal() {
  docNameEl.textContent = fileName;
  resetModal();
  modal.classList.remove('hidden');
  loadShares();
}

function closeModal() {
  modal.classList.add('hidden');
  fileId = null;
}

closeBtn.addEventListener('click', closeModal);
backdrop.addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
});

function resetModal() {
  switchTab('link');
  linkArea.classList.add('hidden');
  linkList.innerHTML = '';
  peopleList.innerHTML = '';
  emailInput.value = '';
  suggestions.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

function switchTab(tab) {
  tabLink.classList.toggle('hidden', tab !== 'link');
  tabPeople.classList.toggle('hidden', tab !== 'people');
  tabBtns.forEach(b => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('text-amber-600', active);
    b.classList.toggle('border-amber-500', active);
    b.classList.toggle('text-gray-400', !active);
    b.classList.toggle('border-transparent', !active);
  });
}

// ---------------------------------------------------------------------------
// Load existing shares
// ---------------------------------------------------------------------------

async function loadShares() {
  if (!fileId) return;
  try {
    const res  = await fetch(`/api/shares/${fileId}`);
    const list = await res.json();
    renderShares(list);
  } catch (_) {}
}

function renderShares(list) {
  const links  = list.filter(s => s.share_type === 'link');
  const people = list.filter(s => s.share_type === 'user');

  // Link shares
  linkList.innerHTML = links.map(s => shareRow(s)).join('');
  if (links.length > 0) {
    // Show the most recent link in the copy area
    const token = links[0].share_token;
    showLink(token);
    createLink.classList.add('hidden');
  } else {
    createLink.classList.remove('hidden');
  }

  // User shares
  peopleList.innerHTML = people.map(s => shareRow(s)).join('');

  // Attach revoke listeners
  [...linkList.querySelectorAll('.revoke-btn'),
   ...peopleList.querySelectorAll('.revoke-btn')].forEach(btn => {
    btn.addEventListener('click', () => revokeShare(btn.dataset.id, btn.closest('.share-row')));
  });
}

function shareRow(s) {
  const label = s.share_type === 'link'
    ? `Link · ${s.created_at?.slice(0, 10) || ''}`
    : `${s.shared_with_email}${s.shared_with_name ? ` (${s.shared_with_name})` : ''}`;
  return `
    <div class="share-row flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50">
      <span class="text-xs text-gray-600 truncate">${escHtml(label)}</span>
      <button class="revoke-btn text-xs text-red-400 hover:text-red-600 ml-2 flex-shrink-0"
              data-id="${s.id}">Revoke</button>
    </div>`;
}

// ---------------------------------------------------------------------------
// Create link share
// ---------------------------------------------------------------------------

createLink.addEventListener('click', async () => {
  linkLoading.classList.remove('hidden');
  createLink.classList.add('hidden');
  try {
    const res  = await fetch(`/api/shares/${fileId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareType: 'link' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showLink(data.share_token);
    loadShares();
  } catch (err) {
    showToast(err.message, 'error');
    createLink.classList.remove('hidden');
  } finally {
    linkLoading.classList.add('hidden');
  }
});

function showLink(token) {
  const url = `${location.origin}/shared/${token}`;
  linkInput.value = url;
  linkArea.classList.remove('hidden');
}

linkCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(linkInput.value).then(() => {
    linkCopy.textContent = 'Copied!';
    setTimeout(() => { linkCopy.textContent = 'Copy'; }, 2000);
  });
});

// ---------------------------------------------------------------------------
// User share + autocomplete
// ---------------------------------------------------------------------------

let suggestTimer = null;

emailInput.addEventListener('input', () => {
  clearTimeout(suggestTimer);
  const q = emailInput.value.trim();
  if (q.length < 2) { suggestions.classList.add('hidden'); return; }
  suggestTimer = setTimeout(() => fetchSuggestions(q), 200);
});

emailInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') suggestions.classList.add('hidden');
  if (e.key === 'Enter')  { e.preventDefault(); inviteBtn.click(); }
});

async function fetchSuggestions(q) {
  try {
    const res  = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
    const list = await res.json();
    if (!list.length) { suggestions.classList.add('hidden'); return; }
    suggestions.innerHTML = list.map(u =>
      `<button class="suggest-item w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition"
               data-email="${escHtml(u.email)}">
         <span class="font-medium">${escHtml(u.email)}</span>
         ${u.display_name ? `<span class="text-gray-400 ml-1 text-xs">${escHtml(u.display_name)}</span>` : ''}
       </button>`
    ).join('');
    suggestions.classList.remove('hidden');
    suggestions.querySelectorAll('.suggest-item').forEach(btn => {
      btn.addEventListener('click', () => {
        emailInput.value = btn.dataset.email;
        suggestions.classList.add('hidden');
      });
    });
  } catch (_) {}
}

document.addEventListener('click', (e) => {
  if (!emailInput.contains(e.target) && !suggestions.contains(e.target)) {
    suggestions.classList.add('hidden');
  }
});

inviteBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  if (!email) return;
  inviteBtn.disabled = true;
  try {
    const res  = await fetch(`/api/shares/${fileId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareType: 'user', email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    emailInput.value = '';
    showToast(`Shared with ${email}`);
    loadShares();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    inviteBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

async function revokeShare(shareId, row) {
  try {
    const res = await fetch(`/api/shares/revoke/${shareId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error);
    row.remove();
    showToast('Share revoked');
    // Re-check if no links remain
    if (!linkList.querySelector('.share-row')) {
      linkArea.classList.add('hidden');
      createLink.classList.remove('hidden');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
