// CanILiveThere — the welcome box's engine, with no DOM in it.
//
// Built to the welcome-box spec and the ruled storage shape. This half
// holds the bar reader, its load-time assertion, and the
// three gates — all pure functions over plain data, so the whole engine
// is exercisable outside a browser and a later maintainer can change a
// rule without reading a line of render code. Every reader-facing string
// lives in the render half (own-numbers.js); this file returns reasons,
// never sentences. Its one import is the four vocabulary lists (below):
// no function here reads or writes the page, and none is called at load.
//
// Zero facts authored here. Every number, threshold, unit, condition and
// route name that reaches a reader comes verbatim out of
// derived/visa-routes.jsonl — including, since the retirement of the
// route-bar lookup table, the four properties of each row's own bar:
// `currency_code`, `period`, `bar_kind` and `property_rule`. There is no
// longer any per-route fact transcribed in this file. See barForRow().

import {
  OWN_NUMBERS_INCOME_TYPES, OWN_NUMBERS_CURRENCIES,
  OWN_NUMBERS_PERIODS, OWN_NUMBERS_DURATION_BANDS,
} from "./app-shared.js";

// Gate 0. The five countries the box reads. CR is Crete
// (derived/countries.jsonl: {"country_id":"CR","name":"Crete"}), not
// Costa Rica. The refused set is never written down: it is derived at
// runtime as every country in countries.jsonl minus these five — never a
// fall-through — so a 22nd country appears as a refusal on day one
// instead of vanishing.
export const READ_SET = ["TH", "GT", "PT", "ES", "CR"];

// The four vocabularies, taken from the storage module rather than
// written out again here. Both files check a value against these lists —
// this one before an answer is computed, that one before a stored value
// is handed back — and two copies of a list that both sides validate
// against is a way to lose a reader's saved figures to a one-line edit.
// The names below stay, because they are what this file's own code and
// its callers already say; the values are the storage module's.
//
// The stored token is the corpus vocabulary's stem, never a display
// label. The join to a route row is one string concatenation —
// "income_type_" + token — and the four resulting names are exactly the
// four that exist in the data. "unspecified" is the fifth option offered
// to the reader and maps to no field lookup at all (Gate 1 is skipped).
export const INCOME_TYPE_TOKENS = OWN_NUMBERS_INCOME_TYPES;
export const CURRENCY_TOKENS = OWN_NUMBERS_CURRENCIES;
export const PERIOD_TOKENS = OWN_NUMBERS_PERIODS;
export const DURATION_BANDS = OWN_NUMBERS_DURATION_BANDS;

// The near-the-bar band, and THIS COMMENT IS THE CITATION IT IS OWED.
//
// SINGLE SOURCE: `visa-fit:_param:margin_buffer`, v2, in the rules layer
// (`derived/rules.jsonl`) — its `near_line_band` field. That row is now
// the one source of this number for BOTH the engine's amount gate and
// this reader read: one rule, one pipeline, no second copy with an
// opinion of its own.
//
// SYMMETRIC, and the row says so in its own words: a read within this
// fraction of its bar EITHER WAY is near the line and lands uncertain,
// rather than clear or refused. A fail inside the band is as undecided
// as a pass inside it.
//
// WHAT THIS LINE STILL IS, stated plainly rather than papered over: a
// value-copy. The site does not fetch `rules.jsonl` client-side yet, so
// the number is written here and agrees with its source by coincidence
// of value, not by construction. It is owed a live read the moment that
// accessor exists, and until then this constant must never be changed
// here — it changes in the row, and follows.
export const BAND = 0.10;

// The coarse-record allowance. Where a reader says their income is
// passive and the row carries NO granular `income_type_passive` field,
// the coarse `accepts_passive_income` field is allowed to answer Gate 1
// — but only for the passive selection, and only on the literal values
// "Yes" and "No", because that field answers the passive question and
// answers no other.
//
// ONE SWITCH, DELIBERATELY. Reading a coarse field to answer a granular
// question is a cross-grain read, and it is an open question whether the
// data layer means it that way. If it does not, it bounces cleanly:
// strike it and the four affected rows return to "Not recorded".
// Flipping this constant to false is that strike, in one edit, with no
// other line to find: gate1() below falls straight through to the absent
// branch and the four affected rows (CR digital-nomad, CR FIP, ES
// digital-nomad, ES non-lucrative) render exactly what they rendered
// before.
export const COARSE_PASSIVE_FALLBACK = true;

// ---------------------------------------------------------------------
// THE BAR, READ OFF THE ROW.
//
// This replaces the 20-row hand-transcribed route-bar lookup table this
// file used to carry — twenty rows of currency, period and bar-kind
// copied out of each route's free-prose `unit` string, plus two
// capital-only fields. One rulebook: the export pipeline owns the rules
// and exports them as data, and this file applies only what it is given.
// A table of transcribed values standing where an export belongs is the
// thing being retired, not the values themselves.
//
// The export now belongs to the rows. Every route row in
// derived/visa-routes.jsonl carries four always-emitted fields, and this
// function is the whole of the browser's reading of them:
//
//   bar_kind       "income" | "capital" | "none" — what the bar measures.
//   currency_code  the bar's currency, or "unstated".
//   period         "month" | "year" | "unstated"; only ever consulted for
//                  kind "income", and "unstated" on every bar that is not
//                  one — so there is no third value to consult.
//   property_rule  how a capital bar may be read against a reader's
//                  property capital: "compare" | "bank_balance" |
//                  "total_assets", or "unstated" while no source has been
//                  extracted for it. Only meaningful for kind "capital".
//
// ONE MAPPING, AND IT IS NOT A JUDGEMENT ABOUT A ROUTE. "unstated"
// becomes `null` — the value the retired table held for exactly the same
// absence — on both currency and period, so that no comparison anywhere
// downstream can test a reader's real currency against the literal string
// "unstated" and convert, wall or band off it, and so that no reader
// string can spend the word as if it were a period. Two of them would:
// app-shared.js's marginPeriodSuffix() renders this field into prose, and
// the line above it chooses between "Your income" and "Your capital" on
// whether it is set at all.
//
// THE BROWSER HOLDS NO RULE ABOUT WHEN TO TRUST THIS FIELD, and that is
// the point. An earlier draft of this function nulled `period` on every
// bar that was not an income bar, because the export stated a real period
// on bars that are not per-anything. That was a rule about the data living
// in the reader of the data. The export now states "unstated" on every
// non-income bar, so the field can be read straight and the absence is the
// export's own word for it.
//
// FAIL-CLOSED ON AN UNKNOWN KIND, deliberately: a `bar_kind` this file
// does not know is not quietly treated as income (which would compare a
// reader's figure against a bar that may measure something else) — the
// row gets no bar at all, evaluateRow() renders it as "nothing on file",
// and assertRouteBarFields() below refuses the whole box for it.
export const BAR_KINDS = ["income", "capital", "none"];

// The values of `property_rule` this engine acts on are handled by name in
// gate2()'s capital branch — "compare" compares, "bank_balance" and
// "total_assets" refuse. "unstated" is not one of them and must never be
// mapped onto one here: it is the absence of an extracted rule, and that
// branch refuses on it.
export function barForRow(row) {
  if (!row || typeof row.bar_kind !== "string") return null;
  if (!BAR_KINDS.includes(row.bar_kind)) return null;
  return {
    kind: row.bar_kind,
    currency: row.currency_code === "unstated" ? null : row.currency_code,
    period: row.period === "unstated" ? null : row.period,
    propertyRule: row.property_rule,
  };
}

// The slice is every ':route:'-kind row in the five read countries.
// ':visit:' rows are bare tier pointers with no threshold and
// no income field — the tourist layer is the passport wing's answer, and
// this box routes to it rather than answering it.
export function isReadRoute(row) {
  return READ_SET.includes(row.country_id)
    && typeof row.route_key === "string"
    && row.route_key.includes(":route:");
}

export function sliceRoutes(allRouteRows) {
  return allRouteRows.filter(isReadRoute);
}

// THE EXPORT IS ASSERTED, NOT TRUSTED — the same net the retired table's
// own load-time assertion was, moved onto the thing that now carries the
// facts. Then: every route_key in the table had to exist in the data and
// every slice row had to be in the table, because a stale key meant a
// wrong bar. Now: every row in the slice must carry a `bar_kind` this
// engine knows and a `property_rule` field, because a row exported before
// those fields existed would otherwise be read as a bar of no kind. A
// mismatch renders the whole box in its refusal state with one line,
// never a partial answer built on half an export.
export function assertRouteBarFields(allRouteRows) {
  const slice = sliceRoutes(allRouteRows);
  const missingFields = slice
    .filter((r) => !barForRow(r) || typeof r.property_rule !== "string")
    .map((r) => r.route_key);
  return {
    ok: missingFields.length === 0,
    sliceCount: slice.length,
    missingFields,
  };
}

// ---------------------------------------------------------------------
// Reader input. Shaped exactly as the ruled storage sub-object: the
// reader's own figures, in the currency and period they chose, never
// normalised on the way in.
//   { amount, currency, period, income_type, duration_band,
//     property_capital?: { amount, currency } }
// ---------------------------------------------------------------------

export function isValidOwnNumbers(v) {
  if (!v || typeof v !== "object") return false;
  if (!Number.isFinite(v.amount) || v.amount <= 0) return false;
  if (!CURRENCY_TOKENS.includes(v.currency)) return false;
  if (!PERIOD_TOKENS.includes(v.period)) return false;
  if (!INCOME_TYPE_TOKENS.includes(v.income_type)) return false;
  if (!DURATION_BANDS.includes(v.duration_band)) return false;
  if (v.property_capital !== undefined) {
    const p = v.property_capital;
    if (!p || typeof p !== "object") return false;
    if (!Number.isFinite(p.amount) || p.amount <= 0) return false;
    // One currency per submission (mirrors app-shared.js's loadOwnNumbers()
    // — the same two-copy rule this file's header comment already names):
    // property_capital no longer carries its own currency going forward.
    // A pre-migration record can still carry a stray one; it fails the
    // whole record closed only if it disagrees with the top-level currency.
    if (p.currency !== undefined && p.currency !== v.currency) return false;
  }
  return true;
}

// Period arithmetic: month<->year is x12 / /12, and nothing else is
// converted. This is the corpus's own arithmetic, not the box's
// invention — PT:d7's own fact states its savings floor as "EUR 11,040
// (12x the EUR 920/month income threshold)".
export function toPeriod(amount, fromPeriod, toPeriodName) {
  if (fromPeriod === toPeriodName) return amount;
  if (fromPeriod === "month" && toPeriodName === "year") return amount * 12;
  if (fromPeriod === "year" && toPeriodName === "month") return amount / 12;
  return null;
}

// ---------------------------------------------------------------------
// The conversion crossing. The currency wall Gate 2 used to
// raise (reason "currency_wall") is gone: a currency mismatch now
// converts where the rules layer's own fx_rates row (derived/rules.jsonl,
// resolved by js/data.js's resolveFxRates(), threaded in as `fxRates`
// below) allows it, and falls to reason "fx_unavailable" — the SAME
// non-guess branch, whatever the specific cause — only where it can't:
// the row is absent, the pair isn't in it, or the one rate consulted is
// stale (the carrier shape's own rule). No new gate and no new θ:
// bandFor() below is unchanged and is called on the SAME two numbers it
// always was, one of which may now be a converted figure rather than a
// native one.
// ---------------------------------------------------------------------

// Resolves the one non-base rate entry a conversion actually consults for
// `currency`, or null when it can't be trusted right now — absent from
// the table, or older than the row's own `stale_after_days` (30, today).
// `nowMs` is injectable for a test; every real call uses the running
// page's own clock.
function fxEntryFor(fxRates, currency, nowMs) {
  if (!fxRates || !fxRates.rates || !fxRates.base) return null;
  if (currency === fxRates.base) return { usd_per_unit: 1, as_of: null, source: null, isBase: true };
  const entry = fxRates.rates[currency];
  if (!entry || !entry.as_of) return null;
  const staleAfter = Number.isFinite(fxRates.stale_after_days) ? fxRates.stale_after_days : 30;
  const ageDays = Math.floor((nowMs - Date.parse(entry.as_of + "T00:00:00Z")) / 86400000);
  if (ageDays > staleAfter) return null;
  return entry;
}

// Converts `amount` (in `fromCurrency`) into `toCurrency`, pivoting
// through the row's own USD base — the general two-hop formula the
// carrier shape documents as unreached by this launch's own
// inputs (EUR<->USD is the only pair this crossing's data ever exercises)
// but not to be actively broken. Returns null on the same non-guess
// branch as fxEntryFor() above, for either leg. On success, the
// rate/asOf/source describe the ONE non-base entry actually used — never
// both, on today's reachable inputs, since fromCurrency/toCurrency are
// never both non-USD in this crossing's own data.
export function convertAmount(fxRates, amount, fromCurrency, toCurrency, nowMs = Date.now()) {
  if (fromCurrency === toCurrency) return { amount, rate: null, asOf: null, source: null };
  const fromEntry = fxEntryFor(fxRates, fromCurrency, nowMs);
  if (!fromEntry) return null;
  const toEntry = fxEntryFor(fxRates, toCurrency, nowMs);
  if (!toEntry) return null;
  const usd = amount * fromEntry.usd_per_unit;
  const out = usd / toEntry.usd_per_unit;
  const named = fromEntry.isBase ? toEntry : fromEntry;
  return { amount: out, rate: named.usd_per_unit, asOf: named.as_of, source: named.source };
}

// The near-the-bar band, applied only to a same-currency comparison.
export function bandFor(readerAmount, threshold) {
  if (readerAmount >= threshold * (1 + BAND)) return "above";
  if (readerAmount >= threshold * (1 - BAND)) return "at";
  return "below";
}

// The braces the render layer puts round a conditional row. The belt is
// the verbatim `unit`, rendered in full whatever this returns, so if the
// token is ever
// reworded upstream the row still renders correctly, just less loudly —
// a graceful failure, not a wrong one.
export function isConditional(row) {
  return typeof row.unit === "string" && row.unit.includes("CONDITIONAL");
}

// The income-type record a row actually carries, in the order the four
// granular fields are listed in the welcome-box spec's coverage table, plus the
// coarse `accepts_passive_income` field where a row has only that.
// Transport only: values are returned exactly as stored.
export function incomeTypeRecord(row) {
  const out = [];
  for (const token of ["pension", "passive", "remote_active", "local_active"]) {
    const field = "income_type_" + token;
    if (Object.prototype.hasOwnProperty.call(row, field)) {
      out.push({ kind: "granular", token, value: row[field] });
    }
  }
  if (Object.prototype.hasOwnProperty.call(row, "accepts_passive_income")) {
    out.push({ kind: "coarse", token: null, value: row.accepts_passive_income });
  }
  return out;
}

// ---------------------------------------------------------------------
// The gates, in the spec's fixed order. A row never skips to a later
// gate; the first gate that cannot answer is the answer.
// ---------------------------------------------------------------------

// Gate 1 — income type.
function gate1(row, input) {
  if (input.income_type === "unspecified") return { typeState: "ungated" };
  const value = row["income_type_" + input.income_type];
  if (value === undefined) {
    // The coarse-record allowance. Guarded by one
    // named constant so it strips in a single edit; scoped to the passive
    // selection and to the two literal values, so a coarse field can
    // never answer a question it was not asked. TH privilege's coarse
    // value is neither "Yes" nor "No" and falls through here correctly.
    if (COARSE_PASSIVE_FALLBACK && input.income_type === "passive") {
      const coarse = row.accepts_passive_income;
      if (coarse === "Yes") return { typeState: "coarse_yes", coarseValue: coarse };
      if (coarse === "No") return { typeState: "coarse_no", coarseValue: coarse };
    }
    return { typeState: "absent" };
  }
  if (value === "primary_accepted") return { typeState: "ok" };
  if (value === "supplementary_only") return { typeState: "partial" };
  if (value === "explicitly_rejected") return { typeState: "blocked" };
  if (value === "not_stated_by_source") return { typeState: "not_stated" };
  // A value the ratified vocabulary does not hold degrades to honest
  // silence, never to a wrong chip.
  return { typeState: "absent" };
}

// DOES THIS ROUTE CARRY NO RECORD AT ALL OF THE READER'S INCOME KIND?
// The truth condition for the income-type gap note in js/own-numbers.js,
// and it ASKS GATE 1 rather than re-reading the fields, so "no record"
// on screen and "no record" in the engine cannot drift apart. The coarse
// passive fallback is therefore included for free and correctly: a row
// answered by `accepts_passive_income` HAS a record and is not a gap.
//
// "unspecified" runs no type gate at all (gate 1 returns "ungated"), so
// this is false for every row there and the note stays hidden — right,
// because there is no "this kind" for the record to be silent about.
export function hasNoIncomeTypeRecord(row, incomeType) {
  return gate1(row, { income_type: incomeType }).typeState === "absent";
}

// How many of the routes the box reads have no record of this kind.
// The note renders on >= 1 and retires itself at 0; nothing renders the
// number, and nothing may — the string this serves replaced a
// hand-maintained count that the data outgrew, and a no-count boundary
// rule stands over the sentence either way.
export function countRoutesWithNoTypeRecord(allRouteRows, incomeType) {
  return sliceRoutes(allRouteRows).filter((r) => hasNoIncomeTypeRecord(r, incomeType)).length;
}

// Gate 2 — is the bar comparable to what the reader entered?
// Three independent conditions, all of which must hold; each failure has
// its own rendered reason, and none is a silent skip.
function gate2(row, bar, input, fxRates) {
  // Condition 2 is checked first for the two rows that state no single
  // figure at all: the no-single-figure condition names exactly those
  // two rows (TH O-A and TH privilege) as the ones that render their
  // `income_threshold` verbatim, so they land there rather than in
  // condition 1's bar-kind sentence. Their `kind` is "none", so there is
  // no bar kind to mismatch in the first place.
  if (bar.kind === "none" || !Number.isFinite(row.value_num_low)) {
    return { reason: "no_number" };
  }

  if (bar.kind === "capital") {
    // Capital bars compare against the reader's property-capital figure,
    // and only where the reader gave one.
    if (!input.property_capital) {
      // No instrument phrase on this payload any more: nothing ever
      // destructured it (measured), and the instrument now reaches copy
      // from the row itself at the one site that renders it.
      return { reason: "kind_mismatch" };
    }
    if (bar.propertyRule === "bank_balance") return { reason: "property_bank_balance" };
    if (bar.propertyRule === "total_assets") return { reason: "property_total_assets" };
    // THE GUARD THIS BRANCH DID NOT HAVE. The "compare" path used to be
    // reached by FALLING THROUGH the two tests above — there was
    // no test for "compare" itself, only a comment saying that is what
    // was left. Latent while the hand table held one of three known
    // values on every capital row; live the moment `property_rule` became
    // an exported field with a fourth value ("unstated"), because a row
    // whose rule no source has stated would have been compared anyway —
    // handing a reader a NUMERIC verdict against a bar nobody has
    // established their property capital may be read against. That is a
    // wrong answer, not a blander one. Anything that is not an explicit
    // "compare" refuses here, on the same generic capital reason.
    if (bar.propertyRule !== "compare") return { reason: "property_rule_unstated" };
    // "compare": the row's own paperwork names property as a qualifying
    // vehicle. One currency per submission: the property figure is read in
    // input.currency — there is no separate property_capital.currency
    // once the second selector is gone.
    if (input.currency === bar.currency) {
      return { reason: null, comparable: { readerAmount: input.property_capital.amount, threshold: row.value_num_low, converted: false } };
    }
    const converted = convertAmount(fxRates, input.property_capital.amount, input.currency, bar.currency);
    if (!converted) return { reason: "fx_unavailable" };
    return {
      reason: null,
      comparable: {
        readerAmount: converted.amount, threshold: row.value_num_low,
        converted: true, rate: converted.rate, rateAsOf: converted.asOf, rateSource: converted.source,
      },
    };
  }

  // kind === "income".
  const normalised = toPeriod(input.amount, input.period, bar.period);
  if (!Number.isFinite(normalised)) return { reason: "no_number" };
  if (input.currency === bar.currency) {
    return { reason: null, comparable: { readerAmount: normalised, threshold: row.value_num_low, converted: false } };
  }
  const converted = convertAmount(fxRates, normalised, input.currency, bar.currency);
  if (!converted) return { reason: "fx_unavailable" };
  return {
    reason: null,
    comparable: {
      readerAmount: converted.amount, threshold: row.value_num_low,
      converted: true, rate: converted.rate, rateAsOf: converted.asOf, rateSource: converted.source,
    },
  };
}

// The whole evaluation for one row. Returns reasons and states; the
// render layer owns every sentence. `fxRates` is the rules layer's own
// currency table (js/data.js's resolveFxRates(), store.fxRates) — passed
// through to Gate 2 untouched; this function looks at none of its shape
// itself.
export function evaluateRow(row, input, fxRates) {
  const bar = barForRow(row);
  const conditional = isConditional(row);
  const result = {
    routeKey: row.route_key,
    conditional,
    typeState: null,
    coarseValue: null,
    barKind: null,
    typeChips: true,
    gate2: null,
    amountBand: null,
    amountChipSuppressed: false,
    bucket: 2,
  };
  if (!bar) {
    // Unreachable while assertRouteBarFields() gates the whole box, kept
    // so this function is total rather than throwing on a row whose
    // export carries no bar kind this engine knows.
    result.typeState = "absent";
    result.bucket = 2;
    return result;
  }
  result.barKind = bar.kind;

  // GATE 1 IS A STOPPING GATE ONLY ON ROWS WHOSE BAR IS AN INCOME BAR.
  // Where the bar measures capital, or the row states no bar at all,
  // Gate 1 still runs and what it found still renders — as a record
  // line, never as a chip — but it cannot end the row. "Not this kind of
  // income" is a sentence about an income bar; on a row that sets none it
  // is a claim the data does not make, and answering it first is the same
  // category error Gate 2's condition 1 exists to prevent, made one gate
  // too early. Measured cost of the old order: GT:route:investor-visa,
  // the one row a property-capital figure may be compared against, was
  // reachable only by the reader who said "a mix, or I'd rather not say".
  const typeGateStops = bar.kind === "income";
  result.typeChips = typeGateStops;

  const g1 = gate1(row, input);
  result.typeState = g1.typeState;
  if (g1.coarseValue !== undefined) result.coarseValue = g1.coarseValue ?? null;
  if (typeGateStops) {
    if (g1.typeState === "blocked" || g1.typeState === "coarse_no") {
      result.bucket = 1;
      return result;
    }
    if (g1.typeState === "absent" || g1.typeState === "not_stated") {
      result.bucket = 2;
      return result;
    }
    // "ok", "coarse_yes", "partial" and "ungated" all proceed to Gate 2.
    // A supplementary bar cannot be cleared on this income alone, so its
    // amount chip is suppressed — the row still runs the gate and still
    // renders whatever Gate 2 has to say.
    result.amountChipSuppressed = g1.typeState === "partial";
  }

  const g2 = gate2(row, bar, input, fxRates);
  if (g2.reason) {
    result.gate2 = g2;
    // "fx_unavailable" buckets as 1 — a real, chip-worthy finding — the
    // same bucket "currency_wall" used to hold before conversion existed:
    // the record itself is there and comparable in principle, only the
    // rate to compare it with is missing today.
    result.bucket = g2.reason === "no_number" ? 3 : 1;
    return result;
  }

  result.bucket = 1;
  // CARRIED, not discarded — the margin work needs it. Until this line, `result.gate2` was set ONLY on the refusal path above, so on a
  // row that actually produced a comparison the two figures bandFor()
  // reads (`readerAmount`, `threshold`, plus `converted`/`rate`/
  // `rateAsOf`/`rateSource`) were computed and thrown away, and the row
  // kept nothing but the three-value band. The reader's margin needs that
  // same pair — my number, the bar, and by how much — so the gate's own
  // result rides the row instead of a second caller running
  // the gates again to get it back.
  //
  // NOT A NEW COMPUTATION AND NOT A NEW NUMBER: this is the object gate2()
  // already returned on this call, stored instead of dropped. bandFor()
  // below still reads the same pair off the same object.
  //
  // ONE EXISTING CONSUMER STARTS WORKING BECAUSE OF THIS LINE, named here
  // rather than left to be discovered: js/reader-lens.js's
  // atLineConversionSummary() tests `gate2.comparable.converted`, which
  // could never be true while gate2 was null on every successful row — so
  // READER_AT_LINE_CONVERTED (app-shared.js) has been unreachable since
  // the conversion crossing shipped it. It becomes reachable here. That is
  // that string's own shipped intent, not a behaviour this build invented,
  // but it IS a visible change and it is flagged for the gate.
  result.gate2 = g2;
  if (result.amountChipSuppressed) return result;
  result.amountBand = bandFor(g2.comparable.readerAmount, g2.comparable.threshold);
  return result;
}

// Within a country, rows with a chip first, then not-recorded
// rows, then no-number rows; original data order within each group.
export function orderRows(evaluated) {
  const buckets = [[], [], []];
  evaluated.forEach((e) => buckets[e.result.bucket - 1].push(e));
  return [...buckets[0], ...buckets[1], ...buckets[2]];
}
