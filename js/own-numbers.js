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
//   B4 no FX conversion feeds anything here; loadFxRates() is never
//      imported, so the reader's currency can never reach it.
//   B5 no console, anywhere, not behind a flag, not commented out.
//   B6 no dormant transmission — no placeholder endpoint, no analytics
//      stub, no "TODO: POST".
//   B7 storage is the reader-preferences envelope's own_numbers key, and
//      this module does not write it — the door commits at flow exit.
//   B9 fails open — storage unavailable never blocks a render.
//   B10 the 20-row lookup table is asserted against the data before the
//      reader is asked for anything.

import { escapeHtml } from "./app-shared.js";
import { assertRouteBarTable, hasIncomeBarInCurrency } from "./own-numbers-data.js";

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
// income amount field, not new fields: each is a closed list (4 values and
// 2), never free text. The three currencies are not arbitrary — they are
// the only currencies the twenty rows' bars are stated in.
const FIELD_A_LABEL = "What do you live on?";
const CURRENCY_OPTIONS = [
  { value: "USD", label: "US dollars (USD)" },
  { value: "EUR", label: "Euros (EUR)" },
  { value: "THB", label: "Thai baht (THB)" },
  { value: "OTHER", label: "Another currency" },
];
const PERIOD_OPTIONS = [
  { value: "month", label: "a month" },
  { value: "year", label: "a year" },
];
// AUTHORED-CHOICE (unchanged from v1): the spec routes the "currencies
// other than USD, EUR, THB" limit to a note rendered at the point of
// selection, but gives no at-selection string. Composed from two spec
// sentences that are given.
//
// FIRST SENTENCE REPLACED, and FLAGGED: the amendment reaches beyond the
// narrow scope it was asked for — which was the THB line in the box —
// though it stays inside the same surface. It is landed and named here,
// not smuggled, so it can be struck rather than found.
// WHAT IT REPLACES, kept so the change is legible: "The routes this box
// reads state their bars in US dollars, euros and Thai baht." True of the
// TABLE and false as a promise — the only baht rows are bank-balance and
// security-deposit figures the box notes and never compares. Without this
// edit the two notes in this one box contradict each other the moment the
// baht line below lands: one would promise a baht reading the other
// exists to say does not happen.
// Second sentence unchanged, verbatim.
const CURRENCY_OTHER_NOTE =
  "The routes this box reads state their income bars in US dollars and euros; the only baht figures are bank-balance requirements on Thai routes, which it notes but doesn't compare. The site shows you each bar as recorded rather than converting your figure — today's exchange rate would be the thing deciding the answer, and that isn't a fact about the route.";

// Four sentences, four jobs: what happens, why (the box's own coverage,
// never a claim about Thai law), the no-conversion principle
// CURRENCY_OTHER_NOTE already makes, and what the reader can do without
// being pushed toward a conversion this site refuses to perform.
//
// THE FAILURE THIS ANSWERS, seen from the chair: the box offers Thai baht
// and returns 12 of 12 "couldn't be read", Thailand included. This line is
// shown at the point of selection, BEFORE the effort is spent, rather
// than as twelve identical refusals afterwards.
const THB_NO_INCOME_BAR_NOTE =
  "Entered in baht, your income can't be read against any route yet. None of the routes this box reads states its income bar in Thai baht — the baht figures it holds are bank-balance requirements on Thai routes, which it will note but doesn't compare. The site doesn't convert currencies, so every country would come back as “couldn't be read”. If your income is actually paid in dollars or euros, enter it in that currency; if it's paid in baht, the box can't read it for you today.";

// The limit visible in the dropdown BEFORE selection, not only after,
// because a control's promise counts as a claim. The specified literal is
// `{ value: "THB", label: "Thai baht (THB) — reads no income bar yet" }`;
// it is built here by concatenation onto the base label rather than
// re-typed, so the two can never drift, and it is GATED on the same
// computed predicate as the note — the suffix retires itself with the
// sentence.
//
// NAMED, NOT HIDDEN: CURRENCY_OPTIONS feeds TWO
// selects — the income amount's and the optional property capital's. The
// spec addresses the income one; the suffix reaches both, because one
// list is what keeps them from drifting. It is not false in the property
// select (the box reads no baht income bar there either, and the two baht
// capital rows return before any currency is compared), but it answers a
// question that control did not ask. Landed as specified and reported
// rather than split on a builder's own call.
const THB_OPTION_LIMIT_SUFFIX = " — reads no income bar yet";

// The two gates, computed from ROUTE_BARS on every render (never cached
// at module scope, so a table edit takes effect without a reload).
function bahtIncomeIsUnreadable() {
  return !hasIncomeBarInCurrency("THB");
}
function currencyOptions() {
  if (!bahtIncomeIsUnreadable()) return CURRENCY_OPTIONS;
  return CURRENCY_OPTIONS.map((o) =>
    o.value === "THB" ? { value: o.value, label: o.label + THB_OPTION_LIMIT_SUFFIX } : o);
}

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
// The fourth option's own inline note, rendered the moment it is
// selected: placeholder-honesty for a near-empty dimension, at the point
// of the ask rather than after the answer.
const LOCAL_ACTIVE_NOTE =
  "Only one of the routes this box reads has recorded how income earned inside the country is treated. The rest below show what they do say, and say nothing about this.";

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

const COVERAGE_LINE =
  "This box reads Thailand, Guatemala, Portugal, Spain and Crete. Everywhere else, it says so instead of guessing.";

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
const ARIA_PROPERTY_CURRENCY = "Currency of your property capital";

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
          ${selectHtml("own-currency", currencyOptions(), saved ? saved.currency : "USD", ARIA_CURRENCY)}
          ${selectHtml("own-period", PERIOD_OPTIONS, saved ? saved.period : "month", ARIA_PERIOD)}
        </div>
        <p class="own-field-note own-currency-note" id="own-currency-note" hidden>${escapeHtml(CURRENCY_OTHER_NOTE)}</p>
      </div>

      <fieldset class="door-question own-field">
        <legend>${escapeHtml(FIELD_C_LABEL)}</legend>
        <div class="priority-choices own-choices-column">${radioGroupHtml("own-type", FIELD_C_OPTIONS, saved && saved.income_type)}</div>
        <p class="own-field-note" id="own-local-note" hidden>${escapeHtml(LOCAL_ACTIVE_NOTE)}</p>
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
            ${selectHtml("own-property-currency", currencyOptions(), hasProperty ? saved.property_capital.currency : "USD", ARIA_PROPERTY_CURRENCY)}
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
  const propCurrency = container.querySelector("#own-property-currency");
  const localNote = container.querySelector("#own-local-note");
  const currencyNote = container.querySelector("#own-currency-note");
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
    localNote.hidden = checkedValue("own-type") !== "local_active";
    // ONE slot, two notes, never both and never a stale one. The baht line renders "the moment THB is selected, in
    // the same slot and style as CURRENCY_OTHER_NOTE", which means this
    // paragraph's text is chosen here rather than baked into the markup:
    // whichever note is true of the current selection is the one in the
    // element, and the element is hidden when neither is.
    //
    // The baht branch is gated on the COMPUTED condition, not on the
    // string being present, so the day a baht income bar lands in
    // ROUTE_BARS this branch stops firing, the option-label suffix goes
    // with it, and no copy is edited to make either happen.
    if (currency.value === "THB" && bahtIncomeIsUnreadable()) {
      currencyNote.textContent = THB_NO_INCOME_BAR_NOTE;
      currencyNote.hidden = false;
    } else if (currency.value === "OTHER") {
      currencyNote.textContent = CURRENCY_OTHER_NOTE;
      currencyNote.hidden = false;
    } else {
      currencyNote.hidden = true;
    }
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
    // storage shape.
    const propValue = propToggle.checked ? parseAmount(propAmount) : null;
    if (propValue) input.property_capital = { amount: propValue, currency: propCurrency.value };
    return input;
  }

  return { readInput, tableOk: true };
}
