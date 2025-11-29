const UI_DEFAULTS = {
  enabled: true
};

function updateToggleUI(enabled) {
  const btn = document.getElementById('toggleKindBot');
  if (!btn) return;
  btn.textContent = enabled ? 'On' : 'Off';
  btn.classList.toggle('pill-on', enabled);
  btn.classList.toggle('pill-off', !enabled);
}

document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const demoText = document.getElementById('demoText');
  const demoBtn = document.getElementById('demoBtn');
  const toggleBtn = document.getElementById('toggleKindBot');
  const closeBtn = document.getElementById('closePopup');

  // load current enabled flag
  chrome.storage.local.get(UI_DEFAULTS, (cfg) => {
    const enabled = !!cfg.enabled;
    updateToggleUI(enabled);
  });

  // toggle KindBot on/off
  toggleBtn.addEventListener('click', () => {
    chrome.storage.local.get(UI_DEFAULTS, async (cfg) => {
      const next = !cfg.enabled;
      await chrome.storage.local.set({ enabled: next });
      updateToggleUI(next);
      statusEl.textContent = next ? 'KindBot enabled' : 'KindBot disabled';
      setTimeout(() => { statusEl.textContent = ''; }, 1200);
    });
  });

  // close popup via X
  closeBtn.addEventListener('click', () => {
    window.close();
  });

  // quick test
  demoBtn.addEventListener('click', () => {
    const text = (demoText.value || '').trim();
    if (!text) {
      statusEl.textContent = 'Type something first.';
      setTimeout(() => { statusEl.textContent = ''; }, 1000);
      return;
    }
    statusEl.textContent = 'Thinking…';
    chrome.runtime.sendMessage(
      { type: 'kindbot_popup_reframe', text },
      (resp) => {
        // the actual suggestions show up in-page via the same overlay;
        // this status is just to show something happened.
        if (chrome.runtime.lastError) {
          statusEl.textContent = 'Error: ' + chrome.runtime.lastError.message;
        } else if (resp && resp.ok) {
          statusEl.textContent = 'Suggestion shown on page.';
        } else if (resp && resp.error) {
          statusEl.textContent = 'Error: ' + resp.error;
        } else {
          statusEl.textContent = 'Done.';
        }
        setTimeout(() => { statusEl.textContent = ''; }, 1500);
      }
    );
  });
});
