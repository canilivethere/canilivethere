// js/fact-rows.js — THE shared fact-row module.
//
// WHY THIS FILE EXISTS. Until now tools/prerender-locations.mjs and
// js/location.js each held their own copy of the same emitters, and the
// prerenderer's own comment stated the contract out loud: "change one,
// change both." That contract was broken 12 times in 21 commits — the
// static page and the hydrated page drifted apart silently, and the
// whole 2026-10-28 hydration crossing exists because of it. A comment is
// not a mechanism. This module is the mechanism: ONE implementation,
// imported by BOTH.
//
// WHAT LIVES HERE: the seven hand-duplicated emitters —
//   formatValue(), factRowHtml() (the row shell), sectionForFact(),
//   factDateTags(), sourceGroupDate(), sourceFactLinesHtml(),
//   buildIllegalRoutesHtml(), and the SECTION constants —
// plus the route-grouping rules set out in the project's own
// route-grouping-and-duplication spec of 2026-10-28 (Stage 1 G1,
// G2, G3, G4; Stage 2 G5, G6, G7), written once.
//
// HOW BOTH SIDES CAN IMPORT IT. This is a browser ES module, loaded by
// the browser with a plain <script type="module"> chain, and read by Node
// in tools/prerender-locations.mjs through an ordinary import. There is
// no bundler and no build step for the SITE — this file is served to the
// reader byte-for-byte as written. The precedent is js/portraits.js and
// js/reader-strings.js, which the prerenderer has imported under Node for
// some time; Node detects module syntax in a .js file and parses it as
// ESM. The one condition that makes it work is the condition
// reader-strings.js already states for itself and this file inherits:
//
//   ZERO DOM, ZERO NETWORK, AND NO IMPORT OF ANY MODULE THAT HAS EITHER.
//
// The only import below is ./reader-strings.js, which has none of its
// own. Do not add an import of app-shared.js, data.js, colors.js or
// anything that reaches `document`, `window` or `fetch` at module scope:
// that breaks the Node build the moment it is added, and it breaks it at
// import time, before a single page is written.
//
// WHAT IS DELIBERATELY NOT HERE, so it is not read as an oversight.
// The per-surface EXTRAS stay with their callers for now: the hydrated
// row's confidence badge, divergence badge, scope tag and source-detail
// pull-down, and the static row's absence of all four. They are injected
// through factRowHtml()'s own slots. Cap's own scoping, 2026-10-28:
// "The extras moving into the module and the build writing the full page
// follow as the next crossings." Likewise generalIndex(), buildFitHeadline(),
// the reader-sentence emitters, the sources-chapter assembly and the
// route-documentation block are all still duplicated across the two files
// — named in this seat's report, not fixed here.
//
// Transport only. Zero facts and zero reader words are authored in this
// file; every string it emits either comes from the store, from
// js/reader-strings.js, or is an existing ratified site string moved
// verbatim from one of the two files this module replaces.

import {
  STORE_VALUE_STRINGS, DECLARED_GAP_STRING, roleValueString, heldValue,
} from "./reader-strings.js";

// ---------------------------------------------------------------------
// §1. Escaping.
// Moved verbatim from js/app-shared.js, which now re-exports this one so
// every existing `import { escapeHtml } from "./app-shared.js"` keeps
// working unchanged. tools/prerender-locations.mjs held a byte-identical
// hand copy; that copy is gone.
// ---------------------------------------------------------------------
export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------
// §2. The SECTION constants, and sectionForFact().
// Chapter order: verdict, intro, visa, cost of living, property,
// community, red flags, score breakdown, sources. Previously three
// copies (js/location.js, js/data.js, tools/prerender-locations.mjs).
// ---------------------------------------------------------------------
export const SECTION_TITLES = Object.freeze({
  overview: "Overview",
  visa: "Visa & residency",
  property: "Property",
  cost: "Cost of living",
  community: "Community",
  redflags: "Red flags",
});
export const SECTION_ORDER = Object.freeze(["overview", "visa", "cost", "property", "community", "redflags"]);
// The overview chapter is folded into the intro: it renders with the
// portrait block, second on the page after the verdict, not down in the
// chapter run. Position only — content untouched.
export const INTRO_SECTION = "overview";
// The honest empty state, one string, both emitters.
export const CHAPTER_GAP_LINE = "Not yet researched — a gap, not a claim that nothing is true here.";

const FILE_SECTION_MAP = [
  ["red-flags.md", "redflags"],
  ["visa-legal.md", "visa"],
  ["property.md", "property"],
  ["cost-of-living.md", "cost"],
  ["community-network.md", "community"],
  ["overview.md", "overview"],
];
const CRITERION_SECTION_FALLBACK = {
  "visa-legal-pathway-ease": "visa",
  "land-property-access": "property",
  "cost-of-living-affordability": "cost",
  "community-social-fabric": "community",
  "room-for-others-group-viability": "community",
};

export function sectionForFact(fact) {
  const ref = fact.source_ref || "";
  for (const [needle, section] of FILE_SECTION_MAP) {
    if (ref.includes(needle)) return section;
  }
  if (fact.criterion_id && CRITERION_SECTION_FALLBACK[fact.criterion_id]) {
    return CRITERION_SECTION_FALLBACK[fact.criterion_id];
  }
  return "overview";
}

// ---------------------------------------------------------------------
// §3. Value formatting.
//
// formatNumbersInText() and roundDisplayValue() are moved verbatim from
// js/app-shared.js (the prerenderer held its own copy of the second and
// none of the first — which was itself a live divergence: served pages
// printed "90119 ALL/month" where hydrated pages printed "90,119
// ALL/month". Sharing the function closes it in the honest direction,
// by giving the served page the comma it was missing).
//
// Comma-group digit runs of 5+ so large figures read as "500,000 THB".
// Deliberately stops at 4 digits: the facts mix genuine 4-digit years
// with genuine 4-digit money figures and there is no reliable way to
// tell them apart from the string alone.
// ---------------------------------------------------------------------
export function formatNumbersInText(text) {
  return text.replace(/\d{5,}/g, (run) => Number(run).toLocaleString("en-US"));
}

// Display precision, the ruled convention: physical measurements
// (heights, distances, areas) round to whole numbers, half up; rates,
// index scores, prices and percentages keep their decimals; the exact
// figure stays in the store and the source. Classified on the FIRST WORD
// of `unit`, exact match, because `unit` is free text and carries
// parentheticals, and because a substring test on "m" would catch $/m²,
// mm/year, µg/m³ and m³/person/year. The magnitude guard stays so a small
// physical value — a 0.4 m sea-level rise — cannot display as nothing.
const PHYSICAL_DISPLAY_UNITS = new Set(["metres", "meters", "m", "km", "km²", "hectares"]);

export function roundDisplayValue(raw, unit) {
  const head = String(unit == null ? "" : unit).trim().toLowerCase().split(/\s+/)[0];
  if (!PHYSICAL_DISPLAY_UNITS.has(head)) return raw;
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n) < 100) return raw;
  return String(Math.round(n));
}

// THE one formatValue(). Previously two: js/app-shared.js's (with FX
// approximation) and tools/prerender-locations.mjs's (without).
//
// The FX approximation is the one genuinely environment-specific part —
// it needs a live rate table the static build has no business fetching —
// so it arrives as an injected function rather than a branch. Node passes
// nothing and gets no approximation, which is exactly what the static
// page does today. js/app-shared.js passes its own usdApprox().
//
// ORDER IS LOAD-BEARING, and both previous copies already agreed on it:
// the register lookup sits AHEAD of the unit-append logic, because a
// sentence must never have a unit glued to it.
export function formatValue(fact, {
  suppressGapText = false, declaredGap = false, usdApprox = null,
} = {}) {
  if (fact.value_raw === "[GAP]") {
    if (declaredGap) return DECLARED_GAP_STRING;
    return suppressGapText ? "—" : "Not yet researched";
  }
  // Role-keyed first (the tenure/regime register), then the flat table.
  // A role-keyed entry may suppress the stored `unit`: age_gate 0 reads
  // "No minimum age on this route.", and "No minimum age on this route.
  // years" is not a sentence.
  const byRole = roleValueString(fact.value_raw, fact.group_role);
  if (byRole && byRole.string) return byRole.string;
  const registered = STORE_VALUE_STRINGS[fact.value_raw];
  if (typeof registered === "string") return registered;

  const raw = formatNumbersInText(roundDisplayValue(String(fact.value_raw), fact.unit));
  // Only append the unit if value_raw doesn't already carry it as text —
  // some values spell their unit inline ("49% of building") and appending
  // the bare unit again duplicates it visibly.
  let out = raw;
  if (fact.unit && !raw.toLowerCase().includes(String(fact.unit).toLowerCase())) {
    out = `${raw} ${fact.unit}`;
  }
  if (typeof usdApprox === "function" && !raw.includes("(") && !raw.includes("~")) {
    const approx = usdApprox(fact);
    if (approx) out += approx;
  }
  return out;
}

// ---------------------------------------------------------------------
// §4. THE ROW SHELL — the grouping spec's G3, enforced in code rather
// than asked for in a comment.
//
// "G3 — one fact, one `.fact-item`, no exceptions. Grouping changes
// ORDER, not CONTAINMENT." The defect it closes:
// js/location.js's at-a-glance card emitted
// `<div class="fact-item">${rowsHtml}</div>` with `.join("<hr>")`, so
// three cards held more than one row and four rows were invisible to
// every counter in this repo — including the reader walk, which keys a
// row on its FIRST `.fact-label`. Egypt's three real-estate tiers were
// one `.fact-item` carrying three labels.
//
// Enforcement is a thrown error, not a console warning, because the only
// caller that can hit it is a developer writing a new template and the
// build is the right place to find out. The route-documentation
// sub-heading keeps its two-class form (`class="fact-label
// route-doc-label"`) and is deliberately not counted: it is a heading
// inside one fact's own block, not a second fact.
//
// Child order is fixed here and is the same on every surface a reader
// meets: .fact-label -> .fact-value -> .fact-notes.index-line ->
// .fact-meta -> .source-detail -> notes.
// HARD INVARIANT, carried over verbatim: the index line goes BEFORE
// `.fact-meta`, never between `.fact-meta` and `.source-detail` —
// toggleSourceDetail() finds the panel as `.fact-meta`'s
// nextElementSibling, so that placement silently kills the source toggle.
// ---------------------------------------------------------------------
const BARE_FACT_LABEL = /class="fact-label"/g;

export function factRowHtml({
  label = "", labelExtra = "", value = null, indexLine = "", meta = "", sourceDetail = "", notes = "",
} = {}) {
  const inner =
    `<div class="fact-label">${label}${labelExtra}</div>` +
    (value == null ? "" : `<div class="fact-value">${value}</div>`) +
    indexLine + meta + sourceDetail + notes;
  const labels = inner.match(BARE_FACT_LABEL);
  if (labels && labels.length > 1) {
    throw new Error("fact-rows: G3 violation — more than one fact in one .fact-item");
  }
  if (inner.includes('class="fact-item"')) {
    throw new Error("fact-rows: G3 violation — a .fact-item nested inside a .fact-item");
  }
  return `<li class="fact-item">${inner}</li>`;
}

// ---------------------------------------------------------------------
// §5. STAGE 1 — G1 anchored contiguity and G2 role order.
// The grouping spec's §2.2, transported, not reinterpreted.
//
// G1: walk a section's facts in their current order. On first sight of a
// group_key, emit EVERY fact of that group, then mark the group emitted;
// skip later members. Ungrouped facts emit in place. The group sits where
// its first member already sat, so nothing else about today's ordering
// moves. Deterministic; no sort key; identical input gives identical
// output.
//
// G2: a reader's question order, not the file's. Group kind is read from
// the group_key's own middle token — existing structure, no new
// vocabulary. The bar first, because it is the question. THE REFUSAL
// SECOND: income_type_required is where "Rules this kind of income out."
// lives, and a bar you clear with the wrong kind of money is not cleared;
// it must never sit below the paperwork line. Then eligibility, then age,
// then how long and whether it renews, then where it leads, then what it
// asks you to produce, then cost. On property-regime groups, WHERE THE
// RULE BITES precedes what the rule is, because a national regime a
// reader is not standing in is not their rule.
//
// Any role not listed keeps file order, AFTER the listed ones. Ties keep
// file order — a stable sort, never a comparator that reorders equals.
// ---------------------------------------------------------------------
export const ROUTE_ROLE_ORDER = Object.freeze([
  "threshold", "income_type_required", "accepts_passive_income",
  "eligible_nationality_list", "restricted_nationality_list", "age_gate",
  "max_duration", "renewability", "converts_to_pr", "documentation_shape",
  "transaction_cost_load", "mechanism_cost", "price_floor",
]);
export const PROPERTY_REGIME_ROLE_ORDER = Object.freeze([
  "location_applicability", "regime_shape", "mechanism", "mechanism_legality",
  "enactment_status", "resident_exemption", "diligence_risk",
  "transaction_cost_load", "mechanism_cost", "price_floor",
]);

export function groupKind(groupKey) {
  if (typeof groupKey !== "string") return null;
  if (groupKey.includes(":property-regime:")) return "property-regime";
  if (groupKey.includes(":visit:")) return "visit";
  if (groupKey.includes(":route:")) return "route";
  return "other";
}

function roleOrderFor(groupKey) {
  return groupKind(groupKey) === "property-regime" ? PROPERTY_REGIME_ROLE_ORDER : ROUTE_ROLE_ORDER;
}

// Stable role sort inside one group. Decorate-sort-undecorate on the
// original index, so equals never move.
export function orderGroupFacts(groupKey, facts) {
  const order = roleOrderFor(groupKey);
  const rank = new Map(order.map((r, i) => [r, i]));
  return facts
    .map((f, i) => ({ f, i, r: rank.has(f.group_role) ? rank.get(f.group_role) : order.length }))
    .sort((a, b) => (a.r - b.r) || (a.i - b.i))
    .map((x) => x.f);
}

// G1 + G2 together. Returns an ordered list of render units:
//   { kind: "fact",  fact }
//   { kind: "group", groupKey, facts (already in G2 order), lead }
// A one-fact group is returned as a plain fact: a `<details>` door over a
// single row is a door to nothing. 36 of the 126 groups on file are
// singletons.
export function orderFactsForRender(facts) {
  const byGroup = new Map();
  for (const f of facts) {
    const gk = f.group_key;
    if (!gk) continue;
    if (!byGroup.has(gk)) byGroup.set(gk, []);
    byGroup.get(gk).push(f);
  }
  const emitted = new Set();
  const units = [];
  for (const f of facts) {
    const gk = f.group_key;
    if (!gk) { units.push({ kind: "fact", fact: f }); continue; }
    if (emitted.has(gk)) continue;
    emitted.add(gk);
    const members = orderGroupFacts(gk, byGroup.get(gk));
    if (members.length === 1) { units.push({ kind: "fact", fact: members[0] }); continue; }
    units.push({ kind: "group", groupKey: gk, facts: members, lead: members[0] });
  }
  return units;
}

// ---------------------------------------------------------------------
// §6. STAGE 2 — G5 the block, G6 the count, G7 the default state.
//
// G5: a group renders as `<details class="fact-group">`, its `<summary>`
// carrying the group's LEAD ROW'S OWN `fact_label`, VERBATIM, and nothing
// else authored; the group's `<ul class="fact-list">` sits inside. Rows
// inside stay `<li class="fact-item">` — reader-walk and the containment
// check read textContent, which a closed `<details>` still yields, and
// crawlers index closed content, so every row stays countable and
// indexable. Nested `<details>` inside the chapter `<details>` is valid
// and already this page's own idiom.
//
// Why the lead row's label and not a route name: there is no route name
// in the data. The grouping spec measured three alternatives and
// rejected all three (a head-clause join returns "Long-Term Resident
// (LTR) Wealthy Pensioner age gate" as a title; a longest-common-prefix
// is usable on 51 of 90 and truncates to garbage where it is; a de-slug
// of the group_key is the exact defect just repaired for :visit:
// cards). Collisions measured
// before specifying: 0 across all 90 multi-fact groups, re-derived by
// this seat before building it.
//
// G6: the summary also carries the count of rows inside it, as arithmetic
// over the group's own rows. A closed block that does not say how much is
// behind it is a door with no handle.
// THE COUNT'S WORDS ARE NOT WRITTEN YET. The grouping spec leaves the
// wording to the copy deck — the string is the deck's, the slot is the
// spec's — and the 2026-10-28 deck answers only ask (1) of that row; G6
// is still open. So the slot ships the bare arithmetic and nothing else.
// This seat does not author reader copy, and "3 facts" is reader copy.
// Open row, named in the build report.
//
// G7: closed by default, with one exception — A GROUP CONTAINING A STATED
// REFUSAL DOES NOT COLLAPSE. Honesty gets hierarchy, not concealment: a
// reader skimming closed blocks must not skim past the sentence that
// rules them out. The grouping spec flags G7 as its own least certain
// rule and makes it conditional on the test being cheap against the
// reader-strings register. It is: `explicitly_rejected` is a registered
// store value with a ratified string, and `restricted_nationality_list`
// is a role name.
// Both are one field comparison. So G7 ships.
// ---------------------------------------------------------------------
export function groupContainsRefusal(facts) {
  return facts.some((f) =>
    (f.group_role === "income_type_required" && f.value_raw === "explicitly_rejected") ||
    f.group_role === "restricted_nationality_list");
}

// `open` forces the block open regardless of G7 (the static build, which
// renders every chapter open for the same crawler reason its own header
// states; see tools/prerender-locations.mjs). Everything else about the
// block is identical on both emitters.
export function factGroupHtml(unit, rowsHtml, { open = false } = {}) {
  const forceOpen = open || groupContainsRefusal(unit.facts);
  const summary =
    `${escapeHtml(unit.lead.fact_label)}` +
    ` <span class="fact-group-count">${unit.facts.length}</span>`;
  return `<details class="fact-group"${forceOpen ? " open" : ""}>` +
    `<summary>${summary}</summary>` +
    `<ul class="fact-list">${rowsHtml}</ul>` +
    `</details>`;
}

// The whole list for one chapter: Stage 1 ordering, Stage 2 blocks, one
// call, both emitters. `renderRow(fact)` is the caller's own row emitter
// (it supplies the per-surface extras) and must return either "" (held
// from render) or exactly one `<li class="fact-item">`, which
// factRowHtml() above guarantees.
//
// A group whose every row is held from render emits nothing at all — not
// an empty door. A group with SOME rows held keeps its door and its count
// reflects what is actually inside it, never what the store holds.
export function factListHtml(facts, renderRow, { open = false } = {}) {
  const units = orderFactsForRender(facts);
  let out = "";
  let loose = "";
  const flush = () => { if (loose) { out += `<ul class="fact-list">${loose}</ul>`; loose = ""; } };
  for (const unit of units) {
    if (unit.kind === "fact") { loose += renderRow(unit.fact); continue; }
    const rendered = unit.facts.map((f) => ({ f, html: renderRow(f) })).filter((x) => x.html);
    if (!rendered.length) continue;
    if (rendered.length === 1) { loose += rendered[0].html; continue; }
    flush();
    out += factGroupHtml(
      { ...unit, facts: rendered.map((x) => x.f), lead: rendered[0].f },
      rendered.map((x) => x.html).join(""),
      { open },
    );
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------
// §7. Dates. A fact's `date` is when the figure was true or the rule took
// effect — it never moves on a recheck. The check date is a separate,
// SPARSE field (`last_verified_date`), so absent is the default case and
// nothing here may say "checked" from `date`.
// ---------------------------------------------------------------------
const ISO_DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;

// `dated X` is the same string the inline source pull-down renders, so
// both surfaces name this field pair with the same two words. `Not
// stated` is the date field's only null-marker — an exact stored string —
// and it is glossed rather than printed raw: "dated Not stated" is not a
// sentence, and a bare "Not stated" chip beside the word "source" reads
// as "the source is not stated", which is false, since every one of those
// rows carries a live link.
export function dateChip(value) {
  return value === "Not stated"
    ? `<span class="scope-tag">date not stated</span>`
    : `<span class="scope-tag">dated ${escapeHtml(value)}</span>`;
}

export function factDateTags(f) {
  const parts = [];
  if (f.date) parts.push(dateChip(f.date));
  if (f.last_verified_date) parts.push(`<span class="scope-tag">checked ${escapeHtml(f.last_verified_date)}</span>`);
  return parts.join(" ");
}

// The group-level date claim for a URL group. Prints on the row's
// TRAILING attribution line beside the link, never above the facts, and
// only ever states something true of EVERY fact in the group:
//   - all dates and check dates identical -> that one date (+ check);
//   - dates identical, check dates differ -> the shared date alone, with
//     no check claim, because no check claim is true of all of them;
//   - dates differ, all real ISO dates -> a span, earliest to latest;
//   - dates differ and any is not a plain ISO date -> no date at all; a
//     span across a non-date would be nonsense, and the per-fact lines
//     carry the truth.
export function sourceGroupDate(groupFacts) {
  const dates = [...new Set(groupFacts.map((f) => f.date || ""))];
  const checks = [...new Set(groupFacts.map((f) => f.last_verified_date || ""))];
  if (dates.length === 1 && checks.length === 1) {
    return { uniform: true, html: factDateTags(groupFacts[0]) };
  }
  if (dates.length === 1) {
    return { uniform: false, html: dates[0] ? dateChip(dates[0]) : "" };
  }
  if (dates.every((d) => ISO_DATE_RE.test(d))) {
    const sorted = dates.slice().sort();
    return {
      uniform: false,
      html: `<span class="scope-tag">dated ${escapeHtml(sorted[0])} to ${escapeHtml(sorted[sorted.length - 1])}</span>`,
    };
  }
  return { uniform: false, html: "" };
}

// The per-fact breakdown, rendered whenever a group's facts do not share
// one date: every fact named with its OWN date, in data order (no
// re-sort — string-sorting mixed date shapes is exactly the bug this
// avoids). `badgeHtml` is the caller's slot: the hydrated page rides a
// confidence badge down here with each fact, because one badge for the
// group would be the first fact's generalised over claims that do not
// share it; the static page has no badge and passes nothing.
export function sourceFactLinesHtml(groupFacts, { badgeHtml = null } = {}) {
  return `<ul class="source-facts">${groupFacts.map((f) => {
    const badge = typeof badgeHtml === "function" ? ` ${badgeHtml(f)}` : "";
    return `<li class="source-fact"><span class="source-fact-label">${escapeHtml(f.fact_label)}</span>${badge} ${factDateTags(f)}</li>`;
  }).join("")}</ul>`;
}

// ---------------------------------------------------------------------
// §8. v7 Part 14 / v8 Part 3 — illegal-but-practiced routes.
// Was a byte-for-byte twin in both files. Heading and label strings
// ("Illegal but sometimes practiced", "Illegal") are fixed template copy
// ruled by Part 14 items 2/3 and transported verbatim, not reworded.
//
// (a) the practice, plain language, verbatim from the researched fact,
// never softened or dramatized; (c) the real, sourced consequence if
// researched — if it is not in the published data this line renders
// nothing at all. Never a severity invented to fill the gap. The v5
// named-gap fallback string was removed once `notes` left the published
// export: it asserted "not researched" over consequences that HAD been
// researched and were simply no longer published.
// ---------------------------------------------------------------------
export function buildIllegalRoutesHtml(facts) {
  const illegalFacts = facts.filter(
    (f) => f.group_role === "mechanism_legality" && f.value_raw === "prohibited-enforced"
  );
  if (!illegalFacts.length) return "";
  const rows = illegalFacts.map((legalityFact) => {
    const groupFacts = facts.filter((f) => f.group_key === legalityFact.group_key);
    const mechanismFact = groupFacts.find(
      (f) => f.group_role === "mechanism" && f.group_role_detail === legalityFact.group_role_detail
    );
    const practice = mechanismFact ? mechanismFact.fact_label : legalityFact.fact_label;
    const consequence = (mechanismFact && mechanismFact.notes) || legalityFact.notes || "";
    // A sibling `mechanism` fact in the same group whose own legality
    // sibling reads "legitimate" is a real lawful alternative already
    // rendered elsewhere in this same chapter — named and pointed to,
    // never invented when none exists.
    const lawfulAlternatives = groupFacts.filter((f) => {
      if (f.group_role !== "mechanism" || f.group_role_detail === legalityFact.group_role_detail) return false;
      const sibling = groupFacts.find(
        (g) => g.group_role === "mechanism_legality" && g.group_role_detail === f.group_role_detail
      );
      return sibling && sibling.value_raw === "legitimate";
    });
    const insteadHtml = lawfulAlternatives.length
      ? `<div class="fact-notes">Lawful alternative in this same section: ${lawfulAlternatives.map((a) => escapeHtml(a.fact_label)).join(", ")}.</div>`
      : `<div class="fact-notes">No lawful alternative is recorded in this section yet — a gap, not a claim that none exists.</div>`;
    return `
      <div class="illegal-route-row">
        <div class="fact-label">${escapeHtml(practice)}</div>
        <div class="fact-value"><strong>Illegal</strong></div>
        ${consequence ? `<div class="fact-notes">${escapeHtml(consequence)}</div>` : ""}
        ${insteadHtml}
      </div>
    `;
  }).join("");
  return `<div class="illegal-routes"><h3>Illegal but sometimes practiced</h3>${rows}</div>`;
}

// ---------------------------------------------------------------------
// §9. The hold decision, in one place for both emitters.
// A row renders only when its value has a reader string, and until then
// it is HELD FROM RENDER, NOT DROPPED FROM THE STORE. The rows stay in
// derived/; this module declines to draw them.
// Returns null (render it) or the reason string.
// ---------------------------------------------------------------------
export function factHeld(fact) {
  return heldValue(fact.value_raw, fact.group_role);
}

// ---------------------------------------------------------------------
// §10. THE PAIR GATE — a provenance row never renders without the claim
// it belongs to.
//
// THE RULING, 2026-10-29 00:02 +00, first clause verbatim: "a provenance
// row never renders without the claim it belongs to; the renderer gates
// the pair as one unit, so the 45 orphaned rows are held with their
// claims until the tokens land." The second clause — provenance becoming
// FIELDS on the claim row once the tokens are retired in the data layer
// — is a later crossing and is deliberately not built here.
//
// WHAT WENT WRONG WITHOUT IT. §9's hold stops a claim row from drawing,
// but the Sources chapter cites the same fact by its own `fact_label`,
// so a held row left its label standing beside a live source link and a
// `dated`/`checked` stamp with no answer under it. Measured on the 38
// built pages: labels whose only surviving row carries a source link and
// scope tags and no claim rose from 300 to 345 — 45 newly orphaned
// across 25 pages. A "checked 2026-08-25" stamp standing over a question
// with no answer asserts currency for nothing, which is a claim under
// the perspective-disclosure law.
//
// WHY IT LIVES HERE AND NOT IN EITHER RENDERER. Both the static build
// and the hydrated page assemble their Sources chapter from the same
// fact rows, and §9 already decides, once, whether a claim row draws. A
// second copy of this test in either renderer re-opens the twin
// divergence this module exists to close. So both files partition their
// provenance input through THIS function, and neither re-implements it.
//
// WHAT IT DOES NOT GATE, so the omission is not read as an oversight.
// A fact whose text a reader DOES meet somewhere else on the same page
// is not orphaned and keeps its provenance. The measured case is the
// documentation_shape rows whose paragraph prints in the route-
// documentation block: tools/prerender-locations.mjs removes those from
// the chapter body alone, by text and deliberately, and its own comment
// states that the Sources chapter still cites them. This gate keys on
// §9's hold, which is a different and narrower thing: a held row's text
// reaches the reader nowhere at all.
//
// NOTHING LEAVES THE STORE. Ruling 45 holds from RENDER. The rows stay
// in derived/facts/*.jsonl exactly as they are, and so do their sources.
// ---------------------------------------------------------------------
export function provenanceFacts(facts) {
  return facts.filter((f) => !factHeld(f));
}
