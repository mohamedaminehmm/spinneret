// Toolbar button toggles the spider; "rank" requests are forwarded to the offscreen document that hosts the model.
chrome.action.onClicked.addListener(tab => {
  if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: 'toggle' }).catch(() => {});
});

let creating = null;
async function ensureOffscreen() {
  const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (ctx.length) return;
  creating ||= chrome.offscreen.createDocument({
    url: 'offscreen.html', reasons: ['WORKERS'],
    justification: 'Run a small on-device language model that ranks key words on the page'
  }).finally(() => { creating = null; });
  await creating;
}

chrome.runtime.onMessage.addListener((m, sender, send) => {
  if (!m || m.type !== 'rank') return;
  (async () => {
    try {
      await ensureOffscreen();
      send(await chrome.runtime.sendMessage({ type: 'rank-offscreen', digest: m.digest, phrases: m.phrases }) || { ok: false });
    } catch (e) { send({ ok: false, error: String(e) }); }   // model not installed yet: the page falls back to the plain scoring
  })();
  return true;
});
