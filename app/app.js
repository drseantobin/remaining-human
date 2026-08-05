// app/app.js — the administration runner + HUD. All science lives in engine/ (pure, tested);
// this file only renders forms, captures raw responses with honest timing, and displays records.
// Timing: performance.now() for RTs; input via pointerdown + keydown (whichever fires first wins).
import * as B from '../engine/battery.js?b=8';
import * as Svt from '../engine/svt.js?b=8';
import * as Dec from '../engine/decision.js?b=8';
import { mulberry32 } from '../engine/prng.js?b=8';
import { BRAND, TAGLINE, DESCRIPTOR, THESIS, CAPACITIES } from './brand.js?b=8';

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
    <p class="eyebrow" style="margin-bottom:10px;">What this measures</p>
    <div class="capgrid">${shown.map(chip).join('')}</div>
    <div class="card limits"><p class="small muted">${esc(B.LIMITS_TEXT)}</p></div>
    <div class="card"><p class="eyebrow">What this costs you</p><p class="small muted" style="margin-top:4px;">About 12 minutes, in one go, with nothing else running. Parts of it are boring on purpose — the boredom is the measurement. There is no way to fail and no verdict at the end, only your own numbers.</p></div>
    <button class="btn" id="begin">Begin →</button>
    ${PRACTITIONER ? `<button class="btn ghost" id="administer">Administered sitting (practitioner) →</button>` : ''}
    ${PRACTITIONER && loadSittings().some((r) => r.participant) ? `<button class="btn ghost" id="roster">Participant roster →</button>` : ''}
    ${PRACTITIONER ? `<button class="btn ghost" id="preview">Preview the next two instruments →</button>` : ''}
    ${sittings.length ? `<div class="card"><p class="eyebrow" style="margin-bottom:6px;">Your sittings</p>${rows}</div>` : ''}
    <div class="card"><p class="eyebrow">Who this belongs to</p><p class="small muted" style="margin-top:4px;">${esc(COVENANT_OWNERSHIP)}</p><p class="small muted" style="margin-top:8px;">${esc(COVENANT_DATA)}</p></div>
    <p class="small faint" style="margin-top:18px;">Each sitting is reconstructable from its seed and re-scorable from your own saved answers — fully auditable, by you.</p>`;
  document.getElementById('begin').onclick = () => renderAttest();
  const adm = document.getElementById('administer'); if (adm) adm.onclick = () => renderAttest({ administered: true });
  const ros = document.getElementById('roster'); if (ros) ros.onclick = renderRoster;
  const prev = document.getElementById('preview'); if (prev) prev.onclick = renderPreviewMenu;
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
  document.getElementById('p-svt').onclick = () => runSvtPreview(Svt.generateForm(mulberry32(1)), renderPreviewReport);
  document.getElementById('p-dec').onclick = () => runDecisionPreview(Dec.generateForm(mulberry32((Date.now() >>> 0) || 1)), renderPreviewReport);
  document.getElementById('p-back').onclick = renderHome;
}

// ---------------- ATTESTATION ----------------
const ADMIN_SCRIPT = "This takes about 12 minutes in one sitting. It measures four basic capacities — reaction and vigilance, filtering distraction, working memory, and sustained attention. It is deliberately plain, and parts are boring on purpose — the boredom is part of what\u2019s measured. There are no trick questions and no way to fail: the result is a baseline for comparison with your own future sittings, not a verdict. Please silence your phone and put it out of reach. Work alone, without pauses, until it tells you you\u2019re done.";

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
      <label class="att"><input type="checkbox" id="a1"/><span class="small">I'm in a quiet place and can complete this in one sitting (~12 minutes) without interruptions.</span></label>
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
    if (name === 'pvt') runPvt(s.assembled.forms.pvt, done);
    else if (name === 'flanker') runFlanker(s.assembled.forms.flanker, done);
    else if (name === 'span') runSpan(s.assembled.forms.span, done);
    else runSart(s.assembled.forms.sart, done);
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
const watch = { lastInput: 0, disarm: null };
function armWatch(onAbort) {
  watch.lastInput = performance.now();
  let aborted = false;
  const doAbort = (reason) => { if (aborted) return; aborted = true; onAbort(reason || 'idle'); };
  const onVis = () => { if (document.hidden) doAbort('hidden'); };
  document.addEventListener('visibilitychange', onVis);
  watch.disarm = () => document.removeEventListener('visibilitychange', onVis);
  return { idleExceeded: () => performance.now() - watch.lastInput > IDLE_ABORT_MS, doAbort, isAborted: () => aborted };
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
    <p class="muted small" style="margin-top:8px;">A standardized battery is one continuous, attended run — so nothing was recorded, and no partial score exists. Start fresh when you have ~12 uninterrupted minutes.</p></div>
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
      timer = setTimeout(() => { // window elapsed: timeout = no rt (excluded as invalid trial by scorer)
        if (!accepting) return;
        accepting = false;
        if (!t.practice) out.push({ congruent: t.congruent, correct: false, rt: null });
        fs.textContent = ''; i += 1; setTimeout(next, 500);
      }, 2000);
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

// ---------------- PREVIEW TASK: READING FIDELITY (SVT) ----------------
// Reads Svt.generateForm() output and scores with Svt.score(form, responses) — the SAME pure
// scorer that will run in the real battery once passages are ratified. No persistence here.
function runSvtPreview(form, onDone) {
  const flatItems = form.passages.flatMap((p) => p.items);
  const responses = [];
  let passageIdx = 0, itemIdx = 0;
  const stage = document.createElement('div');
  app.innerHTML = '';
  app.appendChild(stage);
  showPassage();

  function showPassage() {
    const p = form.passages[passageIdx];
    stage.innerHTML = `
      <p class="eyebrow">Preview · Reading fidelity · passage ${passageIdx + 1} of ${form.passages.length}</p>
      <h1>${esc(p.title)}</h1>
      <div class="card passagecard"><p>${esc(p.text)}</p></div>
      <p class="small muted">${esc(Svt.INSTRUCTIONS)}</p>
      <button class="btn" id="svt-ready">I've read it — hide the passage →</button>`;
    document.getElementById('svt-ready').onclick = () => { itemIdx = 0; showItem(); };
  }
  function showItem() {
    const p = form.passages[passageIdx];
    if (itemIdx >= p.items.length) {
      passageIdx += 1;
      if (passageIdx >= form.passages.length) return finish();
      return showPassage();
    }
    const it = p.items[itemIdx];
    const doneSoFar = passageIdx * (form.passages[0].items.length) + itemIdx;
    stage.innerHTML = `
      <p class="eyebrow">Preview · Reading fidelity · sentence ${doneSoFar + 1} of ${flatItems.length}</p>
      <div class="card"><p class="sentenceverify">${esc(it.text)}</p></div>
      <p class="small muted">Does this mean the same as something you read?</p>
      <div class="respond-row"><button id="svt-yes">Same meaning</button><button id="svt-no">Different</button></div>`;
    document.getElementById('svt-yes').onclick = () => answer(true);
    document.getElementById('svt-no').onclick = () => answer(false);
  }
  function answer(yes) {
    responses.push({ yes });
    itemIdx += 1;
    showItem();
  }
  function finish() {
    const result = Svt.score(form, responses);
    onDone(result, 'svt');
  }
}

// ---------------- PREVIEW TASK: DECISION AUTONOMY ----------------
// LOCKED per manual/015 §2/§6: free numeric entry ONLY — no slider, no visible scale/midpoint. The
// initial estimate is committed BEFORE advice is shown (no peeking). Scored with Dec.score(form,
// responses) — the same pure scorer the real battery will use once items are ratified.
function runDecisionPreview(form, onDone) {
  const responses = [];
  let i = 0;
  const stage = document.createElement('div');
  app.innerHTML = '';
  app.appendChild(stage);
  showInitial();

  function showInitial() {
    const t = form.trials[i];
    stage.innerHTML = `
      <p class="eyebrow">Preview · Decision autonomy · item ${i + 1} of ${form.trials.length}</p>
      <h1>${esc(t.prompt)}</h1>
      <p class="small muted">Give your own best estimate first.</p>
      <input class="numentry" id="dec-initial" type="number" inputmode="decimal" placeholder="your estimate${t.unit ? ' (' + esc(t.unit) + ')' : ''}" autocomplete="off" />
      <button class="btn" id="dec-submit-initial" disabled>Lock in my estimate →</button>`;
    const inp = document.getElementById('dec-initial');
    const btn = document.getElementById('dec-submit-initial');
    inp.oninput = () => { btn.disabled = inp.value === '' || !Number.isFinite(Number(inp.value)); };
    inp.focus();
    btn.onclick = () => { showAdvice(t, Number(inp.value)); };
  }
  function showAdvice(t, initial) {
    stage.innerHTML = `
      <p class="eyebrow">Preview · Decision autonomy · item ${i + 1} of ${form.trials.length}</p>
      <h1>${esc(t.prompt)}</h1>
      <p class="small muted">Your estimate: <strong>${esc(String(initial))}${t.unit ? ' ' + esc(t.unit) : ''}</strong></p>
      <div class="card"><p>An AI suggests: <strong>${esc(String(t.advice))}${t.unit ? ' ' + esc(t.unit) : ''}</strong></p></div>
      <p class="small muted">Revise if you want to — or keep your answer.</p>
      <input class="numentry" id="dec-final" type="number" inputmode="decimal" value="${esc(String(initial))}" autocomplete="off" />
      <button class="btn" id="dec-submit-final">Lock in my final answer →</button>`;
    const inp = document.getElementById('dec-final');
    inp.focus(); inp.select();
    document.getElementById('dec-submit-final').onclick = () => {
      const final = Number(inp.value);
      responses.push({ initial, final: Number.isFinite(final) ? final : initial });
      i += 1;
      if (i >= form.trials.length) return finish();
      showInitial();
    };
  }
  function finish() {
    const result = Dec.score(form, responses);
    onDone(result, 'decision');
  }
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
  document.getElementById('prev-again').onclick = () => {
    if (kind === 'svt') runSvtPreview(Svt.generateForm(mulberry32(1)), renderPreviewReport);
    else runDecisionPreview(Dec.generateForm(mulberry32((Date.now() >>> 0) || 1)), renderPreviewReport);
  };
  document.getElementById('prev-back').onclick = renderPreviewMenu;
}

// ---------------- REPORT HUD ----------------
// Process-first observation per section (council: Kluger & DeNisi — feedback that points at the
// TASK AND ITS PROCESS helps; feedback that points at the self hurts). Every line is computed from
// real recorded fields; nothing interpretive beyond what the instrument actually captured.
function processLine(section, d) {
  if (d.invalid) return null;
  if (section === 'pvt') return `median ${Number(d.medianRT)}ms · ${Number(d.lapses)} lapses (>500ms) · ${Number(d.falseStarts)} false starts — the lapses, not the average, are the vigilance signal`;
  if (section === 'flanker') return `${Math.round(d.accuracy * 100)}% accurate · median ${Number(d.medianRT)}ms${d.conflictCost != null ? ` · ${Number(d.conflictCost)}ms slower when the flankers fought the target — that cost is the filtering work` : ''}`;
  if (section === 'span') return `pattern judgments ${Math.round(d.procAcc * 100)}% (the ≥85% gate keeps the memory score honest) · exact-order recall ${Math.round(d.pcu * 100)}%`;
  if (section === 'sart') return `${Number(d.commissions)} slips on the rare withhold trials · ${Number(d.omissions)} missed presses — the slips are where attention let go`;
  return null;
}

// Minimal on-device .ics so the retest gets a date in the taker's own calendar (nothing leaves the device).
function retestIcs(dateStr) {
  const d = dateStr.replace(/-/g, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Assess//Retest//EN', 'BEGIN:VEVENT',
    `UID:assess-retest-${d}@local`, `DTSTART;VALUE=DATE:${d}`, 'SUMMARY:Remaining Human — your rematch',
    'DESCRIPTION:Alternate form, same blueprint. The delta is the real measurement.',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

// ---------------- AUDIT BLOCK + REPLAY VERIFICATION ----------------
// The record claims to be reconstructable. Rather than assert that in prose, RUN it: replay the
// stored responses through the engine in front of the person and show the verdict. This is the
// browser half of the manual/020 §4a definition of done — the engine test proves the invariant
// holds in jsc, this proves it holds on the device that produced the record.
function auditBlock(record, saved) {
  const r = B.replay(record);
  const verdict = r.ok
    ? '<span class="ok">verified ✓</span> — your raw answers were re-scored just now and reproduced these exact numbers'
    : `<span class="bad">not verified</span> (${esc(r.reason)}) — the scores above stand, but this sitting cannot be independently re-checked`;
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
    B, runPvt, runFlanker, runSpan, runSart, home: renderHome,
    renderReport, renderAttest, renderInterstitial, renderRoster, renderParticipantReport,
    Svt, Dec, mulberry32, runSvtPreview, runDecisionPreview, renderPreviewReport, renderPreviewMenu,
  };
}
document.title = BRAND + ' — research battery';
renderHome();
