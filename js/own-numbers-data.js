// CanILiveThere — the welcome box's engine, with no DOM in it.
//
// Built to the welcome-box spec and the ruled storage shape. This half
// holds the route-bar lookup table, its load-time assertion, and the
// three gates — all pure functions over plain data, so the whole engine
// is exercisable outside a browser and a later maintainer can change a
// rule without reading a line of render code. Every reader-facing string
// lives in the render half (own-numbers.js); this file returns reasons,
// never sentences.
//
// Zero facts authored here. Every number, threshold, unit, condition and
// route name that reaches a reader comes verbatim out of
// derived/visa-routes.jsonl. ROUTE_BARS below is transcription of what
// each row's own `unit` string already says in words — see the header
// comment on that table.

// Gate 0. The five countries the box reads. CR is Crete
// (derived/countries.jsonl: {"country_id":"CR","name":"Crete"}), not
// Costa Rica. The refused set is never written down: it is derived at
// runtime as every country in countries.jsonl minus these five — never a
// fall-through — so a 22nd country appears as a refusal on day one
// instead of vanishing.
export const READ_SET = ["TH", "GT", "PT", "ES", "CR"];

// The stored token is the corpus vocabulary's stem, never a display
// label. The join to a route row is one string concatenation —
// "income_type_" + token — and the four resulting names are exactly the
// four that exist in the data. "unspecified" is the fifth option offered
// to the reader and maps to no field lookup at all (Gate 1 is skipped).
export const INCOME_TYPE_TOKENS = ["pension", "passive", "remote_active", "local_active", "unspecified"];
export const CURRENCY_TOKENS = ["USD", "EUR", "THB", "OTHER"];
export const PERIOD_TOKENS = ["month", "year"];
export const DURATION_BANDS = ["visit", "long_stay"];

// The near-the-bar band. Ratified elsewhere in this project's data
// conventions as the same-currency margin buffer (`margin_buffer`, tier
// "fixed-same-currency": 0.10) — ±10% is exactly right for the
// same-currency-only comparison this box actually ships.
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
    if (!CURRENCY_TOKENS.includes(p.currency)) return false;
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
function gate2(row, bar, input) {
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
    // whose own paperwork names property as a qualifying vehicle.
    if (input.property_capital.currency !== bar.currency) {
      return { reason: "currency_wall", readerCurrency: input.property_capital.currency, rowCurrency: bar.currency };
    }
    return { reason: null, comparable: { readerAmount: input.property_capital.amount, threshold: row.value_num_low } };
  }

  // kind === "income".
  if (input.currency !== bar.currency) {
    return { reason: "currency_wall", readerCurrency: input.currency, rowCurrency: bar.currency };
  }
  const normalised = toPeriod(input.amount, input.period, bar.period);
  if (!Number.isFinite(normalised)) return { reason: "no_number" };
  return { reason: null, comparable: { readerAmount: normalised, threshold: row.value_num_low } };
}

// The whole evaluation for one row. Returns reasons and states; the
// render layer owns every sentence.
export function evaluateRow(row, input) {
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

  const g2 = gate2(row, bar, input);
  if (g2.reason) {
    result.gate2 = g2;
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
