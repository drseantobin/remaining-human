// engine/flanker.js — Flanker (Executive Attention / Inhibitory Control)
// Spec: manual/010-flanker.md (read it first; this module implements it EXACTLY).
// Lineage: Eriksen & Eriksen 1974; scoring adapted from the NIH Toolbox two-vector method.
// Ported from forma v346 (src/exercises.js makeFlankerExercise + src/scoring.js flankerDetail)
// through the spec-first constitution: every constant below is locked by the spec and the
// fingerprint test; changing ANY of them (or the instruction text) is a FLANKER_VERSION bump.
//
// Pure module: no DOM, no storage, no Date/now, no Math.random — all randomness injected.

// v2 (2026-08-05, forma-validity P1): response-window TIMEOUTS enter the accuracy denominator.
// v1 filtered them out of the scored set entirely, so a person who answered 45 of 64 trials — all
// correctly — was scored 95 and TOLD "100% accurate". 40 correct with 24 timeouts scored 95 too,
// identical to a flawless run. On an attention test, v1 made NOT ANSWERING strictly better than
// answering wrong. Two accuracy statistics now exist because one number cannot serve both gates:
//   accuracy          = correct / ADMINISTERED  — the scored vector; feeds RT_CREDIT_MIN_ACC.
//   responseAccuracy  = correct / RT-BEARING    — feeds ACCURACY_FLOOR, whose stated rationale is
//                                                 "near chance on a 2-choice task", which is only
//                                                 true of trials the person actually answered.
// Using the fixed denominator for BOTH would have converted a real, poor, interpretable run (40
// answered at exactly the 0.60 chance floor) into an invalid one — refusing to score a legitimately
// bad sitting, which flatters the instrument by deleting its worst scores.
export const FLANKER_VERSION = 2;

// Locked scoring constants (spec §3).
export const ANTICIPATION_MS = 200;   // valid-trial floor: discrimination needs perceptual+decision time
export const RESPONSE_WINDOW_MS = 2000;
export const MIN_VALID_TRIALS = 40;   // below → invalid: too-few-valid
export const ACCURACY_FLOOR = 0.60;   // below → invalid: below-floor (≈chance on 2-choice)
export const RT_CREDIT_MIN_ACC = 0.80; // NIH rule: speed earns credit only above this accuracy
export const RT_LOG_MIN_MS = 500;     // log-rescale band for the RT vector
export const RT_LOG_MAX_MS = 3000;

// Locked form-generation constants (spec §2).
export const TRIALS_PER_CELL = 16;    // 4 cells × 16 = 64 test trials
export const PRACTICE_PER_CELL = 2;   // 8 practice trials, unscored
export const MAX_RUN = 3;             // no >3 consecutive same congruency or direction
export const ITI_MIN_MS = 500;        // inter-trial interval: 500–950ms in 50ms steps
export const ITI_STEPS = 10;
export const ITI_STEP_MS = 50;

// Locked administration text (spec §5) — part of the instrument, not UI copy.
export const INSTRUCTIONS = 'Arrows will appear in a row. Respond to the CENTER arrow only — press its direction as quickly as you can without guessing. The flanking arrows may point the other way; ignore them.';

// ---- Form generation (seed-reproducible: all randomness from the injected rng) ----
export function generateForm(rng) {
  if (typeof rng !== 'function') throw new Error('flanker.generateForm requires an injected rng');
  const jitterIti = () => ITI_MIN_MS + Math.floor(rng() * ITI_STEPS) * ITI_STEP_MS;
  const build = (perCell) => {
    const cells = [];
    for (const congruent of [true, false]) for (const dir of ['L', 'R']) for (let i = 0; i < perCell; i++) cells.push({ congruent, dir, iti: jitterIti() });
    const noLongRun = (arr) => {
      let cc = 1, dc = 1;
      for (let i = 1; i < arr.length; i++) {
        cc = arr[i].congruent === arr[i - 1].congruent ? cc + 1 : 1;
        dc = arr[i].dir === arr[i - 1].dir ? dc + 1 : 1;
        if (cc > MAX_RUN || dc > MAX_RUN) return false;
      }
      return true;
    };
    let out = cells;
    for (let attempt = 0; attempt < 40; attempt++) {
      for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = out[i]; out[i] = out[j]; out[j] = t; }
      if (noLongRun(out)) return out;
    }
    // CONSTRUCTIVE GUARANTEE (found porting from forma, where this constraint was soft and could
    // silently emit a violating form): when rejection sampling fails, BUILD a legal sequence greedily —
    // at each position place a trial from the most-abundant remaining cell that keeps every run ≤ MAX_RUN
    // (rng breaks ties, so forms stay seed-reproducible). If greedy ever dead-ends, fall back to a strict
    // cell interleave, which is legal by construction (congruency runs of 1, direction runs of 2). The
    // blueprint constraint is a GUARANTEE of the instrument, not a best effort.
    const byCell = new Map();
    for (const t of cells) { const k = `${t.congruent}|${t.dir}`; if (!byCell.has(k)) byCell.set(k, []); byCell.get(k).push(t); }
    const keys = [...byCell.keys()];
    const legal = (seq, t) => {
      let cc = 1, dc = 1;
      for (let i = seq.length - 1; i >= 0; i--) {
        if (seq[i].congruent === t.congruent && cc <= MAX_RUN) cc++; else break;
      }
      for (let i = seq.length - 1; i >= 0; i--) {
        if (seq[i].dir === t.dir && dc <= MAX_RUN) dc++; else break;
      }
      return cc <= MAX_RUN && dc <= MAX_RUN;
    };
    for (let retry = 0; retry < 20; retry++) {
      const pool = new Map(keys.map((k) => [k, byCell.get(k).slice()]));
      const seq = [];
      let stuck = false;
      while (seq.length < cells.length) {
        // Tie values are PRE-DRAWN so the sort comparator is pure — an rng() inside a comparator is
        // engine-dependent (call order/count varies), which would break cross-engine seed
        // reproducibility and the auditability claim (Codex). Deterministic final tie-break on key.
        const cands = keys
          .filter((k) => pool.get(k).length && legal(seq, pool.get(k)[0]))
          .map((k) => ({ k, n: pool.get(k).length, tie: rng() }))
          .sort((a, b) => b.n - a.n || a.tie - b.tie || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
        if (!cands.length) { stuck = true; break; }
        seq.push(pool.get(cands[0].k).shift());
      }
      if (!stuck && noLongRun(seq)) return seq;
    }
    // Absolute fallback: strict interleave T-L, F-L, T-R, F-R (legal by construction).
    const order = ['true|L', 'false|L', 'true|R', 'false|R'].filter((k) => byCell.has(k));
    const pool2 = new Map(keys.map((k) => [k, byCell.get(k).slice()]));
    const seq2 = [];
    while (seq2.length < cells.length) {
      for (const k of order) { const arr = pool2.get(k); if (arr && arr.length) seq2.push(arr.shift()); }
    }
    return seq2;
  };
  return { version: FLANKER_VERSION, practice: build(PRACTICE_PER_CELL), trials: build(TRIALS_PER_CELL) };
}

// ---- Scoring (spec §3–§4; the worked example in the spec must recompute exactly) ----
function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const clamp01to100 = (x) => Math.max(0, Math.min(100, x));

export function score(trials) {
  const all = Array.isArray(trials) ? trials.filter((t) => t && typeof t.correct === 'boolean') : [];
  // RT-BEARING trials: a real response inside the discrimination window. Anticipations below
  // ANTICIPATION_MS are guesses that landed, not discriminations, so they are not credited.
  const valid = all.filter((t) => typeof t.rt === 'number' && t.rt >= ANTICIPATION_MS && t.rt <= RESPONSE_WINDOW_MS);
  const n = valid.length;
  const administered = all.length;
  // Everything administered that produced no usable response: timeouts (rt null) and anticipations.
  const omissions = administered - n;
  // MIN_VALID_TRIALS protects the MEDIAN, so it counts RT-bearing trials. On the 64-trial blueprint
  // it therefore doubles as the omission-rate ceiling, at 24/64 = 37.5% omitted. Stated here rather
  // than left as an accident of two unrelated constants (forma-validity P1).
  if (n < MIN_VALID_TRIALS) return { score: null, invalid: true, reason: 'too-few-valid', valid: n, administered, omissions };
  const correct = valid.filter((t) => t.correct);
  // TWO denominators, each feeding the gate whose rationale it actually matches.
  const acc = administered ? correct.length / administered : 0;   // scored vector
  const responseAccuracy = correct.length / n;                    // "near chance" floor
  if (responseAccuracy < ACCURACY_FLOOR) return { score: null, invalid: true, reason: 'below-floor', valid: n, administered, omissions, accuracy: acc, responseAccuracy };
  const accVec = acc * 5;
  let computed = accVec; // ≤ RT_CREDIT_MIN_ACC: speed earns no credit — fast-and-sloppy cannot win
  const medRT = median(correct.map((t) => t.rt));
  if (acc > RT_CREDIT_MIN_ACC && medRT != null) {
    const lo = Math.log10(RT_LOG_MIN_MS), hi = Math.log10(RT_LOG_MAX_MS);
    const lr = Math.min(hi, Math.max(lo, Math.log10(medRT)));
    const rtVec = 5 * (1 - (lr - lo) / (hi - lo));
    computed = accVec + rtVec;
  }
  const congRT = median(correct.filter((t) => t.congruent).map((t) => t.rt));
  const incRT = median(correct.filter((t) => !t.congruent).map((t) => t.rt));
  // Difference-score caveat (spec §1): conflictCost is SECONDARY/informational — never the headline.
  const conflictCost = (congRT != null && incRT != null) ? Math.round(incRT - congRT) : null;
  return {
    score: clamp01to100(Math.round((computed / 10) * 100)),
    invalid: false, valid: n, administered, omissions,
    accuracy: acc, responseAccuracy,
    medianRT: medRT == null ? null : Math.round(medRT),
    congruentRT: congRT == null ? null : Math.round(congRT),
    incongruentRT: incRT == null ? null : Math.round(incRT),
    conflictCost,
  };
}
