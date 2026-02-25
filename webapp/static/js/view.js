/**
 * view.js — visualization view page
 */

import { showToast } from './app.js';

const { fileId, initialHtml, chatHistory, initialPrompt, canEdit } = window.VIEW_DATA;

const vizPanel      = document.getElementById('viz-panel');
const vizFrame      = document.getElementById('viz-frame');
const vizEmpty      = document.getElementById('viz-empty');
const vizLoading    = document.getElementById('viz-loading');
const vizDropOverlay = document.getElementById('viz-drop-overlay');
const chatPanel     = document.getElementById('chat-panel');
const chatOpen      = document.getElementById('chat-open');
const chatClose     = document.getElementById('chat-close');
const chatMessages  = document.getElementById('chat-messages');
const chatInput     = document.getElementById('chat-input');
const chatSend      = document.getElementById('chat-send');
const chatStop      = document.getElementById('chat-stop');
const sourcesToggle = document.getElementById('sources-toggle');
const sourcesDrawer = document.getElementById('sources-drawer');
const sourcesLabel  = document.getElementById('sources-label');

let currentHtml  = initialHtml || '';
let history      = chatHistory || [];
let isLoading    = false;
let abortCtrl    = null;
let typingEl     = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

if (currentHtml) {
  setVisualization(currentHtml);
} else {
  vizEmpty.classList.remove('hidden');
}

history.forEach(msg => addMessage(msg.role, msg.content, false));

if (initialPrompt && !currentHtml && canEdit) {
  chatInput.value = initialPrompt;
  sendMessage();
}

chatMessages.scrollTop = chatMessages.scrollHeight;

// ---------------------------------------------------------------------------
// Chat sidebar toggle
// ---------------------------------------------------------------------------

chatClose.addEventListener('click', () => setChatOpen(false));
chatOpen.addEventListener('click',  () => setChatOpen(true));

function setChatOpen(open) {
  chatPanel.classList.toggle('hidden', !open);
  chatOpen.classList.toggle('hidden', open);
}

// ---------------------------------------------------------------------------
// Sources drawer
// ---------------------------------------------------------------------------

sourcesToggle?.addEventListener('click', () => {
  sourcesDrawer.classList.toggle('hidden');
});

// ---------------------------------------------------------------------------
// Chat send
// ---------------------------------------------------------------------------

chatSend.addEventListener('click', sendMessage);
chatStop.addEventListener('click', () => abortCtrl?.abort());

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  if (e.key === 'Escape' && isLoading)  { abortCtrl?.abort(); }
});

async function sendMessage(message) {
  if (typeof message !== 'string') message = chatInput.value.trim();
  if (!message || isLoading) return;

  chatInput.value = '';
  addMessage('user', message);
  setLoading(true);

  abortCtrl = new AbortController();

  try {
    const res = await fetch(`/api/chat/${fileId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message, history, currentHtml }),
      signal:  abortCtrl.signal,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    removeTyping();
    addMessage('assistant', data.message);
    history.push({ role: 'user',      content: message });
    history.push({ role: 'assistant', content: data.message });

    if (data.html) {
      currentHtml = data.html;
      setVisualization(data.html);
    }
  } catch (err) {
    removeTyping();
    if (err.name !== 'AbortError') {
      addMessage('assistant', `Error: ${err.message}`);
      showToast(err.message, 'error');
    }
  } finally {
    setLoading(false);
    abortCtrl = null;
  }
}

// ---------------------------------------------------------------------------
// Drag-and-drop files onto viz panel → add to existing document
// ---------------------------------------------------------------------------

if (canEdit) {
  let dragCounter = 0; // track nested dragenter/dragleave

  vizPanel.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounter++;
    vizDropOverlay.classList.remove('hidden');
  });

  vizPanel.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      vizDropOverlay.classList.add('hidden');
    }
  });

  vizPanel.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault();
  });

  vizPanel.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    vizDropOverlay.classList.add('hidden');
    const files = e.dataTransfer.files;
    if (files.length) addFilesToDocument(files);
  });
}

async function addFilesToDocument(files) {
  setUploading(true);

  const formData = new FormData();
  for (const f of files) formData.append('file', f);
  formData.append('documentId', fileId);

  try {
    const res = await fetch('/api/files', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    // Update sources drawer and label
    const names = (data.sourceFiles || []).map(f => f.original_name);
    if (names.length) {
      updateSourcesUI(names);
      // Auto-send incorporation message
      const msg = `New data added: ${names.join(', ')}. Please incorporate this into the existing visualization.`;
      await sendMessage(msg);
    }
    showToast(`Added ${files.length} file${files.length > 1 ? 's' : ''}`);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setUploading(false);
  }
}

function updateSourcesUI(newFileNames) {
  // Add chips to drawer
  const chipsContainer = sourcesDrawer?.querySelector('.flex');
  if (chipsContainer) {
    // Remove "no source files" placeholder if present
    const placeholder = chipsContainer.querySelector('span.text-gray-400');
    if (placeholder) placeholder.remove();

    newFileNames.forEach(name => {
      const chip = document.createElement('span');
      chip.className = 'inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs px-2 py-1 rounded-full';
      chip.textContent = name;
      chipsContainer.appendChild(chip);
    });
  }

  // Update the count label
  if (sourcesLabel) {
    const current = parseInt(sourcesLabel.dataset.count || sourcesLabel.textContent) || 0;
    const total = current + newFileNames.length;
    sourcesLabel.dataset.count = total;
    sourcesLabel.textContent = `${total} source${total !== 1 ? 's' : ''}`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setVisualization(html) {
  vizEmpty.classList.add('hidden');
  vizFrame.srcdoc = html;
}

function setLoading(active) {
  isLoading = active;
  chatSend.classList.toggle('hidden', active);
  chatStop.classList.toggle('hidden', !active);
  chatInput.disabled = active;
  vizLoading.classList.toggle('hidden', !active);
  if (active) showTyping();
}

function setUploading(active) {
  // Reuse the viz loading overlay for upload state
  vizLoading.classList.toggle('hidden', !active);
  const label = vizLoading.querySelector('p');
  if (label) label.textContent = active ? 'Uploading files…' : 'Generating visualization…';
}

function showTyping() {
  typingEl = document.createElement('div');
  typingEl.className = 'chat-msg-assistant chat-typing';
  typingEl.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  chatMessages.appendChild(typingEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTyping() {
  typingEl?.remove();
  typingEl = null;
}

function addMessage(role, content, scroll = true) {
  const div = document.createElement('div');
  div.className = role === 'user' ? 'chat-msg-user' : 'chat-msg-assistant';
  div.textContent = content;
  chatMessages.appendChild(div);
  if (scroll) chatMessages.scrollTop = chatMessages.scrollHeight;
}
