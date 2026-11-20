/* Pure ranking helpers for the on-device transformer (no DOM, no model: the embedder is injected so it can be tested). */
(function (root) {
'use strict';
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const normalize = v => { const n = Math.sqrt(dot(v, v)) || 1; return v.map(x => x / n); };

// Phrases similar to the page score high; a phrase that nearly repeats a higher-ranked one ("quantum" after
// "quantum computing") is demoted. Returns one score per phrase, aligned with the input, max = 1.
function mmrScores(pageVec, vecs, redundancy = 0.5) {
  const n = vecs.length; if (!n) return [];
  const rel = vecs.map(v => dot(pageVec, v)), lo = Math.min(...rel), span = Math.max(...rel) - lo, flat = span < 1e-9;
  const nr = i => (flat ? 1 : (rel[i] - lo) / span);          // no spread in relevance: everything counts equally
  const left = new Set(vecs.keys()), picked = [], out = new Array(n).fill(0);
  while (left.size) {
    let best = -1, bs = -Infinity, bred = 0;
    for (const i of left) {
      let red = 0; for (const j of picked) red = Math.max(red, dot(vecs[i], vecs[j]));
      const s = nr(i) - 0.5 * red;           // greedy maximal-marginal-relevance pick
      if (s > bs) { bs = s; best = i; bred = red; }
    }
    picked.push(best); left.delete(best);
    out[best] = nr(best) * (1 - redundancy * Math.max(0, bred));
  }
  const max = Math.max(...out) || 1;
  return out.map(x => x / max);
}

// embed(texts) -> Promise<number[][]> (unit vectors). digest = {head, body} from the reader.
async function semScores(embed, digest, phrases) {
  const h = (digest && digest.head || '').trim(), b = (digest && digest.body || '').trim();
  const vecs = await embed([h || '.', b || '.', ...phrases]);
  const parts = [h && vecs[0], b && vecs[1]].filter(Boolean);
  if (!parts.length) return phrases.map(() => 0);
  const sum = parts[0].map((_, i) => parts.reduce((s, p) => s + p[i], 0));
  return mmrScores(normalize(sum), vecs.slice(2));
}
const api = { dot, normalize, mmrScores, semScores };
root.RankCore = api; if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
