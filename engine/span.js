// engine/span.js — Instrument 011: Symmetry Span (visuospatial working-memory capacity).
// Implements manual/011-symmetry-span.md EXACTLY. If code and chapter disagree, the chapter wins
// and the discrepancy is a bug. Pure: no DOM, no storage, no Date/Math.random — all randomness
// comes from the injected PRNG so every form is reconstructable from (SPAN_VERSION, seed).

// v2 (2026-08-05, forma-validity P2): recall-vector validation + an all-empty non-participation
// gate. v1 never inspected `recalled` at all, so a missing, null, empty, out-of-grid, non-numeric,
// over-length or duplicate-bearing recall vector scored a confident 0 (or 13, or 32) with
// invalid:false. A 0 is a claim about the person; a malformed vector is a claim about the record,
// and rendering the second as the first is the fabrication CLAUDE.md exists to forbid.
export const SPAN_VERSION = 2;

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
    // §3.0b RECALL VECTOR (v2). The runner cannot emit any of these — `recall()` builds `picked`
    // from a 16-button grid under `!picked.includes(k) && picked.length < set.sequence.length`, so
    // duplicates, out-of-grid cells, non-integers and over-length vectors are all structurally
    // unreachable from an honest sitting. This is a guard against a FUTURE runner (SCREENER_V1, the
    // two new stations) and against whatever is in a stranger's localStorage when replay() runs.
    // A SHORT vector, including an empty one, stays legitimate: a taker may tap fewer positions
    // than the set length, or none, and that is real behaviour worth scoring.
    if (!Array.isArray(s.recalled) || s.recalled.length > n) return true;
    const seen = new Set();
    for (const cell of s.recalled) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= RECALL_GRID_CELLS) return true;
      if (seen.has(cell)) return true;
      seen.add(cell);
    }
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

  // §3.1b NON-PARTICIPATION (v2). Zero cells tapped across all eight recall screens, with the
  // processing gate PASSED, is the span analogue of pvt.js's non-participation guard: a person who
  // correctly judges ≥85% of 28 symmetry patterns and then taps nothing, eight times running, has
  // declined the recall task — they have not demonstrated zero working-memory capacity, and
  // scoring them 0 would be a claim the data does not carry. Deliberately the narrowest possible
  // rule: tap ONE cell anywhere and you get a number, because a partial pattern is real behaviour.
  // The pilot logs the base rate of this gate; if real takers trip it, the gate is wrong.
  if (sets.reduce((a, s) => a + s.recalled.length, 0) === 0) {
    return { score: null, invalid: true, reason: 'non-participation', procAcc, pcu: null };
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
