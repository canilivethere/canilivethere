// CanILiveThere — the Corrections & Changes page. The reading-order
// build for the separate Principles page is not part of this file.
//
// Renders derived/change-events.jsonl verbatim: this module authors zero
// facts and zero new copy. Every string a reader sees is either the
// approved page copy below (title, intro, column labels, empty state,
// closer — quoted verbatim from the approved copy deck) or a field
// straight from the data file itself (date, where, category, headline,
// detail). Same shared-shell pattern as every other page
// (applyStoredTheme/renderTopBar/renderFooter, no persona picker —
// change events aren't persona-specific, same reasoning as the criteria
// page carrying none).
//
// No new visual language invented: category renders with the existing
// .badge class, each row's left accent reuses the .sev-1/.sev-2/.sev-3
// border classes the per-location "Recent change events" section
// already established — one shared meaning for that color, not a second
// palette. Severity is always paired with its approved plain-English
// label alongside the color accent — color alone is never the only
// signal, same standing rule the confidence and divergence badges
// already follow on other pages.

import { loadStore } from "./data.js";
import { applyStoredTheme, renderTopBar, renderFooter, escapeHtml, withPersona } from "./app-shared.js";
import { siteUrl } from "./site-root.js";

applyStoredTheme();
renderTopBar("corrections");
main();

// Approved page copy, verbatim.
const INTRO_TEXT =
  "A relocation guide is a snapshot of a moving target — visa rules " +
  "shift, prices move, and a red flag can turn out to be smaller than it " +
  "looked, or bigger. This page is the dated record of exactly that: what " +
  "changed, what we found, and — when it happens — what we ourselves got " +
  "wrong. None of it gets quietly folded into an updated number somewhere " +
  "else on the site; it stays here, in order, with the date it happened.";

const EMPTY_STATE_TEXT =
  "Nothing to report right now. When something changes — a rule " +
  "tightens, a number moves, or we catch something we got wrong — it " +
  "shows up here, dated, the day we know it.";

const CLOSER_TEXT = "This list only grows. That's the point.";

// The data's own category enum is already plain English words (visa,
// stability, cost, property, safety, other) — this only capitalizes for
// render, matching the copy's own guidance that these values need no
// relabeling. Falls back to a bare capitalized copy of whatever string
// is actually on file for any category value not in this list, rather
// than hiding an unrecognized one.
const CATEGORY_LABEL = {
  visa: "Visa",
  stability: "Stability",
  cost: "Cost",
  property: "Property",
  safety: "Safety",
  other: "Other",
};

function categoryLabel(category) {
  if (CATEGORY_LABEL[category]) return CATEGORY_LABEL[category];
  if (!category) return "";
  return category.charAt(0).toUpperCase() + category.slice(1);
}

// The three approved visitor-facing severity labels, wordsmithed from
// the project's own reader-action definitions — never the bare number,
// never invented here. Falls back to a bare "Severity N" only for a
// value genuinely outside 1-3, so an unexpected row still shows *some*
// word rather than silently nothing.
const SEVERITY_LABEL = {
  3: "Act before you travel",
  2: "May affect your score",
  1: "Background note",
};

function severityLabel(severity) {
  if (SEVERITY_LABEL[severity]) return SEVERITY_LABEL[severity];
  return severity ? `Severity ${severity}` : "";
}

// "Where" reads correctly against a specific location or a whole country
// with one shared label — a location links to its own page (this site's
// "no dead ends" convention, same withPersona/siteUrl idiom the Lists
// page already uses for its own location links); a country-wide row has
// no location page to point to, so it renders as plain text, not a dead
// link.
function whereCell(store, ev) {
  if (ev.location_id) {
    const loc = store.locationsById.get(ev.location_id);
    if (loc) {
      return `<a href="${withPersona(siteUrl(`l/${loc.location_id}.html`))}">${escapeHtml(loc.display_name)}</a>`;
    }
    // Defensive only: every location_id on file is expected to resolve.
    return escapeHtml(ev.location_id);
  }
  const country = store.countriesById.get(ev.country_id);
  return escapeHtml(country ? country.name : ev.country_id);
}

function buildRow(store, ev) {
  const detailHtml = ev.detail ? `<div class="fact-notes">${escapeHtml(ev.detail)}</div>` : "";
  return `
    <tr class="change-event sev-${escapeHtml(String(ev.severity))}">
      <td>${escapeHtml(ev.date)}</td>
      <td>${whereCell(store, ev)}</td>
      <td><span class="badge">${escapeHtml(categoryLabel(ev.category))}</span></td>
      <td>${escapeHtml(severityLabel(ev.severity))}</td>
      <td><strong>${escapeHtml(ev.headline)}</strong>${detailHtml}</td>
    </tr>`;
}

async function main() {
  const store = await loadStore();
  renderFooter(store);

  document.getElementById("corrections-intro").textContent = INTRO_TEXT;
  document.getElementById("corrections-closer").textContent = CLOSER_TEXT;

  // Newest first — a changelog reads front-to-back as "most recent
  // first"; date strings are ISO (YYYY-MM-DD), so a plain string compare
  // sorts correctly with no date parsing needed.
  const events = [...store.changeEvents].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const table = document.getElementById("corrections-table");
  const tbody = document.getElementById("corrections-tbody");
  const emptyEl = document.getElementById("corrections-empty");

  if (events.length === 0) {
    table.hidden = true;
    emptyEl.hidden = false;
    emptyEl.textContent = EMPTY_STATE_TEXT;
    return;
  }

  tbody.innerHTML = events.map((ev) => buildRow(store, ev)).join("");
}
