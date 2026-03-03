/**
 * view.js — visualization view page
 */

import { showToast } from './app.js';

const { fileId, initialHtml, chatHistory, initialPrompt, canEdit } = window.VIEW_DATA;

// Injected into every visualization to add a "Save" hover button on each
// canvas/svg element. On click, reads the element as JPEG and posts to parent.
const COPY_BRIDGE = '<scr' + 'ipt>(function(){' +
  'var S="position:absolute;top:6px;right:6px;z-index:999;background:rgba(255,255,255,.9);' +
    'border:1px solid #e5e7eb;border-radius:6px;padding:3px 8px;cursor:pointer;' +
    'font-size:11px;display:none;";' +
  'function send(cv){cv.toBlob(function(b){var r=new FileReader();' +
    'r.onload=function(){window.parent.postMessage({type:"fl-save-chart",dataUrl:r.result},"*");};' +
    'r.readAsDataURL(b);},"image/jpeg",.95);}' +
  'function addBtn(el){if(el.dataset.flb)return;el.dataset.flb="1";' +
    'var p=el.parentNode,d=document.createElement("div");' +
    'd.style.cssText="position:relative;display:inline-block;max-width:100%;";' +
    'p.insertBefore(d,el);d.appendChild(el);' +
    'var btn=document.createElement("button");btn.textContent="⬇ Save";btn.style.cssText=S;' +
    'd.onmouseenter=function(){btn.style.display="block";};' +
    'd.onmouseleave=function(){btn.style.display="none";};' +
    'btn.onclick=function(e){e.stopPropagation();' +
      'if(el.tagName==="CANVAS"){send(el);return;}' +
      'var xml=new XMLSerializer().serializeToString(el);' +
      'var u=URL.createObjectURL(new Blob([xml],{type:"image/svg+xml"}));' +
      'var img=new Image(),rc=el.getBoundingClientRect();' +
      'img.onload=function(){var c=document.createElement("canvas");' +
        'c.width=rc.width*2;c.height=rc.height*2;' +
        'c.getContext("2d").drawImage(img,0,0,c.width,c.height);' +
        'URL.revokeObjectURL(u);send(c);};img.src=u;};' +
    'd.appendChild(btn);}' +
  'function init(){document.querySelectorAll("canvas,svg").forEach(addBtn);}' +
  'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);' +
  'else setTimeout(init,200);' +
  'new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){' +
    'if(!n||n.nodeType!==1)return;' +
    'if(n.tagName==="CANVAS"||n.tagName==="SVG")addBtn(n);' +
    'else if(n.querySelectorAll)n.querySelectorAll("canvas,svg").forEach(addBtn);' +
  '});});}).observe(document.documentElement,{childList:true,subtree:true});' +
'})();</scr' + 'ipt>';

// Injected into every visualization to handle CSV export requests from the parent.
// Parent sends {type:'fl-get-csv'}, iframe replies with {type:'fl-csv-data', tables:[...]}.
const CSV_BRIDGE = '<scr' + 'ipt>' +
  'window.addEventListener("message",function(e){' +
    'if(!e.data||e.data.type!=="fl-get-csv")return;' +
    'var tbls=document.querySelectorAll("table");' +
    'var out=[];' +
    'tbls.forEach(function(t,i){' +
      'var rows=[];' +
      't.querySelectorAll("tr").forEach(function(tr){' +
        'var cells=[];' +
        'tr.querySelectorAll("th,td").forEach(function(td){' +
          'cells.push(\'"\'+td.textContent.trim().replace(/"/g,\'""\')+\'"\');' +
        '});' +
        'if(cells.length)rows.push(cells.join(","));' +
      '});' +
      'if(rows.length)out.push({index:i+1,csv:rows.join("\\n")});' +
    '});' +
    'window.parent.postMessage({type:"fl-csv-data",tables:out},"*");' +
  '});' +
'</scr' + 'ipt>';

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
      if (files.length) showAddFilesModal(files);
    }
  });

  // Prevent browser from navigating to dropped files anywhere on the page
  document.addEventListener('drop', (e) => e.preventDefault());

  vizDropOverlay.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    endDrag();
    if (files.length) showAddFilesModal(files);
  });
}

// fl-save-chart: individual chart save from inside the iframe
window.addEventListener('message', (e) => {
  if (e.data?.type !== 'fl-save-chart') return;
  const a = document.createElement('a');
  a.href = e.data.dataUrl;
  a.download = 'chart.jpg';
  a.click();
  showToast('Chart saved');
});

// fl-csv-data: iframe replies with extracted table data → download as CSV
window.addEventListener('message', (e) => {
  if (e.data?.type !== 'fl-csv-data') return;
  const tables = e.data.tables || [];
  if (!tables.length) { showToast('No tables found', 'error'); return; }
  const csv = tables.length === 1
    ? tables[0].csv
    : tables.map(t => `# Table ${t.index}\n${t.csv}`).join('\n\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (document.title.split('—')[0].trim() || 'data') + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------------------------------------------------------------------------
// Duplicate
// ---------------------------------------------------------------------------

document.getElementById('duplicate-btn')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const res = await fetch(`/api/files/${fileId}/duplicate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    showToast('Duplicated — opening now…');
    window.location.href = `/view/${data.id}`;
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const exportWrap     = document.getElementById('export-wrap');
const exportBtn      = document.getElementById('export-btn');
const exportDropdown = document.getElementById('export-dropdown');

exportBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  exportDropdown.classList.toggle('hidden');
});
document.addEventListener('click', () => exportDropdown?.classList.add('hidden'));

document.getElementById('export-csv')?.addEventListener('click', () => {
  if (!currentHtml) return;
  // Ask the iframe to extract its tables and reply via postMessage
  vizFrame.contentWindow?.postMessage({ type: 'fl-get-csv' }, '*');
});

document.getElementById('copy-html')?.addEventListener('click', async () => {
  if (!currentHtml) return;
  try {
    await navigator.clipboard.writeText(currentHtml);
    showToast('HTML copied to clipboard');
  } catch {
    showToast('Copy failed — try downloading instead', 'error');
  }
});

document.getElementById('copy-python')?.addEventListener('click', async () => {
  if (!currentHtml) return;
  showToast('Generating Python code…');
  try {
    const res = await fetch(`/api/export-python/${fileId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentHtml }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (!data.code) throw new Error('No Python code returned');
    await navigator.clipboard.writeText(data.code);
    showToast('Python code copied to clipboard');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
});

document.getElementById('export-html')?.addEventListener('click', () => {
  if (!currentHtml) return;
  const blob = new Blob([currentHtml], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (document.title.split('—')[0].trim() || 'visualization') + '.html';
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById('export-pdf')?.addEventListener('click', async () => {
  if (!currentHtml) return;
  showToast('Preparing PDF…');
  try {
    const { canvas } = await _renderVizToCanvas();
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const { jsPDF } = window.jspdf;
    const w = canvas.width / 2, h = canvas.height / 2;
    const pdf = new jsPDF({ orientation: w > h ? 'landscape' : 'portrait', unit: 'px', format: [w, h] });
    pdf.addImage(imgData, 'JPEG', 0, 0, w, h);
    pdf.save((document.title.split('—')[0].trim() || 'visualization') + '.pdf');
  } catch (err) {
    showToast('Export failed: ' + err.message, 'error');
  }
});

async function _renderVizToCanvas() {
  const blob = new Blob([currentHtml], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const w = vizFrame.offsetWidth, h = vizFrame.offsetHeight;
  const frame = document.createElement('iframe');
  frame.style.cssText = `position:fixed;left:-9999px;top:0;width:${w}px;height:${h}px;`;
  document.body.appendChild(frame);
  frame.src = url;
  await new Promise(r => { frame.onload = r; });
  await new Promise(r => setTimeout(r, 800));   // let charts finish rendering
  const canvas = await window.html2canvas(frame.contentDocument.body, { scale: 2, logging: false });
  document.body.removeChild(frame);
  URL.revokeObjectURL(url);
  return { canvas };
}

// ---------------------------------------------------------------------------
// Add-files modal
// ---------------------------------------------------------------------------

let _pendingDropFiles = null;

function showAddFilesModal(files) {
  _pendingDropFiles = files;
  const chips = document.getElementById('add-files-chips');
  chips.innerHTML = '';
  Array.from(files).forEach(f => {
    const span = document.createElement('span');
    span.className = 'inline-flex items-center bg-amber-50 text-amber-700 text-xs px-2 py-1 rounded-full';
    span.textContent = f.name;
    chips.appendChild(span);
  });
  document.getElementById('add-files-note').value = '';
  document.getElementById('add-files-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('add-files-note').focus(), 50);
}

function closeAddFilesModal() {
  document.getElementById('add-files-modal').classList.add('hidden');
  document.getElementById('add-files-style-ref').checked = false;
  _pendingDropFiles = null;
}

document.getElementById('add-files-confirm')?.addEventListener('click', async () => {
  const files      = _pendingDropFiles;
  const note       = document.getElementById('add-files-note').value.trim();
  const isStyleRef = document.getElementById('add-files-style-ref').checked;
  closeAddFilesModal();
  if (files) await addFilesToDocument(files, note, isStyleRef);
});

document.getElementById('add-files-cancel')?.addEventListener('click', closeAddFilesModal);
document.getElementById('add-files-backdrop')?.addEventListener('click', closeAddFilesModal);
document.getElementById('add-files-note')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('add-files-confirm').click(); }
  if (e.key === 'Escape') closeAddFilesModal();
});

async function addFilesToDocument(files, note = '', isStyleRef = false) {
  setUploading(true);

  const formData = new FormData();
  for (const f of files) formData.append('file', f);
  formData.append('documentId', fileId);
  if (isStyleRef) formData.append('isStyleRef', '1');

  try {
    const res = await fetch('/api/files', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    // Update sources drawer and label
    const names = (data.sourceFiles || []).map(f => f.original_name);
    if (names.length) {
      updateSourcesUI(names);
      // Auto-send incorporation message.
      // If no chat history this is likely a fresh duplicate — ask to replace data but keep the style.
      const noteClause = note ? ` User note: ${note}.` : '';
      const msg = history.length === 0
        ? `New data added: ${names.join(', ')}.${noteClause} Replace all existing data with the new files provided, keeping the same visual structure, formatting, and style as the current visualization.`
        : `New data added: ${names.join(', ')}.${noteClause} Please incorporate this into the existing visualization.`;
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
  // Dismiss stale-data banner once files are added
  document.getElementById('stale-data-banner')?.remove();

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
  const extra = (canEdit ? DRAG_BRIDGE + '\n' : '') + COPY_BRIDGE + '\n' + CSV_BRIDGE;
  html = html.includes('</body>')
    ? html.replace('</body>', extra + '\n</body>')
    : html + '\n' + extra;
  vizFrame.srcdoc = html;
  document.getElementById('export-wrap')?.classList.remove('hidden');
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
