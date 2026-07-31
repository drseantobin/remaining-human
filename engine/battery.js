// engine/battery.js — the assessment EVENT: fixed, versioned, single-sitting battery.
// Spec: manual/020-battery.md. Pure: no DOM, no storage, no Date — timestamps injected by the runner.

import { mulberry32 } from './prng.js';
import * as Flanker from './flanker.js';
import * as Sart from './sart.js';
import * as Span from './span.js';
import * as Pvt from './pvt.js';

export const BATTERY_VERSION = 1;

// RECORD SCHEMA — versioned SEPARATELY from the instruments (spec 020 §4a). Recording an extra
// field changes no stimulus, no instruction, no timing and no scoring, so mechanical instrument
// versioning is NOT triggered; the record schema is what moves. Schema 1 is the first schema that
// persists raw trial-level responses, and it is what makes the replay invariant testable.
export const RECORD_SCHEMA = 1;

// Fixed order (spec §2): least-effortful warm-up first, heaviest load mid-battery,
// sustained-attention-under-monotony deliberately LAST. SVT slot reserved (Sean's passages).
export const ORDER = ['pvt', 'flanker', 'span', 'sart'];

export const SECTION_TITLES = {
  pvt: 'Reaction & vigilance',
  flanker: 'Executive attention',
  span: 'Working memory',
  sart: 'Sustained attention',
};

export const INSTRUMENTS = {
  pvt: { version: Pvt.PVT_VERSION, instructions: Pvt.INSTRUCTIONS },
  flanker: { version: Flanker.FLANKER_VERSION, instructions: Flanker.INSTRUCTIONS },
  span: { version: Span.SPAN_VERSION, instructions: Span.INSTRUCTIONS },
  sart: { version: Sart.SART_VERSION, instructions: Sart.INSTRUCTIONS },
};

export const LIMITS_TEXT = 'This is an unnormed research battery. Scores are raw performance on a fixed task form — they cannot be compared to a population, and no percentile or ranking exists. What IS comparable: your own scores across sittings of the same battery version.';

// One seeded stream, blueprint order → the whole sitting reproducible from (BATTERY_VERSION, seed).
export function assembleBattery(seed) {
  if (!Number.isInteger(seed)) throw new Error('assembleBattery requires an integer seed');
  const rng = mulberry32(seed);
  return {
    batteryVersion: BATTERY_VERSION,
    seed,
    order: ORDER.slice(),
    forms: {
      pvt: Pvt.generateForm(rng),
      flanker: Flanker.generateForm(rng),
      span: Span.generateSpanForm(rng),
      sart: Sart.generateForm(rng),
    },
  };
}

// ---- Record schema 1 helpers (spec 020 §4a) ----------------------------------------------------
// A JSON-safe deep clone. The persisted response block must round-trip through storage EXACTLY, or
// the replay invariant is a claim rather than a fact. Anything unclonable (circular, function-valued)
// is refused outright rather than silently half-stored.
function cloneResponses(responses) {
  if (responses == null) return null;
  try {
    const clone = JSON.parse(JSON.stringify(responses));
    return clone && typeof clone === 'object' ? clone : null;
  } catch { return null; }
}

// Ruling 3 (031) interruption metadata. Shape is fixed here so the screener tier has somewhere to
// write when it lands; BATTERY_V1 still ABORTS on an in-section hide, so what survives to a saved
// record is the BETWEEN-section interruptions only. Malformed entries are dropped, never guessed at.
export function normalizeInterruptions(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const it of list) {
    if (!it || typeof it !== 'object') continue;
    const atMs = Number(it.atMs), durationMs = Number(it.durationMs);
    if (!Number.isFinite(atMs) || !Number.isFinite(durationMs) || durationMs < 0) continue;
    out.push({
      section: typeof it.section === 'string' && ORDER.includes(it.section) ? it.section : null,
      phase: it.phase === 'section' ? 'section' : 'interstitial',
      atMs: Math.round(atMs),
      durationMs: Math.round(durationMs),
    });
  }
  return out;
}

// Score every section through its OWN engine scorer — no new math at the battery level, ever.
// responses: { pvt: trials[], flanker: trials[], span: sets[], sart: { tapped: [], taps: [] } }
export function scoreSitting(assembled, responses, meta = {}) {
  const sections = {};
  const flags = [];
  for (const name of assembled.order) {
    const r = (responses || {})[name];
    let d;
    if (name === 'pvt') d = Pvt.score(r || []);
    else if (name === 'flanker') d = Flanker.score(r || []);
    else if (name === 'span') d = Span.scoreSpan(r || []);
    else if (name === 'sart') d = Sart.score(assembled.forms.sart.items, (r && r.tapped) || []);
    else d = { score: null, invalid: true, reason: 'unknown-section' };
    sections[name] = d;
    if (d.invalid) flags.push(`${name}:${d.reason}`);
  }
  const raw = cloneResponses(responses);
  const rec = {
    recordSchema: RECORD_SCHEMA,
    batteryVersion: assembled.batteryVersion,
    seed: assembled.seed,
    order: assembled.order.slice(),
    instrumentVersions: Object.fromEntries(assembled.order.map((n) => [n, INSTRUMENTS[n].version])),
    sections,
    // THE RECONSTRUCTABILITY CONTRACT (020 §4a): the administered form comes back from the seed, the
    // person's side of it comes back from here. Before schema 1 this block did not exist and the
    // trial stream was discarded at the end of every sitting, which made the pilot unexecutable.
    responses: raw,
    interruptions: normalizeInterruptions(meta.interruptions),
    effort: { flags },
    conditions: meta.conditions || { attested: false },
    timing: meta.timing || null,
    incomplete: flags.length > 0,
  };
  if (raw == null) rec.responsesOmitted = true; // honest: say so rather than imply a replayable record
  // Administered use (manual/021 §3): optional participant CODE — additive field. The engine omits
  // FORMAT-invalid values (2-12 chars, letters/digits/hyphen only); it cannot detect all PII — the
  // app adds a digit-run guard and the practitioner carries the no-PII rule (021 §2).
  if (typeof meta.participant === 'string' && /^[A-Za-z0-9-]{2,12}$/.test(meta.participant)) {
    rec.participant = meta.participant;
  }
  return rec;
}

// ---- THE REPLAY INVARIANT (spec 020 §4a) --------------------------------------------------------
// Given a stored sitting, scoreSitting(assembleBattery(storedSeed), storedResponses) must reproduce
// the stored `sections` block EXACTLY. This is the testable form of the reconstructability claim —
// the chapter is only allowed to call a record auditable while this returns ok:true.
// Returns { ok, reason?, sections? }. Never throws on a corrupt record; a bad record is a false, not
// a crash, because this runs against whatever is in a stranger's localStorage.
export function replay(record) {
  if (!record || typeof record !== 'object') return { ok: false, reason: 'no-record' };
  if (!Number.isInteger(record.seed)) return { ok: false, reason: 'no-seed' };
  if (record.batteryVersion !== BATTERY_VERSION) return { ok: false, reason: 'version-mismatch' };
  if (record.recordSchema !== RECORD_SCHEMA) return { ok: false, reason: 'schema-mismatch' };
  if (!record.responses || typeof record.responses !== 'object') return { ok: false, reason: 'no-responses' };
  let recomputed;
  try { recomputed = scoreSitting(assembleBattery(record.seed), record.responses); }
  catch { return { ok: false, reason: 'replay-threw' }; }
  const ok = JSON.stringify(recomputed.sections) === JSON.stringify(record.sections);
  return ok ? { ok: true, sections: recomputed.sections } : { ok: false, reason: 'sections-differ', sections: recomputed.sections };
}

// Within-person comparison: same battery version, complete sittings only. Never a percentile.
export function compareSittings(record, priors = []) {
  const usable = (priors || []).filter((p) => p && p.batteryVersion === record.batteryVersion && !p.incomplete);
  return record.order.map((name) => ({
    section: name,
    title: SECTION_TITLES[name],
    now: record.sections[name],
    priors: usable.map((p) => (p.sections[name] && !p.sections[name].invalid ? p.sections[name].score : null)).filter((x) => x != null),
  }));
}
