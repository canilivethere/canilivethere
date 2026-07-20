// CanILiveThere — no-JS static fallback, per v7's own build scope: a
// 2026-07-10 launch-night finding named that location.html was 651
// bytes of nothing to any no-JS visitor.
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

const WEIGHT_NUMERIC = { High: 3, "Medium-High": 2, Medium: 1 };

const countries = readJsonl(join(DERIVED, "countries.jsonl"));
const locations = readJsonl(join(DERIVED, "locations.jsonl"));
const criteria = readJsonl(join(DERIVED, "criteria.jsonl")).sort((a, b) => a.display_order - b.display_order);
const scores = readJsonl(join(DERIVED, "scores.jsonl"));
const changeEvents = readJsonl(join(DERIVED, "change-events.jsonl"));

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

const changeEventsByCountry = new Map();
const changeEventsByLocation = new Map();
for (const ev of changeEvents) {
  if (!changeEventsByCountry.has(ev.country_id)) changeEventsByCountry.set(ev.country_id, []);
  changeEventsByCountry.get(ev.country_id).push(ev);
  if (ev.location_id) {
    if (!changeEventsByLocation.has(ev.location_id)) changeEventsByLocation.set(ev.location_id, []);
    changeEventsByLocation.get(ev.location_id).push(ev);
  }
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
// mapping judgment call, empty-state discipline, and the fixed
// consequence-gap string are all identical to that function's own
// comment — see it for the full reasoning, not re-argued here. Renders
// nothing until a real prohibited-enforced fact exists in derived/.
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
        <div class="fact-notes">${consequence ? escapeHtml(consequence) : "What enforcement actually looks like here isn't researched yet."}</div>
        ${insteadHtml}
      </div>
    `;
  }).join("");
  return `<div class="illegal-routes"><h3>Illegal but sometimes practiced</h3>${rows}</div>`;
}

const SECTION_TITLES = {
  overview: "Overview", visa: "Visa & residency", property: "Property",
  cost: "Cost of living", community: "Community", redflags: "Red flags",
};
const SECTION_ORDER = ["overview", "visa", "property", "cost", "community", "redflags"];

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

  const events = [
    ...(changeEventsByLocation.get(loc.location_id) || []),
    ...(changeEventsByCountry.get(country.country_id) || []).filter((e) => !e.location_id),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));
  const eventsHtml = events.length
    ? `<h2>Recent change events</h2>` + events.map((ev) => `
        <div class="change-event sev-${ev.severity}">
          <strong>${escapeHtml(ev.date)}</strong> — ${escapeHtml(ev.headline)}
          <span class="badge">${ev.category}</span> <span class="badge">severity ${ev.severity}</span>
          ${ev.detail ? `<div class="fact-notes">${escapeHtml(ev.detail)}</div>` : ""}
        </div>`).join("")
    : "";

  const facts = factsByLocation.get(loc.location_id) || [];
  const bySection = new Map(SECTION_ORDER.map((s) => [s, []]));
  for (const f of facts) {
    const s = sectionForFact(f);
    if (!bySection.has(s)) bySection.set(s, []);
    bySection.get(s).push(f);
  }

  const chaptersHtml = SECTION_ORDER.map((key) => {
    const list = bySection.get(key) || [];
    const title = SECTION_TITLES[key];
    const intro = CHAPTER_INTROS[key] ? `<p class="chapter-intro">${escapeHtml(CHAPTER_INTROS[key])}</p>` : "";
    // Rendered OPEN (not the JS build's closed-by-default) — see this
    // file's own header comment for why the static fallback diverges
    // here on purpose.
    const cls = "chapter" + (key === "redflags" ? " chapter-redflags" : "");
    if (!list.length) {
      return `<details class="${cls}" open id="sec-${key}"><summary>${title}</summary>${intro}<p class="fact-notes">Not yet researched — a gap, not a claim that nothing is true here.</p></details>`;
    }
    const rows = list.map((f) => `
      <li class="fact-item">
        <div class="fact-label">${escapeHtml(f.fact_label)}</div>
        <div class="fact-value">${escapeHtml(formatValue(f))}</div>
        ${f.notes ? `<div class="fact-notes">${escapeHtml(f.notes)}</div>` : ""}
      </li>`).join("");
    return `<details class="${cls}" open id="sec-${key}"><summary>${title}</summary>${intro}<ul class="fact-list">${rows}</ul>${buildIllegalRoutesHtml(list)}</details>`;
  }).join("");

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
      if (!linkedSeen.has(f.source_url)) linkedSeen.set(f.source_url, { fact: f, labels: [] });
      linkedSeen.get(f.source_url).labels.push(f.fact_label);
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
  const linkedSourceHtml = linkedRows.map(({ fact: f, labels }) => `<li class="fact-item"><div class="fact-label">${escapeHtml(labels.join(", "))}</div><div class="fact-value"><a class="source-link" href="${escapeHtml(f.source_url)}" target="_blank" rel="noopener">source</a> <span class="scope-tag">${escapeHtml(f.date || "")}</span></div></li>`).join("");
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
<!-- Cloudflare Web Analytics -- see index.html's matching comment for the
     token-placeholder explanation and the privacy/security review behind it. -->
<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "REPLACE_WITH_CLOUDFLARE_BEACON_TOKEN"}'></script>
</head>
<body data-loc-id="${escapeHtml(loc.location_id)}">
<div class="site-topbar">
  <a class="brand" href="../index.html">CanILiveThere</a>
  <nav class="site-nav"><a href="../index.html">Map</a><a href="../lists.html">Lists</a></nav>
</div>
<main>
  <div id="loc-root">
    <div class="loc-header"><h1>${escapeHtml(loc.display_name)} <span class="scope-tag">(${escapeHtml(country.name)})</span></h1></div>
    <div class="verdict-block">
      <p class="verdict-headline">${escapeHtml(headline)}</p>
      <p class="fit-link-line"><a href="#sec-breakdown">See the full score breakdown</a></p>
    </div>
    ${portraitHtml}
    ${eventsHtml}
    <nav class="section-nav">${SECTION_ORDER.map((s) => `<a href="#sec-${s}">${SECTION_TITLES[s]}</a>`).join("")}</nav>
    ${chaptersHtml}
    ${sourcesHtml}
    ${nextBestHtml}
  </div>
</main>
<footer class="site-footer"><p>CanILiveThere is a research tool, not legal or immigration advice. This page is a static snapshot for search engines and no-JS browsers — <a href="${escapeHtml(loc.location_id)}.html">reload with JavaScript enabled</a> for the full interactive version (persona switching, live re-coloring, collapsible chapters).</p></footer>
<script type="module" src="../js/location.js"></script>
</body>
</html>
`;

  writeFileSync(join(outDir, `${loc.location_id}.html`), html, "utf8");
  written++;
}

console.log(`Prerendered ${written} location pages into ${outDir}`);
