// engine/battery.js — the assessment EVENT: fixed, versioned, single-sitting battery.
// Spec: manual/020-battery.md. Pure: no DOM, no storage, no Date — timestamps injected by the runner.

import { mulberry32 } from './prng.js';
import * as Flanker from './flanker.js';
import * as Sart from './sart.js';
import * as Span from './span.js';
import * as Pvt from './pvt.js';
import * as Svt from './svt.js';
import * as Dec from './decision.js';

// v2 (staged 2026-08-05, branch six-capacity): reading fidelity and decision autonomy join the
// blueprint. NOT MERGED OR SHIPPED until Sean's ratification packet (manual/050) comes back — the
// content both instruments administer is still provisional, and CONTENT_STATUS below is what stops
// it reaching anyone. Ratification-day procedure: manual/052.
export const BATTERY_VERSION = 2;

// RECORD SCHEMA — versioned SEPARATELY from the instruments (spec 020 §4a). Recording an extra
// field changes no stimulus, no instruction, no timing and no scoring, so mechanical instrument
// versioning is NOT triggered; the record schema is what moves. Schema 1 is the first schema that
// persists raw trial-level responses, and it is what makes the replay invariant testable.
export const RECORD_SCHEMA = 1;

// Fixed order (spec §2): least-effortful warm-up first, heaviest load mid-battery,
// sustained-attention-under-monotony deliberately LAST.
//
// Section order is a MEASUREMENT decision and is the psychologist's to make. Confirmed as it
// stands (manual/054 §0.2, 2026-08-05). The reasoning: the warm-up stays first; sustained
// attention stays last, because monotony has to arrive after the taker is tired, which is the
// whole point of it; and the two verbal, self-paced stations sit between the timed ones so nobody
// is asked to hold millisecond precision for the length of the sitting.
//
// Reordering is FREE and always will be: per-section sub-seeding (below) means a section's form
// depends on the sitting seed and its own name, never on its position, so changing this array
// re-rolls nothing and invalidates no comparison.
export const ORDER = ['pvt', 'flanker', 'span', 'svt', 'decision', 'sart'];

export const SECTION_TITLES = {
  pvt: 'Reaction & vigilance',
  flanker: 'Executive attention',
  span: 'Working memory',
  svt: 'Reading fidelity',
  decision: 'Decision autonomy',
  sart: 'Sustained attention',
};

export const INSTRUMENTS = {
  pvt: { version: Pvt.PVT_VERSION, instructions: Pvt.INSTRUCTIONS },
  flanker: { version: Flanker.FLANKER_VERSION, instructions: Flanker.INSTRUCTIONS },
  span: { version: Span.SPAN_VERSION, instructions: Span.INSTRUCTIONS },
  svt: { version: Svt.SVT_VERSION, instructions: Svt.INSTRUCTIONS },
  decision: { version: Dec.DECISION_VERSION, instructions: Dec.INSTRUCTIONS },
  sart: { version: Sart.SART_VERSION, instructions: Sart.INSTRUCTIONS },
};

// ---- CONTENT STATUS — the guard between an unratified item bank and a stranger ------------------
// Instruments that administer AUTHORED CONTENT (prose, items) carry a ratification status. Timed
// psychomotor tasks do not: a flanker arrow is not content anyone has to ratify. The battery is
// 'ratified' only when every content-bearing instrument in ORDER is. tools/sync-public.sh refuses
// to publish while this reads 'provisional', which is what makes the branch safe to build on: the
// two new stations are fully administrable here and cannot reach the public deploy by accident.
export const CONTENT_BEARING = { svt: Svt, decision: Dec };
export function contentStatus() {
  for (const name of ORDER) {
    const mod = CONTENT_BEARING[name];
    if (mod && mod.CONTENT_STATUS !== 'ratified') return 'provisional';
  }
  return 'ratified';
}
export const CONTENT_STATUS = contentStatus();

const LIMITS_BASE = 'This is an unnormed research battery. Scores are raw performance on a fixed task form — they cannot be compared to a population, and no percentile or ranking exists. What IS comparable: your own scores across sittings of the same battery version.';
const LIMITS_PROVISIONAL = ' Some sections of this build use PROVISIONAL content that has not been ratified by the psychologist who authors this instrument — treat those numbers as a demonstration of the mechanism, not as a measurement of you.';
export const LIMITS_TEXT = CONTENT_STATUS === 'ratified' ? LIMITS_BASE : LIMITS_BASE + LIMITS_PROVISIONAL;

// ---- PER-SECTION SUB-SEEDING (v2; forma-validity 2026-08-05, P6) --------------------------------
// v1 fed ONE stream to every generator in blueprint order, which made each instrument's form depend
// on the stream position handed to it — that is, on what else was in ORDER and on how many draws
// every upstream generator happened to consume. forma-validity measured the consequence on the
// staged v2 blueprint and it is severe: Dec.generateForm consumes 21 draws at 12 items and 35 at
// 18, so under a single stream **every decision item Sean added or removed during ratification
// would silently change the administered SART form.** An earlier draft of this file carried a
// comment claiming that could not happen. The comment was false; this is the fix.
//
// Each section now derives its own stream from (seed, section name). A section's form therefore
// depends on nothing but the sitting seed and its own version. Two consequences worth stating:
//   • ORDER becomes a pure PRESENTATION decision. Sean can reorder the battery on ratification day
//     without re-rolling a single form — which is the difference between a same-day ship and a
//     re-audit.
//   • An item bank can grow without touching any other instrument.
// This lands in the same commit as the BATTERY_VERSION 1 → 2 bump because that is the only moment
// it is free: it re-rolls every form, which after launch would be a change to every instrument.
export function sectionSeed(seed, name) {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h * 33) ^ name.charCodeAt(i)) >>> 0;
  return ((seed ^ h) >>> 0);
}

// Which scorers need the administered FORM to reproduce a score, and which are pure functions of
// the person's responses. This is what per-section replay keys on: a form-independent section can
// be re-scored from a record forever, whatever the battery blueprint has done since.
export const FORM_DEPENDENT = { pvt: false, flanker: false, span: false, svt: true, decision: true, sart: true };

const GENERATORS = {
  pvt: (rng) => Pvt.generateForm(rng),
  flanker: (rng) => Flanker.generateForm(rng),
  span: (rng) => Span.generateSpanForm(rng),
  svt: (rng) => Svt.generateForm(rng),
  decision: (rng) => Dec.generateForm(rng),
  sart: (rng) => Sart.generateForm(rng),
};

// The whole sitting is reproducible from (BATTERY_VERSION, seed).
export function assembleBattery(seed) {
  if (!Number.isInteger(seed)) throw new Error('assembleBattery requires an integer seed');
  const forms = {};
  for (const name of ORDER) {
    if (!GENERATORS[name]) throw new Error(`assembleBattery has no generator for section "${name}"`);
    forms[name] = GENERATORS[name](mulberry32(sectionSeed(seed, name)));
  }
  return { batteryVersion: BATTERY_VERSION, seed, order: ORDER.slice(), contentStatus: CONTENT_STATUS, forms };
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
    // The two content-bearing scorers take the FORM as well as the responses: the answer key and
    // the item bounds live on the form, never on the response, so a stored response cannot carry
    // its own key (svt.js header; decision.js corrupt-response gate).
    else if (name === 'svt') d = Svt.score(assembled.forms.svt, r || []);
    else if (name === 'decision') d = Dec.score(assembled.forms.decision, r || []);
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
    // Stamped on the record, not inferred at read time: a sitting taken under provisional content
    // must still say so years later, when the bank has long since been ratified.
    contentStatus: assembled.contentStatus || CONTENT_STATUS,
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
// PER-SECTION, not all-or-nothing (forma-validity P6, 2026-08-05). The v1 check was
// `record.batteryVersion !== BATTERY_VERSION → version-mismatch`, which meant the FIRST battery
// version bump would tell every taker who had already sat the battery that their sitting could no
// longer be checked. The promise on the home screen — "re-scorable from your own saved answers" —
// would have quietly become false for exactly the earliest takers.
//
// It does not have to break. Most of these scorers are pure functions of the person's responses:
// Pvt.score(trials), Flanker.score(trials), Span.scoreSpan(sets) never look at the form. Those
// sections stay replayable across any blueprint change, forever, provided their own instrument
// version has not moved. Only the form-dependent scorers (SART, reading fidelity, decision
// autonomy) need the administered form back, and that needs the battery version to match.
//
// Returns { ok, verified: [...], unverifiable: [{section, reason}], sections }. `ok` is true only
// when every section verified. Never throws: this runs against whatever is in a stranger's
// localStorage.
const KNOWN_SCHEMAS = [1]; // additive record fields are legal; a schema this build understands
export function replay(record) {
  if (!record || typeof record !== 'object') return { ok: false, reason: 'no-record', verified: [], unverifiable: [] };
  if (!Number.isInteger(record.seed)) return { ok: false, reason: 'no-seed', verified: [], unverifiable: [] };
  if (!KNOWN_SCHEMAS.includes(record.recordSchema)) return { ok: false, reason: 'schema-mismatch', verified: [], unverifiable: [] };
  if (!record.responses || typeof record.responses !== 'object') return { ok: false, reason: 'no-responses', verified: [], unverifiable: [] };
  if (!Array.isArray(record.order) || !record.sections) return { ok: false, reason: 'no-record', verified: [], unverifiable: [] };

  const sameBattery = record.batteryVersion === BATTERY_VERSION;
  let recomputed;
  try { recomputed = scoreSitting(assembleBattery(record.seed), record.responses); }
  catch { return { ok: false, reason: 'replay-threw', verified: [], unverifiable: [] }; }

  const verified = [], unverifiable = [];
  for (const name of record.order) {
    const recordedVersion = record.instrumentVersions ? record.instrumentVersions[name] : undefined;
    if (!INSTRUMENTS[name]) { unverifiable.push({ section: name, reason: 'instrument-retired' }); continue; }
    if (recordedVersion !== INSTRUMENTS[name].version) { unverifiable.push({ section: name, reason: 'instrument-version-moved' }); continue; }
    // A form-dependent scorer can only be re-run if this build can rebuild the same form.
    if (FORM_DEPENDENT[name] && !sameBattery) { unverifiable.push({ section: name, reason: 'form-not-reconstructable' }); continue; }
    if (!recomputed.sections[name]) { unverifiable.push({ section: name, reason: 'not-in-this-blueprint' }); continue; }
    if (JSON.stringify(recomputed.sections[name]) === JSON.stringify(record.sections[name])) verified.push(name);
    else unverifiable.push({ section: name, reason: 'sections-differ' });
  }
  const differs = unverifiable.some((u) => u.reason === 'sections-differ');
  return {
    ok: unverifiable.length === 0,
    reason: unverifiable.length === 0 ? undefined : (differs ? 'sections-differ' : 'partially-verifiable'),
    verified, unverifiable, sections: recomputed.sections,
  };
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
