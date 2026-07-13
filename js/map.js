import { loadStore, verdictHeadline, topBottomCriteria } from "./data.js";
import { scoreToColor, getScaleLegend, verdictVisual, clearsColor, eliminatedColor, CONDITIONAL_COLOR, PENDING_COLOR } from "./colors.js";
import {
  applyStoredTheme, renderTopBar, renderPersonaSlot,
  renderFooter, getPersona, withPersona, escapeHtml,
  FIT_INDEX_DEFINITION, fitBandWord, isActivationKey,
  BAND_ORDER, BAND_LABEL,
} from "./app-shared.js";
import { WORLD_VIEWBOX, COUNTRY_PATHS, PROJECTION } from "./worldmap-data.js";

// v6 addendum R1/R4: one shared radius/halo pair, read by both the pin loop
// below (the actual rendered circle) and computeMapViewBox() (the padding
// floor) — a single source so the two can never silently drift apart the
// way the spec's own "7+2=9" arithmetic assumes they won't.
const PIN_RADIUS = 7;
const PIN_HALO = 2;

// CanILiveThere's own country_id doesn't always equal a real ISO code — see
// worldmap-data.js's header comment. CR (Crete, an island region of Greece)
// is deliberately left unmapped so the choropleth never implies "all of
// Greece" was researched; Crete's two locations still render as accurately
// placed, accurately colored PINS (lat/lon is a real per-location fact).
const PROJECT_COUNTRY_TO_ISO = {
  GT: "GT", CO: "CO", MX: "MX", AR: "AR", PT: "PT",
  BZ: "BZ", MA: "MA", US: "US", TH: "TH", CR: null,
  AL: "AL", BG: "BG", EC: "EC", EG: "EG", ES: "ES",
  ID: "ID", IN: "IN", MY: "MY", PY: "PY", VN: "VN", ZA: "ZA",
};

applyStoredTheme();
renderTopBar("map");
renderPersonaSlot(document.getElementById("persona-slot"), getPersona());
main();

async function main() {
  const store = await loadStore();
  renderFooter(store);
  document.getElementById("fit-def-caption").textContent = FIT_INDEX_DEFINITION;

  const root = document.getElementById("map-root");
  const persona = getPersona();

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("id", "worldmap");
  // v6 addendum R1: framed to the pin extent, not the whole world — see
  // computeMapViewBox() below. #worldmap keeps height:auto (style.css), no
  // aspect forced here, so the box's own shape drives the rendered ratio.
  svg.setAttribute("viewBox", computeMapViewBox(store));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "World map, location pins colored by relocation fit");

  const defs = document.createElementNS(svgNS, "defs");
  defs.innerHTML = `
    <pattern id="hatch-eliminated" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
      <rect width="4" height="4" fill="${eliminatedColor()}" />
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

  // v6 addendum R4: the site's first pure ornament — Ormen Lange, open
  // North Atlantic, ahead of the pin layer so a pin can never render under
  // it even though their coordinates don't collide today. Not an input to
  // computeMapViewBox() above (ornament, not a location) and not part of
  // the persona-branch loop below (never interactive, never re-colored).
  renderOrmenLange(svg, svgNS);

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

    // v4 addendum R3 §3.4: radius 6 -> 7, a small proportional bump — the
    // halo ring itself is CSS-only (.location-pin's stroke, style.css).
    // PIN_RADIUS is the same constant computeMapViewBox() pads against
    // above, so the two can't silently drift apart.
    let fill, radius = PIN_RADIUS, tooltip, eliminated = false;

    // Tooltip voice (v2 addendum §4): a one-line human
    // answer leads every tooltip, built only from data already computed —
    // the existing numeric Fit-index detail below follows it, kept in
    // full, never removed (disclosure-hierarchy discipline: it recedes to
    // second line, not to zero).
    if (persona === "waldo") {
      const idx = store.personaIndex("waldo", loc.location_id);
      fill = scoreToColor(idx ? idx.value : null);
      const headline = buildFitHeadline(store, "waldo", loc, country, idx ? idx.value : null);
      // v6 plain-language pass, item 2: "fixtures"/"scorecard" (dev/vault
      // terms) drop; "recalculated for Waldo"/"use the general score" name
      // the same fact in reader-facing words.
      tooltip = `${headline}\nWaldo's Fit index: ${idx && idx.value != null ? idx.value.toFixed(1) : "n/a"}/5 (4 of 13 criteria are recalculated for Waldo; the rest use the general score)`;
    } else if (persona === "wenda" || persona === "carmen") {
      const general = store.generalIndex(loc.location_id);
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
        const vHeadline = verdictHeadline(verdict.expected);
        const visual = verdictVisual(vHeadline);
        if (visual.kind === "eliminated") { eliminated = true; }
        else { fill = visual.color; }
        // v6 plain-language pass, item 5: "verification pending, not yet
        // done" retired — it collided with the unrelated confidence tier
        // "Unverified" (v1 §3.3's already-named collision class). One word
        // flagged as a deliberate, non-silent deviation from the addendum's
        // own quoted fragment: "hasn't" not "haven't" — the subject here
        // ("criterion-level rescoring") is singular, and shipping a
        // subject-verb disagreement would trade one readability problem for
        // another on a page this project's own craft standard holds to
        // plain, correct language.
        const indexLabel = hasCriterionFixtures
          ? `${displayName}'s own re-scored Fit index shown underneath: ${underlyingValue != null ? underlyingValue.toFixed(1) : "n/a"}/5`
          : `General Fit index shown underneath: ${underlyingValue != null ? underlyingValue.toFixed(1) : "n/a"}/5 — criterion-level rescoring for this persona hasn't been checked yet, so this is the general number.`;
        // §4.2: the fixture's own already-computed verdictHeadline() string,
        // unchanged — no new text authored, a render-surface change only.
        // v6 plain-language pass, item 4: "visa/elimination read" ->
        // "visa check" — drops "elimination" and "read"-as-noun.
        const headline = `${loc.display_name}, ${country.name} — ${vHeadline}.`;
        tooltip = `${headline}\n${displayName}'s visa check: ${verdict.expected}\n(${indexLabel})`;
      } else {
        // v6 plain-language pass, item 3: "no verdict fixture on file for
        // this persona yet" -> "not checked yet for this persona" — the
        // canonical band word (v4 §1.2 / BAND_LABEL["not-checked"]), not a
        // fourth phrasing for the same state.
        tooltip = `${loc.display_name}, ${country.name} — not checked yet for this persona.`;
      }
    } else {
      const general = store.generalIndex(loc.location_id);
      fill = scoreToColor(general ? general.value : null);
      const headline = buildFitHeadline(store, null, loc, country, general ? general.value : null);
      tooltip = `${headline}\nGeneral Fit index: ${general ? general.value.toFixed(1) + "/5" : "not yet scored"}${general ? ` (weighted average of ${general.criteriaUsed}/${general.criteriaTotal} scored criteria)` : ""}`;
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
    circle.addEventListener("keydown", (e) => { if (isActivationKey(e)) { e.preventDefault(); go(); } });
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

// v6 addendum R1: the map's viewBox, framed to the current pin extent
// instead of the whole world — a touch more within reach, no
// Greenland/North Pole dead space above the northernmost real candidate.
// Reads the FULL 38-location set every call, unfiltered by persona, so the
// crop never shifts on a persona pick (§R1.1) — and this is also the
// literal mechanism by which a future Longyearbyen pin (~78N) widens the
// frame on its own next render, no code change beyond the new location
// row (the addendum's own "waiting is free" claim).
function computeMapViewBox(store) {
  const pts = store.locations
    .filter((l) => l.lat != null && l.lon != null)
    .map((l) => ({ x: PROJECTION.x(l.lon), y: PROJECTION.y(l.lat) }));
  // Degenerate fallback only — never expected with real data (38/38
  // locations carry lat/lon today), but a bare crash on an empty set would
  // be worse than falling back to the full world.
  if (!pts.length) return WORLD_VIEWBOX;

  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));

  // §R1.3: pad every edge by at least the largest pin's radius+halo x 3
  // (pins never sit flush to the edge) PLUS a term proportional to the
  // box's own span, so a small future cluster still gets breathing room —
  // the spec leaves the exact percentage to builder judgment. 6% chosen:
  // generous enough that a tight regional cluster (e.g. today's Guatemala
  // pair) doesn't feel cropped, small enough that it doesn't reintroduce
  // real dead space at the box's current ~519x209-unit size. Additive, not
  // a max() with the fixed floor — "at least X plus Y" read as both terms
  // always applying, not one superseding the other.
  const FIXED_PAD = (PIN_RADIUS + PIN_HALO) * 3;
  const PROPORTIONAL_PAD_PCT = 0.06;
  const spanX = maxX - minX, spanY = maxY - minY;
  const padX = FIXED_PAD + spanX * PROPORTIONAL_PAD_PCT;
  const padY = FIXED_PAD + spanY * PROPORTIONAL_PAD_PCT;

  let boxMinX = minX - padX, boxMaxX = maxX + padX;
  let boxMinY = minY - padY, boxMaxY = maxY + padY;

  // §R1.4: clamp to WORLD_VIEWBOX — always a strict subset, never wider
  // than the world the underlying map asset actually draws.
  const [wx, wy, ww, wh] = WORLD_VIEWBOX.split(/\s+/).map(Number);
  const worldMinX = wx, worldMaxX = wx + ww, worldMinY = wy, worldMaxY = wy + wh;
  boxMinX = Math.max(worldMinX, boxMinX);
  boxMinY = Math.max(worldMinY, boxMinY);
  boxMaxX = Math.min(worldMaxX, boxMaxX);
  boxMaxY = Math.min(worldMaxY, boxMaxY);

  return `${boxMinX} ${boxMinY} ${boxMaxX - boxMinX} ${boxMaxY - boxMinY}`;
}

// v6 addendum R4: Ormen Lange — the site's first pure ornament, asserting
// no fact, citing no source, carrying no confidence tier (exempt from
// the why/instead render contract by construction, since that contract
// governs hard verdicts and this ship claims nothing). Reviewed and
// cleared as non-blocking: "a rounder
// hull, no visible shields" — a voyaging silhouette, not the historical
// warship's dragon-prow/shield-rack read, since this flock carries spirits
// specifically fleeing armed conflict.
function renderOrmenLange(svg, svgNS) {
  const g = document.createElementNS(svgNS, "g");
  g.setAttribute("class", "ormen-lange");
  // aria-hidden, no role/tabindex, no <title>/data-tooltip, no fill — pure
  // decoration per the render contract; pointer-events:none lives in CSS
  // (style.css), not inline, matching this file's own styling convention.
  g.setAttribute("aria-hidden", "true");

  // Placement: open North Atlantic, west of the Iberian pin cluster, south
  // of the British Isles — no coastline crossing at this resolution, and
  // inside R1's post-crop viewBox for the current pin set (verified:
  // computeMapViewBox() above returns roughly x:[118,721] y:[390,653] for
  // today's 38 locations; this point sits well inside both ranges).
  const cx = PROJECTION.x(-20);
  const cy = PROJECTION.y(45);

  // Line-art longship, drawn in a local 0..40 x 0..20 box then centered on
  // (cx, cy) via translate — hull (closed outline, stroked not filled),
  // one mast, one short yard; no dragon head, no shield rack.
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d",
    "M2,14 Q4,18 11,16.5 Q20,18.5 29,16.5 Q36,18 38,14 " +
    "Q35,11.5 29,12.5 Q20,10.5 11,12.5 Q4,11.5 2,14 Z " +
    "M20,12.5 L20,2 M14,5 L26,5"
  );
  path.setAttribute("fill", "none");
  g.appendChild(path);
  g.setAttribute("transform", `translate(${cx - 20}, ${cy - 10})`);
  svg.appendChild(g);
}

// Tooltip voice (v2 addendum §4): the "strength / catch" headline shared
// by the Waldo and general pin branches — one call into topBottomCriteria/
// fitBandWord instead of each branch re-deriving the same string.
function buildFitHeadline(store, personaId, loc, country, value) {
  const tb = topBottomCriteria(store, personaId, loc.location_id);
  const band = fitBandWord(value);
  return tb && tb.top.criterion_id !== tb.bottom.criterion_id
    ? `${loc.display_name}, ${country.name} — ${band}; ${tb.top.name} is a strength, ${tb.bottom.name} is the catch.`
    : `${loc.display_name}, ${country.name} — ${band}.`;
}

// v6 addendum R2's color-for-band lookup for the persona legend — the
// hatch-demo swatch (doesn't-clear/eliminated) is a distinct markup shape
// from the plain color swatches, so it's branched below rather than
// forced into this map.
const BAND_LEGEND_COLOR = {
  clears: () => clearsColor(),
  "near-miss": () => CONDITIONAL_COLOR,
  "not-checked": () => PENDING_COLOR,
};

function renderLegend(el, persona) {
  // Re-read the theme-appropriate ramp/colors at render time (not cached),
  // so this legend is always correct for the current light/dark mode.
  //
  // v6 addendum §2.3: five named, ordinally-labeled steps replace the old
  // unlabeled swatch strip — each stop gets its own `.legend-step` (swatch
  // + name); in dark mode getScaleLegend() withholds `name` (see that
  // function's own comment), so the step renders swatch-only there rather
  // than a wrong color word.
  const scaleHtml = getScaleLegend().map(
    (s) => `<span class="legend-step"><span class="legend-swatch" style="background:${s.color}"></span>${s.name ? ` ${escapeHtml(s.name)}` : ""}</span>`
  ).join("");
  let extra = "";
  if (persona === "wenda" || persona === "carmen") {
    // v6 plain-language pass, item 1: "Near-miss / type-trap" and
    // "Misses / categorical absence" were internal vocabulary leaking to a
    // reader — reusing the shipped BAND_LABEL registry (app-shared.js,
    // moved here from lists.js by this same addendum) retires both and
    // keeps this legend's words identical to the Lists page's own group
    // headers for the same states. "unclassified" is deliberately excluded
    // — a build-time registry-gap signal, never a reader-facing legend
    // entry (v4 §1.3 / v5 §3.8).
    extra = BAND_ORDER.filter((b) => b !== "unclassified").map((band) => {
      if (band === "doesnt-clear") {
        return `<span class="legend-item"><span class="legend-hatch-demo"></span> ${escapeHtml(BAND_LABEL[band])}</span>`;
      }
      const color = BAND_LEGEND_COLOR[band]();
      return `<span class="legend-item"><span class="legend-swatch" style="background:${color}"></span> ${escapeHtml(BAND_LABEL[band])}</span>`;
    }).join("");
  }
  el.innerHTML = `
    <div class="legend-scale">1 — weakest fit ${scaleHtml} 5 — strongest fit</div>
    <span>${escapeHtml(FIT_INDEX_DEFINITION)}</span>
    ${extra}
  `;
}

function renderJudgmentNote(el) {
  // v6 Amendment 1, §A1: plain-language rewrite of the coordinate-
  // confidence note — drops "model-recalled public geodata," "gazetteer,"
  // "survey-grade," "schema" (dev/vault vocabulary a stranger reading this
  // page has no reason to know). Same claim, same "every location gets the
  // same treatment" honesty, no new fact asserted.
  el.innerHTML = `
    <strong>Pin locations are approximate</strong> — good enough to place a
    dot on the map, not for door-to-door navigation. Every location gets
    the same treatment; more precision may come later.
    <br><br>
    <strong>Two more honest limits of this first map build:</strong>
    (1) The world outline is a real, licensed simplified political map, but
    only the site's own researched countries are shaded — the rest is
    neutral context, not "no data implied to exist." Crete (CanILiveThere's
    "CR") is deliberately left unshaded as a country, since its two
    researched locations are on the island, not the Greek mainland — see
    pins, not the Greece polygon.
    (2) Only Wenda's and Carmen's verdict fixtures give a real
    clears/misses read; Waldo's map has no "eliminated" state to show yet,
    because no hard-constraint pass/fail has been computed for him — only
    his four re-scored criteria, which still blend into a continuous 1–5
    color, not a gone/not-gone one. Full detail in the build notes.
  `;
}
