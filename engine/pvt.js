// engine/pvt.js — PVT (Psychomotor Vigilance Task)
// Spec: manual/014-pvt.md (read first; this implements it EXACTLY).
// Lineage: Dinges & Powell 1985; brief-form precedent Basner et al. 2011 (PVT-B).
// Scoring ported from forma v346 scoreVigilance with documented deviations: the 0–100 transform is
// a Forma CONVENTION (raw medianRT/lapses/falseStarts/misses carried in detail — those are the
// scientifically comparable numbers); invalid gates replace forma's score-a-non-run behavior.
// Pure module: no DOM, no storage, no Date, no Math.random — all randomness injected.

export const PVT_VERSION = 1;

// Locked blueprint constants (spec §2).
export const TRIALS = 30;
export const ISI_MIN_MS = 1500;
export const ISI_MAX_MS = 6000;
export const RESPONSE_WINDOW_MS = 2000;

// Locked scoring constants (spec §3).
export const ANTICIPATION_MS = 100;   // faster is a guess that landed after the stimulus
export const LAPSE_MS = 500;          // canonical PVT lapse threshold
export const MIN_VALID_REACTIONS = 20;
export const RT_INTERCEPT = 127.5;    // the 0–100 transform — a Forma convention, NOT literature
export const RT_SLOPE = 0.15;
export const LAPSE_PENALTY = 3;
export const FALSESTART_PENALTY = 5;
export const MISS_PENALTY = 6;

// Locked administration text (spec §5).
export const INSTRUCTIONS = 'Watch the screen. The moment the target appears, press — as fast as you can. Do not try to guess the timing: pressing before it appears counts against you. Stay ready; the waits are deliberately unpredictable.';

// ---- Form generation (seed-reproducible: the full timing schedule from the seed) ----
export function generateForm(rng) {
  if (typeof rng !== 'function') throw new Error('pvt.generateForm requires an injected rng');
  const trials = [];
  for (let i = 0; i < TRIALS; i++) {
    trials.push({ isiMs: ISI_MIN_MS + Math.floor(rng() * (ISI_MAX_MS - ISI_MIN_MS + 1)) });
  }
  return { version: PVT_VERSION, responseWindowMs: RESPONSE_WINDOW_MS, trials };
}

// ---- Scoring (spec §3–§4) ----
function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const clamp = (x) => Math.max(0, Math.min(100, x));

export function score(trials) {
  const list = Array.isArray(trials) ? trials : [];
  // BLUEPRINT GATE: exactly 30 well-formed trial records, or no number.
  if (list.length !== TRIALS) return { score: null, invalid: true, reason: 'blueprint-mismatch' };
  for (const t of list) {
    if (!t || typeof t.falseStart !== 'boolean' || typeof t.miss !== 'boolean'
      || (t.rt != null && (typeof t.rt !== 'number' || !Number.isFinite(t.rt)))) {
      return { score: null, invalid: true, reason: 'corrupt-response' };
    }
    // Semantically impossible records are corruption, not data (Codex): a trial is exactly one of
    // reaction / falseStart / miss. Double-reported records would silently move the median AND the
    // penalties at once — refuse them.
    if ((t.falseStart && t.miss) || (t.rt != null && (t.falseStart || t.miss)) || (t.rt == null && !t.falseStart && !t.miss)) {
      return { score: null, invalid: true, reason: 'corrupt-response' };
    }
    // A SYMMETRIC range check. An rt outside [0, RESPONSE_WINDOW_MS] contradicts the blueprint:
    // beyond the window IS a miss, and below zero is not a fast guess but a clock that ran
    // backwards or a record that was edited — the runner computes rt from two performance.now()
    // readings, which is monotonic within a document, so rt >= 0 holds for any honest sitting.
    // Only the upper half of this check existed until 2026-08-05; a negative rt was silently
    // absorbed into the falseStarts count, so 25 real reactions plus 5 impossible ones returned a
    // score of 65 and charged the person 25 points for events that cannot happen. rt = 0 stays a
    // legitimate anticipation (and therefore a false start) — the behavioural threshold is
    // ANTICIPATION_MS and it is Basner's, not this gate's. (forma-validity P3.)
    if (t.rt != null && (t.rt < 0 || t.rt > RESPONSE_WINDOW_MS)) return { score: null, invalid: true, reason: 'corrupt-response' };
  }
  // Anticipations: sub-100ms responses are guesses — excluded from RT stats, counted as false starts.
  const anticipations = list.filter((t) => typeof t.rt === 'number' && !t.falseStart && t.rt < ANTICIPATION_MS).length;
  const valid = list.filter((t) => typeof t.rt === 'number' && !t.falseStart && t.rt >= ANTICIPATION_MS);
  const falseStarts = list.filter((t) => t.falseStart).length + anticipations;
  const misses = list.filter((t) => t.miss).length;
  if (!valid.length) return { score: null, invalid: true, reason: 'non-participation', falseStarts, misses };
  if (valid.length < MIN_VALID_REACTIONS) {
    return { score: null, invalid: true, reason: 'too-few-valid', validCount: valid.length, falseStarts, misses };
  }
  const medRT = median(valid.map((t) => t.rt));
  const lapses = valid.filter((t) => t.rt > LAPSE_MS).length;
  const rtScore = clamp(Math.round(RT_INTERCEPT - RT_SLOPE * medRT));
  return {
    score: clamp(Math.round(rtScore - (lapses * LAPSE_PENALTY + falseStarts * FALSESTART_PENALTY + misses * MISS_PENALTY))),
    invalid: false,
    medianRT: Math.round(medRT), lapses, falseStarts, misses, validCount: valid.length,
  };
}
