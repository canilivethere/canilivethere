// CanILiveThere — the welcome box's third door wing, "Your numbers".
//
// Built to the welcome-box spec — every reader-facing string below is
// that spec's, verbatim. Where the spec left a string or a layout
// unspecified, the choice is marked AUTHORED-CHOICE with the spec
// sentence it leans on, and was reported as an authored choice rather
// than passed off as ratified copy.
//
// What this wing is: a stranger enters what they live on, and the box
// shows what the residence routes in five countries actually ask of
// someone with that figure and that kind of income — instead of asking
// them to guess which of eight fictional people they most resemble. The
// other sixteen countries are refused out loud, by name, at full size.
//
// What this wing is NOT: an eligibility check. It compares a number to a
// stated bar and stops. The spec's forbidden vocabulary ("eligible",
// "qualify", "you can", "approved", "guaranteed", "your best option")
// appears nowhere in this file, and the chips carry no meaning-colour,
// because colour must not say what the words are forbidden to say.
//
// Build constraints this file is written against. Each is written to be
// checkable by grep over this file, and they are:
//   B1 no URL, ever — nothing here touches location.search,
//      location.hash, history.pushState/replaceState, an <a href> or a
//      <form action> with any field value. Result-screen navigation is an
//      in-panel re-render, never a reload.
//   B2 no share affordance, no permalink, no copy-to-clipboard.
//   B3 zero transmission — this file makes no network call of any kind.
//   B4 the page's one live request (loadFxRates(), a pinned string
//      constant) is not used here at all: no FX conversion feeds any chip
//      (ruled: this box does no currency conversion), so it never
//      imports that helper
//      and the reader's currency can never reach it.
//   B5 no console, anywhere, not behind a flag, not commented out.
//   B6 no dormant transmission — no placeholder endpoint, no analytics
//      stub, no "TODO: POST".
//   B7 storage is the existing reader-preferences envelope's new
//      own_numbers sibling key, written only through saveOwnNumbers()
//      (which goes through writeReaderPreferenceKey()).
//   B8 hasAnySavedReaderState() extended in app-shared.js to cover it.
//   B9 fails open — storage unavailable never blocks a render.
//   B10 the 20-row lookup table is asserted against the data at load.

import {
  escapeHtml, isActivationKey, formatNumbersInText, confidenceBadge,
  loadNationality, loadOwnNumbers, saveOwnNumbers, clearOwnNumbers,
  isReaderStorageAvailable, hasAnySavedReaderState, wireForgetControl,
} from "./app-shared.js";
import { ISO_COUNTRY_NAMES } from "./iso-names.js";
import {
  READ_SET, ROUTE_BARS, assertRouteBarTable, sliceRoutes,
  evaluateRow, orderRows, incomeTypeRecord, isConditional,
} from "./own-numbers-data.js";

// ---------------------------------------------------------------------
// THE GATE BOUNDARY: verbatim data versus authored copy.
//
// Every value that reaches the DOM out of the data layer is wrapped in
// <span class="own-verbatim">. Authored copy is then defined, mechanically
// and without judgement, as ALL rendered text in this feature that is not
// inside that selector — which is the rule the forbidden-vocabulary ban
// binds, and the only rule that survives the next line anyone adds to a
// route row.
//
// The reason it is a wrapper and not a per-element list: there are three
// MIXED lines, where an authored label and a verbatim value sit
// in the same element ("Converts to permanent residency: {value}"). A
// per-element boundary would have to be re-derived every time a line is
// added; this one does not. The corpus's own strings legitimately contain
// words the ban forbids in authored copy — a `unit` string that reads "does
// not clear on income alone" is the route speaking, quoted, not the site
// asserting — so a boundary is the difference between a gate that works and
// one that fires on a correct render.
//
// Nothing inside this span is ever altered, truncated, softened, relabelled
// or reordered. escapeHtml() is the only thing applied to it, and that is
// transport, not editing.
function verbatim(value) {
  return `<span class="own-verbatim">${escapeHtml(String(value))}</span>`;
}

// ---------------------------------------------------------------------
// Copy table. The wording is the spec's, not this file's: none of these
// strings may lose a clause without going back to the spec, and absent a
// register pass they ship exactly as written here.
// ---------------------------------------------------------------------

// The third wing card.
export const WING_NUMBERS_LABEL = "Your numbers";
export const WING_NUMBERS_SUBLINE =
  "What you live on, and how long you're going for — read against the residence routes in five countries. Nothing you enter leaves this browser.";

// The input screen, in its exact reading order.
const INPUT_HEADING = "Your numbers";
const INPUT_SCOPE_LINE =
  "Enter what you live on, and the site will show you what the residence routes in five countries actually ask of someone with that. It reads the routes; it doesn't decide anything.";
// The privacy paragraph. Sits ABOVE the first input, never below
// the button: a stranger asked for their income needs to know where it
// goes before they type it. Disclosure that arrives after the ask is not
// disclosure, it is a receipt.
const PRIVACY_HEADING = "Where this goes: nowhere.";
const PRIVACY_BODY =
  "Nothing you type here is sent anywhere. This site is a set of static files with no server behind it to receive anything. Your figures are never put in the web address, never attached to a link you could share by accident, and never included in any request this page makes. They stay in this browser, on this device, and only if you ask them to at the end.";

// Field B — how long the reader is thinking of staying.
const FIELD_B_LABEL = "How long are you thinking?";
const FIELD_B_OPTIONS = [
  { value: "visit", label: "A visit — weeks or a few months" },
  { value: "long_stay", label: "Living there — a year or more" },
];
const FIELD_B_NOTE =
  "This picks which set of rules the site reads for you, not a legal cut-off. Short stays run on your passport, not on your income.";
// Both strings previously carried "the passport wing" — build
// vocabulary a reader never sees. The door labels its
// cards "Your passport", "Your priorities", "Your numbers" and never uses
// the word; a stranger meeting it on a button has met an internal noun.
const VISIT_PANEL_LINE =
  "For a visit, income bars mostly aren't your question — your passport is. That's one click away.";
const VISIT_PANEL_BUTTON = "Start with my passport";
// The visit panel is a rendered surface too, and the rule that every
// rendered surface states whose lens it shows binds it — the no-lens
// state is itself a perspective and says so. The result screen's own
// wording would be false here, because nothing has been read against
// anything; this is the panel's own line.
const VISIT_PERSPECTIVE_LINE =
  "You're seeing this because of the one thing you told the box — that you're thinking of a visit. Nothing here has been read against your figures, and this isn't one of the site's example people or the general view.";

// Field A — the amount. Currency and period are sub-units of the keyed income
// amount field, not new fields: each is a closed list (4 values and 2),
// never free text. The three currencies are not arbitrary — they are the
// only currencies the twenty rows' bars are stated in.
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
// AUTHORED-CHOICE: the spec routes the "currencies other than USD, EUR,
// THB" limit to a note rendered at the point of selection, but gives no
// at-selection string. Composed from two spec sentences that are given:
// "they are the only currencies the 20 rows' bars are stated in", and
// the second half of the currency wall, verbatim.
const CURRENCY_OTHER_NOTE =
  "The routes this box reads state their bars in US dollars, euros and Thai baht. The site shows you each bar as recorded rather than converting your figure — today's exchange rate would be the thing deciding the answer, and that isn't a fact about the route.";

// Field C — where the income comes from. The display names are the
// spec's; the stored
// token underneath is the corpus vocabulary's own stem, untouched.
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
// AUTHORED-CHOICE (label only): the spec specifies one numeric input
// plus the same currency select as Field A, without naming the input.
// Leaning on
// the field's own checkbox wording, "capital I could put into property".
const FIELD_D_AMOUNT_LABEL = "How much capital?";
// AUTHORED-CHOICE: the input screen keeps its button disabled until it
// can answer, and gives no line for the one case where the reader has
// said something the box cannot use — the box ticked, the amount empty.
// The line names both ways out, in the field's own note pattern.
const FIELD_D_INCOMPLETE_NOTE =
  "You've ticked the capital box but not put an amount in it — enter one, or untick the box.";

// The last three lines of the input screen.
const COVERAGE_LINE =
  "This box reads Thailand, Guatemala, Portugal, Spain and Crete. Everywhere else, it says so instead of guessing.";
const SUBMIT_LABEL = "See what these routes ask of you";
// The "not now, and why" limits — the ones that are not rendered at a
// point of selection, in the spec's own order.
// Tax residency is split out of the cost-of-living line: folding it in
// implied the box had read something about tax, and these five countries
// treat it very differently.
const LIMITS_LINES = [
  "This reads visa routes. It doesn't change the map yet.",
  "One person's figures. Routes that scale their bar for a partner or children say so in their own words below, but the box doesn't do that arithmetic for you.",
  "This is about the bars a route sets, not what life costs once you're there.",
  "Staying long enough to use one of these routes usually makes you tax-resident, and these five countries treat that very differently. This box doesn't read any of that.",
];

// The result screen.
const BACK_LABEL_INPUT = "‹ Back";
const BACK_LABEL_RESULT = "‹ Change my answers";
const RESULT_HEADING = "Read against your figures";
// The perspective line, directly under the heading.
const PERSPECTIVE_LINE =
  "You're seeing these routes read against the figures you entered on this device — your own numbers, not one of the site's example people, and not the general view.";
// The standing caveat, rendered once, ABOVE the results, never below.
// Placement is the whole argument: a caveat under the results is a
// footnote a reader has already formed a belief without.
// "Paperwork" was the wrong
// category for what the box skips: age, nationality, convertibility and
// duration are other gates, not documents. "Some of it isn't here yet" is
// doing real work — route duration is absent from the corpus entirely, so
// the box genuinely does not know how long these routes last.
const STANDING_CAVEAT =
  "An income bar is one gate out of several, and clearing it is not the whole answer. Routes also set age limits, nationality rules, document requirements and time limits, and they differ in where they lead. Some of that is on the lines below, in each route's own words. Some of it isn't here yet. What you're seeing is where your figure sits against one stated bar, and nothing more.";
// Three sentences, not one: the band is OURS and not the rule's, a bar
// is a floor rather than a target,
// and some of these bars are pegged to a national benchmark that is re-set
// each year.
const BAND_SENTENCE =
  "Where you're within about a tenth of a bar either way, the site says “right at the line” rather than yes or no — these figures are dated snapshots, and a rule can move by more than that. That band is our uncertainty about the figure, not the rule's own tolerance: a bar is a floor, and below it the record says no. Some of these bars are pegged to a national benchmark that is re-set each year — where a route does that, it says so in its own words below.";
const GROUP_A_HEADING = "Read against your figures";

// The sixteen refusals. Scope, not absence: several of the sixteen
// DO carry income-type fields in the data, so "we haven't got the data"
// would be false. "This box hasn't been built against them" is true. A
// refusal that misdiagnoses its own cause is a false statement, not a
// soft one. No ratio, no count, no coverage figure appears anywhere in
// this block, and it never restates the reader's own input.
const GROUP_B_HEADING = "Not read against your figures";
const GROUP_B_SENTENCE =
  "This box has only been built against Thailand, Guatemala, Portugal, Spain and Crete so far. These sixteen aren't in it yet, so the site won't guess at them — their route pages are still there, unread by this box.";

// The save control. Opt-in, after the answer. The passport and
// priorities wings both save on submit; this one deliberately does not.
// A stranger's income is the most sensitive thing this site has ever
// asked for, and letting them get the whole answer without leaving
// anything behind is the strongest statement of the site's own
// zero-backend posture. The cost is one button, placed after the reward
// rather than before it.
const SAVE_LABEL = "Keep this on my device";
const SAVE_NOTE =
  "Off by default. Saving puts your figures in this browser's storage so the box remembers them next time. Nothing is sent anywhere either way.";
// AUTHORED-CHOICE: the tick-box is unticked whenever what is stored is
// not what is on screen, and an unticked box beside figures a reader
// knows they once saved is ambiguous on its own — this says which of the
// two it is. One sentence, in the same note pattern as the line above.
const SAVE_DIFFERS_LINE =
  "The figures already kept on this device are different from the ones on this screen — ticking this replaces them.";
// AUTHORED-CHOICE: B9 asks for one plain line saying why, without
// giving the line.
const SAVE_UNAVAILABLE_LINE =
  "This browser isn't letting the site store anything, so there's nothing to keep. Everything above still works either way.";
// The forget control's existing label, read from perspective-door.js's
// own constant of the same name — one string, two surfaces, not two
// claims about the same act.
const FORGET_LABEL = "Forget what I've saved here";

// The saved-passport line, when one exists. An earlier version was
// literally true and left a false impression: no slice row's THRESHOLD
// varies by passport, but eligibility
// does on one row — the O-X retirement route is open only to a specific
// list of nationalities, and this box doesn't check that list. Naming the
// one route rather than gesturing at "some routes" is deliberate: we know
// which it is, and a vague version is a disclosure a reader cannot act on.
// The closing pointer is dropped rather than softened, because the site
// cannot currently render that list anywhere.
function passportSavedLineHtml(name) {
  return `You've got a ${verbatim(name)} passport saved. This box doesn't use it. The income bars below are the same whoever you are — but one of these routes, Thailand's O-X retirement visa, is open only to a specific list of nationalities, and this box doesn't check that list. Entry rules are your passport's own page.`;
}
// Group A's country headings link out in the same idiom Group B's
// sixteen use: the country
// surface carries more about every one of these routes than this box does,
// and a reader holding a chip is the one most likely to need it. The label
// names what it actually reaches — the site has no per-country page, only
// per-location pages and the Lists board.
function countryLinkLabelHtml(name) {
  return `See ${verbatim(name)}'s locations`;
}

// The chip vocabulary for each income-type state, and for the amount.
// Every one of these is neutral: "Below the stated bar" is
// not red, "Above" is not green, and all six render in the same chip
// treatment.
const TYPE_CHIP = {
  ok: "Accepts this kind of income",
  partial: "Only as backup",
  blocked: "Not this kind of income",
  not_stated: "Not recorded",
  absent: "Not recorded",
  // The coarse-record allowance. The coarseness rides the
  // type chip's own words, not a suffix on the amount chip: the figure on
  // these rows is exact and dated, and only the income-TYPE reading is
  // coarse. Hanging "coarse record" off "Above the stated bar" would tell a
  // reader the number is approximate, which is false.
  coarse_yes: "Accepts passive income (kind not broken down)",
  coarse_no: "Doesn't accept passive income",
};
const AMOUNT_CHIP = {
  above: "Above the stated bar",
  at: "Right at the line",
  below: "Below the stated bar",
};
const CONDITIONAL_SUFFIX = " — conditional";

// The reader-facing name for each income-type token, reused from Field
// C's own radio labels so the box never invents a second vocabulary for the
// same thing.
const TYPE_DISPLAY = Object.fromEntries(FIELD_C_OPTIONS.map((o) => [o.value, o.label]));
const CURRENCY_DISPLAY = { USD: "US dollars", EUR: "euros", THB: "Thai baht", OTHER: "another currency" };

// Field C's radio labels are written to open a sentence ("A pension or
// retirement income"); dropped mid-sentence they need their first letter
// lowered and nothing else. Lowercasing the whole label turned
// "income I don't work for" into "income i don't work for" — caught in a
// real render, not by reading the code.
function typeInSentence(typeToken) {
  const label = TYPE_DISPLAY[typeToken];
  return label.charAt(0).toLowerCase() + label.slice(1);
}

// The not_stated_by_source sentence, verbatim.
function notStatedSentence(typeToken) {
  return `The source this came from didn't say how this route treats ${typeInSentence(typeToken)}.`;
}
// The "field absent" sentence. An earlier version of it and the
// not_stated one above were two phrasings of the same shrug, and the
// distinction — an absent field is NOT the same state as an explicit
// not_stated_by_source marker — has to be legible to
// a reader, not just correct in the code. The difference now lives in the
// subject: the source was read and was silent, versus the site's record
// does not cover it at all.
function absentSentence(typeToken) {
  return `The site's record for this route doesn't cover ${typeInSentence(typeToken)} at all.`;
}

// Gate 2, condition 1 — the bar measures something other than income.
// The frame "sets [X] bar" became "bar is [X]", because three of the
// four phrases the table carries are
// nouns that do not take "bar" after them without reading like a typo.
function kindMismatchSentence(barPhrase) {
  return `This route's bar is ${barPhrase}, not an income one — here it is as recorded.`;
}
// Gate 2, condition 2 — there is no single figure.
const NO_NUMBER_SENTENCE = "This route's requirement isn't a single figure. As recorded:";
// The currency wall, and the box's most quietly important
// sentence: it says out loud that the site declined to give an answer it
// could not stand behind. v1 does not convert, because a pass/fail
// position against a legal bar is not cost display, and today's exchange
// rate would be the thing deciding the answer.
function currencyWallSentence(readerCurrency, rowCurrency) {
  return `Your figure is in ${CURRENCY_DISPLAY[readerCurrency]}; this route states its bar in ${CURRENCY_DISPLAY[rowCurrency]}. The site shows you both rather than converting — today's exchange rate would be the thing deciding the answer, and that isn't a fact about the route.`;
}
// The two property refusals, verbatim.
const PROPERTY_TOTAL_ASSETS_SENTENCE =
  "This route asks for total assets, not property capital, and its record doesn't say whether property counts toward the Thai-asset part.";
const PROPERTY_BANK_BALANCE_SENTENCE = "That's a bank-balance test, not a property one.";

// AUTHORED-CHOICE: the spec calls for a record block on both the
// no-type-gate path ("render the row's full income-type record
// verbatim") and the supplementary-only path ("the row's own verbatim
// record"), but gives it no heading.
const RECORD_HEADING = "What this route records about kinds of income:";
// The coarse accepts_passive_income field's own label, taking the site's
// shipped idiom from the country page (js/location.js:990-991), because
// with the coarse-record allowance adopted this field now renders on the
// gate path too — and two labels for one field on one screen is a
// reader's problem, not a tidiness one. One string, both surfaces. The
// field is a real recorded state (on TH's privilege row its value is a
// definite negative, not ignorance), so it renders rather than being
// dropped; its value is transported verbatim.
const RECORD_COARSE_LABEL = "Accepts passive income";
// The gate's own state labels, reused as the record's value words so the
// record and the chips never say the same thing two ways.
//
// Three further verbatim lines follow, on EVERY route line, in every
// state: the destination line, the age line and the coarse line. All three
// reuse the country page's own shipped idiom rather than inventing one —
// the box would otherwise say LESS about a route than the page next door
// already says about the same route, while adding a positional chip that
// page does not make.
//
// The destination line. Present on 19 of the 20 slice rows, and 7 of
// those carry a value beginning the literal token "disputed:" — all seven
// the Thai LTR categories, all seven the same 264-character string.
// Rendered in full, verbatim, on every row: no truncation, no
// first-clause fallback, no dedup, because a self-contained row is the
// honest unit and a reader may read exactly one row. What is promoted to
// body weight is ONE WORD, not forty — seven copies of the same paragraph
// at body weight is not emphasis, it is the same thing said seven times,
// and it would drown the three CONDITIONAL promotions the belt already
// spends body type on.
const CONVERTS_LABEL = "Converts to permanent residency:";
const DISPUTED_MARKER = "Disputed";
// The country page's own substitutions for the two non-answers. Authored
// tokens standing in for a value, so they sit OUTSIDE the verbatim
// wrapper: they are the site speaking, not the record. Never omitted —
// a silent row reads as "no issue here".
const CONVERTS_GAP = "Not yet researched";
const CONVERTS_ABSENT = "Not recorded";
// The age line, in the country page's own idiom (js/location.js:1007).
// Rendered only where the value is
// a real number — "0" is that file's own reasoned convention, quoted
// there: rendering it as a real age "would manufacture a claim nobody
// researched". The "[GAP]" exclusion is this box's, not that file's, which
// would render "Minimum age: [GAP] years" — broken on its face. The rows
// with no real age render NOTHING rather than a marker: no chip on this
// screen makes an age claim, so there is no false positive for the silence
// to create, and the dimension is named once at the frame in the standing
// caveat above.
const AGE_LABEL = "Minimum age:";
const AGE_SUFFIX = "years";
// The coarse line, the same shipped idiom (js/location.js:990-991).
const COARSE_LINE_LABEL = "Accepts passive income:";

const RECORD_VALUE = {
  primary_accepted: TYPE_CHIP.ok,
  supplementary_only: TYPE_CHIP.partial,
  explicitly_rejected: TYPE_CHIP.blocked,
  not_stated_by_source: TYPE_CHIP.not_stated,
};

// AUTHORED-CHOICE: the no-fall-through discipline inside Group A ("a
// covered country ... never as an empty section and never dropped")
// specifies the behaviour but not the line. Unreachable against today's
// data — all five read countries carry rows.
const EMPTY_COUNTRY_LINE = "No routes are on file for this country in the set this box reads.";

// B10 — the whole-box refusal state. AUTHORED-CHOICE: the spec
// asks for "one line" and does not write it.
const TABLE_MISMATCH_HEADING = "Your numbers";
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

// AUTHORED-CHOICE (accessible names): the spec describes the amount, the
// currency and the period as one field with one visible label, which
// leaves the two <select>s with no accessible name of their own — a
// screen reader would announce them as bare comboboxes. The visible
// label is unchanged; these names exist only in the accessibility tree.
function selectHtml(id, options, selected, ariaLabel) {
  return `<select id="${id}" aria-label="${escapeHtml(ariaLabel)}">${options
    .map((o) => `<option value="${escapeHtml(o.value)}"${o.value === selected ? " selected" : ""}>${escapeHtml(o.label)}</option>`)
    .join("")}</select>`;
}
const ARIA_CURRENCY = "Currency";
const ARIA_PERIOD = "Per month or per year";
const ARIA_PROPERTY_CURRENCY = "Currency of your property capital";

// The figure as recorded: value_num_low formatted where it is a
// finite number, otherwise the income_threshold string verbatim. No
// currency conversion is applied to either — formatNumbersInText() only
// comma-groups digit runs, and formatValue() is deliberately NOT used
// here because it appends an FX-derived approximation (B4: this box does
// no currency conversion).
function figureText(row) {
  if (Number.isFinite(row.value_num_low)) return formatNumbersInText(String(row.value_num_low));
  if (row.income_threshold != null) return formatNumbersInText(String(row.income_threshold));
  return "";
}

// The belt: every route line, in every state, renders the row's
// threshold_label, the figure as recorded, the unit in full, and the
// confidence where present. `unit` in full is what makes the three
// conditional rows safe without depending on substring detection — if a
// reader sees "does not clear on income alone" in the route's own words,
// they cannot read a chip as an answer.
function routeRowHtml(row, result, input) {
  const conditional = isConditional(row);
  const chips = [];
  // No type chip renders on a capital or none row. "Not this kind of
  // income" is a sentence
  // about an income bar; on a row that sets none it is a claim the data
  // does not make. What renders instead is Gate 2's own sentence plus the
  // row's income-type record verbatim, below.
  if (result.typeChips !== false && result.typeState && TYPE_CHIP[result.typeState]) {
    chips.push(TYPE_CHIP[result.typeState]);
  }
  // The braces, narrowed: the
  // "— conditional" suffix attaches to an AMOUNT chip and to nothing else.
  // It is a brace on the amount claim; on a row making no amount claim it
  // hedges the wrong noun, which is what the literal "last chip" rule
  // produced — "Not this kind of income — conditional". Where no amount
  // chip renders, the conditionality is already carried by the promoted
  // verbatim `unit`, which was always the belt.
  if (result.amountBand) chips.push(AMOUNT_CHIP[result.amountBand] + (conditional ? CONDITIONAL_SUFFIX : ""));
  const chipsHtml = chips.length
    ? `<p class="own-route-chips">${chips.map((c) => `<span class="own-chip">${escapeHtml(c)}</span>`).join(" ")}</p>`
    : "";

  // The explanatory sentence for whichever gate answered. Placed above
  // the figure so the spec's "followed by the row's verbatim
  // threshold_label, figure and unit" holds literally; the row diagram
  // has no slot for it either way.
  const notes = [];
  // Gate 1's two silence sentences only render where Gate 1 was allowed to
  // answer — i.e. on an income bar. On a capital or none row the record
  // block below carries whatever Gate 1 found, as a note rather than a
  // verdict.
  if (result.typeChips !== false) {
    if (result.typeState === "not_stated") notes.push(notStatedSentence(input.income_type));
    if (result.typeState === "absent") notes.push(absentSentence(input.income_type));
  }
  if (result.gate2) {
    const g = result.gate2;
    if (g.reason === "kind_mismatch") notes.push(kindMismatchSentence(g.barPhrase));
    if (g.reason === "no_number") notes.push(NO_NUMBER_SENTENCE);
    if (g.reason === "currency_wall") notes.push(currencyWallSentence(g.readerCurrency, g.rowCurrency));
    if (g.reason === "property_total_assets") notes.push(PROPERTY_TOTAL_ASSETS_SENTENCE);
    if (g.reason === "property_bank_balance") notes.push(PROPERTY_BANK_BALANCE_SENTENCE);
  }
  const notesHtml = notes.map((n) => `<p class="own-route-note">${escapeHtml(n)}</p>`).join("");

  const figure = figureText(row);
  const figureHtml = figure ? `<p class="own-route-figure">${verbatim(figure)}</p>` : "";
  // Promoted from small type to the row's body type where the unit
  // carries a CONDITIONAL clause.
  const unitHtml = row.unit
    ? `<p class="own-route-unit${conditional ? " own-route-unit-promoted" : ""}">${verbatim(row.unit)}</p>`
    : "";

  // The destination line, on every row, never omitted.
  // "Disputed" above it at body weight where the value begins the literal
  // token "disputed:": one scannable word a reader catches at a glance,
  // costing one word per row instead of forty, with the full string
  // following in the row's meta type.
  const convertsRaw = row.converts_to_pr;
  const disputed = typeof convertsRaw === "string" && convertsRaw.startsWith("disputed:");
  const convertsValueHtml = convertsRaw === undefined || convertsRaw === null || convertsRaw === ""
    ? escapeHtml(CONVERTS_ABSENT)
    : convertsRaw === "[GAP]"
      ? escapeHtml(CONVERTS_GAP)
      : verbatim(convertsRaw);
  const convertsHtml = `${disputed ? `<p class="own-route-disputed">${escapeHtml(DISPUTED_MARKER)}</p>` : ""}<p class="own-route-meta">${escapeHtml(CONVERTS_LABEL)} <strong>${convertsValueHtml}</strong></p>`;

  // The age line, only where the value is a real age.
  const ageReal = row.age_gate && row.age_gate !== "0" && row.age_gate !== "[GAP]";
  const ageHtml = ageReal
    ? `<p class="own-route-meta">${escapeHtml(AGE_LABEL)} <strong>${verbatim(row.age_gate)}</strong> ${escapeHtml(AGE_SUFFIX)}</p>`
    : "";

  // The coarse-record line — the site's own shipped line, rendered
  // whichever way the coarse field answered.
  const coarseHtml = (result.typeState === "coarse_yes" || result.typeState === "coarse_no") && result.coarseValue
    ? `<p class="own-route-meta">${escapeHtml(COARSE_LINE_LABEL)} <strong>${verbatim(result.coarseValue)}</strong></p>`
    : "";

  // The row's own income-type record, verbatim, where the reader ran no
  // type gate, where the row accepts their income only as backup, or on
  // any row whose bar is not an income bar, where an
  // explicitly_rejected value is not a verdict but a recorded note that
  // income of that kind does not substitute for the asset the route tests.
  let recordHtml = "";
  if (result.typeState === "ungated" || result.typeState === "partial" || result.typeChips === false) {
    const record = incomeTypeRecord(row);
    if (record.length) {
      recordHtml = `
        <div class="own-route-record">
          <p class="own-route-record-heading">${escapeHtml(RECORD_HEADING)}</p>
          <ul>${record.map((e) => {
            const label = e.kind === "granular" ? TYPE_DISPLAY[e.token] : RECORD_COARSE_LABEL;
            // RECORD_VALUE maps a stored token to this feature's own state
            // label — authored copy standing in for a value, so it sits
            // OUTSIDE the wrapper. A token the ratified vocabulary does not
            // hold has no authored label to stand in for it and renders as
            // the record's own words, inside the wrapper.
            const valueHtml = e.kind === "granular"
              ? (RECORD_VALUE[e.value] ? escapeHtml(RECORD_VALUE[e.value]) : verbatim(e.value))
              : verbatim(e.value);
            return `<li>${escapeHtml(label)} — ${valueHtml}</li>`;
          }).join("")}</ul>
        </div>`;
    }
  }

  // The site's existing confidence idiom, reused rather than reinvented,
  // now carrying the row's own date beside it in the
  // same fact-meta scope-tag idiom the location page uses. A single footer
  // date states a freshness none of these twenty rows individually has, on
  // a screen whose own copy calls them dated snapshots.
  // Non-interactive: the click-to-expand source affordance belongs to the
  // pages that wire its delegated listener, and this panel does not.
  const badgeHtml = row.confidence || row.source_count
    ? confidenceBadge({ confidence: row.confidence, source_count: row.source_count }, { interactive: false })
    : "";
  const dateHtml = row.date ? `<span class="scope-tag">${verbatim(row.date)}</span>` : "";
  const metaHtml = badgeHtml || dateHtml
    ? `<div class="fact-meta">${badgeHtml} ${dateHtml}</div>`
    : "";

  return `
    <div class="own-route">
      <p class="own-route-name">${verbatim(row.threshold_label || row.route_key)}</p>
      ${chipsHtml}
      ${notesHtml}
      ${figureHtml}
      ${unitHtml}
      ${convertsHtml}
      ${ageHtml}
      ${coarseHtml}
      ${recordHtml}
      ${metaHtml}
    </div>`;
}

// Whether the figures kept on this device are the same figures the
// reader is looking at — field by field, including the optional property
// capital, whose PRESENCE is as much a part of the answer as its amount.
// A stored object always carries created_at/updated_at that the on-screen
// input has no counterpart for, so this compares the answered fields
// rather than the two objects.
function savedMatchesInput(saved, input) {
  if (!saved || !input) return false;
  if (saved.amount !== input.amount) return false;
  if (saved.currency !== input.currency) return false;
  if (saved.period !== input.period) return false;
  if (saved.income_type !== input.income_type) return false;
  if (saved.duration_band !== input.duration_band) return false;
  const savedProperty = saved.property_capital;
  const inputProperty = input.property_capital;
  if (Boolean(savedProperty) !== Boolean(inputProperty)) return false;
  if (savedProperty && inputProperty) {
    if (savedProperty.amount !== inputProperty.amount) return false;
    if (savedProperty.currency !== inputProperty.currency) return false;
  }
  return true;
}

// listsHref: the destination the sixteen refused countries link to.
// AUTHORED-CHOICE: the spec says each of the sixteen links "to its existing
// country/location surface", and the site has no per-country page — only
// per-location pages and the Lists board. The board is the honest
// destination; picking one arbitrary location for a country that has five
// of them would not be. The door passes the resolved URL in, so this
// module never builds one itself (B1: no URL is constructed here, and
// nothing derived from a reader field ever reaches an href).
export function createOwnNumbersWing({ panel, store, listsHref, onBack, onOpenPassport }) {
  const allRoutes = [].concat(...[...store.visaRoutesByCountry.values()]);
  // B10 — the lookup table is asserted, not trusted. A mismatch puts
  // the whole box in its refusal state with one line, rather than a
  // partial answer built on a stale key.
  const tableCheck = assertRouteBarTable(allRoutes);
  const slice = sliceRoutes(allRoutes);

  function wireBack(handler) {
    const btn = panel.querySelector("#own-back");
    if (btn) btn.addEventListener("click", handler);
  }

  function renderTableMismatch() {
    panel.innerHTML = `
      <button type="button" class="door-back" id="own-back">${escapeHtml(BACK_LABEL_INPUT)}</button>
      <div class="own-numbers-box">
        <h2 class="door-passport-heading">${escapeHtml(TABLE_MISMATCH_HEADING)}</h2>
        <p class="own-route-note">${escapeHtml(TABLE_MISMATCH_LINE)}</p>
      </div>`;
    wireBack(onBack);
    panel.focus();
  }

  // ---- the input screen ----
  function renderInput(prefill) {
    if (!tableCheck.ok) { renderTableMismatch(); return; }
    const saved = prefill || loadOwnNumbers();
    const hasProperty = Boolean(saved && saved.property_capital);

    panel.innerHTML = `
      <button type="button" class="door-back" id="own-back">${escapeHtml(BACK_LABEL_INPUT)}</button>
      <div class="own-numbers-box">
        <h2 class="door-passport-heading">${escapeHtml(INPUT_HEADING)}</h2>
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
              ${selectHtml("own-property-currency", CURRENCY_OPTIONS, hasProperty ? saved.property_capital.currency : "USD", ARIA_PROPERTY_CURRENCY)}
            </div>
            <p class="own-field-note" id="own-property-note" hidden>${escapeHtml(FIELD_D_INCOMPLETE_NOTE)}</p>
          </div>
        </div>

        <p class="own-field-note">${escapeHtml(COVERAGE_LINE)}</p>
        <button type="button" class="door-escape door-passport-save" id="own-submit" disabled>${escapeHtml(SUBMIT_LABEL)}</button>
        <div class="own-limits">${LIMITS_LINES.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}</div>
      </div>`;

    wireBack(onBack);

    const amount = panel.querySelector("#own-amount");
    const currency = panel.querySelector("#own-currency");
    const period = panel.querySelector("#own-period");
    const propToggle = panel.querySelector("#own-property-toggle");
    const propGroup = panel.querySelector("#own-property-group");
    const propAmount = panel.querySelector("#own-property-amount");
    const propCurrency = panel.querySelector("#own-property-currency");
    const submit = panel.querySelector("#own-submit");
    const localNote = panel.querySelector("#own-local-note");
    const currencyNote = panel.querySelector("#own-currency-note");
    const propertyNote = panel.querySelector("#own-property-note");

    // Readers type "2,400" and "2 400". Stripping separators at PARSE
    // time is not the "thousands-separator coercion on keystroke" the
    // spec forbids — nothing is rewritten in the field as they type; the
    // figure they see is the figure they entered.
    const parseAmount = (el) => {
      const raw = String(el.value).replace(/[,\s]/g, "").trim();
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const checkedValue = (name) => {
      const el = panel.querySelector(`input[name="${name}"]:checked`);
      return el ? el.value : null;
    };

    // The same syncSave() idiom renderPassportBox() already uses: the
    // submit stays disabled until the box can actually answer.
    // Ticking the optional capital box and leaving the amount empty is
    // the reader saying something the box then quietly dropped: the
    // figure never reached the answer and nothing on screen said so. The
    // optional field is optional to TICK, not optional to finish, so it
    // holds the button the same way every required field does.
    const sync = () => {
      const propertyIncomplete = propToggle.checked && !parseAmount(propAmount);
      submit.disabled = !(parseAmount(amount) && checkedValue("own-duration") && checkedValue("own-type"))
        || propertyIncomplete;
      localNote.hidden = checkedValue("own-type") !== "local_active";
      currencyNote.hidden = currency.value !== "OTHER";
      propGroup.hidden = !propToggle.checked;
      propertyNote.hidden = !propertyIncomplete;
    };
    amount.addEventListener("input", sync);
    currency.addEventListener("change", sync);
    period.addEventListener("change", sync);
    propToggle.addEventListener("change", sync);
    propAmount.addEventListener("input", sync);
    panel.querySelectorAll('input[type="radio"]').forEach((r) => r.addEventListener("change", sync));
    sync();

    submit.addEventListener("click", () => {
      const value = parseAmount(amount);
      if (!value) return;
      const input = {
        amount: value,
        currency: currency.value,
        period: period.value,
        income_type: checkedValue("own-type"),
        duration_band: checkedValue("own-duration"),
      };
      // property_capital is absent entirely unless the reader ticked the
      // box AND entered a figure — never null, never 0, which is the
      // ruled storage shape.
      const propValue = propToggle.checked ? parseAmount(propAmount) : null;
      if (propValue) input.property_capital = { amount: propValue, currency: propCurrency.value };
      // "A visit" does not run the income comparison at all.
      if (input.duration_band === "visit") renderVisitPanel(input);
      else renderResult(input);
    });

    panel.focus();
  }

  // ---- the visit branch ----
  function renderVisitPanel(input) {
    panel.innerHTML = `
      <button type="button" class="door-back" id="own-back">${escapeHtml(BACK_LABEL_RESULT)}</button>
      <div class="own-numbers-box">
        <h2 class="door-passport-heading">${escapeHtml(INPUT_HEADING)}</h2>
        <p class="own-perspective">${escapeHtml(VISIT_PERSPECTIVE_LINE)}</p>
        <p>${escapeHtml(VISIT_PANEL_LINE)}</p>
        <button type="button" class="door-escape" id="own-to-passport">${escapeHtml(VISIT_PANEL_BUTTON)}</button>
      </div>`;
    wireBack(() => renderInput(input));
    const btn = panel.querySelector("#own-to-passport");
    const go = () => onOpenPassport();
    btn.addEventListener("click", go);
    btn.addEventListener("keydown", (e) => { if (isActivationKey(e)) { e.preventDefault(); go(); } });
    panel.focus();
  }

  // ---- the result screen ----
  function renderResult(input) {
    // Group A: the five read countries, alphabetical by display name —
    // never ordered by how well the reader does, which would make the box
    // a ranking it has no grounds to be.
    const readCountries = store.countries
      .filter((c) => READ_SET.includes(c.country_id))
      .sort((a, b) => a.name.localeCompare(b.name));

    const groupAHtml = readCountries.map((country) => {
      const rows = slice.filter((r) => r.country_id === country.country_id);
      const evaluated = orderRows(rows.map((row) => ({ row, result: evaluateRow(row, input) })));
      const body = evaluated.length
        ? evaluated.map((e) => routeRowHtml(e.row, e.result, input)).join("")
        : `<p class="own-route-note">${escapeHtml(EMPTY_COUNTRY_LINE)}</p>`;
      // The heading links out, in the same
      // idiom Group B's sixteen use. The country surface carries more about
      // every one of these routes than this box does. The link is built
      // from listsHref, which the door resolves and passes in — nothing
      // derived from a reader field ever reaches an href (B1).
      return `<section class="own-country"><h4 class="own-country-heading">${verbatim(country.name)} <a class="own-country-link" href="${listsHref}">${countryLinkLabelHtml(country.name)}</a></h4>${body}</section>`;
    }).join("");

    // Group B: derived at runtime as every country minus the read set,
    // never hardcoded — a new country appears as a refusal on day one
    // rather than vanishing. Open on first paint, at full type size,
    // never behind a "show more".
    const refused = store.countries
      .filter((c) => !READ_SET.includes(c.country_id))
      .sort((a, b) => a.name.localeCompare(b.name));
    const groupBHtml = refused
      .map((c) => `<li><a href="${listsHref}">${verbatim(c.name)}</a></li>`)
      .join("");

    const nationality = loadNationality();
    const nationalityName = nationality ? ISO_COUNTRY_NAMES[nationality.code] : null;
    const passportHtml = nationalityName
      ? `<p class="own-perspective-note">${passportSavedLineHtml(nationalityName)}</p>`
      : "";

    const snapshot = store.meta && store.meta.extracted_at
      ? `<p class="own-footer">Snapshot extracted ${verbatim(store.meta.extracted_at)}.</p>`
      : "";

    panel.innerHTML = `
      <button type="button" class="door-back" id="own-back">${escapeHtml(BACK_LABEL_RESULT)}</button>
      <div class="own-numbers-box own-result">
        <h2 class="door-passport-heading">${escapeHtml(RESULT_HEADING)}</h2>
        <p class="own-perspective">${escapeHtml(PERSPECTIVE_LINE)}</p>
        ${passportHtml}
        <p class="own-caveat">${escapeHtml(STANDING_CAVEAT)}</p>
        <p class="own-field-note">${escapeHtml(BAND_SENTENCE)}</p>

        <h3 class="own-group-heading">${escapeHtml(GROUP_A_HEADING)}</h3>
        ${groupAHtml}

        <h3 class="own-group-heading">${escapeHtml(GROUP_B_HEADING)}</h3>
        <p class="own-refusal-line">${escapeHtml(GROUP_B_SENTENCE)}</p>
        <ul class="own-refusal-list">${groupBHtml}</ul>

        <div class="own-save" id="own-save-block"></div>
        ${snapshot}
      </div>`;

    wireBack(() => renderInput(input));
    renderSaveBlock(input);
    panel.focus();
  }

  // The opt-in save, rendered at the foot of the result screen.
  // B9 — storage unavailable never blocks the render: the box works
  // fully and the control says plainly why it can't offer a save.
  function renderSaveBlock(input) {
    const block = panel.querySelector("#own-save-block");
    if (!block) return;
    const available = isReaderStorageAvailable();
    // The tick means "these figures are kept on this device", so it is
    // ticked only when what is stored IS these figures. Testing merely
    // that SOMETHING is stored ticked the box for a returning reader who
    // had just changed their figures and read the new answer — a ticked
    // box over an old number, and nothing saved.
    const saved = loadOwnNumbers();
    const savedIsThis = savedMatchesInput(saved, input);
    const savedIsDifferent = Boolean(saved) && !savedIsThis;
    block.innerHTML = `
      <label class="priority-choice own-choice">
        <input type="checkbox" id="own-save-toggle"${savedIsThis ? " checked" : ""}${available ? "" : " disabled"}>
        <span>${escapeHtml(SAVE_LABEL)}</span>
      </label>
      <p class="own-field-note">${escapeHtml(SAVE_NOTE)}</p>
      ${savedIsDifferent ? `<p class="own-field-note">${escapeHtml(SAVE_DIFFERS_LINE)}</p>` : ""}
      ${available ? "" : `<p class="own-field-note">${escapeHtml(SAVE_UNAVAILABLE_LINE)}</p>`}
      ${available && hasAnySavedReaderState()
        ? `<button type="button" class="door-link-btn" id="own-forget">${escapeHtml(FORGET_LABEL)}</button>`
        : ""}`;

    const toggle = block.querySelector("#own-save-toggle");
    toggle.addEventListener("change", () => {
      if (toggle.checked) {
        const ok = saveOwnNumbers(input);
        if (!ok) {
          toggle.checked = false;
          toggle.disabled = true;
          block.insertAdjacentHTML("beforeend", `<p class="own-field-note">${escapeHtml(SAVE_UNAVAILABLE_LINE)}</p>`);
          return;
        }
      } else {
        clearOwnNumbers();
      }
      renderSaveBlock(input);
    });

    const forget = block.querySelector("#own-forget");
    // In-panel re-render on completion, never a reload: B1 forbids this
    // screen depending on a round trip, and a reload here would also throw
    // away figures the reader may not have chosen to save.
    // The whole result panel is redrawn, not just this block: forgetting
    // clears the saved passport too, and the line above the results that
    // names that passport was painted when the panel was built. Redrawing
    // one corner left that line on screen describing something that no
    // longer exists.
    if (forget) wireForgetControl(forget, { onDone: () => renderResult(input) });
  }

  return { render: () => renderInput(null), tableCheck };
}
