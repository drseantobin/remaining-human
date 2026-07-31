// brand.js — the ONE place the product's identity lives. The engine and manual are name-agnostic;
// only the app surfaces this. Rebrand the whole app by editing this file.
//
// NAME (2026-07-25): Forma is the umbrella brand; "Remaining Human" is the measure people name.
// The naming rationale, the retired working title, and the reason for retiring it live in the
// private manual and deliberately NOT in this file — this module ships to the public deploy, and a
// written characterisation of another company's mark does not belong in source a stranger can read.
export const BRAND = 'Remaining Human';
export const TAGLINE = 'Where is your mind right now?';
export const DESCRIPTOR = 'A standardized measure of the human capacities that stay decisive as AI does more of the thinking — attention, memory, discernment, reading.';

// The AI-era thesis, stated plainly. Shown on the home screen so the
// product says what it's for, not just what it does.
export const THESIS = 'As AI supplies more of the raw thinking, the advantage shifts to the capacities it can’t hand you: staying attentive, holding things in mind, reading with fidelity, and keeping your own judgment when a machine is confidently wrong. This measures those — the durable human capacities, not knowledge a search can replace.';

// The capacities measured here, ordered by how decisive each becomes as intelligence is offloaded
// (manual/002). Each maps to one instrument. status 'live' = in the standardized battery today;
// 'preview' = built + audited, content in ratification (experienceable, not yet scored into a sitting).
export const CAPACITIES = [
  { key: 'pvt',      name: 'Vigilance',            blurb: 'Holding readiness when nothing is happening — the floor under every other capacity.', status: 'live' },
  { key: 'flanker',  name: 'Executive attention', blurb: 'Locking onto what matters while conflicting signals pull at you.', status: 'live' },
  { key: 'span',     name: 'Working memory',      blurb: 'Keeping several things in mind at once while you keep doing the work.', status: 'live' },
  { key: 'sart',     name: 'Sustained attention', blurb: 'Staying present through monotony instead of slipping onto autopilot.', status: 'live' },
  { key: 'svt',      name: 'Reading fidelity',    blurb: 'Taking in what a text actually said — and rejecting a plausible reword that changed the meaning.', status: 'preview' },
  { key: 'decision', name: 'Decision autonomy',   blurb: 'Taking good advice and refusing bad — keeping your own judgment when the AI is wrong.', status: 'preview' },
];
