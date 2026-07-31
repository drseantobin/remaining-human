// engine/span.js — Instrument 011: Symmetry Span (visuospatial working-memory capacity).
// Implements manual/011-symmetry-span.md EXACTLY. If code and chapter disagree, the chapter wins
// and the discrepancy is a bug. Pure: no DOM, no storage, no Date/Math.random — all randomness
// comes from the injected PRNG so every form is reconstructable from (SPAN_VERSION, seed).

export const SPAN_VERSION = 1;

// Blueprint constants (manual §2) — changing any of these is a spec-version bump.
export const SET_SIZES = [2, 2, 3, 3, 4, 4, 5, 5]; // Foster et al. (2014) shortened form
export const RECALL_GRID_CELLS = 16;               // 4×4 recall grid
export const SYM_GRID_CELLS = 64;                  // 8×8 symmetry pattern
export const SYM_TIME_CAP_MS = 6000;               // per-judgment cap
export const PROCESSING_GATE = 0.85;               // Engle-lab convention (manual §3.1); strict <

// Locked instruction text — part of the instrument (manual §5); editing it is a version bump.
export const INSTRUCTIONS = 'You will judge whether patterns are symmetric while remembering a sequence of grid positions. Do both honestly: the pattern judgments must stay accurate for the memory score to count.';

// 8×8 pattern, mirror-symmetric about the vertical axis; if !makeSymmetric, one mirror cell is
// flipped so the pattern is asymmetric by construction (manual §2).
export function symMatrix(makeSymmetric, rng) {
  const g = new Array(SYM_GRID_CELLS).fill(0);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 4; c++) {
      const v = rng() < 0.5 ? 1 : 0;
      g[r * 8 + c] = v;
      g[r * 8 + (7 - c)] = v;
    }
  }
  if (!makeSymmetric) {
    const r = Math.floor(rng() * 8), c = Math.floor(rng() * 4);
    g[r * 8 + (7 - c)] = g[r * 8 + (7 - c)] ? 0 : 1;
  }
  return g;
}

// Generate one form: set-size order shuffled by the PRNG; recall cells sampled without
// replacement; each recall position paired with one symmetry judgment (manual §2).
export function generateSpanForm(rng) {
  const sizes = SET_SIZES.slice();
  for (let i = sizes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = sizes[i]; sizes[i] = sizes[j]; sizes[j] = t;
  }
  const sets = sizes.map((setSize) => {
    const pool = Array.from({ length: RECALL_GRID_CELLS }, (_, k) => k);
    const cells = [];
    for (let k = 0; k < setSize; k++) {
      const idx = Math.floor(rng() * pool.length);
      cells.push(pool.splice(idx, 1)[0]);
    }
    const items = cells.map((cell) => {
      const symmetric = rng() < 0.5;
      return { grid: symMatrix(symmetric, rng), symmetric, cell };
    });
    return { setSize, items, sequence: cells };
  });
  return { version: SPAN_VERSION, sets, symTimeCapMs: SYM_TIME_CAP_MS, procGate: PROCESSING_GATE, instructions: INSTRUCTIONS };
}

// Blueprint validation (manual §3.0): exactly 8 sets, sizes matching the blueprint multiset,
// symCorrect a finite integer within [0, n] per set. The exported scorer refuses anything else —
// a partial or malformed administration is never scored.
function blueprintError(sets) {
  if (!Array.isArray(sets) || sets.length !== SET_SIZES.length) return true;
  const sizes = sets.map((s) => (s && Array.isArray(s.sequence) ? s.sequence.length : -1)).sort((a, b) => a - b);
  const expected = SET_SIZES.slice().sort((a, b) => a - b);
  for (let i = 0; i < expected.length; i++) if (sizes[i] !== expected[i]) return true;
  for (const s of sets) {
    const n = s.sequence.length;
    if (!Number.isInteger(s.symCorrect) || s.symCorrect < 0 || s.symCorrect > n) return true;
  }
  return false;
}

// Score a completed form (manual §3). Input per set:
//   { sequence: [cellIdx…], recalled: [cellIdx…], symCorrect: integer 0..n }
// Returns { score, invalid?, reason?, procAcc, pcu } — a gated or malformed run carries
// invalid+reason with score: null; it NEVER fabricates a number.
export function scoreSpan(sets) {
  if (blueprintError(sets)) {
    return { score: null, invalid: true, reason: 'blueprint-mismatch', procAcc: null, pcu: null };
  }

  // §3.1 processing gate — pooled symmetry-judgment accuracy from integer counts (28 judgments).
  const totalSym = sets.reduce((a, s) => a + s.sequence.length, 0);
  const symCorrect = sets.reduce((a, s) => a + s.symCorrect, 0);
  const procAcc = symCorrect / totalSym;
  if (procAcc < PROCESSING_GATE) {
    return { score: null, invalid: true, reason: 'processing-gate', procAcc, pcu: null };
  }

  // §3.2 Partial-Credit Unit: per-set proportion recalled in the correct serial position,
  // unweighted mean across the 8 sets.
  let sum = 0;
  for (const s of sets) {
    let pos = 0;
    for (let i = 0; i < s.sequence.length; i++) {
      if (s.recalled && s.recalled[i] != null && s.recalled[i] === s.sequence[i]) pos++;
    }
    sum += pos / s.sequence.length;
  }
  const pcu = sum / sets.length;
  const score = Math.max(0, Math.min(100, Math.round(pcu * 100)));
  return { score, invalid: false, reason: null, procAcc, pcu };
}
