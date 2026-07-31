// engine/sart.js — SART (Sustained Attention to Response Task)
// Spec: manual/012-sart.md (read first; this implements it EXACTLY).
// Lineage: Robertson et al. 1997. Scoring composite ported from forma v346 scoreStream with one
// documented deviation: non-participation (goAcc < 0.50) returns INVALID, never a number.
// Pure module: no DOM, no storage, no Date, no Math.random — all randomness injected.

export const SART_VERSION = 1;

// Locked blueprint constants (spec §2) — fingerprinted; any change is a SART_VERSION bump.
export const TRIALS = 108;
export const NOGO_COUNT = 12;          // 11.1% no-go, per source's ~11%
export const NOGO_DIGIT = 3;           // fixed target digit (Robertson 1997)
export const GO_DIGITS = [1, 2, 4, 5, 6, 7, 8, 9];
export const FIRST_NOGO_MIN_TRIAL = 5; // prepotent response must establish first (0-indexed: earliest no-go index)
export const STRATUM = 8;              // one no-go per 8-trial stratum from trial 5 → min gap 3, full coverage
export const STRATUM_OFFSETS = 6;      // seeded offset 0–5 within each stratum
export const SOA_MS = 1150;            // stimulus onset asynchrony ≈ source (250ms digit + ~900ms mask)

// Locked scoring constants (spec §3).
export const GO_WEIGHT = 0.4;
export const NOGO_WEIGHT = 0.6;
export const PARTICIPATION_FLOOR = 0.50; // goAcc below → invalid: non-participation

// Locked administration text (spec §5).
export const INSTRUCTIONS = 'Numbers will appear one at a time. Press for EVERY number — except 3. When you see 3, do not press. It is deliberately monotonous; staying present is the task.';

// ---- Form generation (seed-reproducible; constraints are GUARANTEES by construction) ----
export function generateForm(rng) {
  if (typeof rng !== 'function') throw new Error('sart.generateForm requires an injected rng');
  // No-go positions: one per stratum of 8 starting at trial FIRST_NOGO_MIN_TRIAL, seeded offset 0–5.
  // Guarantees: earliest ≥ trial 5; min gap 3 (8 − 5); latest ≤ 5 + 11·8 + 5 = 98 < 108.
  const nogoAt = new Set();
  for (let k = 0; k < NOGO_COUNT; k++) {
    nogoAt.add(FIRST_NOGO_MIN_TRIAL + k * STRATUM + Math.floor(rng() * STRATUM_OFFSETS));
  }
  const items = [];
  let prev = null;
  for (let i = 0; i < TRIALS; i++) {
    if (nogoAt.has(i)) {
      items.push({ digit: NOGO_DIGIT, nogo: true });
      prev = NOGO_DIGIT;
    } else {
      // Go digit: seeded uniform draw from GO_DIGITS, never repeating the previous trial's digit.
      let d = GO_DIGITS[Math.floor(rng() * GO_DIGITS.length)];
      while (d === prev) d = GO_DIGITS[Math.floor(rng() * GO_DIGITS.length)];
      items.push({ digit: d, nogo: false });
      prev = d;
    }
  }
  return { version: SART_VERSION, soaMs: SOA_MS, items };
}

// ---- Scoring (spec §3–§4; forma scoreStream composite + the invalid-run deviation) ----
export function score(items, tapped) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return { score: null, invalid: true, reason: 'no-items' };
  // BLUEPRINT GATE (Codex; span precedent): a credential scorer refuses off-blueprint runs — a
  // partial or malformed form must not emit a number (a 1-trial all-go form would score 100).
  const nogoN = list.filter((it) => it && it.nogo).length;
  if (list.length !== TRIALS || nogoN !== NOGO_COUNT || list.some((it) => !it || (it.nogo && it.digit !== NOGO_DIGIT) || (!it.nogo && !GO_DIGITS.includes(it.digit)))) {
    return { score: null, invalid: true, reason: 'blueprint-mismatch' };
  }
  // Response sanitation: tapped = trial indices with ≥1 response (duplicates collapse via Set — the
  // renderer may report multiple presses); any NON-INTEGER or OUT-OF-RANGE entry is record corruption,
  // not a response, and invalidates the run (spec §3).
  const raw = Array.isArray(tapped) ? tapped : [];
  if (raw.some((i) => !Number.isInteger(i) || i < 0 || i >= list.length)) {
    return { score: null, invalid: true, reason: 'corrupt-response' };
  }
  const tset = new Set(raw);
  let go = 0, goCorrect = 0, nogo = 0, nogoCorrect = 0;
  list.forEach((it, i) => {
    if (it.nogo) { nogo++; if (!tset.has(i)) nogoCorrect++; }
    else { go++; if (tset.has(i)) goCorrect++; }
  });
  const goAcc = go ? goCorrect / go : 1;
  const nogoAcc = nogo ? nogoCorrect / nogo : 1;
  // Validity gate (deviation from forma, documented in spec §3): inhibition on rare no-gos is
  // meaningless without the established prepotent response — a non-run gets NO number.
  if (goAcc < PARTICIPATION_FLOOR) {
    return { score: null, invalid: true, reason: 'non-participation', goAcc, nogoAcc, commissions: nogo - nogoCorrect, omissions: go - goCorrect };
  }
  const weighted = goAcc * GO_WEIGHT + nogoAcc * NOGO_WEIGHT;
  return {
    score: Math.max(0, Math.min(100, Math.round(weighted * 100))),
    invalid: false,
    goAcc, nogoAcc,
    commissions: nogo - nogoCorrect, // presses on no-go — the classic SART lapse count
    omissions: go - goCorrect,
  };
}
