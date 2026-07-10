import { loadStore, verdictHeadline } from "./data.js";
import { scoreToColor, SCALE_LEGEND, verdictVisual } from "./colors.js";
import { renderHeader, renderFooter, getPersona, withPersona, escapeHtml, FIT_INDEX_DEFINITION } from "./app-shared.js";
import { WORLD_VIEWBOX, COUNTRY_PATHS, PROJECTION } from "./worldmap-data.js";

// CanILiveThere's own country_id doesn't always equal a real ISO code — see
// worldmap-data.js's header comment. CR (Crete, an island region of Greece)
// is deliberately left unmapped so the choropleth never implies "all of
// Greece" was researched; Crete's two locations still render as accurately
// placed, accurately colored PINS (lat/lon is a real per-location fact).
const PROJECT_COUNTRY_TO_ISO = {
  GT: "GT", CO: "CO", MX: "MX", AR: "AR", PT: "PT",
  BZ: "BZ", MA: "MA", US: "US", TH: "TH", CR: null,
};

renderHeader("map");
main();

async function main() {
  const store = await loadStore();
  renderFooter(store);

  const root = document.getElementById("map-root");
  const persona = getPersona();

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("id", "worldmap");
  svg.setAttribute("viewBox", WORLD_VIEWBOX);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "World map, location pins colored by relocation fit");

  const defs = document.createElementNS(svgNS, "defs");
  defs.innerHTML = `
    <pattern id="hatch-eliminated" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
      <rect width="4" height="4" fill="#3a2a1a" />
      <line x1="0" y1="0" x2="0" y2="4" stroke="#f2e6d8" stroke-width="1.4" />
    </pattern>
  `;
  svg.appendChild(defs);

  // Per-country average index (for the choropleth base layer). Computed
  // via personaIndex(), which already falls back to the general index per-
  // criterion wherever a persona has no fixture override for it (see
  // data.js) - this line needs no persona-name branching, it's correct for
  // any current or future persona shape as-is.
  const countryAverages = new Map();
  for (const country of store.countries) {
    const locs = store.locations.filter((l) => l.country_id === country.country_id);
    const vals = locs
      .map((l) => (persona ? store.personaIndex(persona, l.location_id) : store.generalIndex(l.location_id)))
      .filter(Boolean)
      .map((r) => r.value);
    if (vals.length) countryAverages.set(country.country_id, vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  // Base layer: every country outline we have, neutral gray by default,
  // shaded only for CanILiveThere's own researched countries (and only
  // where the ISO mapping is unambiguous — see PROJECT_COUNTRY_TO_ISO).
  const isoToProjectCountry = new Map(
    Object.entries(PROJECT_COUNTRY_TO_ISO).filter(([, iso]) => iso).map(([pid, iso]) => [iso, pid])
  );
  for (const [iso, d] of Object.entries(COUNTRY_PATHS)) {
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "country-path");
    const projectId = isoToProjectCountry.get(iso);
    if (projectId && countryAverages.has(projectId)) {
      path.setAttribute("fill", scoreToColor(countryAverages.get(projectId)));
      const country = store.countriesById.get(projectId);
      path.setAttribute("data-country", projectId);
      const title = document.createElementNS(svgNS, "title");
      title.textContent = `${country.name}: country-average index ${countryAverages.get(projectId).toFixed(1)}/5`;
      path.appendChild(title);
    }
    svg.appendChild(path);
  }

  // Pin layer: exact per-location placement (real lat/lon), colored/marked
  // by fit. This is the layer that actually carries persona/elimination
  // meaning, since only Wenda/Carmen's verdict fixtures give us a real
  // pass/fail read at all (see the build notes on why Waldo has no
  // "eliminated" state to show).
  for (const loc of store.locations) {
    if (loc.lat == null || loc.lon == null) continue;
    const cx = PROJECTION.x(loc.lon);
    const cy = PROJECTION.y(loc.lat);
    const country = store.countriesById.get(loc.country_id);

    let fill, radius = 6, tooltip, eliminated = false;
    const general = store.generalIndex(loc.location_id);

    if (persona === "waldo") {
      const idx = store.personaIndex("waldo", loc.location_id);
      fill = scoreToColor(idx ? idx.value : null);
      tooltip = `${loc.display_name} (${country.name})\nWaldo's Fit index: ${idx ? idx.value.toFixed(1) : "n/a"}/5 (4 of 12 criteria are his own re-scored fixtures; the rest are the general scorecard)`;
    } else if (persona === "wenda" || persona === "carmen") {
      const displayName = persona.charAt(0).toUpperCase() + persona.slice(1);
      const perLoc = store.fixturesByPersona.get(persona)?.get(loc.location_id);
      const verdict = perLoc?.verdict;
      // Check for real criterion fixtures, not a hardcoded "always verification
      // pending" assumption - criterion-level data for Wenda/Carmen landed
      // concurrently with this build (see location.js's matching comment).
      // When it exists, use their real persona-adjusted index, same as
      // Waldo above.
      const hasCriterionFixtures = perLoc && perLoc.criteria && perLoc.criteria.size > 0;
      const idx = hasCriterionFixtures ? store.personaIndex(persona, loc.location_id) : null;
      const underlyingValue = idx ? idx.value : (general ? general.value : null);
      fill = scoreToColor(underlyingValue);
      if (verdict) {
        const headline = verdictHeadline(verdict.expected);
        const visual = verdictVisual(headline);
        if (visual.kind === "eliminated") { eliminated = true; }
        else { fill = visual.color; }
        const indexLabel = hasCriterionFixtures
          ? `${displayName}'s own re-scored Fit index shown underneath: ${underlyingValue != null ? underlyingValue.toFixed(1) : "n/a"}/5`
          : `General Fit index shown underneath: ${underlyingValue != null ? underlyingValue.toFixed(1) : "n/a"}/5 — criterion-level rescoring for this persona is verification pending, not yet done.`;
        tooltip = `${loc.display_name} (${country.name})\n${displayName}'s visa/elimination read: ${verdict.expected}\n(${indexLabel})`;
      } else {
        tooltip = `${loc.display_name} (${country.name}) — no verdict fixture on file for this persona yet.`;
      }
    } else {
      fill = scoreToColor(general ? general.value : null);
      tooltip = `${loc.display_name} (${country.name})\nGeneral Fit index: ${general ? general.value.toFixed(1) + "/5" : "not yet scored"}${general ? ` (weighted average of ${general.criteriaUsed}/${general.criteriaTotal} scored criteria)` : ""}`;
    }

    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", radius);
    circle.setAttribute("class", "location-pin" + (eliminated ? " eliminated" : ""));
    if (!eliminated) circle.setAttribute("fill", fill);
    circle.setAttribute("tabindex", "0");
    circle.setAttribute("role", "link");
    circle.setAttribute("aria-label", `${loc.display_name}, ${country.name}`);
    circle.dataset.tooltip = tooltip;
    circle.dataset.loc = loc.location_id;

    const go = () => { location.href = withPersona("location.html", { loc: loc.location_id }); };
    circle.addEventListener("click", go);
    circle.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    circle.addEventListener("mouseenter", (e) => showTip(e, tooltip));
    circle.addEventListener("focus", (e) => showTip(e, tooltip));
    circle.addEventListener("mouseleave", hideTip);
    circle.addEventListener("blur", hideTip);

    svg.appendChild(circle);
  }

  const wrap = document.createElement("div");
  wrap.className = "map-wrap";
  wrap.appendChild(svg);
  const tip = document.createElement("div");
  tip.className = "pin-label-tooltip";
  tip.id = "pin-tooltip";
  wrap.appendChild(tip);
  root.appendChild(wrap);

  function showTip(e, text) {
    const tipEl = document.getElementById("pin-tooltip");
    tipEl.textContent = text;
    tipEl.style.display = "block";
    const rect = wrap.getBoundingClientRect();
    const targetRect = e.target.getBoundingClientRect();
    tipEl.style.left = Math.max(0, targetRect.left - rect.left + 10) + "px";
    tipEl.style.top = Math.max(0, targetRect.top - rect.top - 10) + "px";
  }
  function hideTip() {
    const tipEl = document.getElementById("pin-tooltip");
    if (tipEl) tipEl.style.display = "none";
  }

  renderLegend(document.getElementById("map-legend"), persona);
  renderJudgmentNote(document.getElementById("map-judgment-note"));
}

function renderLegend(el, persona) {
  const scaleHtml = SCALE_LEGEND.map(
    (s) => `<span class="legend-swatch" style="background:${s.color}"></span>`
  ).join("");
  let extra = "";
  if (persona === "wenda" || persona === "carmen") {
    extra = `
      <span class="legend-item"><span class="legend-swatch" style="background:#1a7a3c"></span> Clears</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#e07b1a"></span> Near-miss / type-trap</span>
      <span class="legend-item"><span class="legend-hatch-demo"></span> Misses / categorical absence</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#9a9a9a"></span> Unverified</span>
    `;
  }
  el.innerHTML = `
    <div class="legend-scale">1 (weakest fit) ${scaleHtml} 5 (strongest fit)</div>
    <span>${escapeHtml(FIT_INDEX_DEFINITION)}</span>
    ${extra}
  `;
}

function renderJudgmentNote(el) {
  el.innerHTML = `
    <strong>Coordinate confidence (every pin, not a tooltip):</strong>
    every location's lat/lon is model-recalled public
    geodata (city-/town-center), not independently checked against a live
    gazetteer — fine for placing a pin on a world map, not survey-grade.
    Same caveat for all 24, uniformly; there's no per-location confidence
    field in the schema yet to render one differently from another (a
    real gap, noted for a future data revision).
    <br><br>
    <strong>Two more honest limits of this first map build:</strong>
    (1) The world outline is a real, licensed simplified political map, but
    only 10 of the site's countries are shaded — the rest is neutral
    context, not "no data implied to exist." Crete (CanILiveThere's "CR")
    is deliberately left unshaded as a country, since its two researched
    locations are on the island, not the Greek mainland — see pins, not the
    Greece polygon.
    (2) Only Wenda's and Carmen's verdict fixtures give a real
    clears/misses read; Waldo's map has no "eliminated" state to show yet,
    because no hard-constraint pass/fail has been computed for him — only
    his four re-scored criteria, which still blend into a continuous 1–5
    color, not a gone/not-gone one. Full detail in the build notes.
  `;
}
