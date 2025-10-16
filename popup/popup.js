const els = {
  testInput: document.getElementById('testInput'),
  btnTest: document.getElementById('btnTest'),
  note: document.getElementById('note')
};

els.btnTest.addEventListener('click', async () => {
  const text = els.testInput.value.trim();
  if (!text) {
    els.note.textContent = 'Enter text first.';
    return;
  }
  els.note.textContent = 'Reframing… check the page overlay';
  try {
    await chrome.runtime.sendMessage({ type: 'kindbot_popup_reframe', text });
  } catch (e) {
    els.note.textContent = 'Failed: ' + (e?.message || e);
  }
});

