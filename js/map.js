import { loadStore, verdictHeadline } from "./data.js";
import { scoreToColor, getScaleLegend, verdictVisual, clearsColor, eliminatedColor, CONDITIONAL_COLOR, PENDING_COLOR } from "./colors.js";
import {
  applyStoredTheme, renderTopBar, renderPersonaSlot,
  renderFooter, getPersona, withPersona, escapeHtml,
  FIT_INDEX_DEFINITION, buildFitHeadline, isActivationKey,
  BAND_ORDER, BAND_LABEL,
} from "./app-shared.js";
import { WORLD_VIEWBOX, COUNTRY_PATHS, PROJECTION } from "./worldmap-data.js";
import { siteUrl } from "./site-root.js";
import { initPerspectiveDoor } from "./perspective-door.js";

// v6 addendum R1/R4: one shared radius/halo pair, read by both the pin loop
// below (the actual rendered circle) and computeViewBoxForLocations() (the
// padding floor) — a single source so the two can never silently drift
// apart the way the spec's own "7+2=9" arithmetic assumes they won't.
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
// v7 Part 10: index.html-only by construction (this is the one page that
// imports this module) — decides on its own whether to show, this call
// site doesn't branch on anything.
initPerspectiveDoor();
main();

// ---------------------------------------------------------------------
// v7 Part 13: the purpose-lens plug-in contract.
//   { id, label, valueForLocation(location_id) -> number 1-5 | null, explainerText }
// Generalizes the prior ad hoc FEATURED_CRITERIA shape (a criterion_id +
// label pair, read directly off scores.jsonl inline in the render code)
// so a future scored lens plugs in with zero new UI the moment a real
// valueForLocation exists. Dog-friendly and family are explicitly NOT
// built here — routed, not resolved, per Part 13's own no-invented-
// scoring-method rule; no disabled/"coming soon" chip either (a chip that
// doesn't work is a dead promise, the exact shape v5's no-bare-no
// discipline exists to prevent).
// ---------------------------------------------------------------------

// A criterion-backed lens's valueForLocation is a one-line scores.jsonl
// lookup — the same read every criterion on this site already resolves
// through; nothing stops a future composite lens's valueForLocation from
// being any other function returning the same 1-5-or-null shape.
function criterionLens(store, criterionId, label) {
  const crit = store.criteriaById.get(criterionId);
  const displayLabel = label || (crit ? crit.name : criterionId);
  return {
    id: criterionId,
    label: displayLabel,
    valueForLocation(locationId) {
      const row = store.scoresByLocation.get(locationId)?.get(criterionId);
      return row && row.status === "scored" && row.score != null ? row.score : null;
    },
    explainerText: `Pins colored by ${displayLabel} alone, general figures — this view ignores any persona pick above.`,
  };
}

// The two lenses Part 13 confirms as already-built and spec-compliant
// (easiest visa, money goes furthest), folded into this build as-is.
// "Best property access" was already a third entry in this array before
// this change (ported from lists.js's own FEATURED_CRITERIA) — it's
// not one of Part 13's four named purpose lenses, but it's already a
// working, criterion-backed lens with no reason to drop it.
function buildFeaturedLenses(store) {
  return [
    criterionLens(store, "visa-legal-pathway-ease", "Easiest visa"),
    criterionLens(store, "cost-of-living-affordability", "Money goes furthest"),
    criterionLens(store, "land-property-access", "Best property access"),
  ];
}

// A "More…" pick (any of the other ten criteria, not one of the three
// featured chips above) resolves to an ad hoc lens built the same way,
// on demand — so every criterion on this site, not just the three
// chips, colors the map through the exact same one code path.
function resolveLens(store, lenses, lensId) {
  if (!lensId) return null;
  return lenses.find((l) => l.id === lensId) || criterionLens(store, lensId);
}

// ---------------------------------------------------------------------
// v7 Part 9: zoom/pan state. Module-level, fresh on every page load (no
// persistence anywhere below) — "state resets on load, not persisted"
// is satisfied by construction, not a separate reset step.
// ---------------------------------------------------------------------
let STATE = { lensId: null, viewBox: null };

// Craft latitude, named per the spec's own permission (same class as the
// grain filter's own untested-on-paper parameters) — zoom-step factor,
// deepest-zoom cap, cluster pixel-radius threshold, and pan-per-keypress
// fraction are starting values, tuned by eye, not measured.
const ZOOM_STEP = 1.4;
const MAX_SCALE = 20;
const CLUSTER_PX_THRESHOLD = 24;
const PAN_FRACTION = 0.2;

function parseViewBox(str) {
  const [x, y, w, h] = str.split(/\s+/).map(Number);
  return { x, y, w, h };
}
function viewBoxToString(vb) {
  return `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;
}
function boxCenter(vb) {
  return { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
}

function homeViewBox(store) {
  return parseViewBox(computeMapViewBox(store));
}

// Clamp any viewBox to WORLD_VIEWBOX's own bounds — the same rule
// computeViewBoxForLocations() applies once at construction, re-applied
// here since panning/zooming can drift a box toward or past the world's
// own edge after the fact.
function clampViewBox(vb) {
  const [wx, wy, ww, wh] = WORLD_VIEWBOX.split(/\s+/).map(Number);
  let { x, y, w, h } = vb;
  w = Math.min(w, ww);
  h = Math.min(h, wh);
  x = Math.max(wx, Math.min(x, wx + ww - w));
  y = Math.max(wy, Math.min(y, wy + wh - h));
  return { x, y, w, h };
}

// Zoom a viewBox by `factor` (>1 in, <1 out), keeping `focal` (world-space
// point) at the same relative position within the box before and after —
// the standard "zoom toward the cursor/center" behavior.
function zoomViewBox(vb, factor, focal) {
  const newW = vb.w / factor;
  const newH = vb.h / factor;
  const fxRel = (focal.x - vb.x) / vb.w;
  const fyRel = (focal.y - vb.y) / vb.h;
  return { x: focal.x - fxRel * newW, y: focal.y - fyRel * newH, w: newW, h: newH };
}

function applyZoom(store, lenses, factor, focal) {
  const home = homeViewBox(store);
  const base = STATE.viewBox || home;
  let vb = zoomViewBox(base, factor, focal || boxCenter(base));
  const minW = home.w / MAX_SCALE;
  if (vb.w < minW) vb = zoomViewBox(vb, minW / vb.w, focal || boxCenter(vb));
  // Can't zoom OUT past the site's own "full world" framing — Reset
  // already provides the one-action way back there (spec reason (a));
  // zooming further out than home has no defined "more world" to show.
  if (vb.w > home.w) vb = { ...home };
  STATE.viewBox = clampViewBox(vb);
  renderMap(store, lenses);
}

function applyPan(store, lenses, dxFrac, dyFrac) {
  const vb = STATE.viewBox || homeViewBox(store);
  STATE.viewBox = clampViewBox({ x: vb.x + dxFrac * vb.w, y: vb.y + dyFrac * vb.h, w: vb.w, h: vb.h });
  renderMap(store, lenses);
}

function resetView(store, lenses) {
  STATE.viewBox = homeViewBox(store);
  renderMap(store, lenses);
}

// Converts a client-space (mouse/touch) point to this SVG's own
// user-space (world) coordinates, via the browser's own screen-CTM —
// the standard technique for "zoom centered on the cursor," not a
// hand-rolled approximation of the SVG spec's own transform math.
function clientToWorld(svg, clientX, clientY, fallback) {
  if (!svg.createSVGPoint) return fallback;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return fallback;
  const svgPt = pt.matrixTransform(ctm.inverse());
  return { x: svgPt.x, y: svgPt.y };
}

// Screen-pixel-radius pin declustering (Part 9 item 2): connected-
// components clustering (union-find) over pairwise on-screen distance —
// pins within CLUSTER_PX_THRESHOLD of ANY other pin in the same group
// merge, a standard, honest reading of "within a fixed screen-pixel
// radius of each other" for groups of 3+, not just strict pairs.
function clusterPins(pinEntries, pxPerWorldUnit) {
  const n = pinEntries.length;
  const parent = pinEntries.map((_, i) => i);
  function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
  function union(i, j) { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = (pinEntries[i].cx - pinEntries[j].cx) * pxPerWorldUnit;
      const dy = (pinEntries[i].cy - pinEntries[j].cy) * pxPerWorldUnit;
      if (Math.sqrt(dx * dx + dy * dy) < CLUSTER_PX_THRESHOLD) union(i, j);
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(pinEntries[i]);
  }
  return [...groups.values()];
}

async function main() {
  const store = await loadStore();
  renderFooter(store);
  document.getElementById("fit-def-caption").textContent = FIT_INDEX_DEFINITION;
  const lenses = buildFeaturedLenses(store);
  renderPurposeSelector(store, lenses);
  renderMap(store, lenses);
  wireMapInteractions(store, lenses);
}

function renderPurposeSelector(store, lenses) {
  const el = document.getElementById("purpose-lists");
  const lensIds = new Set(lenses.map((l) => l.id));
  // "All thirteen, always reachable": the remaining criteria beyond the
  // three featured chips, sorted by the schema's own display_order.
  const moreCriteria = store.criteria.filter((c) => !lensIds.has(c.criterion_id));

  const chipHtml = (id, label, active) =>
    `<button type="button" class="btn-chip purpose-chip${active ? " active" : ""}" data-purpose="${id || ""}">${escapeHtml(label)}</button>`;

  el.innerHTML =
    chipHtml("", "Blended Fit index", !STATE.lensId) +
    lenses.map((l) => chipHtml(l.id, l.label, STATE.lensId === l.id)).join("") +
    `<select class="purpose-more" id="purpose-more">
      <option value="">More…</option>
      ${moreCriteria.map((c) => `<option value="${c.criterion_id}"${STATE.lensId === c.criterion_id ? " selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
    </select>`;

  const setLens = (value) => {
    if (STATE.lensId === (value || null)) return;
    STATE.lensId = value || null;
    renderPurposeSelector(store, lenses);
    renderMap(store, lenses);
  };
  el.querySelectorAll(".purpose-chip").forEach((btn) => {
    btn.addEventListener("click", () => setLens(btn.dataset.purpose || null));
  });
  el.querySelector("#purpose-more").addEventListener("change", (e) => setLens(e.target.value || null));

  const explainerEl = document.getElementById("purpose-explainer");
  if (!STATE.lensId) {
    explainerEl.textContent = "Pins colored by the blended Fit index (or your persona's verdict, if one's picked above).";
  } else {
    const lens = resolveLens(store, lenses, STATE.lensId);
    explainerEl.textContent = lens ? lens.explainerText : "";
  }
}

function renderMap(store, lenses) {
  const root = document.getElementById("map-root");
  root.innerHTML = "";
  if (!STATE.viewBox) STATE.viewBox = homeViewBox(store);
  const home = homeViewBox(store);
  const scale = home.w / STATE.viewBox.w;

  const activeLens = resolveLens(store, lenses, STATE.lensId);
  const persona = activeLens ? null : getPersona();

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("id", "worldmap");
  // v6 addendum R1 / v7 Part 9: framed to the pin extent at rest
  // (computeMapViewBox()), zoom/pan-adjustable from there — #worldmap
  // keeps height:auto (style.css), no aspect forced here, so the box's
  // own shape drives the rendered ratio.
  svg.setAttribute("viewBox", viewBoxToString(STATE.viewBox));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "World map, location pins colored by relocation fit. Use the on-map buttons, scroll or pinch, or the plus/minus/arrow keys to zoom and pan.");

  const defs = document.createElementNS(svgNS, "defs");
  defs.innerHTML = `
    <pattern id="hatch-eliminated" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
      <rect width="4" height="4" fill="${eliminatedColor()}" />
      <line x1="0" y1="0" x2="0" y2="4" stroke="#f2e6d8" stroke-width="1.4" />
    </pattern>
    <pattern id="map-grain" patternUnits="userSpaceOnUse" width="140" height="140">
      <image href="${grainImageHref()}" x="0" y="0" width="140" height="140" />
    </pattern>
  `;
  svg.appendChild(defs);

  // Per-country average index (for the choropleth base layer). A lens
  // active averages that lens's own valueForLocation() across the
  // country's locations; otherwise the existing personaIndex()/
  // generalIndex() split, unchanged.
  const countryAverages = new Map();
  for (const country of store.countries) {
    const locs = store.locations.filter((l) => l.country_id === country.country_id);
    const vals = activeLens
      ? locs.map((l) => activeLens.valueForLocation(l.location_id)).filter((v) => v != null)
      : locs
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

  // v7 Part 15: extends the existing procedural-grain mechanism (style.css
  // §1.5.1's own feTurbulence/feColorMatrix recipe) onto the map's own
  // landmass/water fills, which sat outside its original body/.panel-card
  // scope. World-space-fixed (WORLD_VIEWBOX, never the current zoomed
  // viewBox) so it never needs recomputing on zoom/pan — the SVG's own
  // viewBox window naturally shows the right cropped portion of it,
  // exactly as it already does for the country-path fills above. Painted
  // after the base fills and before Ormen Lange/pins, so neither the
  // ornament nor a pin gets textured — only the fills do, per Part 15's
  // own scope (coastline/border strokes explicitly untouched).
  renderMapGrain(svg, svgNS);

  // v6 addendum R4: the site's first pure ornament — Ormen Lange, open
  // North Atlantic, ahead of the pin layer so a pin can never render under
  // it even though their coordinates don't collide today. Draws directly
  // in PROJECTION world-space (not a persisted <g transform>), so it stays
  // correctly pinned to its own anchor through zoom/pan with no extra code
  // — the same viewBox mechanism that keeps country-path fills correctly
  // positioned already covers it (Part 9 item 5's own requirement, met by
  // the existing draw method rather than by a group-transform this file
  // no longer uses — flagged as a small factual mismatch against the
  // spec's own described mechanism, not a gap in the actual requirement).
  renderOrmenLange(svg, svgNS);

  // ---- Pin data pass: compute fill/tooltip per location, unchanged
  // logic from before zoom/decluster existed — just deferred from
  // immediate drawing into a plain array first, so declustering (below)
  // can group by on-screen distance before anything is actually drawn.
  const pinEntries = [];
  for (const loc of store.locations) {
    if (loc.lat == null || loc.lon == null) continue;
    const cx = PROJECTION.x(loc.lon);
    const cy = PROJECTION.y(loc.lat);
    const country = store.countriesById.get(loc.country_id);

    let fill, tooltip, eliminated = false;

    // Tooltip voice (v2 addendum §4): a one-line human answer leads every
    // tooltip, built only from data already computed.
    if (activeLens) {
      const val = activeLens.valueForLocation(loc.location_id);
      fill = scoreToColor(val);
      tooltip = `${loc.display_name}, ${country.name} — ${activeLens.label}: ${val != null ? val.toFixed(1) + "/5" : "not scored yet"}`;
    } else if (persona === "waldo") {
      const idx = store.personaIndex("waldo", loc.location_id);
      fill = scoreToColor(idx ? idx.value : null);
      const headline = buildFitHeadline(store, "waldo", loc, country, idx ? idx.value : null);
      tooltip = `${headline}\nWaldo's Fit index: ${idx && idx.value != null ? idx.value.toFixed(1) : "n/a"}/5`;
    } else if (persona === "wenda" || persona === "carmen") {
      const general = store.generalIndex(loc.location_id);
      const displayName = persona.charAt(0).toUpperCase() + persona.slice(1);
      const perLoc = store.fixturesByPersona.get(persona)?.get(loc.location_id);
      const verdict = perLoc?.verdict;
      const hasCriterionFixtures = perLoc && perLoc.criteria && perLoc.criteria.size > 0;
      const idx = hasCriterionFixtures ? store.personaIndex(persona, loc.location_id) : null;
      const underlyingValue = idx ? idx.value : (general ? general.value : null);
      fill = scoreToColor(underlyingValue);
      if (verdict) {
        const vHeadline = verdictHeadline(verdict.expected);
        const visual = verdictVisual(vHeadline);
        if (visual.kind === "eliminated") { eliminated = true; }
        else { fill = visual.color; }
        const indexLabel = `Fit index shown: ${underlyingValue != null ? underlyingValue.toFixed(1) : "n/a"}/5`;
        const headline = `${loc.display_name}, ${country.name} — ${vHeadline}.`;
        const insteadLine = visual.kind === "eliminated"
          ? `\nVisiting short-term is a separate question — open this place's page for the short-stay rules.`
          : "";
        tooltip = `${headline}\n${displayName}'s visa check: ${verdict.expected}\n(${indexLabel})${insteadLine}`;
      } else {
        tooltip = `${loc.display_name}, ${country.name} — not checked yet for this persona.`;
      }
    } else if (persona) {
      const general = store.generalIndex(loc.location_id);
      fill = scoreToColor(general ? general.value : null);
      tooltip = `${loc.display_name}, ${country.name} — not checked yet for this persona.`;
    } else {
      const general = store.generalIndex(loc.location_id);
      fill = scoreToColor(general ? general.value : null);
      const headline = buildFitHeadline(store, null, loc, country, general ? general.value : null);
      tooltip = `${headline}\nFit index: ${general ? general.value.toFixed(1) + "/5" : "not yet scored"}`;
    }

    pinEntries.push({ loc, country, cx, cy, fill, tooltip, eliminated });
  }

  const wrap = document.createElement("div");
  wrap.className = "map-wrap";
  wrap.appendChild(svg);
  const tip = document.createElement("div");
  tip.className = "pin-label-tooltip";
  tip.id = "pin-tooltip";
  wrap.appendChild(tip);
  const zoomControls = buildZoomControls(store, lenses);
  wrap.appendChild(zoomControls);
  root.appendChild(wrap);

  // ---- Declustering pass: real rendered CSS pixel width, measured now
  // that #map-root is (still) attached to the live DOM — not hardcoded,
  // not assumed, recomputed on every render since it changes with zoom
  // and with the viewport itself.
  const containerWidthPx = root.getBoundingClientRect().width || 800;
  const pxPerWorldUnit = containerWidthPx / STATE.viewBox.w;
  const groups = clusterPins(pinEntries, pxPerWorldUnit);

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

  for (const group of groups) {
    if (group.length === 1) {
      const entry = group[0];
      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("cx", entry.cx);
      circle.setAttribute("cy", entry.cy);
      // Part 9 item 3: constant on-screen size, not constant map-unit
      // size — radius/stroke divided by the current zoom scale on every
      // render (scale=1 at rest, so this is pixel-identical to the
      // pre-zoom build at the home view).
      circle.setAttribute("r", (PIN_RADIUS / scale).toFixed(3));
      circle.style.setProperty("--pin-stroke", (PIN_HALO / scale).toFixed(3));
      circle.setAttribute("class", "location-pin" + (entry.eliminated ? " eliminated" : ""));
      if (!entry.eliminated) circle.setAttribute("fill", entry.fill);
      circle.setAttribute("tabindex", "0");
      circle.setAttribute("role", "link");
      circle.setAttribute("aria-label", `${entry.loc.display_name}, ${entry.country.name}`);
      circle.dataset.tooltip = entry.tooltip;
      circle.dataset.loc = entry.loc.location_id;

      const go = () => { location.href = withPersona(siteUrl(`l/${entry.loc.location_id}.html`)); };
      circle.addEventListener("click", go);
      circle.addEventListener("keydown", (e) => { if (isActivationKey(e)) { e.preventDefault(); go(); } });
      circle.addEventListener("mouseenter", (e) => showTip(e, entry.tooltip));
      circle.addEventListener("focus", (e) => showTip(e, entry.tooltip));
      circle.addEventListener("mouseleave", hideTip);
      circle.addEventListener("blur", hideTip);

      svg.appendChild(circle);
    } else {
      // Part 9 item 2: a cluster badge — neutral PENDING_COLOR, never a
      // ramp hue (averaging several genuinely distinct locations' scores
      // into one color would assert a value this seat doesn't get to
      // invent). Click/tap zooms to fit the cluster's own bounding box,
      // via the SAME padding logic computeMapViewBox() already uses
      // (computeViewBoxForLocations()), reused not reinvented.
      const cx = group.reduce((s, p) => s + p.cx, 0) / group.length;
      const cy = group.reduce((s, p) => s + p.cy, 0) / group.length;
      const r = (PIN_RADIUS + 2) / scale;
      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      circle.setAttribute("r", r.toFixed(3));
      circle.style.setProperty("--pin-stroke", (PIN_HALO / scale).toFixed(3));
      circle.setAttribute("class", "location-pin cluster-badge");
      circle.setAttribute("fill", PENDING_COLOR);
      circle.setAttribute("tabindex", "0");
      circle.setAttribute("role", "button");
      const names = group.map((p) => p.loc.display_name).join(", ");
      circle.setAttribute("aria-label", `${group.length} locations close together: ${names}. Activate to zoom in and separate them.`);
      const zoomToCluster = () => {
        STATE.viewBox = parseViewBox(computeViewBoxForLocations(group.map((p) => p.loc)));
        renderMap(store, lenses);
      };
      circle.addEventListener("click", zoomToCluster);
      circle.addEventListener("keydown", (e) => { if (isActivationKey(e)) { e.preventDefault(); zoomToCluster(); } });
      svg.appendChild(circle);

      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", cx);
      text.setAttribute("y", cy);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.setAttribute("class", "cluster-badge-count");
      text.setAttribute("font-size", (10 / scale).toFixed(2));
      text.setAttribute("pointer-events", "none");
      text.setAttribute("aria-hidden", "true");
      text.textContent = String(group.length);
      svg.appendChild(text);
    }
  }

  renderLegend(document.getElementById("map-legend"), persona);
  renderJudgmentNote(document.getElementById("map-judgment-note"));
}

// Zoom controls (Part 9 item 1): fixed bottom-right of #map-root, one of
// three redundant entry points (buttons here; scroll/pinch and keyboard
// wired once in wireMapInteractions() below, since #map-root itself
// persists across renders while this control panel is rebuilt each time,
// same rebuild-every-render pattern the rest of this function already
// uses for pins/legend).
function buildZoomControls(store, lenses) {
  const div = document.createElement("div");
  div.className = "zoom-controls";
  div.setAttribute("role", "group");
  div.setAttribute("aria-label", "Map zoom controls");
  div.innerHTML = `
    <button type="button" class="zoom-btn" id="zoom-out" aria-label="Zoom out">&minus;</button>
    <button type="button" class="zoom-btn" id="zoom-reset" aria-label="Reset to full-world view">Reset</button>
    <button type="button" class="zoom-btn" id="zoom-in" aria-label="Zoom in">+</button>
  `;
  div.querySelector("#zoom-in").addEventListener("click", () => applyZoom(store, lenses, ZOOM_STEP, boxCenter(STATE.viewBox)));
  div.querySelector("#zoom-out").addEventListener("click", () => applyZoom(store, lenses, 1 / ZOOM_STEP, boxCenter(STATE.viewBox)));
  div.querySelector("#zoom-reset").addEventListener("click", () => resetView(store, lenses));
  return div;
}

// Wired ONCE (not per-render): #map-root is the same DOM node for the
// page's whole life (only its innerHTML is replaced by renderMap()), so
// wheel/touch/keyboard listeners attached here never need re-attaching
// and can't leak.
function wireMapInteractions(store, lenses) {
  const root = document.getElementById("map-root");
  if (!root) return;

  // Entry point 2: scroll-wheel / trackpad-pinch (wheel event with any
  // deltaY), centered on the cursor.
  root.addEventListener("wheel", (e) => {
    e.preventDefault();
    const svgEl = root.querySelector("svg");
    if (!svgEl) return;
    const focal = clientToWorld(svgEl, e.clientX, e.clientY, boxCenter(STATE.viewBox || homeViewBox(store)));
    applyZoom(store, lenses, e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, focal);
  }, { passive: false });

  // Known limitation flagged in Part 9: trackpad-pinch (wheel+ctrlKey) and
  // real mobile touch-pinch are distinct mechanisms — the wheel listener
  // above covers the former (trackpads fire synthetic ctrlKey wheel
  // events for pinch gestures in every major browser); this covers the
  // latter for real, via actual two-finger touch events, not assumed to
  // already work.
  let pinchStartDist = null;
  let pinchStartBox = null;
  function touchDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
  root.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      pinchStartDist = touchDistance(e.touches[0], e.touches[1]);
      pinchStartBox = { ...(STATE.viewBox || homeViewBox(store)) };
    }
  }, { passive: true });
  root.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2 && pinchStartDist) {
      e.preventDefault();
      const svgEl = root.querySelector("svg");
      if (!svgEl) return;
      const dist = touchDistance(e.touches[0], e.touches[1]);
      const factor = dist / pinchStartDist;
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const focal = clientToWorld(svgEl, midX, midY, boxCenter(pinchStartBox));
      STATE.viewBox = pinchStartBox; // pivot from the gesture's own start each move, not the last frame
      applyZoom(store, lenses, factor, focal);
    }
  }, { passive: false });
  root.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) { pinchStartDist = null; pinchStartBox = null; }
  });

  // Entry point 3: keyboard, scoped to when focus is somewhere inside
  // #map-root (a pin, a cluster badge, or the zoom buttons) — a global,
  // unscoped listener would hijack "+"/"-" typed anywhere else on the
  // page (e.g. the "More…" select), which reason (a)/(b) never ask for.
  document.addEventListener("keydown", (e) => {
    if (!root.contains(document.activeElement)) return;
    if (e.key === "+" || e.key === "=") { e.preventDefault(); applyZoom(store, lenses, ZOOM_STEP, boxCenter(STATE.viewBox)); }
    else if (e.key === "-" || e.key === "_") { e.preventDefault(); applyZoom(store, lenses, 1 / ZOOM_STEP, boxCenter(STATE.viewBox)); }
    else if (e.key === "0") { e.preventDefault(); resetView(store, lenses); }
    else if (e.key === "ArrowUp") { e.preventDefault(); applyPan(store, lenses, 0, -PAN_FRACTION); }
    else if (e.key === "ArrowDown") { e.preventDefault(); applyPan(store, lenses, 0, PAN_FRACTION); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); applyPan(store, lenses, -PAN_FRACTION, 0); }
    else if (e.key === "ArrowRight") { e.preventDefault(); applyPan(store, lenses, PAN_FRACTION, 0); }
  });
}

// v7 Part 15: reads the SAME data-URI CSS already defines once
// (style.css's --grain-svg custom property, §1.5.1) rather than a second,
// hand-copied string here — the two can't silently drift apart, since
// there's only ever one authored copy of the filter recipe.
function grainImageHref() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--grain-svg").trim();
  const m = raw.match(/^url\((["']?)(.*)\1\)$/);
  return m ? m[2] : raw;
}

function renderMapGrain(svg, svgNS) {
  const [wx, wy, ww, wh] = WORLD_VIEWBOX.split(/\s+/).map(Number);
  const rect = document.createElementNS(svgNS, "rect");
  rect.setAttribute("x", wx);
  rect.setAttribute("y", wy);
  rect.setAttribute("width", ww);
  rect.setAttribute("height", wh);
  rect.setAttribute("fill", "url(#map-grain)");
  rect.setAttribute("aria-hidden", "true");
  rect.style.mixBlendMode = "multiply";
  rect.style.opacity = "0.08";
  rect.style.pointerEvents = "none";
  svg.appendChild(rect);
}

// v6 addendum R1: the padding/clamp logic, shared by the whole-map view
// (computeMapViewBox, below) and Part 9's cluster-fit zoom (renderMap's
// zoomToCluster, above) — reused, not reinvented, per that section's own
// explicit instruction. Reads the FULL 38-location set every call when
// invoked via computeMapViewBox(), unfiltered by persona, so the crop
// never shifts on a persona pick; when invoked with a cluster's own
// member locations instead, the exact same math frames just that
// cluster's bounding box.
function computeViewBoxForLocations(locs) {
  const pts = locs
    .filter((l) => l.lat != null && l.lon != null)
    .map((l) => ({ x: PROJECTION.x(l.lon), y: PROJECTION.y(l.lat) }));
  // Degenerate fallback only — never expected with real data, but a bare
  // crash on an empty set would be worse than falling back to the full
  // world.
  if (!pts.length) return WORLD_VIEWBOX;

  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));

  // §R1.3: pad every edge by at least the largest pin's radius+halo x 3
  // (pins never sit flush to the edge) PLUS a term proportional to the
  // box's own span, so a small cluster still gets breathing room.
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

function computeMapViewBox(store) {
  return computeViewBoxForLocations(store.locations);
}

// v6 addendum R4 / 2026-07-13 placeholder: the site's first pure
// ornament slot — asserting no fact, citing no source, carrying no
// confidence tier (exempt from the why/instead render contract by
// construction). The original line-art longship attempt is retired by
// direct instruction ("let's get rid of the attempt at Ormen Lange") —
// a plain X placeholder holds the spot until real artwork lands; same
// slot, same non-interactive contract, nothing else changed.
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

  // Placeholder X, an 8-unit cross centered on (cx, cy) — deliberately the
  // plainest possible marker, not a second art attempt.
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", `M${cx - 4},${cy - 4} L${cx + 4},${cy + 4} M${cx - 4},${cy + 4} L${cx + 4},${cy - 4}`);
  path.setAttribute("fill", "none");
  g.appendChild(path);
  svg.appendChild(g);
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
  // v6 addendum §2.3 / v7 Part 16: five named, ordinally-labeled steps
  // replace the old unlabeled swatch strip — each stop gets its own
  // `.legend-step` (swatch + name); in dark mode getScaleLegend()
  // withholds `name` (see that function's own comment), so the step
  // renders swatch-only there rather than a wrong color word.
  const scaleHtml = getScaleLegend().map(
    (s) => `<span class="legend-step"><span class="legend-swatch" style="background:${s.color}"></span>${s.name ? ` ${escapeHtml(s.name)}` : ""}</span>`
  ).join("");
  let extra = "";
  if (persona === "wenda" || persona === "carmen") {
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
  el.innerHTML = `
    Good enough to place a dot on the map, not for door-to-door
    navigation. Every location gets the same treatment; more precision
    may come later.
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
