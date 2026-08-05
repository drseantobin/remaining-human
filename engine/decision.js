// engine/decision.js — Decision Autonomy (Judge-Advisor System / Weight-of-Advice).
// Spec: manual/015-decision-autonomy.md (read first; this implements it EXACTLY).
// Lineage: Sniezek & Buckley JAS; Yaniv & Kleinberger 2000; Logg, Minson & Moore 2019 (WOA);
// cognitive-forcing per Buçinca et al. 2021. HONEST CEILING: WOA is a group-level behavioral
// variable with poor individual-difference reliability (ICC ~.36–.47) — a session SNAPSHOT, never
// a trait. The SCORING is a documented Forma convention (raw WOA_good/WOA_bad/appropriateness in
// detail — those are the comparable numbers). The ITEM BANK below is PROVISIONAL and RED: Sean
// authors/ratifies the real items before any pilot. Pure module: no DOM, storage, Date, or Math.random.

// v3 (2026-08-05, forma-validity P4/P5 + Sean's C.3 in manual/050):
//  • an out-of-range RESPONSE now excludes that trial instead of invalidating the whole section. A
//    taker who answers Everest in feet (29029) used to lose all 12 items' worth of genuine signal
//    to punish a unit convention.
//  • excluded trials leave the ERROR denominators too. Without that, P4 traded a wrongly-invalid
//    run for a wrongly-scored one: one unit slip pushed accuracyGain to 1681.67 and knowledgeError
//    to 0.1121 on a person who answered every item exactly right — fabricated numbers on
//    parameters the chapter documents as normalized.
//  • authored advice is no longer CLAMPED into the item bounds. manual/015 §3 already required it
//    verbatim; clamping showed packet item 4's badAdvice of 29032 as 15000 — the roundest number in
//    the range, sitting on the bound, leaking its own arm.
// v4 (2026-08-05): the RATIFIED bank — 17 items (manual/054): 7 cut, 5 edited, the C.1 good-advice
// nudge applied wherever 050 C.1(a) permits it. Content changed, so the version moves.
export const DECISION_VERSION = 4;

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
  { id: "bones", status: 'ratified', prompt: "How many bones are in the adult human body?", truth: 206, unit: "bones", min: 0, max: 1000, goodAdvice: 208, badAdvice: 270 },
  { id: "un", status: 'ratified', prompt: "How many member states does the United Nations have?", truth: 193, unit: "", min: 0, max: 500, goodAdvice: 192, badAdvice: 195 },
  { id: "everest", status: 'ratified', prompt: "Height of Mount Everest, in metres?", truth: 8849, unit: "m", min: 0, max: 35000, goodAdvice: 8840, badAdvice: 29032 },
  { id: "piano", status: 'ratified', prompt: "How many keys on a standard full-size piano?", truth: 88, unit: "", min: 0, max: 500, goodAdvice: 87, badAdvice: 61 },
  { id: "heart", status: 'ratified', prompt: "How many chambers does the human heart have?", truth: 4, unit: "", min: 0, max: 50, goodAdvice: 4, badAdvice: 2 },
  { id: "boiling", status: 'ratified', prompt: "Boiling point of water at sea level, in degrees Celsius?", truth: 100, unit: "°C", min: 0, max: 500, goodAdvice: 99, badAdvice: 212 },
  { id: "wwi", status: 'ratified', prompt: "In what year did the First World War begin?", truth: 1914, unit: "", min: 1700, max: 2000, goodAdvice: 1914, badAdvice: 1918 },
  { id: "violin", status: 'ratified', prompt: "How many strings does a standard violin have?", truth: 4, unit: "", min: 0, max: 50, goodAdvice: 4, badAdvice: 6 },
  { id: "planets", status: 'ratified', prompt: "How many planets are in the solar system?", truth: 8, unit: "", min: 0, max: 50, goodAdvice: 8, badAdvice: 9 },
  { id: "mercury", status: 'ratified', prompt: "How many Earth days does Mercury take to orbit the Sun?", truth: 88, unit: "days", min: 0, max: 1000, goodAdvice: 90, badAdvice: 59 },
  { id: "handbones", status: 'ratified', prompt: "How many bones are in the human hand, including the wrist bones?", truth: 27, unit: "bones", min: 0, max: 200, goodAdvice: 26, badAdvice: 14 },
  { id: "ocean", status: 'ratified', prompt: "What percentage of Earth's surface is covered by ocean?", truth: 71, unit: "%", min: 0, max: 100, goodAdvice: 70, badAdvice: 50 },
  { id: "berlinwall", status: 'ratified', prompt: "In what year did the Berlin Wall fall?", truth: 1989, unit: "", min: 1900, max: 2000, goodAdvice: 1989, badAdvice: 1991 },
  { id: "chromosomes", status: 'ratified', prompt: "How many chromosomes are in a typical human cell?", truth: 46, unit: "", min: 0, max: 500, goodAdvice: 45, badAdvice: 48 },
  { id: "celsfahr", status: 'ratified', prompt: "At what temperature do the Celsius and Fahrenheit scales read the same?", truth: -40, unit: "°", min: -500, max: 500, goodAdvice: -39, badAdvice: 0 },
  { id: "octopus", status: 'ratified', prompt: "How many hearts does an octopus have?", truth: 3, unit: "", min: 0, max: 50, goodAdvice: 3, badAdvice: 1 },
  { id: "moonlanding", status: 'ratified', prompt: "In what year did humans first land on the Moon?", truth: 1969, unit: "", min: 1900, max: 2000, goodAdvice: 1969, badAdvice: 1972 },
];

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Content status, same contract as the passage bank (engine/svt.js). None of these 12 placeholders
// is ratified, so the battery reports provisional content and tools/sync-public.sh refuses to ship.
export function bankStatus(bank = ITEMS) {
  return Array.isArray(bank) && bank.length && bank.every((it) => it && it.status === 'ratified') ? 'ratified' : 'provisional';
}
export const CONTENT_STATUS = bankStatus();

// ---- BANK VALIDATION — the ratification-day transcription contract (spec §5) --------------------
// Ratification day types Sean's approved numbers into ITEMS by hand. Every failure mode below has
// already happened once in the candidate set (manual/050 Part B/C), so none of them is theoretical:
//   • authored advice outside the item's own bounds (packet item 4: badAdvice 29032, bounds 0-15000)
//   • goodAdvice EXACTLY EQUAL to truth, which the scorer excludes as carrying no advice signal —
//     true of 16 of the 24 candidate items, and enough to make one sitting in three return nothing
//   • bounds too tight to admit an honest answer
// Returns { ok, errors, warnings } and never throws. Warnings are things Sean may legitimately
// choose; errors are things that cannot be administered.
export function validateBank(bank = ITEMS) {
  const errors = [], warnings = [];
  if (!Array.isArray(bank) || !bank.length) return { ok: false, errors: ['item bank is empty'], warnings };
  const ids = new Set();
  for (const it of bank) {
    const id = it && typeof it.id === 'string' ? it.id : '(unnamed)';
    if (!it || typeof it !== 'object') { errors.push('a bank entry is not an object'); continue; }
    if (typeof it.id !== 'string' || !it.id) errors.push(`${id}: missing id`);
    else if (ids.has(it.id)) errors.push(`${id}: duplicate id`); else ids.add(it.id);
    if (typeof it.prompt !== 'string' || !it.prompt.trim()) errors.push(`${id}: missing prompt`);
    if (it.status !== 'provisional' && it.status !== 'ratified') errors.push(`${id}: status must be provisional|ratified`);
    const nums = ['truth', 'min', 'max'];
    if (nums.some((k) => typeof it[k] !== 'number' || !Number.isFinite(it[k]))) { errors.push(`${id}: truth/min/max must all be finite numbers`); continue; }
    if (it.max <= it.min) { errors.push(`${id}: max must exceed min`); continue; }
    if (it.truth < it.min || it.truth > it.max) errors.push(`${id}: truth ${it.truth} is outside its own bounds [${it.min}, ${it.max}]`);
    const authored = (x) => typeof x === 'number' && Number.isFinite(x);
    const hasGood = authored(it.goodAdvice), hasBad = authored(it.badAdvice);
    if (hasGood !== hasBad) errors.push(`${id}: authored advice must come as a PAIR (goodAdvice and badAdvice) or not at all`);
    if (hasGood && (it.goodAdvice < it.min || it.goodAdvice > it.max)) errors.push(`${id}: goodAdvice ${it.goodAdvice} is outside the bounds [${it.min}, ${it.max}] — widen the bounds or change the advice; it is no longer clamped`);
    if (hasBad && (it.badAdvice < it.min || it.badAdvice > it.max)) errors.push(`${id}: badAdvice ${it.badAdvice} is outside the bounds [${it.min}, ${it.max}] — widen the bounds or change the advice; it is no longer clamped`);
    // goodAdvice == truth was a hard error until Sean's ruling (manual/054 addendum item 1). It is
    // now a DESIGNED state: an item with no near-truth-but-wrong good advice is bad-arm-only, and
    // generateForm keeps it out of the good arm entirely. Reported as a warning so the shape of the
    // bank stays visible, never as a defect. The invariant that makes it safe is asserted below.
    if (hasGood && it.goodAdvice === it.truth) warnings.push(`${id}: bad-arm-only — no near-truth good advice exists for this quantity, so it is never dealt to the good arm`);
    if (hasBad && it.badAdvice === it.truth) errors.push(`${id}: badAdvice equals truth — a "bad" advice on the correct answer is mislabelled`);
    if (hasGood && hasBad && it.goodAdvice === it.badAdvice) errors.push(`${id}: good and bad advice are the same number`);
  }
  if (bank.length < MIN_USABLE) errors.push(`bank holds ${bank.length} items; MIN_USABLE is ${MIN_USABLE}`);
  if (bank.length < 2 * MIN_PER_ARM) errors.push(`bank holds ${bank.length} items; both arms need at least ${MIN_PER_ARM}`);
  // THE SUPPLY INVARIANT that replaces the old per-item error. Bad-arm-only items are fine
  // individually; what would break the instrument is too FEW items left able to carry the good arm.
  const eligible = bank.filter((it) => it && !(typeof it.goodAdvice === 'number' && Number.isFinite(it.goodAdvice) && it.goodAdvice === it.truth));
  if (eligible.length < MIN_PER_ARM) errors.push(`only ${eligible.length} items can carry the good arm; MIN_PER_ARM is ${MIN_PER_ARM}. Nudge more good advice off the truth, or add measurement-style items (manual/050 C.1).`);
  const badCapable = bank.length - eligible.length + Math.max(0, eligible.length - Math.ceil(bank.length / 2));
  if (badCapable < MIN_PER_ARM) errors.push(`only ${badCapable} items would reach the bad arm; MIN_PER_ARM is ${MIN_PER_ARM}.`);
  return { ok: errors.length === 0, errors, warnings };
}

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
  // ---- GOOD-ARM ELIGIBILITY (v4; Sean's ruling, manual/054 addendum item 1) --------------------
  // Some true quantities have NO near-truth advice that is still wrong. A year is the clearest
  // case: 1968 is not a "close" answer for the Moon landing, it is simply incorrect. The same holds
  // for small exact integers — 4 heart chambers, 4 violin strings, 8 planets, 3 octopus hearts.
  // For those items the only honest good advice IS the truth, and the scorer discards any trial
  // whose advice equals the truth because it carries no advice signal to weigh.
  //
  // v3 shuffled quality freely across the whole bank, so those seven items landed in the good arm
  // about half the time and were thrown away when they did: measured 3.20% of sittings returned no
  // score at all, with the good arm bottoming out at exactly MIN_PER_ARM.
  //
  // The fix costs no content and loses no item: an exact-answer item is perfectly informative in
  // the BAD arm, where the advisor is confidently wrong and the question is whether you follow.
  // So eligibility is a property of the item, and the good arm is drawn only from the eligible.
  const goodArmEligible = (it) => !(typeof it.goodAdvice === 'number' && Number.isFinite(it.goodAdvice) && it.goodAdvice === it.truth);
  const eligible = [], forcedBad = [];
  ITEMS.forEach((it, i) => (goodArmEligible(it) ? eligible : forcedBad).push(i));
  // Keep the original balance target where the constraint allows it; take everything eligible if it
  // does not. WHICH eligible items carry the good arm still varies with the seed, so a repeat taker
  // cannot learn a fixed good/bad map.
  const nGood = Math.min(eligible.length, Math.ceil(n / 2));
  const quality = new Array(n).fill('bad');
  const tags = shuffle(Array.from({ length: eligible.length }, (_, k) => (k < nGood ? 'good' : 'bad')));
  eligible.forEach((idx, k) => { quality[idx] = tags[k]; });
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
      // PREFERRED: Sean's authored advice, VERBATIM — not rounded and, since v3, not clamped.
      // manual/015 §3 says "used verbatim, never rounded (the curated value is shown as-is)" and
      // clamping is a modification: it silently replaced packet item 4's badAdvice (29032, the
      // feet-for-metres misconception the item exists to test) with 15000, so the item measured the
      // opposite of what it was written to measure. An out-of-bounds authored value is an AUTHORING
      // error and is caught two ways instead: validateBank() at ratification time, and the scorer's
      // own form gate below, which returns an honest whole-run invalid rather than a wrong stimulus.
      advice = q === 'good' ? it.goodAdvice : it.badAdvice;
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
  let sumInitErr = 0, sumFinalErr = 0, knowErr = 0; // error stats over IN-RANGE trials only
  let nInRange = 0, nOutOfRange = 0;
  for (let i = 0; i < trials.length; i++) {
    const t = trials[i], r = resp[i];
    // ---- GATE 1: THE FORM. A malformed or out-of-bounds ITEM is a tampered or mis-authored
    // instrument, and that invalidates the whole run — it is not a data-quality event about the
    // person. Since v3 generateForm no longer clamps authored advice, this is also the net that
    // catches an out-of-bounds authored item at scoring time (forma-validity P5).
    if (!t || !finite(t.truth) || !finite(t.advice) || !finite(t.min) || !finite(t.max) || t.max < t.min
      || t.advice < t.min || t.advice > t.max || t.truth < t.min || t.truth > t.max
      || (t.quality !== 'good' && t.quality !== 'bad')) {
      return { score: null, invalid: true, reason: 'corrupt-response' };
    }
    // ---- GATE 2: THE RESPONSE, split by what it is evidence of (v3; Sean's C.3).
    // A NON-FINITE response cannot come from the numeric input the runner presents, so it is still
    // corruption and still invalidates the run.
    if (!r || !finite(r.initial) || !finite(r.final)) {
      return { score: null, invalid: true, reason: 'corrupt-response' };
    }
    // An OUT-OF-RANGE response is a taker behaviour — a unit slip, a typo, a fat finger. It
    // excludes THIS TRIAL and nothing else. Two reasons it must be excluded, and the second is the
    // one that is not obvious: WOA is uninterpretable when the initial estimate is a scale error.
    // With initial 29029, final 8849 and advice near the truth, woa ≈ 0.97 — a unit-slip
    // self-correction reads as maximal advice-taking, the most flattering possible reading of the
    // least informative possible trial (manual/015 §4.2).
    if (r.initial < t.min || r.initial > t.max || r.final < t.min || r.final > t.max) {
      nOutOfRange += 1;
      continue;
    }
    // The error statistics are means over IN-RANGE trials, and their denominator is nInRange — NOT
    // trials.length. Leaving an excluded trial in the numerator while dividing by the full count is
    // how a single slip produced accuracyGain 1681.67 on a normalized parameter (forma-validity P4).
    nInRange += 1;
    sumInitErr += Math.abs(r.initial - t.truth);
    sumFinalErr += Math.abs(r.final - t.truth);
    knowErr += Math.abs(r.initial - t.truth) / Math.max(1, t.max - t.min);
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
  // Both error statistics are means over IN-RANGE trials. nInRange >= usable.length >= MIN_USABLE
  // here, so the division is always safe by the gate above.
  const accuracyGain = (sumInitErr - sumFinalErr) / nInRange;
  return {
    // SIGNED score in [-100, 100] (v2): backwards reliance reports as negative, never amputated to 0.
    score: Math.max(-100, Math.min(100, Math.round(appropriateness * 100))),
    invalid: false,
    woaOverall: mean(usable.map((u) => u.woa)),
    woaGood, woaBad, appropriateness, sem,
    // Knowledge parameter: normalized mean |initial − truth| — reported separately so reliance can
    // be analyzed conditional on knowledge instead of confounded with it.
    knowledgeError: knowErr / nInRange,
    nGood: good.length, nBad: bad.length, nExcluded: trials.length - usable.length,
    // Reported so a sitting with several slips is SCORED AND LABELLED rather than quietly cleaned
    // up. No separate invalidation ceiling exists on purpose: MIN_USABLE and MIN_PER_ARM already
    // impose one, and inventing a second threshold would be a number with no basis behind it. The
    // pilot sets it from the measured distribution, or it stays absent (forma-validity P4).
    nOutOfRange, nInRange,
    accuracyGain,
  };
}
