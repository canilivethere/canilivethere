// CanILiveThere — the reader's own lens.
//
// Door v2, A4/A5/A6. One module, three jobs, all of them about ONE
// question: whose eyes is this page showing?
//
//   1. Compose the reader's own verdict rows into the SAME index the
//      eight worked examples already live in (A5: feed the reader into
//      what the profiles feed, never a second pipeline).
//   2. Render the perspective line that replaced the profile bar on every
//      page (A6, and the perspective-disclosure law it turns on).
//   3. Hold the index (view) the reader picked, so switching it doesn't
//      reset and it travels between the map and the Lists (A8).
//
// WHAT THIS FILE AUTHORS: nothing factual. Every figure, threshold, unit,
// condition and route name that reaches a reader comes verbatim out of
// derived/visa-routes.jsonl through js/own-numbers-data.js's gates — the
// same gates, the same order, the same shipped code the box already ran
// on its own result screen. What is new here is where the ANSWER goes:
// into store.verdictsByPersona, under one reader identity, in the
// engine's own row shape, so every consumer renders it through the same
// calls it renders Teo through.
//
// WHY THE COMPOSER IS CLIENT-SIDE AND HAS TO BE: the eight profiles'
// verdicts are a table the browser downloads (derived/verdicts.jsonl,
// produced offline by the Python engine). The reader's figures exist only
// in this browser and reach no server, ever — so there is no table for
// them and there cannot be one. The precedent is already shipped:
// store.customWeights is a reader-authored input layered onto a built
// store, and personaIndex("custom", …) recomputes a real number from it
// client-side. This does for the VERDICT what that already does for the
// WEIGHTS.
//
// Imports js/own-numbers-data.js (the box's engine half: pure functions
// over plain data, no DOM, no network). It deliberately does NOT import
// js/own-numbers.js (the render half, 1,000 lines of box markup) — that
// stays index.html-only, reached through the door.

import {
  loadOwnNumbers, loadNationality,
  keepBlockHtml, wireKeepBlock, KEEP_BLOCK_HEADING,
  isExplicitGeneral, hasReaderInput,
  personaDescriptorSentence, personaDisplayLabel, escapeHtml,
  DISCLAIMER_DETAILS_HTML, READER_ID,
} from "./app-shared.js";
import { ISO_COUNTRY_NAMES } from "./iso-names.js";
import { resolveVerdict } from "./data.js";
import { bandVisual, indexToColor, isGapValue } from "./colors.js";
// The store-value token vocabulary, from its one home — itemIncomeKinds()
// below compares a stored value against two named tokens rather than
// retyping the literals.
import { TOKENS } from "./reader-strings.js";
import {
  READ_SET, sliceRoutes, evaluateRow, isValidOwnNumbers, assertRouteBarFields, barForRow,
  // Added by the margin crossing: the reader's own figure is normalised
  // into the bar's period by the SAME toPeriod() Gate 2 used, and the bar
  // is brought back into the reader's currency by the SAME convertAmount()
  // — never a second arithmetic that could disagree with the band.
  toPeriod, convertAmount,
} from "./own-numbers-data.js";

// ---------------------------------------------------------------------
// 1. The reader's rows
// ---------------------------------------------------------------------

// The six reader-only `overall_state` tokens (app-shared.js's own
// STATE_HEADLINE / STATE_HEADLINE_BAND carry their sentences and their
// bands). Named here as constants so a typo is a reference error rather
// than a silently unrendered state.
const S_ABOVE = "READER_ABOVE_BAR";
// S_AT_LINE is RETIRED (Cap, 2026-10-07: "clearing the bar is clearing").
// Nothing composes it, nothing bands it and nothing has a sentence for it
// any more — see app-shared.js's own retirement block for the four
// strings. The population split by direction: at-or-above the bar is
// S_ABOVE / S_ABOVE_CONDITIONAL carrying a closeness note, below the bar
// is S_BELOW carrying its shortfall.
const S_ABOVE_CONDITIONAL = "READER_ABOVE_CONDITIONAL";
const S_BELOW = "READER_BELOW_BAR";
const S_WRONG_TYPE = "READER_WRONG_TYPE";
const S_NOT_ENOUGH = "READER_NOT_ENOUGH";
// The mixed hard_fail case — see the long note on this state in
// app-shared.js's STATE_HEADLINE. Reachable on today's data, measured.
const S_NONE_CLEARS = "READER_NONE_CLEARS";
// The three partial-read partners of the three states above that make a
// claim about EVERY route. See the long note on
// composeCountryState() below for the defect and its measurement.
const S_BELOW_SOME_UNREAD = "READER_BELOW_SOME_UNREAD";
const S_WRONG_TYPE_SOME_UNREAD = "READER_WRONG_TYPE_SOME_UNREAD";
const S_NONE_CLEARS_SOME_UNREAD = "READER_NONE_CLEARS_SOME_UNREAD";
// Added by the conversion crossing: reuses the already-registered engine
// token rather than adding a new reader-only state. A route lands here when
// Gate 2 needed to convert the reader's figure into the bar's currency
// and js/own-numbers-data.js's convertAmount() came back null — the row
// absent, the pair missing, or the one rate consulted stale.
const S_FX_UNAVAILABLE = "UNCERTAIN_FX_UNAVAILABLE";

const STATE_BAND = {
  [S_ABOVE]: "clean",
  [S_ABOVE_CONDITIONAL]: "uncertain_or_conditional",
  [S_BELOW]: "hard_fail",
  [S_WRONG_TYPE]: "hard_fail",
  [S_NOT_ENOUGH]: "data_gap",
  [S_NONE_CLEARS]: "hard_fail",
  // The three partial states band uncertain_or_conditional, so the pin
  // and Lists agree. This table is the one that decides it; app-shared.js's STATE_HEADLINE_BAND carries
  // the same three entries and is changed with it, so the map legend, the
  // Lists banding and the location chip cannot disagree.
  //
  // SUPERSEDES this build's own earlier hard_fail, recorded in the note
  // above app-shared.js's copy of this table. The defect was reached from
  // two opposite ends — once from the strings, once from the colour
  // ("leans more certain than its own sentence").
  [S_BELOW_SOME_UNREAD]: "uncertain_or_conditional",
  [S_WRONG_TYPE_SOME_UNREAD]: "uncertain_or_conditional",
  [S_NONE_CLEARS_SOME_UNREAD]: "uncertain_or_conditional",
  // Matches app-shared.js's STATE_HEADLINE_BAND entry for this same
  // already-registered token, one meaning, two tables, per this table's
  // own standing rule (comment above).
  [S_FX_UNAVAILABLE]: "uncertain_or_conditional",
};

// Does this reader row carry an eligibility ANSWER, or only ignorance?
// The one place that line is drawn, because three surfaces need the same
// answer and three copies of it would drift.
//
// WHAT THIS IS NO LONGER. Under the superseded build this predicate was
// the map's PAINT switch — true replaced the fit fill with
// the band colour. It is not that anymore. Under the overlay the fill is
// the fit index on all 38 unconditionally and the mark's presence keys
// off the verdict row EXISTING (readerPinPaint's `read`), so this
// predicate no longer decides any colour on the map at all.
//
// WHAT IT STILL DECIDES: whether a row carries a directional answer, for
// the surfaces whose WORDS need that and not a colour.
//
// The line is the data_gap band and nothing else, ARGUED not defaulted:
//   - No row at all (a country outside the read set) — no verdict object,
//     so this is false by construction. The 26.
//   - data_gap (READER_NOT_ENOUGH) — read country, nothing the record
//     could answer with. Real, and now visible on the map in its own
//     right: it is a read, so it gets a mark, in the gap colour.
//   - hard_fail, and the three partial-read states, re-banded to
//     uncertain_or_conditional — a directional answer either way. The colour is coarse ("colour answers roughly what kind, text
//     answers exactly what", app-shared.js L560-575) and the state's own
//     sentence carries the exact scope, including which routes could not
//     be read.
//
// THE DOUBT THIS COMMENT USED TO CARRY IS CLOSED, and not by this file:
// it read that treating a partial read as an answer cost "a coarse
// colour that leans more certain than the sentence under it". That was
// the defect the re-band above fixed. The record of it stays because the
// reasoning is what earned the change.
export function readerVerdictHasAnswer(verdict) {
  return !!verdict && verdict.overall_band !== "data_gap";
}

// Where a route's per-person basis is not on file, the reader's verdict
// DECLARES the assumption rather than refusing on it — the box has no
// dependents field, so there is nothing for it to refuse with. This is
// the condition that fires that sentence; the sentence itself is
// READER_BASIS_DECLARED_LINE in app-shared.js.
//
// MEASURED on the shipped derived/visa-routes.jsonl: no route
// row carries any per-person / per-household / household-size field at
// all — not on GT:route:digital-nomad-visa, not on any of the twenty in
// the slice — so this returns false for every route today and the
// declaration fires on every reader verdict. It is written as a field
// test rather than a constant `false` so that it retires itself: the day
// a real `bar_basis` field lands on the route rows, the rows that state
// their basis stop declaring an assumption and start
// reporting a fact, with no edit here.
export function routeBarBasisOnFile(row) {
  return typeof row.bar_basis === "string" && row.bar_basis.trim() !== "";
}

// True when at least one route behind this country's reader verdict has
// no basis on file AND a comparison actually ran — i.e. the declaration
// applies to the read.
//
// THE SECOND CONDITION, AND WHY IT IS A CONDITION AND NOT A REWORDING.
// The sentence declares the basis of a computation. On a `data_gap`
// country no amount reading happened at all — the field was absent, the
// source was silent, the route states no single figure, the bar measures
// something other than income — so there is no comparison for a
// per-person assumption to qualify, and the line was describing a
// computation that never ran. On a cold walk (pre-conversion; NOT
// re-measured against this crossing's own engine, so treat as history
// rather than a current count) it rode all twelve marked pins, including
// the two that passed; it is removed from ten and KEPT on the two,
// because a clean pass computed against a bar that might be a household
// bar is exactly the claim that needs its assumption declared. Designing
// it off the passes would be honesty designed out of view.
// CORRECTED BY THE CONVERSION CROSSING: "the bar was in another currency" dropped from
// the cause list — that cause now converts, or lands
// UNCERTAIN_FX_UNAVAILABLE (uncertain_or_conditional, not data_gap), so
// it no longer belongs among the data_gap causes named here.
//
// It takes the LOCATION, not the country id, so the band it tests is the
// one the reader is actually looking at and all three surfaces — map
// tooltip, Lists, location page — agree by construction rather than by
// three matching edits.
//
// RETIRES ITSELF ONCE MORE, NOT TWICE: the second retirement condition
// this note used to name — "when the currency read makes the ten
// readable" — is the event the conversion crossing itself is. What
// remains is the one real retirement left: when a real `bar_basis` field
// lands on the route rows.
export function readerBasisIsAssumed(store, loc) {
  if (!loc) return false;
  const verdict = resolveVerdict(store, READER_ID, loc);
  if (!readerVerdictHasAnswer(verdict)) return false;
  const rows = store.visaRoutesByCountry.get(loc.country_id) || [];
  const slice = sliceRoutes(rows);
  if (!slice.length) return false;
  return slice.some((row) => !routeBarBasisOnFile(row));
}

// Composition rank — what-is-open leads, then a maybe, then a no, then
// ignorance. This is the order v1's own row sort already uses and the
// order the door's verdict rules require ("a maybe never wears the pass
// token"; "what-is-open leads").
//
// THE CLIENT'S RULE, PENDING A READ OF THE ENGINE. Whether "best route
// wins" reproduces the fit engine's own composition is not settled here:
// nobody on this build opened that file. If the engine's rule differs, the engine's rule wins and
// this one is struck: the client must not become a second engine with an
// opinion of its own.
const BAND_RANK = { clean: 0, uncertain_or_conditional: 1, hard_fail: 2, data_gap: 3 };

// One route row's v1 outcome, mapped onto the reader's vocabulary.
// Transport, not interpretation: every branch below reads a field the shipped
// evaluateRow() already set, and sets no number of its own.
export function readerStateForRow(result) {
  // TWO BAND VALUES, ONE STATE PAIR. "above" and "above_near" both clear
  // the bar, so both take the same token and the same band — the
  // near-line reading is a note on a yes, not a third verdict. Which of
  // the two the row carried is read later, off `result.amountBand`, by
  // aboveBarKindSummary(); it does not reach the state vocabulary at all,
  // which is what keeps the legend, the bands and the short forms from
  // gaining a row apiece for one qualifier.
  //
  // The CONDITIONAL branch is unchanged and now serves both: Thailand's
  // three LTR reduced-bar routes (USD 40,000/year, whose `unit` carries
  // CONDITIONAL) keep their condition whether they clear by a lot or only
  // just — which is the case the retired at-the-line state could not
  // express without a token of its own.
  if (result.amountBand === "above" || result.amountBand === "above_near") {
    return result.conditional ? S_ABOVE_CONDITIONAL : S_ABOVE;
  }
  if (result.amountBand === "below") return S_BELOW;
  // Added by the conversion crossing: a currency mismatch that COULD have been converted
  // but wasn't — the row absent, the pair missing, or the rate stale — is
  // its own state now, distinct from ignorance-about-the-record. Checked
  // before the type-refusal branch below on principle, though the two
  // never actually collide: Gate 1's blocked/coarse_no return ends the
  // row before Gate 2 ever runs, so result.gate2 is never set on a row
  // reaching that branch.
  if (result.gate2 && result.gate2.reason === "fx_unavailable") return S_FX_UNAVAILABLE;
  // No amount reading at all. A route the reader's kind of income is
  // refused on is a real, recorded negative; everything else — the field
  // is absent, the source was silent, the bar isn't a single figure, the
  // bar measures something other than income — is ignorance, not a no
  // (v1 §1.2a's own rule). "the bar is in another currency" DELETED from
  // this note: that cause now converts or lands S_FX_UNAVAILABLE above,
  // never here.
  if (result.typeState === "blocked" || result.typeState === "coarse_no") return S_WRONG_TYPE;
  return S_NOT_ENOUGH;
}

// Compose one country's route states into one country state.
export function composeCountryState(routeStates) {
  if (!routeStates.length) return null;
  let best = null;
  for (const st of routeStates) {
    if (best === null || BAND_RANK[STATE_BAND[st]] < BAND_RANK[STATE_BAND[best]]) best = st;
  }
  const bestBand = STATE_BAND[best];
  if (bestBand !== "hard_fail") return best;
  // Inside hard_fail the spec's two sentences make different claims and
  // BOTH say "every" — so each is true only when the refusals are all of
  // one kind. Measured against the live data, they are not always: a
  // country can refuse one route on the reader's income KIND and another
  // on their FIGURE in the same read. That third case gets its own state
  // rather than borrowing a sentence that would be false on it.
  //
  // THE EVERY-ROUTE DEFECT, AND THE FIX. The three sentences below claim
  // something about EVERY route in the country. An earlier version built
  // them from `refusals` alone — every route that
  // could NOT be read was filtered out before the claim was tested — so a
  // country with one refusing route and two unreadable ones printed a
  // sentence about all three. Measured on the shipped data over a
  // 1,800-country-read grid: 251 false sentences (a second grid on a
  // different amount ladder measured 263), on all five of the countries
  // the box read AT THE TIME — the grid is a dated measurement, not a
  // statement of today's scope; the box reads all 21 since 2026-10-20.
  // GT at $300/month pension is the clean case: two of three routes have
  // no readable bar, and the page said "Below the bar every route here
  // sets."
  //
  // A claim about every route may only be made where every route was
  // read. `unread` is that test, and it is not "some other band" — when
  // the best band is hard_fail the only bands a sibling can hold are
  // hard_fail and data_gap (anything better would have won `best`), so a
  // data_gap sibling IS an unread route, exactly.
  const refusals = routeStates.filter((st) => STATE_BAND[st] === "hard_fail");
  const unread = routeStates.some((st) => STATE_BAND[st] === "data_gap");
  const wrongType = refusals.some((st) => st === S_WRONG_TYPE);
  const below = refusals.some((st) => st === S_BELOW);
  if (wrongType && below) return unread ? S_NONE_CLEARS_SOME_UNREAD : S_NONE_CLEARS;
  if (wrongType) return unread ? S_WRONG_TYPE_SOME_UNREAD : S_WRONG_TYPE;
  return unread ? S_BELOW_SOME_UNREAD : S_BELOW;
}

// WHICH KIND OF BAR THE READER WAS ACTUALLY MEASURED AGAINST — the one
// fact the composed below-sentence needs and never had.
//
// THE DEFECT THIS EXISTS FOR, found on the rendered site, not in review:
// a reader with a EUR income and USD capital, on a country whose two
// INCOME routes both hit the currency wall and went unread, was told
// "Below the income bar on every route here the site could read." The
// only route that could be read set a CAPITAL bar — an asset threshold
// their income never entered. Every quantifier in that sentence was
// true; the four words naming the instrument were not.
//
// composeCountryState() takes state tokens and nothing else, so no
// wording could reach this: the fact is absent from the composer's whole
// input. It is NOT absent from the call site — evaluateRow() has set
// `result.barKind` on every entry since the capital path was built. This
// function is that fact, summarised over exactly the routes the sentence
// is about.
//
// NO NEW STATE TOKEN, and that boundary is the ruling's, not a
// preference: READER_BELOW_BAR and READER_BELOW_SOME_UNREAD keep their
// tokens, their hard_fail band, their legend rows and their
// STATE_HEADLINE_BAND entries. Only the TEXT behind an existing token
// varies, selected by this summary.
//
// Returns null when no route was read-and-below (so every non-below
// state is untouched), otherwise { kind, phraseKey }:
//   kind "income"  - every below route measured income. The shipped
//                    sentence is already true; it is kept verbatim.
//   kind "capital" - every below route measured capital.
//   kind "mixed"   - both, and the sentence may name neither instrument.
// `phraseKey` is the below-capital bar's own `property_rule`, and it is
// carried as a KEY rather than as words: app-shared.js's
// CAPITAL_BAR_PHRASE turns it into English beside the other reader
// strings, so no sentence about an instrument lives in a data module.
//
// THE SINGULAR "that bar" IS GUARDED ON THE COUNT OF ROUTES, NOT ON THE
// PHRASES BEING DISTINCT. It used to be the other way round, and the
// claim it rested on — "the four phrases are pairwise distinct, so two
// capital routes read and below necessarily differ and the phrase falls
// away" — was a true property of a hand table and cannot survive a
// key-shaped vocabulary: two routes can now share one key, and a naive
// port would print one instrument's word over another's bar (measured:
// a below-set of {DTV, WGC} drops one null, leaves one phrase, and calls
// a bank balance a total-assets test). So the guard counts the routes the
// sentence is about. Measured: no capital route reaches a band at all
// while every row's `property_rule` is "unstated", so the
// below-capital set holds at most one route on today's data — the guard is
// what makes the singular a property of the sentence rather than a
// property of the data.
export function belowBarKindSummary(entries) {
  const below = entries.filter((e) => e.state === S_BELOW);
  if (!below.length) return null;
  const kinds = new Set(below.map((e) => e.result.barKind));
  const kind = kinds.size > 1 ? "mixed" : [...kinds][0];
  if (kind !== "capital") return { kind, phraseKey: null };
  return { kind, phraseKey: below.length === 1 ? (barForRow(below[0].row) || {}).propertyRule ?? null : null };
}

// WHICH KIND OF BAR THE ABOVE-THE-BAR CLAIM IS ABOUT, and what that bar
// asks the money to do. Same mechanism as belowBarKindSummary() above: one
// existing token, two readings, selected by a summary carried beside the
// state — no new state, no new band, no schema change.
//
// WHY IT EXISTS. "Above the bar this route sets" is true of an income bar,
// which is met by earning the figure. A capital bar on these rows is
// compared against a figure the reader HOLDS, and where the route asks for
// that amount to be put into something, holding it is not meeting it — so
// the same sentence carries a different claim, and the shipped one
// overstates what the reader has done.
//
// READ OFF THE DECIDING ENTRY, not off the set: the sentence says "this
// route" and the margin beside it names that same route, so the two must be
// the same row. Returns null where there is nothing to vary — the shipped
// sentence then renders through the same no-summary path it always did.
//
// `condition` is the deciding row's own `capital_instrument_condition`,
// carried as the exported key and never as words; app-shared.js turns it
// into English where the rest of the reader's sentences live.
//
// IT NOW CARRIES A SECOND FACT, `nearLine`, and it is the same mechanism
// doing the same job: the band's third value ("above_near") says the
// reader cleared from inside the near-line band, and app-shared.js's
// closeness note and its ", only just" short twin are selected by it.
// It rides HERE rather than becoming a state because clearing is
// clearing — a qualifier on a yes must not be able to colour a pin, band
// a Lists row or earn a legend line of its own.
//
// `state` is which above-family token the country composed to, passed in
// rather than assumed, because READER_ABOVE_CONDITIONAL's rows need the
// closeness exactly as READER_ABOVE_BAR's do and they carry a different
// token. Defaulted to S_ABOVE so an existing two-argument caller is
// unchanged.
export function aboveBarKindSummary(entries, deciding, state = S_ABOVE) {
  const above = entries.filter((e) => e.state === state);
  if (!above.length) return null;
  const chosen = deciding && deciding.state === state ? deciding : above[0];
  const bar = barForRow(chosen.row);
  const capital = !!(bar && bar.kind === "capital");
  const nearLine = chosen.result.amountBand === "above_near";
  if (!capital && !nearLine) return null;
  return {
    ...(capital ? { kind: "capital", condition: chosen.row.capital_instrument_condition || null } : {}),
    ...(nearLine ? { nearLine: true } : {}),
  };
}

// WHETHER A ROUTE THE SITE COULD NOT READ ACTUALLY TAKES THE READER'S
// KIND OF INCOME — the one fact the composed wrong-type sentence needs
// and never had, found the same way belowBarKindSummary() above finds
// its own, and for the same reason: composeCountryState() takes state
// tokens and nothing else, and both populations hand it the identical
// multiset (READER_WRONG_TYPE plus READER_NOT_ENOUGH), so no wording can
// reach this.
//
// THE COLLAPSE UNDERNEATH IT. READER_NOT_ENOUGH carries two different
// facts: "this route takes your kind of income, its bar could not be
// read" (failed at gate 2, on barKind) and "nothing on file about
// whether this route takes your kind" (gate 1, typeState "absent").
// `result.typeState` tells them apart and is computed on every row — it
// is simply discarded at the composer's door. This function is that
// fact, summarised over exactly the routes the sentence is about.
//
// Measured against the real engine over the 1,350-cell grid, re-run by
// this build: 126 cells reach READER_WRONG_TYPE_SOME_UNREAD; 54 of them
// — every TH remote-active cell, at every amount, both currencies, with
// capital and without — have an unread route that DOES take the reader's
// income kind, and were being told nothing here does.
//
// "partial" MUST NOT COUNT, and that is a decided boundary, not an
// inference left to the next reader: `supplementary_only` reads "Counts
// this kind of income, but not on its own", which is not "takes this
// kind of income". Folding it in would make the first sentence of the
// string this selects false.
//
// Returns null on every other shape — so the honest population carries
// no summary and renders the shipped sentence byte-identically — or
// { acceptingUnread: true }.
export function wrongTypeUnreadSummary(entries) {
  const acceptingUnread = entries.some((e) =>
    STATE_BAND[e.state] === "data_gap"
    && (e.result.typeState === "ok" || e.result.typeState === "coarse_yes"));
  return acceptingUnread ? { acceptingUnread: true } : null;
}

// atLineConversionSummary() RETIRES WITH ITS STATE. It answered two
// questions for the at-the-line sentence — was the deciding comparison
// converted, and did the deciding bar attach conditions — and both
// questions now have homes that are not a summary: the condition reaches
// readerStateForRow()'s own CONDITIONAL branch, and the conversion
// reaches the reader as the RATE ITSELF, named in app-shared.js's rate
// line rather than gestured at by a sentence about why the answer "can't
// be tighter".

// Added by the conversion crossing. WHICH GATE(S) actually
// stopped a READER_NOT_ENOUGH country — the fact app-shared.js's composed
// clause sentence needs. composeCountryState() only ever names this
// state when EVERY route in the country landed it (S_NOT_ENOUGH ranks
// worst on BAND_RANK among the bands it can share the country with, so
// any better-banded sibling would have won `best` instead) — so scanning
// every entry, not just a filtered subset, is exact here, not an
// approximation the way it would be for a mixed-band state.
//
// A, B, C are own-numbers-data.js's own three causes:
//   A - gate1() fell to typeState "absent"
//   B - gate2's bar-kind mismatch (kind_mismatch / property_bank_balance /
//       property_total_assets / property_rule_unstated — the last added
//       with the guard that refuses a capital bar whose `property_rule`
//       no source has stated; it is the same cause, "the
//       bar here measures capital and your figure could not be read
//       against it", and it must stay in this list or a country whose only
//       capital refusal is that one composes a sentence naming no cause)
//   C - gate2's no_number
// All three false is the one combination measured structurally
// unreachable on today's data (no row is not_stated_by_source, no row
// carries a suppressed amount chip that isn't also one of the above) —
// composeNotEnoughSentence() in app-shared.js has its own honest fallback
// for it regardless, so this function never needs to invent a fourth
// cause to avoid it.
export function notEnoughCauseSummary(entries) {
  let hasA = false, hasB = false, hasC = false;
  for (const e of entries) {
    const r = e.result;
    if (r.typeState === "absent") hasA = true;
    if (r.gate2 && (r.gate2.reason === "kind_mismatch" || r.gate2.reason === "property_bank_balance"
      || r.gate2.reason === "property_total_assets" || r.gate2.reason === "property_rule_unstated")) hasB = true;
    if (r.gate2 && r.gate2.reason === "no_number") hasC = true;
  }
  return { hasA, hasB, hasC };
}

// The deciding route's own confidence tier, copied verbatim. A MECHANICAL
// rule, not an opinion: the tier is the tier of the row the answer rests
// on, transported unchanged. No tier is authored here and none is
// averaged, because an average of two tiers is a tier nobody recorded.
//
// ONE SELECTOR, AND THE INVARIANT IT EXISTS TO SATISFY: the tier shown
// beside a NAMED bar must be that bar's own tier. Wherever the margin
// names a bar, `deciding` is the entry it named and the tier is read off
// that same entry — one object, so the two cannot be different routes.
// This is structural, not a check: there is no second selection to drift
// out of step with the first, and nothing detects drift after the fact
// because nothing can drift.
//
// `deciding` is the ONE `decidingEntry()` call made per country row and
// handed in, never re-derived here. A second call is the defect this
// closes, so the argument is required rather than optional: a caller that
// forgot it would get a fallback tier on a row that names a bar, which is
// exactly the mispairing the pass removes.
function decidingTier(deciding, entries, countryState) {
  // Four of the ten reader states are COMPOSED — no single route ever
  // carries them — so an exact-state match cannot find their row.
  //
  // WHAT THIS LINE FIXES, MEASURED not asserted: the re-band above moved
  // the three partial states to `uncertain_or_conditional`, and
  // when the best band is `hard_fail` no sibling route can hold that band
  // (anything better would have won `best` in composeCountryState), so
  // BOTH finds below miss and the old `|| entries[0]` fallback handed
  // back the confidence of whichever route happened to sort first —
  // including a route the site could not read. Over the 1,800-read grid:
  // 239 partial reads, 48 showing a different confidence tier after the
  // re-band, 110 taking that tier from an unread route. GT at $300/month
  // pension went Medium -> High — the badge got MORE confident because
  // the band got softer, off a route nobody read. Reader-facing on three
  // surfaces.
  //
  // The comment this replaces claimed the last fallback was "genuinely
  // unreachable rather than routinely hit". It was routinely hit. A false
  // comment about a fixed defect is how the next reader gets misled, so
  // it is corrected here rather than left standing beside the fix.
  //
  // THE FIX IS MECHANICAL, and authors no tier. The composition's own
  // rule is BAND_RANK: `best` is the route state with the lowest rank,
  // and when that rank is `hard_fail` the routes holding it are exactly
  // the refusals the composed state is a claim about. So the last resort
  // is "the route that set the band", found by the same ranking the
  // composer used — never a `data_gap` route, which ranks last and can
  // only win when every route is data_gap, in which case `sameBand`
  // already matched it.
  // No named bar — the four refusal states, where `decidingEntry()` has no
  // candidate set and the sentence points at no single route. Nothing is
  // mispaired there, so the tier stays: it is a true claim about the
  // read the sentence rests on, and dropping it would make an absent badge
  // mean two things at once.
  return (deciding || noMarginFallbackEntry(entries, countryState)).row.confidence || null;
}

// THE NO-MARGIN FALLBACK, and nothing else now — named so the two-selector
// structure is legible at the call site. It runs on exactly the four
// composed states that name no bar: the two wrong-type readings, the
// not-enough reading, and the no-exchange-rate reading. Those states have
// no candidate set above, so there is no pairing for the invariant to be
// about, and the chain below is kept EXACTLY as it shipped — no clause
// reordered, nothing added.
//
// What it lands on, per state, and why keeping it is mechanical rather
// than a preference: on a wrong-type read a route really does carry that
// state, so clause 1 fires; on its partial-read twin clauses 1 and 2 miss
// by construction (no route carries a composed token, and no sibling can
// hold the softer band or it would have won the composition) and clause 3
// lands on a read, refusing row; on not-enough every route carries the
// state; on no-exchange-rate a route carries it. In all four the chain
// lands on a read row that is part of the claim being made — never the
// arbitrary first row the note above this function's caller records.
function noMarginFallbackEntry(entries, countryState) {
  const exact = entries.find((e) => e.state === countryState);
  const sameBand = entries.find((e) => STATE_BAND[e.state] === STATE_BAND[countryState]);
  const deciding = entries.reduce(
    (lo, e) => (BAND_RANK[STATE_BAND[e.state]] < BAND_RANK[STATE_BAND[lo.state]] ? e : lo),
    entries[0]
  );
  return exact || sameBand || deciding;
}

// ---------------------------------------------------------------------
// THE MARGIN — the deciding route, and the figures the reader sees.
// ---------------------------------------------------------------------

// Exactly the routes the country's own sentence is about, by composed
// state. The below-family's three composed states all summarise over the
// READ-AND-BELOW routes, which is what makes "no bar above your figure here
// is closer" literally true on a none-clears country: the wrong-type
// refusals produced no figure and are not candidates. A state absent from
// this table has an empty candidate set and therefore no margin — which is
// every one of the refusal states, reached mechanically rather than by a
// second list anyone has to keep in sync.
const MARGIN_CANDIDATE_STATE = {
  [S_ABOVE]: S_ABOVE,
  [S_ABOVE_CONDITIONAL]: S_ABOVE_CONDITIONAL,
  [S_BELOW]: S_BELOW,
  [S_BELOW_SOME_UNREAD]: S_BELOW,
  [S_NONE_CLEARS]: S_BELOW,
  [S_NONE_CLEARS_SOME_UNREAD]: S_BELOW,
};

// THE ONE SELECTOR FOR THE LEAD, named once — nothing else anywhere may
// pick the route the compact surfaces name. It KEEPS the lead and stops
// being the whole answer: every other route that clears, and every route
// that does not, now reaches the reader through composeReaderRoutes()
// below. Three clauses in order: the candidate set above; the INCOME
// instrument where it has a candidate; the biggest clearance, ties broken
// by route_key.
//
// THE RULE IT NO LONGER USES, kept here because the selector it replaced
// shipped for a month and its output is in the record: the SMALLEST
// relative distance from the bar — i.e. the route the reader barely
// cleared. Cap's R4 (2026-09-24 12:26 +00) overtakes it: "nearest bar
// means the route the reader is closest to clearing: if a route clears,
// name a clearing one; otherwise the one with the smallest shortfall."
// On the clearing side that is the LARGEST ratio, not the smallest
// distance; on the miss side the two agree. So Ecuador's lead moves from
// the investor bar it barely cleared (+24.5%, and the only one of five
// that asks him to part with money) to the Professional visa route it
// clears by +771.4%, and Portugal's from D8 (+2.2%) to D7 (+308.7%).
//
// INCOME FIRST WHERE IT HAS A CANDIDATE — Cap's B1, 2026-10-20 ("yes,
// income first"), on the reasoning that it follows the reader's own entry
// order and the capital field's optionality. It is NOT a claim that an
// income route is better; the two instruments are never ranked against
// each other, here or in the lists.
//
// WHY RELATIVE AND NOT ABSOLUTE MONEY, measured — AND WITH THIS COMMENT'S
// OWN STATED REASON CORRECTED. It used to read "within one country every
// income bar shares one currency and one period, so the reader's amount
// is constant across income candidates". That premise is FALSE on the
// live data: Indonesia and South Africa each carry one USD/month income
// bar beside one USD/year income bar (ZA: Retired Person's $2,310/mo
// against Remote Work's $40,589/yr), and Thailand's capital bars span THB
// and USD. The CONCLUSION survives and now rests on a measurement rather
// than on that premise: within one instrument, relative and absolute give
// the identical order — 0 disagreements over 8,980 multi-item lists
// measured on the shipped engine before this build started. Across
// INSTRUMENTS they diverge and
// only relative is even defined: Guatemala carries a USD 100,000 capital
// bar beside two USD/month income bars, and "$400 a month short" versus
// "$100,000 short" has no absolute ordering at all — which is why the two
// instruments are two lists and this selector prefers one of them
// outright instead of ranking across them.
//
// ONE SORT, SHARED WITH THE LISTS, so the lead and the first item of the
// list it leads cannot be two different routes: both run
// compareRouteSlots().
//
// Empty candidate set → null → no lead, no clause renders.
export function decidingEntry(entries, countryState) {
  const want = MARGIN_CANDIDATE_STATE[countryState];
  if (!want) return null;
  const candidates = entries.filter(
    (e) => e.state === want && e.result.gate2 && e.result.gate2.comparable
  );
  if (!candidates.length) return null;
  const income = candidates.filter((e) => routeInstrument(e.row) === "income");
  const pool = income.length ? income : candidates;
  const slots = pool.map((e) => ({ entry: e, item: { route_key: e.row.route_key }, ratio: clearanceRatio(e) }));
  slots.sort(compareRouteSlots);
  return slots[0].entry;
}

// The margin's ten-key sub-object, composed once per country row.
//
// THE READER'S FIGURE IS NEVER ROUND-TRIPPED THROUGH A RATE.
// `gate2.comparable.readerAmount` is the reader's figure converted INTO
// the bar's currency; converting it back would show a reader their own
// typed number distorted by two rate hops. So the reader's figure is
// re-read from the input and only normalised into the bar's PERIOD, by the
// same toPeriod() Gate 2 used.
//
// THE BAR IS THE ONE AND ONLY CONVERSION THIS FUNCTION PERFORMS, and
// `status: "unavailable"` is exactly the case where it returns null.
// Nothing else sets that status.
function composeReaderMargin(chosen, input, fxRates) {
  if (!chosen) return null;
  const bar = barForRow(chosen.row);
  const converted = !!chosen.result.gate2.comparable.converted;

  // Fixed key order, kept so a diff of two rows lines up. The five rate
  // keys are appended at the end rather than interleaved, for the same
  // reason: an existing diff of two rows still lines up down to the key
  // the margin shipped with.
  //
  // THE RATE IS CARRIED BECAUSE THE READER IS TOLD IT. Cap's fx ruling
  // has two halves and only the first was ever built: the table on file
  // is consulted, and "the hover says which rate was used" was not. The
  // three values existed one layer down, on gate2.comparable, and this
  // function DISCARDED them — so the disclosure had nothing to render.
  const margin = {
    status: "ok",
    route_key: chosen.row.route_key,
    threshold_label: chosen.row.threshold_label,
    direction: null,
    reader_figure: null,
    bar_figure: null,
    difference: null,
    currency: input.currency,
    period: bar.period,
    converted,
    rate: null,
    rate_currency: null,
    rate_as_of: null,
    rate_source: null,
    rate_stale_after_days: null,
  };

  const rawReader = bar.kind === "capital"
    ? (input.property_capital ? input.property_capital.amount : null)
    : toPeriod(input.amount, input.period, bar.period);

  let rawBar = chosen.row.value_num_low;
  if (input.currency !== bar.currency) {
    const back = convertAmount(fxRates, chosen.row.value_num_low, bar.currency, input.currency);
    if (back) {
      // ONE RATE, AND IT IS THE ONE THIS CONVERSION ACTUALLY CONSULTED.
      // convertAmount() reports the single NON-BASE table entry it used
      // (`named = fromEntry.isBase ? toEntry : fromEntry`) — so for a THB
      // bar read into USD it is the THB entry, and for a USD bar read
      // into EUR it is the EUR one.
      //
      // THE CODE IS DERIVED HERE, by that same rule, and the reason is
      // scope rather than taste: convertAmount() returns the rate but not
      // which currency the entry belongs to, and its file is out of this
      // box beyond the band split. Of the two currencies in a conversion,
      // the one named is the one that is not the table's base — which for
      // THIS call (from the bar's currency into the reader's) is the bar's
      // currency unless the bar is already in the base.
      //
      // THE TWO-RATE CASE IS REAL AND IS NOT FAKED. A EUR reader against
      // a THB bar consumes two non-base entries, and convertAmount()
      // still reports one: the bar's. So this line names the bar's rate
      // and says nothing about the reader's leg. The two-rate wording is
      // written (spec §F2) and is OWED, with the engine carry it needs;
      // nothing here invents a second rate to fill it, and
      // convertAmount()'s own comment — which wrongly claims both
      // currencies are never non-USD — is left exactly as it stands
      // rather than replaced with a claim this build has not tested.
      margin.rate = back.rate;
      margin.rate_currency = bar.currency === (fxRates && fxRates.base) ? input.currency : bar.currency;
      margin.rate_as_of = back.asOf;
      margin.rate_source = back.source;
      // The window the age is stated inside, interpolated from the row and
      // never written into the sentence — the same value-copy rule
      // BAND = 0.10 carries in js/own-numbers-data.js.
      margin.rate_stale_after_days = fxRates && Number.isFinite(fxRates.stale_after_days)
        ? fxRates.stale_after_days
        : null;
    }
    if (!back) {
      // The second refusal: a band exists and the amount cannot be
      // expressed in the reader's currency. Every figure null — never a
      // zero and never a placeholder, so the render layer cannot have a
      // number to print. Period goes null with them: with no figures there
      // is nothing for a period to qualify.
      return { ...margin, status: "unavailable", period: null, converted: true };
    }
    rawBar = back.amount;
  }
  if (!Number.isFinite(rawReader) || !Number.isFinite(rawBar)) {
    return { ...margin, status: "unavailable", period: null, converted: true };
  }

  // The three arithmetic rules, all three in these four lines:
  // (a) the figures carried ARE the figures displayed — rounded here,
  //     once, so no surface can round differently from another;
  // (b) the difference is the subtraction of the two ROUNDED integers, so
  //     a reader who subtracts what is on screen gets what is on screen;
  // (c) direction derives from those same integers, which is what makes
  //     "by $0" structurally impossible rather than avoided by wording.
  const readerFigure = Math.round(rawReader);
  const barFigure = Math.round(rawBar);
  const difference = readerFigure - barFigure;
  margin.reader_figure = readerFigure;
  margin.bar_figure = barFigure;
  margin.difference = difference;
  margin.direction = difference > 0 ? "over" : difference < 0 ? "under" : "exact";
  return margin;
}

// ---------------------------------------------------------------------
// EVERY ROUTE THAT CLEARS, AND EVERY ROUTE THAT DOES NOT — the ordered
// lists.
//
// WHAT THIS REPLACED, so the defect is on the record beside its fix: one
// route per country reached the reader, picked by the SMALLEST relative
// distance from its bar — the route they barely cleared. Ecuador's
// reader cleared four routes on income (one by nearly nine times) and
// was told about none of them: his whole answer was a $48,200 investment,
// because +24.5% of capital sorted ahead of +771.4% of income. Portugal
// was the same defect the other way: D8 at +2.2% carried the answer with
// a closeness note attached while D7 at +308.7% went unmentioned.
//
// THE RULINGS THIS EXECUTES, with pointers, because none of it is this
// file's choice:
//   R1  2026-10-18, Cap — "Every route that clears for the reader is
//       shown, not just one."
//   R2  2026-09-24 12:30 +00, Cap — "If several routes
//       clear, list them all, biggest clearance first."
//   R3  2026-09-24 11:59 +00, Cap — income against the
//       nearest income bar AND capital against the nearest capital bar:
//       two instruments, two lists, income list first (Cap's B1,
//       2026-10-20).
//   R4  2026-09-24 12:26 +00, Cap — "nearest bar" = a clearing one if
//       any, otherwise the smallest shortfall. This is what retires the
//       relative-distance selector below.
//   B3  2026-10-20, Cap — the routes that do NOT clear ride too, nearest
//       miss first, each with its shortfall.
//   Also 2026-10-20, Cap — "unread routes are not noes": a route the
//       site could not read is NOT counted among the routes that do not
//       clear. It is disclosed separately, in its own words.
//
// Specified in the information-design spec for this crossing; worded in
// its copy deck. Both are held outside this repo.
// ---------------------------------------------------------------------

// Which list a route's bar belongs in. TWO INSTRUMENTS, NEVER ONE
// RANKING: "$3,718 a month" against "$11,800 once" has no comparison
// operator, so ordering them against each other is not merely wrong, it
// is undefined — which is exactly how a +24.5% capital bar came to
// outrank a +771.4% income one. A bar of kind "none" states no figure at
// all; it never reaches either list, it lands READER_NOT_ENOUGH, and it
// is counted among the routes that could not be read.
function routeInstrument(row) {
  const bar = barForRow(row);
  return bar && bar.kind === "capital" ? "capital" : "income";
}

// THE ONE ORDERING KEY FOR BOTH LISTS — one key, one direction, no second
// rule for the miss side. `readerAmount / threshold`, off the comparable
// the engine already computed:
//   - biggest clearance first on the clearing side (R2);
//   - smallest shortfall first on the miss side (R4) — the SAME sort,
//     because the smallest shortfall is the largest ratio below 1.
// RELATIVE, NOT ABSOLUTE MONEY, and the choice was measured rather than
// argued: within one instrument the two keys give the identical order
// (0 disagreements in 8,980 multi-item lists), and relative
// is the only one that orders Thailand's THB-and-USD capital bars
// without a second conversion. Null where no comparison ran.
function clearanceRatio(entry) {
  const c = entry.result.gate2 && entry.result.gate2.comparable;
  if (!c || !(c.threshold > 0)) return null;
  return c.readerAmount / c.threshold;
}

// TIES ARE THE COMMON CASE AND THE LIST IS NEVER NUMBERED. Equal
// clearance means equal, so any order imposed on tied items carries no
// information: Ecuador's DNV, pensionado and rentista are all +190.5% off
// the same $1,446 bar, and Thailand's three unreduced LTR bars are 80,000
// three times. `route_key` ascending is the tiebreak — stable, so a block
// does not reshuffle between renders, and semantically empty by
// construction. The tie DISCLOSES ITSELF: three items print the same bar
// and the same difference, which is better disclosure than any sentence
// about ties and costs nothing.
//
// An item with no ratio is a REFUSAL — read, and the route refuses this
// kind of income, so no comparison ever ran and there is no shortfall to
// order it by. Those sort after the figured items inside their own
// instrument group, which keeps the figured run honestly ordered. That
// placement is this build's, offered by the copy deck and not ruled; no
// string anywhere promises an ordering, so nothing goes false if it moves.
function compareRouteSlots(a, b) {
  if (a.ratio == null && b.ratio == null) return a.item.route_key < b.item.route_key ? -1 : 1;
  if (a.ratio == null) return 1;
  if (b.ratio == null) return -1;
  if (a.ratio !== b.ratio) return b.ratio - a.ratio;
  return a.item.route_key < b.item.route_key ? -1 : 1;
}

// THE PER-ITEM SUMMARY, IN EXACTLY THE SHAPE THE ROW'S OWN
// `reader_bar_kind` CARRIES — so every shipped selector that reads that
// field (readerStateClaim(), readerNearLineNote(), isPlacementBar() in
// js/app-shared.js) works on a list item unchanged, per item instead of
// per country. That is the whole of the spec's §5 in one carry: the
// closeness note, the placement clause and the condition clause travel
// ON the route they were computed from and cannot reach a route they are
// not true of.
//
// WHY THIS MATTERS AND IS NOT TIDINESS: Portugal. Leave `nearLine` at
// country level and re-order the list, and the page prints "your figure
// is within about a tenth of the bar" against a route that clears by
// 308%. That falsity does not exist on the site today — the re-ordering
// would have created it.
function itemBarKind(entry) {
  const bar = barForRow(entry.row);
  const capital = !!(bar && bar.kind === "capital");
  const nearLine = entry.result.amountBand === "above_near";
  if (!capital && !nearLine) return null;
  return {
    ...(capital ? { kind: "capital", condition: entry.row.capital_instrument_condition || null } : {}),
    ...(nearLine ? { nearLine: true } : {}),
  };
}

// A ROUTE ON WHICH NO COMPARISON RAN, in the same key set as a margin, so
// both lists hold ONE shape and no consumer has to ask which kind of item
// it is holding. Two populations reach it, and they are two different
// claims — kept apart by `state`, never by this shape:
//   READER_WRONG_TYPE   — read, and the route refuses this kind of
//                         income. A recorded negative with NO shortfall,
//                         and none may be invented: the bar was never the
//                         obstacle.
//   READER_NOT_ENOUGH / UNCERTAIN_FX_UNAVAILABLE — the site could not
//                         read the route at all. Ignorance, not a no.
// Every figure is null, never a zero and never a placeholder, so the
// render layer cannot have a number to print.
function composeNoComparisonItem(entry, input) {
  return {
    status: "no_comparison",
    route_key: entry.row.route_key,
    threshold_label: entry.row.threshold_label,
    direction: null,
    reader_figure: null,
    bar_figure: null,
    difference: null,
    currency: input.currency,
    period: null,
    converted: false,
    rate: null,
    rate_currency: null,
    rate_as_of: null,
    rate_source: null,
    rate_stale_after_days: null,
  };
}

// WHICH KINDS OF INCOME THIS ROUTE'S RECORD SAYS IT COUNTS — carried per
// item so each clearing route can state it under its own heading, ruled
// 2026-10-20: "where a reader did not name an income kind, each clearing
// route states the kind it requires, from its record."
//
// THE POPULATION, DERIVED HERE RATHER THAN INHERITED. Over the 48 rows
// that can clear (bar_kind income or capital): 22 can name an accepted
// kind, 26 cannot, and the 26 split 4 + 22 — which is why there are two
// gap forms and not one. The 22 is 20 granular rows plus the 2 whose
// only acceptance is the bare coarse literal "Yes"; a granular-only
// count gives 20, and the engine's own ratified coarse allowance gives
// 22. Counted twice, independently, by two seats, and reconciled.
//
// ONLY THE RATIFIED TOKENS AND THE TWO BARE LITERALS FEED THIS. Ten
// coarse values are free text ("No (pension/annuity only)",
// "Yes (rental income, dividends and interest …)"), and parsing one into
// a reader-facing kind is fact-authoring in a browser — the same line
// gate1()'s own coarse fallback already draws by scoping itself "to the
// two literal values, so a coarse field can never answer a question it
// was not asked". The cost is real and named: four routes' recorded
// nuance renders as "the record doesn't say". The fix is the granular
// fields, which are clean and simply unpopulated on those rows.
//
// NULL WHERE THE READER NAMED A KIND. The condition is Cap's own
// scoping, and it is applied here rather than at the render so one place
// decides it: a reader who named a kind has already been gated on it, so
// the clause would tell them what they just told the box.
function itemIncomeKinds(row, input) {
  if (!input || input.income_type !== "unspecified") return null;
  // NOT ON A CAPITAL-ONLY ROUTE, ruled 2026-10-20. The clause was built
  // on every clearing item as the ruling read, and measured there: on an
  // asset requirement the gap form renders "The record doesn't say which
  // kind of income this route counts" under a ledger comparing the
  // reader's CAPITAL, which implies an income test the route may not
  // have. Live on Egypt's three tiers, Ecuador's investor visa and both
  // MM2H tiers before this.
  //
  // "CAPITAL-ONLY" IS EVERY CAPITAL ROW ON TODAY'S DATA, measured rather
  // than assumed: the definition is a capital bar with no income bar
  // anywhere on the same route, and NO route_key spans both bar kinds
  // (0 of 55 in the reader's slice). So there is no second population
  // for this condition to distinguish, and the simple test is the exact
  // test.
  //
  // IT SUPPRESSES THE AFFIRMATIVE FORM TOO, which is the edge worth
  // stating because two capital rows do carry granular tokens — the DTV
  // (remote_active) and the O-X (passive + remote_active). Their clause
  // was true. It is still suppressed, for two reasons: the implicature
  // is not confined to the gap form — "Counts remote work … as
  // qualifying income" printed under "Your capital: $60,000. The bar:
  // about $14,873" invites a reader to take the income kind for the
  // thing they just cleared — and keying the rule on whether a field
  // happens to be populated would mean a route silently gaining a clause
  // on a capital bar the day someone fills one in. The fact is not lost:
  // both rows' own `documentation_shape` renders in the visa chapter of
  // the location page, in the route's own words.
  const bar = barForRow(row);
  if (bar && bar.kind === "capital") return null;
  const accepted = ["pension", "passive", "remote_active", "local_active"]
    .filter((t) => row["income_type_" + t] === "primary_accepted");
  // RETOKENED 2026-10-29, same change and same reason as gate1()'s coarse
  // allowance in own-numbers-data.js: the bare `Yes`/`No` this used to
  // compare against were retired on this role, and the comparison is on
  // the TOKEN — never on `value_bool`, which this export does not carry
  // and which could not distinguish a negative from the `N/A — …` and
  // `Not yet checked` states anyway. Narrow by design: every other value
  // in the column still yields neither an accepted kind nor a refusal,
  // which is the honest answer for a value that does not state one.
  if (!accepted.length && row.accepts_passive_income === TOKENS.PASSIVE_ACCEPTED) accepted.push("passive");
  if (accepted.length) return { accepted, refuses_passive: false };
  return { accepted: [], refuses_passive: row.accepts_passive_income === TOKENS.PASSIVE_NOT_ACCEPTED };
}

function composeRouteItem(entry, input, fxRates) {
  const comparable = !!(entry.result.gate2 && entry.result.gate2.comparable);
  const margin = comparable
    ? composeReaderMargin(entry, input, fxRates)
    : composeNoComparisonItem(entry, input);
  return {
    ...margin,
    // The route's own state token, so the item renders its own claim
    // sentence — which is what brings the conditional clause with it,
    // per route, with no new string anywhere.
    state: entry.state,
    instrument: routeInstrument(entry.row),
    bar_kind: itemBarKind(entry),
    // The tier of THIS route, copied verbatim off this route's own row —
    // never averaged, because an average of two tiers is a tier nobody
    // recorded. Mixed tiers inside one list are measured at 3,380 reads,
    // and in 1,070 the lead carries no tier while another listed route
    // does, which is why one badge over a list cannot stand.
    confidence: entry.row.confidence || null,
    income_kinds: itemIncomeKinds(entry.row, input),
  };
}

// THE CARRY: two ordered clearing lists, two ordered miss lists, and the
// routes that could not be read — all five off ONE pass over the
// entries, so no two of them can disagree about which route went where.
// The three populations are mutually exclusive per read, which is why
// Thailand's page holds at most nine items in total and not seventeen.
//
// `lead` is the ONE route the compact surfaces name, and it is drawn
// from decidingEntry() — the composed state's own candidate population,
// unwidened. That invariant is why the claim sentence, the pin colour and
// the ledger can never describe two different things, and §4.3 of the
// spec argues it at length: reach across state tokens for the biggest
// clearance and Thailand's hover becomes a conditional route while its
// pin stays green.
function composeReaderRoutes(entries, overallState, deciding, input, fxRates) {
  const cleared = { income: [], capital: [] };
  const missed = { income: [], capital: [] };
  const unread = [];
  for (const entry of entries) {
    const band = STATE_BAND[entry.state];
    const item = composeRouteItem(entry, input, fxRates);
    const slot = { item, ratio: clearanceRatio(entry) };
    if (entry.state === S_ABOVE || entry.state === S_ABOVE_CONDITIONAL) {
      cleared[item.instrument].push(slot);
    } else if (band === "hard_fail") {
      missed[item.instrument].push(slot);
    } else {
      unread.push(slot);
    }
  }
  const ordered = (slots) => slots.sort(compareRouteSlots).map((s) => s.item);
  return {
    lead: deciding ? composeReaderMargin(deciding, input, fxRates) : null,
    cleared: { income: ordered(cleared.income), capital: ordered(cleared.capital) },
    missed: { income: ordered(missed.income), capital: ordered(missed.capital) },
    // Population 3, carried as a list and never as a count, so every
    // number on screen is a rendered list's own length at the call site.
    // It is disclosed OUTSIDE the miss widget: the widget counts noes,
    // and a reader who opens a list of eight noes must not then discover
    // that eleven other routes were never read and nothing said so.
    unread: unread.sort(compareRouteSlots).map((s) => s.item),
  };
}

// Build the reader's verdict rows: one per country in the read set, in
// the engine's own row shape.
//
// THE ROW'S CONTRACT, restated because the sentence that stood here was
// FALSE, not merely tight. It claimed "the same thirteen keys every row in
// derived/verdicts.jsonl carries, no more and no fewer". Measured: that
// file carries 13 keys, on one single key set across all 472 rows — and the
// literal below already pushed 14, and had since the conversion work added
// `reader_bar_kind`. A rule with a silent exception is not a rule, so it is
// replaced rather than excepted:
//
//   The reader's row carries EVERY key derived/verdicts.jsonl carries,
//   with the same name, the same type and the same meaning — so every
//   existing consumer sees only fields it already knows. It may carry
//   ADDITIONAL keys, and every additional key is prefixed `reader_`.
//   Nothing iterates this row's keys, so an unprefixed consumer never
//   meets one.
//
// The middle clause is what the old rule was actually protecting and it
// survives intact. The "no more and no fewer" half was protecting nothing:
// it is safe precisely BECAUSE no consumer iterates or spreads a verdict
// row's keys — grepped across js/ for Object.keys()/Object.entries() on a
// verdict, `...verdict`, `...engineVerdict`, `...readerVerdict` and
// `for (const k in`: zero matches. If that ever stops being true, this
// rule is the thing to re-open.
//
// Two things the superset does NOT license: never a key that shadows an
// engine key with a different meaning (the prefix exists for that), and
// nothing here reaches derived/verdicts.jsonl — this row is composed in
// the browser and exported nowhere, which is why `generated_at` is null.
//
// Countries OUTSIDE the read set get NO ROW, deliberately — the rule that
// an unread country carries no verdict, executed by absence rather than
// by a special value: the site does not compute a band for a country it did not read,
// and each consumer's existing no-verdict branch is what renders. There
// is no count, no ratio, and no "16 of 21" anywhere.
export function buildReaderVerdictRows(store, input) {
  if (!isValidOwnNumbers(input)) return [];
  // "A visit" runs no income comparison at all — the entry rules for a
  // visit come from the passport, not from these bars (v1 §1.2g). No
  // rows, and the perspective line says why.
  if (input.duration_band === "visit") return [];

  const allRoutes = [].concat(...[...store.visaRoutesByCountry.values()]);
  // The box refuses wholesale rather than answering partially off half an
  // export — the same assertion the box's own render half runs, for the
  // same reason, applied to the composer so the two can never disagree
  // about whether the rows carry their bars.
  if (!assertRouteBarFields(allRoutes).ok) return [];
  const slice = sliceRoutes(allRoutes);

  const rows = [];
  for (const countryId of READ_SET) {
    const countryRows = slice.filter((r) => r.country_id === countryId);
    if (!countryRows.length) continue;
    const entries = countryRows.map((row) => {
      const result = evaluateRow(row, input, store.fxRates);
      return { row, result, state: readerStateForRow(result) };
    });
    const overallState = composeCountryState(entries.map((e) => e.state));
    if (!overallState) continue;
    // Carried on the row beside the state, never folded into it — and
    // ONLY where the composed state is one the summary describes. A
    // country whose best route is above the bar can still have a
    // sibling route that fell below it, so a summary would be non-null
    // there while describing routes the sentence is not about. Nothing
    // consumes it in that case today; this makes it impossible for
    // anything to start.
    //
    // Widened by the conversion crossing: READER_NOT_ENOUGH carries a
    // summary on this same field, same mechanism, same rule — which of
    // the three causes are actually present, composed per country since
    // S_NOT_ENOUGH only ever names a country where EVERY route landed it.
    //
    // Widened again by the margin crossing: a summary that describes the
    // route the SENTENCE NAMES is read off the DECIDING entry. One
    // decidingEntry() call, its answer passed to both consumers — never
    // two calls that could disagree.
    //
    // NARROWED by the band split: the at-the-line summary is gone with
    // its state, and the above-family summary now serves BOTH above
    // tokens, because the closeness note belongs to a conditional clear
    // exactly as much as to a plain one.
    const deciding = decidingEntry(entries, overallState);
    const readerBarKind = (overallState === S_BELOW || overallState === S_BELOW_SOME_UNREAD)
      ? belowBarKindSummary(entries)
      // Widened again by the capital comparison: the above family
      // carries a summary on this same field, same mechanism, same rule —
      // { kind: "capital", condition } where the deciding bar measures
      // capital, { nearLine: true } where the reader cleared from inside
      // the band, both where both, null where neither.
      : (overallState === S_ABOVE || overallState === S_ABOVE_CONDITIONAL)
        ? aboveBarKindSummary(entries, deciding, overallState)
        : overallState === S_NOT_ENOUGH
          ? notEnoughCauseSummary(entries)
          // Widened again by the wrong-type split: a fourth shape on the
          // same field, same mechanism, same rule — { acceptingUnread }
          // where an unread route takes the reader's income kind, null
          // where none does (and the shipped sentence renders unchanged).
          : overallState === S_WRONG_TYPE_SOME_UNREAD
            ? wrongTypeUnreadSummary(entries)
            : null;
    const readerMargin = composeReaderRoutes(entries, overallState, deciding, input, store.fxRates);
    // THE BADGE AND THE NAMED BAR ARE NOW THE SAME ROUTE, by construction:
    // `deciding` above is the entry the margin names, and the tier below is
    // read off that same entry. The build this replaces could name one
    // route in the sentence and show another route's tier beside it, and
    // hid the badge where it detected that — a render branch that printed
    // "confidence not shown" to a reader. There is nothing left to detect,
    // so there is nothing left to hide, and the flag that did it is gone
    // rather than left behind as a constant-false field that would tell a
    // later reader divergence is still possible.
    //
    // THE ARGUMENT THAT OUTLIVES THE MECHANISM, kept because the next
    // person to consider hiding a badge should meet it rather than
    // rediscover it: an absent confidence badge on these surfaces already
    // means "no tier exists". If a second cause of absence is ever
    // introduced, it needs its own words on screen — one absence cannot
    // carry two meanings where the reader cannot tell which is which.
    rows.push({
      persona_id: READER_ID,
      location_id: null,
      country_id: countryId,
      scope: "country",
      overall_band: STATE_BAND[overallState],
      overall_state: overallState,
      confidence_tier: decidingTier(deciding, entries, overallState),
      deciding_group_kind: "route",
      // Read by stateHeadline()/readerStateShort() to pick which text an
      // existing token renders. Despite the name, carries three different
      // shapes now, one per state that needs one: { kind, phraseKey } for
      // S_BELOW/S_BELOW_SOME_UNREAD, { kind?, condition?, nearLine? } for
      // S_ABOVE/S_ABOVE_CONDITIONAL, { hasA, hasB, hasC } for
      // S_NOT_ENOUGH, { acceptingUnread } for
      // S_WRONG_TYPE_SOME_UNREAD. Null on every row whose state carries
      // no summary — most of them, by construction. FOUR shapes behind
      // one name is now the honest count and the name has drifted off
      // what it holds; renaming the field is a schema change and is
      // deliberately not taken here, inside a copy repair.
      reader_bar_kind: readerBarKind,
      // THE MARGINS — my number, the bar, and by how much, FOR EVERY
      // ROUTE THE SITE READ. One sub-object, five keys, composed by
      // composeReaderRoutes() above:
      //
      //   lead     the ONE route the compact surfaces name (the map
      //            tooltip, the pin's accessible name, the Lists chip) —
      //            the ten-key margin this field used to hold on its own,
      //            unchanged in shape so every one of those surfaces
      //            keeps reading exactly what it read before.
      //   cleared  { income: [...], capital: [...] } — every route that
      //            clears, biggest clearance first, income list first.
      //   missed   { income: [...], capital: [...] } — every route that
      //            was read and does not clear, smallest shortfall first.
      //   unread   the routes the site could not read at all. NOT noes
      //            (Cap, 2026-10-20) and never counted among them.
      //
      // IT IS A LIST BECAUSE CAP RULED A LIST. "Every route that clears
      // for the reader is shown, not just one" (2026-10-18) and "if
      // several routes clear, list them all, biggest clearance first"
      // (2026-09-24 12:30 +00). The one-sub-object version of this field
      // carried a single route per country, and §0 of the spec measures
      // what that cost a real reader in Ecuador.
      //
      // Every list item is a margin object plus four already-computed
      // facts (`state`, `bar_kind` with its own nearLine/condition,
      // `instrument`, `confidence`) — all four existed one layer down on
      // `entries[]` and were discarded at this composer's door. No figure
      // is computed, converted or rounded here or anywhere downstream;
      // `status: "unavailable"` still means a bar that could not be
      // expressed in the reader's currency, and `status: "no_comparison"`
      // means no comparison ran at all.
      //
      // STILL NOT inside `routes_detail` (a JSON string by design) and
      // still not a fifth shape behind `reader_bar_kind`'s one name.
      reader_margin: readerMargin,
      companion_disclosure: null,
      cadence: null,
      cadence_burden: null,
      // The per-route reading, in the engine's own entry shape plus one
      // reader sub-object.
      //
      // THE PER-ROUTE DETAIL IS NOW SHOWN — but NOT from this field, and
      // the distinction is worth stating because this comment used to
      // read "NOTHING RENDERS THIS TODAY" and the obvious reading of the
      // ruling was that this socket would get the consumer. It did not.
      // `reader_margin` above does, because it carries the same per-route
      // facts as live objects with their figures already composed, while
      // this field is a JSON STRING by design and a render surface would
      // have to parse it to get back what the row already holds. So:
      // the reader's per-route reading reaches the location page, the
      // Lists subheader, the tooltip and the pin name through
      // `reader_margin`'s four ordered lists; this field stays the
      // serialized per-route socket, and the only shipped parser of it
      // still filters on group_kind "location_gate" and still never
      // fires on a country-scope row. Nothing renders THIS field.
      routes_detail: JSON.stringify(entries.map((e) => ({
        route_key: e.row.route_key,
        composed_state: e.state,
        band: STATE_BAND[e.state],
        group_kind: "route",
        informational_only: false,
        reader_reading: {
          amount_band: e.result.amountBand,
          type_state: e.result.typeState,
          bar_kind: e.result.barKind,
          conditional: e.result.conditional,
          gate2_reason: e.result.gate2 ? e.result.gate2.reason : null,
        },
      }))),
      // The engine stamps its own run time here. A reader's row is
      // composed in this browser, this second, from figures that never
      // left it — there is no run to date, and inventing one would claim
      // a provenance this row does not have.
      generated_at: null,
    });
  }
  return rows;
}

// Layer the reader onto an already-built store: the weights exactly as
// today, plus the verdict rows. ONE call, in every page's main(), right
// after loadStore() resolves — the same position and the same category as
// applyStoredCustomWeights(), which it used to wrap — that function is
// retired with the stored weight vector, so this one no longer layers
// anything onto the store before building the verdict rows.
export function applyReaderLens(store) {
  // THE STALE-ROWS DEFECT, AND THE FIX. This function has three paths
  // that set no rows — no figures, a visit, an unsound route table — and
  // not one of them used to clear what a previous call had already put in
  // the index. The door re-renders the map IN PLACE after a commit
  // (js/map.js refreshAfterBoxCommit), so "previous call" is not
  // hypothetical: enter long-stay numbers, reopen the box, change to "a
  // visit", submit, and the old rows survived. The repro had the GT pin
  // still serving "Above the bar this route sets" under a perspective
  // line reading "You said a visit, so your numbers aren't read against
  // residence routes" — two contradictory claims in one paint. A reload
  // cleared it, which is why every check that started fresh missed it.
  //
  // One line, at the top, on every path: the reader's entry in the index
  // is rebuilt from the CURRENT input or it does not exist. Deleting the
  // key (not emptying the maps) is what every consumer's no-verdict
  // branch already tests — resolveVerdict() returns null on a missing
  // persona key, and hasReaderVerdicts() is false.
  store.verdictsByPersona.delete(READER_ID);
  const input = loadOwnNumbers();
  if (!input) return;
  const rows = buildReaderVerdictRows(store, input);
  if (!rows.length) return;
  const byLocation = new Map();
  const byCountry = new Map();
  for (const row of rows) byCountry.set(row.country_id, row);
  store.verdictsByPersona.set(READER_ID, { byLocation, byCountry });
}

// True when the reader's own verdict rows are actually in the index —
// i.e. figures were given, they were for a long stay, and the route table
// was sound. Every "has the reader got a verdict" branch asks this rather
// than re-deriving the three conditions.
export function hasReaderVerdicts(store) {
  const perPersona = store.verdictsByPersona.get(READER_ID);
  return !!(perPersona && perPersona.byCountry.size > 0);
}

// ---------------------------------------------------------------------
// 1b. The reader's pin — the two layers, in one callable place
// ---------------------------------------------------------------------
//
// THE RULE: overlay — fit fill on all 38, eligibility as a mark on the
// pin. This is the whole of it, in code:
//
//   QUALITY   — the fit index, on the general figures for every reader
//               now that the stored weight vector is retired. It is
//               the FILL, on all 38 locations, always, and entering
//               numbers changes not one of them.
//   ELIGIBILITY — the reader's own read, carried as a MARK beside the
//               fill rather than in it, present only where the box read
//               that country.
//
// and the test it must pass: entering numbers never subtracts a pin.
//
// WHAT CHANGED AND WHY, because this function once shipped the other
// way. The earlier build REPLACED the fill with the band colour on the
// read locations — the specified fallback rather than the primary.
// Measured, it passed the stated test (0 pins subtracted, 38 of 38
// painted) but failed the thing the test was standing for: at $300/month
// USD, 36 locations kept a fit colour and 2 lost theirs. The overlay is
// the picked shape, so the quality layer is now kept for all 38
// INCLUDING the ones the box answered, and the eligibility read sits
// beside it instead of on top of it.
//
// THE MARK'S PRESENCE TEST IS "DID THE BOX READ THIS COUNTRY", NOT "DID
// IT REACH AN ANSWER": `data_gap` gets a mark too, so a read-but-no-
// answer pin is visibly different from an unread pin, which has no mark
// at all. That is why the
// mark keys off the verdict row EXISTING and readerVerdictHasAnswer()
// keeps its narrower job (which question the words lead with).
//
// THE HATCH IS NOT RETAINED AS THE hard_fail MARK. The spec left that to
// a measurement — it retains only if it can sit over the fit fill
// without hiding it. Measured in the shipped
// source: `.location-pin.eliminated` sets `fill: url(#hatch-eliminated)`
// (css/style.css:509) and js/map.js does not even apply `entry.fill` to a
// pin carrying that class. The hatch IS the fill; it cannot sit over one.
// Retaining it would delete the quality layer on exactly the hard_fail
// pins, which is the thing the overlay exists to stop. So hard_fail takes
// the same stroke-channel mark every other band takes, in
// eliminatedColor(), and `eliminated` is never set on a reader pin.
//
// IT LIVES HERE, NOT IN renderMap(), FOR ONE REASON: a rule this
// specific has to be measurable, and a decision buried inside a
// DOM-building loop can only be read, not run. This function takes a
// store and a location and returns the paint — no DOM, no document, no
// side effects — so the same call the map makes can be made over all 38
// locations from a script, before and after figures are entered, which is
// exactly the evidence the ruling asks for. renderMap() consumes it and
// composes the tooltip around it.
export function readerPinPaint(store, loc) {
  const verdict = resolveVerdict(store, READER_ID, loc);
  const idx = store.personaIndex(READER_ID, loc.location_id);
  const value = idx ? idx.value : null;
  // Null when this country is outside the read set (no row at all);
  // READER_NOT_ENOUGH when it is inside and the record reached nothing.
  const band = verdict ? verdict.overall_band : null;
  const visual = verdict ? bandVisual(band) : null;
  return {
    // THE BOX READ THIS COUNTRY. Drives the mark and the tooltip's lead —
    // one boolean, so the two can never disagree about what happened.
    read: !!verdict,
    // THE READ REACHED A DIRECTIONAL ANSWER. Narrower than `read`: a
    // data_gap row is a read that answered nothing. No longer a paint
    // switch of any kind; kept because the words still need the
    // distinction and because three surfaces ask it.
    hasAnswer: readerVerdictHasAnswer(verdict),
    state: verdict ? verdict.overall_state : null,
    band,
    verdict,
    value,
    // THE QUALITY LAYER, ALL 38, ALWAYS — byte-identical to what this pin
    // painted before a single number was typed. This one line is
    // "entering numbers never subtracts a pin", and the stronger form of
    // it: entering numbers does not subtract a COLOUR either.
    fill: indexToColor(value),
    // About the fit VALUE now, never about the verdict band: a gap here
    // means this location carries no index, not that the reader's read
    // came back empty. (0 of 38 today — every location is scored.)
    gap: isGapValue(value),
    // Never, on any reader pin, for the reason argued at the head of this
    // section: the hatch is a fill and would erase the quality layer.
    eliminated: false,
    // THE ELIGIBILITY MARK. Null where the box never read the country —
    // which is how an unread pin stays visibly different from a
    // read-but-no-answer one, whose mark is the "?" badge.
    //
    // `markColor` RETIRED — hue is dropped from the map mark entirely.
    // It returned `visual.color` — the same
    // bandVisual() hex a persona's pin takes — and the map consumed it as
    // a band-coloured stroke. Measured in both themes, no assignment of
    // those hues clears 3:1 against land in both, so the mark became ink
    // geometry and the colour had no consumer left. Removed rather than
    // left returning: a colour nothing reads is how a hue finds its way
    // back onto a device that is meant to carry none. Lists chips and
    // page chips keep band colour and take it from bandVisual() directly,
    // untouched by this.
    markBand: band,
    // The hard_fail band's own "this is an elimination" flag, carried out
    // for the tooltip's instead-line ONLY. It does not reach the pin: the
    // pin's `eliminated` is false above and stays false.
    bandEliminated: !!visual && visual.eliminated,
    // Always a ramp consumer now — colors.js's repaintRampSwatches()
    // recolours every reader pin on a theme toggle, which under the old
    // fill-replacement it could not do for the read ones.
    isRampColored: true,
    rampKind: "index",
    rampValue: value,
  };
}

// readCountryNames() IS DELETED HERE, 2026-10-20, and the deletion is
// recorded rather than silent because the function was exported and a
// future reader will meet its name in older files. It resolved READ_SET
// into display names for the two sentences that listed the countries the
// box reads. Both stopped listing them this crossing — the perspective
// line and the Lists context line now say "every country this site
// covers", because the box reads all 21 and a 21-name list told a reader
// nothing while costing nine visual lines at 390px. With no caller left,
// an exported function is a promise nobody keeps.
//
// CHECKED, NOT ASSUMED, and the two are deliberately not treated the
// same: joinList() below has TWO live consumers and stays — the
// named-exceptions fallback of the box's coverage guard
// (js/own-numbers.js) and the dimension list a few lines down. A grep
// sees callers and not reflection, so this tree was also searched for a
// dynamic reference by name; there is none, and nothing here is reached
// by string.

// "a, b, c and d" — the join the coverage guard's exception clause uses,
// and the reader's own dimension list.
// EXPORTED rather than copied: two joiners would be two ways to write the
// same list on two surfaces a reader moves between.
export function joinList(parts) {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// ---------------------------------------------------------------------
// 2. The perspective line — one element, every page, the same slot
// ---------------------------------------------------------------------
//
// It replaces the profile bar in the bar's own position, so the eye finds
// it where the bar was. It states whose lens the page is showing and
// never a figure, never a count — the perspective-disclosure law,
// including its hardest clause: the no-lens state is itself a perspective
// and says so.
//
// Copy is the specified table, verbatim. The only things composed at
// render time are the reader's own dimension list, the persona's name and
// descriptor (already-shipped strings), the saved passport's country name
// (from the vendored ISO list) and the read set's country names (from the
// store) — no sentence is assembled from fragments.

const LINE_A = "Shown as-is — the general figures, nobody's situation in particular.";
const LINE_A_META = "Tell the site about you from the corner, any time.";
const LINE_B = "Shown as-is — your own answers are set aside for now, not deleted.";
// H5: the `priorities` key is DELETED, not emptied. joinList() reads one
// item as itself and two as "A and B", so with the key gone the line reads
// "Shown for you — read from your numbers and your passport." or either
// one alone. Both grammatical; no separator is left dangling. The
// zero-item reading is H8's, in perspectiveLineParts() below.
const READER_DIMENSION_LABELS = {
  numbers: "your numbers",
  passport: "your passport",
};
const LINE_E_META =
  "You said a visit, so your numbers aren't read against residence routes — entry rules for a visit come from your passport.";
// LINE_F_META_PRIORITIES is RETIRED — "The pins and the ranking are
// reweighted by your priorities; nothing here is a visa or money
// verdict." Nothing reweights them any more, so the ternary it stood in
// collapses to the passport line below, which is already written and
// already true of the one population that reaches it.
const LINE_F_META_PASSPORT =
  "Only the entry rules change with your passport; the pins and the ranking are the general figures.";

function readerDimensions() {
  const numbers = loadOwnNumbers();
  const dims = [];
  if (numbers) dims.push("numbers");
  if (loadNationality()) dims.push("passport");
  return { dims, numbers };
}

// Returns { text, meta } — meta may be "". Pure; no DOM.
export function perspectiveLineParts(store, persona) {
  // C — one of the eight worked examples.
  if (persona && persona !== READER_ID) {
    const name = personaDisplayLabel(persona);
    const nationality = loadNationality();
    const countryName = nationality ? ISO_COUNTRY_NAMES[nationality.code] : null;
    const descriptor = personaDescriptorSentence(persona);
    const passportClause = countryName
      ? `Your ${countryName} passport is saved and applies to the entry rules on every page.`
      : "";
    return {
      text: `Shown for ${name} — one of the site's eight worked examples, not you.`,
      meta: [descriptor, passportClause].filter(Boolean).join(" "),
    };
  }

  // D / E / F — the reader's own lens.
  if (persona === READER_ID) {
    const { dims, numbers } = readerDimensions();
    // H8 — THE EMPTY OWN-LENS, NEWLY REACHABLE, AND THE SENTENCE IT
    // BREAKS. REPRODUCED ON THE LIVE SITE BEFORE IT WAS GUARDED, not
    // argued from the code: skip step 1, answer one priority question,
    // skip step 3, and the box commits `custom_profile` plus
    // `saved_perspective {kind:"custom"}` with no own_numbers and no
    // nationality — because commitFlow() wrote the saved perspective
    // whenever ANYTHING committed, priorities alone included. That reader
    // returns, their retired profile is deleted on sight (H9), `dims` is
    // [], joinList([]) returns "", and this line renders
    // "Shown for you — read from ." — a sentence ending in a bare full
    // stop, on the surface whose whole job is saying whose view this is.
    //
    // THE FIX NEEDS NO NEW WORDS, and that is the point: a "custom" lens
    // with nothing behind it is not the reader's own view, so the render
    // falls through to the two shipped no-lens strings at the foot of this
    // function. NOT to LINE_B ("your own answers are set aside for now,
    // not deleted"), which is for a reader who HAS answers and chose to
    // look plainly — this reader has none, and the thing they gave is
    // gone rather than set aside, so both of LINE_B's clauses would be
    // false.
    //
    // THE GUARD, NOT A STORAGE WRITE: clearing the answerless lens on
    // page load would also reach this state, and it would make a write to
    // a stranger's device part of rendering a sentence. This way is also
    // true of any future empty-lens state.
    if (!dims.length) return { text: LINE_A, meta: LINE_A_META };
    const named = joinList(dims.map((d) => READER_DIMENSION_LABELS[d]));
    const text = `Shown for you — read from ${named}.`;
    if (numbers && numbers.duration_band === "visit") {
      return { text, meta: LINE_E_META };
    }
    if (numbers) {
      // This sentence stopped naming countries on 2026-10-20 (see the
      // meta string below), and the helper that named them is deleted
      // above rather than left exported with no caller.
      // Both variants, one substitution.
      //
      // WHY THIS IS IN SCOPE HERE, SAID OUT LOUD: it carried no
      // placeholder, so no grep found it, but its old second clause —
      // "Everywhere else shows as not checked yet" — went FALSE when the
      // 26 unread locations stopped being grey and started carrying their
      // fit colour. The overlay keeps them that way. This is a
      // perspective-disclosure surface stating what the reader is looking
      // at, and it was describing a map the site no longer paints. The
      // replacement was specified for exactly this change; landing it
      // authors nothing. If the scope call is wrong, it is one edit to
      // revert and the old sentence is directly above in the history.
      // H7: the ternary collapsed to its general arm. The weighted arm
      // ("the Fit index weighted by your priorities") was gated on a
      // stored profile, which no reader can have — a dead arm beside a
      // reader-facing sentence naming stored priorities is the exact
      // thing H5 and H6 exist to remove. The general arm was already
      // written, so no words are new.
      const fitClause = "the general Fit index";
      return {
        text,
        // TWO CORRECTIONS, and the first is the bigger one. "THE residence
        // routes" was an every-route claim and it was false inside the named
        // countries independently of bar kind: a route stating no single
        // figure returns before any comparison, three of the four capital
        // rules return before one, and the currency wall catches any route
        // whose bar is in a currency the reader did not enter. Dropping the
        // article makes this a sentence about WHERE the reading happens
        // rather than a claim that it happened everywhere.
        // Second: "income bars only" undercounted — capital bars are read
        // too, and it was a capital bar's reading that produced the false
        // sentence this crossing exists to fix. The trailing clause is
        // cause-neutral on purpose: it covers all four mechanisms above in
        // one breath and diagnoses none, which is the pattern this file
        // already chose over an enumerated list.
        // THIRD AND FOURTH CORRECTIONS, 2026-10-20, and the second is not
        // a count fix.
        //
        // The country list goes: "every country this site covers", the
        // wording already landed on the box's two scope strings and on
        // the verdict disclosure. Measured in a real browser before and
        // after: 444 characters with the names joined, 226 after. Measured
        // in a browser at 390px: NINE visual lines and 177px down to five
        // and 98px; at 1128px, five lines down to three. It renders on
        // every page of the site, and on a location page it was the
        // largest single term standing between a reader and his own
        // figures — the verdict block's top moved from 940px to 861px at
        // 390 on that cut alone.
        //
        // AND THE CLAUSE "; elsewhere they aren't read yet, and each page
        // says so" IS DELETED, which a count fix alone would not reach.
        // There is no elsewhere: READ_SET is every covered country. The
        // clause's whole content was a limit that no longer exists, and
        // leaving it would be a promise about an empty set. The precedent
        // is the struck limits line in js/own-numbers.js: "there is no
        // honest version of a sentence whose whole content was a limit
        // that no longer exists."
        //
        // NOTHING RELOCATES, unlike the box's coverage line: the
        // route-level honesty this sentence needs is already inside it —
        // "where a route states one this site can compare", the landed
        // three-surface condition — so the deletion is pure.
        //
        // THE ONE PLACE A FUTURE WIDENING FAILURE WOULD BE INVISIBLE, and
        // it is named rather than left to be found: after this deletion
        // the sentence holds nothing for the coverage guard to compare.
        // The guard in js/own-numbers.js catches the two box strings by
        // comparing READ_SET against countries.jsonl; this string will no
        // longer contain a list, a count or an exception clause, so if a
        // country is ever added to the site and not to READ_SET, this
        // sentence goes quiet about it and nothing here can notice.
        meta: `Your numbers are read against residence routes in every country this site covers — income bars and capital bars, where a route states one this site can compare. Pin colors and the ranking are ${fitClause}, everywhere.`,
      };
    }
    // The only population left here is a reader who gave a passport and no
    // figures: the no-numbers branch, with the priorities branch retired.
    return { text, meta: LINE_F_META_PASSPORT };
  }

  // B — explicitly general, with answers set aside. Distinguished from A
  // by whether there is anything to set aside; the wording says "answers"
  // rather than the old "priorities" because what is set aside may now be
  // figures or a passport.
  if (isExplicitGeneral() && hasReaderInput()) {
    return { text: LINE_B, meta: "" };
  }

  // A — nothing entered, no persona. The no-lens state, saying so.
  return { text: LINE_A, meta: LINE_A_META };
}

export function perspectiveLineHtml(store, persona) {
  const { text, meta } = perspectiveLineParts(store, persona);
  return `
    <p class="perspective-line">${escapeHtml(text)}</p>
    ${meta ? `<p class="perspective-line-meta">${escapeHtml(meta)}</p>` : ""}
  `;
}

// ---------------------------------------------------------------------
// (g) THE SAVE SWITCH'S NEW HOME, AND WHY IT IS THIS ONE.
//
// Directly beneath the perspective line, inside #persona-slot, before the
// disclaimer fold. Argued rather than asserted:
//
//  1. This is the one block on the page that already answers "whose view
//     is this, and what is the site holding for me" — which is the
//     question the switch acts on. The reader's eye is already trained
//     here: the perspective line took the retired profile bar's exact
//     slot, by design.
//  2. This slot renders on index.html, lists.html AND every location
//     page, so the switch becomes reachable from wherever a stranger
//     actually typed their income — the same argument that moved "Forget
//     my answers" into the footer. No new mechanism.
//  3. On index.html the slot sits above #map-root, so the reader meets it
//     on the way back from "See the world" — which is exactly what step
//     1's privacy paragraph promises them ("a switch you turn on
//     yourself, after you've seen the map").
//
// NOT IN THE FOOTER, where its destructive twin lives: the ask was "more
// visible", and the footer is the least-read band on the page. NOT
// floating or sticky: nothing on this map is positioned over the plate,
// by rule.
//
// It carries the one new string in (g) as a heading, because here the
// block arrives with no context — in the door it sits inside a panel that
// is entirely about the reader's own state and needs none.
const SLOT_KEEP_ID = "slot-keep";

function slotInnerHtml(store, persona) {
  return `${perspectiveLineHtml(store, persona)}`
    + `${keepBlockHtml({ id: SLOT_KEEP_ID, heading: KEEP_BLOCK_HEADING })}`
    + `${DISCLAIMER_DETAILS_HTML}`;
}

// The switch's state line and its tick mark are both read off the device
// at render time, so flipping it re-renders the block it lives in rather
// than patching two nodes by hand. Re-rendering the whole slot also
// re-reads the perspective line, which is correct: un-ticking changes
// what the browser is holding, and this block is where the site says so.
function renderSlotInto(el, store, persona) {
  el.innerHTML = slotInnerHtml(store, persona);
  wireKeepBlock(el, SLOT_KEEP_ID, () => renderSlotInto(el, store, persona));
}

// index.html / lists.html: the static <div id="persona-slot"></div> the
// profile bar used to fill. Same element, same position — the perspective
// line lands exactly where the bar was, so a returning reader's eye finds
// the "whose view is this" answer in the place it already looks.
export function renderPerspectiveSlot(el, store, persona) {
  if (!el) return;
  renderSlotInto(el, store, persona);
}

// l/*.html: no static placeholder exists at parse time (the H1 is built
// inside location.js's own render), so the caller passes the just-created
// <h1> as the anchor — the same one named exception the profile block
// already used.
export function renderPerspectiveBlock(store, persona, anchorEl) {
  const existing = document.getElementById("persona-slot");
  if (existing) existing.remove();
  const wrap = document.createElement("div");
  wrap.id = "persona-slot";
  anchorEl.insertAdjacentElement("afterend", wrap);
  renderSlotInto(wrap, store, persona);
}
