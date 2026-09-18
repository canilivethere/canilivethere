// CanILiveThere — no-JS static fallback, per v7's own build scope: a
// launch-night finding named that location.html was 651 bytes of
// nothing to any no-JS visitor.
//
// A real, if small, build step — this project's README used to say "no
// build step" for the whole site; that stays true for RUNTIME (every
// page still fetches derived/*.jsonl directly, no bundler, no
// framework). This script runs once, locally, before publish: it reads
// derived/ with plain Node fs/JSON (no dependencies — the "boring,
// dependency-light" standard applies here too) and writes one real,
// crawlable static HTML page per location to l/<location_id>.html.
//
// Deliberately NOT a re-implementation of the full interactive page
// (chapters, persona switcher, live re-color) — that's location.js's
// job, and it still runs client-side, replacing this static content the
// moment JS is available (see location.js's own root.innerHTML = ""
// clear-then-rebuild). This script's only job is: a crawler or a
// no-JS browser landing on a location URL sees real content, not an
// empty <div>. Per the general/unpersonalized default (this project's
// own neutrality doctrine — no persona pre-selected for a stranger),
// nothing here is gated behind a click (no <details> collapse — a
// crawler benefits from everything being present in the raw HTML, and a
// genuinely no-JS human visitor has no way to open a <details> toggle's
// JS-free native behavior is actually fine, browsers support
// <details>/<summary> natively — but leaving them CLOSED by default
// would hide content from a crawler that doesn't execute a click. So
// this script renders them OPEN — a real, deliberate divergence from
// the JS-driven page's own "nothing pours" collapse default, reasoned
// here rather than silently copied.
//
// Usage: node tools/prerender-locations.mjs   (run from the repo root)

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DERIVED = join(ROOT, "derived");

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The hand-kept copy of js/app-shared.js's escapeParagraphs() stood here.
// Its only caller was the change-event detail block, which is gone, and a
// change event's `detail` was the one multi-paragraph stored field either
// emitter rendered. The original still lives in app-shared.js.

// --- Date semantics: a hard rule, not a style choice -------------------
// A fact's `date` is when the figure was true or the rule took effect —
// it never moves on a recheck. The check date is a separate field,
// `last_verified_date`, and it is SPARSE (165 of 2,196 public rows carry
// one). Absent is therefore the default case, and nothing below may say
// "checked" from `date`. Hand-synced with the identical block in
// js/location.js — same duplication class this file's header comment
// already names for generalIndex()/sectionForFact().
const ISO_DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;

// One date value as a chip that names its own subject.
// `dated X` is the same string the inline source pull-down renders
// (sourceDetailHtml(), js/app-shared.js), so both surfaces name this field
// pair with the same two words instead of two vocabularies for one pair.
// `Not stated` is the date field's only null-marker — an exact stored
// string — and it is glossed rather than printed raw: "dated Not stated"
// is not a sentence, and a bare "Not stated" chip sitting beside the word
// "source" reads as "the source is not stated", which is false, since
// every one of those rows carries a live link. Same move, and the same
// class of copy, as this chapter's "Source noted — no link available yet".
function dateChip(value) {
  return value === "Not stated"
    ? `<span class="scope-tag">date not stated</span>`
    : `<span class="scope-tag">dated ${escapeHtml(value)}</span>`;
}

// One fact's own dates: its effective date, plus the check date only
// where one really exists.
function factDateTags(f) {
  const parts = [];
  if (f.date) parts.push(dateChip(f.date));
  if (f.last_verified_date) parts.push(`<span class="scope-tag">checked ${escapeHtml(f.last_verified_date)}</span>`);
  return parts.join(" ");
}

// The group-level date claim for a URL group. URL grouping is kept. This
// prints on the row's TRAILING attribution line beside the link, never
// above the facts, and only ever states something true of EVERY fact in
// the group:
//   - all dates and check dates identical -> that one date (+ check),
//     and no per-fact breakdown is needed;
//   - dates identical, check dates differ -> the shared date alone, with
//     no check claim, because no check claim is true of all of them;
//   - dates differ, all real ISO dates -> a span, earliest to latest;
//   - dates differ and any is not a plain ISO date ("Not stated",
//     "2026-06-02 (passed)") -> no date at all; a span across a non-date
//     would be nonsense. The per-fact lines carry the truth.
// Position is load-bearing: printed BELOW the per-fact lines, a span can
// only be read as a summary of what the reader has just read. Printed
// above them, in the same chip style a single fact's date uses, it reads
// as one figure's validity period, which it is not.
function sourceGroupDate(groupFacts) {
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
// avoids). The span on the attribution line below is therefore a summary
// of the set, not a claim about this list's order, and nothing on the
// page says otherwise.
function sourceFactLinesHtml(groupFacts) {
  return `<ul class="source-facts">${groupFacts.map((f) => `<li class="source-fact"><span class="source-fact-label">${escapeHtml(f.fact_label)}</span> ${factDateTags(f)}</li>`).join("")}</ul>`;
}

const WEIGHT_NUMERIC = { High: 3, "Medium-High": 2, Medium: 1 };

const countries = readJsonl(join(DERIVED, "countries.jsonl"));
const locations = readJsonl(join(DERIVED, "locations.jsonl"));
const criteria = readJsonl(join(DERIVED, "criteria.jsonl")).sort((a, b) => a.display_order - b.display_order);
const scores = readJsonl(join(DERIVED, "scores.jsonl"));
// visa-routes.jsonl — read here for ONE field, `documentation_shape` (see
// buildRouteDocShapesHtml() below). The rest of the route card stays the
// interactive page's job.
const visaRoutes = readJsonl(join(DERIVED, "visa-routes.jsonl"));
// change-events.jsonl is deliberately not read: the change log is internal
// and comes off the location pages, so neither emitter renders it. Same
// removal as js/data.js's own fetch list — both emitters have to agree.

const countriesById = new Map(countries.map((c) => [c.country_id, c]));

const factsDir = join(DERIVED, "facts");
let allFacts = [];
if (existsSync(factsDir)) {
  for (const f of readdirSync(factsDir)) {
    if (f.endsWith(".jsonl")) allFacts = allFacts.concat(readJsonl(join(factsDir, f)));
  }
}

const scoresByLocation = new Map();
for (const s of scores) {
  if (!scoresByLocation.has(s.location_id)) scoresByLocation.set(s.location_id, new Map());
  scoresByLocation.get(s.location_id).set(s.criterion_id, s);
}

const factsByLocation = new Map();
for (const loc of locations) {
  const own = allFacts.filter((f) => f.location_id === loc.location_id);
  const inherited = allFacts.filter((f) => f.scope === "country" && f.country_id === loc.country_id);
  factsByLocation.set(loc.location_id, [...inherited, ...own]);
}


// generalIndex — same formula as js/data.js's own generalIndex(), a
// second implementation because this script runs in Node (fs) not the
// browser (fetch); kept in exact lockstep with that function's own
// weighting rule, not reinvented.
function generalIndex(locationId) {
  const rows = scoresByLocation.get(locationId);
  if (!rows) return null;
  let weightedSum = 0, weightTotal = 0;
  const used = [];
  for (const crit of criteria) {
    const row = rows.get(crit.criterion_id);
    if (!row || row.status === "gap" || row.score == null) continue;
    const w = WEIGHT_NUMERIC[crit.weight_class] || 1;
    weightedSum += row.score * w;
    weightTotal += w;
    used.push(crit.criterion_id);
  }
  if (weightTotal === 0) return null;
  return { value: weightedSum / weightTotal, criteriaUsed: used.length, criteriaTotal: criteria.length };
}

function topBottomCriteria(locationId) {
  const rows = scoresByLocation.get(locationId);
  if (!rows) return null;
  const entries = [];
  for (const crit of criteria) {
    const row = rows.get(crit.criterion_id);
    if (!row || row.status === "gap" || row.score == null) continue;
    entries.push({ name: crit.name, criterion_id: crit.criterion_id, val: row.score });
  }
  if (!entries.length) return null;
  let top = entries[0], bottom = entries[0];
  for (const e of entries) {
    if (e.val > top.val) top = e;
    if (e.val < bottom.val) bottom = e;
  }
  return { top, bottom };
}

function fitBandWord(value) {
  if (value == null || Number.isNaN(value)) return "not yet scored";
  if (value < 2) return "a tough fit";
  if (value < 3) return "a stretch";
  if (value < 4) return "promising";
  return "a strong fit";
}

function buildFitHeadline(loc, country, value) {
  const tb = topBottomCriteria(loc.location_id);
  const band = fitBandWord(value);
  return tb && tb.top.criterion_id !== tb.bottom.criterion_id
    ? `${loc.display_name}, ${country.name} — ${band}; ${tb.top.name} is a strength, ${tb.bottom.name} is the catch.`
    : `${loc.display_name}, ${country.name} — ${band}.`;
}

// Hand-kept copy of js/app-shared.js's FIT_INDEX_DEFAULT_WEIGHTING_LINE,
// duplicated for the same Node-vs-browser reason as buildFitHeadline()
// above. This page is always the no-lens state — a crawler or a no-JS
// visitor has no box and no persona — so the line renders unconditionally
// here, where the JS page renders it only on its own no-lens branch.
// Only the first of app-shared.js's two strings has a home here: the
// second is for a reader who has saved priorities, which this file cannot
// know and a no-JS visitor cannot have.
// If the string in app-shared.js moves, move this one with it: the static
// page and the hydrated page must not disagree about whose weighting the
// reader is looking at.
const FIT_INDEX_DEFAULT_WEIGHTING_LINE =
  "This is the site's default weighting — you haven't told it what matters most to you, so nothing here is reweighted for you yet.";

// sectionForFact — same lookup as js/data.js, duplicated for the same
// Node-vs-browser reason as generalIndex() above.
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
function sectionForFact(fact) {
  const ref = fact.source_ref || "";
  for (const [needle, section] of FILE_SECTION_MAP) {
    if (ref.includes(needle)) return section;
  }
  if (fact.criterion_id && CRITERION_SECTION_FALLBACK[fact.criterion_id]) {
    return CRITERION_SECTION_FALLBACK[fact.criterion_id];
  }
  return "overview";
}

// v7 Part 14 / v8 Part 3: illegal-but-practiced routes — the Node-side
// twin of js/location.js's buildIllegalRoutesHtml() (same reason this file
// already duplicates generalIndex()/sectionForFact() rather than sharing
// them: this script runs in Node, that one in the browser). Field-
// mapping judgment call and empty-state discipline are identical to that
// function's own comment — see it for the full reasoning, not re-argued
// here. That includes the consequence line: it renders only when the
// published data carries a consequence, and nothing at all when it does
// not. The former fixed consequence-gap string ("...isn't researched
// yet.") was removed there and is removed here for the same reason — with
// `notes` out of the published export it asserted a research gap over
// consequences that had in fact been researched. Renders nothing until a
// real prohibited-enforced fact exists in derived/.
function buildIllegalRoutesHtml(facts) {
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

// --- What a visa route asks you to PRODUCE ----------------------------
// The Node-side twin of the `documentation_shape` block inside
// js/location.js's buildVisaRoutesHtml() — same duplication class this
// file's header comment already names for generalIndex()/sectionForFact(),
// and the same reader-facing wording ("What this route asks you for") so
// the static and hydrated surfaces do not disagree about what they are
// showing.
//
// Deliberately ONE FIELD, not the route card: no income thresholds, no
// permanent-residency conversion, no age gates, no confidence or
// divergence badges. Those remain the interactive page's job. This exists
// because until now the field reached a JS reader only — a crawler and a
// no-JS visitor saw no trace of it, though it is often the part that
// decides whether a route is reachable at all (an apostilled police
// certificate from a country you left is a harder bar than an income
// figure you clear).
//
// Two conventions carried across from the client-side block verbatim:
//   - EMPTY RENDERS NOTHING. 61 of 95 route rows carry no
//     `documentation_shape` at all. They produce no label, no bullet, no
//     placeholder line: an absent shape is an un-researched gap, and a gap
//     stated in a bullet is still a bullet. A country with none at all
//     emits no block and no heading.
//   - DEDUPE WITHIN A ROUTE. One route_key can hold several threshold rows
//     whose documentation text is identical (all three
//     EG:route:real-estate-investment-residency rows are). The text renders
//     once per route. Measured: 34 populated rows across 11 countries
//     collapse to 32 rendered blocks. Two distinct texts under one route
//     would each render; none exist today.
//
// Text is rendered exactly as stored, escaped, never trimmed to a summary
// — a documentation list with an item silently dropped is worse than none.
// These run 323-1,384 characters, hence prose on its own line rather than
// an inline value.
//
// Label: all 34 populated rows are ':route:' rows carrying a real
// `threshold_label`, so location.js's ':visit:' de-slug fallback
// (routeCategoryLabel()) is not needed here and is not copied. A populated
// ':visit:' row would render with no route label — the signal to port it.
const routesByCountry = new Map();
for (const r of visaRoutes) {
  if (!routesByCountry.has(r.country_id)) routesByCountry.set(r.country_id, []);
  routesByCountry.get(r.country_id).push(r);
}

// The collapse itself, lifted out of the renderer so the suppression
// below reads from the SAME map the block prints from. One source, so the
// two cannot drift into disagreeing about what is on the page.
// Returns route_key -> { label, shapes[] }.
function collapseRouteDocShapes(countryId) {
  const rows = routesByCountry.get(countryId) || [];
  const byRoute = new Map();
  for (const r of rows) {
    const shape = typeof r.documentation_shape === "string" ? r.documentation_shape.trim() : "";
    if (!shape) continue;
    if (!byRoute.has(r.route_key)) byRoute.set(r.route_key, { label: r.threshold_label || "", shapes: [] });
    const entry = byRoute.get(r.route_key);
    if (!entry.shapes.includes(shape)) entry.shapes.push(shape);
  }
  return byRoute;
}

// Every documentation paragraph this country's block will actually print,
// as a Set of the exact strings — the suppression test below.
function routeDocTexts(countryId) {
  const texts = new Set();
  for (const { shapes } of collapseRouteDocShapes(countryId).values()) {
    for (const shape of shapes) texts.add(shape);
  }
  return texts;
}

// --- The paragraph this page used to print twice ----------------------
// 32 facts carry group_role "documentation_shape", holding the same
// paragraph as a route row's `documentation_shape` field — the text is
// stored in both the fact table and the route table.
//
// js/location.js never prints those facts. Its visa chapter groups any
// fact with a group_key into a route card and renders three roles from it
// (threshold, converts_to_pr, accepts_passive_income); a
// documentation_shape fact falls through unrendered, and the reader meets
// the text once, in that page's own route-documentation block.
//
// This file had the block but not the suppression, so the static page
// printed the paragraph twice — once as a plain fact row in the visa
// chapter, once under "What this route asks you for". Measured on the
// shipped bytes before this change: 68 of 70 route-doc blocks were
// byte-identical to a paragraph already on the same page, 40,537
// characters of verbatim repetition, 11 blocks on each Thai page.
//
// SUPPRESS ON TEXT, NOT ON ROLE, and that distinction is the whole job.
// 32 doc-shape facts against 32 populated route_keys is not the same 32:
//   - MA:route:employer-sponsored-work-visa carries a documentation fact
//     (the ANAPEC non-availability-certificate exemption) with NO route
//     row behind it. Blanket role suppression would delete the only way
//     that route's requirements reach a static reader at all.
//   - GT:route:digital-nomad-visa is the mirror case: a route row whose
//     fact twin is gone.
// So a fact whose rendered text is one the block on this page is already
// printing does not render; a fact with no such twin renders exactly as
// before. If a fact's text ever diverges from its route row's, BOTH
// render, loudly, on the same page — the correct failure: two texts that
// disagree are a data problem for the lane to resolve, not something a
// render pass gets to hide by silently picking one.
//
// Applied at the chapter body only, which is where js/location.js applies
// it too. The Sources chapter still counts and cites these facts on both
// emitters — a fact whose text is shown once is still sourced.
function withoutDuplicatedRouteDocs(facts, docTexts) {
  if (!docTexts.size) return facts;
  return facts.filter(
    (f) => !(f.group_role === "documentation_shape" && docTexts.has(formatValue(f).trim()))
  );
}

function buildRouteDocShapesHtml(country) {
  const byRoute = collapseRouteDocShapes(country.country_id);
  if (!byRoute.size) return "";
  const items = [...byRoute.values()].map(({ label, shapes }) => {
    const labelHtml = label ? `<div class="fact-label">${escapeHtml(label)}</div>` : "";
    const shapesHtml = shapes.map((shape) =>
      `<div class="fact-label route-doc-label">What this route asks you for</div><p class="route-doc">${escapeHtml(shape)}</p>`
    ).join("");
    return `<li class="fact-item">${labelHtml}${shapesHtml}</li>`;
  }).join("");
  // Perspective-disclosure law: this block states whose lens it shows. It
  // is the no-lens, general case — a static page cannot know the reader's
  // nationality, and paperwork requirements commonly differ by passport.
  return `
    <h3>What the visa routes ask you for</h3>
    <p class="fact-notes">The paperwork side of each documented route into ${escapeHtml(country.name)} — what an applicant has to produce, as opposed to what they have to earn. General, not checked against any one reader's nationality or circumstances; requirements often differ by passport. Income thresholds, permanent-residency conversion and age limits are in the interactive version of this page. Routes whose documentation isn't researched yet are simply absent here.</p>
    <ul class="fact-list">${items}</ul>
  `;
}

const SECTION_TITLES = {
  overview: "Overview", visa: "Visa & residency", property: "Property",
  cost: "Cost of living", community: "Community", redflags: "Red flags",
};
// Chapter order: verdict, intro, visa, cost of living,
// property, community, red flags, score breakdown, sources. Cost of
// living now precedes property. Must stay identical to js/location.js's
// own SECTION_ORDER/INTRO_SECTION so the prerendered and hydrated pages
// agree — same hand-kept-in-sync duplication class as sectionForFact().
const SECTION_ORDER = ["overview", "visa", "cost", "property", "community", "redflags"];
// The overview chapter is folded into the intro: it renders with the
// portrait block, second on the page after the verdict, not down in the
// chapter run. Content untouched — position only.
const INTRO_SECTION = "overview";

function formatValue(fact) {
  if (fact.value_raw === "[GAP]") return "Not yet researched";
  const raw = String(fact.value_raw);
  if (fact.unit && !raw.toLowerCase().includes(String(fact.unit).toLowerCase())) return `${raw} ${fact.unit}`;
  return raw;
}

// Portrait copy — imported from the same module the live JS build uses,
// so the static fallback and the JS-hydrated page never disagree (one
// source, not two authored copies of the same string).
const { PORTRAITS, CHAPTER_INTROS } = await import("../js/portraits.js");
// ONE STRING ON ALL 38, NOT TWO. The footer's list of what the
// interactive version adds named "your own figures read against this
// place" on all 38 pages; the box reads five countries, which is 12 of
// them, so it was false on 26.
//
// An earlier shape split the sentence in two and picked by READ_SET —
// true on every page, and the reason it goes anyway is this: the footer
// is a
// static snapshot's description of the INTERACTIVE version, not a promise
// about this reader, so the test a replacement has to pass is "true on all
// 38, with numbers, with priorities only, with a passport only, or with
// nothing entered". One sentence that passes it beats two that each pass
// half of it, and the READ_SET branch is retired with the string it
// existed to guard. Nothing else in this file reads READ_SET, so the
// import goes with it.
//
// Why it is true on 38 of 38: renderPerspectiveBlock() runs
// unconditionally in js/location.js's render for every page and states
// whose lens the page shows — the reader's, a persona's, or the no-lens
// state, which under the perspective-disclosure law is itself a
// perspective and says so. It promises a mechanism every page carries.
//
// Spelling: "re-coloring" is kept as shipped — American, like every other
// string on the site; a one-string flip would put two conventions in one
// footer.
const FOOTER_EXTRAS =
  "your own perspective on this place, live re-coloring, collapsible chapters";

function interactiveExtras() {
  return FOOTER_EXTRAS;
}

const outDir = join(ROOT, "l");
mkdirSync(outDir, { recursive: true });

const THEME_SCRIPT = `<script>
  try {
    if (localStorage.getItem("theme") === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch (e) {}
</script>`;

let written = 0;
for (const loc of locations) {
  const country = countriesById.get(loc.country_id);
  if (!country) continue;

  const general = generalIndex(loc.location_id);
  const headline = buildFitHeadline(loc, country, general ? general.value : null);

  const portrait = PORTRAITS[loc.location_id];
  const portraitHtml = portrait
    ? `<div class="portrait-block"><p>${escapeHtml(portrait.portrait)}</p><p class="portrait-teaser">${escapeHtml(portrait.hook)} — ${escapeHtml(portrait.number)}</p></div>`
    : "";

  // The "Recent change events" block used to be assembled here and emitted
  // below the sources chapter, directly above "Where now?". It is gone from
  // both emitters: the change log is internal and a reader never sees it.

  const facts = factsByLocation.get(loc.location_id) || [];
  const bySection = new Map(SECTION_ORDER.map((s) => [s, []]));
  for (const f of facts) {
    const s = sectionForFact(f);
    if (!bySection.has(s)) bySection.set(s, []);
    bySection.get(s).push(f);
  }

  // Per-section extra HTML, the static twin of js/location.js's
  // buildSection(key, facts, extraHtml) third argument. Only the visa
  // chapter has one, and only where the country's routes carry any
  // documentation at all.
  const sectionExtras = { visa: buildRouteDocShapesHtml(country) };
  // What that block prints on THIS page, for the duplicate test — empty
  // for a country with no documented route paperwork, which suppresses
  // nothing.
  const docTexts = routeDocTexts(country.country_id);

  const chapterHtml = (key) => {
    // Filtered before the length test, so a chapter left empty by the
    // suppression falls through to the honest "not yet researched" line
    // rather than printing an empty list.
    const list = withoutDuplicatedRouteDocs(bySection.get(key) || [], docTexts);
    const extra = sectionExtras[key] || "";
    const title = SECTION_TITLES[key];
    const intro = CHAPTER_INTROS[key] ? `<p class="chapter-intro">${escapeHtml(CHAPTER_INTROS[key])}</p>` : "";
    // Rendered OPEN (not the JS build's closed-by-default) — see this
    // file's own header comment for why the static fallback diverges
    // here on purpose.
    const cls = "chapter" + (key === "redflags" ? " chapter-redflags" : "");
    if (!list.length) {
      // A chapter with no facts but real extra content is not a gap, and
      // must not claim to be one.
      const body = extra || `<p class="fact-notes">Not yet researched — a gap, not a claim that nothing is true here.</p>`;
      return `<details class="${cls}" open id="sec-${key}"><summary>${title}</summary>${intro}${body}</details>`;
    }
    const rows = list.map((f) => `
      <li class="fact-item">
        <div class="fact-label">${escapeHtml(f.fact_label)}</div>
        <div class="fact-value">${escapeHtml(formatValue(f))}</div>
        ${f.notes ? `<div class="fact-notes">${escapeHtml(f.notes)}</div>` : ""}
      </li>`).join("");
    return `<details class="${cls}" open id="sec-${key}"><summary>${title}</summary>${intro}<ul class="fact-list">${rows}</ul>${buildIllegalRoutesHtml(list)}${extra}</details>`;
  };

  const introChapterHtml = chapterHtml(INTRO_SECTION);
  const chaptersHtml = SECTION_ORDER.filter((key) => key !== INTRO_SECTION).map(chapterHtml).join("");

  // Part 23.2 (F3), same fix and same copy as the JS-hydrated page's
  // buildSourcesSection() (js/location.js) — kept in sync by hand, same
  // duplication class this file's own header comment already names for
  // generalIndex()/sectionForFact(). Linked sources stay fully itemized;
  // unlinked sources collapse to one honest, count-stated line.
  const sourcedFacts = facts.filter((f) => f.value_raw !== "[GAP]" && (f.source_url || f.source_ref));
  const linkedSeen = new Map();
  const unlinkedSeen = new Map();
  for (const f of sourcedFacts) {
    if (f.source_url) {
      // Same fix as js/location.js's buildSourcesSection(): one row per
      // distinct URL, but every fact this URL backs gets named, not just
      // the first one kept for its link/date — a bare "source" link gave
      // a reader no way to tell which claim it documented.
      if (!linkedSeen.has(f.source_url)) linkedSeen.set(f.source_url, { fact: f, facts: [] });
      linkedSeen.get(f.source_url).facts.push(f);
    } else {
      // Same dedup key as the old single-list code (source_ref/
      // fact_label) — a "source" is a distinct citation, not one row per
      // fact; several facts commonly cite the same unlinked source.
      const key = `onfile:${f.source_ref || f.fact_label}`;
      if (!unlinkedSeen.has(key)) unlinkedSeen.set(key, f);
    }
  }
  const linkedRows = [...linkedSeen.values()];
  const unlinkedFacts = [...unlinkedSeen.values()];
  // A row must NOT print the FIRST fact's date for the whole URL group: a
  // corrected date sitting behind a URL whose first fact was untouched
  // would never reach the page at all. The attribution line states only
  // what is true of every fact in the group, and the moment they disagree
  // each fact prints its own date.
  //
  // Facts first, source last, in both shapes: the row leads with fact
  // identification — joined labels when the group's dates agree, one line
  // per fact when they don't — and closes with a single attribution line
  // carrying the link. A reader scanning the chapter meets a fact label at
  // the top of every row without exception. Hand-synced with the same
  // branch in js/location.js.
  const linkedSourceHtml = linkedRows.map(({ fact: f, facts: groupFacts }) => {
    const { uniform, html: dateHtml } = sourceGroupDate(groupFacts);
    const leadHtml = uniform
      ? `<div class="fact-label">${escapeHtml(groupFacts.map((g) => g.fact_label).join(", "))}</div>`
      : sourceFactLinesHtml(groupFacts);
    const link = `<a class="source-link" href="${escapeHtml(f.source_url)}" target="_blank" rel="noopener">source</a>`;
    return `<li class="fact-item">${leadHtml}<div class="fact-value">${link}${dateHtml ? ` ${dateHtml}` : ""}</div></li>`;
  }).join("");
  let mostRecentUnlinkedDate = null;
  for (const f of unlinkedFacts) {
    if (f.date && (!mostRecentUnlinkedDate || f.date > mostRecentUnlinkedDate)) mostRecentUnlinkedDate = f.date;
  }
  const unlinkedDateText = escapeHtml(mostRecentUnlinkedDate || "an unstated date");
  let unlinkedSourceHtml = "";
  if (unlinkedFacts.length > 0) {
    let sentence;
    if (linkedRows.length === 0) {
      sentence = `${unlinkedFacts.length} sources are on file here, none with a public link yet — the most recent dates from ${unlinkedDateText}.`;
    } else if (unlinkedFacts.length === 1) {
      sentence = `One more source is on file here without a public link yet — it dates from ${unlinkedDateText}.`;
    } else {
      sentence = `${unlinkedFacts.length} more sources are on file here without a public link yet — the most recent dates from ${unlinkedDateText}.`;
    }
    unlinkedSourceHtml = `<li class="fact-item"><p class="fact-notes">${sentence}</p></li>`;
  }
  const sourceRowsHtml = linkedSourceHtml + unlinkedSourceHtml;
  const sourcesHtml = `<details class="chapter" open id="sec-sources"><summary>Sources</summary>` + (sourceRowsHtml
    ? `<ul class="fact-list">${sourceRowsHtml}</ul>`
    : `<p class="fact-notes">No sources on file yet.</p>`) + `</details>`;

  const candidates = locations
    .filter((l) => l.location_id !== loc.location_id)
    .map((l) => ({ l, val: (generalIndex(l.location_id) || {}).value ?? -1 }))
    .filter((c) => c.val >= 0)
    .sort((a, b) => b.val - a.val)
    .slice(0, 5);
  // Deployment-agnostic paths, not root-absolute: this page always lives
  // one directory below the site root (l/<location_id>.html), so a sibling
  // l/ page is a bare relative link (same directory) and everything else
  // one level up is "../"-prefixed — works unmodified at both the GitHub
  // Pages project-site subpath and the future custom-domain root, no code
  // change needed at cutover (see js/site-root.js's own header comment for
  // the client-side JS half of this same fix).
  const nextBestHtml = `<div class="next-best" id="where-now"><h2>Where now?</h2><p>Ranked next-best alternatives:</p>
    <ul>${candidates.map((c) => `<li><a href="${c.l.location_id}.html">${escapeHtml(c.l.display_name)}</a> — ${c.val.toFixed(1)}/5</li>`).join("")}</ul>
    <p><a href="../lists.html">Back to the full list</a> · <a href="../index.html">Back to the map</a></p></div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(loc.display_name)} (${escapeHtml(country.name)}) — CanILiveThere</title>
<meta name="description" content="${escapeHtml(`${loc.display_name}, ${country.name}: sourced, dated relocation research — visa routes, property, cost of living, community, and red flags.`)}">
${THEME_SCRIPT}
<link rel="stylesheet" href="../css/style.css">
<!-- Cloudflare Web Analytics -- see index.html's matching comment for what
     this script does, why its token is public, and the privacy/security
     review behind it. -->
<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "aadba803db5d47e3a91b7c99aa9f0890"}'></script>
</head>
<body data-loc-id="${escapeHtml(loc.location_id)}">
<div class="site-topbar">
  <a class="brand" href="../index.html">CanILiveThere</a>
  <!-- A no-JS reader gets a door, not a dead corner. The
       same control js/app-shared.js renders after hydration, as a plain
       link — which is all it ever is on a page other than the map. The
       value reads "nobody yet" because a static page cannot know what is
       in this browser's storage, and saying so is the perspective-
       disclosure law's own no-lens clause, not a placeholder. -->
  <a class="corner-lens" href="../index.html?reopen=1" aria-label="Who's asking: nobody yet — opens the box to change it">
    <span class="corner-lens-prefix">Who's asking:</span>
    <span class="corner-lens-value">nobody yet</span>
  </a>
  <nav class="site-nav"><a href="../index.html">Map</a><a href="../lists.html">Lists</a></nav>
</div>
<main>
  <div id="loc-root">
    <div class="loc-header"><h1>${escapeHtml(loc.display_name)} <span class="scope-tag">(${escapeHtml(country.name)})</span></h1></div>
    <div class="verdict-block">
      <p class="verdict-headline">${escapeHtml(headline)}</p>
      <p class="verdict-prose">${escapeHtml(FIT_INDEX_DEFAULT_WEIGHTING_LINE)}</p>
      <p class="fit-link-line"><a href="#sec-breakdown">See the full score breakdown</a></p>
    </div>
    <nav class="section-nav">${SECTION_ORDER.map((s) => `<a href="#sec-${s}">${SECTION_TITLES[s]}</a>`).join("")}</nav>
    ${portraitHtml}
    ${introChapterHtml}
    ${chaptersHtml}
    ${sourcesHtml}
    ${nextBestHtml}
  </div>
</main>
<footer class="site-footer"><p>CanILiveThere is a research tool, not legal or immigration advice. This page is a static snapshot for search engines and no-JS browsers — <a href="${escapeHtml(loc.location_id)}.html">reload with JavaScript enabled</a> for the full interactive version (${escapeHtml(interactiveExtras())}).</p><p>Want something researched, or found something wrong? <a href="../contact.html">Write to us.</a></p></footer>
<script type="module" src="../js/location.js"></script>
</body>
</html>
`;

  writeFileSync(join(outDir, `${loc.location_id}.html`), html, "utf8");
  written++;
}

console.log(`Prerendered ${written} location pages into ${outDir}`);
