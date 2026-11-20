/* Pure helpers for the "Can I help?" prompt (no DOM, unit-tested). */
(function (root) {
'use strict';
// Counts visible time on one page view. tick() returns true exactly once, when it is time to ask.
class Dwell {
  constructor(askMs = 60000) { this.askMs = askMs; this.reset(); }
  reset() { this.ms = 0; this.selected = false; this.asked = false; }   // new page view (or SPA navigation)
  select() { this.selected = true; }                                    // user selected text: they are engaged, never ask
  tick(dtMs, blocked = false) {
    if (this.asked || this.selected || blocked) return false;
    this.ms += Math.min(dtMs, 250);                                     // a stalled frame must not count as reading time
    if (this.ms >= this.askMs) { this.asked = true; return true; }
    return false;
  }
}
// Keeps the remembered "No thanks" pages bounded: drops old entries and caps the count (newest win).
function pruneNo(map, now, maxAgeMs, cap) {
  const e = Object.entries(map || {}).filter(([, t]) => now - t < maxAgeMs).sort((a, b) => b[1] - a[1]).slice(0, cap);
  return Object.fromEntries(e);
}
const api = { Dwell, pruneNo };
root.DwellCore = api; if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
