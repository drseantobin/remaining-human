// brand.js — the ONE place the product's identity lives. The engine and manual are name-agnostic;
// only the app surfaces this. Rebrand the whole app by editing this file.
//
// NAME (2026-07-25): Forma is the umbrella brand; "Remaining Human" is the measure people name.
// The naming rationale, the retired working title, and the reason for retiring it live in the
// private manual and deliberately NOT in this file — this module ships to the public deploy, and a
// written characterisation of another company's mark does not belong in source a stranger can read.
export const BRAND = 'Remaining Human';
export const TAGLINE = 'Where is your mind right now?';
export const DESCRIPTOR = 'A standardized measure of the human capacities that stay decisive as AI does more of the thinking — vigilance, attention, memory, reading, judgment, presence.';

// The AI-era thesis, stated plainly. Shown on the home screen so the
// product says what it's for, not just what it does.
// STAGED FOR RATIFICATION (2026-08-05): the reading-fidelity and decision-autonomy clauses return
// here in the same edit that adds those instruments to the battery, exactly as the previous comment
// promised. This file must not enumerate a capacity the battery does not administer — and
// engine/battery.js CONTENT_STATUS keeps this branch off the public deploy until Sean ratifies the
// content, so the two can never fall out of step.
export const THESIS = 'As AI supplies more of the raw thinking, the advantage shifts to the capacities it can’t hand you: staying ready when nothing is happening, holding focus against distraction, keeping several things in mind at once, reading what a text actually said, keeping your own judgment when a machine is confidently wrong, and staying present through monotony. This measures those — the durable human capacities, not knowledge a search can replace.';

// The capacities measured here, ordered by how decisive each becomes as intelligence is offloaded
// (manual/002). Each maps to one instrument. status 'live' = in the standardized battery today;
// 'preview' = built + audited, content in ratification (experienceable, not yet scored into a sitting).
export const CAPACITIES = [
  { key: 'pvt',      name: 'Vigilance',            blurb: 'Holding readiness when nothing is happening — the floor under every other capacity.', status: 'live' },
  { key: 'flanker',  name: 'Executive attention', blurb: 'Locking onto what matters while conflicting signals pull at you.', status: 'live' },
  { key: 'span',     name: 'Working memory',      blurb: 'Keeping several things in mind at once while you keep doing the work.', status: 'live' },
  { key: 'sart',     name: 'Sustained attention', blurb: 'Staying present through monotony instead of slipping onto autopilot.', status: 'live' },
  // STAGED 'live' (2026-08-05, branch six-capacity). These two are in the battery blueprint and
  // fully administrable, but their CONTENT is still awaiting Sean's ratification (manual/050), and
  // engine/battery.js CONTENT_STATUS + tools/sync-public.sh together make it impossible to publish
  // this branch until it lands. "Build it or don't include it" (Sean, 2026-07-26) is satisfied by
  // the instrument being finished; the remaining gate is the psychologist's, not the builder's.
  { key: 'svt',      name: 'Reading fidelity',    blurb: 'Taking in what a text actually said — and rejecting a plausible reword that changed the meaning.', status: 'live' },
  { key: 'decision', name: 'Decision autonomy',   blurb: 'Taking good advice and refusing bad — keeping your own judgment when the AI is wrong.', status: 'live' },
];
