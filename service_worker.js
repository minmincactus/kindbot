console.log('[KindBot] SW up');

const DEFAULTS = {
  enabled: true,
  threshold: 0.0,
  llmKey: 'AIzaSyCrl6icOT4yEM3DDi2Nf9DnucGh8GK4uWY'   // set in popup
};

// Prompt builder (no style/temperature)
function buildPrompt(text) {
  return `You are KindBot. 
  First, you will give a percent grade for the following message using sentiment analysis evaluating kindness levels.
  If the following message is over 90% kind, then return the same message.
  If certain parts of the message kind, then only change the unkind parts.
  Otherwise, rewrite the following message to sound kinder and calmer, while keeping the same intent.
  Returned messages should have a kindness sentiment of at least 90% and should be about the same length as the original message.

  In completing this task, it is acceptable to add cordial phrases if applicable, such as:
  
  Softening / Polite Openers
  “Would you mind…”
  “When you have a moment…”
  “If it’s not too much trouble…”
  “Just a quick question…”
  “I was hoping you could…”
  “Could you please…”
  “I’d really appreciate it if…”
  “Would it be possible to…”
  
  Friendly Tone Boosters
  “Thanks in advance!”
  “Hope you’re doing well.”
  “I appreciate your help.”
  “Thanks for taking a look at this.”
  “Let me know what you think!”
  “No rush—whenever you get a chance.”

  Softening Criticism / Corrections
  “Just a small note…”
  “One thing I noticed…”
  “You might consider…”
  “It could help to…”
  “A possible alternative would be…”
  “I may be mistaken, but…”
  “Another idea could be…”

  Collaborative Language
  “Maybe we can try…”
  “Let’s see if we can…”
  “We might want to consider…”
  “What do you think about…”
  “I’m open to suggestions!”

  Softeners for Direct Statements
  “It seems like…”
  “It looks like…”
  “It might be better if…”
  “We may want to…”
  “There’s a chance that…”

  Ending Phrases That Sound Warm
  “Let me know if you need anything else.”
  “Happy to help however I can.”
  “Looking forward to hearing from you.”
  “Hope this helps!”

  Do not return anything other than the reframed message or the exact same message.
  Specifically, do not return the kindness sentiment levels along with the message.
  Do NOT return the quotes around the message you return. Just return the message without any quotes.
  Do not alter or remove important information in the message to make it more kind, as retaining meaning is most important.

  Here are a couple examples with annotations.

  Input: 
  "I love you, but I dislike you."
  Output: 
  "I love you, but I don't think we're a good fit."
  Annotations: 
  The first first part of the message is not changed because it is already kind and calm.
  The rewritten message is about the same length.


  Input: 
  "Would you mind confirming that the initial draft for the Client Portal Design component will be delivered by the contractual deadline of next Tuesday, November 11th? 
  It's quite important, as any delay here would impact the subsequent testing and final review stages. 
  Thanks in advance!
  Furthermore, your update on the resource allocation for the Integration Engine was materially inaccurate. 
  I require a corrected, actionable timeline and a detailed explanation of the specific, current blockers today, before 5 PM EST. 
  This cannot wait until Friday. This issue must be resolved now."
  Output: 
  "Would you mind confirming that the initial draft for the Client Portal Design component will be delivered by the contractual deadline of next Tuesday, November 11th? 
  It's quite important, as any delay here would impact the subsequent testing and final review stages. 
  Thanks in advance!
  Also, there seems to be some inaccuracies in the resource allocation update for the Integration Engine. 
  Could you please provide a corrected, actionable timeline along with a detailed explanation of any current blockers by 5 PM EST today? 
  This is a time-sensitive issue, and your prompt attention would be greatly appreciated. Thanks for your help!"
  Annotations: 
  The first section of the message is not changed because it is already kind and calm.
  The rewritten message is about the same length.

  Input:
  I’ve looked over the files you sent, and once again they’re incomplete and not following the specifications we agreed on. 
  This keeps happening, and it’s becoming extremely frustrating. 
  I don’t understand why I have to keep repeating the same instructions when they were already spelled out clearly.
  This project is already behind schedule, and your repeated mistakes are making things worse. 
  I need you to actually pay attention to the details and get this right the first time. 
  I’m tired of cleaning up issues that shouldn’t exist in the first place.
  Please correct the problems immediately and resend the deliverables today.
  Output:
  I’ve looked over the files you sent, and I noticed a few areas that are incomplete or not fully aligned with the specifications. 
  I think this has happened before, and I wanted to see if we could find a way to ensure everything is on track.
  This project is facing some scheduling challenges, and accuracy is especially important right now. 
  I was hoping you could take another look at the details and ensure everything is aligned. 
  I appreciate your attention to these matters, and I'm happy to clarify any questions!
  Could you please correct the problems and resend the deliverables as soon as possible today? Thanks for your help!
  Annotations:
  Notice how the mesage is about the same length and contains all relevant information.

  Input:
  I need to address a serious issue that occurred recently. 
  Your comments and behavior toward me during yesterday’s meeting were inappropriate and made me extremely uncomfortable. 
  This is not the first time you have made remarks of a personal or sexual nature, and it is unacceptable in any professional environment.
  I want to be clear: this behavior must stop immediately. 
  It is unprofessional, disrespectful, and violates workplace expectations. 
  If it continues, I will have no choice but to formally report the incidents to HR and pursue the appropriate channels to ensure a safe work environment.
  Output:
  I need to address a serious issue that occurred recently. 
  I felt that your comments and behavior toward me during yesterday’s meeting were inappropriate and made me feel quite uncomfortable. 
  This isn't the first time remarks of a personal or sexual nature have occurred, and I want to mention that this isn't acceptable in a professional environment.
  I want to be clear: this behavior should stop immediately. 
  It is unprofessional, disrespectful, and may violate workplace expectations. 
  If it continues, I will need to formally report the incidents to HR and pursue the appropriate channels to ensure a safe work environment.
  Annotation:
  Even though the original message deals with a sensitive and inherently tense subject matter, it is essential that the rewritten message does not sacrifice meaning for kindness
  The message still contains all releveant information and does not sacrifice it to be kinder.


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
