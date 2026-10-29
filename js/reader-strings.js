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
// THE ROLE-KEYED HALF OF THE SAME REGISTER.
//
// Added 2026-10-28, inside the hydration crossing. WHY IT IS A SECOND
// EXPORT AND NOT A SECOND TABLE, which is the thing the 2026-10-25
// one-table ruling forbids: that ruling ended a DUPLICATE MAPPING OF THE
// SAME VALUE living in a second FILE (the INCOME_TYPE_LABEL table inside
// js/location.js, one of whose four strings contradicted the ratified
// wording). Nothing below duplicates anything in STORE_VALUE_STRINGS,
// and nothing below lives outside this file. One file, one authority,
// one governance rule — which is what that ruling protects.
//
// WHY IT HAS TO BE KEYED ON THE ROLE. Measured on all 21
// derived/facts/*.jsonl, 2026-10-28: `Yes` is a live value on FOUR
// different roles and means four different things (mechanism:
// "this tenure form is available"; converts_to_pr: "this route converts
// to permanent residency"; accepts_passive_income: "passive income is
// accepted as qualifying proof"; diligence_risk: undeterminable). `No`
// collides across three, `Not yet checked` across four. A flat key
// cannot carry four meanings, and 191 more bare Yes/No rows sit on facts
// with NO role at all, which a flat `Yes` key would also rewrite —
// silently and wrongly.
//
// WHAT CAP RULED, 2026-10-28 — paraphrased only where the ruling named
// a seat: this crossing wires the ratified strings for the tokens that
// already mean one thing, holds the Yes, No and Not yet checked values
// from render, and fixes the guard. So the colliding tokens are not
// strung at all. They are HELD — the row stays in derived/, the renderer
// declines to draw it, and the tokens are retired in a later crossing.
//
// EVERY STRING BELOW IS TRANSPORTED VERBATIM from the ratified copy deck
// for tenure and regime reader strings, 2026-10-28, which sources each
// one line-by-line to the project's schema contract or to its
// property-fit rules §3/§4. Both documents are kept in the project's own
// editorial record, outside this repository, and that record is the
// authority. None of it is authored here and none of it may be edited
// here. Two rows of that deck are REFUSED BY THE DECK ITSELF and are
// therefore `held`, not strung:
// `converts_to_pr: conditional-backstop:` (meaning undefined in the
// record, and its sourcing contradicted by the verification run of
// 2026-10-24) and
// `diligence_risk: Yes` (a free-text field storing an enum).
//
// `closed: true` means the role's vocabulary is controlled: a value that
// resolves to no string and is not explicitly held FAILS — in the build
// it throws, in the browser the row is held. That is the guard's new
// test, and it is a table-membership test, not a shape test. Roles that
// legitimately carry numbers or free text are `closed: false` and their
// unmatched values fall through to ordinary formatting.
//
// `prefix` entries replace the named leading substring and keep the
// remainder byte-for-byte. `sentence` mode is the deck's §3.3 rule: the
// lead sentence minus its full stop, a space, the parenthetical
// verbatim, a full stop. EXACT KEYS ARE TESTED BEFORE PREFIXES —
// `Yes (illegal)` is the case that proves it necessary.
const HELD = Object.freeze(["Yes", "No", "Not yet checked"]);

export const ROLE_REGISTER = Object.freeze({
  regime_shape: {
    closed: true,
    exact: {
      "open-freehold": "A foreign buyer can hold full title here, on the same terms as a citizen.",
      "geographic-band-substitute": "Inside a defined band, a foreign buyer needs a substitute vehicle. Outside it, direct title.",
      "closed-except-single-vehicle": "A foreign buyer cannot hold freehold land here. One capped vehicle is the only way in.",
      "nationality-gate": "Otherwise an open market. Citizenship alone decides whether a buyer is allowed in.",
      "universal-locality-permit": "Certain named localities are gated for everyone here, citizens included. The restriction is about the place, not the buyer.",
      "closed-except-personal-status": "There is no purchase route here for an ordinary foreign buyer, at any price. The only door is a personal legal status — ancestry or marriage — and it cannot be bought.",
    },
    prefixes: [{ token: "disputed: ", mode: "replace", lead: "Sources disagree. " }],
    held: HELD,
  },
  mechanism_legality: {
    closed: true,
    exact: {
      legitimate: "This way of holding property is lawful here.",
      // Deliberately consistent with the illegal-routes block, which
      // prints "Illegal" for this same token. Two surfaces, one word.
      // No `prohibited-unenforced` token exists in the schema, so
      // "enforced" is part of what the token asserts, not an addition.
      "prohibited-enforced": "This way of holding property is illegal here, and the ban is enforced.",
    },
    held: HELD,
  },
  mechanism: {
    closed: true,
    exact: { "Yes (illegal)": "This form of ownership is offered here. It is against the law." },
    prefixes: [
      { token: "Yes (", mode: "sentence", lead: "This form of ownership is available here." },
      { token: "No (", mode: "sentence", lead: "This form of ownership is not available here." },
    ],
    held: HELD,
  },
  converts_to_pr: {
    closed: true,
    exact: {
      "own-standalone-permanent-status": "This route grants its own indefinite status instead. It does not feed the general permanent-residency track.",
    },
    prefixes: [
      { token: "Yes (", mode: "sentence", lead: "This route converts to permanent residency." },
      { token: "No (", mode: "sentence", lead: "This route does not convert to permanent residency." },
      { token: "disputed: ", mode: "replace", lead: "Sources disagree. " },
    ],
    // The deck's §5.1, refused with two independent reasons either one
    // sufficient. Held, not glossed and not shipped raw.
    held: [...HELD, "conditional-backstop: "],
    heldPrefixes: ["conditional-backstop: "],
  },
  accepts_passive_income: {
    closed: true,
    prefixes: [
      { token: "Yes (", mode: "sentence", lead: "Passive income counts as qualifying proof on this route." },
      { token: "No (", mode: "sentence", lead: "Passive income does not count as qualifying proof on this route." },
      { token: "N/A — ", mode: "replace", lead: "Not applicable here: " },
    ],
    held: HELD,
  },
  location_applicability: {
    closed: true,
    exact: {
      inside: "This location sits inside that zone.",
      outside: "This location sits outside that zone.",
      // The schema's "researched-but-unresolved", distinct from [GAP]
      // (never researched). "We looked" carries exactly that and nothing
      // more.
      unconfirmed: "We looked, and could not confirm which side of that line this location falls on.",
    },
    held: HELD,
  },
  max_duration: {
    // Numbers live here too, so the vocabulary is not closed.
    closed: false,
    exact: { "permanent-from-day-one": "Permanent from the day it is granted. There is no temporary stage before it." },
    held: HELD,
  },
  renewability: {
    closed: true,
    exact: {
      "renewable-indefinitely": "Renews indefinitely.",
      "non-renewable": "Does not renew.",
    },
    prefixes: [{ token: "renewable-limited: ", mode: "replace", lead: "Renewable, with a limit: " }],
    held: HELD,
  },
  enactment_status: {
    closed: true,
    exact: {
      enacted: "This law is in force.",
      repealed: "This law has been repealed.",
      pending: "Not law yet. Still pending.",
    },
    held: HELD,
  },
  age_gate: {
    // Real ages (50, 60, 40) and [GAP] both live here.
    closed: false,
    // The schema states the meaning outright: "`0` is a real, confirmed
    // finding ('no age gate on this route')" (§8B.2). `suppressUnit`
    // because the row stores unit "years" and "No minimum age on this
    // route. years" is not a sentence.
    exact: { 0: { string: "No minimum age on this route.", suppressUnit: true } },
    held: HELD,
  },
  diligence_risk: {
    // Free text by schema contract (type='descriptive'). Five of the
    // twelve live rows do exactly that. Seven store `Yes`, which the
    // deck refuses to gloss, because writing a sentence for it would
    // author what the risk is and how bad it is. Held under the same
    // rule as every other bare Yes.
    closed: false,
    held: HELD,
  },
  income_type_required: {
    // Vocabulary already fully covered by STORE_VALUE_STRINGS above; the
    // role is listed only to close it, so a fifth income-type token
    // cannot ship unstrung.
    closed: true,
    held: HELD,
  },
});

function entryFor(groupRole) {
  return Object.prototype.hasOwnProperty.call(ROLE_REGISTER, groupRole) ? ROLE_REGISTER[groupRole] : null;
}

// Resolve one value under one role. Returns null when the role has no
// opinion, `{ string, suppressUnit }` when it resolves, or
// `{ held: true, reason }` when the register rules the row off the page.
export function roleValueString(valueRaw, groupRole) {
  const entry = entryFor(groupRole);
  if (!entry) return null;
  const v = String(valueRaw);
  if ((entry.held || []).includes(v)) return { held: true, reason: "ruled-hold" };
  for (const p of entry.heldPrefixes || []) {
    if (v.startsWith(p)) return { held: true, reason: "ruled-hold" };
  }
  const exact = (entry.exact || {})[v];
  if (typeof exact === "string") return { string: exact };
  if (exact && typeof exact.string === "string") return { string: exact.string, suppressUnit: !!exact.suppressUnit };
  for (const p of entry.prefixes || []) {
    if (!v.startsWith(p.token)) continue;
    if (p.mode === "replace") return { string: p.lead + v.slice(p.token.length) };
    // `sentence`: the lead sentence minus its full stop, a space, the
    // parenthetical verbatim, a full stop. The token ends at "(" and the
    // remainder already carries its own closing bracket.
    const rest = v.slice(p.token.length - 1);
    return { string: `${p.lead.replace(/\.$/, "")} ${rest}.` };
  }
  return null;
}

// ---------------------------------------------------------------------
// The assertions.

// 1. No unregistered store token can reach a reader. A row renders only
//    when its value has a reader string, and until then it is HELD FROM
//    RENDER, NOT DROPPED.
//
// THE GUARD, REPLACED 2026-10-28. It used to be a SHAPE test:
//   const TOKEN = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
// lower_snake with a mandatory underscore, which matched exactly the
// four income-type tokens it was written against and NONE of
// `open-freehold`, `legitimate`, `prohibited-enforced`, `inside`,
// `outside`, `unconfirmed`, `enacted`, `repealed`,
// `permanent-from-day-one`, `renewable-indefinitely`, `Yes` or `No`
// (measured, every one of them). "No unregistered store token can reach
// a reader" was therefore true only of snake_case tokens since the day
// it shipped, and 117 raw-token slots on 26 pages went through it
// unseen. Cap's clause, 2026-10-28: "The guard fails on any value with
// no entry in the table, whatever it looks like."
//
// So the test is now TABLE MEMBERSHIP, in two layers:
//   (a) the role's own register entry, when the role is `closed` — any
//       value that resolves to no string and is not explicitly held
//       fails, whatever it looks like, including a token nobody has
//       seen before;
//   (b) the original snake_case shape test, KEPT as a backstop for rows
//       with no role at all (191 bare Yes/No rows and every ungrouped
//       fact), so nothing this guard caught before stops being caught.
// [GAP] is exempt at both layers: it is the gap marker, handled by
// formatValue()'s own branch, and has been reader-facing by design for
// as long as the site has existed.
const SNAKE_TOKEN = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;

// null = render it. Otherwise the reason it is held:
//   "ruled-hold"   — the register says this value does not render
//                    (Yes / No / Not yet checked / a refused token)
//   "unregistered" — controlled vocabulary with no reader string
export function heldValue(valueRaw, groupRole) {
  const v = String(valueRaw);
  if (v === "[GAP]") return null;
  const resolved = roleValueString(v, groupRole);
  if (resolved && resolved.held) return resolved.reason;
  if (resolved && resolved.string) return null;
  // The flat table is consulted before the closed-role test, not after:
  // `income_type_required`'s four values live there, ratified 2026-10-25,
  // and the role is listed in the register only to CLOSE it so a fifth
  // income-type token cannot ship unstrung.
  if (STORE_VALUE_STRINGS[String(valueRaw)]) return null;
  const entry = entryFor(groupRole);
  if (entry && entry.closed) return "unregistered";
  // Truthiness, not `typeof === "string"`, and deliberately kept that
  // way: a registered-but-EMPTY string is held here and throws in the
  // build, rather than shipping a blank value slot.
  if (SNAKE_TOKEN.test(v) && !STORE_VALUE_STRINGS[v]) return "unregistered";
  return null;
}

// Kept as its own export: every existing caller asks this exact
// question, and a held-by-rule row is NOT an unregistered token — it is
// a deliberate, ruled omission and must not be console.error'd as a
// defect.
export function unregisteredStoreToken(valueRaw, groupRole) {
  return heldValue(valueRaw, groupRole) === "unregistered";
}

// The build half, unchanged in contract: throws, so an unregistered
// token fails the build instead of shipping. It now takes the role
// alongside the value, and returns null both for "not a token" and for
// "ruled held" — the caller (formatValue) never reaches it for a held
// row, because the row is held before any markup is emitted.
export function readerStringFor(valueRaw, groupRole) {
  const resolved = roleValueString(valueRaw, groupRole);
  if (resolved && resolved.string) return resolved.string;
  if (resolved && resolved.held) return null;
  const v = String(valueRaw);
  if (v === "[GAP]") return null;
  if (STORE_VALUE_STRINGS[v]) return STORE_VALUE_STRINGS[v];
  const entry = entryFor(groupRole);
  if (entry && entry.closed) {
    throw new Error(`reader-strings: no string for store value "${v}" on role "${groupRole}"`);
  }
  if (!SNAKE_TOKEN.test(v)) return null;                   // not a token
  const s = STORE_VALUE_STRINGS[v];
  if (s) return s;
  throw new Error(`reader-strings: no string for store value "${v}"`);
}

// 1b. The build-time sweep. Runs once over every fact row in every
// country file, BEFORE a page is written, so an unstrung controlled
// value fails the build with its own fact_key in the message rather
// than disappearing silently from 38 pages. A ruled hold is not a
// failure and is counted, not thrown on — the count is what the build
// log reports, and a hold count that drops to zero unannounced is how
// you would notice that token retirement landing.
export function assertValueCoverage(factRows) {
  const bad = [];
  const heldCounts = {};
  for (const f of factRows) {
    const reason = heldValue(f.value_raw, f.group_role);
    if (reason === "unregistered") bad.push(`${f.fact_key} [${f.group_role || "no role"}] = ${JSON.stringify(f.value_raw)}`);
    else if (reason) {
      const k = `${f.group_role || "no role"}:${f.value_raw}`;
      heldCounts[k] = (heldCounts[k] || 0) + 1;
    }
  }
  if (bad.length) {
    throw new Error(`reader-strings: ${bad.length} value(s) with no reader string reached the build:\n  ${bad.join("\n  ")}`);
  }
  return heldCounts;
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
