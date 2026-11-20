// Run with: node tests/core.test.js
const assert = require('assert');
const { Spider, LENS, wrap, grp } = require('../spider.js');
const { scoreBlocks, tokenize, pickWalk } = require('../reader.js');
let pass = 0; const pending = [];
const ok = name => { pass++; console.log('\u2713', name); }, bad = (name, e) => { console.log('\u2717', name, '-', e.message); process.exitCode = 1; };
const t = (name, fn) => { try { const r = fn(); if (r && r.then) pending.push(r.then(() => ok(name), e => bad(name, e))); else ok(name); } catch (e) { bad(name, e); } };

/* reader */
const blocks = [
  { text: 'Quantum Computing', weight: 3 },
  { text: 'Quantum computing uses qubits instead of classical bits.', weight: 1 },
  { text: 'The qubits can hold more states, and quantum computing is fast.', weight: 1 },
  { text: 'Weather is nice and the cat sat on the mat today.', weight: 1 },
];
const top = scoreBlocks(blocks);
t('tokenizer keeps positions', () => { const k = tokenize('Hello wide world'); assert.strictEqual(k[1].w, 'wide'); assert.strictEqual(k[1].s, 6); });
t('top phrase is about quantum computing', () => assert.ok(/quantum/.test(top[0].phrase), top[0].phrase));
t('bigram "quantum computing" found', () => assert.ok(top.some(r => r.phrase === 'quantum computing')));
t('stop words never returned', () => assert.ok(!top.some(r => ['the', 'and', 'that'].includes(r.phrase))));
t('scores are within (0, 1] and top is 1', () => { assert.strictEqual(top[0].score, 1); assert.ok(top.every(r => r.score > 0 && r.score <= 1)); });
t('heading weight raises the score', () => {
  const a = scoreBlocks([{ text: 'robotics robotics', weight: 1 }]), b = scoreBlocks([{ text: 'robotics robotics', weight: 3 }]);
  assert.ok(b[0].raw > a[0].raw);
});
t('occurrences point into the original text', () => { const o = top[0].occ[0]; assert.strictEqual(o.block.text.slice(o.start, o.end).toLowerCase(), top[0].phrase); });

/* spider */
const sp = new Spider(0, 0, 1); sp.maxSpeed = 200;
let boneErr = 0, slid = 0, adj = 0, maxStep = 0, nan = false;
let prev = sp.legs.map(l => ({ x: l.fx, y: l.fy, st: l.stepping }));
for (let f = 0; f < 900; f++) {
  sp.update(1 / 60, f < 450 ? 500 : 0, f < 450 ? 0 : 300);
  let st = 0;
  sp.legs.forEach((l, n) => {
    for (let i = 0; i < 3; i++) boneErr = Math.max(boneErr, Math.abs(Math.hypot(l.j[i + 1].x - l.j[i].x, l.j[i + 1].y - l.j[i].y) - LENS[i]));
    if (!l.j.every(p => Number.isFinite(p.x + p.y))) nan = true;
    if (l.stepping) st++;
    if (!l.stepping && !prev[n].st && Math.hypot(l.fx - prev[n].x, l.fy - prev[n].y) > 2) slid++;
    if (l.stepping && !l.emerg && sp.legs.some((q, j) => q.stepping && !q.emerg && grp(j) !== grp(n))) adj++;
    prev[n] = { x: l.fx, y: l.fy, st: l.stepping };
  });
  maxStep = Math.max(maxStep, st);
}
t('3 bones keep fixed length', () => assert.ok(boneErr < 0.01, boneErr));
t('no NaN', () => assert.ok(!nan));
t('planted feet never slide (sub-pixel idle tremor allowed)', () => assert.strictEqual(slid, 0));
t('tetrapod gait: only one leg group swings at a time', () => assert.strictEqual(adj, 0));
t('at least 3 feet planted', () => assert.ok(maxStep <= 5, maxStep));
t('body reaches target', () => assert.ok(Math.hypot(sp.x, sp.y - 300) < 35));
const eyes = new Spider(0, 0, 1); for (let f = 0; f < 90; f++) eyes.update(1 / 60, 0, 0, 300, 300);
t('eyes lock onto the cursor', () => assert.ok(Math.abs(wrap(Math.PI / 4 - eyes.gz)) < 0.05));

/* new behaviours */
t('pickWalk chains nearest words, keeps min separation', () => {
  const c = [{x:100,y:0},{x:300,y:0},{x:110,y:5},{x:200,y:0},{x:1000,y:0}];
  const w = pickWalk({x:0,y:0}, c, 10, 60);
  assert.deepStrictEqual(w.map(p => p.x), [100, 200, 300, 1000]);
  assert.strictEqual(pickWalk({x:0,y:0}, c, 2, 60).length, 2);
});
const rs = new Spider(0, 0, 1); let done = false;
for (let f = 0; f < 240; f++) { rs.update(1 / 60, 0, 0, 0, -110, { x: 0, y: -110 }); done = done || rs.reachDone; }
t('a front leg plants its foot exactly on the reach point', () => {
  assert.ok(done && rs.reachLeg >= 0);
  const l = rs.legs[rs.reachLeg]; assert.ok(Math.hypot(l.fx - 0, l.fy + 110) < 6);
});
t('lifted/landed events are reported', () => { const a = new Spider(0,0,1); let up=0,down=0; for (let f=0;f<300;f++){a.update(1/60,400,0);up+=a.lifted.length;down+=a.landed.length;} assert.ok(up>5&&down>5); });
const idle = new Spider(0, 0, 1); let steps = 0;
for (let f = 0; f < 1800; f++) { idle.update(1 / 60, 0, 0); steps += idle.lifted.length; }
t('idle for 30 s: legs stand still', () => assert.strictEqual(steps, 0));
const still = new Spider(0, 0, 1); for (let f = 0; f < 120; f++) still.update(1 / 60, 0, 0);
const snap = still.legs.map(l => l.j.map(p => ({ x: p.x, y: p.y }))); let wander = 0;
for (let f = 0; f < 1200; f++) { still.update(1 / 60, 0, 0); still.legs.forEach((l, n) => l.j.forEach((p, k) => { wander = Math.max(wander, Math.hypot(p.x - snap[n][k].x, p.y - snap[n][k].y)); })); }
t('a still spider keeps its joints (no solver drift, tremor < 3 px)', () => assert.ok(wander < 3, wander));
t('heading stays normalised after many turns', () => { const a = new Spider(0,0,1); for (let f=0;f<3000;f++){const q=f/20;a.update(1/60,300*Math.cos(q),300*Math.sin(q));} assert.ok(Math.abs(a.ang) <= Math.PI + 1e-9); });
t('shift() moves the whole spider rigidly', () => {
  const a = new Spider(100, 100, 1), rel = a.legs.map(l => l.j.map(p => [p.x - a.x, p.y - a.y]));
  a.shift(-40, 25);
  a.legs.forEach((l, i) => l.j.forEach((p, k) => assert.ok(Math.abs(p.x - a.x - rel[i][k][0]) < 1e-9 && Math.abs(p.y - a.y - rel[i][k][1]) < 1e-9)));
  assert.strictEqual(Math.round(a.x), 60);
});
t('seeded rng makes runs reproducible', () => {
  const mk = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const run = () => { const q = new Spider(0, 0, 1, mk(7)); for (let f = 0; f < 300; f++) q.update(1 / 60, 300, 100); return [q.x, q.y, q.legs[3].fx].map(v => v.toFixed(6)).join(','); };
  assert.strictEqual(run(), run());
});
t('stopDist is configurable', () => { const a = new Spider(0, 0, 1); a.stopDist = 60; for (let f = 0; f < 600; f++) a.update(1 / 60, 300, 0); assert.ok(Math.hypot(a.x - 300, a.y) > 40); });
const { Dwell, pruneNo } = require('../dwell.js');
t('dwell: asks once after 60 s of visible time', () => { const d = new Dwell(60000); let asks = 0; for (let i = 0; i < 6000; i++) if (d.tick(16)) asks++; assert.strictEqual(asks, 1); });
t('dwell: not before 60 s', () => { const d = new Dwell(60000); let a = false; for (let i = 0; i < 3000; i++) a = a || d.tick(16); assert.ok(!a); });
t('dwell: selecting text means never ask on this page', () => { const d = new Dwell(1000); d.select(); let a = false; for (let i = 0; i < 500; i++) a = a || d.tick(16); assert.ok(!a); });
t('dwell: blocked time does not count', () => { const d = new Dwell(1000); for (let i = 0; i < 500; i++) d.tick(16, true); assert.strictEqual(d.ms, 0); });
t('dwell: a stalled frame counts at most 250 ms', () => { const d = new Dwell(60000); d.tick(5000); assert.strictEqual(d.ms, 250); });
t('dwell: reset (new page) re-arms it', () => { const d = new Dwell(100); while (!d.tick(50)); d.reset(); assert.ok(!d.asked && d.ms === 0); let a = false; for (let i = 0; i < 10; i++) a = a || d.tick(50); assert.ok(a); });
t('pruneNo drops old entries and caps the size, newest first', () => { const now = 1e12, m = { old: now - 40 * 864e5, a: now - 1000, b: now - 2000, c: now - 3000 }; assert.deepStrictEqual(Object.keys(pruneNo(m, now, 30 * 864e5, 2)), ['a', 'b']); });
const { mmrScores, semScores, normalize } = require('../rank.js');
const { makeDigest } = require('../reader.js');
const hashEmbed = async texts => texts.map(tx => { const v = new Array(64).fill(0); for (const w of tx.toLowerCase().match(/[a-z]+/g) || []) { let h = 7; for (const c of w) h = (h * 31 + c.charCodeAt(0)) % 64; v[h] += 1; } return normalize(v.some(Boolean) ? v : v.map((_, i) => i === 0 ? 1 : 0)); });
t('semScores: on-topic phrases outrank off-topic ones (fake embedder)', async () => {
  const s = await semScores(hashEmbed, { head: 'Quantum computing', body: 'Quantum computing uses qubits and quantum gates.' }, ['quantum gates', 'weather today', 'qubits', 'banana bread']);
  assert.ok(s[0] > s[1] && s[2] > s[3] && Math.max(...s) === 1);
});
t('mmrScores: a near-duplicate is demoted below the original', () => {
  const page = [1, 0], v = [[1, 0], [0.999, 0.045], [0.7, 0.714]];       // v1 nearly repeats v0
  const s = mmrScores(page, v.map(normalize));
  assert.ok(s[0] === 1 && s[1] < s[0]);
});
t('mmrScores: empty and single inputs are safe', () => { assert.deepStrictEqual(mmrScores([1], []), []); assert.deepStrictEqual(mmrScores([1, 0], [[1, 0]]), [1]); });
t('makeDigest splits headings from body and caps the size', () => {
  const d = makeDigest([{ text: 'Title here', weight: 3 }, { text: 'x'.repeat(5000), weight: 1 }, { text: 'Sub heading', weight: 2 }]);
  assert.ok(d.head.includes('Title here') && d.head.includes('Sub heading') && d.body.length <= 6500);
});
Promise.all(pending).then(() => console.log(`\n${pass} passed`));
