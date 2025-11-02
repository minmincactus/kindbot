console.log('[KindBot] SW up');

const DEFAULTS = {
  enabled: true,
  threshold: 0.0,
  llmKey: 'AIzaSyCrl6icOT4yEM3DDi2Nf9DnucGh8GK4uWY'   // set in popup
};

// Prompt builder (no style/temperature)
function buildPrompt(text) {
  return `You are KindBot. Rewrite the following message to sound kinder and calmer, while keeping the same intent.
Keep it short (1–2 sentences).

Original:
"""${text}"""`;
}

async function callGemini(text) {
  const model = 'gemini-2.0-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${DEFAULTS.llmKey}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: buildPrompt(text) }]}],
    generationConfig: { candidateCount: 2 }
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

  const json = await res.json();
  const out = [];
  for (const cand of json.candidates || []) {
    const t = (cand.content?.parts || []).map(p => p.text).join('').trim();
    if (t) out.push(t);
  }
  return out.length ? out.slice(0, 2) : ["Here’s a calmer way to put it."];
}

async function getReframe(text) {
  const cfg = await chrome.storage.local.get(DEFAULTS);
  return { suggestions: await callGemini(text, cfg), neg: 1 };
}

// Inject content script if needed
async function ensureContent(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js']
    });
  } catch (e) {
    console.warn('[KindBot] ensureContent error:', e.message);
  }
}

// Right-click menu
function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'kindbot-reframe',
      title: 'Reframe kindly',
      contexts: ['selection', 'editable', 'page']
    });
  });
}
chrome.runtime.onInstalled.addListener(createMenus);
chrome.runtime.onStartup.addListener(createMenus);

// Messaging
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'kindbot-reframe' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'kindbot_reframe_request' });
  }
});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // ===== Right-click / Popup path =====
  if (msg.type === 'kindbot_reframe_selected' || msg.type === 'kindbot_popup_reframe') {
    (async () => {
      try {
        const { suggestions, neg } = await getReframe(msg.text);
        const tabId =
          sender?.tab?.id ||
          (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;

        if (tabId) {
          await ensureContent(tabId);
          chrome.tabs.sendMessage(tabId, {
            type: 'kindbot_show_suggestions',
            suggestions,
            neg,
            // you can keep or remove autoDismiss if you like
            // opts: { autoDismissMs: 2000 }
          });
        }
        sendResponse({ ok: true });
      } catch (e) {
        console.error('[KindBot][SW] reframe error:', e);
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true; // keep port open for async sendResponse
  }

  // ===== Proactive reframe request (pill click / typing) =====
  if (msg.type === 'kindbot_proactive_request') {
    (async () => {
      try {
        console.log('[KindBot][SW] proactive_request len=', msg.text?.length);
        const { suggestions, neg } = await getReframe(msg.text);

        // In some frames sender.tab may be undefined; fall back to active tab.
        let tabId = sender?.tab?.id;
        if (!tabId) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          tabId = tab?.id;
        }

        if (tabId) {
          await ensureContent(tabId);
          chrome.tabs.sendMessage(tabId, {
            type: 'kindbot_show_suggestions',
            suggestions,
            neg
          });
        } else {
          console.warn('[KindBot][SW] No tabId to deliver suggestions');
        }
        sendResponse({ ok: true });
      } catch (e) {
        console.error('[KindBot][SW] proactive error:', e);
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'kindbot_show_error', error: e.message });
        } catch {}
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true; // async
  }

  // (optional) default: ignore other messages
  // sendResponse && sendResponse({ ok: false, error: 'Unknown message type' });
});
