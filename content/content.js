console.log('[KindBot] content script loaded');

const HOST_ID = 'kindbot-shadow-host';

function ensureHost() {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    Object.assign(host.style, {
      position: 'fixed',
      top: '0px',
      left: '0px',
      zIndex: '2147483647',
      pointerEvents: 'none'
    });
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    const wrap = document.createElement('div');
    wrap.id = 'wrap';
    shadow.appendChild(wrap);

    // CSS injection
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('content/ui.css');
    shadow.appendChild(link);
  }
  return document.getElementById(HOST_ID).shadowRoot;
}

function getSelectedTextOrGmail() {
  const sel = window.getSelection();
  if (sel && String(sel).trim()) return String(sel).trim();
  const gmailBody = document.querySelector(
    '[aria-label="Message Body"], div[role="textbox"][g_editable="true"]'
  );
  if (gmailBody) return (gmailBody.innerText || gmailBody.textContent || '').trim();
  return '';
}

// --- helper: best rect near selection/caret or fallback center
function getAnchorRect() {
  try {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0).cloneRange();
      if (r.getClientRects && r.getClientRects().length) return r.getClientRects()[0];

      // fallback: insert temp span to measure
      const span = document.createElement('span');
      span.textContent = '\u200b';
      r.insertNode(span);
      const rect = span.getBoundingClientRect();
      span.remove();
      return rect;
    }
  } catch {}
  // final fallback: center-ish
  return {
    top: window.innerHeight / 2 - 80,
    left: window.innerWidth / 2 - 180,
    bottom: window.innerHeight / 2 - 80
  };
}

function renderCard(suggestions, neg) {
  const root = ensureHost();
  root.querySelectorAll('.kb-card, .kb-shield').forEach(n => n.remove());

  // transparent shield blocks page clicks (but doesn’t close the card)
  const shield = document.createElement('div');
  shield.className = 'kb-shield';
  shield.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
  }, true);
  shield.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
  }, true);

  const card = document.createElement('div');
  card.className = 'kb-card';
  card.innerHTML = `
    <div class="kb-head" id="kbDragHandle" title="Drag to move"
         style="cursor:move;display:flex;justify-content:space-between;align-items:center;">
      <strong>KindBot</strong>
      <div>
        <span class="kb-neg" style="font-size:0.8em;color:#888;">
          ${neg != null ? `neg: ${neg.toFixed(2)}` : ''}
        </span>
        <button class="kb-x" aria-label="Close" style="margin-left:8px;">✕</button>
      </div>
    </div>
    <div class="kb-body" style="margin-top:6px;">
      ${
        (suggestions && suggestions.length)
          ? suggestions.map(s => `
              <div class="kb-suggestion" style="margin-bottom:8px;">
                <p>${escapeHtml(s)}</p>
                <div class="kb-actions" style="margin-top:4px;">
                  <button class="kb-copy">Copy</button>
                </div>
              </div>`).join('')
          : `<p class="kb-muted">Looks OK! No reframe needed.</p>`
      }
    </div>
  `;

  const wrap = root.getElementById('wrap');
  wrap.appendChild(shield);
  wrap.appendChild(card);

  // ---- initial placement: near selection/caret, clamped to viewport
  const anchor = getAnchorRect();
  const rect = card.getBoundingClientRect();
  const cardW = rect.width || 360;
  const cardH = rect.height || 200;
  const gap = 12;

  let top = (anchor.bottom ?? anchor.top) + gap;
  let left = anchor.left;

  // clamp to viewport with padding
  const pad = 8;
  const maxTop = Math.max(pad, window.innerHeight - cardH - pad);
  const maxLeft = Math.max(pad, window.innerWidth - cardW - pad);

  top = Math.min(maxTop, Math.max(pad, top));
  left = Math.min(maxLeft, Math.max(pad, left));

  card.style.position = 'fixed';
  card.style.top = `${top}px`;
  card.style.left = `${left}px`;
  card.dataset.posTop = String(top);
  card.dataset.posLeft = String(left);

  // —— Close only via X or Esc
  const doClose = () => {
    card.remove();
    shield.remove();
    document.removeEventListener('keydown', escCloser, true);
  };
  card.querySelector('.kb-x')?.addEventListener('click', (e) => {
    e.stopPropagation();
    doClose();
  });
  function escCloser(e) {
    if (e.key === 'Escape') doClose();
  }
  document.addEventListener('keydown', escCloser, true);

  // —— Copy (no auto-close; visual feedback)
  const announcer = document.createElement('div');
  announcer.setAttribute('aria-live', 'polite');
  announcer.className = 'kb-sr';
  card.appendChild(announcer);

  card.querySelectorAll('.kb-copy').forEach(b => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const suggestionEl = b.closest('.kb-suggestion');
      const text = suggestionEl.querySelector('p').textContent;
      try {
        await navigator.clipboard.writeText(text);

        // reset any previous chosen state
        card.querySelectorAll('.kb-suggestion.chosen').forEach(el => el.classList.remove('chosen'));
        card.querySelectorAll('.kb-copy.is-copied').forEach(btn => {
          btn.classList.remove('is-copied');
          btn.textContent = 'Copy';
          btn.disabled = false;
        });

        // mark this one as chosen
        suggestionEl.classList.add('chosen');
        b.classList.add('is-copied');
        b.textContent = 'Copied';
        b.disabled = true;
        announcer.textContent = 'Copied suggestion to clipboard';

        setTimeout(() => { b.disabled = false; }, 1200);
      } catch {
        suggestionEl.classList.add('copy-error');
        announcer.textContent = 'Copy failed';
        setTimeout(() => suggestionEl.classList.remove('copy-error'), 600);
      }
    });
  });

  // —— Dragging (updates top/left, clamped, no transform)
  const handle = card.querySelector('#kbDragHandle');
  let dragging = false, startX = 0, startY = 0, startTop = 0, startLeft = 0;

  if (handle) {
    handle.addEventListener('mousedown', (e) => {
      dragging = true;
      const r = card.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startTop = parseFloat(card.dataset.posTop || r.top);
      startLeft = parseFloat(card.dataset.posLeft || r.left);
      card.classList.add('kb-dragging');
      e.preventDefault();
      e.stopPropagation();
    }, true);

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const r = card.getBoundingClientRect();
      const cardW = r.width;
      const cardH = r.height;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let newTop = startTop + dy;
      let newLeft = startLeft + dx;

      const pad = 8;
      const maxTop = Math.max(pad, window.innerHeight - cardH - pad);
      const maxLeft = Math.max(pad, window.innerWidth - cardW - pad);

      newTop = Math.min(maxTop, Math.max(pad, newTop));
      newLeft = Math.min(maxLeft, Math.max(pad, newLeft));

      card.style.top = `${newTop}px`;
      card.style.left = `${newLeft}px`;
      card.dataset.posTop = String(newTop);
      card.dataset.posLeft = String(newLeft);
    }, true);

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      card.classList.remove('kb-dragging');
      localStorage.setItem('kindbot_card_pos', JSON.stringify({
        top: parseFloat(card.dataset.posTop),
        left: parseFloat(card.dataset.posLeft)
      }));
      e?.stopPropagation?.();
    };
    window.addEventListener('mouseup', endDrag, true);
    window.addEventListener('mouseleave', endDrag, true);
  }
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
}

// ——— Listen for service worker ———
chrome.runtime.onMessage.addListener((msg) => {
  console.log('[KindBot] content got message:', msg);

  if (msg.type === 'kindbot_reframe_request') {
    const text = getSelectedTextOrGmail();
    if (!text) {
      const root = ensureHost();
      const t = document.createElement('div');
      t.className = 'kb-toast';
      t.textContent = 'Select text or focus a draft first.';
      root.getElementById('wrap').appendChild(t);
      setTimeout(()=> t.remove(), 1600);
      return;
    }
    chrome.runtime.sendMessage({ type: 'kindbot_reframe_selected', text });
  }

  if (msg.type === 'kindbot_show_suggestions') {
    renderCard(msg.suggestions || [], msg.neg);
  }
});

// ===== Proactive mode (Gmail/inputs/contenteditable) =====
const PROACTIVE_MIN_CHARS = 40;         // don't trigger for tiny strings
const PROACTIVE_DEBOUNCE_MS = 900;      // wait after user stops typing
const PROACTIVE_DIFF_MIN = 25;          // require at least this many new chars since last request

let proactiveTimer = null;
let lastSentHash = '';
let hintEl = null;   // the small floating pill

// attach listeners once per page
(function initProactive() {
  document.addEventListener('focusin', onFocusIn, true);
})();

function onFocusIn(e){
  const el = getEditableEl(e.target);
  if (!el) return;
  ensureHint();                       // build the hint pill once
  el.addEventListener('input', onEdit, { passive: true });
  el.addEventListener('keyup', onEdit, { passive: true });   // helps with Gmail
  positionHint(el);                   // place near caret
}

function getEditableEl(node){
  if (!node) return null;
  if (node instanceof HTMLTextAreaElement) return node;
  if (node instanceof HTMLInputElement && /text|search|email|url|tel/.test(node.type || 'text')) return node;
  // Gmail compose is a div[role="textbox"][g_editable="true"]
  if (node.closest && node.closest('div[role="textbox"][g_editable="true"]')) {
    return node.closest('div[role="textbox"][g_editable="true"]');
  }
  // generic contenteditable
  if (node.closest && node.closest('[contenteditable="true"]')) return node.closest('[contenteditable="true"]');
  return null;
}

function onEdit(e){
  const el = getEditableEl(e.target);
  if (!el) return;

  clearTimeout(proactiveTimer);
  proactiveTimer = setTimeout(() => maybeSuggest(el), PROACTIVE_DEBOUNCE_MS);
  positionHint(el);
}

function maybeSuggest(el){
  const text = getEditableText(el).trim();
  if (text.length < PROACTIVE_MIN_CHARS) {
    hideHint();
    return;
  }

  const h = simpleHash(text);
  if (
    lastSentHash &&
    h.split(':')[0] === lastSentHash.split(':')[0] &&
    text.length - parseInt(lastSentHash.split(':')[1] || '0', 10) < PROACTIVE_DIFF_MIN
  ) {
    return;
  }

  showHint(el, () => {
    chrome.runtime.sendMessage({ type: 'kindbot_proactive_request', text }, () => {
      // overlay is shown from background via kindbot_show_suggestions
    });
  });
  lastSentHash = h + ':' + String(text.length);
}

function getEditableText(el){
  if (el.value != null) return el.value;
  return (el.innerText || el.textContent || '');
}

function simpleHash(str){
  let h = 2166136261 >>> 0;
  for (let i=0;i<str.length;i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

// ------- floating hint pill -------
function ensureHint(){
  if (hintEl) return;
  const root = ensureHost();
  hintEl = document.createElement('button');
  hintEl.className = 'kb-proactive-pill';
  hintEl.type = 'button';
  hintEl.textContent = 'Reframe kindly';
  hintEl.style.display = 'none';
  root.getElementById('wrap').appendChild(hintEl);
}

function showHint(el, onClick){
  ensureHint();
  hintEl.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); };
  hintEl.style.display = 'block';
  positionHint(el);
}

function hideHint(){ if (hintEl) hintEl.style.display = 'none'; }

function positionHint(el){
  if (!hintEl || hintEl.style.display === 'none') return;
  const caret = getCaretClientRect(el);
  if (!caret) return hideHint();

  const x = caret.left + window.scrollX;
  const y = caret.bottom + window.scrollY + 6;
  hintEl.style.transform = `translate(${x}px, ${y}px)`;
}

function getCaretClientRect(el){
  try{
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0).cloneRange();
      if (r.getClientRects && r.getClientRects().length) return r.getClientRects()[0];
      const span = document.createElement('span');
      span.textContent = '\u200b';
      r.insertNode(span);
      const rect = span.getBoundingClientRect();
      span.remove();
      return rect;
    }
  } catch {}
  return el.getBoundingClientRect();
}
