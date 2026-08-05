// app/app.js — the administration runner + HUD. All science lives in engine/ (pure, tested);
// this file only renders forms, captures raw responses with honest timing, and displays records.
// Timing: performance.now() for RTs; input via pointerdown + keydown (whichever fires first wins).
import * as B from '../engine/battery.js?b=9';
import * as Svt from '../engine/svt.js?b=9';
import * as Dec from '../engine/decision.js?b=9';
import * as Flanker from '../engine/flanker.js?b=9';
import { mulberry32 } from '../engine/prng.js?b=9';
import { BRAND, TAGLINE, DESCRIPTOR, THESIS, CAPACITIES } from './brand.js?b=9';

const app = document.getElementById('app');
const STORE = 'assess.sittings.v1';
const state = { sitting: null };

// The practitioner surface (administered sittings, participant roster, manual/021) is a DIFFERENT
// product from the public instrument and must not greet a stranger arriving from a video link — a
// consumer landing that offers "administered sitting" and "participant roster" reads as a clinical
// system the visitor has wandered into. Gate it: /app/?mode=practitioner.
const PRACTITIONER = new URLSearchParams(location.search).get('mode') === 'practitioner';

// Ruling 1 (manual/031) — the selection covenant. BOTH halves are required in consent copy, and the
// first half must describe what actually happens TODAY. Nothing is uploaded anywhere in this build:
// there is no server, no account, no pipeline. Writing "your data builds the science" as though a
// pipeline existed would be exactly the overclaim this product is built against. So the honest
// formulation at launch is: the science half is real but OPT-IN AND MANUAL, and it is named as such.
const COVENANT_OWNERSHIP = 'Your result belongs to you, permanently. It is never a criterion in a decision made about you by anyone — not an employer, not a school, not an insurer, not us. If an instrument is ever built for that purpose, it will be a separate product with its own consent, and nothing you do here will carry into it.';
const COVENANT_DATA = 'Nothing is uploaded. There is no account and no server: every answer stays in this browser, on this device. If you want your sitting to help build the science behind this measure, you can download it at the end and send it in — a deliberate act you take, never something that happens quietly in the background.';

const isRecord = (r) => r && typeof r === 'object' && Array.isArray(r.order) && r.sections && typeof r.sections === 'object' && r.order.every((n) => r.sections[n]);
const loadSittings = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || '[]');
    return Array.isArray(raw) ? raw.filter(isRecord) : []; // a corrupt record can never brick the HUD
  } catch { return []; }
};
// Schema 1 records carry the raw trial stream, so a sitting is now ~10x larger than a scored-only
// record. localStorage quota is finite and varies by browser. Degrade in a stated order — never
// lose the sitting itself, and never silently pretend a stripped record is still replayable.
const saveSitting = (rec) => {
  const all = loadSittings(); all.push(rec);
  const put = (list) => { localStorage.setItem(STORE, JSON.stringify(list)); };
  try { put(all); return { saved: true, full: true }; } catch {}
  // 1st fallback: keep the NEW sitting replayable, strip raw responses from the older ones.
  try {
    put(all.map((r, k) => (k === all.length - 1 ? r : { ...r, responses: undefined, responsesOmitted: true })));
    return { saved: true, full: true };
  } catch {}
  // 2nd fallback: scores survive, replayability does not — and the record says so.
  try {
    put(all.map((r) => ({ ...r, responses: undefined, responsesOmitted: true })));
    return { saved: true, full: false };
  } catch {}
  return { saved: false, full: false };
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------- HOME / HUD ----------------
function renderHome() {
  const sittings = loadSittings();
  const rows = sittings.slice().reverse().map((r) => {
    const scores = r.order.map((n) => r.sections[n].invalid ? '—' : Number(r.sections[n].score)).join(' · ');
    return `<div class="sittingrow"><span class="small muted">${esc((r.timing && r.timing.completedAt || '').slice(0, 10))} · v${r.batteryVersion}</span><span class="small">${scores} ${r.incomplete ? '<span class="bad">(incomplete)</span>' : '<span class="ok">✓</span>'}</span></div>`;
  }).join('');
  // "Build it or don't include it" (Sean, 2026-07-26): the public home shows ONLY finished,
  // scored instruments — no "coming soon", no preview advertising. Unratified instruments are
  // invisible to the public and live behind ?mode=practitioner for Sean's ratification workflow.
  // When content is ratified they join CAPACITIES as status 'live' and appear here, finished.
  const shown = PRACTITIONER ? CAPACITIES : CAPACITIES.filter((c) => c.status === 'live');
  const chip = (c) => `<div class="capchip ${c.status}"><span class="capname">${esc(c.name)}</span>${c.status === 'live' ? '' : '<span class="capstatus">unratified — practitioner view</span>'}<p class="capblurb">${esc(c.blurb)}</p></div>`;
  app.innerHTML = `
    <div class="wordmark">${esc(BRAND)}</div>
    <p class="tagline">${esc(TAGLINE)}</p>
    <p class="muted">${esc(THESIS)}</p>
    <button class="btn" id="begin">Begin →</button>
    <p class="eyebrow" style="margin-bottom:10px;">What this measures</p>
    <div class="capgrid">${shown.map(chip).join('')}</div>
    <div class="card limits"><p class="small muted">${esc(B.LIMITS_TEXT)}</p></div>
    <div class="card"><p class="eyebrow">What this costs you</p><p class="small muted" style="margin-top:4px;">About 15 minutes, in one go, with nothing else running. Parts of it are boring on purpose — the boredom is the measurement. There is no way to fail and no verdict at the end, only your own numbers.</p></div>
    ${PRACTITIONER ? `<button class="btn ghost" id="administer">Administered sitting (practitioner) →</button>` : ''}
    ${PRACTITIONER && loadSittings().some((r) => r.participant) ? `<button class="btn ghost" id="roster">Participant roster →</button>` : ''}
    ${PRACTITIONER ? `<button class="btn ghost" id="preview">Preview the next two instruments →</button>` : ''}
    ${PRACTITIONER ? `<button class="btn ghost" id="ratify">Ratification pass — rule on the item banks →</button>` : ''}
    ${sittings.length ? `<div class="card"><p class="eyebrow" style="margin-bottom:6px;">Your sittings</p>${rows}</div>` : ''}
    <div class="card"><p class="eyebrow">Who this belongs to</p><p class="small muted" style="margin-top:4px;">${esc(COVENANT_OWNERSHIP)}</p><p class="small muted" style="margin-top:8px;">${esc(COVENANT_DATA)}</p></div>
    <p class="small faint" style="margin-top:18px;">Each sitting is reconstructable from its seed and re-scorable from your own saved answers — fully auditable, by you.</p>`;
  document.getElementById('begin').onclick = () => renderAttest();
  const adm = document.getElementById('administer'); if (adm) adm.onclick = () => renderAttest({ administered: true });
  const ros = document.getElementById('roster'); if (ros) ros.onclick = renderRoster;
  const prev = document.getElementById('preview'); if (prev) prev.onclick = renderPreviewMenu;
  const rat = document.getElementById('ratify'); if (rat) rat.onclick = renderRatifyMenu;
}

// ---------------- PREVIEW TRACK (walled) ----------------
// Reading fidelity (SVT) and Decision Autonomy are BUILT and AUDITED but their content is still
// awaiting Sean's ratification (manual/013, manual/015a) — so they are NOT part of the standardized
// battery yet. This track lets him (or anyone) EXPERIENCE both instruments to speed ratification.
// Hard wall: preview runs are NEVER persisted to STORE and NEVER enter a scored sitting record — the
// only thing shared with the standardized battery is the pure, already-audited scorer functions.
function renderPreviewMenu() {
  app.innerHTML = `
    <p class="eyebrow">Preview — not yet standardized</p>
    <h1>Try the next two instruments</h1>
    <div class="card"><p class="small muted">These are built and tested, but their content (the passages, the estimation items) is still provisional — awaiting ratification before they join the real battery. A preview run is <strong>never saved</strong> and never counts as a sitting. Use it to see how the instrument feels, not to get a score that means anything yet.</p></div>
    <button class="btn" id="p-svt">Preview: Reading fidelity →</button>
    <button class="btn" id="p-dec">Preview: Decision autonomy →</button>
    <button class="btn ghost" id="p-back">Back</button>`;
  document.getElementById('p-svt').onclick = () => previewSvt();
  document.getElementById('p-dec').onclick = () => previewDecision();
  document.getElementById('p-back').onclick = renderHome;
}

// ---------------- ATTESTATION ----------------
// DURATION: 11.7 minutes of task time, MEASURED by tools/e2e-drive.mjs on 2026-08-05 against the
// six-section blueprint with the 12 provisional decision items and human-plausible latencies. The
// copy says 15 to leave headroom for a real person, who is slower than a scripted one, and because
// the ratified item bank will be larger than 12. manual/052 re-measures and updates this on
// ratification day rather than letting the number be inherited from a sentence.
const ADMIN_SCRIPT = "This takes about 15 minutes in one sitting. It measures six capacities — reaction and vigilance, filtering distraction, working memory, reading accurately, judging advice, and sustained attention. It is deliberately plain, and parts are boring on purpose — the boredom is part of what\u2019s measured. There are no trick questions and no way to fail: the result is a baseline for comparison with your own future sittings, not a verdict. Please silence your phone and put it out of reach. Work alone, without pauses, until it tells you you\u2019re done.";

function renderAttest(opts = {}) {
  const administered = !!opts.administered;
  app.innerHTML = administered ? `
    <p class="eyebrow">Administered sitting · manual/021</p>
    <h1>Practitioner setup</h1>
    <div class="card">
      <p class="eyebrow">Participant code</p>
      <p class="small muted" style="margin:4px 0 8px;">Initials or a code only (2–12 letters/digits/hyphen). Never a full name, date of birth, or any identifier — the mapping to a person lives in YOUR records, not here.</p>
      <input id="pcode" type="text" maxlength="12" placeholder="e.g. JD or P-07" style="width:100%;" autocomplete="off"/>
      <p class="small hud-invalid" id="pcodeerr" style="display:none; margin-top:4px;">2–12 characters, letters/digits/hyphen — and nothing that looks like a date or record number (no 4+ digit runs).</p>
    </div>
    <div class="card">
      <p class="eyebrow">Read to the participant, verbatim</p>
      <p class="small" style="margin:6px 0 0;">“${esc(ADMIN_SCRIPT)}”</p>
    </div>
    <div class="card">
      <label class="att"><input type="checkbox" id="a1"/><span class="small">I administered this under the standardized conditions: script read verbatim, quiet room, phone out of reach, same device class as this participant's prior sittings, one continuous sitting.</span></label>
    </div>` : `
    <p class="eyebrow">Before you begin</p>
    <h1>One quiet sitting</h1>
    <div class="card" style="border-left:3px solid var(--amber);">
      <p class="eyebrow">Read this first — it is the most common way a sitting is lost</p>
      <p class="small" style="margin-top:6px;">If you leave this screen mid-task — take a call, switch apps, let the phone lock — the sitting <strong>ends and nothing is recorded</strong>. That is deliberate: a background tab stops keeping accurate time, and a task timed in milliseconds cannot be paused and resumed honestly. ${/Mobi/.test(navigator.userAgent) ? 'On a phone: turn on Do Not Disturb, and set your screen to stay awake, before you tap Start.' : 'Close anything that will pop up, and put your phone out of reach, before you click Start.'}</p>
    </div>
    <div class="card">
      <label class="att"><input type="checkbox" id="a1"/><span class="small">I'm in a quiet place and can complete this in one sitting (~15 minutes) without interruptions.</span></label>
      <label class="att"><input type="checkbox" id="a2"/><span class="small">This will be my own, unassisted work.</span></label>
    </div>
    <div class="card">
      <p class="eyebrow">Before you start — what happens to this</p>
      <p class="small muted" style="margin-top:4px;">${esc(COVENANT_OWNERSHIP)}</p>
      <p class="small muted" style="margin-top:8px;">${esc(COVENANT_DATA)}</p>
    </div>`;
  app.innerHTML += administered ? '' : `
    <div class="card">
      <p class="eyebrow">Before any number exists</p>
      <p class="small muted" style="margin:4px 0 8px;">If one of these capacities comes back lower than you'd like — what's one small thing you'd be willing to do about it this month? Written now, it's your plan. Written after, it's a reaction.</p>
      <textarea id="precommit" rows="2" maxlength="200" placeholder="e.g. phone out of the room for my first work block" style="width:100%;"></textarea>
    </div>`;
  app.innerHTML += `
    <button class="btn" id="start" disabled>Start →</button>
    <button class="btn ghost" id="back">Back</button>`;
  const a1 = document.getElementById('a1'), a2 = document.getElementById('a2'), st = document.getElementById('start');
  const pcode = document.getElementById('pcode');
  const codeOk = () => !administered || (/^[A-Za-z0-9-]{2,12}$/.test((pcode.value || '').trim()) && !/\d{4}/.test((pcode.value || '').trim()));
  const sync = () => {
    st.disabled = !(a1.checked && (administered || a2.checked) && codeOk());
    const err = document.getElementById('pcodeerr');
    if (err) err.style.display = (pcode.value && !codeOk()) ? '' : 'none';
  };
  a1.onchange = sync; if (a2) a2.onchange = sync; if (pcode) pcode.oninput = sync;
  document.getElementById('back').onclick = renderHome;
  st.onclick = () => {
    const seed = (Math.random() * 2 ** 31) | 0;
    const pcEl = document.getElementById('precommit');
    const preCommit = pcEl ? (pcEl.value || '').trim().slice(0, 200) : '';
    if (preCommit) { try { localStorage.setItem('assess.precommit.v1', JSON.stringify({ text: preCommit, writtenAt: new Date().toISOString() })); } catch {} }
    const participant = administered ? (pcode.value || '').trim() : null;
    state.sitting = {
      preCommit, participant, administered,
      assembled: B.assembleBattery(seed), responses: {}, idx: 0,
      startedAt: new Date().toISOString(), t0: performance.now(),
      perSection: {}, lastActiveAt: Date.now(),
      // Ruling 3 (manual/031): interruption metadata. BATTERY_V1 still ABORTS on an in-section hide,
      // so what reaches a saved record is the BETWEEN-section interruptions — real, and until now
      // unrecorded. SCREENER_V1 will write in-section entries here without aborting.
      interruptions: [], currentSection: null, phase: 'interstitial',
      conditions: { attested: true, device: /Mobi/.test(navigator.userAgent) ? 'mobile' : 'desktop' },
    };
    armInterruptionLog();
    renderInterstitial();
  };
}

// ---------------- INTERRUPTION LOG (Ruling 3, manual/031) ----------------
// Sitting-scoped, independent of the per-section watchdog. The watchdog decides whether an
// interruption KILLS the sitting (it does, in-section, for BATTERY_V1); this decides whether the
// interruption is REMEMBERED. Those are different questions and were previously conflated, which is
// why no record has ever carried interruption data.
const interruptionLog = { disarm: null };
function armInterruptionLog() {
  disarmInterruptionLog();
  let hiddenAt = null;
  const onVis = () => {
    const s = state.sitting;
    if (!s) return;
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt == null) return;
    s.interruptions.push({
      section: s.currentSection,
      phase: s.phase,
      atMs: Math.round(hiddenAt - Date.parse(s.startedAt)),
      durationMs: Date.now() - hiddenAt,
    });
    hiddenAt = null;
  };
  document.addEventListener('visibilitychange', onVis);
  interruptionLog.disarm = () => document.removeEventListener('visibilitychange', onVis);
}
function disarmInterruptionLog() {
  if (interruptionLog.disarm) { interruptionLog.disarm(); interruptionLog.disarm = null; }
}

// ---------------- SECTION FLOW ----------------
// Between-section meaning lines (council 2026-07-04): meaning accumulates in the WRAPPER —
// the trial stream stays untouched. One quiet line each; the identity frame, not decoration.
const MEANING = {
  pvt: 'Pure vigilance — the capacity that thins first under constant stimulation. It is boring on purpose: the boredom is the measurement.',
  flanker: 'Choosing the signal over the noise — the exact skill every feed is engineered against.',
  span: 'Holding a thread while working on something else — what deep work runs on.',
  svt: 'Taking in what the text actually said, not the gist you expected — the capacity a summary quietly does for you.',
  decision: 'Keeping your own judgment when a confident machine is wrong. Taking good advice is easy; refusing bad advice is the measurement.',
  sart: 'Staying present when nothing is demanding your attention — the rarest state in a notification economy.',
};
function renderInterstitial() {
  const s = state.sitting;
  if (!s) return renderHome();
  // Single-sitting contract: >5 min idle between sections → discard, start over.
  if (Date.now() - s.lastActiveAt > 5 * 60 * 1000) {
    disarmInterruptionLog();
    state.sitting = null;
    app.innerHTML = `<h1>Sitting interrupted</h1><div class="card"><p class="muted">More than a few minutes passed mid-battery, so this sitting can't continue — a standardized battery is one continuous sitting. Nothing was recorded.</p></div><button class="btn" id="again">Start over →</button>`;
    document.getElementById('again').onclick = renderAttest;
    return;
  }
  if (s.idx >= s.assembled.order.length) return finishSitting();
  const name = s.assembled.order[s.idx];
  s.currentSection = name; s.phase = 'interstitial';
  app.innerHTML = `
    <p class="eyebrow">Section ${s.idx + 1} of ${s.assembled.order.length}</p>
    <h1>${esc(B.SECTION_TITLES[name])}</h1>
    <div class="card"><p>${esc(B.INSTRUMENTS[name].instructions)}</p></div>
    ${MEANING[name] ? `<p class="small faint" style="margin-top:6px;">${esc(MEANING[name])}</p>` : ''}
    <button class="btn" id="go">Start section →</button>`;
  document.getElementById('go').onclick = () => {
    const t0 = performance.now();
    s.phase = 'section';
    const done = (response) => {
      s.responses[name] = response;
      s.perSection[name] = Math.round(performance.now() - t0);
      s.lastActiveAt = Date.now();
      s.phase = 'interstitial';
      s.idx += 1;
      renderInterstitial();
    };
    // Dispatch by NAME with an explicit table. A section named in the blueprint with no runner
    // must fail loudly here rather than fall through to a default and administer the wrong task.
    const RUNNERS = { pvt: runPvt, flanker: runFlanker, span: runSpan, svt: runSvt, decision: runDecision, sart: runSart };
    const run = RUNNERS[name];
    if (!run) {
      app.innerHTML = `<h1>This build is incomplete</h1><div class="card"><p class="muted">The blueprint asks for a section called “${esc(name)}” that this build cannot administer. Nothing has been recorded.</p></div><button class="btn" id="again">Back →</button>`;
      document.getElementById('again').onclick = renderHome;
      return;
    }
    run(s.assembled.forms[name], done);
  };
}

function finishSitting() {
  const s = state.sitting;
  const record = B.scoreSitting(s.assembled, s.responses, {
    conditions: s.conditions,
    participant: s.participant || undefined, // administered use (manual/021) — engine validates the code
    interruptions: s.interruptions,          // Ruling 3 (manual/031) — recorded, not inferred
    timing: { startedAt: s.startedAt, completedAt: new Date().toISOString(), sittingMs: Math.round(performance.now() - s.t0), perSection: s.perSection },
  });
  disarmInterruptionLog();
  const saved = saveSitting(record);
  state.sitting = null;
  renderReport(record, saved);
}

// ---------------- SECTION WATCHDOG (measurement integrity) ----------------
// A battery section must be CONTINUOUSLY attended. Two abort triggers, per review:
// (1) tab hidden during a timed section (standard for timed testing); (2) no input for
// IDLE_ABORT_MS in a section that expects regular input (PVT/SART auto-advance and would
// otherwise happily score a walked-away run). Abort = discard the sitting, record nothing.
const IDLE_ABORT_MS = 60 * 1000;
// SELF-PACED STATIONS NEED A DIFFERENT IDLE RULE. PVT, flanker and SART auto-advance and expect
// input every few seconds, so 60 seconds of silence means the person walked away. On reading
// fidelity, silence IS the task: reading a 140-word passage carefully takes longer than the abort
// threshold, so the 60s rule would kill an honest sitting mid-paragraph. The self-paced stations
// keep the VISIBILITY abort — leaving the screen mid-passage is a genuine integrity problem,
// because the text can be copied out — and take a long idle ceiling checked at item boundaries.
// manual/013 §5 sets no reading cap: the instrument is self-paced by design, and this constant
// bounds abandonment without touching the instrument.
const SELF_PACED_IDLE_ABORT_MS = 5 * 60 * 1000;
const watch = { lastInput: 0, disarm: null };
function armWatch(onAbort, idleMs = IDLE_ABORT_MS) {
  watch.lastInput = performance.now();
  let aborted = false;
  const doAbort = (reason) => { if (aborted) return; aborted = true; onAbort(reason || 'idle'); };
  const onVis = () => { if (document.hidden) doAbort('hidden'); };
  document.addEventListener('visibilitychange', onVis);
  watch.disarm = () => document.removeEventListener('visibilitychange', onVis);
  return { idleExceeded: () => performance.now() - watch.lastInput > idleMs, doAbort, isAborted: () => aborted };
}
function touchWatch() { watch.lastInput = performance.now(); }
const ABORT_REASONS = {
  hidden: 'This tab was hidden or covered mid-section. Timed sections can\u2019t pause — background tabs also throttle timers, which corrupts timing.',
  idle: 'A long stretch passed with no input during a section that expects continuous responses.',
};
function abortSitting(reason) {
  if (watch.disarm) { watch.disarm(); watch.disarm = null; }
  disarmInterruptionLog();
  state.sitting = null;
  app.innerHTML = `<h1>Sitting interrupted</h1>
    <div class="card"><p class="muted"><strong>Why:</strong> ${esc(ABORT_REASONS[reason] || 'The section lost continuity.')}</p>
    <p class="muted small" style="margin-top:8px;">A standardized battery is one continuous, attended run — so nothing was recorded, and no partial score exists. Start fresh when you have ~15 uninterrupted minutes.</p></div>
    <button class="btn" id="again">Start over →</button>`;
  document.getElementById('again').onclick = renderAttest;
}

// ---------------- TASK: PVT ----------------
function runPvt(form, done) {
  const trials = [];
  let i = 0;
  const stage = document.createElement('div');
  stage.className = 'stage';
  // #app is aria-live="polite"; a timed task re-renders every trial, which turns that into a
  // screen-reader firehose (and, on the SART, reads the stimulus aloud). Silence the task subtree —
  // navigational and report screens keep their announcements. (manual/007 §1: this battery is
  // visuo-motor throughout and a non-visual administration is a different test, stated openly.)
  stage.setAttribute('aria-live', 'off');
  stage.innerHTML = `<p class="hint">Press anywhere (or any key) the moment the circle fills</p><div id="pv"></div><p class="progress" id="pp"></p>`;
  app.innerHTML = ''; app.appendChild(stage);
  const pv = stage.querySelector('#pv'), pp = stage.querySelector('#pp');
  let phase = 'idle', shownAt = 0, timer = null, guard = 0;
  const w = armWatch((reason) => { clearTimeout(timer); stage.removeEventListener('pointerdown', press); window.removeEventListener('keydown', onKey); abortSitting(reason); });
  const press = () => {
    const now = performance.now();
    touchWatch();
    if (now < guard) return; // debounce between trials
    if (phase === 'wait') { clearTimeout(timer); trials.push({ rt: null, falseStart: true, miss: false }); next(); }
    else if (phase === 'go') { clearTimeout(timer); trials.push({ rt: Math.round(now - shownAt), falseStart: false, miss: false }); next(); }
  };
  const onKey = (e) => { if (!e.repeat) press(); };
  stage.addEventListener('pointerdown', press);
  window.addEventListener('keydown', onKey);
  function next() {
    if (w.isAborted()) return;
    if (w.idleExceeded()) { w.doAbort('idle'); return; }
    guard = performance.now() + 300;
    if (i >= form.trials.length) {
      stage.removeEventListener('pointerdown', press); window.removeEventListener('keydown', onKey);
      if (watch.disarm) { watch.disarm(); watch.disarm = null; }
      done(trials); return;
    }
    pp.textContent = `${i + 1} / ${form.trials.length}`;
    pv.innerHTML = '<div class="pvt-wait"></div>';
    phase = 'wait';
    timer = setTimeout(() => {
      pv.innerHTML = '<div class="pvt-go"></div>';
      phase = 'go'; shownAt = performance.now();
      timer = setTimeout(() => { trials.push({ rt: null, falseStart: false, miss: true }); next(); }, form.responseWindowMs);
    }, form.trials[i].isiMs);
    i += 1;
  }
  next();
}

// ---------------- TASK: FLANKER ----------------
function runFlanker(form, done) {
  const seq = [...form.practice.map((t) => ({ ...t, practice: true })), ...form.trials.map((t) => ({ ...t, practice: false }))];
  const out = [];
  let i = 0;
  const stage = document.createElement('div');
  stage.className = 'stage';
  // #app is aria-live="polite"; a timed task re-renders every trial, which turns that into a
  // screen-reader firehose (and, on the SART, reads the stimulus aloud). Silence the task subtree —
  // navigational and report screens keep their announcements. (manual/007 §1: this battery is
  // visuo-motor throughout and a non-visual administration is a different test, stated openly.)
  stage.setAttribute('aria-live', 'off');
  stage.innerHTML = `<p class="hint" id="fh"></p><div id="fs" class="arrows"></div><div class="respond-row"><button id="bl" aria-label="left">←</button><button id="br" aria-label="right">→</button></div><p class="progress" id="fp"></p>`;
  app.innerHTML = ''; app.appendChild(stage);
  const fs = stage.querySelector('#fs'), fp = stage.querySelector('#fp'), fh = stage.querySelector('#fh');
  let shownAt = 0, accepting = false, timer = null;
  const glyph = (t) => {
    const c = t.dir === 'L' ? '←' : '→';
    const f = t.congruent ? c : (t.dir === 'L' ? '→' : '←');
    return `${f} ${f} ${c} ${f} ${f}`;
  };
  const w = armWatch((reason) => { clearTimeout(timer); window.removeEventListener('keydown', onKey); abortSitting(reason); });
  const answer = (dir) => {
    touchWatch();
    if (!accepting) return;
    accepting = false; clearTimeout(timer);
    const t = seq[i];
    const rec = { congruent: t.congruent, correct: dir === t.dir, rt: Math.round(performance.now() - shownAt) };
    if (!t.practice) out.push(rec);
    if (t.practice) { fs.textContent = rec.correct ? '✓' : '✗'; setTimeout(next, 420); }
    else { fs.textContent = ''; setTimeout(next, t.iti); }
    i += 1;
  };
  const onKey = (e) => { if (e.key === 'ArrowLeft') answer('L'); else if (e.key === 'ArrowRight') answer('R'); };
  stage.querySelector('#bl').onclick = () => answer('L');
  stage.querySelector('#br').onclick = () => answer('R');
  window.addEventListener('keydown', onKey);
  function next() {
    if (w.isAborted()) return;
    if (w.idleExceeded()) { w.doAbort('idle'); return; }
    if (i >= seq.length) { window.removeEventListener('keydown', onKey); if (watch.disarm) { watch.disarm(); watch.disarm = null; } done(out); return; }
    const t = seq[i];
    fh.textContent = t.practice ? 'Practice — respond to the CENTER arrow' : 'Respond to the CENTER arrow';
    fp.textContent = t.practice ? `practice ${i + 1} / ${form.practice.length}` : `${i + 1 - form.practice.length} / ${form.trials.length}`;
    fs.className = 'fixation'; fs.textContent = '+';
    setTimeout(() => {
      fs.className = 'arrows'; fs.textContent = glyph(t);
      shownAt = performance.now(); accepting = true;
      // Window elapsed: a timeout. Since FLANKER_VERSION 2 the scorer counts this in the accuracy
      // denominator rather than dropping the trial (manual/010 §3).
      // TWO FIXES HERE, 2026-08-05 (forma-validity):
      //  1. The ITI was hardcoded to 500ms on the timeout path, ignoring this trial's SEEDED
      //     `t.iti` (500–950ms). The ADMINISTERED form therefore stopped matching the form the seed
      //     generates, on every timeout — falsifying manual/001's "every administered form can be
      //     reconstructed from (version, seed)" in a case no test could see, because scoring never
      //     reads the ITI and so replay still passed.
      //  2. The response window was the literal 2000, a second copy of the engine's
      //     RESPONSE_WINDOW_MS. A duplicated constant drifts, and this one would drift the timing
      //     of a live instrument without any fingerprint test noticing.
      timer = setTimeout(() => {
        if (!accepting) return;
        accepting = false;
        if (!t.practice) out.push({ congruent: t.congruent, correct: false, rt: null });
        fs.textContent = ''; i += 1; setTimeout(next, t.iti);
      }, Flanker.RESPONSE_WINDOW_MS);
    }, 420);
  }
  next();
}

// ---------------- TASK: SYMMETRY SPAN ----------------
function runSpan(form, done) {
  const results = [];
  let si = 0;
  const stage = document.createElement('div');
  stage.className = 'stage';
  // #app is aria-live="polite"; a timed task re-renders every trial, which turns that into a
  // screen-reader firehose (and, on the SART, reads the stimulus aloud). Silence the task subtree —
  // navigational and report screens keep their announcements. (manual/007 §1: this battery is
  // visuo-motor throughout and a non-visual administration is a different test, stated openly.)
  stage.setAttribute('aria-live', 'off');
  app.innerHTML = ''; app.appendChild(stage);
  const w = armWatch((reason) => abortSitting(reason));
  function runSet() {
    if (w.isAborted()) return;
    if (si >= form.sets.length) { if (watch.disarm) { watch.disarm(); watch.disarm = null; } done(results); return; }
    const set = form.sets[si];
    let ii = 0, symCorrect = 0;
    function judge() {
      if (w.isAborted()) return;
      if (w.idleExceeded()) { w.doAbort('idle'); return; }
      if (ii >= set.items.length) return recall();
      const item = set.items[ii];
      stage.innerHTML = `<p class="hint">Is this pattern symmetric (left–right mirror)?</p><div class="symgrid">${item.grid.map((v) => `<div class="${v ? 'on' : ''}"></div>`).join('')}</div><div class="respond-row"><button id="ys">Symmetric</button><button id="ns">Not</button></div><p class="progress">set ${si + 1} of ${form.sets.length}</p>`;
      let decided = false;
      const decide = (saysSym) => {
        touchWatch();
        if (decided) return; decided = true; clearTimeout(cap);
        if (saysSym === item.symmetric) symCorrect += 1;
        flash();
      };
      const cap = setTimeout(() => decide(null), form.symTimeCapMs); // timeout = incorrect
      stage.querySelector('#ys').onclick = () => decide(true);
      stage.querySelector('#ns').onclick = () => decide(false);
    }
    function flash() {
      const cell = set.items[ii].cell;
      stage.innerHTML = `<p class="hint">Remember this position</p><div class="recallgrid">${Array.from({ length: 16 }, (_, k) => `<button class="${k === cell ? 'flash' : ''}" disabled></button>`).join('')}</div><p class="progress">set ${si + 1} of ${form.sets.length}</p>`;
      ii += 1;
      setTimeout(judge, 750);
    }
    function recall() {
      const picked = [];
      const draw = () => {
        stage.innerHTML = `<p class="hint">Tap the positions in the order they appeared (${set.sequence.length} of them)</p><div class="recallgrid">${Array.from({ length: 16 }, (_, k) => { const n = picked.indexOf(k); return `<button data-k="${k}" class="${n >= 0 ? 'picked' : ''}">${n >= 0 ? n + 1 : ''}</button>`; }).join('')}</div><div class="respond-row"><button id="undo">Undo</button><button id="doneb">Done</button></div><p class="progress">set ${si + 1} of ${form.sets.length}</p>`;
        stage.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { touchWatch(); const k = +b.dataset.k; if (!picked.includes(k) && picked.length < set.sequence.length) { picked.push(k); draw(); } });
        stage.querySelector('#undo').onclick = () => { picked.pop(); draw(); };
        stage.querySelector('#doneb').onclick = () => {
          results.push({ sequence: set.sequence.slice(), recalled: picked.slice(), symCorrect });
          si += 1; runSet();
        };
      };
      draw();
    }
    judge();
  }
  runSet();
}

// ---------------- TASK: SART ----------------
function runSart(form, done) {
  const tapped = [];
  // RECORD SCHEMA 1: per-trial reaction times. SART scoring does NOT read these (SART_VERSION is
  // unmoved) — they are captured and persisted so the RT-variability family stops being
  // uncomputable. manual/031 carried-forward item 2; manual/020 §4a.
  const taps = [];
  let i = -1, tappedThis = false, onsetAt = 0;
  const stage = document.createElement('div');
  stage.className = 'stage';
  // #app is aria-live="polite"; a timed task re-renders every trial, which turns that into a
  // screen-reader firehose (and, on the SART, reads the stimulus aloud). Silence the task subtree —
  // navigational and report screens keep their announcements. (manual/007 §1: this battery is
  // visuo-motor throughout and a non-visual administration is a different test, stated openly.)
  stage.setAttribute('aria-live', 'off');
  stage.innerHTML = `<p class="hint">Press for every number — except 3</p><div id="sd" class="bigstim"></div><p class="progress" id="sp"></p><div class="tapzone" id="tz"></div>`;
  app.innerHTML = ''; app.appendChild(stage);
  const sd = stage.querySelector('#sd'), sp = stage.querySelector('#sp');
  const press = () => {
    touchWatch();
    if (i >= 0 && !tappedThis) {
      tappedThis = true;
      tapped.push(i);
      taps.push({ i, rt: Math.round(performance.now() - onsetAt) });
    }
  };
  const onKey = (e) => { if (!e.repeat) press(); };
  stage.querySelector('#tz').addEventListener('pointerdown', press);
  window.addEventListener('keydown', onKey);
  // Onsets ANCHORED to performance.now() targets (review): chained setTimeout accumulates
  // event-loop drift over 108 trials; anchoring bounds it and we record the max observed drift.
  const w = armWatch((reason) => { window.removeEventListener('keydown', onKey); abortSitting(reason); });
  const t0 = performance.now();
  let maxDriftMs = 0;
  const step = () => {
    if (w.isAborted()) return;
    if (w.idleExceeded()) { w.doAbort('idle'); return; }
    i += 1;
    if (i >= form.items.length) {
      window.removeEventListener('keydown', onKey);
      if (watch.disarm) { watch.disarm(); watch.disarm = null; }
      done({ tapped, taps, maxDriftMs: Math.round(maxDriftMs) }); return;
    }
    const target = t0 + (i + 1) * form.soaMs;
    const drift = Math.abs(performance.now() - (t0 + i * form.soaMs));
    if (drift > maxDriftMs) maxDriftMs = drift;
    tappedThis = false;
    sd.textContent = form.items[i].digit;
    onsetAt = performance.now(); // RT clock starts at the digit, not at the scheduler tick
    sp.textContent = `${i + 1} / ${form.items.length}`;
    setTimeout(() => { sd.textContent = ''; }, 800); // digit 800ms, blank — SOA anchored below
    setTimeout(step, Math.max(0, target - performance.now()));
  };
  step();
}

// ---------------- TASK: READING FIDELITY (SVT) ----------------
// ONE runner, used both in the standardized battery and in the preview track. Before 2026-08-05
// there were two implementations of this station: a preview one, and a planned in-battery one that
// did not exist yet. That is the duplication pattern this product is built against, so the preview
// is now the same code path with different chrome and no persistence — if the in-battery station
// breaks, the preview breaks too, and someone notices.
//
// Wired to the real integrity layer when it runs in a battery: the section watchdog (visibility
// abort + a self-paced idle ceiling), touchWatch on every response, and the interstitial's timing
// capture via the shared `done` callback. manual/013 §5: the passage is fully removed before the
// first test sentence (no lookback), one sentence at a time, an explicit answer required per
// sentence — no skip control exists.
function runSvt(form, done, opts = {}) {
  const preview = !!opts.preview;
  const responses = [];
  const total = form.passages.reduce((a, p) => a + p.items.length, 0);
  let pi = 0, ii = 0, answered = 0;
  const stage = document.createElement('div');
  stage.className = 'stage';
  app.innerHTML = ''; app.appendChild(stage);
  // NOT aria-live="off". The timed stations silence themselves because a per-trial re-render turns
  // a polite live region into a firehose; this station re-renders once per deliberate action, and
  // silencing it would remove the only announcement a screen-reader user gets. (manual/007 §1
  // still stands: the passage is presented visually and a spoken administration is a different
  // test — that limit is stated in the chapter, not worked around here.)
  const w = preview ? null : armWatch((reason) => abortSitting(reason), SELF_PACED_IDLE_ABORT_MS);
  const stop = () => { if (!preview && watch.disarm) { watch.disarm(); watch.disarm = null; } };
  const dead = () => {
    if (!w) return false;
    if (w.isAborted()) return true;
    if (w.idleExceeded()) { w.doAbort('idle'); return true; }
    return false;
  };
  const eyebrow = preview ? 'Preview · Reading fidelity' : 'Reading fidelity';

  function showPassage() {
    if (dead()) return;
    const p = form.passages[pi];
    stage.innerHTML = `
      <p class="eyebrow">${esc(eyebrow)} · passage ${pi + 1} of ${form.passages.length}</p>
      <h1>${esc(p.title)}</h1>
      <div class="card passagecard"><p>${esc(p.text)}</p></div>
      <p class="small muted">${esc(Svt.INSTRUCTIONS)}</p>
      <button class="btn" id="svt-ready">I've read it — hide the passage →</button>`;
    document.getElementById('svt-ready').onclick = () => { touchWatch(); ii = 0; showItem(); };
  }
  function showItem() {
    if (dead()) return;
    const p = form.passages[pi];
    if (ii >= p.items.length) {
      pi += 1;
      if (pi >= form.passages.length) return finish();
      return showPassage();
    }
    const it = p.items[ii];
    stage.innerHTML = `
      <p class="eyebrow">${esc(eyebrow)} · sentence ${answered + 1} of ${total}</p>
      <div class="card"><p class="sentenceverify">${esc(it.text)}</p></div>
      <p class="small muted">Does this mean the same as something you read?</p>
      <div class="respond-row"><button id="svt-yes">Same meaning</button><button id="svt-no">Different</button></div>`;
    document.getElementById('svt-yes').onclick = () => answer(true);
    document.getElementById('svt-no').onclick = () => answer(false);
  }
  function answer(yes) {
    touchWatch();
    responses.push({ yes });
    ii += 1; answered += 1;
    showItem();
  }
  function finish() { stop(); done(responses); }
  showPassage();
}

// ---------------- NEGATIVE ENTRY ON A PHONE (manual/054, item 22) ----------------
// The ratified bank contains one item whose truth is NEGATIVE (-40, where Celsius and Fahrenheit
// read the same). On iOS, <input type="number" inputmode="decimal"> renders a keypad with NO MINUS
// KEY, so a taker on a phone could not enter the correct answer at all — the item would measure
// which device they owned. Sean flagged exactly this in 054 and asked for it to be checked in the
// runner. A sign toggle works on every keyboard, including the ones that already have a minus.
// Kept next to the field rather than inside it: type="number" refuses to hold a bare "-", so a
// prefix-typing approach silently drops the character.
const signToggleHtml = (id) => `<button class="btn ghost signtoggle" id="${id}-sign" style="width:auto; margin-top:10px;">± make it negative</button>`;
function wireSignToggle(id) {
  const inp = document.getElementById(id);
  const btn = document.getElementById(id + '-sign');
  if (!inp || !btn) return;
  const sync = () => {
    const v = String(inp.value || '').trim();
    btn.disabled = v === '';
    btn.textContent = v.startsWith('-') ? '± make it positive' : '± make it negative';
  };
  btn.onclick = () => {
    const v = String(inp.value || '').trim();
    if (v === '') return;
    inp.value = v.startsWith('-') ? v.slice(1) : '-' + v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    sync();
    inp.focus();
  };
  inp.addEventListener('input', sync);
  sync();
}

// ---------------- TASK: DECISION AUTONOMY ----------------
// LOCKED per manual/015 §2/§6: free numeric entry ONLY — no slider, no visible scale, no midpoint.
// The initial estimate is committed BEFORE advice is shown, and the advice screen cannot go back,
// so there is no peeking. Same single-implementation rule as reading fidelity above.
function runDecision(form, done, opts = {}) {
  const preview = !!opts.preview;
  const responses = [];
  let i = 0;
  const stage = document.createElement('div');
  stage.className = 'stage';
  app.innerHTML = ''; app.appendChild(stage);
  const w = preview ? null : armWatch((reason) => abortSitting(reason), SELF_PACED_IDLE_ABORT_MS);
  const stop = () => { if (!preview && watch.disarm) { watch.disarm(); watch.disarm = null; } };
  const dead = () => {
    if (!w) return false;
    if (w.isAborted()) return true;
    if (w.idleExceeded()) { w.doAbort('idle'); return true; }
    return false;
  };
  const eyebrow = preview ? 'Preview · Decision autonomy' : 'Decision autonomy';
  const unit = (t) => (t.unit ? ' ' + esc(t.unit) : '');

  function showInitial() {
    if (dead()) return;
    const t = form.trials[i];
    stage.innerHTML = `
      <p class="eyebrow">${esc(eyebrow)} · item ${i + 1} of ${form.trials.length}</p>
      <h1>${esc(t.prompt)}</h1>
      <p class="small muted">Give your own best estimate first.</p>
      <input class="numentry" id="dec-initial" type="number" inputmode="decimal" placeholder="your estimate${t.unit ? ' (' + esc(t.unit) + ')' : ''}" autocomplete="off" />
      ${signToggleHtml('dec-initial')}
      <button class="btn" id="dec-submit-initial" disabled>Lock in my estimate →</button>`;
    const inp = document.getElementById('dec-initial');
    const btn = document.getElementById('dec-submit-initial');
    inp.oninput = () => { touchWatch(); btn.disabled = inp.value === '' || !Number.isFinite(Number(inp.value)); };
    wireSignToggle('dec-initial');
    inp.focus();
    btn.onclick = () => { touchWatch(); showAdvice(t, Number(inp.value)); };
  }
  function showAdvice(t, initial) {
    if (dead()) return;
    stage.innerHTML = `
      <p class="eyebrow">${esc(eyebrow)} · item ${i + 1} of ${form.trials.length}</p>
      <h1>${esc(t.prompt)}</h1>
      <p class="small muted">Your estimate: <strong>${esc(String(initial))}${unit(t)}</strong></p>
      <div class="card"><p>An AI suggests: <strong>${esc(String(t.advice))}${unit(t)}</strong></p></div>
      <p class="small muted">Revise if you want to — or keep your answer.</p>
      <input class="numentry" id="dec-final" type="number" inputmode="decimal" value="${esc(String(initial))}" autocomplete="off" />
      ${signToggleHtml('dec-final')}
      <button class="btn" id="dec-submit-final">Lock in my final answer →</button>`;
    const inp = document.getElementById('dec-final');
    inp.oninput = () => touchWatch();
    wireSignToggle('dec-final');
    inp.focus(); inp.select();
    document.getElementById('dec-submit-final').onclick = () => {
      touchWatch();
      const final = Number(inp.value);
      responses.push({ initial, final: Number.isFinite(final) ? final : initial });
      i += 1;
      if (i >= form.trials.length) return finish();
      showInitial();
    };
  }
  function finish() { stop(); done(responses); }
  showInitial();
}

// ================ RATIFICATION PASS (practitioner; manual/052) ==================================
// Sean may ratify the two content banks by reading manual/050, or by SITTING them on his phone and
// vetoing what jars. This is the second surface, and it exists because the second path sees things
// the first cannot: a passage that reads fine in a document can still be ambiguous when you meet it
// cold with the text taken away, and an estimation item only reveals that it has two defensible
// answers when you are the one trying to answer it.
//
// THE ORDER MATTERS AND IS THE WHOLE DESIGN. Every screen presents the item exactly as a taker
// meets it — cold, no key, no type label — and only THEN reveals the answer key, the item type, the
// advice and the bounds, and asks for a verdict. Showing the key first would make every distractor
// look obviously wrong and every misconception look obviously misconceived, which is precisely the
// blindness the document pass already has.
//
// Verdicts are stored locally, resumable across sittings (this is a phone, on a couch, over several
// evenings), and export as markdown keyed to the bank ids so transcription is mechanical rather
// than interpretive. Nothing here is ever administered or scored: a ratification pass is not a
// sitting and never touches assess.sittings.v1.
const RATIFY_STORE = 'assess.ratify.v1';
const loadRatify = () => {
  try {
    const r = JSON.parse(localStorage.getItem(RATIFY_STORE) || '{}');
    return r && typeof r === 'object' ? { svt: r.svt || {}, decision: r.decision || {} } : { svt: {}, decision: {} };
  } catch { return { svt: {}, decision: {} }; }
};
const saveRatify = (r) => { try { localStorage.setItem(RATIFY_STORE, JSON.stringify(r)); return true; } catch { return false; } };
const VERDICTS = [['keep', 'Keep'], ['edit', 'Keep, but edit'], ['cut', 'Cut']];

function ratifyCounts() {
  const r = loadRatify();
  return {
    svtDone: Svt.PASSAGES.filter((p) => r.svt[p.id] && r.svt[p.id].verdict).length,
    svtTotal: Svt.PASSAGES.length,
    decDone: Dec.ITEMS.filter((it) => r.decision[it.id] && r.decision[it.id].verdict).length,
    decTotal: Dec.ITEMS.length,
  };
}

function renderRatifyMenu() {
  const c = ratifyCounts();
  const done = c.svtDone + c.decDone, total = c.svtTotal + c.decTotal;
  app.innerHTML = `
    <p class="eyebrow">Practitioner · ratification pass</p>
    <h1>Sit it, then rule on it</h1>
    <div class="card"><p class="small muted">Each screen shows an item the way a taker meets it — cold, with no answer key. Answer it yourself, and only then are the key, the type and the bounds revealed for you to rule on. Verdicts save as you go, so you can stop anywhere and come back.</p></div>
    <div class="card">
      <div class="hud-row"><div><strong>Reading fidelity</strong><div class="hud-raw">${c.svtDone} of ${c.svtTotal} passages ruled on</div></div><div><button class="btn ghost small-btn" id="r-svt">${c.svtDone ? 'Continue' : 'Start'} →</button></div></div>
      <div class="hud-row"><div><strong>Decision autonomy</strong><div class="hud-raw">${c.decDone} of ${c.decTotal} items ruled on</div></div><div><button class="btn ghost small-btn" id="r-dec">${c.decDone ? 'Continue' : 'Start'} →</button></div></div>
    </div>
    ${done ? `<button class="btn" id="r-export">Export ${done} verdict${done === 1 ? '' : 's'} →</button>` : ''}
    ${done === total && total > 0 ? '<div class="card"><p class="small"><strong>Every item has a verdict.</strong> Export, and the transcription step in manual/052 is mechanical from here.</p></div>' : ''}
    <button class="btn ghost" id="r-reset">Clear all verdicts</button>
    <button class="btn ghost" id="r-back">Back</button>`;
  document.getElementById('r-svt').onclick = () => ratifySvt(0);
  document.getElementById('r-dec').onclick = () => ratifyDecision(0);
  const ex = document.getElementById('r-export'); if (ex) ex.onclick = exportRatify;
  document.getElementById('r-reset').onclick = () => {
    app.innerHTML = `<h1>Clear every verdict?</h1><div class="card"><p class="muted">This deletes all ${done} recorded verdicts on this device. It cannot be undone, and nothing else is affected.</p></div>
      <button class="btn" id="no">Keep them</button><button class="btn ghost" id="yes">Delete them</button>`;
    document.getElementById('no').onclick = renderRatifyMenu;
    document.getElementById('yes').onclick = () => { saveRatify({ svt: {}, decision: {} }); renderRatifyMenu(); };
  };
  document.getElementById('r-back').onclick = renderHome;
}

// Shared verdict control. `existing` pre-selects, so revisiting an item shows the standing ruling.
function verdictBlock(existing) {
  const v = existing && existing.verdict;
  return `<div class="card">
      <p class="eyebrow">Your ruling</p>
      <div class="respond-row" style="margin-top:12px; flex-wrap:wrap; gap:10px;">
        ${VERDICTS.map(([k, label]) => `<button data-v="${k}" style="font-size:1.05rem; padding:14px 18px;${v === k ? ' background:var(--accent); color:#fff;' : ''}">${label}</button>`).join('')}
      </div>
      <textarea id="r-note" rows="2" maxlength="400" placeholder="Anything to change, in your words (optional)" style="width:100%; margin-top:12px;">${esc((existing && existing.note) || '')}</textarea>
    </div>`;
}
function wireVerdict(onRule) {
  app.querySelectorAll('[data-v]').forEach((b) => {
    b.onclick = () => {
      const el = document.getElementById('r-note');
      onRule(b.getAttribute('data-v'), ((el && el.value) || '').trim().slice(0, 400));
    };
  });
}

// ---- Reading fidelity: read it cold, judge the sentences, THEN see the key ----
function ratifySvt(idx) {
  if (idx >= Svt.PASSAGES.length) return renderRatifyMenu();
  const p = Svt.PASSAGES[idx];
  const existing = loadRatify().svt[p.id];
  const answers = [];
  app.innerHTML = `
    <p class="eyebrow">Ratification · reading fidelity · passage ${idx + 1} of ${Svt.PASSAGES.length}</p>
    <h1>${esc(p.title)}</h1>
    <div class="card passagecard"><p>${esc(p.text)}</p></div>
    <p class="small muted">${esc(Svt.INSTRUCTIONS)}</p>
    <button class="btn" id="r-go">I've read it — hide it and show me the sentences →</button>
    <button class="btn ghost" id="r-skip">Skip to the key without answering</button>
    <button class="btn ghost" id="r-quit">Back</button>`;
  document.getElementById('r-go').onclick = () => sentence(0);
  document.getElementById('r-skip').onclick = () => reveal();
  document.getElementById('r-quit').onclick = renderRatifyMenu;

  function sentence(i) {
    if (i >= p.items.length) return reveal();
    const it = p.items[i];
    app.innerHTML = `
      <p class="eyebrow">Ratification · sentence ${i + 1} of ${p.items.length}</p>
      <div class="card"><p class="sentenceverify">${esc(it.text)}</p></div>
      <p class="small muted">Does this mean the same as something you read?</p>
      <div class="respond-row"><button id="r-yes">Same meaning</button><button id="r-no">Different</button></div>`;
    document.getElementById('r-yes').onclick = () => { answers[i] = true; sentence(i + 1); };
    document.getElementById('r-no').onclick = () => { answers[i] = false; sentence(i + 1); };
  }

  // Phase 2: the key, plus where his own COLD answers disagreed with it. A sentence the author
  // himself reads the other way is the strongest possible evidence that the item is ambiguous —
  // and it is evidence a document pass structurally cannot produce.
  function reveal() {
    const rows = p.items.map((it, i) => {
      const key = Svt.keyFor(it.type);
      const mine = answers[i];
      const clash = mine != null && mine !== key;
      return `<div class="hud-row"><div>
          <div class="small${clash ? '' : ' muted'}">${clash ? '<strong>⚠ you answered the other way</strong> · ' : ''}${esc(it.type)} → correct answer is <strong>${key ? 'SAME' : 'DIFFERENT'}</strong></div>
          <div class="sentenceverify" style="font-size:1rem;">${esc(it.text)}</div>
        </div></div>`;
    }).join('');
    const clashes = p.items.filter((it, i) => answers[i] != null && answers[i] !== Svt.keyFor(it.type)).length;
    app.innerHTML = `
      <p class="eyebrow">Ratification · the key · passage ${idx + 1} of ${Svt.PASSAGES.length}</p>
      <h1>${esc(p.title)}</h1>
      ${clashes ? `<div class="card" style="border-left:3px solid var(--amber);"><p class="small"><strong>You answered ${clashes} sentence${clashes === 1 ? '' : 's'} against the key.</strong> On a passage you are ratifying, that outweighs any argument in a document: if the author reads it the other way cold, takers will too.</p></div>` : ''}
      <div class="card">${rows}</div>
      <div class="card"><p class="eyebrow">Composition</p><p class="small muted">${Svt.ITEM_TYPES.map((t) => `${p.items.filter((it) => it.type === t).length} × ${t}`).join(' · ')} — status <strong>${esc(p.status)}</strong></p></div>
      ${verdictBlock(existing)}
      <button class="btn ghost" id="r-quit2">Save and stop</button>`;
    wireVerdict((verdict, note) => {
      const s = loadRatify();
      s.svt[p.id] = { verdict, note, clashes, ruledAt: new Date().toISOString() };
      saveRatify(s);
      ratifySvt(idx + 1);
    });
    document.getElementById('r-quit2').onclick = renderRatifyMenu;
  }
}

// ---- Decision autonomy: estimate it cold, THEN see truth, advice and bounds ----
function ratifyDecision(idx) {
  if (idx >= Dec.ITEMS.length) return renderRatifyMenu();
  const it = Dec.ITEMS[idx];
  const existing = loadRatify().decision[it.id];
  const unit = it.unit ? ' ' + esc(it.unit) : '';
  app.innerHTML = `
    <p class="eyebrow">Ratification · decision autonomy · item ${idx + 1} of ${Dec.ITEMS.length}</p>
    <h1>${esc(it.prompt)}</h1>
    <p class="small muted">Answer it cold, the way a taker meets it. If you can't, that is itself a finding.</p>
    <input class="numentry" id="r-est" type="number" inputmode="decimal" placeholder="your estimate${it.unit ? ' (' + esc(it.unit) + ')' : ''}" autocomplete="off" />
    ${signToggleHtml('r-est')}
    <button class="btn" id="r-lock">Lock it in and show me the item →</button>
    <button class="btn ghost" id="r-quit">Back</button>`;
  wireSignToggle('r-est');
  document.getElementById('r-est').focus();
  document.getElementById('r-lock').onclick = () => reveal(Number(document.getElementById('r-est').value));
  document.getElementById('r-quit').onclick = renderRatifyMenu;

  function reveal(mine) {
    const has = (x) => typeof x === 'number' && Number.isFinite(x);
    const off = has(mine) ? Math.abs(mine - it.truth) / Math.max(1, it.max - it.min) : null;
    // The three defects manual/050 C.1-C.3 found, checked LIVE per item, so they appear on the
    // screen where he rules rather than only in a document he read a week earlier.
    const flags = [];
    if (has(it.goodAdvice) && it.goodAdvice === it.truth) flags.push('Good advice EQUALS the truth, so every good-arm administration of this item is discarded before scoring (manual/050 C.1).');
    if (has(it.goodAdvice) && (it.goodAdvice < it.min || it.goodAdvice > it.max)) flags.push('Good advice falls outside this item’s bounds, so it can no longer be shown at all.');
    if (has(it.badAdvice) && (it.badAdvice < it.min || it.badAdvice > it.max)) flags.push('Bad advice falls outside this item’s bounds, so it can no longer be shown at all (manual/050 C.2).');
    if (!has(it.goodAdvice) || !has(it.badAdvice)) flags.push('No authored advice yet — this item falls back to mechanically generated advice, which is geometrically gameable.');
    if (has(mine) && (mine < it.min || mine > it.max)) flags.push('YOUR OWN answer fell outside the bounds. A taker answering as you just did loses this trial (manual/050 C.3).');
    app.innerHTML = `
      <p class="eyebrow">Ratification · the item · ${idx + 1} of ${Dec.ITEMS.length}</p>
      <h1>${esc(it.prompt)}</h1>
      <div class="card">
        <div class="hud-row"><div><strong>Truth</strong></div><div class="hud-raw">${esc(String(it.truth))}${unit}</div></div>
        ${has(mine) ? `<div class="hud-row"><div><strong>Your estimate</strong>${off != null ? `<div class="hud-raw">${(off * 100).toFixed(1)}% of the answer range from the truth</div>` : ''}</div><div class="hud-raw">${esc(String(mine))}${unit}</div></div>` : ''}
        <div class="hud-row"><div><strong>Good advice</strong><div class="hud-raw">close, not always exactly right</div></div><div class="hud-raw">${has(it.goodAdvice) ? esc(String(it.goodAdvice)) + unit : '— not authored —'}</div></div>
        <div class="hud-row"><div><strong>Bad advice</strong><div class="hud-raw">a misconception a real person holds, never a mechanical offset</div></div><div class="hud-raw">${has(it.badAdvice) ? esc(String(it.badAdvice)) + unit : '— not authored —'}</div></div>
        <div class="hud-row"><div><strong>Plausible range</strong><div class="hud-raw">wide enough that any honest answer on the requested scale falls inside; an answer outside it is set aside</div></div><div class="hud-raw">${esc(String(it.min))} – ${esc(String(it.max))}</div></div>
      </div>
      ${flags.length ? `<div class="card" style="border-left:3px solid var(--amber);"><p class="eyebrow">Flagged on this item</p>${flags.map((f) => `<p class="small" style="margin-top:6px;">${esc(f)}</p>`).join('')}</div>` : ''}
      ${verdictBlock(existing)}
      <button class="btn ghost" id="r-quit2">Save and stop</button>`;
    wireVerdict((verdict, note) => {
      const s = loadRatify();
      s.decision[it.id] = { verdict, note, myEstimate: has(mine) ? mine : null, flags: flags.length, ruledAt: new Date().toISOString() };
      saveRatify(s);
      ratifyDecision(idx + 1);
    });
    document.getElementById('r-quit2').onclick = renderRatifyMenu;
  }
}

// Export in the shape manual/052 transcribes FROM — markdown keyed to bank ids, verdicts grouped so
// the cut list and the edit list read at a glance. JSON rides along for the machine half.
function ratifyMarkdown(r) {
  const L = [];
  L.push('# RATIFICATION VERDICTS — experiential pass');
  L.push(`Exported ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · transcribe with manual/052 §3`);
  L.push('');
  const section = (title, entries) => {
    L.push(`## ${title}`);
    for (const [k, label] of VERDICTS) {
      const hit = entries.filter((e) => e.verdict === k);
      if (!hit.length) continue;
      L.push(`### ${label} (${hit.length})`);
      for (const e of hit) L.push(`- **${e.id}** — ${e.title}${e.extra ? ` · ${e.extra}` : ''}${e.note ? `\n  - note: ${e.note}` : ''}`);
      L.push('');
    }
    const missing = entries.filter((e) => !e.verdict);
    if (missing.length) {
      L.push(`### NOT YET RULED ON (${missing.length}) — these do not enter the bank`);
      for (const e of missing) L.push(`- ${e.id} — ${e.title}`);
      L.push('');
    }
  };
  section('Reading fidelity — passages', Svt.PASSAGES.map((p) => {
    const v = r.svt[p.id] || {};
    return { id: p.id, title: p.title, verdict: v.verdict, note: v.note, extra: v.clashes ? `author answered ${v.clashes} sentence(s) against the key` : '' };
  }));
  section('Decision autonomy — items', Dec.ITEMS.map((it) => {
    const v = r.decision[it.id] || {};
    return {
      id: it.id, title: it.prompt, verdict: v.verdict, note: v.note,
      extra: [v.myEstimate != null ? `author estimated ${v.myEstimate} vs truth ${it.truth}` : '', v.flags ? `${v.flags} engine flag(s)` : ''].filter(Boolean).join(' · '),
    };
  }));
  L.push('---');
  L.push('Anything without a verdict is NOT ratified and does not enter the bank (manual/050).');
  return L.join('\n');
}

function exportRatify() {
  const r = loadRatify();
  const md = ratifyMarkdown(r);
  const stamp = new Date().toISOString().slice(0, 10);
  const dl = (text, type, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  };
  dl(md, 'text/markdown', `ratification-verdicts-${stamp}.md`);
  dl(JSON.stringify(r, null, 2), 'application/json', `ratification-verdicts-${stamp}.json`);
  app.innerHTML = `
    <p class="eyebrow">Ratification · exported</p>
    <h1>Two files downloaded</h1>
    <div class="card"><p class="small muted">A markdown summary to read, and the JSON the runbook transcribes from. On a phone they land in Files → Downloads; AirDrop or email them to the Mac before the transcription step.</p></div>
    <div class="card"><p class="eyebrow">What was exported</p><pre class="audit" style="white-space:pre-wrap; overflow-x:auto;">${esc(md.slice(0, 1600))}${md.length > 1600 ? '\n…' : ''}</pre></div>
    <button class="btn" id="r-back">Back</button>`;
  document.getElementById('r-back').onclick = renderRatifyMenu;
}

// ---------------- PREVIEW ENTRY POINTS ----------------
// The preview runs the SAME runner as the battery, with preview chrome and no watchdog, and its
// result is never persisted. A fresh seed each time, so the preview shows the sampling working
// rather than the same two passages forever once the bank grows past two.
const previewSeed = () => ((Math.random() * 2 ** 31) | 0) || 1;
function previewSvt() {
  const form = Svt.generateForm(mulberry32(previewSeed()));
  runSvt(form, (responses) => renderPreviewReport(Svt.score(form, responses), 'svt'), { preview: true });
}
function previewDecision() {
  const form = Dec.generateForm(mulberry32(previewSeed()));
  runDecision(form, (responses) => renderPreviewReport(Dec.score(form, responses), 'decision'), { preview: true });
}

// ---------------- PREVIEW REPORT ----------------
function renderPreviewReport(result, kind) {
  const label = kind === 'svt' ? 'Reading fidelity' : 'Decision autonomy';
  const detail = kind === 'svt' && !result.invalid
    ? `<div class="hud-raw">balanced accuracy ${(result.balancedAccuracy * 100).toFixed(1)}% · d′ ${result.dPrime.toFixed(2)}${result.dPrimeAccumulating ? ' (accumulating)' : ''} · criterion ${result.criterion.toFixed(2)}</div>`
    : kind === 'decision' && !result.invalid
      ? `<div class="hud-raw">WOA good ${(result.woaGood * 100).toFixed(0)}% · WOA bad ${(result.woaBad * 100).toFixed(0)}% · ${result.nGood} good / ${result.nBad} bad usable</div>`
      : '';
  app.innerHTML = `
    <p class="eyebrow">Preview result — NOT a standardized score</p>
    <h1>${esc(label)}</h1>
    <div class="card previewcard">
      <div class="hud-row"><div><strong>${esc(label)}</strong>${result.invalid ? `<div class="hud-invalid">invalid run — ${esc(result.reason)} (no score)</div>` : ''}${detail}</div><div class="preview-score-wrap">${result.invalid ? '<div class="hud-score">—</div>' : `<div class="hud-score preview-score">${Number(result.score)}</div><div class="preview-score-tag">preview only</div>`}</div></div>
    </div>
    <div class="card limits"><p class="small muted">This is a PREVIEW of provisional content awaiting ratification — not saved, not comparable, not part of any sitting. The engine and scoring math shown here are the same ones that will run once the content is finalized.</p></div>
    <button class="btn" id="prev-again">Try again →</button>
    <button class="btn ghost" id="prev-back">Back to preview menu</button>`;
  document.getElementById('prev-again').onclick = () => (kind === 'svt' ? previewSvt() : previewDecision());
  document.getElementById('prev-back').onclick = renderPreviewMenu;
}

// ---------------- REPORT HUD ----------------
// Process-first observation per section (council: Kluger & DeNisi — feedback that points at the
// TASK AND ITS PROCESS helps; feedback that points at the self hurts). Every line is computed from
// real recorded fields; nothing interpretive beyond what the instrument actually captured.
function processLine(section, d) {
  if (d.invalid) return null;
  if (section === 'pvt') return `median ${Number(d.medianRT)}ms · ${Number(d.lapses)} lapses (>500ms) · ${Number(d.falseStarts)} false starts — the lapses, not the average, are the vigilance signal`;
  // OVERCLAIM FIX 2026-08-05 (forma-validity). This line printed `${accuracy}% accurate` where
  // accuracy was RESPONSE-CONDITIONAL, so a person who answered 45 of 64 trials was told "100%
  // accurate" — a false factual statement about the sitting, not merely a generous convention.
  // Report the omissions whenever there are any; the two numbers together are the honest sentence.
  if (section === 'flanker') {
    const omitted = Number(d.omissions) || 0;
    const base = `${Math.round(d.accuracy * 100)}% of all ${Number(d.administered)} trials answered correctly`;
    const missed = omitted ? ` · ${omitted} ran out of time before you answered (those count against you, the same as a wrong answer)` : '';
    return `${base}${missed} · median ${Number(d.medianRT)}ms${d.conflictCost != null ? ` · ${Number(d.conflictCost)}ms slower when the flankers fought the target — that cost is the filtering work` : ''}`;
  }
  if (section === 'span') return `pattern judgments ${Math.round(d.procAcc * 100)}% (the ≥85% gate keeps the memory score honest) · exact-order recall ${Math.round(d.pcu * 100)}%`;
  if (section === 'sart') return `${Number(d.commissions)} slips on the rare withhold trials · ${Number(d.omissions)} missed presses — the slips are where attention let go`;
  // Reading fidelity: report the two error kinds separately. They mean opposite things — a miss is
  // reading too strictly, a false alarm is accepting something the text never said, and the second
  // is the one this instrument exists to catch. d′ is deliberately NOT shown: at 8 items per class
  // it is always flagged accumulating (manual/013 §3.4), so putting it on a report screen would
  // dress up a number the chapter says is not yet the standardized one.
  if (section === 'svt') return `${Number(d.hits)}/${Number(d.nSame)} same-meaning sentences accepted · ${Number(d.falseAlarms)}/${Number(d.nChanged)} changed sentences accepted in error — the second number is the one that matters`;
  // Decision autonomy: the two arms, never the difference alone, plus how much of the form was
  // usable. WOA is a session snapshot, not a trait (manual/015 §1) — the copy must not imply one.
  // manual/015 §4.4: "every estimate carries its SEM ... so nobody reads precision that isn't
  // there." The engine computes it; until now nothing displayed it. At MIN_PER_ARM the standard
  // error of this score runs to tens of points, so a bare number would be the single most
  // criticisable artefact in the product. The band is the primary rendering, not a footnote.
  if (section === 'decision') {
    const band = Math.round(Number(d.sem) * 100);
    const slips = Number(d.nOutOfRange) || 0;
    return `took ${Math.round(d.woaGood * 100)}% of good advice and ${Math.round(d.woaBad * 100)}% of bad · give or take ${band} points either way on ${Number(d.nGood)} good / ${Number(d.nBad)} bad usable items${slips ? ` · ${slips} answer${slips === 1 ? '' : 's'} fell outside the plausible range and ${slips === 1 ? 'was' : 'were'} set aside` : ''} — one session's behaviour, not a fixed trait`;
  }
  return null;
}

// Minimal on-device .ics so the retest gets a date in the taker's own calendar (nothing leaves the device).
function retestIcs(dateStr) {
  const d = dateStr.replace(/-/g, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Assess//Retest//EN', 'BEGIN:VEVENT',
    `UID:assess-retest-${d}@local`, `DTSTART;VALUE=DATE:${d}`, 'SUMMARY:Remaining Human — your rematch',
    // OVERCLAIM FIX 2026-08-05 (forma-validity). This said "Alternate form, same blueprint. The
    // delta is the real measurement." Two violations in fourteen words: "alternate form" is
    // banned by THE LINE (manual/001) — only "equivalent-blueprint generated form" is permitted
    // without cohort data — and "the delta is the real measurement" is a change claim, which
    // manual/001 says needs a Reliable Change Index that does not exist. The report screen forty
    // lines away says the opposite, correctly. And a .ics outlives the app: this sentence is the
    // one artefact of the sitting still sitting in someone's calendar in six months.
    'DESCRIPTION:A new form built from the same blueprint. Comparing the two is the point — though a',
    ' difference between sittings cannot yet be read as change\\, because this instrument has no',
    ' measurement-error band computed.',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

// ---------------- AUDIT BLOCK + REPLAY VERIFICATION ----------------
// The record claims to be reconstructable. Rather than assert that in prose, RUN it: replay the
// stored responses through the engine in front of the person and show the verdict. This is the
// browser half of the manual/020 §4a definition of done — the engine test proves the invariant
// holds in jsc, this proves it holds on the device that produced the record.
function auditBlock(record, saved) {
  const r = B.replay(record);
  // OVERCLAIM FIX 2026-08-05 (forma-validity P6). The old failure branch read "not verified … the
  // scores above stand, but this sitting cannot be independently re-checked." "The scores above
  // stand" is an assurance the app has, in the same sentence, just said it has no basis for.
  // Replay is now per-section, so the honest report is which sections were re-checked and which
  // could not be — never a blanket verdict, and never a reassurance in place of one.
  const names = (list) => list.map((n) => esc(B.SECTION_TITLES[n] || n)).join(', ');
  const WHY = {
    'form-not-reconstructable': 'recorded under an earlier version of the battery, whose exact task form this build no longer contains',
    'instrument-version-moved': 'scored under an earlier version of that instrument, so today’s scoring rule would not reproduce the same number',
    'instrument-retired': 'that section is no longer part of this instrument',
    'not-in-this-blueprint': 'that section is not in the current blueprint',
    'sections-differ': 'the stored score does NOT match what your saved answers produce',
  };
  let verdict;
  if (r.ok) {
    verdict = '<span class="ok">verified ✓</span> — your raw answers were re-scored just now and reproduced these exact numbers';
  } else if (!r.verified || !r.verified.length) {
    verdict = `<span class="bad">not verified</span> — this sitting could not be re-checked (${esc(r.reason || 'unknown')})`;
  } else {
    const groups = {};
    for (const u of r.unverifiable) (groups[u.reason] = groups[u.reason] || []).push(u.section);
    const lines = Object.keys(groups).map((why) => `${names(groups[why])} — ${WHY[why] || esc(why)}`).join('; ');
    const differs = r.unverifiable.some((u) => u.reason === 'sections-differ');
    verdict = `<span class="${differs ? 'bad' : 'ok'}">partly verified</span> — re-scored and reproduced exactly: <strong>${names(r.verified)}</strong>. Not re-checkable: ${lines}`;
  }
  const storage = saved.saved
    ? (saved.full ? '' : '<p class="small faint" style="margin-top:6px;">Storage on this device was full, so older sittings kept their scores but lost their raw answers. Export anything you want to keep.</p>')
    : '<p class="small hud-invalid" style="margin-top:6px;">This sitting could not be written to device storage. Export it now or it is gone when you close the tab.</p>';
  return `<div class="card"><p class="eyebrow">Audit trail</p>
    <p class="small muted" style="margin:4px 0 8px;">Replay check: ${verdict}.</p>
    <p class="audit">record schema ${Number(record.recordSchema)} · battery v${Number(record.batteryVersion)} · seed ${Number(record.seed)} · instruments ${esc(JSON.stringify(record.instrumentVersions))} · sitting ${(record.timing.sittingMs / 60000).toFixed(1)} min${record.interruptions && record.interruptions.length ? ` · ${record.interruptions.length} interruption(s) between sections` : ''}</p>
    ${storage}
    <button class="btn ghost" id="exportone" style="width:auto; margin-top:12px;">Download this sitting (JSON) →</button></div>`;
}
function wireAuditBlock(record) {
  const ex = document.getElementById('exportone');
  if (!ex) return;
  ex.onclick = () => {
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `remaining-human-${(record.timing && record.timing.completedAt || '').slice(0, 10)}-seed${record.seed}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };
}

function renderReport(record, saved = { saved: true, full: true }) {
  // Channel scoping (Codex, manual/021): a self sitting compares only with self sittings; an
  // administered sitting compares only with the SAME participant's records. Never across.
  const chan = record.participant || null;
  const priors = loadSittings().filter((r) => r !== record && JSON.stringify(r) !== JSON.stringify(record) && (r.participant || null) === chan);
  const cmp = B.compareSittings(record, priors);
  const hasPriors = cmp.some((c) => c.priors.length);
  const row = (c) => {
    const d = c.now;
    const proc = processLine(c.section, d);
    const finitePriors = c.priors.map(Number).filter(Number.isFinite); // legacy/corrupt priors can't render NaN (Codex)
    const last = finitePriors.length ? finitePriors[finitePriors.length - 1] : null;
    const delta = (last != null && !d.invalid && Number.isFinite(Number(d.score))) ? Number(d.score) - last : null;
    // OVERCLAIM FIX 2026-07-25 (manual/043 §4.1): a bare delta rendered as a headline reads as
    // measured change. manual/001 requires SEM bands and never bare points, and says growth claims
    // need a Reliable Change Index. No SEM and no RCI exist yet (the pilot has not run), so the
    // number is shown WITH the reason it cannot yet be read as change. Restore the bold only when
    // an RCI exists.
    const deltaTxt = delta != null ? `<div class="hud-raw">${delta >= 0 ? '+' : ''}${delta} vs your last sitting${finitePriors.length > 1 ? ` · all sittings: ${finitePriors.join(' → ')} → ${Number(d.score)}` : ''}<br><span class="small faint">Not yet interpretable as change — this instrument has no measurement-error band computed, so a difference this size may be noise or practice.</span></div>` : '';
    return `<div class="hud-row"><div><strong>${esc(c.title)}</strong>${d.invalid ? `<div class="hud-invalid">invalid run — ${esc(d.reason)} (no score)</div>` : ''}${proc ? `<div class="hud-raw">${esc(proc)}</div>` : ''}${deltaTxt}</div><div class="hud-score">${d.invalid ? '—' : Number(d.score)}</div></div>`;
  };
  const effortClean = !record.incomplete && (!record.effort.flags || !record.effort.flags.length);
  let pre = null;
  // The pre-commitment and the rematch cards belong to the SELF channel only (an administered
  // sitting's retest cadence is the practitioner's protocol, and the precommit is the taker's own).
  if (!record.participant) { try { pre = JSON.parse(localStorage.getItem('assess.precommit.v1') || 'null'); } catch {} }
  // 8 weeks out, in the taker's LOCAL calendar (UTC slicing can land a day off in the evening).
  // NAMING (2026-07-26): this is the consumer REMATCH CADENCE, not the research retest window.
  // They serve opposite purposes — a research retest wants a SHORT gap so that what remains is
  // measurement stability, a consumer rematch wants a LONG gap so practice effects have decayed.
  // The research window is 2-4 weeks. Do not let these two numbers be read as one parameter.
  const rd = new Date(); rd.setDate(rd.getDate() + 56);
  const retestDate = `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, '0')}-${String(rd.getDate()).padStart(2, '0')}`;
  app.innerHTML = `
    <div class="wordmark small-mark">${esc(BRAND)}</div>
    <p class="eyebrow">Your ${esc(BRAND)} · sitting report · v${record.batteryVersion} · raw</p>
    <h1>Your ${esc(BRAND)}, this sitting</h1>
    ${effortClean ? `<div class="card" style="border-left:3px solid var(--ok, #3d8b6e);"><p class="small"><strong>✓ Interpretable sitting</strong> — effort checks passed on every section. That matters: a test that refuses bad data is a test worth believing, and this run earned its numbers.</p></div>` : ''}
    <div class="card">${cmp.map(row).join('')}</div>
    <p class="small faint" style="margin-top:6px;">Each section uses its own scoring convention — section scores are not comparable to each other, only to the same section in your other sittings.</p>
    ${hasPriors ? '' : `<div class="card"><p class="small muted"><strong>This sitting is your baseline, not your verdict.</strong> These capacities are state-sensitive — sleep, load, and practice all move them. That is exactly why one sitting is a snapshot: a second one gives you a second snapshot, and enough of them start to show a pattern.</p></div>`}
    ${pre && pre.text ? `<div class="card"><p class="eyebrow">Before you saw any number, you wrote:</p><p style="margin:4px 0 2px;">“${esc(pre.text)}”</p><p class="small muted">That's your move — authored by you, before the score could argue with you. The rematch gives you the next comparison point.</p></div>` : ''}
    ${record.participant ? '' : `<div class="card"><p class="eyebrow">The rematch</p><p class="small" style="margin:4px 0 8px;">Come back on or after <strong>${retestDate}</strong> — eight weeks, which is long enough for the practice you just got to fade. You'll get a new form built from the same blueprint, so you are doing the same task rather than the same items. <span class="faint">(An equivalent-blueprint generated form. These forms are not statistically equated to each other; that needs cohort data nobody has yet.)</span></p><button class="btn ghost" id="retestics" style="width:auto;">Add it to my calendar →</button></div>`}
    ${record.effort.flags.length ? `<div class="card"><p class="eyebrow">Validity notes</p><p class="small muted">${record.effort.flags.map(esc).join(' · ')} — flagged sections report as invalid rather than scored.</p></div>` : ''}
    <div class="card limits"><p class="small muted">${esc(B.LIMITS_TEXT)}</p></div>
    ${auditBlock(record, saved)}
    <button class="btn" id="home">Done →</button>`;
  document.getElementById('home').onclick = renderHome;
  wireAuditBlock(record);
  const ri = document.getElementById('retestics');
  if (ri) ri.onclick = () => {
    const blob = new Blob([retestIcs(retestDate)], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'retest.ics'; a.click(); URL.revokeObjectURL(a.href);
  };
}

// ---------------- PRACTITIONER ROSTER (manual/021 §4) ----------------
function participantGroups() {
  const groups = {};
  for (const r of loadSittings()) if (r.participant) (groups[r.participant] = groups[r.participant] || []).push(r);
  return groups;
}

function renderRoster() {
  const groups = participantGroups();
  const codes = Object.keys(groups).sort();
  const row = (code) => {
    const recs = groups[code];
    const latest = recs[recs.length - 1];
    const scores = latest.order.map((n) => latest.sections[n].invalid ? '—' : Number(latest.sections[n].score)).join(' · ');
    const complete = recs.filter((r) => !r.incomplete).length;
    return `<div class="hud-row"><div><strong>${esc(code)}</strong><div class="hud-raw">${recs.length} sitting${recs.length === 1 ? '' : 's'} (${complete} complete) · latest: ${scores}${latest.incomplete ? ' (incomplete)' : ''}</div></div>
      <div><button class="btn ghost small-btn" data-report="${esc(code)}">Report</button> <button class="btn ghost small-btn" data-export="${esc(code)}">Export</button></div></div>`;
  };
  app.innerHTML = `
    <div class="wordmark small-mark">${esc(BRAND)}</div>
    <p class="eyebrow">Participant roster · administered use</p>
    <h1>Participants</h1>
    <div class="card">${codes.length ? codes.map(row).join('') : '<p class="small muted">No administered sittings yet.</p>'}</div>
    <p class="small faint">Codes only — the mapping to a person lives in your practice records, never here. Change-scores compare a participant only with their own prior complete sittings of the same battery version.</p>
    <button class="btn ghost" id="back">Back</button>`;
  document.getElementById('back').onclick = renderHome;
  app.querySelectorAll('[data-export]').forEach((b) => b.onclick = () => {
    const code = b.getAttribute('data-export');
    const blob = new Blob([JSON.stringify(participantGroups()[code], null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${code}-sittings.json`; a.click(); URL.revokeObjectURL(a.href);
  });
  app.querySelectorAll('[data-report]').forEach((b) => b.onclick = () => renderParticipantReport(b.getAttribute('data-report')));
}

// One-page printable report (manual/021 §6): scores + process + change + limits verbatim. No
// composite, no percentile, no interpretation beyond the process lines.
function renderParticipantReport(code) {
  const recs = (participantGroups()[code] || []);
  if (!recs.length) return renderRoster();
  const latest = recs[recs.length - 1];
  const priors = recs.slice(0, -1);
  const cmp = B.compareSittings(latest, priors);
  const row = (c) => {
    const d = c.now;
    const proc = processLine(c.section, d);
    const finitePriors = c.priors.map(Number).filter(Number.isFinite);
    const last = finitePriors.length ? finitePriors[finitePriors.length - 1] : null;
    const delta = (last != null && !d.invalid && Number.isFinite(Number(d.score))) ? Number(d.score) - last : null;
    return `<div class="hud-row"><div><strong>${esc(c.title)}</strong>${d.invalid ? `<div class="hud-invalid">invalid run — ${esc(d.reason)} (no score)</div>` : ''}${proc ? `<div class="hud-raw">${esc(proc)}</div>` : ''}${delta != null ? `<div class="hud-raw"><strong>${delta >= 0 ? '+' : ''}${delta} vs previous sitting</strong> (difference, not cause)</div>` : ''}</div><div class="hud-score">${d.invalid ? '—' : Number(d.score)}</div></div>`;
  };
  app.innerHTML = `
    <div class="wordmark small-mark">${esc(BRAND)}</div>
    <p class="eyebrow">Participant report · ${esc(code)} · ${esc((latest.timing && latest.timing.completedAt || '').slice(0, 10))}</p>
    <h1>Sitting report — ${esc(code)}</h1>
    <div class="card">${cmp.map(row).join('')}</div>
    <p class="small faint">Each section uses its own scoring convention — comparable only to the same section in this participant's other sittings.</p>
    <div class="card limits"><p class="small muted">${esc(B.LIMITS_TEXT)}</p></div>
    <div class="card"><p class="eyebrow">Audit</p><p class="audit">battery v${Number(latest.batteryVersion)} · seed ${Number(latest.seed)} · sittings on record: ${recs.length} · form reconstructable from its seed</p></div>
    <button class="btn" id="printit">Print →</button>
    <button class="btn ghost" id="back">Back to roster</button>`;
  document.getElementById('printit').onclick = () => window.print();
  document.getElementById('back').onclick = renderRoster;
}

// Dev-only smoke hook: /app/?debug=1 exposes the task runners so each stage can be
// launched directly (never present in a normal administration).
if (new URLSearchParams(location.search).has('debug')) {
  window.__debug = {
    B, runPvt, runFlanker, runSpan, runSart, runSvt, runDecision, home: renderHome,
    renderReport, renderAttest, renderInterstitial, renderRoster, renderParticipantReport,
    Svt, Dec, mulberry32, previewSvt, previewDecision, renderPreviewReport, renderPreviewMenu,
    renderRatifyMenu, ratifySvt, ratifyDecision, ratifyMarkdown, loadRatify, saveRatify,
  };
}
document.title = BRAND + ' — research battery';
renderHome();
