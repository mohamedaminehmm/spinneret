/* Overlay: debug-style spider over any page. Feet highlight the word they stand on;
   after 30 s of no input a green point walks to the 10 nearest words and the spider follows. */
(() => {
'use strict';
if (window.top !== window || window.__spiderLoaded) return;
window.__spiderLoaded = true;
const { Spider, TOTAL } = SpiderCore, R = SpiderReader, { Dwell, pruneNo } = DwellCore;
const CFG = { idleMs: 30000, count: 10, dwellMs: 1100, scale: 1.1, stopDist: 10, askMs: 60000, semantic: true };

const host = document.createElement('div');
host.id = 'spider-host';
host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
const shadow = host.attachShadow({ mode: 'closed' });
const cv = document.createElement('canvas');
cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;';
shadow.appendChild(cv);
document.documentElement.appendChild(host);

const ctx = cv.getContext('2d');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let W = 0, H = 0, sp = null, enabled = true, pointer = null, hlOn = false;
let lastInput = performance.now(), mode = 'follow', patrol = null, patrolDone = false, hold = null, vp = null;
let asking = false, prefetched = false, thinking = false;

// stop/run state
let stopped = false, stopEdge = null, keyBuf = '', keyT = 0;
const clampNum = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// scroll-shift state
let lastScrollX = window.scrollX, lastScrollY = window.scrollY;
let scrollActive = false, scrollEndTimer = 0, offScreenTime = 0;

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!sp) sp = new Spider(W / 2, H * 0.8, CFG.scale);
}
addEventListener('resize', resize);
addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true, capture: true });
for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'])
  addEventListener(ev, e => {
    // tiny mouse jitter right after clicking "Yes" must not cancel the help walk
    if (ev === 'pointermove' && mode === 'patrol' && patrol && patrol.help && patrol.p0 &&
        Math.hypot(e.clientX - patrol.p0.x, e.clientY - patrol.p0.y) < 40) return;
    lastInput = performance.now(); prefetched = false;
    if (stopped) return;
    patrolDone = false; hold = null;
    if (mode === 'patrol') { if (patrol && patrol.help) scheduleClearHelp(); mode = 'follow'; patrol = null; }
  }, { passive: true, capture: true });

/* ---------- foot highlights ---------- */
const hasHL = !!(window.CSS && CSS.highlights && typeof Highlight !== 'undefined');
const PALETTE = 12, slots = Array.from({ length: 8 }, () => ({ range: null, k: -1 })), hlSets = [];
if (hasHL) {
  const css = [];
  for (let k = 0; k < PALETTE; k++) {
    hlSets.push(new Highlight()); CSS.highlights.set('spider-c' + k, hlSets[k]);
    css.push(`::highlight(spider-c${k}){background-color:hsla(${Math.round(k * 360 / PALETTE + Math.random() * 20)},90%,58%,.6);color:inherit;}`);
  }
  const text = css.join('\n');
  try { const sheet = new CSSStyleSheet(); sheet.replaceSync(text); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]; }
  catch (e) { const st = document.createElement('style'); st.textContent = text; (document.head || document.documentElement).appendChild(st); }
}
function setSlot(n, hit) {                              // a random palette colour per landing, no stylesheet rewrites
  if (!hasHL) return;
  const sl = slots[n];
  if (!hit) { if (sl.range) { hlSets[sl.k].delete(sl.range); sl.range = null; } return; }
  const a = sl.range, b = hit.range;
  if (a && a.startContainer === b.startContainer && a.startOffset === b.startOffset && a.endOffset === b.endOffset) return;
  if (a) hlSets[sl.k].delete(a);
  let k; do { k = Math.floor(Math.random() * PALETTE); } while (k === sl.k);
  sl.range = b; sl.k = k; hlSets[k].add(b);
}
function clearFootHighlights() { for (let n = 0; n < 8; n++) setSlot(n, null); }

const footQ = Array.from({ length: 8 }, () => ({ x: NaN, y: NaN, hit: null, gen: -1 }));
let layoutGen = 0, scrolling = false, scrollTimer = 0, lastCheck = 0;

addEventListener('scroll', () => {
  scrolling = true;
  layoutGen++;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => { scrolling = false; lastCheck = 0; }, 100);
}, { passive: true, capture: true });
addEventListener('resize', () => { layoutGen++; lastCheck = 0; }, { passive: true });

/* ---------- scroll: shift spider so it rides the page, not the viewport ---------- */
addEventListener('scroll', () => {
  const sx = window.scrollX, sy = window.scrollY;
  const dX = lastScrollX - sx;
  const dY = lastScrollY - sy;
  lastScrollX = sx; lastScrollY = sy;

  // Ignore nested-element scrolls (window position unchanged) and redundant events.
  if (!isFinite(dX) || !isFinite(dY) || (dX === 0 && dY === 0)) return;

  scrollActive = true;
  clearTimeout(scrollEndTimer);
  scrollEndTimer = setTimeout(() => { scrollActive = false; }, 120);

  if (stopped || !sp) return;

  // Clamp the resulting position so a fast scroll can't strand the spider far away.
  const M = 200 * sp.s;
  const nx = clampNum(sp.x + dX, -M, W + M);
  const ny = clampNum(sp.y + dY, -M, H + M);
  sp.shift(nx - sp.x, ny - sp.y);
}, { passive: true, capture: true });

function footWord(n, x, y) {
  x = Math.round(x); y = Math.round(y);                 // sub-pixel tremor must not defeat the cache
  const q = footQ[n];
  if (q.gen === layoutGen && q.x === x && q.y === y) return q.hit;
  q.gen = layoutGen; q.x = x; q.y = y;
  q.hit = (R && typeof R.wordAt === 'function') ? R.wordAt(x, y) : null;
  return q.hit;
}

function footHighlights(now) {
  for (const e of sp.lifted) {
    footQ[e.n].gen = -1; footQ[e.n].hit = null;
    setSlot(e.n, null);
  }
  for (const e of sp.landed) setSlot(e.n, footWord(e.n, e.x, e.y));
  if (!scrolling && now - lastCheck > 200) {
    lastCheck = now;
    sp.legs.forEach((l, n) => { if (!l.stepping) setSlot(n, footWord(n, l.fx, l.fy)); });
  }
}

/* ---------- patrol ---------- */
function startPatrol(now, source = 'nearest') {
  let q = [];
  try {
    let pool = [];
    if (source === 'keywords') {                          // the reader's top-scored phrases that are on screen
      pool = R.visible().map(o => ({ x: o.rect.left + o.rect.width / 2, y: o.rect.top + o.rect.height / 2, word: o.item.phrase, score: o.item.score }))
        .filter(p => p.score > 0.2 && p.x > 0 && p.x < W && p.y > 0 && p.y < H)
        .sort((a, b) => b.score - a.score).slice(0, CFG.count * 2);
    }
    if (pool.length < 3) pool = R.wordsInView();
    q = R.pickWalk({ x: sp.x, y: sp.y }, pool, CFG.count, 60);
  } catch (e) { console.error('spider patrol failed', e); }
  patrolDone = true;
  if (!q.length) return false;
  patrol = { q, i: 0, t0: now, t1: 0, help: source === 'keywords', p0: pointer ? { x: pointer.x, y: pointer.y } : null };
  vp = { x: pointer ? pointer.x : sp.x, y: pointer ? pointer.y : sp.y }; mode = 'patrol';
  return true;
}
function nextWord(now) {
  patrol.i++; patrol.t0 = now; patrol.t1 = 0;
  if (patrol.i >= patrol.q.length) { if (patrol.help) scheduleClearHelp(); mode = 'follow'; patrol = null; hold = { x: sp.x, y: sp.y }; }
}
function patrolStep(now, dt) {
  const w = patrol.q[patrol.i], k = 1 - Math.exp(-10 * dt);
  vp.x += (w.x - vp.x) * k; vp.y += (w.y - vp.y) * k;
  const dx = w.x - sp.x, dy = w.y - sp.y, d = Math.hypot(dx, dy) || 1;
  const stand = Math.max(20, (TOTAL * 0.62 + 24 - CFG.stopDist) * sp.s);
  sp.update(dt, w.x - dx / d * stand, w.y - dy / d * stand, vp.x, vp.y, w);
  if (sp.reachDone) { if (!patrol.t1) patrol.t1 = now; if (now - patrol.t1 > CFG.dwellMs) nextWord(now); }
  else if (now - patrol.t0 > 6000) nextWord(now);
}

/* ---------- on-device transformer (runs in the extension's offscreen page; falls back to TF-IDF if unavailable) ---------- */
const SEM = { state: 'idle', token: 0, promise: null, failedAt: 0 };   // idle | loading | ready | failed
function ensureSemantic() {
  if (!CFG.semantic) return Promise.resolve(false);
  const p = R.requestPayload();
  if (!p || p.phrases.length < 8) return Promise.resolve(false);                       // too little text to be worth a model
  if (SEM.token === p.token && SEM.state === 'ready') return Promise.resolve(true);
  if (SEM.state === 'loading') return SEM.promise;
  if (SEM.state === 'failed' && performance.now() - SEM.failedAt < 60000) return Promise.resolve(false);
  SEM.state = 'loading'; SEM.token = p.token;
  SEM.promise = new Promise(res => {
    const fail = () => { SEM.state = 'failed'; SEM.failedAt = performance.now(); res(false); };
    const timer = setTimeout(fail, 20000);
    try {
      chrome.runtime.sendMessage({ type: 'rank', digest: p.digest, phrases: p.phrases }, r => {
        clearTimeout(timer);
        if (chrome.runtime.lastError || !r || !r.ok) return fail();
        const ok = R.rerank(p.token, r.sem); SEM.state = ok ? 'ready' : 'idle'; res(ok);
      });
    } catch (e) { clearTimeout(timer); fail(); }
  });
  return SEM.promise;
}

/* ---------- "Can I help?" prompt: 60 s on a page without selecting text, asked once per page ---------- */
const idle = cb => (window.requestIdleCallback ? requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 50));
const dwell = new Dwell(CFG.askMs), NO_KEY = 'spiderNo', pageKey = () => location.origin + location.pathname;
let curPage = pageKey(), noPages = null, lastUrlCheck = 0, askShownAt = 0, bubW = 230, bubH = 90, helpTimer = 0;
try { chrome.storage.local.get(NO_KEY, r => { noPages = (r && r[NO_KEY]) || {}; }); } catch (e) { noPages = {}; }
function saveNo() { noPages = pruneNo(noPages, Date.now(), 30 * 864e5, 200); try { chrome.storage.local.set({ [NO_KEY]: noPages }); } catch (e) {} }

const bubble = document.createElement('div');
bubble.className = 'b'; bubble.hidden = true; bubble.setAttribute('role', 'dialog'); bubble.setAttribute('aria-label', 'Spider assistant');
const bst = document.createElement('style');
bst.textContent = `.b{position:fixed;left:0;top:0;pointer-events:auto;box-sizing:border-box;max-width:240px;padding:10px 12px;font:14px/1.35 system-ui,sans-serif;background:#fff;color:#1a1a1a;border:1px solid #c9c9c9;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.25)}
.b[hidden]{display:none}.b p{margin:0 0 8px}.row{display:flex;gap:8px}
button{font:inherit;cursor:pointer;border-radius:6px;padding:4px 10px;border:1px solid #4b2cf0;background:#4b2cf0;color:#fff}
button.no{background:transparent;color:inherit;border-color:#999}button:focus-visible{outline:2px solid #00c853;outline-offset:2px}
@media (prefers-color-scheme:dark){.b{background:#1e1e1e;color:#eee;border-color:#555}}`;
const msg = document.createElement('p'); msg.textContent = 'Can I help? I can find and highlight the key words on this page.';
const row = document.createElement('div'); row.className = 'row';
const yes = document.createElement('button'), no = document.createElement('button');
yes.textContent = 'Yes, show me'; no.textContent = 'No thanks'; no.className = 'no';
row.append(yes, no); bubble.append(msg, row); shadow.append(bst, bubble);

function showAsk(now) { bubble.hidden = false; bubW = bubble.offsetWidth || 230; bubH = bubble.offsetHeight || 90; asking = true; askShownAt = now; ensureSemantic(); }
function hideAsk(rememberNo) { bubble.hidden = true; asking = false; if (rememberNo && noPages) { noPages[curPage] = Date.now(); saveNo(); } }
function placeBubble() {
  if (!asking) return;
  const s = sp.s, x = clampNum(sp.x + 30 * s, 8, W - bubW - 8), y = clampNum(sp.y - bubH - 30 * s, 8, H - bubH - 8);
  bubble.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
}
function scheduleClearHelp() { clearTimeout(helpTimer); helpTimer = setTimeout(clearHelp, 15000); }
function clearHelp() { clearTimeout(helpTimer); try { R.clearHighlight(); } catch (e) {} hlOn = false; }
function startHelp(now) {                               // "Yes": highlight the key words on screen, then walk to the best ones
  try { R.ensure(); R.highlight(R.visible().filter(o => o.item.score > 0.25)); hlOn = true; } catch (e) {}
  patrolDone = false; hold = null;
  startPatrol(now, 'keywords');
}
yes.onclick = () => {
  hideAsk(false); thinking = true;
  try { R.ensure(); } catch (e) {}                      // fresh scan, so the model scores the current page
  Promise.race([ensureSemantic(), new Promise(r => setTimeout(() => r(false), 4000))])   // never wait more than 4 s
    .finally(() => { thinking = false; startHelp(performance.now()); });
};
no.onclick = () => hideAsk(true);
document.addEventListener('selectionchange', () => {
  const sel = getSelection();
  if (sel && !sel.isCollapsed && String(sel).trim().length > 1) { dwell.select(); if (asking) hideAsk(false); }
});
function dwellTick(rawMs, now) {
  dwell.askMs = CFG.askMs;
  if (now - lastUrlCheck > 1000) {                      // single-page-app navigation counts as a new page
    lastUrlCheck = now;
    const k = pageKey();
    if (k !== curPage) { curPage = k; dwell.reset(); if (asking) hideAsk(false); clearHelp(); }
  }
  if (asking) {
    if (stopped || !enabled) return hideAsk(false);
    if (now - askShownAt > 20000 && !bubble.matches(':hover') && !shadow.activeElement) hideAsk(false);   // gives up quietly, not remembered
    return;
  }
  const blocked = !enabled || stopped || mode === 'patrol' || noPages === null || !!noPages[curPage] || isEditable(document.activeElement);
  if (dwell.tick(rawMs, blocked)) {
    try { if (R.items().length < 3) return; } catch (e) { return; }   // nothing worth highlighting: do not bother the user
    showAsk(now);
  }
}

/* ---------- stop / run edge helpers ---------- */
function isEditable(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (el.getAttribute && el.getAttribute('role') === 'textbox') return true;
  return false;
}
function pickClosestEdge() {
  const m = 20;
  const dT = sp.y - m, dB = (H - m) - sp.y, dL = sp.x - m, dR = (W - m) - sp.x;
  let best = 'top', bd = dT;
  if (dB < bd) { bd = dB; best = 'bottom'; }
  if (dL < bd) { bd = dL; best = 'left'; }
  if (dR < bd) { bd = dR; best = 'right'; }
  return best;
}
function edgePoint(edge) {
  const m = 20;
  switch (edge) {
    case 'top':    return { x: clampNum(sp.x, m, W - m), y: m };
    case 'bottom': return { x: clampNum(sp.x, m, W - m), y: H - m };
    case 'left':   return { x: m,                     y: clampNum(sp.y, m, H - m) };
    case 'right':  return { x: W - m,                 y: clampNum(sp.y, m, H - m) };
  }
  return { x: sp.x, y: sp.y };
}

/* ---------- drawing ---------- */
const BLUE = '#4b2cf0', ORANGE = '#e09a00', GREEN = '#00c853', DIM = 'rgba(168,132,31,.85)', GREENDIM = 'rgba(0,170,90,.75)';
function sq(x, y, size, a, c) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.strokeStyle = c; ctx.lineWidth = 1.2; ctx.strokeRect(-size / 2, -size / 2, size, size); ctx.restore(); }
function dot(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
function draw(gp) {
  ctx.clearRect(0, 0, W, H);
  const s = sp.s; ctx.lineJoin = ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(128,128,128,.22)'; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(sp.x + .5, 0); ctx.lineTo(sp.x + .5, H); ctx.moveTo(0, sp.y + .5); ctx.lineTo(W, sp.y + .5); ctx.stroke();
  for (const l of sp.legs) {
    const j = l.j;
    sq(l.ideal.x, l.ideal.y, 26 * s, sp.ang, DIM);
    sq(l.hipW.x, l.hipW.y, 14 * s, sp.ang, GREENDIM);
    for (let i = 1; i < 3; i++) sq(j[i].x, j[i].y, 20 * s, Math.atan2(j[i].y - j[i - 1].y, j[i].x - j[i - 1].x), GREENDIM);
    ctx.beginPath(); ctx.moveTo(j[0].x, j[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(j[i].x, j[i].y);
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = BLUE; ctx.lineWidth = 1.8; ctx.stroke();
    for (let i = 0; i < 3; i++) dot(j[i].x, j[i].y, (i ? 2.6 : 2.1) * s, ORANGE);
    dot(j[3].x, j[3].y, (2.6 + (l.stepping ? 3 * Math.sin(Math.PI * l.t) : 0)) * s, ORANGE);
  }
  ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(sp.ang);
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-18 * s, -10 * s, 36 * s, 20 * s);
  ctx.lineWidth = 1.8; ctx.strokeStyle = BLUE; ctx.strokeRect(-18 * s, -10 * s, 36 * s, 20 * s);
  ctx.strokeStyle = GREEN; ctx.strokeRect(-10 * s, -5 * s, 20 * s, 10 * s); ctx.restore();
  dot(sp.x, sp.y, 2.6 * s, ORANGE);
  if (thinking) { ctx.font = 'bold 14px system-ui,sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.fillStyle = '#333'; ctx.strokeText('reading…', sp.x + 24 * s, sp.y - 26 * s); ctx.fillText('reading…', sp.x + 24 * s, sp.y - 26 * s); }
  for (const side of [-1, 1]) {
    const e = sp.eye(side);
    ctx.save(); ctx.setLineDash([5, 6]); ctx.strokeStyle = GREEN; ctx.globalAlpha = .6; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(gp.x, gp.y); ctx.stroke(); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = GREEN; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, 3.6 * s, 0, 7); ctx.fill(); ctx.stroke();
    dot(e.x + Math.cos(sp.gz) * 1.7 * s, e.y + Math.sin(sp.gz) * 1.7 * s, 1.5 * s, ORANGE);
  }
  ctx.strokeStyle = stopped ? '#888' : GREEN; ctx.lineWidth = 2; ctx.beginPath();
  ctx.arc(gp.x, gp.y, 8, 0, 7); ctx.moveTo(gp.x - 14, gp.y); ctx.lineTo(gp.x - 5, gp.y); ctx.moveTo(gp.x + 5, gp.y); ctx.lineTo(gp.x + 14, gp.y);
  ctx.moveTo(gp.x, gp.y - 14); ctx.lineTo(gp.x, gp.y - 5); ctx.moveTo(gp.x, gp.y + 5); ctx.lineTo(gp.x, gp.y + 14); ctx.stroke();
}

/* ---------- main loop ---------- */
let last = performance.now();
let hlErrLogged = false, frErrLogged = false, frameN = 0, lastAttach = 0;

function frame(now) {
  try {
    const raw = Math.min(now - last, 250), dt = Math.min(raw / 1000, 1 / 30); last = now;
    if (now - lastAttach > 2000) { lastAttach = now; if (!host.isConnected) document.documentElement.appendChild(host); }   // survive page re-renders
    if (sp && enabled && !document.hidden) {
      // Freeze only while scrolling AND on-screen; off-screen the spider must
      // walk back, so never freeze it there.
      const onScreen = sp.x > -40 && sp.x < W + 40 && sp.y > -40 && sp.y < H + 40;
      const frozen = scrollActive && onScreen && !stopped && mode !== 'patrol';
      sp.stopDist = CFG.stopDist;
      sp.maxSpeed = frozen ? 0 : (reduce ? 240 : 480) * sp.s;

      let gp;
      if (stopped && stopEdge) {
        const ep = edgePoint(stopEdge);
        gp = pointer || ep;                              // eyes keep tracking the cursor while parked
        sp.update(dt, ep.x, ep.y, gp.x, gp.y);
      } else if (mode === 'patrol' && patrol) {
        patrolStep(now, dt); gp = vp;
      } else {
        const home = { x: W / 2, y: H * 0.8 }, t = (asking || thinking) ? { x: sp.x, y: sp.y } : (hold || pointer || home);   // stand still while the question is open
        gp = pointer || t;
        sp.update(dt, t.x, t.y, gp.x, gp.y);
        if (!patrolDone && !stopped && !asking && !scrollActive) {
          const idleFor = now - lastInput;
          if (idleFor > CFG.idleMs) startPatrol(now);
          else if (!prefetched && idleFor > CFG.idleMs - 4000) { prefetched = true; idle(() => { try { R.wordsInView(); } catch (e) {} ensureSemantic(); }); }   // warm the cache so the patrol starts instantly
        }
      }

      // Safety net: if off-screen and not intentionally stopped for >2 s, snap back.
      if (!stopped && mode !== 'patrol' && !scrollActive &&
          (sp.x < -100 || sp.x > W + 100 || sp.y < -100 || sp.y > H + 100)) {
        offScreenTime += dt;
        if (offScreenTime > 2) {
          sp.x = clampNum(sp.x, 40, W - 40);
          sp.y = clampNum(sp.y, 40, H - 40);
          sp.vx = 0; sp.vy = 0;
          offScreenTime = 0;
        }
      } else {
        offScreenTime = 0;
      }

      try { footHighlights(now); }
      catch (e) { if (!hlErrLogged) { hlErrLogged = true; console.error('spider: footHighlights failed', e); } }
      dwellTick(raw, now); placeBubble();
      const calm = sp.speed < 20 * sp.s && now - lastInput > 2000 && mode !== 'patrol';
      if (!calm || (frameN++ & 1) === 0) draw(gp);   // 30 fps while resting
    }
  } catch (e) {
    if (!frErrLogged) { frErrLogged = true; console.error('spider: frame failed', e); }
  }
  requestAnimationFrame(frame);
}

chrome.runtime.onMessage.addListener(m => {
  if (m && m.type === 'toggle') {
    enabled = !enabled; host.style.display = enabled ? '' : 'none';
    if (!enabled) {
      try { R.clearHighlight(); } catch (e) {}
      clearFootHighlights(); hideAsk(false);
    }
  }
});

addEventListener('keydown', e => {
  if (e.key === 'Escape' && asking) { hideAsk(true); return; }
  if (e.altKey && e.code === 'KeyK') {
    hlOn = !hlOn;
    if (!hlOn) { try { R.clearHighlight(); } catch (err) {} return; }
    try {
      if (!R.items().length) R.scan();
      R.highlight(R.visible().filter(o => o.item.score > 0.25));
      console.table(R.items().slice(0, 15).map(i => ({ phrase: i.phrase, score: +i.score.toFixed(2), count: i.count })));
    } catch (err) { console.error('spider Alt+K failed', err); }
    return;
  }
  if (isEditable(e.composedPath ? e.composedPath()[0] : e.target)) return;   // real target, even inside shadow DOM
  if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
  const kt = performance.now();
  if (kt - keyT > 1500) keyBuf = '';                    // the word must be typed in one go
  keyT = kt;
  keyBuf = (keyBuf + e.key.toLowerCase()).slice(-8);   // keep as little as possible
  const tail = keyBuf;
  if (!stopped && sp && /\bstop$/i.test(tail)) {
    stopped = true;
    stopEdge = pickClosestEdge();
    mode = 'follow'; patrol = null; patrolDone = true; hold = null;
    keyBuf = '';
  } else if (stopped && /\brun$/i.test(tail)) {
    stopped = false;
    stopEdge = null;
    patrolDone = false;
    lastInput = performance.now();
    keyBuf = '';
  }
});

resize();
requestAnimationFrame(frame);
if (R && typeof R.scheduleScan === 'function') setTimeout(() => R.scheduleScan(), 800);
else if (R && typeof R.scan === 'function') setTimeout(() => R.scan(), 800);
window.__spider = {
  get sp() { return sp; }, reader: R, cfg: CFG,
  get stopped() { return stopped; }, get sem() { return SEM; },
  get pos() { return sp ? { x: sp.x, y: sp.y, scrollX: scrollX, scrollY: scrollY, scrollActive } : null; }
};
})();
