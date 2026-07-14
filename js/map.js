import { loadStore, verdictHeadline } from "./data.js";
import { scoreToColor, getScaleLegend, verdictVisual, clearsColor, eliminatedColor, isGapValue, CONDITIONAL_COLOR, pendingColor, DOG_LENS_COLOR } from "./colors.js";
import {
  applyStoredTheme, renderTopBar, renderPersonaSlot,
  renderFooter, getPersona, withPersona, escapeHtml,
  FIT_INDEX_DEFINITION, SCALE_ANCHOR_STRING, buildFitHeadline, isActivationKey,
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
// `kind: "score"` (v8 Part 6) distinguishes this shape from the new
// "facts" lens kind below — one field the render code branches on instead
// of duck-typing which function a lens object happens to carry.
function criterionLens(store, criterionId, label) {
  const crit = store.criteriaById.get(criterionId);
  const displayLabel = label || (crit ? crit.name : criterionId);
  return {
    id: criterionId,
    kind: "score",
    label: displayLabel,
    valueForLocation(locationId) {
      const row = store.scoresByLocation.get(locationId)?.get(criterionId);
      return row && row.status === "scored" && row.score != null ? row.score : null;
    },
    explainerText: `Pins colored by ${displayLabel} alone, general figures — this view ignores any persona pick above.`,
  };
}

// v8 Part 6: the dog-import facts lens — a second lens KIND ("facts"
// instead of "score"), extending Part 13's plug-in contract rather than
// forking it. Colors pins by whether the rules are researched, never by
// how good/bad they are (Part 13's own no-invented-scoring-method refusal
// still stands) — facts, disclosed as facts, never a grade.
//
// Resolves off fact_key prefix match ("...pet-import-dog", this also
// catches the "dog-and-cat" variants, since a prefix match doesn't care
// what follows) over `store.factsByLocation` — the SAME own-facts-plus-
// country-inherited resolution every other fact list on this site already
// reads through (data.js), not a second, narrower country-only lookup.
// This matters for real, not just in principle: a dry run against the live
// derived layer found a genuine dog-import row filed at LOCATION scope
// (Puerto Rico's Rincón, prefixed by its own location_id, not its
// country's) that a country-id-only prefix check would have silently
// missed even though the fact is real, not a gap — building against
// factsByLocation catches it correctly, the same way it already would for
// any other fact type. The prefix itself is checked against whatever
// follows a fact_key's own first colon, not tied to which id (country or
// location) happens to precede it — verified against the live derived
// layer this session: matches real rows under several observed key-
// naming variants — a country whose only dog-import row uses a different
// naming shape (e.g. a cat-only key, or a key with no "dog" token at all)
// would still silently miss under this mechanism; a real, named limit of
// a prefix match over organically-grown keys, not solved here (flagged to
// the data-format owner as a normalization candidate, not fixed by this
// render code). A [GAP] row counts as absent, same as everywhere else on
// this site.
function dogImportFactsLens(store) {
  return {
    id: "dog-import-facts",
    kind: "facts",
    label: "Dog import rules",
    factsForLocation(locationId) {
      const rows = (store.factsByLocation.get(locationId) || []).filter((f) => {
        if (!f.fact_key || f.value_raw === "[GAP]") return false;
        const idx = f.fact_key.indexOf(":");
        const rest = idx === -1 ? f.fact_key : f.fact_key.slice(idx + 1);
        return rest.startsWith("pet-import-dog");
      });
      return rows.length ? rows.map((f) => ({ label: f.fact_label, text: f.value_raw })) : null;
    },
    explainerText:
      "Unscored on purpose — these are the import rules on file, not a grade. Blue pins have researched rules; hover to read them. This view ignores any persona pick above.",
  };
}

// The two lenses Part 13 confirms as already-built and spec-compliant
// (easiest visa, money goes furthest), folded into this build as-is.
// "Best property access" was already a third entry in this array before
// this change (ported from lists.js's own FEATURED_CRITERIA) — it's
// not one of Part 13's four named purpose lenses, but it's already a
// working, criterion-backed lens with no reason to drop it. The dog-
// import lens (v8 Part 6) is a fourth chip, appended last — reversible on
// purpose (a confirmation of keeping this lens at all is still pending):
// removing it again is one array entry, nothing else references it.
function buildFeaturedLenses(store) {
  return [
    criterionLens(store, "visa-legal-pathway-ease", "Easiest visa"),
    criterionLens(store, "cost-of-living-affordability", "Money goes furthest"),
    criterionLens(store, "land-property-access", "Best property access"),
    dogImportFactsLens(store),
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
const ZOOM_STEP = 1.4; // one discrete +/- button click or +/- keypress
// Deliberately much smaller than ZOOM_STEP: a wheel/trackpad gesture fires
// many events per scroll (a trackpad can send dozens for one swipe), so
// reusing ZOOM_STEP here compounded into runaway zoom (1.4^10 = ~29x from
// a single fast scroll) — flagged live, 2026-07-14, "you have to work to
// zoom hard." This is the per-event factor, not a one-action step.
const WHEEL_ZOOM_STEP = 1.03;
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
    // v8 R3 amendment (the no-fixture standing line): a persona active
    // with zero fixtures anywhere (the five personas with no fixture rows
    // at all) means the WHOLE map renders faded — that needs saying in
    // words here, not only in the legend, since a first-time visitor who
    // has never seen the full-strength state has no legend-free way to
    // read uniform muted pins as "nothing checked yet" rather than "the
    // site's own look." Only overrides the default line for that one
    // state; every other state (fixture-bearing persona, or no persona at
    // all) keeps the existing line unchanged.
    const persona = getPersona();
    if (persona && !store.fixturesByPersona.has(persona)) {
      const displayName = persona.charAt(0).toUpperCase() + persona.slice(1);
      explainerEl.textContent = `Faded pins — general figures, not checked for ${displayName}`;
    } else {
      explainerEl.textContent = "Pins colored by the blended Fit index (or your persona's verdict, if one's picked above).";
    }
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

  // v8 R1: the country-average choropleth is retired. Every country
  // polygon now renders identically (uniform --country-fill, set by
  // style.css's own .country-path rule — nothing set inline here at all)
  // — pins are the only value-bearing marks on this map. A country with
  // pins on it is visibly "worked" by construction; a country's outline
  // never asserts a value, so no shading means nothing either way (see
  // renderJudgmentNote()'s own updated copy below). This also retires the
  // blended per-country number this project's own doctrine never wanted
  // on the map in the first place (location-level, never blended per
  // country).
  for (const d of Object.values(COUNTRY_PATHS)) {
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "country-path");
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

    let fill, tooltip, eliminated = false, gap = false, faded = false;

    // Tooltip voice (v2 addendum §4): a one-line human answer leads every
    // tooltip, built only from data already computed.
    //
    // v8 R3: the presence axis. `faded` marks a pin that gets rendered at
    // reduced opacity because a persona is active, no lens is active, and
    // this pin carries no real persona-specific read — never set when a
    // lens is active (R3's own precedence ruling: a lens is general
    // figures by definition, every pin full-strength) and never set when
    // no persona is picked at all (nothing to fade against).
    if (activeLens) {
      if (activeLens.kind === "facts") {
        // v8 Part 6: the dog-import facts lens — two states only, no
        // ramp hue in either (using one would whisper "grade").
        const facts = activeLens.factsForLocation(loc.location_id);
        if (facts) {
          fill = DOG_LENS_COLOR;
          const lines = facts.length > 1
            ? facts.map((f) => `${f.label}: ${f.text}`).join(" ")
            : facts[0].text;
          tooltip = `${loc.display_name}, ${country.name} — Dog import: ${lines}`;
        } else {
          fill = scoreToColor(null);
          gap = true;
          tooltip = `${loc.display_name}, ${country.name} — Dog import: not researched yet.`;
        }
      } else {
        const val = activeLens.valueForLocation(loc.location_id);
        fill = scoreToColor(val);
        gap = isGapValue(val);
        tooltip = `${loc.display_name}, ${country.name} — ${activeLens.label}: ${val != null ? val.toFixed(1) + "/5" : "not scored yet"}`;
      }
    } else if (persona === "waldo") {
      const idx = store.personaIndex("waldo", loc.location_id);
      const value = idx ? idx.value : null;
      const hasRealRead = !!(idx && idx.personaAdjusted === true);
      fill = scoreToColor(value);
      gap = isGapValue(value);
      faded = !hasRealRead;
      const headline = buildFitHeadline(store, "waldo", loc, country, value);
      tooltip = `${headline}\nWaldo's Fit index: ${value != null ? value.toFixed(1) : "n/a"}/5`;
    } else if (persona === "wenda" || persona === "carmen") {
      const general = store.generalIndex(loc.location_id);
      const displayName = persona.charAt(0).toUpperCase() + persona.slice(1);
      const perLoc = store.fixturesByPersona.get(persona)?.get(loc.location_id);
      const verdict = perLoc?.verdict;
      const hasCriterionFixtures = perLoc && perLoc.criteria && perLoc.criteria.size > 0;
      const idx = hasCriterionFixtures ? store.personaIndex(persona, loc.location_id) : null;
      const underlyingValue = idx ? idx.value : (general ? general.value : null);
      const hasRealRead = !!verdict || hasCriterionFixtures;
      fill = scoreToColor(underlyingValue);
      gap = isGapValue(underlyingValue);
      faded = !hasRealRead;
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
        // v8 Part 10 Ruling 2: knowledge-first — the general fit headline,
        // then the general Fit index (labeled as such), then the existing
        // canonical "not checked yet" line last, not alone. Zero new
        // authorship: same buildFitHeadline() mechanism the no-persona
        // branch below already uses, and the exact same closing sentence
        // this branch always rendered, just no longer the WHOLE tooltip.
        const generalHeadline = buildFitHeadline(store, null, loc, country, underlyingValue);
        tooltip = `${generalHeadline}\nFit index: ${underlyingValue != null ? underlyingValue.toFixed(1) + "/5" : "not yet scored"} (general figures)\n${loc.display_name}, ${country.name} — not checked yet for this persona.`;
      }
    } else if (persona) {
      // The five personas with zero fixtures anywhere — always faded,
      // always the general figure, same Part 10 Ruling 2 knowledge-first
      // shape as Wenda/Carmen's own no-fixture branch above.
      const general = store.generalIndex(loc.location_id);
      const value = general ? general.value : null;
      fill = scoreToColor(value);
      gap = isGapValue(value);
      faded = true;
      const headline = buildFitHeadline(store, null, loc, country, value);
      tooltip = `${headline}\nFit index: ${value != null ? value.toFixed(1) + "/5" : "not yet scored"} (general figures)\n${loc.display_name}, ${country.name} — not checked yet for this persona.`;
    } else {
      const general = store.generalIndex(loc.location_id);
      fill = scoreToColor(general ? general.value : null);
      gap = isGapValue(general ? general.value : null);
      const headline = buildFitHeadline(store, null, loc, country, general ? general.value : null);
      tooltip = `${headline}\nFit index: ${general ? general.value.toFixed(1) + "/5" : "not yet scored"}`;
    }

    pinEntries.push({ loc, country, cx, cy, fill, tooltip, eliminated, gap, faded });
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
      // v8 R3/R4: "gap" (unresearched — gap-ink stroke, css/style.css) and
      // "pin-faded" (R3's presence axis — reduced fill-opacity, --line
      // stroke) are independent, combinable classes, not a single state
      // enum — a pin can be both at once (unresearched AND not checked for
      // the active persona). Precedence between their two stroke rules is
      // resolved by CSS ordering, named there, not here.
      circle.setAttribute("class", "location-pin"
        + (entry.eliminated ? " eliminated" : "")
        + (entry.gap ? " gap" : "")
        + (entry.faded ? " pin-faded" : ""));
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
      // v8 R5: a cluster badge is chrome (a count), not data — "N places
      // here," never a color that could be mistaken for a value. Fill/
      // stroke/numeral color now come entirely from CSS (.cluster-badge,
      // .cluster-badge-count in style.css: --panel fill, --line stroke,
      // --ink numeral), no inline fill set here at all — was PENDING_COLOR
      // before v8, which conflated "a count" with "an unverified verdict,"
      // two different claims that shouldn't share a color. Click/tap zooms
      // to fit the cluster's own bounding box, via the SAME padding logic
      // computeMapViewBox() already uses (computeViewBoxForLocations()),
      // reused not reinvented.
      const cx = group.reduce((s, p) => s + p.cx, 0) / group.length;
      const cy = group.reduce((s, p) => s + p.cy, 0) / group.length;
      const r = (PIN_RADIUS + 2) / scale;
      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      circle.setAttribute("r", r.toFixed(3));
      circle.style.setProperty("--pin-stroke", (PIN_HALO / scale).toFixed(3));
      circle.setAttribute("class", "location-pin cluster-badge");
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

  renderLegend(document.getElementById("map-legend"), persona, activeLens, store);
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
    applyZoom(store, lenses, e.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP, focal);
  }, { passive: false });

  // Entry point 2b: click-and-drag panning — flagged live, 2026-07-14,
  // "we can't move around on a zoomed-in map." There was previously no
  // way to pan except the arrow keys. Tracked in plain screen-pixel
  // fractions against the viewBox captured at drag-start (not the live
  // DOM, which gets replaced wholesale by every renderMap() call — see
  // this function's own header comment) so the map tracks the cursor
  // 1:1 regardless of how many renders happen mid-drag. Left mouse
  // button only; doesn't preventDefault on mousedown/mouseup, so a plain
  // click (no movement) still reaches pins'/clusters' own click handlers
  // unchanged — only an actual drag repositions the view.
  //
  // PAN_DRAG_THRESHOLD_PX: renderMap() rebuilds the SVG's pins/clusters
  // as fresh DOM nodes on every intervening mousemove, which could swap
  // a pin's own <circle> out from under the pointer mid-click on
  // ordinary hand jitter and suppress the browser's native click firing.
  // Below this many pixels of movement, nothing re-renders and
  // pin/cluster clicks are provably untouched; only once real drag
  // distance is crossed does panning actually engage.
  const PAN_DRAG_THRESHOLD_PX = 4;
  let panStart = null; // { clientX, clientY, box: {x,y,w,h}, rectW, rectH, moved }
  root.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const svgEl = root.querySelector("svg");
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    panStart = { clientX: e.clientX, clientY: e.clientY, box: { ...(STATE.viewBox || homeViewBox(store)) }, rectW: rect.width, rectH: rect.height, moved: false };
  });
  window.addEventListener("mousemove", (e) => {
    if (!panStart) return;
    const rawDx = e.clientX - panStart.clientX, rawDy = e.clientY - panStart.clientY;
    if (!panStart.moved) {
      if (Math.sqrt(rawDx * rawDx + rawDy * rawDy) < PAN_DRAG_THRESHOLD_PX) return;
      panStart.moved = true;
    }
    e.preventDefault();
    root.classList.add("map-panning");
    // Dragging right/down should reveal what's to the left/above, i.e.
    // the map content follows the cursor (the standard "grab the map"
    // convention) — the opposite sign from the keyboard arrows above,
    // which pan the *viewport* rather than drag the *content*.
    const dx = -(rawDx / panStart.rectW) * panStart.box.w;
    const dy = -(rawDy / panStart.rectH) * panStart.box.h;
    STATE.viewBox = clampViewBox({ x: panStart.box.x + dx, y: panStart.box.y + dy, w: panStart.box.w, h: panStart.box.h });
    renderMap(store, lenses);
  });
  window.addEventListener("mouseup", () => { panStart = null; root.classList.remove("map-panning"); });

  // Known limitation flagged in Part 9: trackpad-pinch (wheel+ctrlKey) and
  // real mobile touch-pinch are distinct mechanisms — the wheel listener
  // above covers the former (trackpads fire synthetic ctrlKey wheel
  // events for pinch gestures in every major browser); this covers the
  // latter for real, via actual two-finger touch events, not assumed to
  // already work.
  let pinchStartDist = null;
  let pinchStartBox = null;
  // Single-finger touch panning — the exact same gap as the mouse drag
  // above, on the input method where a map that only pinch-zooms is even
  // less usable (no arrow-key fallback on a touchscreen). Same
  // fixed-at-gesture-start math as the drag handler; kept as a separate
  // start/box pair from pinchStartDist/pinchStartBox since a 1-finger
  // touch and a 2-finger pinch are mutually exclusive gestures.
  let touchPanStart = null;
  function touchRootRect() {
    const svgEl = root.querySelector("svg");
    return svgEl ? svgEl.getBoundingClientRect() : null;
  }
  root.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      pinchStartDist = touchDistance(e.touches[0], e.touches[1]);
      pinchStartBox = { ...(STATE.viewBox || homeViewBox(store)) };
      touchPanStart = null;
    } else if (e.touches.length === 1) {
      const rect = touchRootRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;
      touchPanStart = { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, box: { ...(STATE.viewBox || homeViewBox(store)) }, rectW: rect.width, rectH: rect.height, moved: false };
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
    } else if (e.touches.length === 1 && touchPanStart) {
      const rawDx = e.touches[0].clientX - touchPanStart.clientX, rawDy = e.touches[0].clientY - touchPanStart.clientY;
      if (!touchPanStart.moved) {
        if (Math.sqrt(rawDx * rawDx + rawDy * rawDy) < PAN_DRAG_THRESHOLD_PX) return;
        touchPanStart.moved = true;
      }
      e.preventDefault();
      const dx = -(rawDx / touchPanStart.rectW) * touchPanStart.box.w;
      const dy = -(rawDy / touchPanStart.rectH) * touchPanStart.box.h;
      STATE.viewBox = clampViewBox({ x: touchPanStart.box.x + dx, y: touchPanStart.box.y + dy, w: touchPanStart.box.w, h: touchPanStart.box.h });
      renderMap(store, lenses);
    }
  }, { passive: false });
  root.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) { pinchStartDist = null; pinchStartBox = null; }
    if (e.touches.length < 1) { touchPanStart = null; }
  });
  function touchDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

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
  "not-checked": () => pendingColor(),
};

// v8 R7: the legend becomes mode-aware — three mutually exclusive shapes,
// never overlaid on each other, so the colors on screen and the words
// explaining them always agree about what mode is showing. Exact strings
// are ruled UI copy, transported verbatim, not paraphrased here.
function renderLegend(el, persona, activeLens, store) {
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

  if (activeLens && activeLens.kind === "facts") {
    // Facts-lens variant (Part 6): two swatches, no ramp, no scale-anchor
    // line — nothing 1-5 is on screen in this mode.
    el.innerHTML = `
      <div class="legend-scale">
        <span class="legend-item"><span class="legend-swatch" style="background:${DOG_LENS_COLOR}"></span> Rules on file</span>
        <span class="legend-item"><span class="legend-swatch legend-gap-demo" style="background:${scoreToColor(null)}"></span> Not researched yet</span>
      </div>
      <span>${escapeHtml(activeLens.explainerText)}</span>
    `;
    return;
  }

  if (activeLens) {
    // Lens active (score-kind): the ramp is still general figures, just
    // for one criterion instead of the blend — title says so, no persona
    // verdict rows (a lens suppresses the persona read entirely).
    el.innerHTML = `
      <div class="legend-scale">Pin color — ${escapeHtml(activeLens.label)}, general figures: ${scaleHtml}</div>
      <span>${escapeHtml(SCALE_ANCHOR_STRING)}</span>
    `;
    return;
  }

  if (persona) {
    // Persona active: two rows, no full-strength ramp row at all — the
    // ramp only ever appears faded in this mode (on the map itself), so
    // showing it full-strength in the legend would contradict what a
    // reader is actually looking at.
    const displayName = persona.charAt(0).toUpperCase() + persona.slice(1);
    const hasFixtures = store.fixturesByPersona.has(persona);
    let checkedRow = "";
    if (hasFixtures) {
      const swatches = BAND_ORDER.filter((b) => b !== "unclassified").map((band) => {
        if (band === "doesnt-clear") {
          return `<span class="legend-item"><span class="legend-hatch-demo"></span> ${escapeHtml(BAND_LABEL[band])}</span>`;
        }
        const color = BAND_LEGEND_COLOR[band]();
        return `<span class="legend-item"><span class="legend-swatch" style="background:${color}"></span> ${escapeHtml(BAND_LABEL[band])}</span>`;
      }).join("");
      checkedRow = `<div class="legend-scale">Solid pins — checked for ${escapeHtml(displayName)}: ${swatches}</div>`;
    }
    const fadedDemoColor = getScaleLegend()[2].color; // the ramp's middle stop, any one representative stop
    const fadedRow = `<div class="legend-scale">Faded pins — general figures, not checked for ${escapeHtml(displayName)} <span class="legend-swatch legend-faded-demo" style="background:${fadedDemoColor}"></span></div>`;
    el.innerHTML = checkedRow + fadedRow;
    return;
  }

  // General (no persona, no lens):
  el.innerHTML = `
    <div class="legend-scale">Pin color — general Fit index: ${scaleHtml}</div>
    <span>${escapeHtml(SCALE_ANCHOR_STRING)}</span>
    <span>${escapeHtml(FIT_INDEX_DEFINITION)}</span>
  `;
}

function renderJudgmentNote(el) {
  el.innerHTML = `
    Good enough to place a dot on the map, not for door-to-door
    navigation. Every location gets the same treatment; more precision
    may come later.
    <br><br>
    <strong>Two more honest limits of this first map build:</strong>
    (1) Countries are all drawn the same — the pins carry the data. A
    country's outline never asserts a value, so no shading means nothing
    either way. Crete (CanILiveThere's "CR") is deliberately unmapped as a
    country outline — its two researched locations are on the island, not
    the Greek mainland — see pins, not the Greece polygon.
    (2) Only Wenda's and Carmen's verdict fixtures give a real
    clears/misses read; Waldo's map has no "eliminated" state to show yet,
    because no hard-constraint pass/fail has been computed for him — only
    his four re-scored criteria, which still blend into the same 1–5 ramp,
    not a gone/not-gone one. Full detail in the build notes.
  `;
}
