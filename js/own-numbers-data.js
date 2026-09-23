// CanILiveThere — the welcome box's engine, with no DOM in it.
//
// Built to the welcome-box spec and the ruled storage shape. This half
// holds the route-bar lookup table, its load-time assertion, and the
// three gates — all pure functions over plain data, so the whole engine
// is exercisable outside a browser and a later maintainer can change a
// rule without reading a line of render code. Every reader-facing string
// lives in the render half (own-numbers.js); this file returns reasons,
// never sentences. Its one import is the four vocabulary lists (below):
// no function here reads or writes the page, and none is called at load.
//
// Zero facts authored here. Every number, threshold, unit, condition and
// route name that reaches a reader comes verbatim out of
// derived/visa-routes.jsonl. ROUTE_BARS below is transcription of what
// each row's own `unit` string already says in words — see the header
// comment on that table.

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
// The 20-row lookup table.
//
// `unit` in the corpus is free prose, not an enum — it is a display
// string and a condition carrier, never a parse target. So currency,
// period and bar-kind are transcribed here by hand, once, from what each
// row's own `unit` (or, where there is no unit, its own
// `income_threshold`/`threshold_label`) says in words. Twenty lines,
// auditable at a glance, versus a regex over free prose that would
// silently mis-read the first row somebody rewords.
//
// This is a build artifact and it is knowingly technical debt: it will
// rot the first time a route row's currency changes and nobody
// re-checks it. assertRouteBarTable() below is the net — the box refuses
// wholesale rather than answering partially off a stale key. The durable
// fix is real `currency_code` / `period` / `bar_kind` fields on the route
// rows themselves — a data-layer change, not a change here.
//
// kind:
//   "income"  — the bar measures a flow of income (14 rows)
//   "capital" — the bar measures a balance, a deposit or assets (4 rows)
//   "none"    — the row states no single figure at all (2 rows)
// period is only ever consulted for kind === "income"; it is null on
// every other row because those bars are not per-anything.
// currency is null on the one row that names no currency anywhere
// (TH privilege states "None — one-time cash payment only"); nothing may
// default it, and kind "none" means it is never consulted.
// barPhrase / propertyRule are only meaningful for kind === "capital".
export const ROUTE_BARS = {
  // Crete — both €/month, from each row's own unit string.
  "CR:route:digital-nomad-visa":
    { currency: "EUR", period: "month", kind: "income" },
  "CR:route:financially-independent-person-fip-visa":
    { currency: "EUR", period: "month", kind: "income" },

  // Spain — both €/month.
  "ES:route:digital-nomad-visa":
    { currency: "EUR", period: "month", kind: "income" },
  "ES:route:non-lucrative-visa":
    { currency: "EUR", period: "month", kind: "income" },

  // Guatemala — two $/month income bars and one asset requirement
  // ("USD (verifiable, from abroad)"), the single row in the whole slice
  // a property-capital figure may be compared against.
  "GT:route:digital-nomad-visa":
    { currency: "USD", period: "month", kind: "income" },
  "GT:route:investor-visa":
    { currency: "USD", period: null, kind: "capital", barPhrase: "an asset requirement", propertyRule: "compare" },
  "GT:route:rentista--pensionado-visa":
    { currency: "USD", period: "month", kind: "income" },

  // Portugal — both €/month.
  "PT:route:d7-visa":
    { currency: "EUR", period: "month", kind: "income" },
  "PT:route:d8-visa":
    { currency: "EUR", period: "month", kind: "income" },

  // Thailand — six LTR income bars at USD/year, three capital bars, and
  // two rows with no single figure at all.
  "TH:route:destination-thailand-visa":
    { currency: "THB", period: null, kind: "capital", barPhrase: "a bank balance", propertyRule: "bank_balance" },
  "TH:route:long-term-resident-ltr-visa--highly-skilled-professional":
    { currency: "USD", period: "year", kind: "income" },
  "TH:route:long-term-resident-ltr-visa--highly-skilled-professional--reduced-bar":
    { currency: "USD", period: "year", kind: "income" },
  "TH:route:long-term-resident-ltr-visa--wealthy-global-citizen":
    { currency: "USD", period: null, kind: "capital", barPhrase: "a total-assets test", propertyRule: "total_assets" },
  "TH:route:long-term-resident-ltr-visa--wealthy-pensioner":
    { currency: "USD", period: "year", kind: "income" },
  "TH:route:long-term-resident-ltr-visa--wealthy-pensioner--reduced-bar":
    { currency: "USD", period: "year", kind: "income" },
  "TH:route:long-term-resident-ltr-visa--work-from-thailand-professional":
    { currency: "USD", period: "year", kind: "income" },
  "TH:route:long-term-resident-ltr-visa--work-from-thailand-professional--reduced-bar":
    { currency: "USD", period: "year", kind: "income" },
  // Compound OR ("800,000 THB bank balance, OR 65,000 THB/month income,
  // OR a combination") — no single machine-comparable figure, so no
  // period and no bar kind to compare against.
  "TH:route:non-immigrant-o-a-retirement-visa":
    { currency: "THB", period: null, kind: "none" },
  "TH:route:non-immigrant-o-x-retirement-visa":
    { currency: "THB", period: null, kind: "capital", barPhrase: "a security deposit", propertyRule: "bank_balance" },
  // States no figure and no currency of any kind.
  "TH:route:thailand-privilege-visa":
    { currency: null, period: null, kind: "none" },
};

// The truth condition behind the baht line — and the MECHANISM, not the
// literal. The note must RETIRE ITSELF the day a baht income bar exists,
// so the sentence cannot outlive the table it describes. This is the one predicate both
// the note and the option-label suffix are gated on, and it takes the
// table as a defaultable argument for exactly one reason: it has to be
// PROVABLE. A caller can hand it a copy with one income row flipped to
// THB and watch the answer change: the self-retire proven, not asserted.
// Nothing here reads or writes data — it is a question about this
// module's own hand-transcribed table, the declared debt this build
// carries, and this predicate retires with that table on the day real
// currency_code/bar_kind fields land on the route rows.
//
// MEASURED over ROUTE_BARS as shipped: zero rows satisfy
// kind === "income" && currency === "THB". The three baht rows are
// TH:route:destination-thailand-visa and
// TH:route:non-immigrant-o-x-retirement-visa (kind "capital" — a bank
// balance and a security deposit) and TH:route:non-immigrant-o-a-
// retirement-visa (kind "none", a compound OR with no single comparable
// figure). So a baht figure is compared against no route by construction,
// income or capital, which is why the 12-of-12 failure is structural and
// not a data gap.
export function hasIncomeBarInCurrency(currencyCode, bars = ROUTE_BARS) {
  return Object.values(bars).some((b) => b.kind === "income" && b.currency === currencyCode);
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

// The table is asserted, not trusted. Every
// route_key in ROUTE_BARS must exist in the data, and every slice row
// must be in ROUTE_BARS. A mismatch renders the whole box in its refusal
// state with one line, never a partial answer built on a stale key.
export function assertRouteBarTable(allRouteRows) {
  const slice = sliceRoutes(allRouteRows);
  const dataKeys = new Set(slice.map((r) => r.route_key));
  const tableKeys = Object.keys(ROUTE_BARS);
  const missingFromData = tableKeys.filter((k) => !dataKeys.has(k));
  const missingFromTable = [...dataKeys].filter((k) => !ROUTE_BARS[k]);
  return {
    ok: missingFromData.length === 0 && missingFromTable.length === 0,
    tableCount: tableKeys.length,
    sliceCount: slice.length,
    missingFromData,
    missingFromTable,
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
      return { reason: "kind_mismatch", barPhrase: bar.barPhrase };
    }
    if (bar.propertyRule === "bank_balance") return { reason: "property_bank_balance" };
    if (bar.propertyRule === "total_assets") return { reason: "property_total_assets" };
    // propertyRule === "compare": the one row (GT:route:investor-visa)
    // whose own paperwork names property as a qualifying vehicle. One
    // currency per submission: the property figure is read in
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
  const bar = ROUTE_BARS[row.route_key];
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
    // Unreachable while assertRouteBarTable() gates the whole box, kept
    // so this function is total rather than throwing on a stale key.
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
