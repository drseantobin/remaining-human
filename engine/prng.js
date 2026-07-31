// engine/prng.js — deterministic PRNG for seed-reproducible forms.
// mulberry32: tiny, fast, adequate statistical quality for stimulus assembly (NOT crypto).
// Every instrument takes an injected rng; a form is reconstructable from (version, seed).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
