/**
 * view.js — visualization view page
 */

import { showToast } from './app.js';

const { fileId, initialHtml, chatHistory, initialPrompt, canEdit } = window.VIEW_DATA;

// Injected into every visualization so the sandboxed iframe can:
//  1. relay dragover → parent shows amber overlay
//  2. handle the actual drop → read files as ArrayBuffers → transfer to parent
const DRAG_BRIDGE = '<scr' + 'ipt>' +
  'function _flHasFiles(dt){return dt&&[].indexOf.call(dt.types,"Files")>=0;}' +
  'document.addEventListener("dragover",function(e){' +
    'if(_flHasFiles(e.dataTransfer)){e.preventDefault();window.parent.postMessage({type:"fl-dragover"},"*");}' +
  '});' +
  'document.addEventListener("drop",function(e){' +
    'e.preventDefault();' +
    'var fs=e.dataTransfer.files;if(!fs.length)return;' +
    'var infos=[],pending=fs.length;' +
    'for(var i=0;i<fs.length;i++){(function(f){' +
      'var r=new FileReader();' +
      'r.onload=function(ev){' +
        'infos.push({name:f.name,type:f.type,buffer:ev.target.result});' +
        'if(--pending===0){' +
          'window.parent.postMessage({type:"fl-files-dropped",files:infos},"*",infos.map(function(x){return x.buffer;}));' +
        '}' +
      '};' +
      'r.readAsArrayBuffer(f);' +
    '})(fs[i]);}' +
  '});' +
'</scr' + 'ipt>';

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

// Remove source file (× button on chips)
document.getElementById('sources-chips')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('.remove-source');
  if (!btn) return;
  const sfId = btn.dataset.sfId;
  try {
    const res = await fetch(`/api/source-files/${sfId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error);
    btn.closest('.source-chip').remove();
    // Update count label
    const chips = document.querySelectorAll('.source-chip');
    if (sourcesLabel) {
      const n = chips.length;
      sourcesLabel.textContent = `${n} source${n !== 1 ? 's' : ''}`;
    }
    if (!chips.length) {
      document.getElementById('sources-chips').innerHTML =
        '<span id="sources-empty" class="text-gray-400 text-xs">No source files. Drop files on the visualization to add context.</span>';
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
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

if (canEdit && vizDropOverlay) {
  let dragTimer  = null;
  let isDragging = false;

  function endDrag() {
    clearTimeout(dragTimer);
    isDragging = false;
    vizDropOverlay.classList.add('hidden');
  }

  // Called by both document dragover (edges) and postMessage from the iframe (center).
  // dragover fires continuously — the 150ms timeout acts as a heartbeat.
  function activateDrag() {
    if (!isDragging) {
      isDragging = true;
      vizDropOverlay.classList.remove('hidden');
    }
    clearTimeout(dragTimer);
    dragTimer = setTimeout(endDrag, 150);
  }

  function onDragOver(e) {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    activateDrag();
  }

  // dragenter fires the moment a file drag enters the browser window — before
  // the cursor can reach the iframe. Showing the overlay HERE means it's already
  // covering the iframe when dragover first fires, so the browser picks the
  // overlay (not the iframe) as the drop target.
  document.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    activateDrag();
  });

  // dragover heartbeat — fires on the overlay itself once it's shown, and on
  // non-iframe areas of the page. Keeps the overlay alive while dragging.
  document.addEventListener('dragover', onDragOver);

  // Messages from the sandboxed iframe:
  //  fl-dragover      → show/keep amber overlay alive
  //  fl-files-dropped → iframe read the files and transferred them as ArrayBuffers
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'fl-dragover') {
      activateDrag();
    } else if (e.data?.type === 'fl-files-dropped') {
      endDrag();
      const files = (e.data.files || []).map(
        info => new File([info.buffer], info.name, { type: info.type })
      );
      if (files.length) addFilesToDocument(files);
    }
  });

  // Prevent browser from navigating to dropped files anywhere on the page
  document.addEventListener('drop', (e) => e.preventDefault());

  vizDropOverlay.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    endDrag();
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
  if (canEdit) {
    html = html.includes('</body>')
      ? html.replace('</body>', DRAG_BRIDGE + '\n</body>')
      : html + '\n' + DRAG_BRIDGE;
  }
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
