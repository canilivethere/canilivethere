// CanILiveThere — shared header, persona switcher, and small utilities used
// by every page. No framework, no build step: plain DOM, ES modules loaded
// directly by the browser.

import { topBottomCriteria } from "./data.js";
import { siteUrl } from "./site-root.js";
import { eliminatedColor, repaintRampSwatches } from "./colors.js";

export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Author-written paragraph breaks in a stored free-text field (today: a
// change event's `detail`, on the location pages and the Corrections
// page) are real "\n\n" characters in the data. escapeHtml() alone drops
// them: HTML collapses newlines to spaces, so seven rows and 11k
// characters of GT-antigua rendered as one unbroken wall.
//
// Three mechanisms were possible -- CSS `white-space: pre-line` (the
// idiom the map tooltip and teaser already use), literal <br><br>, or
// one element per paragraph. This is the third, and the reason is
// assistive tech, not looks: a 3,215-character block is a single
// paragraph to a screen reader under either of the other two, and the
// longest detail rows on file are exactly that long. Splitting into real
// <p> elements gives the same visible break AND the structure a screen
// reader can navigate by.
//
// Content-safe by construction: the text is still escaped, one segment
// at a time, and the only characters dropped are the newline separators
// themselves -- nothing is added, reworded or reordered. Splits on runs
// of 2+ newlines (a blank line = a paragraph break); a lone newline
// inside a paragraph stays inside it, where HTML's own whitespace
// collapsing renders it as the space the author's line-wrap meant. Every
// newline run in the current data is exactly one blank line, so no row
// today exercises that second branch -- it is there so an odd one later
// degrades quietly instead of breaking.
//
// Returns "" for empty/absent input, same contract as escapeHtml().
export function escapeParagraphs(str) {
  if (str == null) return "";
  const text = String(str);
  if (!text) return "";
  const paras = text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  if (paras.length <= 1) return escapeHtml(text);
  return paras.map((para) => `<p>${escapeHtml(para)}</p>`).join("");
}

// v7 §7.1: widened from 3 to all 8 locked personas (Amendment 1 §A1.2's
// own widening trigger applies to the whole switcher, not just the three
// that had fixture data first). Exported (v7 Part 10/11): the
// perspective-door tiles and the top-of-page switcher both read this one
// array, in this one order, so the two surfaces can never disagree about
// who exists or what order they come in (Part 11's "one true source, two
// renderings").
export const VALID_PERSONAS = ["waldo", "wenda", "carmen", "adira", "noa", "marek", "marguerite", "teo"];
export function getPersona() {
  const params = new URLSearchParams(location.search);
  const p = params.get("persona");
  return p && VALID_PERSONAS.includes(p) ? p : null;
}

// ---------------------------------------------------------------------
// Reader-preferences localStorage envelope (v11 Part 21, format ruled at
// 8P.3) — the third door's own reader-built weight vector, the
// first occupant of a versioned, namespaced envelope future preferences
// features (custom colors, hidden pins) will get their own sibling key
// inside, not a dedicated flat key each. One bare key ("reader-preferences",
// unprefixed — matches THEME_KEY/DOOR_SEEN_KEY's own existing bare-key
// convention), one JSON object, versioned by an internal `schema_version`
// field rather than the key name (mirrors derived/meta.json's own
// versioning shape). Every touch wrapped in try/catch, failing open to "no
// stored profile, behave as general" — same discipline THEME_KEY/
// DOOR_SEEN_KEY's own read/write functions already use, never a thrown
// error blocking page render for a reader with storage disabled.
// ---------------------------------------------------------------------
const READER_PREFS_KEY = "reader-preferences";
const READER_PREFS_SCHEMA_VERSION = 1;

function readReaderPreferences() {
  try {
    const raw = localStorage.getItem(READER_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // A schema_version mismatch (an old stored blob under a newer site
    // build) fails the same way as no stored value at all — safer than
    // guessing at a shape the running code doesn't recognize; the reader
    // just re-answers the door once (8P.3's own ruled read/write rule).
    if (!parsed || parsed.schema_version !== READER_PREFS_SCHEMA_VERSION) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

// The custom_profile sub-object ({ weights, answers, created_at,
// updated_at }), or null if none is stored / the stored value doesn't
// parse / the version doesn't match.
// VISIT COPY FIRST, THEN THE DURABLE ONE — the same precedence
// loadOwnNumbers() already uses, for the same reason: a reader who
// answered the box this visit must be answered with what they just said,
// not with something a previous visit left on the device.
export function loadCustomProfile() {
  const session = readSessionPreferences();
  const prefs = (session && session.custom_profile) ? session : readReaderPreferences();
  return prefs && prefs.custom_profile ? prefs.custom_profile : null;
}

// Presence of a valid custom_profile object in the envelope IS the
// completion marker 21.8 item 2 asks for — no separate flag (the ruled
// reconciliation between the two spec authorities this build reads
// from). Used by the door's trigger-condition third clause (21.9) and by
// the switcher's own "Your priorities" entry-detection, both below.
export function hasCustomProfile() {
  const profile = loadCustomProfile();
  return !!(profile && profile.weights);
}

// Merge-write discipline (§8AA.1, mandatory, found live before it ever
// shipped): the envelope now holds more than one
// sub-object (custom_profile, nationality, saved_perspective — see the
// door/passport-lens build), so a writer that rebuilds the whole payload
// from scratch erases every sibling key it doesn't know about. This is the
// one write path every sub-object writer in this file goes through from
// here on: reads whatever is already stored, updates ONLY the named key,
// writes every other key back verbatim. `existing` already fails closed to
// `null` (a corrupt blob or a schema_version mismatch) via
// readReaderPreferences() above — spread of `null` is safely `{}`, so a
// first-ever write behaves exactly as it did before this fix.
function writeReaderPreferenceKey(key, value) {
  try {
    const existing = readReaderPreferences();
    const payload = { ...(existing || {}), schema_version: READER_PREFS_SCHEMA_VERSION, [key]: value };
    localStorage.setItem(READER_PREFS_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    return false;
  }
}

// weights: the 13-key criterion_id -> 0-3 vector (8P.1). answers: the raw
// per-question answer trail (8P.3's own forward-compatibility field, for a
// future "revisit your answers" affordance) — stored alongside the
// computed vector, not instead of it, since the vector is a deterministic
// function of the answers and storing both costs a few dozen bytes.
// created_at is preserved across an edit (only set fresh the first time);
// updated_at always reflects this write. Returns true/false rather than
// throwing, matching this module's fail-open discipline throughout.
// THE DEFAULT IS THIS VISIT. See the block comment on
// writeReaderAnswer() below: what the reader tells the box is written to
// sessionStorage, and reaches localStorage only where they have turned
// the keep switch on. Priorities used to be written durably on submit,
// with no opt-in anywhere in the process.
export function saveCustomProfile(weights, answers) {
  const now = new Date().toISOString();
  const existing = readSessionPreferences() || readReaderPreferences();
  const createdAt = existing?.custom_profile?.created_at || now;
  return writeReaderAnswer("custom_profile", { weights, answers, created_at: createdAt, updated_at: now });
}

// ---------------------------------------------------------------------
// The passport lens (nationality) and the door's own memory
// (saved_perspective) — §8AA.1's two new envelope siblings, both real
// as of the door rework. Same fail-open,
// merge-write discipline as custom_profile above.
// ---------------------------------------------------------------------

// { code, created_at, updated_at } | null. `code` is one uppercase ISO
// 3166-1 alpha-2 string (§15.5's ratified vocabulary) — single-select by
// contract (§15.4).
export function loadNationality() {
  const session = readSessionPreferences();
  const prefs = (session && session.nationality) ? session : readReaderPreferences();
  return prefs && prefs.nationality ? prefs.nationality : null;
}

// NATIONALITY IS THE MOST SENSITIVE FIELD IN THE BOX AND IT USED TO BE
// THE ONE THAT PERSISTED BY DEFAULT — written to localStorage on submit,
// permanently, with no opt-in anywhere in the process, while the figures
// the switch does name went to sessionStorage. That is now inverted to
// match the copy: visit-scoped unless the reader keeps it.
export function saveNationality(code) {
  const now = new Date().toISOString();
  const existing = readSessionPreferences() || readReaderPreferences();
  const createdAt = existing?.nationality?.created_at || now;
  return writeReaderAnswer("nationality", { code, created_at: createdAt, updated_at: now });
}

// { kind: "persona"|"custom"|"none", persona_id, chosen_at } | null — the
// door's own memory of the reader's last explicit choice there. Per
// §8AA.1: this is the door's memory, never a render lens on its own —
// getActivePersona() below never reads it directly; only the door itself
// (perspective-door.js) reads it, to pre-offer the resume band.
export function loadSavedPerspective() {
  const session = readSessionPreferences();
  const prefs = (session && session.saved_perspective) ? session : readReaderPreferences();
  return prefs && prefs.saved_perspective ? prefs.saved_perspective : null;
}

// kind: "persona" | "custom" | "none". personaId: required iff
// kind==="persona", else null.
// Visit-scoped by the same rule, and for a plain reason: it is the
// door's record of what the reader chose. Leaving it durable while the
// thing it points at is visit-scoped would produce a door offering to
// continue from a profile that is no longer there.
export function saveSavedPerspective(kind, personaId) {
  return writeReaderAnswer("saved_perspective", {
    kind,
    persona_id: kind === "persona" ? personaId : null,
    chosen_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------
// The welcome box's own figures (own_numbers) — the envelope's fourth
// sibling key, and ruled to be exactly that: one new
// sibling key, snake_case, bare inside the envelope, written ONLY through
// writeReaderPreferenceKey(); schema_version stays 1, because the change
// is purely additive, nothing enumerates envelope keys, and a bump would
// silently wipe every returning reader's saved passport and priorities
// for no gain at all.  Same fail-open, merge-write discipline as the
// three siblings above.
//
// The ruled shape: { amount, currency, period, income_type,
// duration_band, property_capital?: { amount, currency }, created_at,
// updated_at }. The amount is stored exactly as the reader entered it,
// in the currency and period they chose — period arithmetic is a
// render-time operation on the way into a comparison, never a storage
// transformation, so the box can never hand back a figure the reader
// never typed. property_capital is ABSENT entirely when the optional
// checkbox is off — not null, and above all not 0: a stored zero is a
// claim the reader made about themselves, and an unticked optional
// checkbox is not that claim.
// ---------------------------------------------------------------------

// The ruled vocabularies, and this file is where they live — the values
// are unchanged, only their one home is now stated. They were written out
// twice, here and in the box's engine module, and the loader below
// REJECTS a stored value outside these lists: a later hand that added an
// option in one copy and not the other would silently throw away figures
// a reader had saved, with nothing in either file to say why.
// Direction, deliberately: the box's engine imports these from here, not
// the other way round. Every page on the site loads this file and only
// the front page loads the box, so pointing the import the other way
// would put the box's route table on every page for the sake of thirteen
// strings — and this file is the base every feature imports, so a base
// that reached back into a feature is the shape a cycle grows out of.
// This file imports nothing from the box, and the box is a leaf.
// "OTHER" is an explicit sentinel, not an ISO code: it exists because
// currency is a required sub-unit of the amount field, so null would be
// ambiguous between "another currency" and "not answered". No code path
// may feed it to a rate lookup or default it to anything.
export const OWN_NUMBERS_CURRENCIES = ["USD", "EUR", "THB", "OTHER"];
export const OWN_NUMBERS_PERIODS = ["month", "year"];
export const OWN_NUMBERS_INCOME_TYPES = ["pension", "passive", "remote_active", "local_active", "unspecified"];
export const OWN_NUMBERS_DURATION_BANDS = ["visit", "long_stay"];

// Returns null — never {} — when the key is absent or the stored value
// doesn't validate, as ruled. This is load-bearing for
// hasAnySavedReaderState() below, which is a truthiness test: an empty
// object is truthy, and would render the "Forget what I've saved here"
// control for a reader with nothing saved.
// Reads the VISIT copy first, then the durable one. Precedence, not a
// merge: a reader who typed new figures this visit must not be answered
// with the ones they kept last month. The validation below is unchanged
// and runs on whichever copy won, so a bad value in either store fails
// the same closed way it always did.
export function loadOwnNumbers() {
  const session = readSessionPreferences();
  const prefs = (session && session.own_numbers) ? session : readReaderPreferences();
  const v = prefs && prefs.own_numbers;
  if (!v || typeof v !== "object") return null;
  if (!Number.isFinite(v.amount) || v.amount <= 0) return null;
  if (!OWN_NUMBERS_CURRENCIES.includes(v.currency)) return null;
  if (!OWN_NUMBERS_PERIODS.includes(v.period)) return null;
  if (!OWN_NUMBERS_INCOME_TYPES.includes(v.income_type)) return null;
  if (!OWN_NUMBERS_DURATION_BANDS.includes(v.duration_band)) return null;
  if (v.property_capital !== undefined) {
    const p = v.property_capital;
    if (!p || typeof p !== "object") return null;
    if (!Number.isFinite(p.amount) || p.amount <= 0) return null;
    if (!OWN_NUMBERS_CURRENCIES.includes(p.currency)) return null;
  }
  return v;
}

// fields: { amount, currency, period, income_type, duration_band,
// property_capital? }. created_at is preserved across an edit; updated_at
// always reflects this write — the same shape custom_profile and
// nationality already implement. Returns true/false rather than throwing.
//
// Door v2: this is now the DURABLE write only — the one
// the reader turns on for themselves after they have seen the map. The
// visit-scoped write is saveOwnNumbersForVisit() below. Splitting them is
// what makes the amended privacy sentence ("for this visit … keeping them
// for next time is a switch you turn on yourself") true rather than
// aspirational: the sentence and the mechanism have to land together,
// and they do.
export function saveOwnNumbers(fields) {
  const now = new Date().toISOString();
  const existing = readReaderPreferences();
  const createdAt = existing?.own_numbers?.created_at || now;
  return writeReaderPreferenceKey("own_numbers", { ...fields, created_at: createdAt, updated_at: now });
}

// The visit-scoped carrier, and the default: same envelope shape, same
// key name, same sub-object key, sessionStorage instead of localStorage.
// The reader's figures have to survive a navigation to lists.html and l/*.html without a URL and without a
// server; the durable save was opt-in and argued as such, and that
// argument holds for KEEPING them and cannot hold for CARRYING them one
// page across.
//
// SCOPED DELIBERATELY TO own_numbers, and this is a real, named
// asymmetry: custom_profile, nationality and saved_perspective keep their
// existing durable-on-save behaviour, because each already ships a gated
// reader sentence that says "saved on this device" and moving them to a
// visit store would make three shipped sentences false. The envelope now
// lives in two stores for exactly one key, which is a two-vocabulary risk
// of the class the box's own build notes flag; the read path below is the
// one place that resolves it, so there is one merge rule, not one per
// call site.
const SESSION_PREFS_KEY = READER_PREFS_KEY;

function readSessionPreferences() {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schema_version !== READER_PREFS_SCHEMA_VERSION) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function writeSessionPreferenceKey(key, value) {
  try {
    const existing = readSessionPreferences();
    const payload = { ...(existing || {}), schema_version: READER_PREFS_SCHEMA_VERSION, [key]: value };
    sessionStorage.setItem(SESSION_PREFS_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------------
// THE ONE WRITE RULE FOR EVERYTHING THE READER TELLS THE BOX
//
// THE DEFECT THIS CLOSES, found on a cold walk of the live site: the box
// promises, in step one's own privacy paragraph, that what the reader
// types "stays in this browser, on this device, FOR THIS VISIT", and that
// "keeping them for next time is a switch you turn on yourself" — a
// switch that ships off by default. Measured against that promise, the
// build kept two different rules: the figures honoured it, and the
// passport and the priorities did not. Both were written to localStorage
// on submit, permanently, with no opt-in anywhere in the process.
// Nationality is the most sensitive field in the form and it was the one
// that persisted by default.
//
// THE RULE, one for all four sub-objects: every answer is written to the
// VISIT store always, and to the DURABLE store only where the reader has
// turned the keep switch on. Reads take the visit copy first and fall
// back to the durable one, which is the precedence loadOwnNumbers()
// already used and the only one that answers a reader with what they
// just said.
//
// readerKeepsOnDevice() is the consent test and it is deliberately the
// presence of a durable copy of ANY answer, not a separate boolean flag:
// a flag can disagree with what is actually on the device, and a flag
// that says "off" over a stored passport is the exact class of defect
// this block exists to remove. The switch's own tick reads the same test.
// ---------------------------------------------------------------------
export function readerKeepsOnDevice() {
  const prefs = readReaderPreferences();
  if (!prefs) return false;
  return !!(prefs.own_numbers || prefs.nationality || prefs.custom_profile || prefs.saved_perspective);
}

function writeReaderAnswer(key, value) {
  const okSession = writeSessionPreferenceKey(key, value);
  if (readerKeepsOnDevice()) writeReaderPreferenceKey(key, value);
  return okSession;
}

// Turning the switch ON copies whatever is in play THIS VISIT onto the
// device — all of it, because the reader is answering one question about
// one box, not four questions about four keys. Turning it OFF removes
// every durable copy and leaves the visit copies exactly where they are:
// un-ticking undoes "keep this for next time", it does not wipe the map
// the reader is currently looking at. Erasing everything is a different
// control with a different label (forgetReaderPreferences, below).
const READER_ANSWER_KEYS = ["own_numbers", "nationality", "custom_profile", "saved_perspective"];

export function keepReaderAnswersOnDevice() {
  const session = readSessionPreferences();
  const durable = readReaderPreferences();
  let ok = true;
  for (const key of READER_ANSWER_KEYS) {
    const value = (session && session[key]) || (durable && durable[key]);
    if (value !== undefined && value !== null) ok = writeReaderPreferenceKey(key, value) && ok;
  }
  return ok;
}

export function stopKeepingReaderAnswers() {
  let ok = true;
  for (const key of READER_ANSWER_KEYS) ok = writeReaderPreferenceKey(key, undefined) && ok;
  return ok;
}

export function saveOwnNumbersForVisit(fields) {
  const now = new Date().toISOString();
  const existing = readSessionPreferences();
  const createdAt = existing?.own_numbers?.created_at || now;
  return writeSessionPreferenceKey("own_numbers", { ...fields, created_at: createdAt, updated_at: now });
}

// ownNumbersAreVisitOnly(), hasDurableOwnNumbers() and clearOwnNumbers()
// are all REMOVED, and the reason is one rule replacing three.
//
// Each answered a figures-only version of a question that is now asked
// about the whole box: "is this kept?" is readerKeepsOnDevice(), "keep
// it" is keepReaderAnswersOnDevice(), "stop keeping it" is
// stopKeepingReaderAnswers() — see the write-rule block above. Leaving
// the old three beside the new three would be four storage functions for
// two ideas, and a second zero-call-site storage function is exactly the
// defect that was found here the first time.
//
export function isReaderStorageAvailable() {
  try {
    localStorage.getItem(READER_PREFS_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------------
// Explicit-general session view state (§8AA.2) — td12's real fix:
// viewing plainly and forgetting permanently are two different acts.
// sessionStorage (not the envelope): lives exactly as long as "this
// visit" (per-tab, survives in-site navigation, gone when the tab
// closes) — no expiry bookkeeping, nothing to go stale, nothing this
// forgets on its own that a reader would need to explicitly undo later.
// ---------------------------------------------------------------------
const EXPLICIT_GENERAL_KEY = "clt-explicit-general";

export function isExplicitGeneral() {
  try {
    return sessionStorage.getItem(EXPLICIT_GENERAL_KEY) === "1";
  } catch (e) {
    return false;
  }
}

export function setExplicitGeneral() {
  try {
    sessionStorage.setItem(EXPLICIT_GENERAL_KEY, "1");
  } catch (e) {}
}

// Choosing any lens IS leaving the general view (§8AA.2) — every call
// site that activates a persona, a custom profile, or the passport lens
// clears this alongside doing so.
export function clearExplicitGeneral() {
  try {
    sessionStorage.removeItem(EXPLICIT_GENERAL_KEY);
  } catch (e) {}
}

// ---------------------------------------------------------------------
// Door-answered session flag (§8AA.6, ruled). The
// always-meet-the-door rework
// (§8AA.2/25.2) dropped the old door-seen permanent gate but never
// replaced it with any visit-scoped "already answered" concept — every
// completion path (persona pick, passport save, priorities save,
// explicit-general/Escape) ended in a plain reload that met
// shouldShowDoor()'s bare "no ?persona= present" check and re-summoned
// the door over whatever had just been correctly set. sessionStorage
// (not the envelope): sticks for this tab's session only, so a genuinely
// new visit still meets the door fresh — the always-meet rule is
// per-visit, not per-answer.
// ---------------------------------------------------------------------
const DOOR_ANSWERED_KEY = "clt-door-answered";

export function isDoorAnswered() {
  try {
    return sessionStorage.getItem(DOOR_ANSWERED_KEY) === "1";
  } catch (e) {
    return false;
  }
}

export function markDoorAnswered() {
  try {
    sessionStorage.setItem(DOOR_ANSWERED_KEY, "1");
  } catch (e) {}
}

// True whenever the "Forget what I've saved here" control (§8AA.3) has
// anything real to offer forgetting — gates whether that control renders
// at all, at either of its two surfaces (the door's resume band, the
// switcher block), so it's never a dead affordance for a reader with
// nothing stored.
// Extended for the welcome box, as ruled: a
// reader who saves ONLY their figures used to get `false` here, and a
// stranger's income then sat in storage with no visible way to clear it
// — the exact failure this function was written to prevent, arriving
// through a new door.
// This function is necessary but not sufficient at either surface: each
// one wraps the control in a block of its own, and that block has its own
// condition. The welcome box renders it inside the save block at the foot
// of the result screen; the door renders it inside the resume band, which
// exists only where a saved LENS does — so the door carries a second,
// figures-only branch as well. A reader with figures and nothing else has
// to reach the control from both, and does.
// forgetReaderPreferences() below needs no change: it removes the whole
// envelope key, so own_numbers is covered by construction.
export function hasAnySavedReaderState() {
  return !!(hasCustomProfile() || loadNationality() || loadSavedPerspective() || loadOwnNumbers());
}

// §8AA.3: forget = remove the envelope key, whole — never field surgery.
// Also clears the explicit-general session flag and any lingering
// door-seen remnant (§8AA.4's own retirement, belt-and-suspenders here
// too). `theme` lives under its own key and is untouched by construction
// — no carve-out needed. After this runs, the reader is a fresh visitor
// by construction; the caller decides whether/how to reflect that
// (every current call site reloads the page).
export function forgetReaderPreferences() {
  try { localStorage.removeItem(READER_PREFS_KEY); } catch (e) {}
  // The visit-scoped envelope is reader data too, and it is the copy most
  // likely to hold an income the reader just typed — removed by the same
  // whole-key rule, never field surgery.
  try { sessionStorage.removeItem(SESSION_PREFS_KEY); } catch (e) {}
  try { sessionStorage.removeItem(EXPLICIT_GENERAL_KEY); } catch (e) {}
  try { sessionStorage.removeItem(VIEW_STATE_KEY); } catch (e) {}
  try { localStorage.removeItem("door-seen"); } catch (e) {}
}

// The forget affordance's own two-state confirm mechanics (§8AA.3 / C10),
// one implementation shared by both surfaces it renders at (the switcher
// block above, the door's resume band in perspective-door.js) — no modal
// stack, a single button whose own label carries the confirm step. The
// button's starting label ("Forget my answers") is read from
// the DOM rather than hardcoded here, so each call site's own markup
// stays the single source of that first-state string.
export function wireForgetControl(btn, { onDone } = {}) {
  if (!btn) return;
  let confirming = false;
  btn.addEventListener("click", () => {
    if (!confirming) {
      confirming = true;
      // REWORDED. "everything you've
      // saved on this device" named a device copy that does not exist with
      // the keep switch off — the default — while the control still really
      // does clear the visit copy. The new line keeps the existing
      // second-person turn and states the true scope: this browser, both
      // copies, in the only word that covers session and device without
      // claiming either. Enumerating the four things would rot again at the
      // fifth, so there is still no count; the wording matches the control's
      // own new label, "Forget my answers".
      btn.textContent = "Sure? This clears your answers out of this browser.";
      return;
    }
    forgetReaderPreferences();
    if (onDone) onDone();
  });
}

// Attaches store.customWeights (or null) onto an already-built store —
// runtime-layered, same category as fixturesByPersona/verdictsByPersona,
// never a derived/ fetch (data.js's own header comment names this
// exception). Must run after loadStore() resolves and before any call to
// store.personaIndex("custom", ...) — call once per page, right after
// awaiting loadStore().
export function applyStoredCustomWeights(store) {
  const profile = loadCustomProfile();
  store.customWeights = profile ? profile.weights : null;
}

// The one place precedence between an explicit URL persona, the
// explicit-general session flag, and a stored custom weight vector gets
// decided (the original ruling, later extended for the new middle
// tier) — deliberately NOT folded into getPersona() itself, since
// "custom" is deliberately kept out of VALID_PERSONAS (see that export's
// own comment). URL persona always wins (same "explicit signal beats
// stored state" precedent perspective-door.js's own shouldShowDoor()
// already uses for ?persona= vs. its old door-seen check); an active
// explicit-general flag returns null (genuinely unfiltered) even with a
// stored profile still present — this is td12's actual fix, the whole
// reason the flag exists; falls back to "custom" only when neither of
// those applies AND a stored vector exists; falls back to null (general)
// otherwise. A stored PERSONA choice (saved_perspective) never enters
// this precedence at all — §8AA.1's own hard boundary, "the door's
// memory, never a render lens": only the door itself reads
// saved_perspective, to pre-offer it, never to silently apply it.
// Door v2: the reader identity now covers EVERY combination
// the one process can produce, not only a built weight vector. Under one
// box a reader may have given numbers, priorities, a passport or any mix,
// and one identity has to carry all of it — the perspective line, not the
// identity, is what says which. The token stays "custom" — the stored
// envelope is deliberately left untouched; only the DISPLAY label moves, to "You" — see personaDisplayLabel() below.
//
// Precedence is unchanged in shape and in order: an explicit URL persona
// still wins; an active explicit-general flag still returns null even with
// everything saved; the reader identity is still the last fallback before
// general.
export function hasReaderInput() {
  return !!(hasCustomProfile() || loadOwnNumbers() || loadNationality());
}

// Whether the reader's own weight vector exists. Gates every render of
// CUSTOM_ESTIMATE_SUFFIX ("from your priorities"), which is a claim about
// priorities the reader set and is false for a reader who gave only
// figures or only a passport. The COUNT the old wording carried ("seven
// answers") went with the all-seven gate it described, which this build
// retired — but the gate this function IS does not change: no priorities, no suffix.
export function hasReaderWeights() {
  return hasCustomProfile();
}

// RESTORED — the persona lens now carries across lists, location and
// l/*.
//
// THE DEFECT, REPRODUCED IN A BROWSER BEFORE IT WAS TOUCHED, because
// "exists is not reaches" cuts both ways and a fix aimed at the wrong
// cause reaches nothing either. Measured against the served working tree,
// Playwright, one context, one reader:
//   pick Teo on the door        -> URL index.html?persona=teo
//                               -> "Shown for Teo — one of the site's
//                                  eight worked examples, not you."
//   click Lists in the nav      -> lists.html?persona=teo
//                               -> "Shown for Teo" (the withPersona path
//                                  worked all along)
//   open lists.html directly    -> "Shown as-is — the general figures,
//                                  nobody's situation in particular."
//   open l/GT-antigua.html      -> the same general line
// So the persona lens was carried by ONE thing only, the query string,
// and every arrival that is not a click on this site's own nav — a typed
// address, a bookmark, a new tab, a reload after an edit, a link from
// anywhere — dropped it. The reader's OWN identity survived all four,
// because it is carried in storage; the eight test personas were not.
// Walked from the chair, the second path gives "the eight test personas
// reach one page out of four", and the count is right for the way a
// reader actually arrives.
//
// THE FIX IS THE CARRIER, NOT THE COPY. No string is authored or changed:
// the perspective line already renders the persona branch correctly and
// has all session — it was being handed `null` and saying so truthfully.
// The perspective-disclosure law was not being broken by the sentence; it
// was being satisfied by a sentence about a lens the reader thought they
// had chosen. Both surfaces that ask "whose eyes is this?" —
// perspectiveLineParts() and cornerLensValue() — resolve through this one
// function, so one line reaches both on all four pages.
//
// WHAT IT SUPERSEDES, KEPT AND MARKED, NOT DELETED. The earlier
// boundary, which this function's header still states above and which is
// now narrowed rather than deleted: "A stored PERSONA choice
// (saved_perspective) never enters this precedence at all — the door's
// memory, never a render lens: only the door itself reads
// saved_perspective, to pre-offer it, never to silently apply it." That
// boundary was written for a build in which the door was the only thing
// that could apply a persona, and under it the door DID apply one — by
// navigating with ?persona=, perspective-door.js:522 and :542. The
// restoration is later and it is the specific one. The narrowing is
// exactly
// one kind: only `kind === "persona"`, and only a persona the site still
// ships. "custom" and "none" are untouched, so the reader's own box and
// the explicit-general choice keep the precedence they already had.
//
// PRECEDENCE, AND WHY IT SITS HERE AND NOT ELSEWHERE IN THE CHAIN:
//   1. an explicit ?persona= still wins, unchanged — an explicit signal
//      beats stored state, this file's own standing precedent;
//   2. an active explicit-general flag still returns null, unchanged — a
//      live "show me the general figures" must outrank a stored persona
//      for the same reason it already outranks a stored profile;
//   3. THEN a saved persona, because it is the reader's last explicit
//      choice AT THE DOOR, and because this is the precedence the URL
//      path already gave them one click earlier — the storage arrival and
//      the nav arrival now agree instead of contradicting each other;
//   4. then the reader's own identity, unchanged.
// Step 3 cannot strand a stale persona over a reader's own figures:
// perspective-door.js:404 overwrites saved_perspective with kind "custom"
// the moment the box is committed, and :440 with kind "none" on the
// explicit-general path.
//
// NOT CHANGED, DELIBERATELY: withPersona() still reads the URL only, so
// no link on this site starts carrying a persona it did not carry before,
// and no personal field reaches a query string. The lens travels in
// storage, which is where the reader's own data already travels.
export function getActivePersona() {
  const urlPersona = getPersona();
  if (urlPersona) return urlPersona;
  if (isExplicitGeneral()) return null;
  const saved = loadSavedPerspective();
  if (saved && saved.kind === "persona" && VALID_PERSONAS.includes(saved.persona_id)) {
    return saved.persona_id;
  }
  return hasReaderInput() ? "custom" : null;
}

// ---------------------------------------------------------------------
// The index (view) the reader is looking at. Switching it must not
// reset, and it has to travel between the map and the Lists. Two in-memory
// variables used to hold it, one per page, so map -> Lists on "Easiest
// visa" landed on blended fit. One key, both pages, both directions.
//
// sessionStorage and NOT the reader-preferences envelope: a chosen index
// is not personal data — it says nothing about
// the reader, only about what they last clicked — so it does not belong
// in the envelope the forget control exists to clear. It is cleared by
// forgetReaderPreferences() anyway, because a reader asking to be
// forgotten should not come back to a view they do not remember choosing.
// ---------------------------------------------------------------------
const VIEW_STATE_KEY = "clt-view-index";

export function loadViewIndex() {
  try {
    return sessionStorage.getItem(VIEW_STATE_KEY) || null;
  } catch (e) {
    return null;
  }
}

export function saveViewIndex(id) {
  try {
    if (id) sessionStorage.setItem(VIEW_STATE_KEY, id);
    else sessionStorage.removeItem(VIEW_STATE_KEY);
  } catch (e) {}
}

// Display label for any persona id this site can render, including the
// reserved "custom" identity — one place this mapping lives, so "custom"
// never leaks to a reader as the literal capitalized word "Custom" (which
// a bare `persona.charAt(0).toUpperCase()+...` call would otherwise
// produce at any of this site's several such call sites).
export function personaDisplayLabel(id) {
  if (!id) return "General";
  // Door v2: the reader identity's display label
  // is "you", never "Custom" and no longer "Your priorities" — which was
  // true while priorities were the only thing this identity could carry
  // and is false the moment it can also carry figures and a passport.
  if (id === "custom") return READER_DISPLAY_LABEL;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

// The reader identity's own two words, in one place so no surface invents
// a third. Sentence-initial capitalisation is each call site's, the same
// way it already is for a persona's first name.
export const READER_ID = "custom";
export const READER_DISPLAY_LABEL = "you";
export const READER_POSSESSIVE_LABEL = "your own";

// The possessive form for any identity this site can render — "Teo's",
// "your own", or nothing at all for the general view. Exists because the
// shipped call sites build a possessive by appending "'s" to a display
// name, which gives "you's".
export function personaPossessiveLabel(id) {
  if (!id) return "";
  if (id === READER_ID) return READER_POSSESSIVE_LABEL;
  return `${id.charAt(0).toUpperCase() + id.slice(1)}'s`;
}

// The 21.6 item 2 disclosure suffix — appended wherever a custom-weighted
// number renders (map tooltip, Lists column, location-page score readout),
// the same idiom as the existing "(general figures)" suffix elsewhere on
// this site. Wording finalized by the copy-voice pass,
// replacing the earlier placeholder shape: names the provenance (which
// answers produced it) rather than characterizing the estimate — a
// stranger seeing it next to a score knows exactly how much weight to
// give it. Same grammatical ride as "(general figures)". The load-bearing
// decision is still the placement, next to the number itself, at every
// call site.
// "from your seven answers" was true while the questionnaire required
// all seven; this build retired that gate, so a reader who answers one
// question gets a real weight vector and a suffix claiming seven answers
// they never gave. The replacement carries no count and is true of one
// answer or seven. SIX render sites, measured: js/map.js 668, 1143, 2183;
// js/lists.js 348, 720; js/location.js 342 — all six read this constant,
// so the fix reaches all six.
export const CUSTOM_ESTIMATE_SUFFIX = "from your priorities";

// Preserve the persona (and, when given, other params) across internal
// navigation — the brief's "shareable profile URLs" rule, MVP-scoped to a
// query-string persona id since there are no accounts/saved scenarios yet.
export function withPersona(path, extra = {}) {
  const params = new URLSearchParams();
  const persona = getPersona();
  if (persona) params.set("persona", persona);
  for (const [k, v] of Object.entries(extra)) {
    if (v != null) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

// v7 §7.1: the persona switcher's descriptor strings, verbatim from
// this project's own persona-profile source — age, income shape, what
// they want, one honest fear, per persona. Replaces the old three-
// persona "spec sheet" strings (config-line phrasing an outside review
// flagged) — these are the fix, for all eight locked personas at once,
// not just the three that had fixture data first. Markdown bold
// stripped for plain-text rendering only; wording is verbatim from
// source, not reworded here.
const PERSONA_LABELS = {
  waldo: "Waldo — A solo, location-independent worker living on about $2,500 a month with $120,000 saved toward a home — enough to clear most places outright, not enough for many of the popular ones. He wants a real, provable path to stay long-term, not just a good vacation. His fear: picking somewhere that looks affordable right up until the residency paperwork says otherwise.",
  wenda: "Wenda — A 68-year-old retiree living on a $1,900 monthly pension with $95,000 set aside to buy. She's learned the hard way that some places will take her money but not her income type, so what she's really after is somewhere that recognizes a pension as real, qualifying income. Her fear: a country that looks perfect until the paperwork asks where the money comes from.",
  carmen: "Carmen — A 29-year-old freelancer earning about $1,300 a month from client work, with $25,000 put by and no interest in buying — she rents wherever she lands. She's not chasing residency, just somewhere she can legally stay for months at a stretch without a lease turning into a five-year commitment she never asked for. Her fear: a visa door that looks open right up until she learns it never actually leads anywhere.",
  adira: "Adira — A 27-year-old remote worker getting by on around $1,490 a month with barely $27,000 to her name — thin margins, and she knows it. She's open to almost anything, a short stay or a real home, if a place actually earns it, but she's learned her passport sometimes changes the rules in ways nobody mentions upfront. Her fear: a place that would say yes to someone else's passport and no to hers, and finding out only after she's committed.",
  noa: "Noa — Late twenties, maybe thirty, leaving with a modest cushion — about $12,000 — and no job offer yet, just a willingness to start over pulling shifts at a bar or café until something better comes along. She wants what sounds small and isn't: an ordinary week, somewhere nothing is on fire, near people she already loves. Her dog comes too, non-negotiable — a country that would take her but lock him in a month-long quarantine is, to her, simply a country that said no.",
  marek: "Marek — One parent in a family of four — two kids, ages seven and eleven — with a household income around $5,800 a month and $300,000 to buy a real home outright. They didn't leave on a leisurely timeline, and they're not looking for adventure: no super-hot, no super-dangerous, just somewhere safety stops being a question mark. Their fear isn't the unknown in general anymore — it's landing somewhere that turns out to be one more uncertain place, with a hospital too far away if something goes wrong.",
  marguerite: "Marguerite — A 74-year-old widow living on a modest $1,500 pension with $55,000 set aside — not much, but enough if she chooses carefully, since this move likely only happens once. She wants to be warm, to have a small garden of her own, and healthcare she can actually trust with what's left of her life. Her fear isn't missing out on anything — it's choosing somewhere lovely on a good day that turns out to be a hard place to be old, sick, or alone.",
  teo: "Teo — A 34-year-old remote worker with comfortable, unstressed finances — about $3,600 a month, $90,000 in the bank — who's already solved working from anywhere and is now facing a quieter question: does he actually want to keep moving. Three months at a time is his real rhythm, not a placeholder until he can afford to settle, though part of him wonders about a place that's his to return to. His fear: every form and every visa officer treating \"how long are you staying\" as a question with only one right answer, one that keeps getting bigger the longer he keeps coming back.",
};

// One canonical name and definition for the site's central number, reused
// everywhere a reader meets it (map legend, Lists column, location page).
// The name itself ("Fit index") is already the literal text of the Lists
// column header and every tooltip/label below — this is the definition
// that travels with it.
// v6 plain-language pass, item 6: "a weighted 1-5 average of scored
// criteria" -> "a 1-5 score combining every researched factor" — same
// meaning, shorter, drops "weighted"/"average"/"criteria" as load-bearing
// vocabulary a first-time reader has to parse.
// v7 §3.2 (law 4, index demotion): one new clause added, "It's a sort
// key, not a verdict on its own" — the ruling's own instruction was a
// wording ADDITION to this existing canonical string, not a full
// rewrite; the base sentence is unchanged verbatim.
export const FIT_INDEX_DEFINITION =
  "Fit index: a 1–5 score combining every researched factor. Higher is better — 5 is the strongest fit, 1 is the weakest. It's a sort key, not a verdict on its own.";

// The no-lens disclosure for the Fit index: the index renders before the
// reader has filled the box, and the line says whose weighting they are
// looking at while it is not yet theirs. A perspective-disclosure case —
// the no-lens state naming itself, not a placeholder and not an apology
// for the number.
//
// Render home: the location page's no-lens branch, and its prerendered
// no-JS twin in tools/prerender-locations.mjs, which duplicates the
// string for the same Node-vs-browser reason as buildFitHeadline(). Both
// emitters have to agree or the same page says two different things
// depending on whether JS ran. Lists and the map already carry their own
// sibling sentence for this state and are untouched.
//
// TWO strings, not one, because the no-lens state has two populations and
// only one sentence is true of each. A reader can fill the box and then
// switch the corner lens back to "nobody" — cornerLensValue() resolves to
// nobody whenever no persona is active, regardless of what is saved — and
// in that state the page still shows generalIndex(), the site's own
// weighting. Telling that reader "you haven't told it what matters most to
// you" would be a false statement about them, which is the exact failure
// the perspective-disclosure law exists to prevent. The static prerender
// can only ever emit the first: it has no localStorage to read, and any
// reader who has saved priorities is by definition running JS, so
// location.js replaces the static line before they see it.
export const FIT_INDEX_DEFAULT_WEIGHTING_LINE =
  "This is the site's default weighting — you haven't told it what matters most to you, so nothing here is reweighted for you yet.";
export const FIT_INDEX_DEFAULT_WEIGHTING_LINE_SAVED =
  "This is the site's default weighting, not your own — the priorities you gave reweight this number only while your own view is switched on.";

// v8 Part 5: the scale-anchor disclosure — one canonical string, cited (not
// restated) from this project's own internal scale-semantics ruling: a 5
// is the world benchmark, not perfection and not merely "best of this
// dataset."
// Reused verbatim in three render homes (map legend, Lists caption,
// location page score-breakdown chapter) so a reachable top changes how
// every 4 and 5 on the site reads, the same way FIT_INDEX_DEFINITION
// travels everywhere the Fit index itself appears.
export const SCALE_ANCHOR_STRING =
  "A 5 isn't perfection — it means as good as this realistically gets anywhere in the world, tradeoffs included.";

// v9 Part 6.2/7.1: the verdict-coverage engine's own `overall_state`
// (derived/verdicts.jsonl, strictly finer-grained than `overall_band` —
// UNCERTAIN_TYPE and QUALIFIES_CONDITIONAL both paint CONDITIONAL_COLOR
// via colors.js's bandVisual() but mean different things in words). Text
// always carries the finer read; color only the coarser one (v8 Part 1's
// own "color answers roughly what kind, text answers exactly what"
// doctrine, cited not restated). Committed UI copy, same class as
// BAND_LABEL/WEIGHT_CLASS_LABEL below.
//
// SEVEN cases, not six. This comment once read "a closed 6-value enum"
// and was wrong: the enum has six NAMED values, but the field
// itself has a seventh legal value — `null` — which no key in this object
// can hold. The verdict engine emits no state on a location-scope row
// whose band was capped: when a LOCATION gate
// (cost, property, and in principle safety/education) caps that location's
// band away from its country's band, the national state stops describing
// the location, so the engine emits none rather than a state it no longer
// earns. That is deliberate fail-closed behaviour and is not a defect.
// What WAS a defect, live for some time and found by a human reading the
// site: every consumer looked the value up as
// `STATE_HEADLINE[state] || state`, so the `|| state` fallback surfaced the
// raw null — an empty verdict sentence in the Lists table, the literal
// string "null" on the map card. It was measured live on real rows across
// several personas and both bands; the counts that used to be written out
// here are not restated, because every one of them moves on every
// re-export (re-measured, they had already moved, in both the shipped
// export and the source one). What does NOT move is that the case is
// real, non-empty, and reachable — which is the whole reason the fallback
// below exists. Any re-measurement belongs in the export's own tooling,
// not in this comment.
// The seventh case therefore lives in STATE_HEADLINE_LOCATION_CAPPED below
// and is reached through stateHeadline(), never by a bracket lookup — a
// null key would only work by JS coercing it to the string "null", which is
// exactly the kind of cleverness a later reader breaks by accident.
// The one clause the three partial-read states below share. Declared BEFORE
// STATE_HEADLINE because they concatenate it at module-evaluation time —
// one constant, three sentences, so a later edit cannot fix two of them
// and leave the third saying something else.
//
// The argument for why it is true in every mix, kept here because the
// sentence is load-bearing and the reasoning is not obvious from the
// words: a `data_gap` route IS by definition one the site could not read
// against the reader's figures, so "some routes here couldn't be read"
// names exactly the routes the composer excluded from the claim. It puts
// the gap in the verdict voice with no count and no diagnosis of WHICH
// route or why — that is the per-route reading, computed and not yet
// rendered (B8).
//
// It opens with a space: it is appended to a finished sentence, never
// rendered alone.
const READER_PARTIAL_READ_CLAUSE =
  " Some routes here couldn't be read against your figures at all, so this is a no on what was read — not on everything.";

export const STATE_HEADLINE = {
  QUALIFIES_AND_CONVERTS: "Clears — and this route leads to permanent residency (PR).",
  QUALIFIES_CONDITIONAL: "Clears, with conditions attached.",
  UNCERTAIN_TYPE: "Possible — but whether this profile's income type qualifies for this route isn't confirmed yet.",
  // Kind-neutral, same reason as the legend label: this state fires on
  // capital bars too, so the sentence names the bar and not its kind.
  FAILS_AMOUNT: "Doesn't clear the bar this route sets.",
  DEAD_END_BLOCKING: "Confirmed dead end — this route doesn't lead where this profile needs it to.",
  GAP_INSUFFICIENT_DATA: "Not enough documented yet for a real read.",
  // ---------------------------------------------------------------------
  // Door v2: the six states above were built for a COMPOSED
  // verdict — every gate read, one answer. The reader's own rows are a
  // partial read (income bars on residence routes, and nothing else yet),
  // and none of the six has a sentence for that. So the reader's rows
  // carry their own state tokens rather than borrowing one: a distinct key
  // space means no consumer can render a persona's sentence over a
  // reader's row, and every consumer's existing `stateHeadline(state)`
  // lookup keeps working with no new branch.
  //
  // The texts are the specified ones, verbatim. Their
  // band mapping is STATE_HEADLINE_BAND below, which they are also
  // registered in, so the legend and the banding cannot disagree.
  // "— on income" DELETED. bandFor() returns "above" on the capital
  // compare path exactly as it returns "below", so a reader whose CAPITAL
  // cleared an asset threshold was told they cleared on income when their
  // income was never read. The mirror of the below-bar defect, live on the
  // same route, and it survived every gate because it flatters rather than
  // closing a door. A deletion, not a rewording: the sentence is true of
  // either bar kind without those three words.
  READER_ABOVE_BAR: "Above the bar this route sets. The other gates weren't read for you.",
  // AUTHORED JOIN, flagged rather than smuggled: §6.3 specifies "v1's own
  // chip text, verbatim: 'Right at the line' + the v1 band sentence's
  // first clause" and does not write the joined sentence. Both halves are
  // transported word for word; only the ". " between them is mine.
  READER_AT_LINE: "Right at the line. Where you're within about a tenth of a bar either way, the site says \u201cright at the line\u201d rather than yes or no — these figures are dated snapshots, and a rule can move by more than that.",
  READER_ABOVE_CONDITIONAL: "Above the bar — but only with conditions this route sets in its own words.",
  // The kind-aware variants live in READER_BELOW_VARIANTS below; this
  // entry is the all-income reading, kept verbatim because it is true and
  // because it is the parallel the capital row mirrors. A consumer that
  // calls stateHeadline() without the row's bar-kind summary still gets a
  // sentence — this one — which is why the variant is a refinement and not
  // a dependency.
  READER_BELOW_BAR: "Below the bar every route here sets — on income.",
  READER_WRONG_TYPE: "Not this kind of income — none of the routes here take it as the qualifying kind.",
  // A specified string, corrected against the rule it is written under.
  // The sentence it replaces ("Not enough recorded to read this
  // against your figures.") is false on one of the causes it covers: a
  // route whose bar is recorded perfectly well, in a currency the reader
  // did not enter, which this site declines to convert on principle. The
  // standing test — "a refusal that misdiagnoses its own cause is a false
  // statement, not a soft one" — applies to it.
  //
  // This is the SPECIFIED INTERIM, chosen by the one condition set on it: the
  // cause-true variants need the deciding route's reason carried up to the
  // country headline, and carrying it is logic, which this dispatch does
  // not write. The interim is cause-NEUTRAL instead — it diagnoses
  // nothing, so it misdiagnoses nothing. MEASURED on the shipped data
  // (8x4x2x5 grid x five read countries, 1,600 country reads): 1,232 of
  // them land here, and the currency wall is reachable in every one of the
  // four currencies the box offers.
  READER_NOT_ENOUGH: "The site couldn't read this against your figures — not enough recorded, or recorded in another currency.",
  // A SEVENTH READER STATE, NOT IN THE SPEC — added because the spec's
  // two hard_fail sentences both say "every", and MEASURED AGAINST THE
  // LIVE DATA neither is always true. Probe over a 280-read
  // grid of amounts x currencies x periods x income types: 28 country
  // reads land with one route refusing the reader's KIND of income and
  // another setting a bar above their FIGURE. "Below the bar every route
  // here sets" is false on those 28, and so is "none of the routes here
  // take it as the qualifying kind". Rather than ship a false sentence on
  // a reachable state, or silently widen one of the specified ones, this
  // case gets its own.
  //
  // AUTHORED-CHOICE, flagged for a register and voice pass.
  // Its first clause is NOT new: "No residency route clears" is this
  // site's own shipped, already-gated label (NO_RESIDENCY_ROUTE_CLEARS_LABEL
  // below). Only the second clause, which names both causes so the reader
  // knows which applies to which route, is mine.
  // "on income" DELETED FROM THE LEAD. Reached when a country refuses one
  // route on the reader's income KIND and another on their FIGURE — and
  // that second refusal can be a capital bar, in which case nothing about
  // the composition was "on income". The carrier was the lead, not the
  // clause it points at: the second clause names both causes and is
  // kind-neutral, so it survives untouched and nothing is lost.
  READER_NONE_CLEARS: "No residency route clears here — some of these routes set a bar above your figure, and some don't take this kind of income.",

  // ------------------------------------------------------------------
  // THREE MORE, and the every-route defect they fix. The states above
  // that say
  // "every"/"none"/"no route" were composed from the REFUSALS ONLY: the
  // filter that built them dropped every unread route before the claim
  // was tested, so a country where one route refused and two could not be
  // read printed a sentence about all three. Measured on the shipped
  // data over the same 360-input grid (9 amounts x 4
  // currencies x 2 periods x 5 income types) read against the five read
  // countries = 1,800 country reads: 251 of them shipped a false
  // sentence (89 "below the bar every route", 162 "none of the routes
  // here take it"), on all five countries. A second grid measured 263
  // on the same shape — the amount ladder differs, the income-type count
  // is identical at 162 because that refusal never depends on the amount.
  //
  // The fix is not a wider sentence, it is a distinct state: a claim
  // about every route may only be made where every route was read. These
  // three carry the same three refusal shapes WITH at least one route
  // that could not be read at all, so the sentence can say so.
  //
  // Each is a first sentence (the claim about what WAS read) plus one
  // shared second clause, READER_PARTIAL_READ_CLAUSE below — one constant
  // for the clause so the three cannot drift apart.
  //
  // TWO THINGS OF THIS BUILD'S OWN THAT THE FINAL STRINGS DELIBERATELY DO
  // NOT RESTORE, and both are corrections, not preferences:
  //   - "at least one other route" was a count beside a boundary, which
  //     the no-count rule forbids flatly. The final wording says "some".
  //   - "isn't recorded well enough to read" named ONE cause out of five
  //     (absent field, silent source, non-single figure, another
  //     currency, a bar that isn't income). The final wording says
  //     "couldn't be read against your figures", true of all five.
  //
  // Surface: the reader's own verdict, wherever a reader state renders a
  // sentence — the location page's verdict chip (js/location.js, reader
  // branch), the map pin tooltip, the Lists row. State: the reader gave
  // long-stay figures; this country is in the read set; every route that
  // COULD be read refuses; at least one route could not be read at all.
  // THE SENTENCE THE DEFECT WAS FOUND ON. Kept as the all-income reading;
  // the capital and mixed readings are in READER_BELOW_VARIANTS below.
  READER_BELOW_SOME_UNREAD:
    "Below the income bar on every route here the site could read." + READER_PARTIAL_READ_CLAUSE,
  READER_WRONG_TYPE_SOME_UNREAD:
    "Not this kind of income — no route here the site could read takes it as the qualifying kind." + READER_PARTIAL_READ_CLAUSE,
  // "on income" DELETED from this lead too, same reason as READER_NONE_CLEARS.
  READER_NONE_CLEARS_SOME_UNREAD:
    "No residency route the site could read here clears — some set a bar above your figure, and some don't take this kind of income." + READER_PARTIAL_READ_CLAUSE,
  // ---------------------------------------------------------------------
  // THE ENGINE'S FOUR NEW STATES. Not reader states and not a fifth
  // vocabulary: these are engine tokens that the composition fix and the
  // currency read emit, and they land here for one reason — nothing may
  // render a raw token. `stateHeadline()` falls back to the
  // token itself, so a state with no entry here ships its own key to a
  // reader's screen. All four are registered in STATE_HEADLINE_BAND
  // below as well, or the legend and the banding would disagree.
  //
  // Committed UI copy, landed verbatim and not reworded here.
  // ---------------------------------------------------------------------
  PARTIAL_READ_NO_CLEAR: "No route the site could read here clears. Some routes here couldn't be read at all \u2014 so this is a no on what was read, not on everything.",
  UNCERTAIN_BAR_BASIS: "Not decided either way. The bar this answer rests on is set after tax; the figure read against it is before tax. Those are two different measurements, so the site won't call it a yes or a no.",
  NEAR_LINE_AMOUNT: "Right at the line. The figure sits within about a tenth of the bar, above or below. A move that small in either number would change the answer.",
  UNCERTAIN_FX_UNAVAILABLE: "Not decided either way. This comparison crosses currencies, and the site couldn't get an exchange rate it trusts. It won't guess one.",

};

// The seventh case (see the long note on STATE_HEADLINE above): the state
// the engine deliberately does NOT name, because a location gate capped
// this location's band away from its country's band and the national state
// no longer describes it. ONE sentence serves both bands on purpose: the
// band color already carries the direction, so this text names only WHAT
// HAPPENED and never a direction the color could contradict (the same
// "color answers roughly what kind, text answers exactly what" doctrine
// cited above). "Narrowed" is not new vocabulary — it is the verb this
// site already ships for this exact event, in the deciding-gate marker
// ("This is what narrowed it:") and its resting twin ("Nothing here
// narrowed the national result — this location's own gates line up with
// the country-level answer"), both rendered by renderGateProvenance()
// further down this file. Directionally safe by construction:
// band composition is downward-only, so a capped band is always worse
// than the national one, never better.
export const STATE_HEADLINE_LOCATION_CAPPED =
  "The country-level answer doesn't describe this place — this location's own gates narrowed it.";

// The one lookup every consumer uses. Kept as a function rather than a
// seventh object key because the seventh case's key is `null`, and the
// only way an object literal can hold it is by string coercion.
// Unknown non-null states still fall through to the raw value on purpose
// (fail-visible: a new engine state should look wrong on screen, not
// silently borrow another state's sentence).
// THE TWO BELOW-SENTENCES, BY THE KIND OF BAR THE READER WAS MEASURED
// AGAINST. One existing token, three readings — no fourth state, no new
// band, no new legend row.
//
//   income   the shipped sentence, verbatim. It was always true here.
//   capital  names the instrument where one instrument can be named
//            ("that bar is an asset requirement"), and falls back to the
//            kind where it cannot. The singular "that bar" is safe by
//            construction: the barPhrase values are pairwise distinct, so
//            two capital routes read and below necessarily carry
//            different phrases and `phrase` arrives null.
//   mixed    names NEITHER instrument, deliberately. Naming one while the
//            other bars measure something else would tell the reader
//            which phrase belongs to which route, which a single sentence
//            about several routes cannot know. It follows the house
//            pattern READER_NONE_CLEARS already sets for a two-cause
//            refusal.
//
// "capital" is the READER'S OWN WORD, not the schema's `kind` and not
// "assets": the box asks for this figure as "I also have capital I could
// put into property" / "How much capital?", so the sentence hands back
// the word they were asked for.
const READER_BELOW_VARIANTS = {
  READER_BELOW_BAR: {
    capitalWithPhrase: (phrase) =>
      `Below the bar every route here sets — that bar is ${phrase}, not an income one.`,
    capital: "Below the bar every route here sets — on capital, not income.",
    mixed: "Below the bar every route here sets — some of those bars measure income, some measure capital.",
  },
  READER_BELOW_SOME_UNREAD: {
    capitalWithPhrase: (phrase) =>
      `Below the bar on every route here the site could read — that bar is ${phrase}, not an income one.` + READER_PARTIAL_READ_CLAUSE,
    capital: "Below the bar on every route here the site could read — on capital, not income." + READER_PARTIAL_READ_CLAUSE,
    mixed: "Below the bar on every route here the site could read — some of those bars measure income, some measure capital." + READER_PARTIAL_READ_CLAUSE,
  },
};

// The short twin, same three readings. It renders as a pin's accessible
// name, so leaving it kind-blind would ship the false claim to a screen
// reader while the visible sentence told the truth. No figure, no count,
// no instrument — this table's own rule.
const READER_BELOW_SHORT_VARIANTS = {
  READER_BELOW_BAR: {
    capital: "below the bar, on capital not income",
    mixed: "below the bar, on income and on capital",
  },
};

// The one lookup every consumer uses. Kept as a function rather than a
// seventh object key because the seventh case's key is `null`, and the
// only way an object literal can hold it is by string coercion.
// Unknown non-null states still fall through to the raw value on purpose
// (fail-visible: a new engine state should look wrong on screen, not
// silently borrow another state's sentence).
//
// `barKind` is the reader row's own `reader_bar_kind` summary and is
// OPTIONAL: every existing `stateHeadline(state)` call keeps working
// unchanged and keeps getting the all-income reading, which is the
// sentence that shipped. Only a caller holding a reader row can select a
// variant, and only a reader row can carry one.
export function stateHeadline(state, barKind) {
  if (state === null || state === undefined) return STATE_HEADLINE_LOCATION_CAPPED;
  const variants = barKind && READER_BELOW_VARIANTS[state];
  if (variants && barKind.kind === "mixed") return variants.mixed;
  if (variants && barKind.kind === "capital") {
    return barKind.phrase ? variants.capitalWithPhrase(barKind.phrase) : variants.capital;
  }
  return STATE_HEADLINE[state] || state;
}

// Same contract for the compact form: optional second argument, identical
// fallback, so a caller without the summary gets exactly what it got before.
export function readerStateShort(state, barKind) {
  const variants = barKind && READER_BELOW_SHORT_VARIANTS[state];
  if (variants && (barKind.kind === "capital" || barKind.kind === "mixed")) {
    return variants[barKind.kind];
  }
  return READER_STATE_SHORT[state];
}

// Which of the four `overall_band` values each `overall_state` belongs to —
// verified by a direct cross-tab of the real derived/verdicts.jsonl (every
// state maps to exactly one band, confirmed, not assumed from the enum
// names alone). Used only by the map legend, to group STATE_CHIP_LABEL's
// labels under their band colors.
//
// The seventh case is DELIBERATELY ABSENT from this map and must stay
// absent: it is the one state that does not belong to exactly one band.
// Giving it an entry here would hand it a single legend color and tell
// some of those readers the wrong direction. Whether the legend needs a
// row for it at all — and what a two-color meaning would even look like —
// is a design call, not a mechanical one. Named, not invented.
//
// THE COUNTS THIS NOTE USED TO CARRY WERE STALE, AND NO CURRENT PAIR IS
// WRITTEN IN THEIR PLACE. What was removed, quoted so a reader meeting an
// older copy of this file can recognise it as dead and not as evidence: a
// "304-row" file and "13 of its 24 rows hard_fail, 11
// uncertain_or_conditional". Re-measured, every one of those figures had
// already moved — and moved by different amounts in the shipped export
// and in the source one, which is the argument against a
// hardcoded pair rather than an aside to it. What does NOT move is that
// the split is non-empty on both sides, and that — not any particular
// ratio — is the whole reason this state has no entry here. Any
// re-measurement belongs in the export's own tooling, not in this comment.
export const STATE_HEADLINE_BAND = {
  QUALIFIES_AND_CONVERTS: "clean",
  QUALIFIES_CONDITIONAL: "uncertain_or_conditional",
  UNCERTAIN_TYPE: "uncertain_or_conditional",
  FAILS_AMOUNT: "hard_fail",
  DEAD_END_BLOCKING: "hard_fail",
  GAP_INSUFFICIENT_DATA: "data_gap",
  // Door v2: the reader's six states, each in exactly one
  // band, same as every engine state above. Registered here so the map
  // legend, the Lists banding and the location chip all read one table.
  READER_ABOVE_BAR: "clean",
  READER_AT_LINE: "uncertain_or_conditional",
  READER_ABOVE_CONDITIONAL: "uncertain_or_conditional",
  READER_BELOW_BAR: "hard_fail",
  READER_WRONG_TYPE: "hard_fail",
  READER_NOT_ENOUGH: "data_gap",
  READER_NONE_CLEARS: "hard_fail",
  // The three partial-read states, banded uncertain_or_conditional so
  // that the pin and Lists agree.
  //
  // SUPERSEDED, kept so the change is legible: this build banded them
  // hard_fail and argued it — "the reader's hard_fail has never meant
  // 'this country is closed to you'; the band answers roughly what kind
  // and the sentence carries the exact scope". The counter-argument is
  // one this build logged against itself, and it was reached from the
  // other end while wording the sentences too: a hard_fail colour leans
  // more certain than a sentence that says some routes were never read.
  // The softer band wins.
  //
  // js/reader-lens.js's STATE_BAND holds the same three entries and is
  // changed with this one — one meaning, two tables, never allowed to
  // drift.
  READER_BELOW_SOME_UNREAD: "uncertain_or_conditional",
  READER_WRONG_TYPE_SOME_UNREAD: "uncertain_or_conditional",
  READER_NONE_CLEARS_SOME_UNREAD: "uncertain_or_conditional",
  // The engine's four new states, all uncertain_or_conditional per the
  // engine's own family sets. Registered here as well as in
  // STATE_HEADLINE, so the pin colour, the Lists banding and the chip
  // read one table and cannot disagree.
  //
  // PARTIAL_READ_NO_CLEAR is the one worth arguing rather than asserting:
  // it is a "no" on every route that could be read, and it still bands
  // uncertain rather than hard_fail, because routes behind it were never
  // read at all. A hard_fail colour over a sentence that says "not on
  // everything" leans more certain than the sentence under it, which is
  // the exact reason the three partial-read states above were re-banded.
  PARTIAL_READ_NO_CLEAR: "uncertain_or_conditional",
  UNCERTAIN_BAR_BASIS: "uncertain_or_conditional",
  NEAR_LINE_AMOUNT: "uncertain_or_conditional",
  UNCERTAIN_FX_UNAVAILABLE: "uncertain_or_conditional",

};

// The ten short forms that put the band in the pin's own accessible
// name. The constraint is "band in the aria-label", and it is met on the
// LABEL rather than on an
// aria-describedby, because the hit-area is role="link"/role="button" and
// its label is what a screen reader announces on focus.
//
// WHY IT MATTERS MORE THAN IT LOOKS. Measured from the chair, hovering
// answers on 2 of 12 marked pins: the other 10 sit in cluster knots, which give
// no tooltip at all, and the sentence is 2 to 7 zoom clicks away
// (Barcelona 2, Porto 3, Lisbon 4, Chania 5, Antigua and Atitlán 7). For
// a screen-reader reader the knot's own label is the ONLY path to the
// band, so every member's short form goes in it.
//
// It lives here, beside STATE_HEADLINE, and is asserted against
// STATE_HEADLINE's own reader keys below — the same key set, so a state
// without a short string is a build error, not a silent omission. No
// number, no count, no "one of three": a short form compresses the headline's direction and never
// re-states a figure.
export const READER_STATE_SHORT = {
  READER_ABOVE_BAR: "above the bar",
  READER_ABOVE_CONDITIONAL: "above the bar, with conditions",
  READER_AT_LINE: "right at the line",
  READER_BELOW_BAR: "below the income bar",
  READER_WRONG_TYPE: "not this kind of income",
  READER_NONE_CLEARS: "no route clears",
  READER_NOT_ENOUGH: "couldn't be read against your figures",
  READER_BELOW_SOME_UNREAD: "below the bar on the routes that could be read, some unread",
  READER_WRONG_TYPE_SOME_UNREAD: "not this kind of income on the routes that could be read, some unread",
  READER_NONE_CLEARS_SOME_UNREAD: "no readable route clears, some unread",
};

// The build error is a real throw rather than a warning: a missing short form would ship a pin whose accessible name
// silently drops the band, which is the exact constraint this table
// exists to satisfy, and a silent miss is indistinguishable from the
// tooltip defect this table exists to route around. Both directions are
// checked — a missing key and a key
// for a state that no longer exists — because a stale entry is how a
// table starts describing a vocabulary the site has moved off.
{
  const headlineReaderKeys = Object.keys(STATE_HEADLINE).filter((k) => k.startsWith("READER_"));
  const shortKeys = Object.keys(READER_STATE_SHORT);
  const missing = headlineReaderKeys.filter((k) => !(k in READER_STATE_SHORT));
  const unknown = shortKeys.filter((k) => !(k in STATE_HEADLINE));
  if (missing.length || unknown.length) {
    throw new Error(
      "READER_STATE_SHORT is out of step with STATE_HEADLINE — missing: "
      + (missing.join(", ") || "none") + "; unknown: " + (unknown.join(", ") || "none")
    );
  }
}

// The solo form and the per-member form for a location the box never
// read. One constant each, because the solo label and the
// knot label have to say the same thing about the same absence.
export const READER_LABEL_UNREAD = "Not read against your figures.";
export const READER_LABEL_UNREAD_MEMBER = "not read against your figures";
// The solo label's lead-in: "{place}, {country}. Your own read: {short}."
//
// "income" DELETED, and this label is only ever MET SPOKEN — it is an
// aria-label, assembled by soloAriaLabel() in js/map.js. Once the short
// form became bar-kind aware, a screen reader began saying, in one
// breath: "Antigua, Guatemala. Your own income read: below the bar, on
// capital not income." The label cancelled its own value inside a single
// sentence, and a listener with no way to re-read it would reasonably
// conclude the site was confused about its own answer.
//
// "Your own" STAYS — it is the perspective-disclosure marker, naming
// whose lens this reading is.
//
// THE BETTER-PAIRED WORDING WAS DELIBERATELY NOT TAKEN, recorded so it
// is not "improved" back in: "Read against your figures:" would mirror
// READER_LABEL_UNREAD above exactly. But "read" is a heteronym, and
// sentence-initially — straight after the full stop that ends the place
// name — a synthesiser's likely guess is the imperative, which turns a
// verdict into an instruction. The shipped negative is safe only because
// its leading "Not" forces the participle.
export const READER_LABEL_READ_PREFIX = "Your own read:";

// v9 Part 8: the mandatory rule-derived-verdict disclosure. Two load-
// bearing content requirements, both from this project's own residency-
// rules research: (1) a plain explanation of what "rule-derived" means
// (computed, checked against a stated profile — not legal advice, not a
// guarantee); (2) the nationality caveat, present on every verdict render,
// never silent — sourcing skews toward common/unrestricted passports, so
// silence on a nationality rule means undocumented, not confirmed open.
// Shipped as committed spec copy per this project's own precedent — one
// canonical sentence, many future render homes, cited not restated, same
// idiom as FIT_INDEX_DEFINITION/SCALE_ANCHOR_STRING above.
// Door v2: the persona sentence reads "checked against
// {Name}'s stated profile", which for the reader is both bad grammar and
// an overclaim — the reader gave figures, not a profile, and what was
// read against them is a table of route bars. Measured rather than
// recalled, because the figure this comment used to carry was wrong twice:
// the table holds TWENTY ENTRIES ACROSS FIVE COUNTRIES, of which 14 set an
// income bar, 4 set a capital bar and 2 state no single figure at all — so
// "twenty income bars" conflated the entry count with the income count,
// and "and nothing else" was the same over-claim the string below is being
// corrected for. A stale number left beside a corrected sentence makes the
// file argue with itself.
//
// Sentences three to five are the shipped sentence's own, verbatim.
// THE FIRST TWO NOW NARROW AND WIDEN AT ONCE, and the test this comment
// sets is met on the axis that matters: the ROUTE axis narrows twice (the
// universal "the" goes, and a comparability condition is added), so
// strictly less is promised as read. The KIND axis widens — capital bars
// are named where they were not — but that is a correction of an
// undercount, not a new promise: capital bars were already being read, and
// one of them produced the defect this crossing repaired.
export const READER_VERDICT_DISCLOSURE =
  "This read is computed from this site's documented visa and residency rules, checked against the figures you entered on this device — the income and capital bars on residence routes in five countries, where a route states one this site can compare. Nothing else yet. Not a lawyer's opinion, and not a guarantee. Sourcing across this site skews toward information written for common, unrestricted passports: where a nationality rule isn't mentioned, that means undocumented, not confirmed open. Always check your own passport's specific rule before relying on this.";

// RULED COPY, quoted verbatim and not this build's to reword: where a
// route's per-person basis isn't on file, the reader's verdict declares
// the assumption rather than refusing on it. The engine refuses on this
// input for a persona (zero dependent_adjustment facts for GT); the box
// has no dependents field that could refuse, so it says what it did
// instead.
//
// It renders beside the reader's verdict disclosure on the location page,
// which is the one surface the reader's verdict already speaks a full
// sentence on. The condition that fires it is readerBasisIsAssumed() in
// js/reader-lens.js. One character is this build's: the sentence was
// given mid-sentence ("treated as per person") and renders here as a
// standalone line, so the t is capital.
export const READER_BASIS_DECLARED_LINE =
  "Treated as per person — this route's basis isn't on file.";

export function verdictDisclosureSentence(displayName) {
  return `This read is computed from this project's own documented visa and residency rules, checked against ${displayName}'s stated profile — not a lawyer's opinion, and not a guarantee. Sourcing across this site skews toward information written for common, unrestricted passports: where a nationality rule isn't mentioned here, that means undocumented, not confirmed open. Always check your own passport's specific rule before relying on this.`;
}

// v7 Part 10: the perspective door needs the switcher's own descriptor
// string split into its two rendering halves — a first name (shown at
// larger weight on each tile) and the descriptor sentence itself (shown
// verbatim underneath) — where the switcher's own <option> needs the
// whole "Name — sentence" string unchanged. One mechanical split
// function, not a second hand-copied string: strips only the FIRST
// " — " (several descriptors carry a second one mid-sentence, e.g.
// Noa's own two extra em dashes, so a naive single split() would
// truncate her sentence). Zero new authorship — same source string,
// same order, per Part 11.
export function personaDescriptorSentence(id) {
  const full = PERSONA_LABELS[id] || "";
  const idx = full.indexOf(" — ");
  return idx === -1 ? full : full.slice(idx + 3);
}

// Shared "is this a keyboard activation" check for click-equivalent
// keydown handlers (map pins, source-toggle badges) — one definition of
// what counts as an activation key, reused instead of re-branched per call
// site.
export function isActivationKey(e) {
  return e.key === "Enter" || e.key === " ";
}

// Tooltip voice (v2 addendum §4.1): a fixed four-tier word
// mapping off the Fit index value, extending the same endpoints
// FIT_INDEX_DEFINITION already states ("1 poor fit, 5 strong fit") into
// intermediate bands — a wording rule, same shape as the change-event
// severity labels, not a new claim about any specific place. Boundaries are
// lower-bound inclusive (2.0 itself reads as "a stretch", not "a tough
// fit") — a mechanical tie-break, not a judgment call per location.
export function fitBandWord(value) {
  if (value == null || Number.isNaN(value)) return "not yet scored";
  if (value < 2) return "a tough fit";
  if (value < 3) return "a stretch";
  if (value < 4) return "promising";
  return "a strong fit";
}

// Tooltip voice (v2 addendum §4): the "strength / catch" headline — moved
// here from map.js (v7 §2.2) so location.js's no-persona verdict block can
// reuse the exact same string a reader may have already seen on this
// location's map pin, instead of re-deriving a fresh headline (zero new
// authorship — pure transport of an already-computed value into a second
// render location). map.js imports this instead of defining it locally;
// no behavior change there.
export function buildFitHeadline(store, personaId, loc, country, value) {
  const tb = topBottomCriteria(store, personaId, loc.location_id);
  const band = fitBandWord(value);
  return tb && tb.top.criterion_id !== tb.bottom.criterion_id
    ? `${loc.display_name}, ${country.name} — ${band}; ${tb.top.name} is a strength, ${tb.bottom.name} is the catch.`
    : `${loc.display_name}, ${country.name} — ${band}.`;
}

// ---------------------------------------------------------------------
// Theme (v4 addendum R2): light default, unconditional, for every visitor
// regardless of OS — a stored, explicit toggle is the only way to reach
// dark. Replaces the old bare `prefers-color-scheme` auto-flip (colors.js's
// former prefersDark(), now isDarkTheme(), reads this same attribute
// instead of matchMedia). No third "auto" state — ruled out, see the
// addendum's own reasoning (R2, "Auto (follow-OS)").
// ---------------------------------------------------------------------
const THEME_KEY = "theme";

// Must run before renderTopBar() on every page (the addendum's own
// sequencing rule), so a returning dark-mode visitor's toggle state is set
// before the top bar (and its button's aria-pressed) render.
export function applyStoredTheme() {
  if (localStorage.getItem(THEME_KEY) === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  }
  // Anything else (absent, "light") => default light, no attribute — the
  // whole point of this ruling: no OS read, ever, as a default.
}

function toggleTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  if (dark) {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem(THEME_KEY, "light");
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem(THEME_KEY, "dark");
  }
  // Fix (a live-site audit finding): the v4 addendum
  // originally excluded this on purpose (comment retired below, moved to
  // colors.js's own repaintRampSwatches() header) — CSS-variable-driven
  // chrome updates instantly, but already-rendered inline SVG pin fills /
  // fit-swatches were left stuck at whatever hex got baked in at their
  // one render-time call, silently defeating the colorblind-safe ramp
  // (Part 30, built from a real colorblind reader's own feedback) on its
  // single most ordinary interaction. Now genuinely repainted here, not
  // deferred to the next reload: every marked swatch re-reads its own
  // stored raw value against the theme just flipped above.
  repaintRampSwatches();
}

// ---------------------------------------------------------------------
// Header (v4 addendum R4): split into a top bar (brand/nav/theme toggle,
// unchanged position — first thing on the page) and a persona block
// (moved below each page's own H1/orientation, and replaced by the
// perspective line — see js/reader-lens.js). Replaces the old single
// renderHeader(), which
// put the persona ask before the page said what it even does.
// ---------------------------------------------------------------------
// A plain, abstract "adjustable/build" glyph — a dial, not a photo and not
// a silhouette. Moved here from perspective-door.js (which now imports it)
// when the corner control needed the door's own icon: two hand-copied
// copies of one glyph is how the door and the control start drawing
// different pictures of the same thing. Inline SVG, no new asset, colours
// inherit through currentColor.
export const CUSTOM_TILE_ICON = `
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <line x1="12" y1="12" x2="12" y2="6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <line x1="12" y1="12" x2="16" y2="14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="12" cy="12" r="1.4" fill="currentColor"/>
  </svg>
`;
// The same glyph at topbar scale.
const CORNER_LENS_ICON = CUSTOM_TILE_ICON.replace('width="28" height="28"', 'width="18" height="18"');

// The control that reopens the full box. Not an inline
// editor and not a summary of the reader's data — a door handle.
//
// Its LABEL is a lens disclosure, which the perspective-disclosure law
// requires of a control whose text is a promise about what it changes:
// it names whose eyes the page is currently showing, in the site's own
// idiom ("tell the site who's asking"), so it introduces no noun a
// stranger has not already met on the door.
//
// A real <a href> to index.html?reopen=1, always — so it works with no
// JS, with a middle-click, and from the prerendered static bar. The map
// page intercepts the click and summons the box in place instead (delta
// §8.2); every other page navigates, which is the same thing one load
// later, because the door is index.html-only by construction.
export const REOPEN_FLAG = "reopen";
const CORNER_LENS_PREFIX = "Who's asking:";
const CORNER_LENS_NOBODY = "nobody yet";
const CORNER_LENS_ARIA_SUFFIX = "— opens the box to change it";

export function cornerLensValue() {
  const persona = getActivePersona();
  if (!persona) return CORNER_LENS_NOBODY;
  return personaDisplayLabel(persona);
}

function cornerLensControlHtml() {
  const value = cornerLensValue();
  const full = `${CORNER_LENS_PREFIX} ${value}`;
  return `
    <a class="corner-lens" id="corner-lens" href="${siteUrl("index.html")}?${REOPEN_FLAG}=1"
       aria-label="${escapeHtml(`${full} ${CORNER_LENS_ARIA_SUFFIX}`)}">
      <span class="corner-lens-icon" aria-hidden="true">${CORNER_LENS_ICON}</span>
      <span class="corner-lens-prefix">${escapeHtml(CORNER_LENS_PREFIX)}</span>
      <span class="corner-lens-value">${escapeHtml(value)}</span>
    </a>
  `;
}

// Called by js/map.js only: the one page that carries the door. Turns the
// link into an in-place summon, keeping the href intact so a middle-click
// and a no-JS reader still get a working door.
export function wireCornerLensInPlace(handler) {
  const el = document.getElementById("corner-lens");
  if (!el || typeof handler !== "function") return;
  el.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    handler();
  });
}

export function renderTopBar(activePage) {
  // Bug fix: prerendered location pages (tools/prerender-
  // locations.mjs) ship a real, static .site-topbar for no-JS visitors —
  // it lives directly in <body>, outside #loc-root, so location.js's own
  // "clear #loc-root, then rebuild" reset never reaches it. Once this
  // script runs, the page is JS-hydrated: the static bar's own job is
  // done (and it never carried a working Dark mode button anyway, since
  // toggling needs JS to run at all), so it's removed here — replaced,
  // not stacked alongside, by the one this function builds. Fixed at the
  // source rather than trying to keep two independently-authored copies
  // of "the top bar" in permanent lockstep, which is exactly the
  // duplication class this project's own build notes warn about
  // elsewhere (generalIndex()/sectionForFact()'s Node-vs-browser twins).
  const existing = document.querySelector(".site-topbar");
  if (existing) existing.remove();
  const bar = document.createElement("div");
  bar.className = "site-topbar";
  // v7 no-JS fallback: siteUrl()-resolved paths (not a bare "index.html")
  // so this same bar renders correct links whether the page including it
  // lives at the site root or one level down (l/<location_id>.html, the
  // prerendered per-location pages) — see tools/prerender-locations.mjs —
  // and under either a domain-root or project-site-subpath deployment.
  bar.innerHTML = `
    <a class="brand" href="${withPersona(siteUrl("index.html"))}">CanILiveThere</a>
    ${cornerLensControlHtml()}
    <nav class="site-nav">
      <a href="${withPersona(siteUrl("index.html"))}" class="${activePage === "map" ? "active" : ""}">Map</a>
      <a href="${withPersona(siteUrl("lists.html"))}" class="${activePage === "lists" ? "active" : ""}">Lists</a>
    </nav>
    <button type="button" id="theme-toggle" aria-pressed="false">Dark mode</button>
  `;
  document.body.prepend(bar);

  const btn = bar.querySelector("#theme-toggle");
  const syncButton = () => {
    const dark = document.documentElement.dataset.theme === "dark";
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
    btn.classList.toggle("active", dark);
  };
  syncButton();
  btn.addEventListener("click", () => {
    toggleTheme();
    syncButton();
  });
}

// Door v2: the persona block is GONE from every page —
// its label (the one that asked a reader to pick whichever of eight
// strangers they most resembled), its <select>,
// the blurb, the explicit-general line, the passport-lens line, "Edit
// your answers" and "Forget what I've saved here". Each of the seven had
// a named destination before it was removed, and the destinations are the
// point: the choosing moves into the box (the eight tiles and the escape
// hatch), the disclosures move into the perspective line (js/reader-lens.js),
// "Edit your answers" becomes the corner control above, and the forget
// control moves to the footer's privacy line below — site-wide, one step
// from anywhere, which is what a stranger who has just typed their income
// on a location page actually needs.
//
// The one thing in the old block that was never part of the bar, and
// therefore stays exactly where it was: the "Information, not advice"
// disclaimer. It is legal protection, not a lens control.
export const DISCLAIMER_DETAILS_HTML = `
  <details class="recede">
    <summary>Information, not advice — read what this site is and isn't</summary>
    <p class="disclaimer recede-body">
      Every figure here shows what we have behind it — the source where we
      have one, and the date we re-checked it where we have one. Rules change —
      confirm anything that matters with the relevant embassy, notary, or
      accountant before acting on it.
    </p>
  </details>
`;

export function renderFooter(store) {
  // Same duplication class as renderTopBar()'s own fix above, found
  // during this build's own dry run (not in the original two-bug ask,
  // fixed anyway since it's the identical root cause I'd just fixed one
  // function up): tools/prerender-locations.mjs ships a real, static
  // .site-footer for no-JS visitors, a sibling of <main> in <body> — this
  // function used to just document.body.appendChild() a second one
  // alongside it rather than replacing it, so a JS-hydrated prerendered
  // page showed two different footer paragraphs stacked on top of each
  // other.
  const existing = document.querySelector(".site-footer");
  if (existing) existing.remove();
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  const meta = store && store.meta;
  footer.innerHTML = `
    <p>
      CanILiveThere is a research tool, not legal or immigration advice.
      Data is extracted from an underlying research vault and regenerated
      periodically — it is never hand-edited here.
      ${meta ? `Snapshot extracted ${escapeHtml(meta.extracted_at || "")}.` : ""}
    </p>
    <!-- The "Corrections & changes" line stood here and pointed at
         corrections.html. Both are gone: the corrections record and the
         change log are internal, so the footer no longer offers a reader
         a page that does not exist. Nothing takes its slot. -->
    <p><a href="${withPersona(siteUrl("principles.html"))}">How we work</a> — the rules we hold ourselves to, and how to check us on them.</p>
    <p><a href="${withPersona(siteUrl("privacy.html"))}">What this site does with your browser</a> — what leaves it, what stays, and why the pages are this light.${
      hasAnySavedReaderState()
        ? ` <button type="button" class="btn-chip" id="forget-saved-btn">Forget my answers</button>`
        : ""
    }</p>
    <p>Want something researched, or found something wrong? <a href="${withPersona(siteUrl("contact.html"))}">Write to us.</a></p>
    <p>Anonymous, cookieless visit counts by Cloudflare help us see what's useful.</p>
  `;
  document.body.appendChild(footer);

  // The forget control's new, site-wide home. It sat in the
  // persona block, which is going, and in the door's resume band, which is
  // index.html-only — so a stranger on a location page who had just given
  // the site their income had no one-step way to take it back. It belongs
  // beside the footer's own "stays on your own device" sentence, which is
  // the sentence it acts on. Gated on hasAnySavedReaderState() exactly as
  // before, so it is never a dead control.
  const forgetBtn = footer.querySelector("#forget-saved-btn");
  if (forgetBtn) {
    wireForgetControl(forgetBtn, {
      onDone: () => { location.href = location.pathname + location.hash; },
    });
  }
}

// Comma-group digit runs of 5+ so large figures ("500000 THB") read as
// "500,000 THB" instead of forcing a reader to count zeros. Deliberately
// stops at 4 digits: this project's facts mix genuine 4-digit years
// ("2019", embedded in dates like "2019-10-31") with genuine 4-digit money
// figures ("1900 THB"), and there's no reliable way to tell those apart
// from the string alone — leaving 4-digit runs untouched is the safe
// default (a 4-digit number is also easy enough to read unformatted;
// the real readability problem starts at 5+ digits). Already-formatted
// runs ("50,000") are naturally left alone, since the comma splits them
// into shorter digit groups this regex doesn't re-match.
export function formatNumbersInText(text) {
  return text.replace(/\d{5,}/g, (run) => Number(run).toLocaleString("en-US"));
}

// Some
// fact rows on file (pet-import especially) are one dense run-on
// `value_raw` paragraph bundling several distinct clauses — real content,
// bad presentation. This splits on sentence-ending periods and semicolons
// ONLY (the two boundary types the actual data supports without risking
// meaning), never on commas (comma-joined lists inside one clause, e.g.
// "€42.25 for one pet, €84.50 for two to five pets", stay on one line on
// purpose — splitting every comma over-fragments a real list into noise).
//
// A period only counts as a boundary when followed by whitespace and then
// an uppercase letter, digit, or open-paren (a real new clause/sentence
// start) AND the word immediately before it is not a known abbreviation
// or a single letter — guards against "incl. US" and "N. Ireland"-shaped
// false splits, both real cases found in the live pet-import data during
// this fix (Indonesia's Bali-routing fact, Malaysia's quarantine-exemption
// fact). Decimal numbers ("0.5") are never split: the character before
// the period there is a digit, not a letter, so the abbreviation-word
// check naturally excludes them too — one guard, two problems solved.
// Semicolons always split (no abbreviation ambiguity for a semicolon).
// Verified against all 21 countries' live pet-import fact rows this
// session — every split rejoins (whitespace-normalized) to the original
// string with zero content loss or reordering.
const SENTENCE_ABBREV_STOPLIST = new Set([
  "incl", "etc", "vs", "approx", "no", "eg", "ie", "govt", "dept",
  "st", "mt", "dr", "mr", "mrs", "jr", "sr", "vol", "co", "corp",
  "inc", "ltd", "min", "max", "esp",
]);

export function splitFactSentences(text) {
  if (!text) return [];
  const result = [];
  let cur = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    cur += ch;
    if (ch === ";") {
      if (/\s/.test(text[i + 1] || "")) {
        result.push(cur.trim());
        cur = "";
      }
    } else if (ch === ".") {
      const rest = text.slice(i + 1);
      const wsMatch = rest.match(/^\s+/);
      if (wsMatch) {
        const after = rest.slice(wsMatch[0].length);
        if (/^[A-Z(0-9]/.test(after)) {
          const wordMatch = cur.match(/([A-Za-z]+)\.$/);
          const word = wordMatch ? wordMatch[1].toLowerCase() : "";
          if (word.length > 1 && !SENTENCE_ABBREV_STOPLIST.has(word)) {
            result.push(cur.trim());
            cur = "";
          }
        }
      }
    }
  }
  if (cur.trim()) result.push(cur.trim());
  return result.filter(Boolean);
}

// --- Live FX reference-currency stopgap ---
// A reader's own nationality/currency isn't captured anywhere on the site
// yet (that's tomorrow's real build); until then, this appends a USD
// approximation to bare-local-currency figures so "500,000 THB" doesn't
// require a reader to already know an exchange rate. Deliberately a LIVE
// lookup, not a hardcoded rate table: this project's own research already
// shows rates drifting well past a 10% margin within days for volatile
// currencies (Argentina's peso spans 430-510 ARS/USD across sources
// written days apart) — a static number baked into code would look
// authoritative and go visibly wrong. open.er-api.com is free, keyless,
// updates daily, and covers every currency this site's facts use.
// Fails soft everywhere (offline, blocked, unknown currency, no numeric
// value): the reader always sees the real local-currency figure
// regardless — this is a bonus annotation, never load-bearing.
const FX_CACHE_KEY = "clt-fx-rates-v1";
const FX_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — a normal browsing session makes at most one real request
let fxRates = null; // { CODE: rate-per-USD }, null until loaded or on any failure

export async function loadFxRates() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(FX_CACHE_KEY) || "null");
    if (cached && Date.now() - cached.fetchedAt < FX_CACHE_TTL_MS) {
      fxRates = cached.rates;
      return;
    }
  } catch {
    // corrupt/unavailable cache entry - fall through to a fresh fetch
  }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.rates) return;
    fxRates = data.rates;
    try {
      sessionStorage.setItem(FX_CACHE_KEY, JSON.stringify({ rates: fxRates, fetchedAt: Date.now() }));
    } catch {
      // storage full/unavailable/private-browsing - fine, just skip caching
    }
  } catch {
    // offline, blocked, rate-limited, whatever - the page works fine without this
  }
}

// Bare currency-code units only ("THB", "THB/sqm", "RM/month",
// "ZAR/m²") — deliberately conservative. Skipped on purpose: anything
// already carrying a parenthetical/manual approx ("RM (~$213,000)") or a
// "~", since that's either already hand-converted (don't show two
// different USD guesses for one figure) or too free-text to parse
// safely. USD and EUR themselves are excluded — a reader doesn't need
// USD converted to USD, and EUR is already a widely-recognized
// reference currency in its own right, unlike THB/MAD/ARS/etc. for most
// readers.
const BARE_CURRENCY_CODES = ["THB", "RM", "MYR", "ZAR", "MAD", "ARS", "IDR", "EGP", "COP", "MXN"];
const CURRENCY_TO_FX_CODE = { RM: "MYR" };

function detectBareCurrency(unit) {
  if (!unit || unit.includes("(") || unit.includes("~")) return null;
  for (const code of BARE_CURRENCY_CODES) {
    if (unit === code || unit.startsWith(`${code}/`) || unit.startsWith(`${code} `)) {
      return CURRENCY_TO_FX_CODE[code] || code;
    }
  }
  return null;
}

function usdApprox(amount, fxCode) {
  if (!fxRates || !fxRates[fxCode] || !Number.isFinite(amount)) return null;
  const usd = amount / fxRates[fxCode];
  if (!Number.isFinite(usd) || usd <= 0) return null;
  const rounded = usd >= 100 ? Math.round(usd / 10) * 10 : Math.round(usd);
  return rounded.toLocaleString("en-US");
}

// Part 39 (§39.6): raw numeric USD conversion for the cost-comparison
// panel's bar GEOMETRY and sort only — never for displayed text (the
// inline ≈-suffix rules above, usdApprox()/detectBareCurrency(), stay
// exactly as shipped, including their deliberate EUR/USD exclusions).
// Geometry needs every row on one shared axis, so this converts every
// ISO code the fetched rate table covers, EUR included, and passes USD
// through unchanged. The caller receives the code from the derived
// export's own config-explicit `currency_code` field (§8AP.3) — this
// function never parses a unit string. Fails soft to null (missing
// rates, unknown code, non-finite input); the panel's degrade ladder
// (§39.6) decides what null means — never a silently wrong position.
export function usdNumeric(amount, currencyCode) {
  if (!Number.isFinite(amount)) return null;
  if (currencyCode === "USD") return amount;
  if (!fxRates || !fxRates[currencyCode]) return null;
  const usd = amount / fxRates[currencyCode];
  return Number.isFinite(usd) && usd > 0 ? usd : null;
}

// Whether the display FX table actually loaded this session — the
// panel's ladder split (§39.6): rates missing entirely is step 2 (whole
// chart withheld, honest native-figure list), one unconvertible code
// while rates exist is step 3 (that row alone moves to the gap list).
export function fxRatesLoaded() {
  return fxRates != null;
}

// Part 23.6: the feel-clever law's per-instance safety net. An existing
// upstream check already enforces "generic term leads, acronym follows in
// parens" at each field's mechanical FIRST occurrence — this
// covers every occurrence, on every reader-facing surface, including a
// deep-linked or screenshotted single row that never shows that field's
// first occurrence at all. Wraps every whole-word match of a glossary term
// with a real expansion in a native `<abbr title="…">` — screen readers can
// announce the title on request, sighted readers get a dotted-underline
// hover, zero new interaction to learn. `text` is raw (unescaped) input;
// this both escapes it AND inserts the wrap in one pass, so a caller never
// needs to call escapeHtml() separately on text going through this.
// A single combined regex (not one replace() per term) so a term can never
// accidentally get double-wrapped by matching inside a previous term's own
// freshly-inserted title attribute.
export function glossaryWrap(text, store) {
  if (text == null) return "";
  const escaped = escapeHtml(String(text));
  const terms = store && store.glossaryByTerm;
  if (!terms || !terms.size) return escaped;
  const alternation = [...terms.keys()]
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  if (!alternation) return escaped;
  const re = new RegExp(`\\b(${alternation})\\b`, "g");
  return escaped.replace(re, (m) => {
    const entry = terms.get(m);
    return entry ? `<abbr title="${escapeHtml(entry.expansion)}">${m}</abbr>` : m;
  });
}

// Part 23.3 (F4, the double-stamp fix): confidenceBadge()'s own gap branch
// already renders "Not yet researched" as a chip. A template that renders
// BOTH this function's value line AND that badge for the same fact used to
// print the identical four words twice, side by side. The fix is scoped to
// the co-occurrence, not the phrase — a caller that renders formatValue()
// WITHOUT an adjacent confidenceBadge() must NOT pass this (it's the only
// gap signal on that surface, unchanged from before). Checked exhaustively
// this build: every formatValue() call site in this codebase renders
// confidenceBadge() for the same fact right alongside it (grepped, not
// assumed) — flagged in the build report as a live fact worth re-checking
// if a new call site is ever added without the badge.
export function formatValue(fact, { suppressGapText = false } = {}) {
  if (fact.value_raw === "[GAP]") return suppressGapText ? "—" : "Not yet researched";
  const raw = formatNumbersInText(String(fact.value_raw));
  // Only append the unit if value_raw doesn't already carry it as text —
  // some facts' own value_raw already spells out its unit inline (e.g.
  // "50km coast / 100km border", "49% of building"), and appending the
  // bare unit again on top of that duplicates it visibly ("...building %").
  let out = raw;
  if (fact.unit && !raw.toLowerCase().includes(String(fact.unit).toLowerCase())) {
    out = `${raw} ${fact.unit}`;
  }
  // Bug fix (caught by a real-data dry run, not just a read of
  // the code): detectBareCurrency() only inspected fact.unit for an
  // existing manual approximation, but at least one real fact on file
  // (ID:bpjs-kesehatan-monthly-cost-where-eligible) carries its own
  // "(~$3-10)" approximation inside value_raw itself, with a perfectly
  // bare unit ("IDR/month"). Without this second check, the moment that
  // fact (or any future one shaped like it) gains value_num_low/high, a
  // reader would see two different, disagreeing USD guesses stapled
  // together ("(~$3-10) (≈$2-$8)") -- exactly the collision this
  // function's own comment says it exists to prevent. Checking raw here
  // (not fact.value_raw) is equivalent and cheaper: formatNumbersInText()
  // never adds or removes "(" or "~".
  const fxCode = detectBareCurrency(fact.unit);
  if (fxCode && !raw.includes("(") && !raw.includes("~")) {
    const low = usdApprox(fact.value_num_low, fxCode);
    const high = Number.isFinite(fact.value_num_high) && fact.value_num_high !== fact.value_num_low
      ? usdApprox(fact.value_num_high, fxCode)
      : null;
    if (low) out += high ? ` (≈$${low}–$${high})` : ` (≈$${low})`;
  }
  return out;
}

// Exported (not just module-local) so the map's plain-text hover tooltip
// (which can't carry a styled <span> badge) can append the identical
// wording as a text suffix — one vocabulary, two render shapes, never a
// second copy of these three strings.
export const CONF_LABEL = { High: "High confidence", Medium: "Medium confidence", Speculative: "Speculative" };

// Plain-language glosses for the site's own internal sourcing vocabulary —
// one lookup per field, reused everywhere that field is rendered, so a
// visitor never sees the raw internal value (e.g. "aggregator-only") that
// only makes sense to whoever built the dataset.
const SOURCE_COUNT_LABEL = {
  single: "one source",
  "aggregator-only": "an aggregator site",
  "cross-corroborated": "more than one source, cross-checked",
  "primary-institutional": "an official/primary source",
};

export const WEIGHT_CLASS_LABEL = {
  High: "weighted heavily in the index",
  "Medium-High": "weighted above average in the index",
  Medium: "weighted normally in the index",
};

// The pending-ruling disclosure for any criterion whose `reader_dependency` field
// reads "pending-ruling" (today: Community & social fabric only) — a
// criterion score that structurally blends more than one distinct fact,
// honestly labeled rather than rendered identically to a single-fact
// score. One canonical short marker (chip/column-header suffix) and one
// canonical longer paragraph (chapter/section copy), each reused verbatim
// across every render home (location.js, lists.js, criteria.html), same
// idiom as FIT_INDEX_DEFINITION/SCALE_ANCHOR_STRING above. The six named
// facts are transported verbatim from this project's own internal
// criterion-scope ruling, not authored here. Word choice: "blends several
// facts" deliberately avoids "composite" (already used elsewhere for a
// different, killed concept — a blended-across-readers score) to prevent
// a vocabulary collision.
export const READER_DEPENDENCY_PENDING_LABEL = "blends several facts";
export const READER_DEPENDENCY_PENDING_PARAGRAPH =
  'Criteria marked "blends several facts" fold more than one distinct thing into a single number — for Community & social fabric today, that\'s expat/foreigner density, language accessibility, family-friendliness, nightlife/social-scene density, LGBTQ+ safety-and-acceptance, and professional-network depth. We\'re working to score these separately; until then, treat the single figure as a rough signal, not a precise read.';

// ---------------------------------------------------------------------
// Persona verdict-first banding (v4 addendum R1 §1.2, moved here from
// lists.js by v6 addendum §2.3 so map.js's legend can import the exact
// same registry instead of forking its own hardcoded labels — the same
// drift class verdictVisual()'s color grouping and headline prose once
// disagreed on, per that section's own citation). Exact headline string
// -> band; unknown strings fail loud into "unclassified" (verdictBand()
// below), never guessed. The two judgment calls (type-trap rows) are
// argued in the v4 addendum itself, not asserted here.
// ---------------------------------------------------------------------
export const VERDICT_BAND = {
  "Clears": "clears",
  "Near-miss": "near-miss",
  "Clears the number, fails the type": "near-miss",
  "Misses": "doesnt-clear",
  "Categorical absence": "doesnt-clear",
  "One door opens, leads nowhere": "doesnt-clear",
  "Unverified": "not-checked",
};
export function verdictBand(headline) {
  return Object.prototype.hasOwnProperty.call(VERDICT_BAND, headline)
    ? VERDICT_BAND[headline] : "unclassified";
}
export const BAND_ORDER = ["clears", "near-miss", "doesnt-clear", "not-checked", "unclassified"];
export const BAND_LABEL = {
  clears: "Clears", "near-miss": "Near-miss", "doesnt-clear": "Doesn't clear",
  "not-checked": "Not checked yet", unclassified: "Unclassified — needs attention",
};

// `interactive` defaults true (the §5.3.2 pull-affordance shape, for use
// inside a `.fact-meta` block with a `.source-detail` sibling). The Sources
// section already dedicates its own real estate to source name/date, so it
// renders the same badge without the click affordance — `interactive:
// false` — rather than leaving an inert, do-nothing tab stop there.
export function confidenceBadge(fact, { interactive = true } = {}) {
  if (fact.value_raw === "[GAP]") {
    return `<span class="badge badge-gap">Not yet researched</span>`;
  }
  const bits = [];
  if (fact.confidence) bits.push(CONF_LABEL[fact.confidence] || fact.confidence);
  if (fact.source_count) bits.push(SOURCE_COUNT_LABEL[fact.source_count] || fact.source_count.replace(/-/g, " "));
  const label = bits.length ? bits.join(", ") : "confidence not stated";
  // A fact with no explicit `confidence` field is not the same claim as one
  // the schema's own authors tagged Speculative — that field being absent
  // just means no confidence tier was set, and a fact can still carry real
  // sourcing rigor via `source_count` alone (e.g. cross-corroborated). Only
  // an explicit "Speculative" value earns the speculative styling; an
  // absent field gets the same neutral treatment the base .badge class
  // already gives everything else, never a silent demotion.
  const cls = fact.confidence === "High" ? "badge-high"
    : fact.confidence === "Medium" ? "badge-medium"
    : fact.confidence === "Speculative" ? "badge-speculative"
    : "badge-neutral";
  // Pull-not-push (v2 addendum §5.3.2): this badge is the single click/tap
  // target for "how do we know this" — see sourceDetailHtml() and the
  // delegated toggle listener below, which expand it to source name/link
  // and last-checked date in one place, instead of those living as
  // separate always-visible elements doing half a job each.
  if (!interactive) return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
  return `<span class="badge ${cls}" data-toggle-source tabindex="0" role="button" aria-expanded="false" title="How do we know this? Click for source and date.">${escapeHtml(label)}</span>`;
}

// Same three-value vocabulary as confidenceBadge() above, applied to a
// verdict's own sourcing tier instead of a single fact's. Reuses CONF_LABEL
// and the badge-high/medium/speculative/neutral classes verbatim — no
// second confidence system for a reader to learn. Non-interactive only for
// this ship: no click-to-expand "which route set this" affordance yet.
// A verdict with no tier (data-gap rows, and some non-gap rows the engine
// found no single deciding route for) renders nothing at all, matching the
// skip behavior a caller should also apply for overall_band === "data_gap"
// before calling this at all — see call sites in location.js/lists.js/map.js.
export function verdictConfidenceBadge(tier) {
  if (!tier) return "";
  const label = CONF_LABEL[tier] || "confidence not stated";
  const cls = tier === "High" ? "badge-high" : tier === "Medium" ? "badge-medium"
    : tier === "Speculative" ? "badge-speculative" : "badge-neutral";
  return `<span class="badge ${cls}" title="Sourcing confidence for the route(s) behind this verdict">${escapeHtml(label)}</span>`;
}

// Perspective-disclosure law applied to the two table
// surfaces (the Lists banded view and a location page's own verdict
// block) that render a persona's verdict text. A hand-checked fixture
// (today: Wenda/Carmen, only at the handful of locations each actually
// has one on file) and a rule-derived engine read (every other verdict
// on the site — the majority) render as two different prose registers
// with nothing on the page saying which one a reader is looking at.
// The map's own hand-checked ring + legend already disclose this exact
// distinction (v12 Part 23.9's own line: "hand-checked where we've
// verified it, rule-derived elsewhere") — this reuses that same,
// already-cleared vocabulary verbatim for the two surfaces a ring
// can't reach, rather than inventing new copy.
export function verdictProvenanceBadge(isHandChecked, displayName) {
  return isHandChecked
    ? `<span class="badge badge-neutral" title="We reviewed ${escapeHtml(displayName)}'s own case here directly, not just the general rule.">Hand-checked for ${escapeHtml(displayName)}</span>`
    : `<span class="badge badge-neutral" title="Computed from this site's own documented rules against ${escapeHtml(displayName)}'s stated profile — not individually reviewed by us.">Rule-derived read</span>`;
}

// ---------------------------------------------------------------------
// Part 24: the split-pill treatment for a visit-layer headline that is
// the ONLY thing standing between a reader and "every residency route
// here hard-fails" — §13.9's mandatory disclosure, made visible at the
// chip itself, not just in a caption. Ground truth for both new engine
// fields: `derived/verdicts.jsonl`'s `deciding_group_kind` ("route"/
// "visit") and `companion_disclosure` (the ratified §13.9 item 2
// sentence when the trigger fires, else null) — confirmed against live
// exported rows this session. The render spec sketched an illustrative
// separate boolean trigger flag alongside `deciding_group_kind`; the
// engine's actual build instead folds trigger-and-text into the one
// `companion_disclosure` field (null when the trigger doesn't fire) —
// this code reads that field directly as both the truthy trigger check
// AND the rendered text, rather than hardcoding a second copy of the
// same ratified sentence here. That adaptation is this build's own
// call, flagged in its own report, not a re-derivation of §13.9's
// semantics (no rank/hard-fail comparison happens client-side anywhere
// below — the engine's own pre-computed field is trusted as-is, per the
// spec's own single-source instruction).
// ---------------------------------------------------------------------

// 24.2's own always-visible second-segment label — five words, no
// internal vocabulary (checked against the feel-clever law and the
// publication-boundary sweep, same as every other committed UI string
// in this file).
export const NO_RESIDENCY_ROUTE_CLEARS_LABEL = "No residency route clears";

// One shared builder for the three call sites this Part touches
// (location.js's two engine-verdict branches, lists.js's
// buildVerdictHtml() engine branch) — so the split-pill markup lives in
// exactly one place, not copy-pasted three times. `companionDisclosure`
// is `engineVerdict.companion_disclosure` verbatim: null renders the
// existing single chip, byte-for-byte unchanged from before this Part;
// a real string renders the two-segment split pill (24.2) instead.
// Segment 1 reuses the caller's own color/label exactly as it already
// rendered (zero new copy — the visit layer's own true state, unchanged
// per §13.9's own ruling that the composition stands). Segment 2 is the
// fixed label above, filled with eliminatedColor() — the same token
// every hard-fail chip on this site already uses, zero new hex. Wrapped
// in `role="group"` with one combined `aria-label` (24.2's own
// accessibility requirement) built mechanically from the two segments'
// own real visible text, not fabricated new prose.
export function verdictChipMarkup(color, label, companionDisclosure) {
  if (!companionDisclosure) {
    return `<span class="verdict-chip" style="background:${color}">${escapeHtml(label)}</span>`;
  }
  const ariaLabel = `${label} ${NO_RESIDENCY_ROUTE_CLEARS_LABEL}.`;
  return (
    `<span class="verdict-chip-split" role="group" aria-label="${escapeHtml(ariaLabel)}">` +
    `<span class="verdict-chip-split-seg" style="background:${color}">${escapeHtml(label)}</span>` +
    `<span class="verdict-chip-split-seg" style="background:${eliminatedColor()}">${escapeHtml(NO_RESIDENCY_ROUTE_CLEARS_LABEL)}</span>` +
    `</span>`
  );
}

// §25.8's rule: "'verbatim from the ratified
// text' binds the WORDS -- never the leading letter's case or the
// terminal punctuation of the rendered sentence." Its one named target:
// the §13.9 companion-disclosure sentence, sourced lowercase-led from
// `derived/verdicts.jsonl`'s own `companion_disclosure` field (correct
// there -- quoted mid-sentence in the rule doc) but rendered at
// location.js's two call sites as its own standalone `<p
// class="verdict-prose">` paragraph, where a lowercase-led sentence
// reads as an error on the page's most load-bearing disclosure line.
// A source-string fix at the render call site, not a CSS transform (the
// distinction 25.8 itself draws): this returns a real corrected string,
// so the actual DOM text node -- what copy-paste and screen readers both
// see -- carries the fix, not just the on-screen pixels. Every other use
// of `companion_disclosure` on the site (verdictChipMarkup above,
// lists.js) only tests its truthiness, never renders its text, so this
// is the sentence's one and only render call site needing the transform.
export function sentenceCaseRuleParagraph(text) {
  if (!text) return text;
  const capitalized = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

// 24.5: a named, deliberately dormant slot for a future renewal-life
// explainer (a fresh, separate product ask — explicitly NOT this
// build; the render spec reserves only the slot,
// immediately after the companion-disclosure paragraph and before
// insteadLine on the location page). Same hard-placeholder convention
// location.js's own buildPortrait()
// already uses for a location with no portrait on file: returns "" now
// and authors zero copy — the real link (href + text, once that content
// exists) lands inside this one function with zero other call-site
// changes needed.
export function renewalLifeExplainerLine() {
  return "";
}

// ---------------------------------------------------------------------
// Part 37 — location-scope verdicts' own gate-provenance line: "This
// location," the four location gates' states (cost/property/safety/
// education), the deciding-gate marker, both property render
// treatments. Every ship string below is the ratified copy deck's own
// wording, verbatim — nothing here is authored prose, only the
// mechanism selecting which already-worded string applies to a given
// real routes_detail row. Ground truth for field shapes: §8AK
// (`assessed`, `receipt`) and tools/visa-fit-engine.py's own four
// location-gate functions, read directly this build, not inherited
// from the spec's paraphrase.
// ---------------------------------------------------------------------

// Fixed canonical order, every gate that appears renders in this order —
// 37.1's own rule, so a reader learns one order and it never reshuffles.
const LOCATION_GATE_ORDER = ["location_cost", "location_property", "location_safety", "location_education"];

// A location gate's public routes_detail row carries `band` (set only for
// fails/conditional) and `assessed` (§8AK.1's discriminator) — NOT a
// four-value state enum; `composed_state` stays "clean" for both a real
// clear and a not-yet-assessed row (the engine's own build choice, §8AK),
// so this is the one place that collapse gets resolved, per 37.4's own
// ruled mapping: band set -> fails/conditional; band null + assessed true
// -> clears; band null + assessed false -> not_assessed.
function locationGateState(rt) {
  if (rt.band === "hard_fail") return "fails";
  if (rt.band === "uncertain_or_conditional") return "conditional";
  if (rt.band == null && rt.assessed === true) return "clears";
  return "not_assessed";
}

// Same digit-grouping convention formatNumbersInText() already uses
// (toLocaleString("en-US")), applied to a receipt's low/high pair. Always
// a real range, en dash-joined, even where low === high — the ratified
// worked example (marek/CO-medellin, "$2,985–$2,985") keeps the two
// figures rather than collapsing to one: the render must not manufacture
// a spread that isn't in the data (37.5's own reasoning).
export function formatUsdRange(low, high) {
  const fmt = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
  return `${fmt(low)}–${fmt(high)}`;
}

// Cost — every location-scope verdict, every persona (37.1, 37.5). Ship
// string patterns verbatim from the ratified copy deck's own §2.
// `receipt` is present on every assessed cost row without exception
// (confirmed by reading
// gate_location_cost() directly: every return branch that sets
// assessed:true also sets low_usd/high_usd).
//
// The not-assessed sentence choice was originally this render's own
// inference from `householdSize` alone (the public export drops the
// engine's free-text `reason`, so the real cause never reached this
// render). Fixed: the data now carries `not_assessed_cause`
// ("no_fact" | "fx_blocked" | "household_only") straight from the
// engine's own real not-assessed branches, so this reads the real cause
// instead of guessing. The household-specific sentence fires ONLY for the
// no-fact-at-this-household-size cause — a currency-conversion block
// hits every household size alike, so it always takes the general
// sentence, never the household one, regardless of `householdSize`.
// A row without `not_assessed_cause` (older data, or a not-assessed
// row not yet tagged) falls back to the prior household-size guess
// rather than breaking — either data vintage renders safely.
function costGatePhrase(rt, householdSize) {
  const state = locationGateState(rt);
  const receipt = rt.receipt;
  const range = receipt ? formatUsdRange(receipt.low_usd, receipt.high_usd) : null;
  const confClause = receipt && receipt.confidence_tier ? `, ${receipt.confidence_tier.toLowerCase()} confidence` : "";
  switch (state) {
    case "clears":
      return `Cost: clears — documented range ${range}${confClause}.`;
    case "conditional":
      return `Cost: within range, not clearly clear — documented range ${range}${confClause}.`;
    case "fails":
      return `Cost: doesn't clear — documented range ${range}${confClause}, even at the low end.`;
    case "not_assessed": {
      // THE PER-HOUSEHOLD-ONLY CAUSE (added on a ruling).
      // `"household_only"` says usable monthly cost figures DO
      // exist at this location, but every one of them declares a per-
      // household denominator, so there is no single-person band to
      // report. On that path both sentences below are false: a figure
      // exists, it simply describes the wrong unit, and "not yet assessed
      // at this location" tells the reader nothing is on file. The
      // sentence returned here is RULED COPY, quoted verbatim — do not
      // reword it for line length or to match the register of its
      // siblings, and do not append "that's our homework, not your no."
      // It is deliberately NOT prefixed "Cost: " the way every sibling
      // phrase is: it carries its own subject, and the prefix would read
      // "Cost: The cost figures on file here…". Rendering it whole,
      // prefix included, is a design call and not a mechanical one — it
      // is flagged upward in this change's report, not settled here.
      if (rt.not_assessed_cause === "household_only") {
        return "The cost figures on file here describe a household, not one person — not assessed for a single reader.";
      }
      // BOTH BRANCHES BELOW ARE UNTOUCHED: each is correct on its own
      // cause and the ruling said nothing about either.
      const isHouseholdSpecific = rt.not_assessed_cause
        ? rt.not_assessed_cause === "no_fact" && householdSize > 1
        : householdSize > 1; // no cause on the row - fall back to the prior guess
      return isHouseholdSpecific
        ? "Cost: not yet assessed for a household this size — that's our homework, not your no."
        : "Cost: not yet assessed at this location — that's our homework, not your no.";
    }
    default:
      return null;
  }
}

// Property, buy-intent (waldo/wenda/marek) — a real gate (37.1, 37.6).
// Same receipt-always-present-when-assessed guarantee as cost (confirmed
// directly against gate_location_property()).
function propertyGatePhrase(rt, householdSize) {
  const state = locationGateState(rt);
  const receipt = rt.receipt;
  const range = receipt ? formatUsdRange(receipt.low_usd, receipt.high_usd) : null;
  switch (state) {
    case "clears":
      return `Property: clears — documented entry-price range ${range}.`;
    case "conditional":
      return `Property: within range, not clearly clear — documented entry-price range ${range}.`;
    case "fails":
      return `Property: doesn't clear — documented entry-price range ${range}, even at the low end.`;
    case "not_assessed":
      return householdSize > 1
        ? "Property: not yet assessed for a household this size — that's our homework, not your no."
        : "Property: not yet assessed at this location — that's our homework, not your no.";
    default:
      return null;
  }
}

// Property, either-intent (teo/marguerite) — color + disclosure, never a
// gate, by design: no band, no pass/fail token
// anywhere near it. A REAL, NAMED GAP as of this build (§8AK item 4,
// confirmed directly against disclosure_location_property(): it never
// calls _convert_band_to_usd(), so `receipt` never exists on this row
// today, even when a price IS documented — `assessed: true` with no
// receipt means a price exists but isn't exported as USD yet, which is
// a DIFFERENT claim than "no price documented." Rendering the ratified
// absent-fact sentence in that case would be false; inventing numbers
// would be authoring a fact. This function renders nothing (null) for
// that specific state rather than either — the caller skips the line
// entirely — flagged in the build report, not papered over. Once the
// engine threads a receipt through this path, this function needs zero
// changes: the `rt.receipt` branch already handles it.
function propertyDisclosurePhrase(rt) {
  if (rt.receipt) {
    return `If buying is ever the choice: documented entry price here is ${formatUsdRange(rt.receipt.low_usd, rt.receipt.high_usd)} — shown to inform, not to gate this verdict.`;
  }
  if (!rt.assessed) {
    return "If buying is ever the choice: no documented entry price here yet.";
  }
  return null;
}

// Safety, declared personas only (today: marek) — 37.1, 37.7. Fixed
// strings, no receipt (safety carries no numeric figures at the public
// grain today — 37.16 wobble 4 names this as an open schema call, not
// decided here).
function safetyGatePhrase(rt) {
  switch (locationGateState(rt)) {
    case "clears":
      return "Safety: clears — documented conditions here don't meet the bar for a gate.";
    case "conditional":
      return "Safety: conditional — documented safety varies sharply by neighborhood here; some documented areas meet the bar, others don't.";
    case "fails":
      return "Safety: fails — a documented condition here makes normal daily life unviable across the whole location.";
    case "not_assessed":
      return "Safety: not yet assessed — that's our homework, not your no.";
    default:
      return null;
  }
}

// Homeschool-legal-status controlled vocabulary -> plain English (the
// ratified copy deck's own §5) — the raw values are schema slugs, never
// reader-facing.
const HOMESCHOOL_STATUS_LABEL = {
  "legal-unregulated": "legal, with no registration required",
  "legal-with-registration": "legal, with registration required",
  "restricted-case-by-case": "legal only case-by-case",
  banned: "banned",
};
// Same three open values gate_location_education() itself checks
// (_HOMESCHOOL_OPEN_VALUES) — "banned" is deliberately excluded, since a
// banned reading with no open schooling path is the hard-fail trigger,
// never part of a "clears" sentence (the copy deck's own note, §5).
const HOMESCHOOL_OPEN_VALUES = new Set(["legal-unregulated", "legal-with-registration", "restricted-case-by-case"]);
// Divergence-flag caveat, per attested value (the copy deck's own §5).
// Two of the three are sourced (real data / the ratified
// national-grain schema rule); "Confirmed-matches" was the deck's own
// flagged, unconfirmed guess — this build independently confirms it as a
// real, already-shipped value (divergenceBadge() below, same file, ships
// all three today) — noted in the build report as a finding for that
// open question, not silently resolved here without citing where it
// came from.
// No trailing period on these values — educationClearsPhrase()'s own
// outer template adds exactly one terminal period to the WHOLE joined
// sentence; a period here too would double it (a real bug this build's
// own headless check caught live, on the Chiang Mai/Bangkok/Phuket rows).
const EDUCATION_DIVERGENCE_CAVEAT = {
  "Not yet checked": "nobody's checked yet whether that holds up in practice",
  "Confirmed-diverges": "confirmed: what the law says and what actually happens here don't match",
  "Confirmed-matches": "confirmed: this matches how it works in practice",
};

// Education "clears" (at least one path open) needs fact-level detail
// (schooling evidence, homeschool status, divergence flag) the public
// verdict export doesn't carry (37.3's own leak-proofing strips
// `reason`) — joined here from the public FACTS layer instead, by the
// exact same fact_key shapes gate_location_education() itself reads
// (`{country_id}:homeschool-legal-status`,
// `{location_id}:international-school-count`,
// `{country_id}:public-school-foreign-resident-access`). Transports
// already-public fact content through the same join the engine already
// ran — authors zero new facts, only re-derives the display sentence
// the ratified copy deck already worded (§4).
function educationClearsPhrase(countryId, locationId, factsByKey) {
  const homeschool = factsByKey.get(`${countryId}:homeschool-legal-status`);
  const intlCount = factsByKey.get(`${locationId}:international-school-count`);
  const publicAccess = factsByKey.get(`${countryId}:public-school-foreign-resident-access`);

  const doors = [];
  let schoolingOpen = false;
  if (intlCount && (intlCount.value_num_low || 0) > 0) {
    schoolingOpen = true;
    const n = Math.round(intlCount.value_num_low);
    doors.push(`${n} international school${n === 1 ? "" : "s"} documented here`);
  } else if (publicAccess && String(publicAccess.value_raw || "").trim().toLowerCase().startsWith("yes")) {
    schoolingOpen = true;
    doors.push("public-school access for foreign residents documented");
  }
  const homeschoolVal = homeschool ? homeschool.value_raw : null;
  if (HOMESCHOOL_OPEN_VALUES.has(homeschoolVal)) {
    const label = HOMESCHOOL_STATUS_LABEL[homeschoolVal] || homeschoolVal;
    const div = homeschool.divergence_flag;
    const caveat = div && EDUCATION_DIVERGENCE_CAVEAT[div] ? ` — ${EDUCATION_DIVERGENCE_CAVEAT[div]}` : "";
    doors.push(`homeschooling is ${label}${caveat}`);
  }
  if (!doors.length) return null;
  return `Education: at least one path is open — ${doors.join("; ")}.`;
}

// Education, declared personas only (today: marek) — 37.1, 37.8. The
// ratified register consumed verbatim for not-assessed; the fails
// sentence is specified though unused today (0/38 rows), same "specified
// though unused" precedent as safety's own hard-fail. The `conditional`
// branch is a confirmed, real gap (the copy deck's own §0, re-confirmed
// against gate_location_education() directly this build): the function
// has exactly three return branches and literally no code path that
// returns `uncertain_or_conditional` — inventing copy for it would be a
// semantics guess, not this build's (or the deck's) to make. This build
// renders nothing for that state (never expected to fire) and warns
// loudly if it ever does, rather than shipping invented prose.
function educationGatePhrase(rt, countryId, locationId, factsByKey) {
  const state = locationGateState(rt);
  switch (state) {
    case "clears": {
      const phrase = educationClearsPhrase(countryId, locationId, factsByKey);
      if (!phrase) {
        console.warn("Part 37: education gate state 'clears' but no open door found in facts for", countryId, locationId);
        return null;
      }
      return phrase;
    }
    case "fails":
      return "Education: fails — both documented schooling paths are shut here: homeschooling is banned, and no accessible schooling route is documented.";
    case "not_assessed":
      return "Education: not yet assessed — that's our homework, not your no.";
    case "conditional":
      console.warn("Education gate returned 'conditional' — no ratified copy exists for this state today. Rendering nothing for this line rather than inventing one.");
      return null;
    default:
      return null;
  }
}

function locationGateLinePhrase(gateName, rt, householdSize, countryId, locationId, factsByKey) {
  switch (gateName) {
    case "location_cost": return costGatePhrase(rt, householdSize);
    case "location_property":
      return rt.informational_only ? propertyDisclosurePhrase(rt) : propertyGatePhrase(rt, householdSize);
    case "location_safety": return safetyGatePhrase(rt);
    case "location_education": return educationGatePhrase(rt, countryId, locationId, factsByKey);
    default: return null;
  }
}

// The full "This location" block (37.1, 37.9, 37.11) — placed directly
// under the verdict headline, only on scope="location" verdicts, first
// paint carries the full applicable-gate list (never behind a recede
// toggle — 37.1's own instruction: "not an opt-in depth control"). The
// deciding-gate marker (37.1/37.9) reproduces compose_location()'s own
// worst-ranked-firing-gate rule client-side (LOCATION_BAND_RANK in
// tools/visa-fit-engine.py: hard_fail beats uncertain_or_conditional,
// first in canonical order wins a tie — this loop's own iteration order
// over LOCATION_GATE_ORDER matches that exactly) against the public
// `overall_band` fields already on both this row and its sibling
// national row — no new computation, a transparent re-statement of
// already-shipped data.
export function locationGateProvenanceHtml(store, engineVerdict, personaId, country, loc) {
  if (!engineVerdict || engineVerdict.scope !== "location") return "";
  let routes;
  try {
    routes = JSON.parse(engineVerdict.routes_detail);
  } catch (e) {
    console.warn("Part 37: routes_detail failed to parse for", personaId, loc.location_id, e);
    return "";
  }
  const byGate = new Map();
  for (const r of routes) {
    if (r.group_kind === "location_gate") byGate.set(r.route_key.replace(/^location:/, ""), r);
  }
  if (byGate.size === 0) return "";

  const profile = store.profilesById.get(personaId);
  const householdSize = (profile && profile.household_size) || 1;

  const perPersona = store.verdictsByPersona.get(personaId);
  const nationalRow = perPersona ? perPersona.byCountry.get(country.country_id) : null;

  const RANK = { hard_fail: 0, uncertain_or_conditional: 1 };
  let decidingGate = null;
  let bandsDiffer = false;
  if (nationalRow) {
    bandsDiffer = nationalRow.overall_band !== engineVerdict.overall_band;
    if (bandsDiffer) {
      let bestRank = Infinity;
      for (const gateName of LOCATION_GATE_ORDER) {
        const rt = byGate.get(gateName);
        if (!rt || rt.informational_only || rt.band == null) continue;
        const rank = RANK[rt.band];
        if (rank !== undefined && rank < bestRank) {
          bestRank = rank;
          decidingGate = gateName;
        }
      }
      if (!decidingGate) {
        // 8AJ.3.3 guarantees a firing gate explains any downward move —
        // this branch is not expected to fire; warned rather than silently
        // asserting a marker (or the "nothing narrowed it" line) that
        // isn't actually true either way.
        console.warn("Part 37: location band differs from national band but no firing gate found to mark as deciding", personaId, loc.location_id);
      }
    }
  } else {
    console.warn("Part 37: no sibling national verdict row found for", personaId, country.country_id);
  }

  const items = [];
  for (const gateName of LOCATION_GATE_ORDER) {
    const rt = byGate.get(gateName);
    if (!rt) continue;
    const phrase = locationGateLinePhrase(gateName, rt, householdSize, country.country_id, loc.location_id, store.factsByKey);
    if (!phrase) continue;
    const isDeciding = gateName === decidingGate;
    const stateClass = rt.informational_only ? "disclosure" : locationGateState(rt).replace(/_/g, "-");
    // No literal trailing space here — .gate-deciding-marker's own CSS
    // margin-right already provides the gap; a space here too would
    // double it (a real, small rendering artifact this build's own
    // screenshot check caught live).
    const markerHtml = isDeciding
      ? `<span class="gate-deciding-marker">This is what narrowed it:</span>`
      : "";
    items.push(
      `<li class="gate-line gate-line--${stateClass}${isDeciding ? " gate-line--deciding" : ""}">${markerHtml}${escapeHtml(phrase)}</li>`
    );
  }
  if (!items.length) return "";

  const restingSentence = (nationalRow && !bandsDiffer)
    ? `<p class="gate-provenance-marker">Nothing here narrowed the national result — this location's own gates line up with the country-level answer.</p>`
    : "";

  return (
    `<div class="gate-provenance">` +
    `<p class="gate-provenance-label">This location</p>` +
    restingSentence +
    `<ul class="gate-list">${items.join("")}</ul>` +
    `</div>`
  );
}

// The expand content for the confidence-badge pull affordance above —
// source name/link plus the fact's dates, the pieces that used to render
// as separate, always-visible elements next to the badge.
//
// Date vocabulary, a hard rule across every surface: `date` is when the
// figure was true or the rule took effect; "checked" is only ever said
// from `last_verified_date`, and a fact without one makes no check claim
// at all. The two nouns `dated` / `checked` are the same two the Sources
// chapter uses (dateChip()/factDateTags(), js/location.js), so the two
// surfaces name one field pair with one vocabulary.
export function sourceDetailHtml(fact) {
  if (fact.value_raw === "[GAP]") return "";
  const src = fact.source_url
    ? `<a href="${escapeHtml(fact.source_url)}" target="_blank" rel="noopener">source link</a>`
    : "Source noted — no link available yet";
  const parts = [src];
  if (fact.date) parts.push(`dated ${escapeHtml(fact.date)}`);
  if (fact.last_verified_date) parts.push(`checked ${escapeHtml(fact.last_verified_date)}`);
  return parts.join(" · ");
}

// Delegated once, here, so every page gets the toggle just by importing
// this module — no per-page wiring. The detail panel is expected to be the
// next sibling element (a `.source-detail`) right after the `.fact-meta`
// block the clicked badge lives in.
if (typeof document !== "undefined") {
  const toggleSourceDetail = (badge) => {
    const metaRow = badge.closest(".fact-meta");
    const detail = metaRow ? metaRow.nextElementSibling : null;
    if (!detail || !detail.classList.contains("source-detail")) return;
    const open = detail.classList.toggle("open");
    badge.setAttribute("aria-expanded", open ? "true" : "false");
  };
  document.addEventListener("click", (e) => {
    const badge = e.target.closest(".fact-meta .badge[data-toggle-source]");
    if (badge) toggleSourceDetail(badge);
  });
  document.addEventListener("keydown", (e) => {
    if (!isActivationKey(e)) return;
    const badge = e.target.closest(".fact-meta .badge[data-toggle-source]");
    if (!badge) return;
    e.preventDefault();
    toggleSourceDetail(badge);
  });
}

export function sourceLine(fact) {
  if (fact.value_raw === "[GAP]") return "";
  if (fact.source_url) {
    return `<a class="source-link" href="${escapeHtml(fact.source_url)}" target="_blank" rel="noopener">source</a>`;
  }
  // Data-contract rule: a null source_url still means a source exists, just
  // nothing to click yet — never rendered as if there were no source at all.
  return `<span class="source-onfile">Source noted — no link available yet</span>`;
}

export function divergenceBadge(fact) {
  if (!fact.divergence_flag || fact.divergence_flag === "N/A") return "";
  const map = {
    "Confirmed-matches": ["div-match", "Confirmed: the written rule matches what happens in practice"],
    "Confirmed-diverges": ["div-diverge", "Confirmed: the written rule does not match what happens in practice"],
    "Not yet checked": ["div-unchecked", "Not yet checked against real-world practice"],
  };
  const [cls, label] = map[fact.divergence_flag] || ["div-unchecked", fact.divergence_flag];
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

// ---------------------------------------------------------------------
// Part 26: the location search — a jump-to-place component over
// data.js's own 38 locations / 21 covered countries. One shared
// component (this function), rendered on both the map and lists
// surfaces; the only per-surface difference is the on-select handler,
// passed in by the caller (map.js and lists.js each own the mechanics of
// what "go there" means on their own surface — zoom+teaser vs.
// scroll+highlight). Zero storage keys, zero network calls: every name/
// count rendered here is computed from `store` at call time, never
// persisted and never hardcoded (26.8).
// ---------------------------------------------------------------------

// Unicode NFD normalize + strip combining marks — case-insensitive,
// diacritic-folded matching (26.3): "atitlan" finds Atitlán, "merida"
// finds Mérida.
function foldForSearch(str) {
  return String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// container: an empty element already in the DOM (a static placeholder
// slot, same idiom as the #persona-slot the perspective line fills).
// handlers:
// { onSelectLocation(loc), onSelectCountry(country) } — the caller's own
// surface-specific "go there" behavior (26.5/26.6); this function never
// navigates or re-renders anything outside the box it just built.
export function initLocationSearch(container, store, handlers = {}) {
  const { onSelectLocation, onSelectCountry } = handlers;

  const countryLocationCounts = new Map();
  for (const loc of store.locations) {
    countryLocationCounts.set(loc.country_id, (countryLocationCounts.get(loc.country_id) || 0) + 1);
  }
  const candidates = [
    ...store.locations.map((loc) => ({
      kind: "location",
      loc,
      country: store.countriesById.get(loc.country_id),
      name: loc.display_name,
      norm: foldForSearch(loc.display_name),
    })),
    ...store.countries.map((country) => ({
      kind: "country",
      country,
      name: country.name,
      norm: foldForSearch(country.name),
      count: countryLocationCounts.get(country.country_id) || 0,
    })),
  ];
  const totalLocations = store.locations.length;
  const totalCountries = store.countries.length;

  container.innerHTML = `
    <div class="location-search">
      <label for="location-search-input">Find a place or country:</label>
      <input type="text" id="location-search-input" class="location-search-input"
        role="combobox" aria-expanded="false" aria-controls="location-search-results"
        aria-autocomplete="list" autocomplete="off" spellcheck="false">
      <p class="location-search-message" id="location-search-message" hidden></p>
      <ul class="location-search-results" id="location-search-results" role="listbox" hidden></ul>
      <p class="visually-hidden" id="location-search-live" aria-live="polite"></p>
    </div>
  `;
  const input = container.querySelector("#location-search-input");
  const messageEl = container.querySelector("#location-search-message");
  const resultsEl = container.querySelector("#location-search-results");
  const liveEl = container.querySelector("#location-search-live");

  let currentMatches = [];
  let highlightedIndex = -1;
  // Escape's two-stage behavior (26.4): first press hides whatever's
  // showing without touching the typed text; a second press (already
  // collapsed) clears the text itself. Reset to false by any input event,
  // so typing again always reopens.
  let collapsed = false;

  function matchesFor(query) {
    const q = foldForSearch(query);
    if (!q) return [];
    const found = candidates.filter((c) => c.norm.includes(q));
    // 26.3: prefix matches before mid-string matches; locations before
    // countries within each of those groups; alphabetical within that.
    found.sort((a, b) => {
      const aPrefix = a.norm.startsWith(q) ? 0 : 1;
      const bPrefix = b.norm.startsWith(q) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      const aKind = a.kind === "location" ? 0 : 1;
      const bKind = b.kind === "location" ? 0 : 1;
      if (aKind !== bKind) return aKind - bKind;
      return a.name.localeCompare(b.name);
    });
    return found;
  }

  function displayLabel(c) {
    return c.kind === "location"
      ? `${c.name} — ${c.country ? c.country.name : ""}`
      : `${c.name} — ${c.count} place${c.count === 1 ? "" : "s"}`;
  }

  function updateHighlight() {
    const items = [...resultsEl.querySelectorAll(".location-search-result")];
    items.forEach((li, i) => {
      const isHigh = i === highlightedIndex;
      li.classList.toggle("highlighted", isHigh);
      li.setAttribute("aria-selected", isHigh ? "true" : "false");
    });
    if (highlightedIndex >= 0 && items[highlightedIndex]) {
      input.setAttribute("aria-activedescendant", items[highlightedIndex].id);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function activate(c) {
    input.value = "";
    currentMatches = [];
    highlightedIndex = -1;
    collapsed = true;
    render();
    if (c.kind === "location" && onSelectLocation) onSelectLocation(c.loc);
    else if (c.kind === "country" && onSelectCountry) onSelectCountry(c.country);
  }

  function render() {
    resultsEl.innerHTML = "";
    resultsEl.hidden = true;
    messageEl.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");

    if (collapsed) return;

    const q = input.value.trim();
    if (!q) {
      // S2: a quiet hint, only while the input actually has focus — a
      // blurred empty box shows nothing (26.7).
      if (document.activeElement === input) {
        messageEl.hidden = false;
        messageEl.textContent = `${totalLocations} places in ${totalCountries} countries on file — type a name.`;
      }
      return;
    }

    currentMatches = matchesFor(q);
    if (currentMatches.length === 0) {
      messageEl.hidden = false;
      // S3 + S4 (26.7): S4 links contact.html, which exists as of the
      // same build chain this Part ships in.
      messageEl.innerHTML =
        `Nothing on file matches '${escapeHtml(q)}'. This site covers ${totalLocations} places in ${totalCountries} countries. ` +
        `<a href="${withPersona(siteUrl("contact.html"))}">Want somewhere researched? Ask us.</a>`;
      liveEl.textContent = "no matches";
      return;
    }

    const shown = currentMatches.slice(0, 8);
    resultsEl.hidden = false;
    input.setAttribute("aria-expanded", "true");
    shown.forEach((c, i) => {
      const li = document.createElement("li");
      li.id = `location-search-option-${i}`;
      li.setAttribute("role", "option");
      li.className = "location-search-result" + (i === highlightedIndex ? " highlighted" : "");
      li.setAttribute("aria-selected", i === highlightedIndex ? "true" : "false");
      // Real, individually focusable elements (not just a roving
      // aria-activedescendant target) — 26.4's own requirement, so
      // Tab-through works without the arrow-key pattern too.
      li.tabIndex = 0;
      li.textContent = displayLabel(c);
      // stopPropagation is load-bearing here, found live not assumed: a
      // result click bubbles to `document` same as any click, and the
      // map's own pre-existing "click outside a pin closes the teaser"
      // listener (map.js's wireMapInteractions()) would otherwise see
      // this exact click one tick after activate() -> onSelectLocation()
      // just opened a teaser, and immediately close it again in the same
      // event dispatch. Confined to this one click, not a general
      // document-click suppression.
      li.addEventListener("click", (e) => { e.stopPropagation(); activate(c); });
      li.addEventListener("keydown", (e) => { if (isActivationKey(e)) { e.preventDefault(); activate(c); } });
      li.addEventListener("mouseenter", () => { highlightedIndex = i; updateHighlight(); });
      resultsEl.appendChild(li);
    });
    // S5 (26.3): a computed overflow line, never copy that can go stale.
    if (currentMatches.length > 8) {
      const li = document.createElement("li");
      li.className = "location-search-overflow";
      li.setAttribute("aria-hidden", "true");
      li.textContent = `${currentMatches.length - 8} more match — keep typing.`;
      resultsEl.appendChild(li);
    }
    if (highlightedIndex >= 0 && highlightedIndex < shown.length) {
      input.setAttribute("aria-activedescendant", `location-search-option-${highlightedIndex}`);
    }
    // 26.4: the visually-hidden live region, announced on every change.
    liveEl.textContent = `${currentMatches.length} match${currentMatches.length === 1 ? "" : "es"}`;
  }

  input.addEventListener("input", () => {
    collapsed = false;
    highlightedIndex = -1;
    render();
  });
  input.addEventListener("focus", () => {
    collapsed = false;
    render();
  });
  input.addEventListener("keydown", (e) => {
    const optionCount = Math.min(currentMatches.length, 8);
    if (e.key === "ArrowDown") {
      if (!optionCount) return;
      e.preventDefault();
      highlightedIndex = highlightedIndex < optionCount - 1 ? highlightedIndex + 1 : 0;
      updateHighlight();
    } else if (e.key === "ArrowUp") {
      if (!optionCount) return;
      e.preventDefault();
      highlightedIndex = highlightedIndex > 0 ? highlightedIndex - 1 : optionCount - 1;
      updateHighlight();
    } else if (e.key === "Enter") {
      // Enter activates the highlighted result, or the FIRST result when
      // none is highlighted (26.4's own fast path); zero results does
      // nothing — the no-match line already on screen says why.
      if (!optionCount) return;
      e.preventDefault();
      const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
      activate(currentMatches[idx]);
    } else if (e.key === "Escape") {
      if (!collapsed) {
        collapsed = true;
        render();
      } else if (input.value) {
        input.value = "";
        highlightedIndex = -1;
        render();
      }
    }
  });
  // 26.2: Escape here never reaches the door — the door isn't in the DOM
  // at all while search is reachable (it only ever renders as an
  // overlay, closed before this component's own container exists in the
  // flow), so no explicit stopPropagation is needed for that guarantee.
  container.addEventListener("focusout", (e) => {
    if (!container.contains(e.relatedTarget)) {
      collapsed = true;
      render();
    }
  });
}
