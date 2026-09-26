// CanILiveThere — step 1 of the door's one process: "Your numbers".
//
// DOOR V2. This file used to be a whole wing: an input
// screen, a visit panel, and a result screen that listed five countries'
// route readings, sixteen refusals, and a way out. The result screen is
// RETIRED — it was the second welcome page the reader walked into instead
// of the map, and the line it ended on ("your figures stay in this box;
// the map and the lists show the general view, not your numbers") was the
// dead end printed on the page. Submit now opens the map, and the
// reader's figures are read into the map, the Lists and every location
// page through js/reader-lens.js.
//
// WHAT SURVIVED, verbatim and deliberately: every string in the spec's
// exact input field set — the field labels and their point-of-selection
// disclosures — plus the privacy paragraph, the coverage line, the limits
// lines and the save control's own words. Those were reviewed and gated
// copy and none of them became false; only two changed, each because the
// delta made the old wording untrue, and each marked below.
//
// WHAT THIS FILE IS NOW: one screen's interior, with no chrome of its
// own. The heading, the back control and the step buttons belong to the
// door, because the door is what knows this is step 1 of 3. This module
// renders the fields, validates them, and hands back a plain input object
// in the ruled storage shape. It navigates nothing and writes nothing.
//
// Build constraints, unchanged and still checkable by grep over this file:
//   B1 no URL, ever — nothing here touches location.search, location.hash,
//      history.pushState/replaceState, an <a href> or a <form action> with
//      any field value.
//   B2 no share affordance, no permalink, no copy-to-clipboard.
//   B3 zero transmission — this file makes no network call of any kind.
//   B4 REWORDED BY THE CONVERSION CROSSING: conversion here
//      reads the rules layer's fx_rates row and nothing else;
//      loadFxRates() is still never imported, so no live rate can reach
//      a reader's answer. The distinction that matters is the live fetch
//      (still barred) vs. the rules-layer table (now the intended path)
//      — see convertAmount() in js/own-numbers-data.js.
//   B5 no console, anywhere, not behind a flag, not commented out.
//   B6 no dormant transmission — no placeholder endpoint, no analytics
//      stub, no "TODO: POST".
//   B7 storage is the reader-preferences envelope's own_numbers key, and
//      this module does not write it — the door commits at flow exit.
//   B9 fails open — storage unavailable never blocks a render.
//   B10 the 20-row lookup table is asserted against the data before the
//      reader is asked for anything.

import { escapeHtml } from "./app-shared.js";
import { assertRouteBarTable, convertAmount, countRoutesWithNoTypeRecord } from "./own-numbers-data.js";

// ---------------------------------------------------------------------
// Copy table. The wording is the spec's, not this file's: none of these
// strings may lose a clause without going back to the spec.
// ---------------------------------------------------------------------

// CHANGED. The old line promised the reader a
// reading inside the box — "the site will show you what the residence
// routes in five countries actually ask of someone with that … It reads
// the routes; it doesn't decide anything." The box no longer shows them
// anything; the map, the lists and every place's page do. A scope line
// that describes a screen the reader will never see is a false promise,
// so it now names the surfaces that actually answer.
export const INPUT_SCOPE_LINE =
  "What you live on, and how long you're going for. The map, the lists and every place's page will read the residence routes in five countries against it.";

// The privacy paragraph. Sits ABOVE the first input, never below the
// button: a stranger asked for their income needs to know where it goes
// before they type it. Disclosure that arrives after the ask is not
// disclosure, it is a receipt.
//
// CHANGED, LAST CLAUSE ONLY. It read "They stay in
// this browser, on this device, and only if you ask them to at the end."
// That was true while the figures died with the box. They now have to
// reach lists.html and l/*.html, which are separate page loads, so
// they are now carried for the visit in this tab's own session storage
// and kept for next time only by a switch the reader turns on. The
// sentence and the mechanism landed in the same commit, which is the
// acceptance check on this line: saveOwnNumbersForVisit() and
// saveOwnNumbers() in app-shared.js are the two halves it describes.
const PRIVACY_HEADING = "Where this goes: nowhere.";
const PRIVACY_BODY =
  "Nothing you type here is sent anywhere. This site is a set of static files with no server behind it to receive anything. Your figures are never put in the web address, never attached to a link you could share by accident, and never included in any request this page makes. They stay in this browser, on this device, for this visit. Keeping them for next time is a switch you turn on yourself, after you've seen the map.";

// Field B — how long the reader is thinking of staying.
const FIELD_B_LABEL = "How long are you thinking?";
const FIELD_B_OPTIONS = [
  { value: "visit", label: "A visit — weeks or a few months" },
  { value: "long_stay", label: "Living there — a year or more" },
];
const FIELD_B_NOTE =
  "This picks which set of rules the site reads for you, not a legal cut-off. Short stays run on your passport, not on your income.";

// Field A — the amount. Currency and period are sub-units of the keyed
// income amount field, not new fields: each is a closed list, never free
// text.
//
// NARROWED BY THE CONVERSION CROSSING: "OTHER" came out first (the
// no-rate-lookup sentinel,
// with conversion now real, had no job left) and THB waits with MXN —
// EUR and USD only, for now. One currency per submission: this same list
// now governs both Field A and Field D, since
// Field D's own select is retired below.
const FIELD_A_LABEL = "What do you live on?";
const CURRENCY_OPTIONS = [
  { value: "USD", label: "US dollars (USD)" },
  { value: "EUR", label: "Euros (EUR)" },
];
const PERIOD_OPTIONS = [
  { value: "month", label: "a month" },
  { value: "year", label: "a year" },
];

// ALWAYS RENDERED, not gated on a selection — a control's promise counts
// as a claim (perspective-disclosure law), and with only two currencies
// left to pick from, the promise IS the point of selection. Replaces the
// two retired notes this crossing falsifies (the old THB-unreadable line
// and the old "the site doesn't convert" OTHER line — see
// COVERAGE_LINE below for the one fact worth carrying out of the second
// of those).
const OWN_CURRENCY_NOTE_BASE =
  "Bars stated in the other currency are converted into yours at the rate on file. Your income and your property capital are read in the currency you pick here.";
// Appended when the rules-layer rate this promise depends on can't be
// trusted right now — the row absent, the pair missing, or stale
// (js/own-numbers-data.js's convertAmount()) — at the point of selection
// rather than as an unexplained "couldn't be read" later (the failure the
// retired baht note was written to answer, carried forward to the one
// cause that can still happen).
const OWN_CURRENCY_NOTE_FX_DOWN =
  "Today the site has no exchange rate on file it can convert with, so routes whose bars are stated in the other currency won't be read against your figure. It won't guess a rate.";

// Field C — where the income comes from. The display names are the
// spec's; the stored token underneath is the corpus vocabulary's own
// stem, untouched.
const FIELD_C_LABEL = "Where does it come from?";
const FIELD_C_OPTIONS = [
  { value: "pension", label: "A pension or retirement income" },
  { value: "passive", label: "Investment, rental or other income I don't work for" },
  { value: "remote_active", label: "Remote work or freelance, paid from outside the country" },
  { value: "local_active", label: "Work or a business inside the country" },
  { value: "unspecified", label: "A mix, or I'd rather not say" },
];
// The income-type gap note, rendered at the point of the ask the moment
// a kind is selected that at least one route the box reads has no record
// of. The wording is the spec's, not this file's: verbatim, and not to
// be edited here.
//
// SUPERSEDES a local-active-only note that had gone FALSE ON SCREEN.
// The sentence quoted next is that FALSE text, reproduced only so it can
// be recognised and never restored: it is bound to no constant, no code
// path can select it, and nothing renders it.
//   FALSE, RETIRED: "Only one of the routes this box reads has recorded
//   how income earned inside the country is treated. The rest below show
//   what they do say, and say nothing about this."
// Three defects, and the repair answers all three rather than rewording
// around them:
//   1. It hard-coded a count with no truth condition, so the data
//      outgrew it silently — three routes carry a local-active record by
//      the time it was caught, not one.
//   2. "The rest below" pointed at a per-route list that renders
//      NOWHERE (js/reader-lens.js's routes_detail: "NOTHING RENDERS THIS
//      TODAY"). No pointer is reintroduced here; one may be added the
//      day a per-route surface exists, and not before.
//   3. The same silence is owed on all four kinds, not just this one.
//
// NO QUANTIFIER, deliberately: "most" was drafted and rejected upstream
// because it is false for passive once the coarse `accepts_passive_income`
// rows count as records — a word false on a quarter of the grid is the
// same defect as the number it would replace.
const INCOME_TYPE_GAP_NOTE =
  "Not every route this box reads has recorded how this kind of income is treated. "
  + "Each one says what it does record, or says it isn't on file yet — and a gap is not a no.";

// Field D — property capital, optional and collapsed by default.
const FIELD_D_CHECKBOX = "I also have capital I could put into property";
const FIELD_D_COVERAGE =
  "Right now this changes the answer on one route — Guatemala's investor visa, which names property as a qualifying vehicle in its own paperwork. It adds a note on two Thailand routes. Everywhere else the site hasn't recorded a property-linked path.";
// AUTHORED-CHOICE (label only): the spec specifies one numeric input plus
// the same currency select as Field A, without naming the input.
const FIELD_D_AMOUNT_LABEL = "How much capital?";
// AUTHORED-CHOICE: the one case where the reader has said something the
// box cannot use — the box ticked, the amount empty.
const FIELD_D_INCOMPLETE_NOTE =
  "You've ticked the capital box but not put an amount in it — enter one, or untick the box.";

// Second sentence added by the conversion crossing: the one
// surviving fact from the retired CURRENCY_OTHER_NOTE (the baht-bars-are-
// bank-balances-only note), carried here now that no reader can select
// baht to be told it there.
const COVERAGE_LINE =
  "This box reads Thailand, Guatemala, Portugal, Spain and Crete. Everywhere else, it says so instead of guessing. "
  + "Bars are stated in dollars or euros; a few Thai routes set a bank-balance figure in baht, which the box notes and doesn't compare.";

// The "not now, and why" limits — the ones that are not rendered at a
// point of selection, in the spec's own order.
//
// STRUCK: the first line read "This reads visa routes. It doesn't change
// the map yet." It is false the moment this build ships — changing the
// map is precisely what the figures now do.
// Removed rather than reworded: there is no honest version of a sentence
// whose whole content was a limit that no longer exists.
const LIMITS_LINES = [
  // "below" pointed at the old result screen, which this build removed;
  // the per-route words it promised render nowhere today. The replacement
  // drops the pointer and adds no claim — and it now says, at the input,
  // the same thing READER_BASIS_DECLARED_LINE says at the verdict.
  "One person's figures. Where a route scales its bar for a partner or children, the box doesn't do that arithmetic for you.",
  "This is about the bars a route sets, not what life costs once you're there.",
  "Staying long enough to use one of these routes usually makes you tax-resident, and these five countries treat that very differently. This box doesn't read any of that.",
];

// The save control's own words, exported because the control itself now
// lives on the door's main screen — after the reader has seen the map,
// which is what the privacy paragraph above promises them. One string,
// one claim, wherever it renders.
export const SAVE_LABEL = "Keep this on my device";
// REWORDED. The shipped note named ONE
// of the four things the switch now governs — ticking it writes the
// passport, the priorities and the door's memory of the chosen lens as well
// as the figures. This is the consent text for the switch and the defect
// being closed was a scope claim, so the scope is named item by item: the
// four keys in READER_ANSWER_KEYS, in the order the reader answered them,
// with the lens last because it is the site's memory of a choice rather than
// something typed. The off-state's lifetime is stated plainly rather than
// left as an absence. The closing sentence is unchanged and still true in
// both states — no write path in this box reaches the network.
export const SAVE_NOTE =
  "Off by default. Turn it on and this browser keeps your answers \u2014 your figures, your priorities, your passport, the lens you picked \u2014 so they're here next time. Leave it off and they go when this visit ends. Nothing is sent anywhere either way.";
// AUTHORED-CHOICE (unchanged from v1): B9 asks for one plain line saying
// why, without giving the line.
export const SAVE_UNAVAILABLE_LINE =
  "This browser isn't letting the site store anything, so there's nothing to keep. Everything above still works either way.";

// B10 — the whole-box refusal state. AUTHORED-CHOICE (unchanged from v1):
// the spec asks for "one line" and does not write it.
const TABLE_MISMATCH_LINE =
  "This box's own list of routes and the site's route data have gone out of step, so it isn't reading anything until that's fixed.";

// ---------------------------------------------------------------------

function radioGroupHtml(name, options, selected) {
  return options.map((o, i) => `
    <label class="priority-choice own-choice">
      <input type="radio" name="${name}" id="${name}-${i}" value="${escapeHtml(o.value)}"${o.value === selected ? " checked" : ""}>
      <span>${escapeHtml(o.label)}</span>
    </label>`).join("");
}

// AUTHORED-CHOICE (accessible names, unchanged from v1): the spec
// describes the amount, the currency and the period as one field with one
// visible label, which leaves the two <select>s with no accessible name
// of their own. The visible label is unchanged; these names exist only in
// the accessibility tree.
function selectHtml(id, options, selected, ariaLabel) {
  return `<select id="${id}" aria-label="${escapeHtml(ariaLabel)}">${options
    .map((o) => `<option value="${escapeHtml(o.value)}"${o.value === selected ? " selected" : ""}>${escapeHtml(o.label)}</option>`)
    .join("")}</select>`;
}
const ARIA_CURRENCY = "Currency";
const ARIA_PERIOD = "Per month or per year";

/**
 * Render step 1's interior into `container`.
 *
 * @param container   the element to fill — the door owns everything around it
 * @param store       the built store (used only for B10's assertion)
 * @param prefill     a previously-entered/saved input object, or null
 * @param onValidity  called with (isComplete) whenever the fields change,
 *                    so the door can enable its own "Next" button. "Skip
 *                    this" is NEVER gated on this — a half-filled step
 *                    that is skipped commits nothing, which is what makes
 *                    every step genuinely optional.
 *
 * Returns { readInput, tableOk }. readInput() gives the ruled storage
 * shape, or null when the fields don't make a usable answer.
 */
export function createOwnNumbersStep({ container, store, prefill, onValidity }) {
  const allRoutes = [].concat(...[...store.visaRoutesByCountry.values()]);
  // B10 — the lookup table is asserted, not trusted. A mismatch means the
  // box would answer off a stale key, so it refuses to ask for the
  // reader's income at all rather than collecting it for nothing.
  const tableOk = assertRouteBarTable(allRoutes).ok;
  if (!tableOk) {
    container.innerHTML = `<p class="own-route-note">${escapeHtml(TABLE_MISMATCH_LINE)}</p>`;
    if (onValidity) onValidity(false);
    return { readInput: () => null, tableOk: false };
  }

  const saved = prefill || null;
  const hasProperty = Boolean(saved && saved.property_capital);

  // Computed once per render, not per keystroke: whether the rules-layer
  // rate this box's conversion promise depends on can be trusted right
  // now. EUR<->USD is the only pair this crossing's own inputs ever
  // exercise (both currencies left in CURRENCY_OPTIONS), so that's the
  // one pair checked here.
  const fxAvailable = convertAmount(store.fxRates, 1, "EUR", "USD") !== null;

  // Also computed once per render, not per keystroke: for each kind the
  // reader can pick, whether ANY route the box reads has no record of it.
  // Read off the engine's own gate 1 (countRoutesWithNoTypeRecord), so
  // the note and the answers it precedes cannot disagree about what "no
  // record" means. The count itself is never rendered and must not be.
  const typeGapByType = {};
  for (const opt of FIELD_C_OPTIONS) {
    typeGapByType[opt.value] = countRoutesWithNoTypeRecord(allRoutes, opt.value) > 0;
  }
  const currencyNoteText = fxAvailable
    ? OWN_CURRENCY_NOTE_BASE
    : `${OWN_CURRENCY_NOTE_BASE} ${OWN_CURRENCY_NOTE_FX_DOWN}`;

  container.innerHTML = `
    <div class="own-numbers-box">
      <p class="door-passport-scope">${escapeHtml(INPUT_SCOPE_LINE)}</p>

      <div class="own-privacy">
        <p class="own-privacy-heading">${escapeHtml(PRIVACY_HEADING)}</p>
        <p>${escapeHtml(PRIVACY_BODY)}</p>
      </div>

      <fieldset class="door-question own-field">
        <legend>${escapeHtml(FIELD_B_LABEL)}</legend>
        <div class="priority-choices own-choices-column">${radioGroupHtml("own-duration", FIELD_B_OPTIONS, saved && saved.duration_band)}</div>
        <p class="own-field-note">${escapeHtml(FIELD_B_NOTE)}</p>
      </fieldset>

      <div class="own-field">
        <label for="own-amount">${escapeHtml(FIELD_A_LABEL)}</label>
        <div class="own-amount-row">
          <input type="text" inputmode="decimal" id="own-amount" autocomplete="off"
                 value="${saved ? escapeHtml(String(saved.amount)) : ""}">
          ${selectHtml("own-currency", CURRENCY_OPTIONS, saved ? saved.currency : "USD", ARIA_CURRENCY)}
          ${selectHtml("own-period", PERIOD_OPTIONS, saved ? saved.period : "month", ARIA_PERIOD)}
        </div>
        <p class="own-field-note own-currency-note" id="own-currency-note">${escapeHtml(currencyNoteText)}</p>
      </div>

      <fieldset class="door-question own-field">
        <legend>${escapeHtml(FIELD_C_LABEL)}</legend>
        <div class="priority-choices own-choices-column">${radioGroupHtml("own-type", FIELD_C_OPTIONS, saved && saved.income_type)}</div>
        <p class="own-field-note" id="own-type-gap-note" hidden>${escapeHtml(INCOME_TYPE_GAP_NOTE)}</p>
      </fieldset>

      <div class="own-field">
        <label class="priority-choice own-choice">
          <input type="checkbox" id="own-property-toggle"${hasProperty ? " checked" : ""}>
          <span>${escapeHtml(FIELD_D_CHECKBOX)}</span>
        </label>
        <div class="own-property-group" id="own-property-group"${hasProperty ? "" : " hidden"}>
          <p class="own-field-note">${escapeHtml(FIELD_D_COVERAGE)}</p>
          <label for="own-property-amount">${escapeHtml(FIELD_D_AMOUNT_LABEL)}</label>
          <div class="own-amount-row">
            <input type="text" inputmode="decimal" id="own-property-amount" autocomplete="off"
                   value="${hasProperty ? escapeHtml(String(saved.property_capital.amount)) : ""}">
          </div>
          <p class="own-field-note" id="own-property-note" hidden>${escapeHtml(FIELD_D_INCOMPLETE_NOTE)}</p>
        </div>
      </div>

      <p class="own-field-note">${escapeHtml(COVERAGE_LINE)}</p>
      <div class="own-limits">${LIMITS_LINES.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}</div>
    </div>`;

  const amount = container.querySelector("#own-amount");
  const currency = container.querySelector("#own-currency");
  const period = container.querySelector("#own-period");
  const propToggle = container.querySelector("#own-property-toggle");
  const propGroup = container.querySelector("#own-property-group");
  const propAmount = container.querySelector("#own-property-amount");
  const typeGapNote = container.querySelector("#own-type-gap-note");
  const propertyNote = container.querySelector("#own-property-note");

  // Readers type "2,400" and "2 400". Stripping separators at PARSE time
  // is not the "thousands-separator coercion on keystroke" the spec
  // forbids — nothing is rewritten in the field as they type; the figure
  // they see is the figure they entered.
  const parseAmount = (el) => {
    const raw = String(el.value).replace(/[,\s]/g, "").trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const checkedValue = (name) => {
    const el = container.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : null;
  };

  // Ticking the optional capital box and leaving the amount empty is the
  // reader saying something the box would then quietly drop. The optional
  // field is optional to TICK, not optional to finish.
  const isComplete = () => {
    const propertyIncomplete = propToggle.checked && !parseAmount(propAmount);
    return Boolean(parseAmount(amount) && checkedValue("own-duration") && checkedValue("own-type")) && !propertyIncomplete;
  };

  const sync = () => {
    const propertyIncomplete = propToggle.checked && !parseAmount(propAmount);
    // THE NOTE'S TRUTH CONDITION, not a hard-coded option. It renders
    // while at least one route the box reads has no record of the kind
    // selected, and the day a kind reaches full coverage it stops
    // rendering instead of going stale — which is exactly how the string
    // it replaces became false.
    const selectedType = checkedValue("own-type");
    typeGapNote.hidden = !(selectedType && typeGapByType[selectedType]);
    // The currency note is no longer selection-dependent (§5a of the
    // conversion crossing's wording deck): it is the box's own promise,
    // set once above at render time. Nothing here toggles it any more.
    propGroup.hidden = !propToggle.checked;
    propertyNote.hidden = !propertyIncomplete;
    if (onValidity) onValidity(isComplete());
  };
  amount.addEventListener("input", sync);
  currency.addEventListener("change", sync);
  period.addEventListener("change", sync);
  propToggle.addEventListener("change", sync);
  propAmount.addEventListener("input", sync);
  container.querySelectorAll('input[type="radio"]').forEach((r) => r.addEventListener("change", sync));
  sync();

  function readInput() {
    if (!isComplete()) return null;
    const value = parseAmount(amount);
    const input = {
      amount: value,
      currency: currency.value,
      period: period.value,
      income_type: checkedValue("own-type"),
      duration_band: checkedValue("own-duration"),
    };
    // property_capital is absent entirely unless the reader ticked the box
    // AND entered a figure — never null, never 0, which is the ruled
    // storage shape. One currency per submission: no
    // property_capital.currency any more — it reads in the same currency
    // as the income figure above.
    const propValue = propToggle.checked ? parseAmount(propAmount) : null;
    if (propValue) input.property_capital = { amount: propValue };
    return input;
  }

  return { readInput, tableOk: true };
}
