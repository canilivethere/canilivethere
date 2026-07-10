import { loadStore, sectionForFact, verdictHeadline } from "./data.js";
import { scoreToColor, verdictVisual } from "./colors.js";
import {
  renderHeader, renderFooter, getPersona, withPersona, escapeHtml,
  formatValue, confidenceBadge, sourceLine, divergenceBadge,
  FIT_INDEX_DEFINITION,
} from "./app-shared.js";

renderHeader("location");
main();

const SECTION_TITLES = {
  overview: "Overview",
  visa: "Visa & residency",
  property: "Property",
  cost: "Cost of living",
  community: "Community",
  redflags: "Red flags",
};
const SECTION_ORDER = ["overview", "visa", "property", "cost", "community", "redflags"];

async function main() {
  const store = await loadStore();
  renderFooter(store);
  const persona = getPersona();

  const params = new URLSearchParams(location.search);
  const locId = params.get("loc");
  const root = document.getElementById("loc-root");
  const loc = store.locationsById.get(locId);

  if (!loc) {
    root.innerHTML = `<p>No location matches <code>${escapeHtml(locId || "")}</code>. <a href="${withPersona("lists.html")}">Back to the list</a>.</p>`;
    return;
  }
  const country = store.countriesById.get(loc.country_id);
  document.title = `${loc.display_name} (${country.name}) — CanILiveThere`;

  root.appendChild(buildHeader(loc, country));
  root.appendChild(buildPersonaPanel(store, loc, persona));
  root.appendChild(buildScoreBar(store, loc, persona));
  root.appendChild(buildChangeEvents(store, loc, country));
  root.appendChild(buildSectionNav());

  const facts = store.factsByLocation.get(loc.location_id) || [];
  const bySection = new Map(SECTION_ORDER.map((s) => [s, []]));
  for (const f of facts) {
    const s = sectionForFact(f);
    if (!bySection.has(s)) bySection.set(s, []);
    bySection.get(s).push(f);
  }

  for (const sectionKey of SECTION_ORDER) {
    root.appendChild(buildSection(sectionKey, bySection.get(sectionKey) || []));
  }

  root.appendChild(buildSourcesSection(facts));
  root.appendChild(buildNextBest(store, loc, persona));
}

function buildHeader(loc, country) {
  const div = document.createElement("div");
  // loc.status ("Rescored" for every location, as of this build) is this
  // project's own internal build-pipeline status, not place data — it
  // carries no reader-facing meaning and is deliberately not rendered here.
  div.innerHTML = `
    <div class="loc-header">
      <h1>${escapeHtml(loc.display_name)} <span class="scope-tag">(${escapeHtml(country.name)})</span></h1>
    </div>
  `;
  return div;
}

function buildPersonaPanel(store, loc, persona) {
  const div = document.createElement("div");
  if (!persona) return div;
  const general = store.generalIndex(loc.location_id);
  const displayName = persona.charAt(0).toUpperCase() + persona.slice(1);
  const perLoc = store.fixturesByPersona.get(persona)?.get(loc.location_id);
  // Check the actual fixture data shape, not a hardcoded persona name.
  // Originally this branched on `persona === "waldo"` because Wenda/Carmen
  // had only verdict fixtures when this file was first written - but real
  // criterion-level data for them landed concurrently with this build.
  // Hardcoding by name would have silently kept showing "verification
  // pending" forever even after real scores existed.
  const hasCriterionFixtures = perLoc && perLoc.criteria && perLoc.criteria.size > 0;
  div.className = "judgment-note";
  if (hasCriterionFixtures) {
    const idx = store.personaIndex(persona, loc.location_id);
    div.innerHTML = `<strong>${displayName}'s Fit index:</strong> ${idx ? idx.value.toFixed(1) + "/5" : "not enough data"} —
      re-scored fixture criteria for ${displayName} are shown in the score bar below.
      <div class="fit-def">${escapeHtml(FIT_INDEX_DEFINITION)}</div>`;
    if (perLoc.verdict) {
      const headline = verdictHeadline(perLoc.verdict.expected);
      const v = verdictVisual(headline);
      div.innerHTML += `<br><span class="verdict-chip" style="background:${v.color}">${escapeHtml(v.label)}</span>
        ${escapeHtml(perLoc.verdict.expected)}`;
    }
  } else {
    const verdict = perLoc?.verdict;
    if (verdict) {
      const headline = verdictHeadline(verdict.expected);
      const v = verdictVisual(headline);
      div.innerHTML = `<strong>${displayName}'s visa/elimination read:</strong>
        <span class="verdict-chip" style="background:${v.color}">${escapeHtml(v.label)}</span><br>
        ${escapeHtml(verdict.expected)}<br>
        <em>No full criterion rescore exists for this persona yet — the general Fit index
        (${general ? general.value.toFixed(1) + "/5" : "not scored"}) is shown below unchanged, not adjusted
        for ${displayName}. That's "verification pending," not a real personalized score.</em>
        <div class="fit-def">${escapeHtml(FIT_INDEX_DEFINITION)}</div>`;
    } else {
      div.innerHTML = `No verdict fixture on file yet for this persona at this location.`;
    }
  }
  return div;
}

function buildScoreBar(store, loc, persona) {
  const div = document.createElement("div");
  const scoreRows = store.scoresByLocation.get(loc.location_id);
  // Any persona with real criterion fixtures gets their override shown here,
  // not just Waldo - see buildPersonaPanel's comment for why this used to
  // be Waldo-only and why that stopped being correct mid-session.
  const personaFixtures = persona ? store.fixturesByPersona.get(persona)?.get(loc.location_id)?.criteria : null;
  const personaLabel = persona ? persona.charAt(0).toUpperCase() + persona.slice(1) : "";
  const chips = store.criteria.map((crit) => {
    const scoreRow = scoreRows ? scoreRows.get(crit.criterion_id) : null;
    const fixtureRow = personaFixtures ? personaFixtures.get(crit.criterion_id) : null;
    let val, swatch, tag = "";
    if (fixtureRow) { val = Number(fixtureRow.expected); tag = ` (${personaLabel})`; }
    else if (scoreRow && scoreRow.status === "scored") { val = scoreRow.score; }
    else { val = null; }
    swatch = scoreToColor(val);
    return `<span class="criterion-chip"><span class="fit-swatch" style="background:${swatch}"></span>
      ${escapeHtml(crit.name)}: ${val != null ? val + "/5" : "gap"}${tag}</span>`;
  });
  div.innerHTML = `<h2>Criterion scores</h2><div class="criterion-scorebar">${chips.join("")}</div>`;
  return div;
}

function buildChangeEvents(store, loc, country) {
  const div = document.createElement("div");
  const events = [
    ...(store.changeEventsByLocation.get(loc.location_id) || []),
    ...(store.changeEventsByCountry.get(country.country_id) || []).filter((e) => !e.location_id),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!events.length) return div;
  div.innerHTML = `<h2>Recent change events</h2>` + events.map((ev) => `
    <div class="change-event sev-${ev.severity}">
      <strong>${escapeHtml(ev.date)}</strong> — ${escapeHtml(ev.headline)}
      <span class="badge">${ev.category}</span> <span class="badge">severity ${ev.severity}</span>
      ${ev.detail ? `<div class="fact-notes">${escapeHtml(ev.detail)}</div>` : ""}
    </div>`).join("");
  return div;
}

function buildSectionNav() {
  const div = document.createElement("nav");
  div.className = "section-nav";
  div.innerHTML = SECTION_ORDER.map((s) => `<a href="#sec-${s}">${SECTION_TITLES[s]}</a>`).join("");
  return div;
}

function buildSection(key, facts) {
  const section = document.createElement("section");
  section.id = `sec-${key}`;
  const title = SECTION_TITLES[key] || key;
  if (!facts.length) {
    section.innerHTML = `<h2>${title}</h2><p class="fact-notes">Not yet researched — a gap, not a claim that nothing is true here.</p>`;
    return section;
  }

  // Group visa-route facts (group_key) into route cards; everything else
  // renders as a plain fact item. Mechanical grouping only (schema §2's
  // visa_route view), no interpretation of what a route "means".
  const routeGroups = new Map();
  const plain = [];
  for (const f of facts) {
    if (f.group_key) {
      if (!routeGroups.has(f.group_key)) routeGroups.set(f.group_key, {});
      routeGroups.get(f.group_key)[f.group_role] = f;
    } else {
      plain.push(f);
    }
  }

  let html = `<h2>${title}</h2>`;
  if (routeGroups.size) {
    html += `<div class="fact-list">`;
    for (const [key2, group] of routeGroups) {
      const t = group.threshold;
      if (!t) continue;
      html += `<div class="fact-item">
        <div class="fact-label">${escapeHtml(t.fact_label)}</div>
        <div class="fact-value">${escapeHtml(formatValue(t))}</div>
        <div class="fact-meta">${confidenceBadge(t)} ${divergenceBadge(t)} ${sourceLine(t)}
          <span class="scope-tag">${escapeHtml(t.date || "")}</span></div>
        ${group.converts_to_pr ? `<div class="fact-notes">Converts to permanent residency: <strong>${escapeHtml(group.converts_to_pr.value_raw)}</strong></div>` : ""}
        ${group.accepts_passive_income ? `<div class="fact-notes">Accepts passive income: <strong>${escapeHtml(group.accepts_passive_income.value_raw)}</strong></div>` : ""}
        ${t.notes ? `<div class="fact-notes">${escapeHtml(t.notes)}</div>` : ""}
      </div>`;
    }
    html += `</div>`;
  }

  html += `<ul class="fact-list">` + plain.map((f) => `
    <li class="fact-item">
      <div class="fact-label">${escapeHtml(f.fact_label)}${f.scope === "sub-location" ? ` <span class="scope-tag">(${escapeHtml(f.scope_detail)})</span>` : ""}</div>
      <div class="fact-value">${escapeHtml(formatValue(f))}</div>
      <div class="fact-meta">${confidenceBadge(f)} ${divergenceBadge(f)} ${sourceLine(f)}
        <span class="scope-tag">${escapeHtml(f.date || "")}</span></div>
      ${f.notes ? `<div class="fact-notes">${escapeHtml(f.notes)}</div>` : ""}
    </li>`).join("") + `</ul>`;

  section.innerHTML = html;
  return section;
}

function buildSourcesSection(facts) {
  const section = document.createElement("section");
  section.id = "sec-sources";
  const seen = new Map();
  for (const f of facts) {
    if (f.value_raw === "[GAP]") continue;
    const key = f.source_url || `onfile:${f.source_ref || f.fact_label}`;
    if (!seen.has(key)) seen.set(key, f);
  }
  const rows = [...seen.values()];
  section.innerHTML = `<h2>Sources</h2>` + (rows.length
    ? `<ul class="fact-list">` + rows.map((f) => `
        <li class="fact-item">
          <div class="fact-value">${sourceLine(f)} ${confidenceBadge(f)} <span class="scope-tag">${escapeHtml(f.date || "")}</span></div>
        </li>`).join("") + `</ul>`
    : `<p class="fact-notes">No sources on file yet.</p>`);
  return section;
}

function buildNextBest(store, loc, persona) {
  const div = document.createElement("div");
  div.className = "next-best";
  const candidates = store.locations
    .filter((l) => l.location_id !== loc.location_id)
    .map((l) => {
      const idx = persona === "waldo" ? store.personaIndex("waldo", l.location_id) : store.generalIndex(l.location_id);
      return { l, val: idx ? idx.value : -1 };
    })
    .filter((c) => c.val >= 0)
    .sort((a, b) => b.val - a.val)
    .slice(0, 5);
  div.innerHTML = `<h2>Where now?</h2><p>Ranked next-best alternatives${persona === "waldo" ? " for Waldo" : ""}:</p>
    <ul>${candidates.map((c) => `<li><a href="${withPersona("location.html", { loc: c.l.location_id })}">
      ${escapeHtml(c.l.display_name)}</a> — ${c.val.toFixed(1)}/5</li>`).join("")}</ul>
    <p><a href="${withPersona("lists.html")}">Back to the full list</a> · <a href="${withPersona("index.html")}">Back to the map</a></p>`;
  return div;
}
