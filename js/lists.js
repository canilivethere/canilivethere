import { loadStore, verdictHeadline } from "./data.js";
import { scoreToColor, verdictVisual } from "./colors.js";
import {
  renderHeader, renderFooter, getPersona, withPersona, escapeHtml,
  FIT_INDEX_DEFINITION, WEIGHT_CLASS_LABEL,
} from "./app-shared.js";

renderHeader("lists");
main();

let STATE = { sortKey: "fit", sortDir: "desc", country: "", purposeCriterion: null };

// Purpose lists (v2 addendum §3): "Pick what matters most", built
// entirely over already-shipped data (criteria.jsonl + scores.jsonl) —
// no new research, no new facts. The three featured views use a
// specific requested order, not an arbitrary one: easiest visa, money
// goes furthest, best property access. The blended Fit index stays the
// default/first option, not replaced.
const FEATURED_CRITERIA = [
  { criterion_id: "visa-legal-pathway-ease", label: "Easiest visa" },
  { criterion_id: "cost-of-living-affordability", label: "Money goes furthest" },
  { criterion_id: "land-property-access", label: "Best property access" },
];

async function main() {
  const store = await loadStore();
  renderFooter(store);
  const persona = getPersona();

  const countrySelect = document.getElementById("country-filter");
  countrySelect.innerHTML =
    `<option value="">All countries</option>` +
    store.countries
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `<option value="${c.country_id}">${escapeHtml(c.name)}</option>`)
      .join("");
  countrySelect.addEventListener("change", () => {
    STATE.country = countrySelect.value;
    render(store, persona);
  });

  document.getElementById("persona-context").textContent = persona
    ? personaContextLine(store, persona)
    : "Unpersonalized general ranking — the same 12-criterion weighted index shown on the map.";
  document.getElementById("fit-def-caption").textContent = FIT_INDEX_DEFINITION;

  renderPurposeSelector(store, persona);
  render(store, persona);
}

function renderPurposeSelector(store, persona) {
  const el = document.getElementById("purpose-lists");
  const featuredIds = new Set(FEATURED_CRITERIA.map((f) => f.criterion_id));
  // "All twelve, always reachable" (§3.3): the remaining nine criteria,
  // sorted by the schema's own display_order, not re-ordered here.
  const moreCriteria = store.criteria.filter((c) => !featuredIds.has(c.criterion_id));

  const chipHtml = (id, label, active) =>
    `<button type="button" class="btn-chip purpose-chip${active ? " active" : ""}" data-purpose="${id || ""}">${escapeHtml(label)}</button>`;

  el.innerHTML =
    chipHtml("", "Blended Fit index", !STATE.purposeCriterion) +
    FEATURED_CRITERIA.map((f) => chipHtml(f.criterion_id, f.label, STATE.purposeCriterion === f.criterion_id)).join("") +
    `<select class="purpose-more" id="purpose-more">
      <option value="">More…</option>
      ${moreCriteria.map((c) => `<option value="${c.criterion_id}"${STATE.purposeCriterion === c.criterion_id ? " selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
    </select>`;

  // No-op guard: clicking the already-active chip (or re-selecting the
  // same "More…" option) shouldn't discard and rebuild this whole subtree
  // and re-render the table for a selection that hasn't actually changed.
  const setPurpose = (value) => {
    if (STATE.purposeCriterion === value) return;
    STATE.purposeCriterion = value;
    renderPurposeSelector(store, persona);
    render(store, persona);
  };
  el.querySelectorAll(".purpose-chip").forEach((btn) => {
    btn.addEventListener("click", () => setPurpose(btn.dataset.purpose || null));
  });
  el.querySelector("#purpose-more").addEventListener("change", (e) => setPurpose(e.target.value || null));

  updatePurposeExplainer(store);
}

// One-line explanation per view, template not hand-written per criterion
// (§3.5): the bracketed clause is picked mechanically off criteria.jsonl's
// own `kind` field, the same "gloss the field, don't invent content" move
// as the confidence/weight_class glosses elsewhere on this site.
function updatePurposeExplainer(store) {
  const el = document.getElementById("purpose-explainer");
  if (!STATE.purposeCriterion) {
    el.textContent = "Sorted by the blended Fit index — a weighted average across all 12 scored criteria, for every researched location.";
    return;
  }
  const crit = store.criteriaById.get(STATE.purposeCriterion);
  if (!crit) return;
  const clause = crit.kind === "threshold-shaped"
    ? "how comfortably a place clears this, not just a number"
    : "how strong this factor is here";
  el.textContent = `Sorted by ${crit.name} — ${clause}, for every researched location.`;
}

// The "fit" column header's own label, owned by render()'s th[data-sort]
// loop below rather than by updatePurposeExplainer() reaching into markup
// it doesn't own.
function fitColumnLabel(store) {
  if (!STATE.purposeCriterion) return "Fit index";
  const crit = store.criteriaById.get(STATE.purposeCriterion);
  return crit ? crit.name : "Fit index";
}

function personaContextLine(store, persona) {
  const displayName = persona.charAt(0).toUpperCase() + persona.slice(1);
  // Check whether real criterion fixtures exist anywhere for this persona,
  // not a hardcoded "waldo" name check - Wenda/Carmen only had verdict
  // fixtures when this file was first written, but criterion-level data
  // for them can land at any time (it already did once, concurrently with
  // this build). See data.js's personaIndex/fixturesByPersona.
  const anyCriterionFixtures = [...(store.fixturesByPersona.get(persona)?.values() || [])]
    .some((entry) => entry.criteria.size > 0);
  if (anyCriterionFixtures) {
    return `${displayName}'s ranking uses their own re-scored fixture criteria where available; any remaining gaps fall back to the general scorecard, labeled per row.`;
  }
  return `${displayName}'s visa/elimination verdict is shown per row (a real pass/fail read). No full criterion rescore exists for this persona yet — the Fit index column is the general (unpersonalized) figure, labeled as such, not padded to look persona-specific.`;
}

function buildRows(store, persona) {
  return store.locations
    .filter((loc) => !STATE.country || loc.country_id === STATE.country)
    .map((loc) => {
      const country = store.countriesById.get(loc.country_id);
      const general = store.generalIndex(loc.location_id);
      let fitValue = general ? general.value : null;
      let verdict = null;
      // null = no persona selected (the question doesn't apply); true = a
      // real persona-adjusted figure; false = a persona is selected but this
      // row has no rescore, so the general figure is shown as a fallback —
      // the page's own promise ("labeled per row") that this flag exists to
      // honor in the render below.
      let personaAdjusted = null;
      if (persona) {
        const perLoc = store.fixturesByPersona.get(persona)?.get(loc.location_id);
        if (perLoc && perLoc.criteria.size > 0) {
          const idx = store.personaIndex(persona, loc.location_id);
          fitValue = idx ? idx.value : null;
          personaAdjusted = true;
        } else {
          personaAdjusted = false;
        }
        verdict = perLoc?.verdict || null;
      }
      // Purpose-list score (§3): a straight read of scores.jsonl for the
      // one criterion currently selected, independent of persona — the
      // view changes what the table is sorted/shown by, not which rows
      // exist or how the blended Fit index itself is computed.
      let purposeScore = null;
      if (STATE.purposeCriterion) {
        const row = store.scoresByLocation.get(loc.location_id)?.get(STATE.purposeCriterion);
        purposeScore = row && row.status === "scored" && row.score != null ? row.score : null;
      }
      return { loc, country, general, fitValue, verdict, personaAdjusted, purposeScore };
    });
}

function render(store, persona) {
  const rows = buildRows(store, persona);

  rows.sort((a, b) => {
    let av, bv;
    if (STATE.sortKey === "name") { av = a.loc.display_name; bv = b.loc.display_name; }
    else if (STATE.sortKey === "country") { av = a.country.name; bv = b.country.name; }
    // Purpose-list sort (§3.4): the "fit" column's sort key is a straight
    // sort of the selected criterion's own score, descending, replacing
    // the blended Fit index as the sort key while a purpose is active —
    // no locations are filtered out, only the sort/display value changes.
    else if (STATE.purposeCriterion) { av = a.purposeScore ?? -1; bv = b.purposeScore ?? -1; }
    else { av = a.fitValue ?? -1; bv = b.fitValue ?? -1; }
    if (av < bv) return STATE.sortDir === "asc" ? -1 : 1;
    if (av > bv) return STATE.sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const tbody = document.getElementById("rank-tbody");
  tbody.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    const fallbackTag = row.personaAdjusted === false && !STATE.purposeCriterion
      ? ` <span class="scope-tag">(no rescore for this persona yet — general figure shown)</span>`
      : "";
    // While a purpose view is active, the column shows that criterion's own
    // score directly — the whole point of §3 is answering "just the visa
    // question" (etc.) without opening the breakdown row to find the number.
    const displayValue = STATE.purposeCriterion ? row.purposeScore : row.fitValue;
    const fitCellHtml = displayValue != null
      ? `<span class="fit-swatch" style="background:${scoreToColor(displayValue)}"></span> ${displayValue.toFixed(1)}/5${fallbackTag}`
      : `<span class="fit-swatch" style="background:${scoreToColor(displayValue)}"></span> not scored`;

    let verdictHtml = "";
    if (row.verdict) {
      const headline = verdictHeadline(row.verdict.expected);
      const v = verdictVisual(headline);
      verdictHtml = `<span class="verdict-chip" style="background:${v.color}">${escapeHtml(v.label)}</span>`;
    }

    tr.innerHTML = `
      <td><a href="${withPersona("location.html", { loc: row.loc.location_id })}">${escapeHtml(row.loc.display_name)}</a></td>
      <td>${escapeHtml(row.country.name)}</td>
      <td class="rank-fit-cell">${fitCellHtml}</td>
      <td>${verdictHtml}</td>
      <td><button class="expand-toggle" aria-expanded="false">breakdown</button></td>
    `;
    tbody.appendChild(tr);

    const expandTr = document.createElement("tr");
    expandTr.className = "expand-row";
    expandTr.style.display = "none";
    const td = document.createElement("td");
    td.colSpan = 5;
    td.appendChild(buildBreakdown(store, row, persona));
    expandTr.appendChild(td);
    tbody.appendChild(expandTr);

    tr.querySelector(".expand-toggle").addEventListener("click", (e) => {
      const open = expandTr.style.display !== "none";
      expandTr.style.display = open ? "none" : "table-row";
      e.target.setAttribute("aria-expanded", String(!open));
      e.target.textContent = open ? "breakdown" : "hide";
    });
  }

  document.querySelectorAll("th[data-sort]").forEach((th) => {
    const key = th.dataset.sort;
    th.removeAttribute("aria-sort");
    if (STATE.sortKey === key) th.setAttribute("aria-sort", STATE.sortDir === "asc" ? "ascending" : "descending");
    if (key === "fit") th.textContent = fitColumnLabel(store);
  });
}

function buildBreakdown(store, row, persona) {
  const wrap = document.createElement("div");
  wrap.className = "breakdown-grid";
  const scoreRows = store.scoresByLocation.get(row.loc.location_id);
  const personaFixtures = persona ? store.fixturesByPersona.get(persona)?.get(row.loc.location_id)?.criteria : null;
  // Capitalized once, reused everywhere this function needs to name the
  // persona in prose — the same display-name convention every other call
  // site in this file already applies (personaContextLine, the verdict item
  // below), rather than rendering the raw lowercase URL-param slug.
  const displayName = persona ? persona.charAt(0).toUpperCase() + persona.slice(1) : "";

  for (const crit of store.criteria) {
    const item = document.createElement("div");
    item.className = "breakdown-item";
    const scoreRow = scoreRows ? scoreRows.get(crit.criterion_id) : null;
    const fixtureRow = personaFixtures ? personaFixtures.get(crit.criterion_id) : null;

    let valueText, sourceTag = "";
    if (fixtureRow) {
      valueText = `${fixtureRow.expected}/5`;
      sourceTag = ` (${displayName}'s own fixture)`;
    } else if (scoreRow && scoreRow.status === "scored") {
      valueText = `${scoreRow.score}/5`;
    } else if (scoreRow && scoreRow.status === "gap") {
      valueText = "Not scored yet";
    } else {
      valueText = "no data";
    }
    const weightLabel = WEIGHT_CLASS_LABEL[crit.weight_class] || crit.weight_class;
    item.innerHTML = `<strong>${escapeHtml(crit.name)}</strong> <span class="scope-tag">(${escapeHtml(weightLabel)})</span><br>${escapeHtml(valueText)}${sourceTag}`;
    wrap.appendChild(item);
  }

  if (row.verdict) {
    const item = document.createElement("div");
    item.className = "breakdown-item";
    item.innerHTML = `<strong>${displayName}'s visa/elimination read</strong><br>${escapeHtml(row.verdict.expected)}`;
    wrap.appendChild(item);
  }
  return wrap;
}

document.addEventListener("click", (e) => {
  const th = e.target.closest("th[data-sort]");
  if (!th) return;
  const key = th.dataset.sort;
  if (STATE.sortKey === key) STATE.sortDir = STATE.sortDir === "asc" ? "desc" : "asc";
  else { STATE.sortKey = key; STATE.sortDir = key === "name" || key === "country" ? "asc" : "desc"; }
  loadStore().then((store) => render(store, getPersona()));
});
