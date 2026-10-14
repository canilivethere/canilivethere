// CanILiveThere — the door. One box, one process, and submit opens the map.
//
// DOOR V2. What changed and why, because the shape of this file is the
// whole point:
//
//   BEFORE: three wing cards — "Your passport", "Your priorities", "Your
//   numbers" — three separate entries into three separate flows, each
//   ending its own way. A reader's passport, priorities and numbers are
//   one job, and the door asked them as three, joined by "or".
//
//   AND AS OF 2026-10-12: the middle step is GONE. Cap's ruling, his
//   typed words — "remove preferences cleanly now, they come back later
//   when built properly" — retires the priorities questionnaire AND the
//   stored weight vector it wrote. "Later when built properly" has no
//   date, no owner and no dormant code path waiting for it in this file:
//   there is no hidden branch, no orphaned key and no count that still
//   expects a third screen.
//
//   NOW: one entry card, "Be you", opening one two-step process —
//   numbers, then passport. Every step is
//   skippable and nothing is mandatory. One submit, "See the world",
//   which closes the box in place and re-renders the map underneath from
//   what the reader gave. No second page, no result screen, no dead end.
//
//   AND THE PART THE SHORTHAND DROPS: the profile BAR goes; the eight
//   worked examples DO NOT. They stay exactly where they were, open,
//   below the entry card, at the same size, with the same portraits and
//   the same descriptors — the secondary, exploratory option this shape
//   needs. A reader who came to see a worked example must not have to
//   scroll past a form to find one.
//
// index.html-only by construction: this module is only ever imported by
// js/map.js, which only index.html loads. Every other page reaches the
// door through the corner control, which navigates here with ?reopen=1.
//
// Reads the SAME source as everything else that names the eight
// (VALID_PERSONAS order + the shared descriptor strings, both in
// app-shared.js) — one true source, several renderings.

import {
  VALID_PERSONAS, personaDescriptorSentence, withPersona, escapeHtml, isActivationKey,
  loadNationality, saveNationality, loadSavedPerspective, saveSavedPerspective,
  setExplicitGeneral, clearExplicitGeneral,
  hasAnySavedReaderState, wireForgetControl,
  isDoorAnswered, markDoorAnswered, loadOwnNumbers,
  saveOwnNumbersForVisit, saveOwnNumbers, readerKeepsOnDevice,
  keepBlockHtml, wireKeepBlock,
  CUSTOM_TILE_ICON, REOPEN_FLAG,
} from "./app-shared.js";
import { loadStore } from "./data.js";
import { createOwnNumbersStep } from "./own-numbers.js";
// The engine half's own convertAmount(), not a second hand-typed rate —
// see waldoReferenceBandNote() below.
import { convertAmount } from "./own-numbers-data.js";
import { ISO_COUNTRY_NAMES } from "./iso-names.js";
import { siteUrl } from "./site-root.js";

// Retired as a show/don't-show gate; the only remaining code that reads
// this name is the one-line deletion below.
const DOOR_SEEN_KEY = "door-seen";

// Part 34.3: the site identity the hidden topbar carries while the door
// is open. Static text, never a link — a brand link from an open,
// unanswered door reloads index.html, which re-summons the door.
const DOOR_BRAND_LINE = "CanILiveThere";

// REPLACED. The shipped line opened "A visa rule, a rent number, a safety
// record — they read the same to everyone" and then offered the reader
// three things joined by "or". It was built on a false premise: a visa
// rule does not read the same to everyone — a passport is exactly what
// makes it read differently. The replacement states the offer and the reward, names what
// it asks for as one process rather than a set of choices, and says up
// front that every part of it is optional.
// FOUR WORDS OUT with the middle step ("what matters to you and"), and
// nothing else touched: the line's ruled structure — offer, reward,
// everything optional — is intact, and so is the premise above.
const WELCOME_LINE =
  "Want to see the world as it looks for you? Tell the site what you live on and what passport you hold — as much or as little as you like — and the map opens for you.";
const ESCAPE_HATCH_LABEL = "See the facts as they are.";

// The one entry card. "Be you" is one half of a two-part choice — be
// you, or be one of the friendly neighbourhood test profiles — and the
// persona row below is the other half, which is why neither needs to
// explain the other.
const ENTRY_CARD_LABEL = "Be you";
// A two-item list takes "and", not a comma: "What you live on, your
// passport" reads as a list with a word missing. "every step optional"
// STAYS — it is true of two steps as of three, and "both steps" would be
// a second edit buying nothing.
const ENTRY_CARD_SUBLINE =
  "What you live on and your passport — one quick process, every step optional. Nothing you enter leaves this browser.";

// Unchanged: it already reads as the alternative.
const PERSONA_ROW_HEADING = "Or compare against eight worked examples — fictional people, real rules.";

// The two step headings. The position is carried
// inline in the heading, never as a separate progress element. A count in
// a heading that disagrees with the flow is the plainest form of the
// "a control's promise counts as a claim" defect, so these move in the
// same commit as the step.
const STEP_HEADINGS = [
  "Your numbers — 1 of 2",
  "Your passport — 2 of 2",
];

// The step controls, at equal reading weight. "Skip
// this" is never disabled: a step the reader skips commits nothing for
// that dimension, and the site uses the general figures for it.
// ONE DEFINITION OF "WHICH STEP IS THE LAST ONE", because three literal
// 3s in three functions is how a step count goes stale in one place and
// not the others — which is precisely the defect the heading count was.
const LAST_STEP = STEP_HEADINGS.length;
const NEXT_LABEL = "Next";
const SKIP_LABEL = "Skip this";
const SUBMIT_LABEL = "See the world";
const SKIP_AND_SUBMIT_LABEL = "Skip this and see the world";
const BACK_LABEL = "‹ Back";

// Step 3's interior — the passport picker, transported verbatim.
const PASSPORT_BOX_SCOPE = "One real thing about you, and the entry rules on this site re-read themselves around it.";
const DUAL_CITIZEN_LINE = "Holding more than one passport? Check each — the better answer wins.";
const PASSPORT_ABSENCE_BEFORE = "Don't see your passport? We haven't verified its rules yet — tell us at ";
const PASSPORT_ABSENCE_LINK_TEXT = "our contact page";
const PASSPORT_ABSENCE_AFTER = " and we'll research it.";
const PASSPORT_MORE_LINE = "That's the whole form — one passport, nothing else about you.";
const PASSPORT_SCOPE_FOOTER = "This reads entry rules from your passport — nothing more.";
const PASSPORT_PLACEHOLDER_OPTION = "Choose a passport…";

// REWORDED. The old label — "Forget
// what I've saved here" — was true in one of the control's two states: with
// the keep switch off, nothing was ever saved, and the control offered to
// forget something that does not exist. The control still does real work in
// both states (forgetReaderPreferences() clears the sessionStorage envelope
// as well as the localStorage one), so this is a wording fix and not a
// render-condition one. The new label names what the reader GAVE rather
// than where it went, so it carries no storage claim to be wrong about in
// either state. "Answers" is the site's own word for these four things
// already (READER_ANSWER_KEYS, writeReaderAnswer()).
//
// THE SAME STRING LIVES AT THREE SITES and they move together or the site
// ships two names for one control: here, the footer's own hardcoded copy
// (app-shared.js renderFooter), and wireForgetControl()'s confirm text,
// which reads this first-state label out of the DOM.
const FORGET_LABEL = "Forget my answers";
const SWITCH_LABEL = "Switch or start over";

// REWORDED — the return greeting. "Your saved view" described the band;
// "Welcome back." greets the reader, which is the point of a greeting.
// The state sentence below it is unchanged — a fact ABOUT
// the reader, never an instruction FROM the site. "Want to make changes?"
// is not asked in words because the entry card and the eight tiles are
// sitting directly beneath it, pre-filled: the box IS the change surface.
const RESUME_KICKER_LABEL = "Welcome back.";
const RESUME_CONTINUE_LABEL = "Continue where you left off";

// THE KEEP SWITCH NOW RENDERS IN TWO PLACES, so its five strings and its
// builder MOVED OUT of this file and into js/app-shared.js — the module
// both surfaces already import. The rule is FORGET_LABEL's own, directly
// above: the same string living at two sites moves together, or the site
// ships two names for one control. The door's own copy of the block
// stays, deliberately — a reader inside the box should not have to leave
// it to keep what they just typed — and the SECOND home, on the map, is
// what finally makes step 1's promise true ("a switch you turn on
// yourself, after you've seen the map").
//
// The two headings that used to be defined here are KEEP_HEADING and
// KEEP_HEADING_KEPT in app-shared.js, verbatim, with their arguments
// intact: the first is false in neither state because it names "answers"
// rather than figures, and the second exists because un-ticking un-saves,
// so the control has to stay on screen once ticked.

function portraitSrc(id) {
  return `assets/portraits/${id}.png`;
}

function personaDisplayName(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

// 25.2: ?persona= deep links still bypass the door — an explicit signal
// beats the ritual. clt-door-answered (sessionStorage, set by every
// completion path) is the visit-scoped "already met the door" state.
function shouldShowDoor() {
  const params = new URLSearchParams(location.search);
  if (params.has("persona")) return false;
  return !isDoorAnswered();
}

// §8AA.1/25.4: the compound phrase the resume band names in two places.
// Every saved dimension named at once — a reader who saved a passport and
// picked a worked example sees both named, not just one. Also names
// figures, because under one process figures are a dimension of the same
// answer and a band that silently omitted them would under-describe what
// the reader has on this device.
//
// THE `priorities` LENS KIND IS GONE, with the step and the stored vector:
// this function is what stopped reporting it, and it is what makes the
// empty own-lens state in js/reader-lens.js reachable rather than
// hypothetical — the descriptor stops naming a priorities lens while
// `saved_perspective: "custom"` goes on resolving the reader into their
// own lens. Those two facts sit in different files and only meet on
// screen; H8 over there is the guard.
function savedPerspectiveDescriptor() {
  const savedPersp = loadSavedPerspective();
  const nationality = loadNationality();
  const nationalityName = nationality ? ISO_COUNTRY_NAMES[nationality.code] : null;

  let lensKind = null;
  let personaName = null;
  if (savedPersp && savedPersp.kind === "persona" && VALID_PERSONAS.includes(savedPersp.persona_id)) {
    lensKind = "persona";
    personaName = personaDisplayName(savedPersp.persona_id);
  }

  if (!lensKind && !nationalityName) return null;
  return { lensKind, personaName, nationalityName };
}

// THE INDEFINITE ARTICLE, because "a Ireland passport" shipped and a
// stranger read it. The country name is interpolated from the vendored
// CLDR list, so the article has to be chosen at runtime from the name.
//
// The rule, boring on purpose: a vowel LETTER takes "an", except names
// beginning with U, which in English almost all open on a "yoo" sound and
// take "a" — "a United States passport", "a Uruguay passport", "a U.S.
// Virgin Islands passport". Measured against the shipped list: 250 names,
// 42 vowel-initial, 9 of them U-initial.
//
// UZBEKISTAN IS THE ONE EXCEPTION IN THE WHOLE LIST — it opens on a true
// vowel sound ("uz-"), so the U rule would get it wrong. Named explicitly
// rather than handled by a cleverer heuristic: one entry is auditable and
// a phonetic guesser is not. Anything else here is a pronunciation
// question, not a code question, and belongs to whoever writes the copy.
const NATIONALITY_AN_EXCEPTIONS = new Set(["Uzbekistan"]);
function nationalityArticle(name) {
  if (!name) return "a";
  const first = name.charAt(0).toUpperCase();
  if (NATIONALITY_AN_EXCEPTIONS.has(name)) return "an";
  if (first === "U") return "a";
  return "AEIOU".includes(first) ? "an" : "a";
}

// 29.2B/29.2D: the shared fragment+verb pair every resume-band string is
// built from — one branch per saved combination.
function resumeStateParts(descriptor) {
  const { lensKind, personaName, nationalityName } = descriptor;
  const art = nationalityArticle(nationalityName);
  if (lensKind === "persona" && nationalityName) {
    return { fragment: `${personaName}'s example and ${art} ${nationalityName} passport`, verb: "are" };
  }
  if (lensKind === "persona") {
    return { fragment: `${personaName}'s example`, verb: "is" };
  }
  // The two `priorities` branches are DELETED — "Your own priorities and a
  // <Country> passport are here for this visit" and its solo twin. They
  // were a REPORT of what the device was holding rather than a promise, so
  // they were right to survive the step on their own; they do not survive
  // the stored vector going with it. The passport-only branch below
  // already serves what is left.
  if (nationalityName) {
    return { fragment: `${art === "an" ? "An" : "A"} ${nationalityName} passport`, verb: "is" };
  }
  return null;
}

// TWO VARIANTS, keyed on the switch. The single
// shipped sentence — "... is saved on this device." — was true only with the
// keep switch ON, which is not the default and not the state most readers
// who see this band are in: the band renders from savedPerspectiveDescriptor(),
// whose loaders read the visit copy first. With the switch off, every named
// dimension lives in sessionStorage and goes when the visit does.
//
// NO NEW BRANCH IN resumeStateParts(). The horizon clause moved to the keep
// switch's own heading (KEEP_HEADING_KEPT, now in app-shared.js), which withdrew the
// `is`->`it` / `are`->`them` pronoun the first draft of this sentence needed.
// All that changes here is which of two literal tails the existing template
// takes. buildResumeAriaFragment() below uses the fragment alone and is
// untouched by either variant.
function buildResumeStateSentence(descriptor) {
  const parts = resumeStateParts(descriptor);
  if (!parts) return null;
  return readerKeepsOnDevice()
    ? `${parts.fragment} ${parts.verb} kept on this device.`
    : `${parts.fragment} ${parts.verb} here for this visit.`;
}

function buildResumeAriaFragment(descriptor) {
  const parts = resumeStateParts(descriptor);
  return parts ? parts.fragment : null;
}

function markSeenLegacyKeyRemoved() {
  // §8AA.4: delete on sight, not "ignore forever".
  try { localStorage.removeItem(DOOR_SEEN_KEY); } catch (e) {}
}

// THE STAND-IN BAND ON WALDO'S TILE.
//
// WHAT IT IS. It IS Waldo's figure now. The persona record holds the euro
// band itself — €3,850/month gross — and the dollar figure his map is
// computed from is DERIVED from it, at one named rate (EUR->USD, as_of
// 2026-10-12, the same fx_rates row this site already reads), rather than
// recorded separately.
//
// THE SEQUENCING NOTE THAT STOOD HERE IS CLOSED, AND THE CLOSURE IS THE
// POINT: it warned that the published export predated the record's move
// and so still computed Waldo at the earlier dollar figure, with the
// exporters "the step after this one". They have run. The export in this
// tree was generated after the move (verdicts.jsonl generated_at
// 2026-10-13T16:12:32Z) and derived/profiles.jsonl ships Waldo at
// income_monthly_usd 4301 — so tile and export now read the same record
// and no reader sees two figures. The old note's closing principle
// outlives the window it described and is kept: nothing here compensates
// for an export by hand, because a tile that quietly disagreed with the
// record to match a stale export would be the harder defect to find.
//
// SUPERSEDED, KEPT SO THE CHANGE IS LEGIBLE: this comment used to say the
// record held $2,500/month, that the band on this tile was NOT Waldo's
// figure "and must never be read as one", and that the record moving to a
// euro figure was "a confirmed follow-on and not this crossing". The
// follow-on IS this crossing — the record moved first and this tile was
// left behind, which made its two framing clauses false rather than
// merely dated: "for scale" existed only because the band was somebody
// else's number, and the closer said his map was "still read from his
// recorded figure above, not from this band" when the band is what it is
// read from. Both are gone from the copy below, replaced wholesale.
//
// WHOSE NUMBER IT IS — UNCHANGED, AND IT HAD TO BE. €3,850 a month, gross,
// is the EU27 professionals band, Eurostat, 2022. It is on the tile as the
// nearest MEASURED stand-in, which is still the whole label: nobody
// measures remote workers, so his figure is a measurement of that band and
// never of a person. The figure and its scope were sourced by a
// researcher; nothing here looked one up.
//
// THE DOLLARS ARE DERIVED, NOT RECORDED — the euro figure is the record.
// The conversion is stated to the dollar because it is arithmetic on one
// named rate, not a second measurement.
//
// LIVE READ, the conversion crossing. The debt this comment
// used to name here — a baked copy of the fx_rates row's own rate,
// because nothing on this site fetched that row client-side — is paid:
// js/data.js now fetches derived/rules.jsonl and resolves it, and this
// function reads store.fxRates through the same convertAmount() the
// welcome box's own engine uses, rather than a second, hand-typed rate.
// Stated to the dollar, no decimals, no "≈" — the precedent this
// site already sets just above ("arithmetic on one named rate, not a
// second measurement"). Falls to the site's own non-guess sentence when
// the rate on file can't be trusted (row absent, pair missing, or stale)
// rather than asserting a dollar figure it can't back.
function waldoReferenceBandNote(fxRates) {
  const lead = "Waldo's figure is €3,850 a month, gross — before tax. "
    + "Nobody measures remote workers, so the site uses the nearest measured stand-in: "
    + "the EU27 professionals band (Eurostat, 2022). ";
  const converted = convertAmount(fxRates, 3850, "EUR", "USD");
  const derived = converted
    ? `About $${Math.round(converted.amount).toLocaleString("en-US")} a month, derived at the rate on file. `
    : "The site has no exchange rate on file it can convert this at today. ";
  return lead + derived + "It is a measurement of that band, not of a person.";
}
function personaReferenceBand(id, fxRates) {
  return id === "waldo" ? waldoReferenceBandNote(fxRates) : null;
}

// Async since the conversion crossing: Waldo's tile now
// reads store.fxRates for its band rather than a baked figure, and the
// store is behind loadStore()'s own promise. loadStore() is memoized, so
// every call after the map's first render resolves immediately; this
// awaits it rather than reaching for a synchronous cache this file would
// have to invent and keep in step with the real one.
async function tilesHtml() {
  const store = await loadStore();
  // Eight named personas, unchanged order/size/portraits/descriptors.
  return VALID_PERSONAS.map((id) => {
    const name = personaDisplayName(id);
    const sentence = personaDescriptorSentence(id);
    const band = personaReferenceBand(id, store.fxRates);
    const bandHtml = band ? `<span class="door-tile-band">${escapeHtml(band)}</span>` : "";
    return `
      <button type="button" class="door-tile" data-persona="${id}">
        <span class="door-portrait"><img class="door-portrait-img" src="${portraitSrc(id)}" alt="" loading="lazy"></span>
        <span class="door-name">${escapeHtml(name)}</span>
        <span class="door-descriptor">${escapeHtml(sentence)}</span>
        ${bandHtml}
      </button>
    `;
  }).join("");
}

// THE RETIRED STEP'S WHOLE INTERIOR STOOD HERE: questionRowHtml(), the
// seven forced-choice questions (CUSTOM_QUESTIONS), the four tier choices
// (TIER_CHOICES) and the step's three lead paragraphs (PRIORITIES_SCOPE,
// PRIORITIES_HONESTY, PRIORITIES_BOUNDARY).
//
// RETIRED, NOT REWORDED, and no part of it moves to another screen:
// there is no ruling for a priorities surface anywhere else on this site,
// and inventing one would be a new mechanism inside a removal. The words
// are not kept here as a commented-out block either — they are in the
// file's history and in the copy spec this build worked from, which is
// where a retired string belongs.

/**
 * Summon (and own) the door.
 *
 * @param onCommit  called after "See the world" closes the box in place,
 *                  so the map underneath can re-render from what the
 *                  reader just gave. Owned by js/map.js — this module
 *                  navigates nothing on that path.
 * @returns { open } — the corner control's handle.
 */
export function initPerspectiveDoor({ onCommit } = {}) {
  markSeenLegacyKeyRemoved();

  const params = new URLSearchParams(location.search);
  // The corner control's one-shot flag, in the exact
  // shape the retired ?edit-priorities=1 flag had — read once, stripped
  // from the URL, never stored, carrying no reader data of any kind.
  const reopenRequested = params.get(REOPEN_FLAG) === "1";
  // THE ?edit-priorities=1 ENTRY IS GONE, with the step it opened. It was
  // already a legacy flag — set by an "Edit your answers" control that
  // retired before it did — and it is not re-pointed at the main screen,
  // because a flag that silently means something else is a worse artefact
  // than one that means nothing.
  //
  // READER-VISIBLE CONSEQUENCE, FLAGGED WITH NO COPY PROPOSED: a
  // bookmarked ?edit-priorities=1 link now lands on the box's main
  // screen, with the unknown parameter left in the address bar until the
  // reader's first internal click (every internal link is rebuilt by
  // withPersona(), which carries only the persona). No explanatory
  // sentence is added: a stripped URL flag is not a reader surface, and
  // apologising for a link the reader does not remember using is noise.

  if (reopenRequested) {
    // Strip the one-shot flag so a later reload doesn't reopen unasked.
    try {
      const url = new URL(location.href);
      url.searchParams.delete(REOPEN_FLAG);
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch (e) {}
  }

  const mapRoot = document.getElementById("map-root");
  let overlay = null;
  let panel = null;

  // The reader's answers for THIS pass through the process, held in
  // memory and committed at flow exit (Part 35's commit-on-exit). A step
  // the reader skipped leaves its slot null and commits nothing, which is
  // what makes "the site uses the general figures for it" literally true
  // rather than a claim about an empty write.
  let flow = { numbers: null, nationality: null };

  function fog() {
    if (mapRoot) mapRoot.classList.add("map-fogged");
    document.body.classList.add("door-open");
  }
  function unfog() {
    if (mapRoot) mapRoot.classList.remove("map-fogged");
    document.body.classList.remove("door-open");
  }

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "perspective-door";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Tell the site who's asking");
    overlay.innerHTML = `<div class="door-panel" id="door-panel" tabindex="-1"></div>`;
    document.body.appendChild(overlay);
    panel = overlay.querySelector("#door-panel");
    // Escape dismisses via the same no-lens path as the escape hatch,
    // whichever screen is showing. Full focus-trap looping is NOT built
    // here — named as a gap rather than silently left unstated.
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); leaveWithoutLens(); }
    });
  }

  function closeInPlace() {
    if (overlay) { overlay.remove(); overlay = null; panel = null; }
    unfog();
  }

  // ------------------------------------------------------------------
  // Flow exit — the one place anything the reader gave is written.
  // ------------------------------------------------------------------
  function commitFlow() {
    let committed = false;
    if (flow.numbers) {
      // The VISIT-scoped write. Durable keeping is the reader's own
      // switch, on the main screen, after they have seen the map — which
      // is exactly what the privacy paragraph on step 1 promises.
      saveOwnNumbersForVisit(flow.numbers);
      // ...but if the reader ALREADY turned that switch on, new figures
      // replace the kept ones. Without this, a reader who saved, came
      // back and changed their income would leave the OLD figures on the
      // device while the switch showed unticked — kept without knowing
      // it, which is F2's defect wearing different clothes. The answered
      // fields only; the durable copy owns its own timestamps.
      if (readerKeepsOnDevice()) {
        saveOwnNumbers({
          amount: flow.numbers.amount,
          currency: flow.numbers.currency,
          period: flow.numbers.period,
          income_type: flow.numbers.income_type,
          duration_band: flow.numbers.duration_band,
          ...(flow.numbers.property_capital ? { property_capital: flow.numbers.property_capital } : {}),
        });
      }
      committed = true;
    }
    if (flow.nationality) {
      saveNationality(flow.nationality);
      committed = true;
    }
    if (committed) {
      saveSavedPerspective("custom", null);
      clearExplicitGeneral();
    }
    flow = { numbers: null, nationality: null };
    return committed;
  }

  // "See the world" — the one submit. Commits, closes in place, and hands
  // the map back to js/map.js to re-render. A reload would paint the old
  // map for a frame before the reader's own one arrived; a reveal does
  // not, and the reveal is the point.
  function seeTheWorld() {
    commitFlow();
    markDoorAnswered();
    closeInPlace();
    // The map re-renders either way. A reader who gave nothing at all
    // lands exactly where the escape hatch lands — the disclosed no-lens
    // map — and the perspective line says so in its own words.
    if (typeof onCommit === "function") onCommit();
  }

  // Escape, and the escape hatch. Keeps whatever was explicitly answered
  // (Part 35.1's own ruling) and then goes to the disclosed no-lens map.
  // A reader with nothing saved and nothing answered writes nothing at
  // all — zero writes, which is the check Part 35.10 item 1 states.
  function leaveWithoutLens() {
    const committed = commitFlow();
    const priorSaved = loadSavedPerspective();
    const hadLensToSetAside = !committed && (loadOwnNumbers()
      || (priorSaved && priorSaved.kind === "persona" && VALID_PERSONAS.includes(priorSaved.persona_id)));
    markDoorAnswered();
    if (hadLensToSetAside) {
      // Viewing plainly and forgetting permanently are two different
      // acts: the lens is set aside for this visit, not deleted, and the
      // perspective line says so in those words.
      saveSavedPerspective("none", null);
      setExplicitGeneral();
      location.href = location.pathname + location.hash;
      return;
    }
    closeInPlace();
    if (typeof onCommit === "function") onCommit();
  }

  // ------------------------------------------------------------------
  // Screen: the main screen
  // ------------------------------------------------------------------
  async function renderMainScreen() {
    const descriptor = savedPerspectiveDescriptor();
    const stateSentence = descriptor ? buildResumeStateSentence(descriptor) : null;
    const ariaFragment = descriptor ? buildResumeAriaFragment(descriptor) : null;
    // F2: the switch renders whenever there are figures in play at all,
    // not only while they are visit-only. The old condition made the
    // control delete itself the instant it was used — it asked "are these
    // figures visit-only?", which a successful save makes false — so
    // there was no untick to wire and a stranger's income went durable
    // one-way. (That predicate is gone; see app-shared.js's note.)
    // The render condition — only while there is something to keep — moved
    // inside keepBlockHtml(), so the door and the map cannot disagree
    // about when a switch that keeps nothing is a dead control.
    const keepBlock = keepSwitchHtml();
    const forgetBtn = hasAnySavedReaderState()
      ? `<button type="button" class="door-link-btn" id="door-forget-resume">${escapeHtml(FORGET_LABEL)}</button>`
      : "";

    const resumeHtml = descriptor
      ? `
        <div class="door-resume">
          <p class="door-resume-kicker">${escapeHtml(RESUME_KICKER_LABEL)}</p>
          <p class="door-resume-line">${escapeHtml(stateSentence)}</p>
          <button type="button" class="door-escape door-resume-continue" id="door-continue" aria-label="${escapeHtml(`${RESUME_CONTINUE_LABEL} — ${ariaFragment}`)}">${escapeHtml(RESUME_CONTINUE_LABEL)}</button>
          ${keepBlock}
          <div class="door-resume-controls">
            <button type="button" class="door-link-btn" id="door-switch">${escapeHtml(SWITCH_LABEL)}</button>
            ${forgetBtn}
          </div>
        </div>
      `
      // Figures carried for this visit are reader state but not a lens,
      // so they build no resume band. They still need both controls — the
      // one that keeps them and the one that clears them.
      : (keepBlock || forgetBtn)
        ? `
        <div class="door-resume">
          ${keepBlock}
          <div class="door-resume-controls">${forgetBtn}</div>
        </div>
      `
        : "";

    // Awaited here, not inlined: tilesHtml() is async as of the
    // conversion crossing (it reads store.fxRates for Waldo's band). loadStore() is memoized,
    // so this resolves on the next microtask in the ordinary case — the
    // map has already loaded the store by the time a reader opens the
    // door — never a network wait of its own.
    const tiles = await tilesHtml();

    panel.innerHTML = `
      <p class="door-brand">${escapeHtml(DOOR_BRAND_LINE)}</p>
      <p class="door-welcome">${escapeHtml(WELCOME_LINE)}</p>
      ${resumeHtml}
      <div class="door-wings door-wings-single" id="door-wings">
        <button type="button" class="door-wing" data-wing="be-you">
          <span class="door-portrait door-portrait-icon">${CUSTOM_TILE_ICON}</span>
          <span class="door-wing-label">${escapeHtml(ENTRY_CARD_LABEL)}</span>
          <span class="door-wing-subline">${escapeHtml(ENTRY_CARD_SUBLINE)}</span>
        </button>
      </div>
      <div class="door-persona-row">
        <p class="door-persona-row-heading">${escapeHtml(PERSONA_ROW_HEADING)}</p>
        <div class="door-tiles">${tiles}</div>
      </div>
      <button type="button" class="door-escape" id="door-escape">${escapeHtml(ESCAPE_HATCH_LABEL)}</button>
    `;

    // No entry ever renders a broken-image icon: a failed portrait load
    // removes the <img>, leaving the neutral circle showing through.
    panel.querySelectorAll(".door-portrait-img").forEach((img) => {
      img.addEventListener("error", () => img.remove());
    });

    panel.querySelectorAll(".door-tile[data-persona]").forEach((btn) => {
      const choose = () => {
        const persona = btn.dataset.persona;
        saveSavedPerspective("persona", persona);
        clearExplicitGeneral();
        markDoorAnswered();
        location.href = withPersona(location.pathname + location.hash, { persona });
      };
      btn.addEventListener("click", choose);
      btn.addEventListener("keydown", (e) => { if (isActivationKey(e)) { e.preventDefault(); choose(); } });
    });

    const entryCard = panel.querySelector('.door-wing[data-wing="be-you"]');
    const openFlow = () => renderStep(1);
    entryCard.addEventListener("click", openFlow);
    entryCard.addEventListener("keydown", (e) => { if (isActivationKey(e)) { e.preventDefault(); openFlow(); } });

    panel.querySelector("#door-escape").addEventListener("click", leaveWithoutLens);

    const continueBtn = panel.querySelector("#door-continue");
    if (continueBtn) {
      continueBtn.addEventListener("click", () => {
        clearExplicitGeneral();
        markDoorAnswered();
        const savedPersp = loadSavedPerspective();
        if (savedPersp && savedPersp.kind === "persona" && VALID_PERSONAS.includes(savedPersp.persona_id)) {
          location.href = withPersona(location.pathname + location.hash, { persona: savedPersp.persona_id });
        } else {
          closeInPlace();
          if (typeof onCommit === "function") onCommit();
        }
      });
    }
    const switchBtn = panel.querySelector("#door-switch");
    if (switchBtn) {
      switchBtn.addEventListener("click", () => {
        const wings = panel.querySelector("#door-wings");
        wings.querySelector(".door-wing")?.focus();
        wings.scrollIntoView({ block: "nearest" });
      });
    }
    const forgetResumeBtn = panel.querySelector("#door-forget-resume");
    if (forgetResumeBtn) {
      wireForgetControl(forgetResumeBtn, {
        onDone: () => { location.href = location.pathname + location.hash; },
      });
    }
    wireKeepSwitch();

    // 25.2: focus starts on the resume band's continue button when one
    // renders; a fresh visitor starts on the entry card. Part 31:
    // preventScroll, so native focus-scroll can't carry the welcome line
    // out of view on a short viewport.
    (continueBtn || panel.querySelector(".door-wing"))?.focus({ preventScroll: true });
  }

  // The durable-save switch. Off by default, always — the reader has to
  // reach for it, which is the strongest form the site's zero-backend
  // posture can take on the one field it would most like to keep.
  //
  // BUILT AND WIRED FROM app-shared.js NOW, because the same control also
  // renders on the map (see renderSlotInto() in js/reader-lens.js). The
  // door's instance keeps its own element ids, so the panel can hold both
  // the block and the forget button without either reaching the other's
  // nodes. NO HEADING HERE, deliberately: inside the box the block sits
  // under "Welcome back." in a panel that is entirely about the reader's
  // own state.
  const DOOR_KEEP_ID = "door-keep";
  const keepSwitchHtml = () => keepBlockHtml({ id: DOOR_KEEP_ID });
  const wireKeepSwitch = () => wireKeepBlock(panel, DOOR_KEEP_ID, renderMainScreen);

  // ------------------------------------------------------------------
  // The two steps
  // ------------------------------------------------------------------
  //
  // Each is a full-panel re-render behind the shared .door-back control —
  // the same shape the passport picker and the questionnaire already
  // used. The controls are identical on every step and sit at equal
  // reading weight, because "Skip this" is a real answer and a secondary
  // button that looks like an apology is not an offer.

  function stepControlsHtml(step, primaryDisabled) {
    const isLast = step === LAST_STEP;
    return `
      <div class="door-step-controls">
        <button type="button" class="door-escape door-step-primary" id="door-step-next"${primaryDisabled ? " disabled" : ""}>${escapeHtml(isLast ? SUBMIT_LABEL : NEXT_LABEL)}</button>
        <button type="button" class="door-escape door-step-skip" id="door-step-skip">${escapeHtml(isLast ? SKIP_AND_SUBMIT_LABEL : SKIP_LABEL)}</button>
      </div>`;
  }

  function renderStepShell(step, innerHtml, primaryDisabled) {
    panel.innerHTML = `
      <button type="button" class="door-back" id="door-back">${escapeHtml(BACK_LABEL)}</button>
      <h2 class="door-passport-heading">${escapeHtml(STEP_HEADINGS[step - 1])}</h2>
      <div class="door-step-body" id="door-step-body">${innerHtml}</div>
      ${stepControlsHtml(step, primaryDisabled)}
    `;
    // .door-back on step 1 returns to the main screen; on step 2 to the
    // previous step, with its answers intact.
    panel.querySelector("#door-back").addEventListener("click", () => {
      if (step === 1) renderMainScreen();
      else renderStep(step - 1);
    });
  }

  function wireStepControls(step, { commit }) {
    const next = panel.querySelector("#door-step-next");
    const skip = panel.querySelector("#door-step-skip");
    const advance = () => {
      if (step === LAST_STEP) seeTheWorld();
      else renderStep(step + 1);
    };
    next.addEventListener("click", () => {
      if (next.disabled) return;
      commit();
      advance();
    });
    // Never disabled, and never commits: a half-filled step that is
    // skipped stores nothing for that dimension.
    skip.addEventListener("click", () => {
      clearStep(step);
      advance();
    });
  }

  function clearStep(step) {
    if (step === 1) flow.numbers = null;
    if (step === 2) flow.nationality = null;
  }

  function renderStep(step) {
    if (step === 1) return renderNumbersStep();
    return renderPassportStep();
  }

  // ---- step 1 of 2: the numbers ----
  async function renderNumbersStep() {
    const store = await loadStore();
    renderStepShell(1, "", true);
    const body = panel.querySelector("#door-step-body");
    const next = panel.querySelector("#door-step-next");
    // Pre-filled from whatever the reader has on this device or has
    // already typed this pass — reopening the box must never make them
    // type their income twice.
    const prefill = flow.numbers || loadOwnNumbers();
    const stepApi = createOwnNumbersStep({
      container: body,
      store,
      prefill,
      onValidity: (ok) => { next.disabled = !ok; },
    });
    wireStepControls(1, {
      commit: () => { flow.numbers = stepApi.readInput(); },
    });
    panel.focus();
  }

  // ---- step 2 of 2: the passport ----
  async function renderPassportStep() {
    const store = await loadStore();
    const tierCodes = new Set(store.nationalityCodes);
    const codes = store.nationalityCodes
      .filter((code) => ISO_COUNTRY_NAMES[code])
      .sort((a, b) => ISO_COUNTRY_NAMES[a].localeCompare(ISO_COUNTRY_NAMES[b]));
    const optionsHtml = codes
      .map((code) => `<option value="${code}">${escapeHtml(ISO_COUNTRY_NAMES[code])}</option>`)
      .join("");
    const existing = flow.nationality ? { code: flow.nationality } : loadNationality();
    // Never preselect a code the current list doesn't offer, and never
    // touch the reader's own saved value either.
    const existingOffered = Boolean(existing) && tierCodes.has(existing.code);

    renderStepShell(2, `
      <div class="door-passport-box">
        <p class="door-passport-scope">${escapeHtml(PASSPORT_BOX_SCOPE)}</p>
        <label for="door-nationality-select">Your nationality</label>
        <select id="door-nationality-select">
          <option value="" disabled${existingOffered ? "" : " selected"}>${escapeHtml(PASSPORT_PLACEHOLDER_OPTION)}</option>
          ${optionsHtml}
        </select>
        <p class="door-passport-absence">${escapeHtml(PASSPORT_ABSENCE_BEFORE)}<a href="${withPersona(siteUrl("contact.html"))}">${escapeHtml(PASSPORT_ABSENCE_LINK_TEXT)}</a>${escapeHtml(PASSPORT_ABSENCE_AFTER)}</p>
        <p class="door-dual-citizen-line">${escapeHtml(DUAL_CITIZEN_LINE)}</p>
        <p class="door-passport-more">${escapeHtml(PASSPORT_MORE_LINE)}</p>
        <p class="door-passport-footer">${escapeHtml(PASSPORT_SCOPE_FOOTER)}</p>
      </div>
    `, !existingOffered);

    const select = panel.querySelector("#door-nationality-select");
    if (existingOffered) select.value = existing.code;
    const next = panel.querySelector("#door-step-next");
    const sync = () => { next.disabled = !select.value; };
    select.addEventListener("change", sync);
    sync();

    wireStepControls(2, {
      // §8Z item 5 / §8AA.5: personal fields never serialize into URLs.
      // Nothing here touches URLSearchParams or location.search with this
      // value; the reader's own storage is the only carrier.
      commit: () => { flow.nationality = select.value || null; },
    });
    select.focus();
  }

  // ------------------------------------------------------------------
  // Open
  // ------------------------------------------------------------------
  function open() {
    ensureOverlay();
    fog();
    renderMainScreen();
  }

  if (reopenRequested) open();
  else if (shouldShowDoor()) open();

  return { open };
}
