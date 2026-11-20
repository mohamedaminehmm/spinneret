# Crawler Spider (extension)

Install (Chrome / Edge): chrome://extensions > Developer mode > Load unpacked > pick this folder. Reload the extension and the page after updates.

- The spider (debug view, 2x size) follows your cursor; eyes track the green point.
- Each foot highlights the word it stands on (random colour) and removes it when the foot lifts.
- No input for 30 s: legs stay still, then the green point walks to the 10 nearest words and the spider taps each one. Any input stops it.
- Toolbar button: toggle in the current tab. Alt+K: highlight top key words.
- Alt+P starts the patrol immediately (quick test). Optional: `__spider.cfg.idleMs = 3000` only works if the DevTools console context is switched from "top" to this extension.
- Tests: `node tests/core.test.js`

## Help prompt
After 60 s on a page without selecting any text, a small bubble next to the spider asks "Can I help?" (once per page view; Esc or "No thanks" remembers the page for 30 days; it gives up quietly after 20 s).
"Yes" highlights the key words on screen and the spider walks to the best-scored ones.

Console tips: `__spider` lives in the extension's own JavaScript context. In DevTools > Console, pick "Crawler Spider" in the context drop-down (top-left of the console) first.
Quick tests: `__spider.cfg.askMs = 5000` (bubble after 5 s), `__spider.cfg.idleMs = 3000` (patrol after 3 s idle).

## On-device transformer (optional, falls back to plain scoring)
Needs Node 20+ and Chrome/Edge 116+. One-time setup (about 25 MB model plus ONNX runtime, needs internet once):

    cd spider-extension
    npm install
    npm run setup        # copies wasm/, downloads models/ (MiniLM, quantized), bundles dist/offscreen.js

Then reload the extension in chrome://extensions. Without this step everything still works with the plain scoring.

How it is wired: content.js -> background.js (relay) -> offscreen.html + dist/offscreen.js (the model).
The model embeds the page digest (title, headings, start of the body) and the top candidate phrases, scores each phrase by
similarity to the page, demotes near-duplicates, and the result is blended 60/40 with the TF-IDF score (reader.rerank).
It runs when the "Can I help?" bubble appears, 4 s before an idle patrol, and when you click Yes (waits at most 4 s).
Nothing leaves your machine: no remote models, no host permissions.

Check it: open a long article, DevTools > Console > pick "Crawler Spider" in the context drop-down, then
`__spider.cfg.askMs = 5000`, wait for the bubble, and run `__spider.sem.state` ('ready' = the model answered, 'failed' = fallback).
Model errors show up under chrome://extensions > Crawler Spider > "Inspect views: offscreen.html".
Turn it off with `__spider.cfg.semantic = false`.
