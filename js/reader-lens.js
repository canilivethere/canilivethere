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
  loadOwnNumbers, loadNationality, hasCustomProfile,
  applyStoredCustomWeights, isExplicitGeneral, hasReaderInput,
  personaDescriptorSentence, personaDisplayLabel, escapeHtml,
  DISCLAIMER_DETAILS_HTML, READER_ID,
} from "./app-shared.js";
import { ISO_COUNTRY_NAMES } from "./iso-names.js";
import { resolveVerdict } from "./data.js";
import { bandVisual, indexToColor, isGapValue } from "./colors.js";
import {
  READ_SET, sliceRoutes, evaluateRow, isValidOwnNumbers, assertRouteBarTable,
} from "./own-numbers-data.js";

// ---------------------------------------------------------------------
// 1. The reader's rows
// ---------------------------------------------------------------------

// The six reader-only `overall_state` tokens (app-shared.js's own
// STATE_HEADLINE / STATE_HEADLINE_BAND carry their sentences and their
// bands). Named here as constants so a typo is a reference error rather
// than a silently unrendered state.
const S_ABOVE = "READER_ABOVE_BAR";
const S_AT_LINE = "READER_AT_LINE";
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

const STATE_BAND = {
  [S_ABOVE]: "clean",
  [S_AT_LINE]: "uncertain_or_conditional",
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
// no basis on file — i.e. the declaration applies to the read.
export function readerBasisIsAssumed(store, countryId) {
  const rows = store.visaRoutesByCountry.get(countryId) || [];
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
  if (result.amountBand === "above") {
    return result.conditional ? S_ABOVE_CONDITIONAL : S_ABOVE;
  }
  if (result.amountBand === "at") return S_AT_LINE;
  if (result.amountBand === "below") return S_BELOW;
  // No amount reading at all. A route the reader's kind of income is
  // refused on is a real, recorded negative; everything else — the field
  // is absent, the source was silent, the bar isn't a single figure, the
  // bar is in another currency, the bar measures something other than
  // income — is ignorance, not a no (v1 §1.2a's own rule).
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
  // different amount ladder measured 263), on all five read countries.
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

// The deciding route's own confidence tier, copied verbatim. A MECHANICAL
// rule, not an opinion: the tier is the tier of the row that set the
// band, transported unchanged. No tier is authored here and none is
// averaged, because an average of two tiers is a tier nobody recorded.
function decidingTier(entries, countryState) {
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
  const exact = entries.find((e) => e.state === countryState);
  const sameBand = entries.find((e) => STATE_BAND[e.state] === STATE_BAND[countryState]);
  const deciding = entries.reduce(
    (lo, e) => (BAND_RANK[STATE_BAND[e.state]] < BAND_RANK[STATE_BAND[lo.state]] ? e : lo),
    entries[0]
  );
  const row = (exact || sameBand || deciding).row;
  return row.confidence || null;
}

// Build the reader's verdict rows: one per country in the read set, in
// the engine's own row shape — the same thirteen keys every row in
// derived/verdicts.jsonl carries, no more and no fewer, so every consumer
// sees only fields it already knows.
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
  // The box refuses wholesale rather than answering partially off a stale
  // lookup key — the same assertion the box's own render half runs, for
  // the same reason, applied to the composer so the two can never
  // disagree about whether the table is sound.
  if (!assertRouteBarTable(allRoutes).ok) return [];
  const slice = sliceRoutes(allRoutes);

  const rows = [];
  for (const countryId of READ_SET) {
    const countryRows = slice.filter((r) => r.country_id === countryId);
    if (!countryRows.length) continue;
    const entries = countryRows.map((row) => {
      const result = evaluateRow(row, input);
      return { row, result, state: readerStateForRow(result) };
    });
    const overallState = composeCountryState(entries.map((e) => e.state));
    if (!overallState) continue;
    rows.push({
      persona_id: READER_ID,
      location_id: null,
      country_id: countryId,
      scope: "country",
      overall_band: STATE_BAND[overallState],
      overall_state: overallState,
      confidence_tier: decidingTier(entries, overallState),
      deciding_group_kind: "route",
      companion_disclosure: null,
      cadence: null,
      cadence_burden: null,
      // The per-route reading, in the engine's own entry shape plus one
      // reader sub-object. NOTHING RENDERS THIS TODAY — the only shipped
      // parser of routes_detail filters on group_kind "location_gate" and
      // never fires on a country-scope row. It is carried because B8 (the
      // verdict block's per-route ordering for a reader) is the surface it
      // belongs on and is held, and re-deriving it there would mean
      // running the gates twice. Flagged rather than left to be
      // discovered: the reader's per-route detail is COMPUTED and not yet
      // SHOWN.
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
// applyStoredCustomWeights(), which it now wraps.
export function applyReaderLens(store) {
  applyStoredCustomWeights(store);
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
//   QUALITY   — the fit index, reweighted by the reader's own priorities
//               where they gave any, general where they did not. It is
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

// The read set's country names, in the read set's own order, resolved
// from the store rather than written out — a name typed here would be a
// fact authored in a render file, and it would rot the day the set grows.
export function readCountryNames(store) {
  return READ_SET
    .map((id) => store.countriesById.get(id))
    .filter(Boolean)
    .map((c) => c.name);
}

// "a, b, c and d" — the join the perspective line uses in two places, and
// now the Lists context line too — the same readCountryNames(store),
// joined the same way the perspective line joins it.
// EXPORTED rather than copied: two joiners would be two ways to write the
// same list of the same five countries on two surfaces a reader moves
// between.
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
const READER_DIMENSION_LABELS = {
  numbers: "your numbers",
  priorities: "your priorities",
  passport: "your passport",
};
const LINE_E_META =
  "You said a visit, so your numbers aren't read against residence routes — entry rules for a visit come from your passport.";
const LINE_F_META_PRIORITIES =
  "The pins and the ranking are reweighted by your priorities; nothing here is a visa or money verdict.";
const LINE_F_META_PASSPORT =
  "Only the entry rules change with your passport; the pins and the ranking are the general figures.";

function readerDimensions() {
  const numbers = loadOwnNumbers();
  const dims = [];
  if (numbers) dims.push("numbers");
  if (hasCustomProfile()) dims.push("priorities");
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
    const named = joinList(dims.map((d) => READER_DIMENSION_LABELS[d]));
    const text = `Shown for you — read from ${named}.`;
    if (numbers && numbers.duration_band === "visit") {
      return { text, meta: LINE_E_META };
    }
    if (numbers) {
      const names = readCountryNames(store);
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
      const fitClause = hasCustomProfile()
        ? "the Fit index weighted by your priorities"
        : "the general Fit index";
      return {
        text,
        meta: `Your numbers are read against the residence routes in ${joinList(names)} — income bars only; elsewhere they aren't read yet, and each page says so. Pin colors and the ranking are ${fitClause}, everywhere.`,
      };
    }
    return {
      text,
      meta: hasCustomProfile() ? LINE_F_META_PRIORITIES : LINE_F_META_PASSPORT,
    };
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

function slotInnerHtml(store, persona) {
  return `${perspectiveLineHtml(store, persona)}${DISCLAIMER_DETAILS_HTML}`;
}

// index.html / lists.html: the static <div id="persona-slot"></div> the
// profile bar used to fill. Same element, same position — the perspective
// line lands exactly where the bar was, so a returning reader's eye finds
// the "whose view is this" answer in the place it already looks.
export function renderPerspectiveSlot(el, store, persona) {
  if (!el) return;
  el.innerHTML = slotInnerHtml(store, persona);
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
  wrap.innerHTML = slotInnerHtml(store, persona);
  anchorEl.insertAdjacentElement("afterend", wrap);
}
