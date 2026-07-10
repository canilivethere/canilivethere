import { loadStore, verdictHeadline } from "./data.js";
import { scoreToColor, verdictVisual } from "./colors.js";
import { renderHeader, renderFooter, getPersona, withPersona, escapeHtml } from "./app-shared.js";

renderHeader("lists");
main();

let STATE = { sortKey: "fit", sortDir: "desc", country: "" };

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

  render(store, persona);
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
  return `${displayName}'s visa/elimination verdict is shown per row (a real pass/fail read). No full criterion rescore exists for this persona yet — the fit-index column is the general (unpersonalized) figure, labeled as such, not padded to look persona-specific.`;
}

function buildRows(store, persona) {
  return store.locations
    .filter((loc) => !STATE.country || loc.country_id === STATE.country)
    .map((loc) => {
      const country = store.countriesById.get(loc.country_id);
      const general = store.generalIndex(loc.location_id);
      let fitValue = general ? general.value : null;
      let verdict = null;
      if (persona) {
        const perLoc = store.fixturesByPersona.get(persona)?.get(loc.location_id);
        if (perLoc && perLoc.criteria.size > 0) {
          const idx = store.personaIndex(persona, loc.location_id);
          fitValue = idx ? idx.value : null;
        }
        verdict = perLoc?.verdict || null;
      }
      return { loc, country, general, fitValue, verdict };
    });
}

function render(store, persona) {
  const rows = buildRows(store, persona);

  rows.sort((a, b) => {
    let av, bv;
    if (STATE.sortKey === "name") { av = a.loc.display_name; bv = b.loc.display_name; }
    else if (STATE.sortKey === "country") { av = a.country.name; bv = b.country.name; }
    else { av = a.fitValue ?? -1; bv = b.fitValue ?? -1; }
    if (av < bv) return STATE.sortDir === "asc" ? -1 : 1;
    if (av > bv) return STATE.sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const tbody = document.getElementById("rank-tbody");
  tbody.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    const fitCellHtml = row.fitValue != null
      ? `<span class="fit-swatch" style="background:${scoreToColor(row.fitValue)}"></span> ${row.fitValue.toFixed(1)}/5`
      : `<span class="fit-swatch" style="background:#e2e2e2"></span> not scored`;

    let verdictHtml = "";
    if (row.verdict) {
      const headline = verdictHeadline(row.verdict.expected);
      const v = verdictVisual(headline);
      verdictHtml = `<span class="verdict-chip" style="background:${v.color}">${escapeHtml(v.label)}</span>`;
    }

    tr.innerHTML = `
      <td><a href="${withPersona("location.html", { loc: row.loc.location_id })}">${escapeHtml(row.loc.display_name)}</a>
        <div class="scope-tag">${escapeHtml(row.loc.status)}</div></td>
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
  });
}

function buildBreakdown(store, row, persona) {
  const wrap = document.createElement("div");
  wrap.className = "breakdown-grid";
  const scoreRows = store.scoresByLocation.get(row.loc.location_id);
  const personaFixtures = persona ? store.fixturesByPersona.get(persona)?.get(row.loc.location_id)?.criteria : null;

  for (const crit of store.criteria) {
    const item = document.createElement("div");
    item.className = "breakdown-item";
    const scoreRow = scoreRows ? scoreRows.get(crit.criterion_id) : null;
    const fixtureRow = personaFixtures ? personaFixtures.get(crit.criterion_id) : null;

    let valueText, sourceTag = "";
    if (fixtureRow) {
      valueText = `${fixtureRow.expected}/5`;
      sourceTag = ` (${persona}'s own fixture)`;
    } else if (scoreRow && scoreRow.status === "scored") {
      valueText = `${scoreRow.score}/5`;
    } else if (scoreRow && scoreRow.status === "gap") {
      valueText = "GAP — not scored";
    } else {
      valueText = "no data";
    }
    item.innerHTML = `<strong>${escapeHtml(crit.name)}</strong> <span class="scope-tag">(${crit.weight_class})</span><br>${escapeHtml(valueText)}${sourceTag}`;
    wrap.appendChild(item);
  }

  if (row.verdict) {
    const item = document.createElement("div");
    item.className = "breakdown-item";
    const displayName = persona.charAt(0).toUpperCase() + persona.slice(1);
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
