// engine/svt.js — Reading Fidelity (Sentence Verification Technique).
// Spec: manual/013-svt.md (read first; this implements it EXACTLY).
// Lineage: Royer, Hastings & Hook 1979; signal detection with the loglinear correction (Hautus 1995).
// Ported from forma v346 svt.js with one deliberate hardening: forma's svtScore(trials) trusted a
// caller-supplied `same` flag — a forged response could carry its own answer key. Here the key lives
// in the FORM: score(form, responses). The 0–100 transform is a Forma CONVENTION (balanced accuracy
// above chance; raw d′/criterion/counts carried in detail — those are the comparable numbers).
// Pure module: no DOM, no storage, no Date, no Math.random — rng injected (consumes zero draws at v1).

export const SVT_VERSION = 1;

// Locked blueprint constants (spec §2).
export const PASSAGES_PER_FORM = 2;
export const ITEMS_PER_PASSAGE = 8;   // 2 original + 2 paraphrase + 2 meaning-change + 2 distractor
export const DPRIME_MIN_PER_CLASS = 16; // below this per class, d′ is flagged accumulating

export const ITEM_TYPES = ['original', 'paraphrase', 'meaning-change', 'distractor'];

// Locked administration text (spec §5).
export const INSTRUCTIONS = 'Read the passage carefully — it will be taken away before the questions. Then judge each sentence one at a time: does it mean the same as something you read? Some sentences are reworded truths, some contradict the passage, and some sound plausible but were never stated. Answer from what the text actually said.';

// ---- PROVISIONAL PASSAGE BANK (RED — Sean authors/ratifies the real passages) ----
// These two are forma-researcher-vetted (2026-06-17) and enter as engine-test scaffolding +
// ratification candidates only. Every item: { text, type, same } — same is the answer key.
export const PASSAGES = [
  {
    id: 'desert',
    title: 'How a desert gains and loses heat',
    text: "Deserts are known for extreme temperatures, but the most striking feature is how sharply the heat changes between day and night. During the day, the dry air and bare ground absorb sunlight quickly, and the surface can grow hotter than soil in wetter regions. Because there is little moisture in the air, almost no heat is trapped near the ground. After sunset, that stored heat escapes rapidly into the open sky, and the temperature can fall by more than thirty degrees within a few hours. Plants and animals living in deserts must cope with this swing. Many animals stay underground during the day and become active only at night, when the surface has cooled. Some plants store water in thick stems, allowing them to survive long stretches without rain. These adaptations let life persist in a place of constant temperature change.",
    items: [
      { text: 'After sunset, that stored heat escapes rapidly into the open sky.', type: 'original', same: true },
      { text: 'Some plants store water in thick stems, allowing them to survive long stretches without rain.', type: 'original', same: true },
      { text: 'Many desert animals shelter below the surface in the daytime and come out to forage after dark.', type: 'paraphrase', same: true },
      { text: 'Because the air holds so little moisture, hardly any heat is retained close to the surface.', type: 'paraphrase', same: true },
      { text: "Because the desert air is full of moisture, most of the day's heat stays trapped near the ground.", type: 'meaning-change', same: false },
      { text: 'After sunset the temperature can fall by less than three degrees over several hours.', type: 'meaning-change', same: false },
      { text: 'Desert sand often contains valuable minerals that miners search for.', type: 'distractor', same: false },
      { text: 'Most deserts receive their small amount of rainfall during the winter months.', type: 'distractor', same: false },
    ],
  },
  {
    id: 'paper',
    title: 'How paper is made from wood',
    text: 'Most paper begins as wood, which is made largely of tiny fibers held together by a natural glue called lignin. To turn wood into paper, the wood is first cut into small chips. These chips are then cooked with chemicals that dissolve the lignin and free the individual fibers. What remains is a wet, soupy mixture of loose fibers and water known as pulp. The pulp is spread in a thin layer onto a moving screen, which lets the water drain away while the fibers settle and begin to link together. The damp sheet is then pressed and passed over heated rollers that dry it completely. As the fibers bond, they form a flat, continuous surface. Manufacturers can add fine clays or dyes to the pulp to make the paper smoother, brighter, or coloured before it is dried.',
    items: [
      { text: 'These chips are then cooked with chemicals that dissolve the lignin and free the individual fibers.', type: 'original', same: true },
      { text: 'The pulp is spread in a thin layer onto a moving screen, which lets the water drain away.', type: 'original', same: true },
      { text: 'Wood is mostly built from small fibers bound together by a natural adhesive known as lignin.', type: 'paraphrase', same: true },
      { text: 'To finish the sheet, it is squeezed and then run across hot rollers until it is fully dry.', type: 'paraphrase', same: true },
      { text: 'The chips are cooked with chemicals that strengthen the lignin so the fibers stay tightly bound.', type: 'meaning-change', same: false },
      { text: 'The pulp is laid onto a screen that holds in the water while the fibers float apart.', type: 'meaning-change', same: false },
      { text: 'Recycled paper is collected and reused to reduce the number of trees that are cut down.', type: 'distractor', same: false },
      { text: 'The first paper was invented in ancient China about two thousand years ago.', type: 'distractor', same: false },
    ],
  },
];

// ---- Probit (inverse standard-normal CDF) — Acklam's rational approximation, |err| < 1.15e-9.
// Needed for the signal-detection z-transform; jsc has no native erfinv. Ported from forma v346.
export function probit(p) {
  if (!(p > 0)) return -Infinity;
  if (!(p < 1)) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const plow = 0.02425, phigh = 1 - plow;
  let q, r;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= phigh) {
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

// ---- Form generation ----
// FIXED passage order and FIXED item order — a standardized form never shuffles (spec §2). The rng is
// required for engine uniformity but consumes ZERO draws at v1; a larger ratified bank may later
// sample passages from the stream (that would be a version bump).
export function generateForm(rng) {
  if (typeof rng !== 'function') throw new Error('svt.generateForm requires an injected rng');
  return {
    version: SVT_VERSION,
    passages: PASSAGES.map((p) => ({ id: p.id, title: p.title, text: p.text, items: p.items.map((it) => ({ ...it })) })),
  };
}

// ---- Scoring (spec §3) ----
// responses: [{ yes: boolean }] aligned by FLAT item index across passages in form order.
const clamp01_100 = (x) => Math.max(0, Math.min(100, x));

export function score(form, responses) {
  const passages = form && Array.isArray(form.passages) ? form.passages : null;
  const resp = Array.isArray(responses) ? responses : [];
  // BLUEPRINT GATE: the exact passage/item shape, one response per item.
  if (!passages || passages.length !== PASSAGES_PER_FORM
    || passages.some((p) => !p || !Array.isArray(p.items) || p.items.length !== ITEMS_PER_PASSAGE)) {
    return { score: null, invalid: true, reason: 'blueprint-mismatch' };
  }
  const items = passages.flatMap((p) => p.items);
  if (resp.length !== items.length) return { score: null, invalid: true, reason: 'blueprint-mismatch' };
  // COMPOSITION GATE (Codex): the blueprint fixes 2 of each type per passage, and the key follows the
  // type (original/paraphrase = same; meaning-change/distractor = changed). Without this, a tampered
  // all-same form reaches the BA division with nChanged 0 → score NaN with invalid:false, and an
  // inconsistent same/type pair silently rewrites the answer key.
  for (const p of passages) {
    for (const type of ITEM_TYPES) {
      if (p.items.filter((it) => it && it.type === type).length !== ITEMS_PER_PASSAGE / ITEM_TYPES.length) {
        return { score: null, invalid: true, reason: 'blueprint-mismatch' };
      }
    }
  }
  let hits = 0, fa = 0, nSame = 0, nChanged = 0, correct = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i], r = resp[i];
    // CORRUPT-RESPONSE GATE: the key must be a boolean ON THE FORM, consistent with the item type;
    // the answer must be a boolean.
    if (!it || typeof it.same !== 'boolean' || !ITEM_TYPES.includes(it.type)
      || it.same !== (it.type === 'original' || it.type === 'paraphrase')
      || !r || typeof r.yes !== 'boolean') {
      return { score: null, invalid: true, reason: 'corrupt-response' };
    }
    if (it.same) { nSame += 1; if (r.yes) { hits += 1; correct += 1; } }
    else { nChanged += 1; if (r.yes) fa += 1; else correct += 1; }
  }
  const cr = nChanged - fa;
  const ba = (hits / nSame + cr / nChanged) / 2;
  // Loglinear-corrected signal detection (the science; carried in detail).
  const hitRate = (hits + 0.5) / (nSame + 1);
  const faRate = (fa + 0.5) / (nChanged + 1);
  const zh = probit(hitRate), zf = probit(faRate);
  return {
    score: clamp01_100(Math.round((ba - 0.5) * 200)), // CONVENTION: discrimination above chance → 0–100
    invalid: false,
    balancedAccuracy: ba, proportionCorrect: correct / items.length,
    hits, misses: nSame - hits, falseAlarms: fa, correctRejections: cr, nSame, nChanged,
    dPrime: zh - zf, criterion: -0.5 * (zh + zf),
    dPrimeAccumulating: nSame < DPRIME_MIN_PER_CLASS || nChanged < DPRIME_MIN_PER_CLASS,
  };
}
