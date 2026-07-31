// engine/decision.js — Decision Autonomy (Judge-Advisor System / Weight-of-Advice).
// Spec: manual/015-decision-autonomy.md (read first; this implements it EXACTLY).
// Lineage: Sniezek & Buckley JAS; Yaniv & Kleinberger 2000; Logg, Minson & Moore 2019 (WOA);
// cognitive-forcing per Buçinca et al. 2021. HONEST CEILING: WOA is a group-level behavioral
// variable with poor individual-difference reliability (ICC ~.36–.47) — a session SNAPSHOT, never
// a trait. The SCORING is a documented Forma convention (raw WOA_good/WOA_bad/appropriateness in
// detail — those are the comparable numbers). The ITEM BANK below is PROVISIONAL and RED: Sean
// authors/ratifies the real items before any pilot. Pure module: no DOM, storage, Date, or Math.random.

export const DECISION_VERSION = 2;

// Locked generation constants (spec §3).
export const GOOD_FRAC = 0.04;  // good advice sits within 4% of the answer range from the truth
export const BAD_FRAC = 0.22;   // bad advice sits 22% of the range off — plausibly wrong, not absurd

// Locked scoring constants (spec §4).
export const MIN_USABLE = 8;    // fewer usable trials than this → can't estimate discrimination
export const MIN_PER_ARM = 4;   // per council review (006): 2-trial arms cannot carry a person-level mean.
// v2 REBUILD (council 006, psychometrician): signed score (no zero-clamp amputating half the scale),
// SEM reported with every appropriateness estimate, knowledge (initial-estimate accuracy) scored as
// its own parameter so reliance is not confounded with Gc. REAL bank target: 40-60 authored
// misconception items (RED/Sean) — reliability projection on pilot data decides if any length reaches
// .7 before this instrument is called a flagship anywhere.

// Locked administration text (spec §6).
export const INSTRUCTIONS = 'You’ll be asked to estimate a series of quantities. First give your own best estimate. Then an AI will offer a number, and you can revise — or keep your answer. The AI is sometimes close and sometimes wrong, and it won’t tell you which. Use your own judgment about when to trust it.';

// ---- PROVISIONAL ITEM BANK (RED — Sean authors/ratifies the real set; ~24 items for a pilot) ----
// Each: verifiable numeric truth + a plausible answer range [min,max]. These 12 are placeholders to
// exercise and test the engine; difficulty/discriminability must be curated before norming.
//
// REAL items should ALSO carry authored advice values: `goodAdvice` (a close, correct-ish number) and
// `badAdvice` (a PLAUSIBLE MISCONCEPTION — a real wrong answer a person might hold, NOT a mechanical
// offset). generateForm honors those when present. This matters: mechanically-generated advice
// (truth ± a fixed fraction) is geometrically gameable — an examinee anchored on any fixed reference
// near the truth can separate "close" from "far" WITHOUT judging correctness (Codex). Authored
// misconception-distractors + free-numeric-entry administration (no visible anchor; see manual/015 §2,§6)
// are what force the score to reflect genuine discrimination. The mechanical path below is a
// PROVISIONAL fallback for these placeholders only.
export const ITEMS = [
  { id: 'bones',       prompt: 'How many bones are in the adult human body?',              truth: 206,  unit: 'bones',        min: 0,    max: 400 },
  { id: 'iphone',      prompt: 'In what year was the first iPhone released?',              truth: 2007, unit: '',             min: 1990, max: 2020 },
  { id: 'moon',        prompt: 'Average Earth–Moon distance, in thousands of km?',     truth: 384,  unit: 'thousand km',  min: 0,    max: 1000 },
  { id: 'boiling',     prompt: 'Boiling point of water at sea level, in °F?',          truth: 212,  unit: '°F',      min: 0,    max: 400 },
  { id: 'un',          prompt: 'How many member states does the United Nations have?',      truth: 193,  unit: '',             min: 0,    max: 400 },
  { id: 'everest',     prompt: 'Height of Mount Everest, in meters?',                       truth: 8849, unit: 'm',            min: 0,    max: 15000 },
  { id: 'light',       prompt: 'Speed of light, in thousands of km/s?',                     truth: 300,  unit: 'thousand km/s',min: 0,    max: 600 },
  { id: 'chromosomes', prompt: 'How many chromosomes are in a typical human cell?',         truth: 46,   unit: '',             min: 0,    max: 100 },
  { id: 'piano',       prompt: 'How many keys on a standard full-size piano?',              truth: 88,   unit: '',             min: 0,    max: 150 },
  { id: 'declaration', prompt: 'In what year was the US Declaration of Independence signed?',truth: 1776, unit: '',             min: 1700, max: 1850 },
  { id: 'elements',    prompt: 'How many confirmed elements are in the periodic table?',    truth: 118,  unit: '',             min: 0,    max: 200 },
  { id: 'marathon',    prompt: 'Length of a marathon, in km (rounded)?',                     truth: 42,   unit: 'km',           min: 0,    max: 100 },
];

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ---- Form generation (seed-reproducible) ----
// Two BALANCED, Fisher-Yates-shuffled vectors, both from the injected stream (deterministic across JS
// engines: sequential rng() draws, never rng inside .sort()):
//   • quality — ceil(n/2) good / rest bad, so both arms are populated.
//   • advice SIGN, balanced WITHIN each quality arm — half of good advice sits above the truth and
//     half below (same for bad). This closes a directional-leakage exploit (Codex): with independent
//     per-item signs, a seed could put all good advice on one side of the range midpoint and all bad
//     on the other, letting a fixed-anchor "move toward advice above my midpoint" strategy score high
//     WITHOUT discriminating. Balancing signs per arm makes that strategy net ~50/50 good/bad → 0.
// SIGN-BALANCING ONLY APPLIES TO THE MECHANICAL FALLBACK. It reduces but does NOT eliminate geometric
// gaming: any examinee with a fixed reference near the truth can still separate close (good) from far
// (bad) by magnitude alone (Codex). The REAL defenses (see manual/015 §2,§3,§6), both required for the
// pilot: (1) items carry authored `goodAdvice`/`badAdvice` where bad = a plausible MISCONCEPTION, not a
// mechanical offset — honored below; (2) free-numeric-entry administration exposes NO visible anchor, so
// the person's genuine initial is the only reference. Mechanical advice is for these placeholders only.
export function generateForm(rng) {
  if (typeof rng !== 'function') throw new Error('decision.generateForm requires an injected rng');
  const n = ITEMS.length;
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };
  // Balanced quality vector.
  const nGood = Math.ceil(n / 2);
  const quality = shuffle(Array.from({ length: n }, (_, i) => (i < nGood ? 'good' : 'bad')));
  // Balanced signs per arm.
  const signs = new Array(n);
  const assignBalancedSigns = (idxs) => {
    const len = idxs.length;
    const s = Array.from({ length: len }, (_, k) => (k < Math.floor(len / 2) ? -1 : 1));
    if (len % 2 === 1) s[len - 1] = rng() < 0.5 ? -1 : 1; // the unpaired one is a seeded draw
    shuffle(s);
    idxs.forEach((idx, k) => { signs[idx] = s[k]; });
  };
  assignBalancedSigns(quality.map((q, i) => (q === 'good' ? i : -1)).filter((i) => i >= 0));
  assignBalancedSigns(quality.map((q, i) => (q === 'bad' ? i : -1)).filter((i) => i >= 0));

  const authored = (x) => typeof x === 'number' && Number.isFinite(x);
  const trials = ITEMS.map((it, i) => {
    const q = quality[i];
    let advice, source;
    if (authored(it.goodAdvice) && authored(it.badAdvice)) {
      // PREFERRED: use Sean's authored advice VERBATIM (clamped, never rounded — rounding could mask a
      // truth-valued authored advice on a non-integer truth, and his curated number must be shown as-is).
      advice = clamp(q === 'good' ? it.goodAdvice : it.badAdvice, it.min, it.max);
      source = 'authored';
    } else {
      // PROVISIONAL mechanical fallback (sign-balanced): truth ± a fixed fraction of the range.
      const range = it.max - it.min;
      const frac = q === 'good' ? GOOD_FRAC : BAD_FRAC;
      let sign = signs[i];
      advice = clamp(Math.round(it.truth + sign * frac * range), it.min, it.max);
      if (advice === it.truth) { // clamping collapsed advice onto truth → flip once
        sign = -sign;
        advice = clamp(Math.round(it.truth + sign * frac * range), it.min, it.max);
      }
      source = 'mechanical';
    }
    const degenerate = advice === it.truth; // no usable advice signal (excluded at scoring)
    return { id: it.id, prompt: it.prompt, truth: it.truth, unit: it.unit, min: it.min, max: it.max, quality: q, advice, source, degenerate };
  });
  return { version: DECISION_VERSION, trials };
}

// ---- Scoring (spec §4) ----
// score(form, responses): form from generateForm; responses = [{ initial, final }] aligned by index.
export function score(form, responses) {
  const trials = form && Array.isArray(form.trials) ? form.trials : null;
  const resp = Array.isArray(responses) ? responses : [];
  // BLUEPRINT GATE: a well-formed form of the expected size, one response per trial.
  if (!trials || trials.length !== ITEMS.length || resp.length !== trials.length) {
    return { score: null, invalid: true, reason: 'blueprint-mismatch' };
  }
  const finite = (x) => typeof x === 'number' && Number.isFinite(x);
  const usable = [];
  let sumInitErr = 0, sumFinalErr = 0; // for accuracyGain over all valid trials
  for (let i = 0; i < trials.length; i++) {
    const t = trials[i], r = resp[i];
    // CORRUPT-RESPONSE GATE: item AND response fields must be finite and inside the plausible range.
    // The scorer validates the FORM too (Codex): a tampered form with advice/truth outside [min,max]
    // must not yield a number — generateForm always clamps, so a real form never trips this.
    if (!t || !finite(t.truth) || !finite(t.advice) || !finite(t.min) || !finite(t.max) || t.max < t.min
      || t.advice < t.min || t.advice > t.max || t.truth < t.min || t.truth > t.max
      || !r || !finite(r.initial) || !finite(r.final)
      || r.initial < t.min || r.initial > t.max || r.final < t.min || r.final > t.max
      || (t.quality !== 'good' && t.quality !== 'bad')) {
      return { score: null, invalid: true, reason: 'corrupt-response' };
    }
    sumInitErr += Math.abs(r.initial - t.truth);
    sumFinalErr += Math.abs(r.final - t.truth);
    // USABILITY: advice must differ from the person's own initial, and must not sit on the truth
    // (a "bad" advice that equals truth is mislabeled). Degeneracy is COMPUTED, not merely trusted
    // from the flag (Codex) — a form can't smuggle a truth-valued advice into an arm.
    const denom = t.advice - r.initial;
    const eps = 1e-9 * Math.max(1, t.max - t.min);
    if (t.degenerate || t.advice === t.truth || Math.abs(denom) < eps) continue;
    const woa = clamp((r.final - r.initial) / denom, 0, 1);
    // Overflow guard (Codex v2): extreme-but-finite bounds can drive the division to NaN
    // (Infinity/Infinity). A non-finite WOA is corruption, never data.
    if (!Number.isFinite(woa)) return { score: null, invalid: true, reason: 'corrupt-response' };
    usable.push({ quality: t.quality, woa });
  }
  const good = usable.filter((u) => u.quality === 'good');
  const bad = usable.filter((u) => u.quality === 'bad');
  // TOO-FEW-USABLE GATE: not enough signal in either arm to estimate discrimination.
  if (usable.length < MIN_USABLE || good.length < MIN_PER_ARM || bad.length < MIN_PER_ARM) {
    return { score: null, invalid: true, reason: 'too-few-usable', usable: usable.length, nGood: good.length, nBad: bad.length };
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = (xs) => { const m = mean(xs); return xs.length > 1 ? xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1) : 0; };
  const gw = good.map((u) => u.woa), bw = bad.map((u) => u.woa);
  const woaGood = mean(gw);
  const woaBad = mean(bw);
  const appropriateness = woaGood - woaBad;
  // SEM of a difference of independent means — reported with EVERY estimate (council 006).
  const sem = Math.sqrt(variance(gw) / gw.length + variance(bw) / bw.length);
  const accuracyGain = (sumInitErr - sumFinalErr) / trials.length;
  // Knowledge parameter: normalized mean |initial − truth| across all valid trials — reported
  // separately so reliance can be analyzed conditional on knowledge instead of confounded with it.
  let knowErr = 0;
  for (let i = 0; i < trials.length; i++) knowErr += Math.abs(resp[i].initial - trials[i].truth) / Math.max(1, trials[i].max - trials[i].min);
  return {
    // SIGNED score in [-100, 100] (v2): backwards reliance reports as negative, never amputated to 0.
    score: Math.max(-100, Math.min(100, Math.round(appropriateness * 100))),
    invalid: false,
    woaOverall: mean(usable.map((u) => u.woa)),
    woaGood, woaBad, appropriateness, sem,
    knowledgeError: knowErr / trials.length,
    nGood: good.length, nBad: bad.length, nExcluded: trials.length - usable.length,
    accuracyGain,
  };
}
