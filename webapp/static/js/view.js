/**
 * view.js — visualization view page
 */

import { showToast } from './app.js';

const { fileId, initialHtml, chatHistory, initialPrompt, canEdit } = window.VIEW_DATA;

const vizFrame    = document.getElementById('viz-frame');
const vizEmpty    = document.getElementById('viz-empty');
const vizLoading  = document.getElementById('viz-loading');
const chatPanel   = document.getElementById('chat-panel');
const chatOpen    = document.getElementById('chat-open');
const chatClose   = document.getElementById('chat-close');
const chatMessages = document.getElementById('chat-messages');
const chatInput   = document.getElementById('chat-input');
const chatSend    = document.getElementById('chat-send');
const sourcesToggle = document.getElementById('sources-toggle');
const sourcesDrawer = document.getElementById('sources-drawer');

let currentHtml  = initialHtml || '';
let history      = chatHistory || [];
let isLoading    = false;
let abortCtrl    = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

// Render initial visualization
if (currentHtml) {
  setVisualization(currentHtml);
} else {
  vizEmpty.classList.remove('hidden');
}

// Render existing chat history
history.forEach(msg => addMessage(msg.role, msg.content, false));

// Auto-send initial prompt if no viz yet
if (initialPrompt && !currentHtml && canEdit) {
  chatInput.value = initialPrompt;
  sendMessage();
}

// Scroll chat to bottom
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

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  if (e.key === 'Escape' && isLoading)  { abortCtrl?.abort(); }
});

async function sendMessage() {
  const message = chatInput.value.trim();
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

    addMessage('assistant', data.message);
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: data.message });

    if (data.html) {
      currentHtml = data.html;
      setVisualization(data.html);
    }
  } catch (err) {
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
// Helpers
// ---------------------------------------------------------------------------

function setVisualization(html) {
  vizEmpty.classList.add('hidden');
  vizFrame.srcdoc = html;
}

function setLoading(active) {
  isLoading = active;
  chatSend.disabled = active;
  chatInput.disabled = active;
  vizLoading.classList.toggle('hidden', !active);
}

function addMessage(role, content, scroll = true) {
  const div = document.createElement('div');
  div.className = role === 'user' ? 'chat-msg-user' : 'chat-msg-assistant';
  div.textContent = content;
  chatMessages.appendChild(div);
  if (scroll) chatMessages.scrollTop = chatMessages.scrollHeight;
}
