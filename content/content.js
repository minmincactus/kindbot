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
  const gmailBody = document.querySelector('[aria-label="Message Body"], div[role="textbox"][g_editable="true"]');
  if (gmailBody) return (gmailBody.innerText || gmailBody.textContent || '').trim();
  return '';
}
function renderCard(suggestions, neg) {
  const root = ensureHost();
  root.querySelectorAll('.kb-card, .kb-shield').forEach(n => n.remove());

  // create a transparent shield to block page clicks (and prevent "click off" behavior)
  const shield = document.createElement('div');
  shield.className = 'kb-shield';
  // ignore clicks (do not close)
  shield.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); }, true);
  shield.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); }, true);

  const saved = localStorage.getItem('kindbot_card_pos');
  const pos = saved ? JSON.parse(saved) : { top: 20, left: 20 };

  const card = document.createElement('div');
  card.className = 'kb-card';
  card.style.transform = `translate(${pos.left}px, ${pos.top}px)`;
  card.dataset.posTop = pos.top;
  card.dataset.posLeft = pos.left;

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

  // ——— Close only via X or Esc ———
  const doClose = () => {
    card.remove();
    shield.remove();
    document.removeEventListener('keydown', escCloser, true);
  };
  card.querySelector('.kb-x')?.addEventListener('click', (e) => { e.stopPropagation(); doClose(); });
  function escCloser(e){ if (e.key === 'Escape') doClose(); }
  document.addEventListener('keydown', escCloser, true);

  // ——— Copy behavior (no auto-close; visual feedback) ———
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

      // Reset any previous "chosen" state
      card.querySelectorAll('.kb-suggestion.chosen').forEach(el => el.classList.remove('chosen'));
      card.querySelectorAll('.kb-copy.is-copied').forEach(btn => {
        btn.classList.remove('is-copied');
        btn.textContent = 'Copy';
        btn.disabled = false;
      });

      // Mark this one chosen
      suggestionEl.classList.add('chosen');
      b.classList.add('is-copied');
      b.textContent = 'Copied';
      b.disabled = true; // (optional) prevent immediate double-click

      // announce for screen readers
      announcer.textContent = 'Copied suggestion to clipboard';

      // (optional) re-enable button after a moment so user can copy again if needed
      setTimeout(() => { b.disabled = false; }, 1200);

    } catch (err) {
      announcer.textContent = 'Copy failed';
      // brief error flash
      suggestionEl.classList.add('copy-error');
      setTimeout(() => suggestionEl.classList.remove('copy-error'), 600);
    }
  });
});


  // ——— Dragging (single shared flag) ———
  const handle = card.querySelector('#kbDragHandle');
  let dragging = false, startX=0, startY=0, startTop=0, startLeft=0;

  if (handle) {
    handle.addEventListener('mousedown', (e) => {
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      startTop = parseFloat(card.dataset.posTop || '20');
      startLeft = parseFloat(card.dataset.posLeft || '20');
      card.classList.add('kb-dragging');
      e.preventDefault();
      e.stopPropagation(); // don’t let it bubble to shield/page
    }, true);

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      const newTop = Math.max(8, startTop + dy);
      const newLeft = startLeft + dx;
      card.style.transform = `translate(${newLeft}px, ${newTop}px)`;
      card.dataset.posTop = newTop;
      card.dataset.posLeft = newLeft;
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
