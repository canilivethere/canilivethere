// js/reader-strings.js
// THE reader-string register. One table, every render path.
//
// GOVERNANCE: no reader string for a store value may live in any other
// file. A second copy of one of these mappings anywhere in js/ or
// tools/ is the defect this file exists to end -- the INCOME_TYPE_LABEL
// table that used to sit in js/location.js was exactly that, and one of
// its four strings contradicted the ratified wording for two years of
// build time. THE RULE, UNCHANGED AND THE REASON THIS FILE EXISTS: no
// string enters this table without a ratified source, and that
// ratification is recorded in the project's own editorial record, kept
// outside this repository. That record is the authority, not this
// comment and not this file; a string with no ratified source there is
// not shippable here.
//
// Zero imports, deliberately: this file is imported by browser modules
// AND by tools/prerender-locations.mjs under Node. Adding an import
// breaks the build step. Same contract as js/portraits.js.
//
// Assertion 1 ships as TWO functions, by necessity and not duplication:
// readerStringFor() is the BUILD half (throws, fails the build) and
// unregisteredStoreToken() is the BROWSER half (a predicate a template can
// ask BEFORE it emits any markup, which is the only way a row can be HELD
// from render rather than half-emitted). They share TOKEN and
// STORE_VALUE_STRINGS in this module and differ only in what they do with
// the answer -- a second copy of either is the defect this file ends.
// Both halves are contractual. Do not delete one as a duplicate.
//
// Transport only -- zero facts and zero words authored here.

// Store value -> reader sentence. Every wording here is ratified
// elsewhere and transported verbatim; none of it may be edited in this
// file. supplementary_only in particular is quoted exactly as ratified.
export const STORE_VALUE_STRINGS = Object.freeze({
  primary_accepted:     "Takes this kind of income.",
  explicitly_rejected:  "Rules this kind of income out.",
  supplementary_only:   "Counts this kind of income, but not on its own.",
  not_stated_by_source: "The source doesn't say, either way.",
});

// Ratified wording, transported verbatim: "as an amount" is
// load-bearing and stands -- the gap is in the FIGURE, not in whether
// the route has a requirement at all. Selected by field predicate, not
// by key list -- see declaredGapFactKeys() below.
export const DECLARED_GAP_STRING =
  "We haven't found a source that states this route's income requirement as an amount.";

// Keyed on fact_key because NO field in the store distinguishes these
// five from the other seven indexed rows (measured, not assumed) and
// because fact_key is the one field the pending unit rewrite of the
// withheld rows below cannot touch.
export const INDEX_LINE = Object.freeze({
  "AR:pensionado-visa-income-threshold": "This bar is 5 × the Salario Mínimo, Vital y Móvil.",
  "AR:rentista-visa-income-threshold":   "This bar is 5 × the Salario Mínimo, Vital y Móvil.",
  "PT:d7-visa-income-threshold":         "This bar is the minimum wage itself.",
  "PT:d8-visa-income-threshold":         "This bar is 4 × the minimum wage.",
  "PY:rentista-visa-income-threshold":   "This bar moves with the minimum wage. The source doesn't state the multiple.",
});

// The other half of the partition. A withheld line is a DECISION with a
// reason, not an omission -- and assertIndexCoverage() below makes the
// partition total, so a thirteenth indexed row fails the build instead
// of shipping a bare multiple.
export const INDEX_LINE_WITHHELD = Object.freeze({
  "CO:digital-nomad-visa-visa-v-income-threshold":
    "index already named in shipping `unit` text; floor met, a line here would say it twice. MOVE TO INDEX_LINE IN THE SAME CHANGE that rewrites this unit.",
  "CO:pensionado-visa-income-threshold":
    "as CO digital-nomad above. MOVE TO INDEX_LINE IN THE SAME CHANGE as that unit rewrite.",
  "CO:rentista-visa-income-threshold":
    "as CO digital-nomad above. MOVE TO INDEX_LINE IN THE SAME CHANGE as that unit rewrite.",
  "BG:digital-nomadfreelancer-residence-permit--income-threshold":
    "index already named in shipping `unit` text; floor met. MOVE TO INDEX_LINE if that unit is ever rewritten.",
  "ES:digital-nomad-visa-dnv-income-threshold":
    "source states 200% of SMI; field stores 2. A reader never sees 2.0 where the law says 200%. No line until the form is right.",
  "ES:non-lucrative-visa-nlv-income-threshold":
    "source states 400% of IPREM; field stores 4. As ES DNV above.",
  "CO:m-investor-visa-real-estate-investment-threshold":
    "source states STRICTLY ABOVE 350x. statutory_multiple alone asserts an equality the source does not. No line until a strictly-above form is available; the ratified wording for it already exists in the editorial record this file's header names.",
});

// ---------------------------------------------------------------------
// The two selectors.

// The index line for a fact row, or null. The route-card
// surface passes its own `threshold_fact_key` -- the row's own pointer at
// the fact -- so both surfaces read THIS table and not a second copy.
export function indexLineFor(factKey) {
  const s = INDEX_LINE[factKey];
  return typeof s === "string" ? s : null;
}

// The declared-gap predicate is evaluated ONCE, on the facts
// rows, and both surfaces consult the resulting set.
//
// Why it is not restated on derived/visa-routes.jsonl: that export has no
// `group_role` column. The two clauses that survive there
// (`income_threshold == "[GAP]" && source_url`) select the same three
// rows today, but not for a reason that holds -- `income_threshold` on
// that export also carries non-income bars (PY:route:suace-investor-route
// points at an `asset-requirement` row), so a future [GAP] asset row with
// a URL would be handed an income sentence.
export function declaredGapFactKeys(factRows) {
  return new Set(factRows
    .filter((f) => f.value_raw === "[GAP]" && f.source_url && f.group_role === "threshold")
    .map((f) => f.fact_key));
}

// ---------------------------------------------------------------------
// The two assertions.

// 1. No unregistered store token can reach a reader. A row renders only
//    when its value has a reader string, and until then it is HELD FROM
//    RENDER, NOT DROPPED.
const TOKEN = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;

export function readerStringFor(valueRaw) {
  if (!TOKEN.test(String(valueRaw))) return null;          // not a token
  // Truthiness, not `typeof === "string"`, and deliberately kept that
  // way: a registered-but-EMPTY string throws here instead of shipping a
  // blank value slot to a reader. Loud-and-slightly-mislabelled beats
  // silent-and-blank at a publication boundary. Do not "tighten" to a type
  // test. unregisteredStoreToken() keeps the same test for the same reason.
  const s = STORE_VALUE_STRINGS[valueRaw];
  if (s) return s;
  throw new Error(`reader-strings: no string for store value "${valueRaw}"`);
}

// The browser half of the same rule, non-throwing on purpose. In the
// build, an unregistered token throws and fails the build -- nothing
// ships. In the browser a throw at a reader is worse than the token, so
// location.js and app-shared.js HOLD THE ROW FROM RENDER and
// console.error the key. A render path cannot hold a row it only learns
// about by catching an exception mid-template, so the test is its own
// function. Build fails loud; the reader sees neither the token nor an
// error.
export function unregisteredStoreToken(valueRaw) {
  // Same truthiness test as readerStringFor(), deliberately: a
  // registered-but-empty string is held from render here and throws in the
  // build, rather than shipping a blank value slot.
  return TOKEN.test(String(valueRaw)) && !STORE_VALUE_STRINGS[valueRaw];
}

// 2. The indexed partition is total and disjoint.
export function assertIndexCoverage(factRows) {
  const indexed = new Set(factRows
    .filter((f) => f.group_role_detail === "indexed").map((f) => f.fact_key));
  const covered = new Set([...Object.keys(INDEX_LINE), ...Object.keys(INDEX_LINE_WITHHELD)]);
  const missing = [...indexed].filter((k) => !covered.has(k));
  const stale   = [...covered].filter((k) => !indexed.has(k));
  const both    = Object.keys(INDEX_LINE).filter((k) => k in INDEX_LINE_WITHHELD);
  if (missing.length || stale.length || both.length) {
    throw new Error(`reader-strings: indexed-row partition broken — missing ${missing}, stale ${stale}, duplicated ${both}`);
  }
}
