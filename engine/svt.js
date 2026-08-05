// engine/svt.js — Reading Fidelity (Sentence Verification Technique).
// Spec: manual/013-svt.md (read first; this implements it EXACTLY).
// Lineage: Royer, Hastings & Hook 1979; signal detection with the loglinear correction (Hautus 1995).
// Ported from forma v346 svt.js with one deliberate hardening: forma's svtScore(trials) trusted a
// caller-supplied `same` flag — a forged response could carry its own answer key. Here the key lives
// in the FORM: score(form, responses). The 0–100 transform is a Forma CONVENTION (balanced accuracy
// above chance; raw d′/criterion/counts carried in detail — those are the comparable numbers).
// Pure module: no DOM, no storage, no Date, no Math.random — rng injected (consumes zero draws at v1).

// v2 (2026-08-05): the passage BANK. v1 held exactly two passages and returned both, every time,
// consuming zero draws. A ratified bank is larger than a form, so generateForm now SAMPLES
// PASSAGES_PER_FORM passages from the bank using the seeded stream — which is what makes a retest
// possible without re-administering the same text. Sampling is scoring-relevant on a fixed
// instrument, so it is a version bump, as manual/050 §"what happens next" step 1 anticipated.
// v3 (2026-08-05): the RATIFIED bank — ten passages (manual/054), A2 carrying the approved
// single-proposition edit. Content changed, so the version moves; v2 forms are not v3 forms.
export const SVT_VERSION = 3;

// Locked blueprint constants (spec §2).
export const PASSAGES_PER_FORM = 2;
export const ITEMS_PER_PASSAGE = 8;   // 2 original + 2 paraphrase + 2 meaning-change + 2 distractor
export const DPRIME_MIN_PER_CLASS = 16; // below this per class, d′ is flagged accumulating

export const ITEM_TYPES = ['original', 'paraphrase', 'meaning-change', 'distractor'];
export const ITEMS_PER_TYPE = ITEMS_PER_PASSAGE / ITEM_TYPES.length; // 2
// The answer key is a FUNCTION of the item type — it is never authored independently, so it can
// never disagree with the type (spec §3). originals and paraphrases preserve meaning; meaning-
// changes and distractors do not.
export const SAME_TYPES = ['original', 'paraphrase'];
export const keyFor = (type) => SAME_TYPES.includes(type);

// Locked administration text (spec §5).
export const INSTRUCTIONS = 'Read the passage carefully — it will be taken away before the questions. Then judge each sentence one at a time: does it mean the same as something you read? Some sentences are reworded truths, some contradict the passage, and some sound plausible but were never stated. Answer from what the text actually said.';

// ---- THE PASSAGE BANK -----------------------------------------------------------------------
// Ten passages, ratified 2026-08-05 by the psychologist who authors this instrument. Every passage
// carries `status`; the battery reports provisional content, and the deploy script refuses to
// publish, unless every one of them reads 'ratified'.
//
// Each item carries { text, type } and NO answer key: the key is derived from the type by keyFor(),
// which is what makes a key that disagrees with its item type impossible to write down.
export const PASSAGES = [
  {
    id: "desert",
    status: 'ratified',
    title: "How a desert gains and loses heat",
    text: "Deserts are known for extreme temperatures, but the most striking feature is how sharply the heat changes between day and night. During the day, the dry air and bare ground absorb sunlight quickly, and the surface can grow hotter than soil in wetter regions. Because there is little moisture in the air, almost no heat is trapped near the ground. After sunset, that stored heat escapes rapidly into the open sky, and the temperature can fall by more than thirty degrees within a few hours. Plants and animals living in deserts must cope with this swing. Many animals stay underground during the day and become active only at night, when the surface has cooled. Some plants store water in thick stems, allowing them to survive long stretches without rain. These adaptations let life persist in a place of constant temperature change.",
    items: [
      { text: "After sunset, that stored heat escapes rapidly into the open sky.", type: "original" },
      { text: "Some plants store water in thick stems, allowing them to survive long stretches without rain.", type: "original" },
      { text: "Many desert animals shelter below the surface in the daytime and come out to forage after dark.", type: "paraphrase" },
      { text: "Because the air holds so little moisture, hardly any heat is retained close to the surface.", type: "paraphrase" },
      { text: "Because the desert air is full of moisture, most of the day's heat stays trapped near the ground.", type: "meaning-change" },
      { text: "After sunset the temperature can fall by less than three degrees over several hours.", type: "meaning-change" },
      { text: "Desert sand often contains valuable minerals that miners search for.", type: "distractor" },
      { text: "Most deserts receive their small amount of rainfall during the winter months.", type: "distractor" },
    ],
  },
  {
    id: "paper",
    status: 'ratified',
    title: "How paper is made from wood",
    text: "Most paper begins as wood, which is made largely of tiny fibers held together by a natural glue called lignin. To turn wood into paper, the wood is first cut into small chips. These chips are then cooked with chemicals that dissolve the lignin and free the individual fibers. What remains is a wet, soupy mixture of loose fibers and water known as pulp. The pulp is spread in a thin layer onto a moving screen, which lets the water drain away while the fibers settle and begin to link together. The damp sheet is then pressed and passed over heated rollers that dry it completely. As the fibers bond, they form a flat, continuous surface. Manufacturers can add fine clays or dyes to the pulp to make the paper smoother, brighter, or coloured before it is dried.",
    items: [
      { text: "These chips are then cooked with chemicals that dissolve the lignin and free the individual fibers.", type: "original" },
      { text: "The pulp is spread in a thin layer onto a moving screen, which lets the water drain away.", type: "original" },
      { text: "Wood is mostly built from small fibers bound together by a natural adhesive known as lignin.", type: "paraphrase" },
      { text: "To finish the sheet, it is squeezed and then run across hot rollers until it is fully dry.", type: "paraphrase" },
      { text: "The chips are cooked with chemicals that strengthen the lignin so the fibers stay tightly bound.", type: "meaning-change" },
      { text: "The pulp is spread onto a moving screen that keeps the water in place while the sheet forms.", type: "meaning-change" },
      { text: "Recycled paper is collected and reused to reduce the number of trees that are cut down.", type: "distractor" },
      { text: "The first paper was invented in ancient China about two thousand years ago.", type: "distractor" },
    ],
  },
  {
    id: "bread",
    status: 'ratified',
    title: "Why bread rises",
    text: "Bread owes its lightness to a fungus. Baker's yeast is a living single-celled organism that feeds on the sugars in flour. As it feeds, it releases carbon dioxide gas and small amounts of alcohol. The gas cannot escape easily, because kneading the dough develops a stretchy network of proteins called gluten, which traps the bubbles in place. The dough therefore swells while it rests in a warm room. When the loaf goes into the oven, the trapped gas expands further in the heat, and the dough rises quickly one last time before the crust sets. Shortly after that, the heat kills the yeast and the alcohol evaporates. What remains is a firm structure full of small holes, which is why a finished loaf is far lighter than the dough it came from.",
    items: [
      { text: "Baker's yeast is a living single-celled organism that feeds on the sugars in flour.", type: "original" },
      { text: "Shortly after that, the heat kills the yeast and the alcohol evaporates.", type: "original" },
      { text: "Kneading builds a springy web of gluten proteins that holds the bubbles where they are.", type: "paraphrase" },
      { text: "In the oven's heat the captured gas swells again, lifting the dough one final time before the crust hardens.", type: "paraphrase" },
      { text: "Kneading breaks down the gluten so that the gas can escape freely from the dough.", type: "meaning-change" },
      { text: "The yeast survives the baking, which is what keeps the finished loaf soft.", type: "meaning-change" },
      { text: "Most bakers add salt to the dough to slow the yeast down and improve the flavour.", type: "distractor" },
      { text: "Sourdough loaves rise using wild yeasts gathered from the air rather than packaged yeast.", type: "distractor" },
    ],
  },
  {
    id: "beehive",
    status: 'ratified',
    title: "How a beehive holds its temperature",
    text: "A honeybee colony holds the inside of its nest at a remarkably steady temperature, close to thirty-five degrees Celsius, whatever the weather outside. In cold conditions the bees crowd together into a dense cluster and shiver their flight muscles without moving their wings, and the heat this produces warms the whole group. In hot conditions the problem reverses. Foragers bring back droplets of water and spread them in thin films across the combs, while other workers stand at the entrance and fan with their wings to drive air through the nest. As the water evaporates it carries heat away, and the nest cools. A colony that loses access to water on a hot day is therefore in real danger, because fanning alone cannot remove enough heat. The brood, which is the developing young, is the part of the nest that this effort protects.",
    items: [
      { text: "As the water evaporates it carries heat away, and the nest cools.", type: "original" },
      { text: "The brood, which is the developing young, is the part of the nest that this effort protects.", type: "original" },
      { text: "Bees returning from outside carry water back and spread it in thin layers over the combs.", type: "paraphrase" },
      { text: "On a hot day a colony cut off from water is genuinely at risk, since fanning by itself cannot shed enough heat.", type: "paraphrase" },
      { text: "The bees warm the nest in cold weather by beating their wings rapidly in flight.", type: "meaning-change" },
      { text: "A colony with no water on a hot day is in no real trouble, because fanning removes the heat on its own.", type: "meaning-change" },
      { text: "The queen lays every egg in the colony, and the workers feed the larvae that hatch.", type: "distractor" },
      { text: "Beekeepers often add extra ventilation to their hives during a heat wave.", type: "distractor" },
    ],
  },
  {
    id: "treerings",
    status: 'ratified',
    title: "How tree rings record the years",
    text: "Cut across the trunk of a tree from a temperate region and you will see a pattern of pale and dark bands. Each pair of bands is one year of growth. In spring the tree grows quickly and produces wide cells with thin walls, which look pale. Later in the season growth slows, the cells become narrow and thick-walled, and the wood looks darker. The boundary between the dark wood of one year and the pale wood of the next is sharp, which is what makes the rings easy to count. Their width varies. A year with plentiful rain and mild temperatures leaves a wide ring; a year of drought leaves a narrow one. Because trees in the same region respond to the same weather, their ring patterns match, and overlapping samples from living and long-dead wood can be joined into a record reaching back thousands of years.",
    items: [
      { text: "Each pair of bands is one year of growth.", type: "original" },
      { text: "A year with plentiful rain and mild temperatures leaves a wide ring; a year of drought leaves a narrow one.", type: "original" },
      { text: "Early in the year the tree grows fast, making broad thin-walled cells that appear light in colour.", type: "paraphrase" },
      { text: "Since trees in one area live through the same weather, their ring patterns line up with each other.", type: "paraphrase" },
      { text: "A drought year leaves a wide ring, while a wet mild year leaves a narrow one.", type: "meaning-change" },
      { text: "The edge between one year's dark wood and the next year's pale wood is blurred, which makes the rings hard to count.", type: "meaning-change" },
      { text: "Rings are also used to estimate how much carbon a forest has stored.", type: "distractor" },
      { text: "Tropical trees often grow all year round and so form no clear annual rings.", type: "distractor" },
    ],
  },
  {
    id: "salt",
    status: 'ratified',
    title: "How salt preserves food",
    text: "Salting is one of the oldest ways of keeping food from spoiling, and it works by making life difficult for microbes rather than by poisoning them. Bacteria and moulds need liquid water to grow. When salt is packed around meat or fish, it dissolves into whatever moisture is present and draws still more water out of the food, and out of any microbes on its surface, by osmosis. The remaining water is bound up with salt and is no longer freely available. A microbe sitting in that brine loses water faster than it can take it in, so it cannot multiply, and much of the population dies. Salt does not sterilise food. Some organisms tolerate high salt levels, which is why heavily salted products are usually dried, smoked, or kept cold as well.",
    items: [
      { text: "Bacteria and moulds need liquid water to grow.", type: "original" },
      { text: "Salt does not sterilise food.", type: "original" },
      { text: "The water that is left is tied up with the salt and can no longer be used freely.", type: "paraphrase" },
      { text: "Because certain organisms cope with a lot of salt, strongly salted foods are normally dried, smoked, or chilled too.", type: "paraphrase" },
      { text: "Salt preserves food by acting as a poison that kills microbes directly.", type: "meaning-change" },
      { text: "A microbe in the brine takes in water faster than it loses it, so it goes on multiplying.", type: "meaning-change" },
      { text: "Sugar can be used in much the same way, which is why jam keeps so well.", type: "distractor" },
      { text: "Eating a great deal of salt is linked to raised blood pressure.", type: "distractor" },
    ],
  },
  {
    id: "darkadapt",
    status: 'ratified',
    title: "How the eye adapts to darkness",
    text: "Walk into a dark room from bright sunlight and at first you see almost nothing. Within half an hour you can make out shapes that were invisible at the start. Two things are happening. The pupil widens quickly, within seconds, letting more light reach the back of the eye, but this accounts for only a small part of the change. The larger effect is chemical. The light-sensitive cells at the back of the eye contain a pigment that is broken apart by light and has to be rebuilt in the dark, and rebuilding takes time. The cells used for dim vision recover slowly, over twenty to thirty minutes, which is why full adaptation is not quick. It is also easily undone: a few seconds of bright light breaks the pigment down again, and the wait starts over.",
    items: [
      { text: "The larger effect is chemical.", type: "original" },
      { text: "The cells used for dim vision recover slowly, over twenty to thirty minutes, which is why full adaptation is not quick.", type: "original" },
      { text: "A pigment inside the light-sensitive cells is taken apart by light and has to be remade in darkness, which is not fast.", type: "paraphrase" },
      { text: "A brief burst of bright light splits the pigment apart again, and the person has to wait all over again.", type: "paraphrase" },
      { text: "Most of the improvement comes from the pupil opening, and the chemical change matters little.", type: "meaning-change" },
      { text: "Once the eye has adapted, a few seconds of bright light leaves the adaptation untouched.", type: "meaning-change" },
      { text: "Cats see better than people in dim light because of a reflective layer behind the retina.", type: "distractor" },
      { text: "Red light is often used in darkrooms because it disturbs night vision least.", type: "distractor" },
    ],
  },
  {
    id: "flask",
    status: 'ratified',
    title: "How a vacuum flask keeps a drink hot",
    text: "A vacuum flask keeps a drink hot by blocking each of the ways heat can travel. Heat moves by conduction through solids, by convection in moving air or liquid, and by radiation as invisible infrared light. The flask is built as two containers, one inside the other, joined only at the neck. The space between them has had almost all the air pumped out. With almost no air in the gap, there is nothing to carry heat by conduction or convection across it, and the narrow neck is the only solid path left. The facing surfaces are then coated with a mirror finish, which reflects infrared radiation back towards the liquid instead of letting it pass. No flask is perfect. Heat still creeps out slowly through the neck and the stopper, so a drink cools eventually, just far more slowly than it would in a mug.",
    items: [
      { text: "No flask is perfect.", type: "original" },
      { text: "The space between them has had almost all the air pumped out.", type: "original" },
      { text: "The two vessels sit one within the other and touch only where the neck joins them.", type: "paraphrase" },
      { text: "A mirrored coating on the facing surfaces bounces infrared back toward the drink rather than letting it through.", type: "paraphrase" },
      { text: "The gap between the two containers is packed with dense air, and that is what stops the heat.", type: "meaning-change" },
      { text: "The facing surfaces are painted matt black so that they soak up the infrared radiation.", type: "meaning-change" },
      { text: "Vacuum flasks are also used to carry liquid nitrogen in laboratories.", type: "distractor" },
      { text: "A wide-mouthed flask keeps solid food warm better than a narrow one does.", type: "distractor" },
    ],
  },
  {
    id: "seeds",
    status: 'ratified',
    title: "How seeds travel",
    text: "A plant cannot move, but its seeds can, and a seed that germinates directly beneath its parent competes with it for light and water. Plants have therefore evolved several ways of sending their seeds elsewhere. Some produce seeds with wings or tufts of fine hairs that catch the wind and drift. Others wrap the seed in sweet flesh; an animal eats the fruit, carries the seed in its gut, and deposits it some distance away along with a small supply of fertiliser. A third group grows hooks or barbs that catch in fur or feathers and are carried until they are scratched off. A few plants dispense with outside help entirely and build pods that dry, twist, and split open with enough force to fling the seeds several metres. Each of these methods trades something away: wind dispersal is cheap but lands most seeds close to home.",
    items: [
      { text: "Plants have therefore evolved several ways of sending their seeds elsewhere.", type: "original" },
      { text: "Each of these methods trades something away: wind dispersal is cheap but lands most seeds close to home.", type: "original" },
      { text: "Certain plants surround the seed in sweet pulp, so an animal swallows the fruit and drops the seed further off.", type: "paraphrase" },
      { text: "A handful of species manage without any outside help, forming pods that dry out, twist, and burst open hard enough to throw seeds several metres.", type: "paraphrase" },
      { text: "A seed sprouting right under its parent has an advantage, because it shares the parent's light and water.", type: "meaning-change" },
      { text: "Wind dispersal is costly to produce and carries nearly every seed a long way from the parent.", type: "meaning-change" },
      { text: "Coconuts float, and can drift across the sea to reach new islands.", type: "distractor" },
      { text: "Many seeds will not sprout at all until they have been through a spell of cold.", type: "distractor" },
    ],
  },
  {
    id: "soap",
    status: 'ratified',
    title: "How soap cleans",
    text: "Water alone removes very little grease, because grease and water do not mix. A soap molecule solves this by being two things at once. One end of the molecule is attracted to water; the other end is a long chain that is repelled by water and attracted to oil. When soap is stirred into water with greasy dishes in it, the oil-loving ends bury themselves in the grease while the water-loving ends stay outside, facing the water. Many molecules do this at once, and the grease is broken into tiny droplets, each wrapped in a shell of soap with its water-friendly side turned outward. The droplets no longer stick to the plate, and they no longer join back together, so the rinse water carries them away. Warm water helps, because it softens the grease and lets the droplets form more easily.",
    items: [
      { text: "A soap molecule solves this by being two things at once.", type: "original" },
      { text: "Warm water helps, because it softens the grease and lets the droplets form more easily.", type: "original" },
      { text: "The oil-attracted ends push into the grease while the water-attracted ends remain on the outside, in the water.", type: "paraphrase" },
      { text: "The little droplets stop clinging to the dish and stop merging again, so the rinse washes them off.", type: "paraphrase" },
      { text: "Both ends of a soap molecule are attracted to water, and that is how the grease is lifted.", type: "meaning-change" },
      { text: "Warm water hinders the process, because it hardens the grease and makes droplets harder to form.", type: "meaning-change" },
      { text: "Detergents were developed during wartime shortages of the fats used to make soap.", type: "distractor" },
      { text: "Washing the hands with soap for twenty seconds is the usual advice for removing viruses.", type: "distractor" },
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

// ---- BANK VALIDATION (spec §2a) ------------------------------------------------------------------
// Ratification day transcribes authored prose into this file by hand, which is the single most
// error-prone step in the whole build: a mistyped answer key or a paraphrase that accidentally
// quotes the passage verbatim is invisible to every other test, and it silently changes what the
// instrument measures. manual/050 verified these properties by hand for the candidate passages;
// this makes that check permanent and mechanical, so the transcription cannot be wrong quietly.
//
// Returns { ok, errors: [...] } and NEVER throws — it is called by the test suite, by the
// ratification runbook (manual/052) and by the app before it will administer a battery.
export function validateBank(bank = PASSAGES) {
  const errors = [];
  const push = (id, msg) => errors.push(`${id}: ${msg}`);
  if (!Array.isArray(bank)) return { ok: false, errors: ['bank is not an array'] };
  if (bank.length < PASSAGES_PER_FORM) errors.push(`bank holds ${bank.length} passages; a form needs ${PASSAGES_PER_FORM}`);
  const ids = new Set();
  for (const p of bank) {
    const id = p && typeof p.id === 'string' ? p.id : '(unnamed)';
    if (!p || typeof p !== 'object') { errors.push('a bank entry is not an object'); continue; }
    if (typeof p.id !== 'string' || !p.id) push(id, 'missing id');
    else if (ids.has(p.id)) push(id, 'duplicate id'); else ids.add(p.id);
    if (p.status !== 'provisional' && p.status !== 'ratified') push(id, `status must be provisional|ratified, got ${JSON.stringify(p.status)}`);
    if (typeof p.title !== 'string' || !p.title.trim()) push(id, 'missing title');
    if (typeof p.text !== 'string' || !p.text.trim()) { push(id, 'missing passage text'); continue; }
    if (!Array.isArray(p.items) || p.items.length !== ITEMS_PER_PASSAGE) {
      push(id, `needs exactly ${ITEMS_PER_PASSAGE} items, has ${p.items ? p.items.length : 0}`);
      continue;
    }
    // Collapse whitespace once; passage prose and item prose must be compared on equal terms.
    const flat = p.text.replace(/\s+/g, ' ').trim();
    const seen = new Set();
    for (const type of ITEM_TYPES) {
      const n = p.items.filter((it) => it && it.type === type).length;
      if (n !== ITEMS_PER_TYPE) push(id, `needs exactly ${ITEMS_PER_TYPE} "${type}" items, has ${n}`);
    }
    for (const it of p.items) {
      if (!it || typeof it.text !== 'string' || !it.text.trim()) { push(id, 'an item has no text'); continue; }
      if (!ITEM_TYPES.includes(it.type)) { push(id, `unknown item type ${JSON.stringify(it.type)}`); continue; }
      // The answer key is DERIVED from the type by keyFor(); a ratified bank entry carries
      // { text, type } and no key at all, which is what makes a key/type disagreement impossible to
      // transcribe in the first place. A `same` field is therefore optional — but if one IS present
      // (a v1-shaped entry, or a hand-typed key) it must agree, so a stale key can never sit in the
      // bank looking authoritative while generateForm quietly overrides it.
      if ('same' in it && (typeof it.same !== 'boolean' || it.same !== keyFor(it.type))) {
        push(id, `stale answer key disagrees with item type on "${it.text.slice(0, 40)}…" (${it.type} derives same:${keyFor(it.type)}) — delete the key, the type carries it`);
      }
      const norm = it.text.replace(/\s+/g, ' ').trim().replace(/\.$/, '');
      if (seen.has(norm)) push(id, `duplicate item text "${norm.slice(0, 40)}…"`);
      seen.add(norm);
      // An ORIGINAL must appear verbatim in its own passage — that is what makes it an original.
      // A DISTRACTOR must NOT: the whole point is that it was never stated. (Terminal full stops are
      // ignored, because an original is usually a clause lifted out of a longer sentence.)
      const inText = flat.includes(norm);
      if (it.type === 'original' && !inText) push(id, `"original" is not verbatim in the passage: "${norm.slice(0, 50)}…"`);
      if (it.type === 'distractor' && inText) push(id, `"distractor" appears verbatim in the passage: "${norm.slice(0, 50)}…"`);
    }
  }
  return { ok: errors.length === 0, errors };
}

// Bank-level content status. 'ratified' only when EVERY passage in the bank is — one provisional
// passage makes the whole instrument provisional, because forms sample across the bank.
export function bankStatus(bank = PASSAGES) {
  return Array.isArray(bank) && bank.length && bank.every((p) => p && p.status === 'ratified') ? 'ratified' : 'provisional';
}
export const CONTENT_STATUS = bankStatus();

// ---- Form generation ----
// FIXED item order within a passage — a standardized form never shuffles its items (spec §2).
// The PASSAGES themselves are sampled without replacement from the bank via the injected stream, so
// a person can retest without meeting the same text twice, and the pair is reproducible from
// (SVT_VERSION, seed). Exactly PASSAGES_PER_FORM draws are consumed regardless of how large the
// bank is — growing the bank therefore does not shift the forms of instruments that draw after this
// one from the shared battery stream.
export function generateForm(rng, bank = PASSAGES) {
  if (typeof rng !== 'function') throw new Error('svt.generateForm requires an injected rng');
  if (!Array.isArray(bank) || bank.length < PASSAGES_PER_FORM) {
    throw new Error(`svt.generateForm needs at least ${PASSAGES_PER_FORM} passages in the bank`);
  }
  const pool = bank.slice();
  const picked = [];
  for (let k = 0; k < PASSAGES_PER_FORM; k++) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return {
    version: SVT_VERSION,
    contentStatus: bankStatus(picked),
    passages: picked.map((p) => ({
      id: p.id, status: p.status, title: p.title, text: p.text,
      items: p.items.map((it) => ({ text: it.text, type: it.type, same: keyFor(it.type) })),
    })),
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
      if (p.items.filter((it) => it && it.type === type).length !== ITEMS_PER_TYPE) {
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
      || it.same !== keyFor(it.type)
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
