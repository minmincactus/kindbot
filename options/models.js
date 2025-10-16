const els = {
    provider: document.getElementById('provider'),
    endpoint: document.getElementById('endpoint'),
    model: document.getElementById('model'),
    apiKey: document.getElementById('apiKey'),
    temp: document.getElementById('temp'),
    save: document.getElementById('save'),
    test: document.getElementById('test'),
    status: document.getElementById('status')
  };
  const DEFAULTS = {
    llmProvider: 'gemini',
    llmEndpoint: '',
    llmModel: 'gemini-1.5-flash',
    llmKey: '',
    llmTemp: 0.3
  };
  
  (async function init(){
    const cfg = await chrome.storage.local.get(DEFAULTS);
    els.provider.value = cfg.llmProvider;
    els.endpoint.value = cfg.llmEndpoint;
    els.model.value = cfg.llmModel;
    els.apiKey.value = cfg.llmKey;
    els.temp.value = cfg.llmTemp;
  })();
  
  els.save.addEventListener('click', async () => {
    await chrome.storage.local.set({
      llmProvider: els.provider.value,
      llmEndpoint: els.endpoint.value.trim(),
      llmModel: els.model.value.trim(),
      llmKey: els.apiKey.value.trim(),
      llmTemp: parseFloat(els.temp.value)
    });
    els.status.textContent = 'Saved.';
    setTimeout(()=> els.status.textContent = '', 1500);
  });
  
  els.test.addEventListener('click', async () => {
    els.status.textContent = 'Testing…';
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'kindbot_test_model' });
      els.status.textContent = resp?.ok ? 'OK: ' + (resp.model || '') : ('Failed: ' + (resp?.error || ''));
    } catch (e) {
      els.status.textContent = 'Failed: ' + (e?.message || e);
    }
  });
  