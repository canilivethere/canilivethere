import { loadStore, verdictHeadline, sectionForFact, resolveVerdict } from "./data.js";
import { scoreToColor, indexToColor, calibrateIndexBands, indexBandDisclosure, getScaleLegend, verdictVisual, bandVisual, eliminatedColor, isGapValue, pendingColor, DOG_LENS_COLOR } from "./colors.js";
import {
  applyStoredTheme, renderTopBar, renderPersonaSlot,
  renderFooter, getActivePersona, applyStoredCustomWeights, withPersona, escapeHtml,
  FIT_INDEX_DEFINITION, SCALE_ANCHOR_STRING, buildFitHeadline, isActivationKey,
  formatNumbersInText, splitFactSentences, STATE_HEADLINE, STATE_HEADLINE_BAND,
  CONF_LABEL, CUSTOM_ESTIMATE_SUFFIX, initLocationSearch,
} from "./app-shared.js";

// Plain-text equivalent of app-shared.js's verdictConfidenceBadge(), for
// the hover tooltip specifically (showTip() sets .textContent, which
// cannot carry a styled <span>). Same skip rules: no tier, or a data-gap
// band (already says "not enough to judge"), renders nothing.
function verdictConfidenceSuffix(tier, overallBand) {
  if (!tier || overallBand === "data_gap") return "";
  return ` — ${CONF_LABEL[tier] || tier}`;
}
import { WORLD_VIEWBOX, COUNTRY_PATHS, PROJECTION } from "./worldmap-data.js";
import { TERRAIN_FEATURES } from "./terrain-data.js";
import { siteUrl } from "./site-root.js";
import { initPerspectiveDoor } from "./perspective-door.js";

// v6 addendum R1/R4: one shared radius/halo pair, read by both the pin loop
// below (the actual rendered circle) and computeViewBoxForLocations() (the
// padding floor) — a single source so the two can never silently drift
// apart the way the spec's own "7+2=9" arithmetic assumes they won't.
const PIN_RADIUS = 7;
const PIN_HALO = 2;
// Part 23.9: the hand-checked verification ring — gap between the pin's
// own outer edge and the ring's inner edge, plus the ring's own stroke
// width, both constant on-screen (pxPerWorldUnit-scaled at the actual draw
// site, same idiom as PIN_RADIUS/PIN_HALO above).
const HAND_CHECKED_RING_GAP = 3;
const HAND_CHECKED_RING_STROKE_PX = 1.5;

// v10 Part 13: real-world km -> world-viewBox units, for terrain sizing
// only (pins/hit-areas never use this — they hold constant SCREEN size via
// pxPerWorldUnit instead; terrain is real geography and should genuinely
// grow/shrink on screen with zoom, the same way country outlines already
// do). Equirectangular approximation (111km per degree of latitude is the
// standard constant for this class of estimate) applied to PROJECTION's own
// latitude slope, not a second, independently-tuned figure — checked
// against the spec's own cited conversion (18km -> ~0.39-0.44 world-units,
// §13.3): this factor reproduces that range (18 *
// this constant ≈ 0.436), so it's the same math, not a re-derivation.
const KM_PER_DEGREE_LAT = 111;
const WORLD_UNITS_PER_KM = Math.abs(PROJECTION.y(1) - PROJECTION.y(0)) / KM_PER_DEGREE_LAT;

// v10 §13.4: zoom-threshold fade-in, an implementation call on the two
// numbers the spec deliberately left open (it fixes only the ~20px floor
// and the 0.25-0.35 opacity range, not a second threshold or a specific
// value inside that range). TERRAIN_FADE_FULL_PX is a plain 3x multiple of
// the floor — no research behind it, a reasonable ramp width, not a
// measured number (an open judgment call, not asserted as settled).
// TERRAIN_OPACITY_TARGET sits at the range's own midpoint.
const TERRAIN_FADE_MIN_PX = 20; // narrow-axis on-screen footprint below which a terrain shape doesn't render at all
const TERRAIN_FADE_FULL_PX = 60; // footprint at/above which opacity reaches its fixed target
const TERRAIN_OPACITY_TARGET = 0.3;

// v10 Part 12.3: persistent solo-pin labels. Font size and halo width are
// both constant ON SCREEN (same pxPerWorldUnit idiom as pin radius/stroke),
// so a place name reads the same size at any zoom. AVG_CHAR_WIDTH_PX is a
// deliberately crude estimate (no canvas measureText call, keeping this
// dependency-light) used ONLY for the collision-fallback check below, not
// for anything rendered — good enough to catch real overlaps, not a layout
// engine.
const LABEL_FONT_SIZE_PX = 9;
const LABEL_GAP_PX = 3; // gap between the pin's own radius+halo and the label's top edge
const LABEL_HALO_PX = 2; // thin --paper halo stroke width, for legibility over varying ground
const LABEL_AVG_CHAR_WIDTH_PX = LABEL_FONT_SIZE_PX * 0.56;
const LABEL_LINE_HEIGHT_PX = LABEL_FONT_SIZE_PX * 1.3;

applyStoredTheme();
renderTopBar("map");
renderPersonaSlot(document.getElementById("persona-slot"), getActivePersona());
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
      return rows.length ? rows.map((f) => ({ label: f.fact_label, text: formatNumbersInText(String(f.value_raw)) })) : null;
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
// import lens (v8 Part 6) stays a fourth member of this SAME array
// (Part 28.3, 2026-07-21: demoted from its own chip to the "More…"
// dropdown, load-bearing build note) — it must stay registered here,
// where resolveLens() finds it by id; removing it from this array
// entirely would make resolveLens() fall through to its own
// criterionLens() fallback against a nonexistent criterion, silently
// rendering a broken "not scored" ramp instead of the real two-state
// facts view. renderPurposeSelector() below is what actually moved —
// it now renders this one entry as a dropdown option, not a chip.
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

// v8 Part 11: overlap/warmth redesign constants — same craft-latitude
// class as the four above, explicitly flagged untested-on-a-rendered-page
// by the spec itself (11.2 Ruling 4), not measured or user-tested here.
const GROWTH_PER_MEMBER = 1.5; // px a knot's own footprint grows per extra member, capped by DENSITY_CAP
const DENSITY_CAP = 8; // membership beyond this stops inflating the knot's own visual/hit footprint
const RENDER_CAP = 12; // draw at most this many member pins as real circles (stable sort by location_id); the rest still count toward density growth and the aria-label, and stay reachable via zoom-to-fit
const COINCIDENCE_PX_THRESHOLD = 4; // Ruling 2: only true near-coincidence (sub-4px true on-screen distance) gets nudged
const COINCIDENCE_NUDGE_MAX_PX = 6; // Ruling 2's own displacement cap
const HIT_RADIUS_PX = 22; // §11.3 item 1: invisible hit-area radius for every pin, solo or knotted — the visible pin alone (9px) is under standard mobile touch-target size

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

// Pure state update: computes the next STATE.viewBox for a zoom by
// `factor` around `focal`, WITHOUT rendering. Split out of applyZoom()
// (below) so a rapid burst of input events (wheel/touch-pinch) can update
// this cheap, no-DOM math on every single event while still batching the
// expensive renderMap() call itself — see applyZoomThrottled().
function computeZoomState(store, factor, focal) {
  const home = homeViewBox(store);
  const base = STATE.viewBox || home;
  let vb = zoomViewBox(base, factor, focal || boxCenter(base));
  const minW = home.w / MAX_SCALE;
  // zoomViewBox() computes newW = vb.w / factor, so correcting an
  // over-zoomed box back to minW needs factor = vb.w / minW (not
  // minW / vb.w, which was the bug: passing the inverted factor made
  // newW = vb.w^2 / minW, shrinking vb further instead of correcting it
  // — compounding on every subsequent zoom-in click toward a degenerate
  // near-zero, eventually NaN, viewBox).
  if (vb.w < minW) vb = zoomViewBox(vb, vb.w / minW, focal || boxCenter(vb));
  // Can't zoom OUT past the site's own "full world" framing — Reset
  // already provides the one-action way back there (spec reason (a));
  // zooming further out than home has no defined "more world" to show.
  if (vb.w > home.w) vb = { ...home };
  STATE.viewBox = clampViewBox(vb);
}

function applyZoom(store, lenses, factor, focal) {
  computeZoomState(store, factor, focal);
  renderMap(store, lenses);
}

// Bug fix, 2026-07-16: wireMapInteractions()'s wheel and touchmove
// (2-finger pinch) handlers used to call applyZoom() — a full synchronous
// renderMap() (DOM teardown/rebuild of every country path, pin, hit-circle,
// and label, plus a forced-layout getBoundingClientRect() call) — on EVERY
// raw wheel/touchmove event, with no throttling anywhere. WHEEL_ZOOM_STEP
// is deliberately tiny (1.03), so reaching a meaningful zoom from world
// view takes 100+ discrete events — exactly the burst size a real fast
// scroll/trackpad gesture produces in under a second. Reproduced live
// (headless Chromium, synthetic wheel/touch bursts): 150 events blocked
// the main thread for ~1.4s, 400 events for ~3.2s, linear at ~8-9ms per
// synchronous render — a genuine, multi-second freeze, not a hypothetical.
//
// Fix: keep the cheap, no-DOM zoom math (computeZoomState) running on
// every raw event, so the FINAL zoom level is still exactly correct and no
// event's intent is silently dropped — but batch the expensive render:
// at most one renderMap() per animation frame, however many events arrived
// since the last one. Button-click and keyboard zoom (applyZoom(), above)
// fire far less frequently than a scroll/pinch gesture and are left on the
// original immediate-render path — they don't need this and shouldn't
// change behavior.
let zoomRenderScheduled = false;
function scheduleZoomRender(store, lenses) {
  if (zoomRenderScheduled) return;
  zoomRenderScheduled = true;
  requestAnimationFrame(() => {
    zoomRenderScheduled = false;
    renderMap(store, lenses);
  });
}
function applyZoomThrottled(store, lenses, factor, focal) {
  computeZoomState(store, factor, focal);
  scheduleZoomRender(store, lenses);
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

// v11 Part 20.2: predicts whether this knot's own
// resolving zoom (the exact call zoomToCluster() makes, below in
// renderMap()) leaves every member mutually solo, so the knot's own
// aria-label never promises a separation this click won't deliver. Reuses
// computeViewBoxForLocations() (the real next viewBox) and the identical
// pairwise-distance check clusterPins() already runs, above -- no new
// geometry, no new threshold. containerWidthPx is this render's own
// already-measured value, used as a same-session proxy for the next
// render's container width -- named as an approximation, not hidden, in
// the spec (same craft-latitude class as ZOOM_STEP/CLUSTER_PX_THRESHOLD
// themselves).
function knotWillFullySeparate(group, containerWidthPx) {
  const nextViewBox = parseViewBox(computeViewBoxForLocations(group.map((p) => p.loc)));
  const nextPxPerWorldUnit = containerWidthPx / nextViewBox.w;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const dx = (group[i].cx - group[j].cx) * nextPxPerWorldUnit;
      const dy = (group[i].cy - group[j].cy) * nextPxPerWorldUnit;
      if (Math.sqrt(dx * dx + dy * dy) < CLUSTER_PX_THRESHOLD) return false;
    }
  }
  return true;
}

// v10 Part 12.3: which solo pins' persistent labels get suppressed because
// they'd visually collide with another one at borderline distances (a real,
// flagged gap in the spec's own review — a named minimum fallback, not left
// unhandled). Greedy, deterministic, same stable-sort idiom Ruling 2/Ruling 4
// already use elsewhere in this file: earlier location_id keeps its label; a
// later one that would overlap an already-kept label is suppressed (falls
// back to hover/tap discovery, the same mechanism a knotted pin already uses
// one zoom level down — not an invented third behavior). The overlap check
// itself is a deliberately crude AABB estimate (character-count-based
// width, no canvas measureText call) — good enough to catch real collisions,
// not pixel-exact typesetting (an untested-on-a-render judgment call, named
// as such, not asserted as settled).
function computeLabelSuppressions(soloEntries, pxPerWorldUnit) {
  const sorted = [...soloEntries].sort((a, b) => {
    const ai = a.loc.location_id, bi = b.loc.location_id;
    return ai < bi ? -1 : ai > bi ? 1 : 0;
  });
  const kept = [];
  const suppressed = new Set();
  const halfWidth = (entry) => (entry.loc.display_name.length * LABEL_AVG_CHAR_WIDTH_PX) / 2;
  for (const entry of sorted) {
    const collides = kept.some((other) => {
      const dxPx = (entry.cx - other.cx) * pxPerWorldUnit;
      const dyPx = (entry.cy - other.cy) * pxPerWorldUnit;
      return Math.abs(dxPx) < (halfWidth(entry) + halfWidth(other)) && Math.abs(dyPx) < LABEL_LINE_HEIGHT_PX;
    });
    if (collides) suppressed.add(entry.loc.location_id);
    else kept.push(entry);
  }
  return suppressed;
}

// v10 Part 12.3: the persistent name label itself — pointer-events:none
// (purely visual, never a second interactive surface), constant on-screen
// size via the same pxPerWorldUnit idiom pin radius/stroke already use
// (Part 9 item 3), offset below the pin by its own radius+halo+gap. Halo
// stroke width set inline for the same constant-on-screen reason as
// font-size; css/style.css's .location-label rule supplies the
// paint-order/stroke-color/fill.
function makeSoloLabel(svgNS, entry, pxPerWorldUnit) {
  const text = document.createElementNS(svgNS, "text");
  const offsetWorld = (PIN_RADIUS + PIN_HALO + LABEL_GAP_PX + LABEL_FONT_SIZE_PX * 0.85) / pxPerWorldUnit;
  text.setAttribute("x", entry.cx);
  text.setAttribute("y", entry.cy + offsetWorld);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("class", "location-label");
  text.style.fontSize = (LABEL_FONT_SIZE_PX / pxPerWorldUnit).toFixed(3) + "px";
  text.style.strokeWidth = (LABEL_HALO_PX / pxPerWorldUnit).toFixed(3);
  text.setAttribute("pointer-events", "none");
  // The hit-circle's own aria-label already names this place — this text is
  // a purely visual, redundant echo of it, so a screen reader shouldn't
  // hear every place name twice.
  text.setAttribute("aria-hidden", "true");
  text.textContent = entry.loc.display_name;
  return text;
}

// v8 Part 11 Ruling 2: a plain, deterministic string hash (FNV-1a) — the
// ruling's own requirement is "never random, never re-rolled on
// re-render," which needs a function of location_id alone, not
// Math.random() or any per-render/per-session state.
function stableHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Ruling 2: the small, deterministic nudge for a near-exactly-coincident
// member — angle and magnitude both derive from the hash, so the same
// location_id always nudges the same direction and distance on every
// render/zoom step (no jitter), capped at COINCIDENCE_NUDGE_MAX_PX.
function coincidenceNudgePx(locationId) {
  const h = stableHash(locationId);
  const angle = (h % 360) * (Math.PI / 180);
  const mag = ((h >>> 9) % 101) / 100 * COINCIDENCE_NUDGE_MAX_PX;
  return { dx: Math.cos(angle) * mag, dy: Math.sin(angle) * mag };
}

async function main() {
  const store = await loadStore();
  applyStoredCustomWeights(store);
  renderFooter(store);
  document.getElementById("fit-def-caption").textContent = FIT_INDEX_DEFINITION;
  const lenses = buildFeaturedLenses(store);
  renderPurposeSelector(store, lenses);
  renderMap(store, lenses);
  wireMapInteractions(store, lenses);
  const searchSlot = document.getElementById("location-search-slot");
  if (searchSlot) {
    initLocationSearch(searchSlot, store, {
      onSelectLocation: (loc) => selectSearchLocation(store, lenses, loc),
      onSelectCountry: (country) => selectSearchCountry(store, lenses, country),
    });
  }
}

// Part 26.5, map surface: zoom to the one location, then open its
// teaser — the map's own established preview idiom, reusing the exact
// mechanism zoomToCluster() already uses for the zoom itself. The
// teaser needs an entry-shaped object; rather than re-deriving the whole
// persona-dependent color/tooltip computation renderMap() already ran,
// this reads the tooltip straight off the just-rendered visual pin's own
// dataset (set by makeVisualPin(), unchanged) and recomputes redFlagCount
// with the exact same one-line filter renderMap() itself uses just above
// — cheap, deterministic, not a second copy of any real logic.
function selectSearchLocation(store, lenses, loc) {
  STATE.viewBox = parseViewBox(computeViewBoxForLocations([loc]));
  renderMap(store, lenses);
  const wrap = document.querySelector("#map-root .map-wrap");
  const hit = wrap ? wrap.querySelector(`.pin-hit-area[data-loc="${CSS.escape(loc.location_id)}"]`) : null;
  if (wrap && hit) {
    const visualPin = wrap.querySelector(`.location-pin[data-loc="${CSS.escape(loc.location_id)}"]`);
    const country = store.countriesById.get(loc.country_id);
    const redFlagCount = (store.factsByLocation.get(loc.location_id) || [])
      .filter((f) => sectionForFact(f) === "redflags" && f.value_raw !== "[GAP]").length;
    showTeaser(wrap, hit, { loc, country, tooltip: visualPin ? visualPin.dataset.tooltip : "", redFlagCount });
  } else {
    // 26.5's knot fallback: this location's resolving zoom still leaves
    // it inside a knot (near-coincident pins can stay merged at
    // MAX_SCALE) — no solo pin to open a teaser on, so the direct page
    // is the honest fallback, not a degraded one.
    location.href = withPersona(siteUrl(`l/${loc.location_id}.html`));
  }
}

// Part 26.5, map surface, country result: the zoomed frame with its
// labeled pins IS the answer — no teaser (a country isn't a pin).
function selectSearchCountry(store, lenses, country) {
  const locs = store.locations.filter((l) => l.country_id === country.country_id);
  STATE.viewBox = parseViewBox(computeViewBoxForLocations(locs));
  renderMap(store, lenses);
}

function renderPurposeSelector(store, lenses) {
  const el = document.getElementById("purpose-lists");
  const lensIds = new Set(lenses.map((l) => l.id));
  // "All thirteen, always reachable": the remaining criteria beyond the
  // three featured chips, sorted by the schema's own display_order.
  const moreCriteria = store.criteria.filter((c) => !lensIds.has(c.criterion_id));
  // Part 28.3: the dog-import facts lens no longer gets its own chip —
  // its only positive state ("rules on file") colors essentially every
  // pin the same blue via country inheritance now that all 21 countries
  // carry a conforming row, a coverage indicator, not information. It
  // stays in `lenses` (buildFeaturedLenses(), unchanged) so
  // resolveLens() still finds it by id; only the render route changes,
  // from a top-row chip to a dropdown option. Split by `kind` (Part 13's
  // own lens-kind field), not a hardcoded id check, so this stays
  // correct if a second facts lens is ever added.
  const chipLenses = lenses.filter((l) => l.kind !== "facts");
  const factsLenses = lenses.filter((l) => l.kind === "facts");

  const chipHtml = (id, label, active) =>
    `<button type="button" class="btn-chip purpose-chip${active ? " active" : ""}" data-purpose="${id || ""}">${escapeHtml(label)}</button>`;
  const factsOptionHtml = (l) =>
    `<option value="${l.id}"${STATE.lensId === l.id ? " selected" : ""}>${escapeHtml(l.label)}</option>`;

  el.innerHTML =
    chipHtml("", "Blended Fit index", !STATE.lensId) +
    chipLenses.map((l) => chipHtml(l.id, l.label, STATE.lensId === l.id)).join("") +
    `<select class="purpose-more" id="purpose-more">
      <option value="">More…</option>
      ${moreCriteria.map((c) => `<option value="${c.criterion_id}"${STATE.lensId === c.criterion_id ? " selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
      ${factsLenses.length ? `<optgroup label="Facts on file — not scored">${factsLenses.map(factsOptionHtml).join("")}</optgroup>` : ""}
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
    const persona = getActivePersona();
    if (persona === "custom") {
      // v11 Part 21: a reader-built weight vector reweights the general
      // Fit index only — no eligibility read, ever (21.7's own scope
      // boundary) — so this gets its own line rather than falling into
      // the no-fixture-persona branch below, which would wrongly claim
      // a rule-derived eligibility check that never runs for this identity.
      explainerEl.textContent = `Pins colored by your own weighted Fit index (${CUSTOM_ESTIMATE_SUFFIX}).`;
    } else if (persona && !store.fixturesByPersona.has(persona)) {
      // v9 Part 6.3: retired, not softened — full 8x38 verdict-engine
      // coverage means there is no "we haven't looked" case left for these
      // five personas, so the old faded-pins confession is now false for
      // them. Replacement points at Part 8's fuller disclosure rather than
      // carrying it here (Part 2's placement doctrine: compact surface
      // points, full explanation lives one click in).
      const displayName = persona.charAt(0).toUpperCase() + persona.slice(1);
      explainerEl.textContent = `Pins colored by ${displayName}'s rule-derived eligibility read.`;
    } else if (persona === "waldo") {
      // v10 Part 15.5: still not false before this split (Waldo's Fit
      // index genuinely is one of the two things the old shared sentence
      // named), but no longer the clearest available line now that Waldo
      // and Wenda/Carmen genuinely diverge in what colors their pins.
      explainerEl.textContent = "Pins colored by Waldo's Fit index, rescored for him where we have real data.";
    } else if (persona) {
      const displayName = persona.charAt(0).toUpperCase() + persona.slice(1);
      explainerEl.textContent = `Pins colored by ${displayName}'s visa/residency read — hand-checked where we've verified it, rule-derived elsewhere.`;
    } else {
      explainerEl.textContent = "Pins colored by the blended Fit index (or your persona's verdict, if one's picked above).";
    }
  } else {
    const lens = resolveLens(store, lenses, STATE.lensId);
    explainerEl.textContent = lens ? lens.explainerText : "";
  }
}

// v9 Part 1: the two-click pin flow. Top-level (not nested inside
// renderMap()) since wireMapInteractions() -- wired ONCE, not per render,
// per this file's own established rule for document-level listeners --
// needs to call closeTeaser() too. Both operate purely on
// document.getElementById()/querySelector(), no closure state, so neither
// needs to live inside any one render's scope.
//
// showTeaser(wrap, hitEl, entry): builds and positions the teaser for one
// pin. Content is the four lines Part 1.3 specs: title, the exact
// entry.tooltip string already computed for this pin this render (zero
// new copy), the red-flag badge (only if any), and the "See the full
// page" CTA -- a real <a href>, not a synthetic click re-dispatch, per
// this project's own established <a>-over-<button>-for-navigation
// precedent (v9 Part 5.1) -- its href is the identical destination go()
// would navigate to, so "clicking the CTA" and "activating the pin again"
// are two paths to the same place, matching the spec's own "calls the
// existing go() unchanged" framing in substance even though the CTA is a
// real link rather than a re-dispatched call.
function showTeaser(wrap, hitEl, entry) {
  const teaserEl = document.getElementById("pin-teaser");
  if (!teaserEl) return;
  // Only one teaser is ever meaningfully open at a time, but a prior
  // pin's hit-circle is a real, still-live DOM node (opening a teaser
  // doesn't itself trigger a renderMap() call) -- clear its aria-expanded
  // before marking the new one, so two hit-circles never both claim it.
  document.querySelectorAll('.pin-hit-area[aria-expanded="true"]').forEach((h) => {
    if (h !== hitEl) { h.setAttribute("aria-expanded", "false"); h.removeAttribute("aria-describedby"); }
  });
  const pageHref = withPersona(siteUrl(`l/${entry.loc.location_id}.html`));
  const redFlagLine = entry.redFlagCount > 0
    ? `<a class="redflag-pointer" href="${pageHref}#sec-redflags">${entry.redFlagCount} red flag${entry.redFlagCount === 1 ? "" : "s"} noted &#9656;</a>`
    : "";
  teaserEl.innerHTML = `
    <p class="teaser-title">${escapeHtml(entry.loc.display_name)}, ${escapeHtml(entry.country.name)}</p>
    <p class="teaser-line">${escapeHtml(entry.tooltip)}</p>
    ${redFlagLine}
    <p class="teaser-cta"><a href="${pageHref}">See the full page &rarr;</a></p>
  `;
  teaserEl.dataset.locId = entry.loc.location_id;
  teaserEl.setAttribute("aria-label", `${entry.loc.display_name} preview`);
  // Two-pass positioning: place off-screen-but-measurable first so
  // offsetWidth reads the real rendered box before the width clamp below
  // decides the final left. Correction: showTip() -- the hover tooltip --
  // only clamps left/top to a minimum of 0, it does not already clamp
  // width against the wrap's right edge. This teaser adds that clamp
  // itself, since its ~280px width is a real overflow risk on a narrow
  // viewport that the hover tooltip's shorter one-line text mostly avoids
  // in practice.
  teaserEl.style.visibility = "hidden";
  teaserEl.style.display = "block";
  const rect = wrap.getBoundingClientRect();
  const targetRect = hitEl.getBoundingClientRect();
  // A real bug found by live-rendering this, not reasoned about: showTip()'s
  // own offset (+10px from the hit-circle's own top-left corner) is fine for
  // a tooltip nothing needs to click through, but the hit-circle here is
  // ~44px across (HIT_RADIUS_PX=22 diameter) -- a flat 10px offset buries
  // almost the entire circle under a 280px-wide teaser, silently breaking
  // 1.1's own "activating the pin again" second-click path for a mouse user
  // (confirmed live: a second click landed on the teaser, not the pin,
  // every time). Anchored off the hit-circle's own right edge instead, so
  // the whole circle stays exposed and clickable while its teaser is open.
  let left = Math.max(0, targetRect.right - rect.left + 6);
  const top = Math.max(0, targetRect.top - rect.top - 10);
  const maxLeft = Math.max(0, rect.width - teaserEl.offsetWidth - 4);
  left = Math.min(left, maxLeft);
  teaserEl.style.left = left + "px";
  teaserEl.style.top = top + "px";
  teaserEl.style.visibility = "visible";
  hitEl.setAttribute("aria-expanded", "true");
  hitEl.setAttribute("aria-describedby", "pin-teaser");
  // The hover tooltip is a separate, lighter mechanism (Part 1.5) that can
  // still be showing from the same pointer that just clicked -- hiding it
  // here is a small, unspecced polish (not asked for in the text) so the
  // two don't visually stack on the same pin; the tooltip itself is
  // otherwise completely unaffected (still shows on hover as before).
  const tipEl = document.getElementById("pin-tooltip");
  if (tipEl) tipEl.style.display = "none";
  const link = teaserEl.querySelector(".teaser-cta a");
  if (link) link.focus();
}

// closeTeaser(returnFocus): closes without navigating (click-outside,
// Escape). returnFocus moves focus back to the pin that opened it (Part
// 1.4's "or Escape back to the pin") -- click-outside deliberately does
// NOT steal focus back (the reader clicked somewhere else on purpose).
function closeTeaser(returnFocus) {
  const teaserEl = document.getElementById("pin-teaser");
  if (!teaserEl) return;
  const wasOpen = teaserEl.style.display !== "none" && !!teaserEl.innerHTML;
  teaserEl.style.display = "none";
  teaserEl.innerHTML = "";
  delete teaserEl.dataset.locId;
  const openHit = document.querySelector('.pin-hit-area[aria-expanded="true"]');
  if (openHit) {
    openHit.setAttribute("aria-expanded", "false");
    openHit.removeAttribute("aria-describedby");
    if (returnFocus && wasOpen) openHit.focus();
  }
}

function renderMap(store, lenses) {
  const root = document.getElementById("map-root");
  root.innerHTML = "";
  if (!STATE.viewBox) STATE.viewBox = homeViewBox(store);

  const activeLens = resolveLens(store, lenses, STATE.lensId);
  const persona = activeLens ? null : getActivePersona();

  // v12 Part 22.7: calibrate the fit-index color bands over the values
  // this render will actually show — the full location set under the
  // active view's own index basis (a persona's or the reader's custom
  // index when one is active, the general index otherwise; personaIndex()
  // already falls back to the general figure wherever no persona-specific
  // read exists, which is exactly the value each pin branch below
  // renders). Recomputed here, every render, so a persona/lens switch
  // recalibrates at the same moment the pins already recolor — one basis
  // per view, never mixed. Score-kind lens pins are raw per-criterion
  // values and keep the linear scoreToColor() mapping (consumer split).
  calibrateIndexBands(store.locations.map((l) => {
    const idx = persona ? store.personaIndex(persona, l.location_id) : store.generalIndex(l.location_id);
    return idx ? idx.value : null;
  }));

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

    // Part 23.9: verification status as a pin-level modifier, not a second
    // legend block. True only when this specific pin's persona verdict
    // came from a hand fixture (Wenda/Carmen, wherever one exists for this
    // location) — never for Waldo (a different claim type by design, his
    // fill is always the Fit index, never a verdict) and never for the
    // five no-fixture personas (they have no hand fixture anywhere, so
    // this stays false for them by construction, not a special case).
    let fill, tooltip, eliminated = false, gap = false, faded = false, handChecked = false;

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
          // 2026-07-16 readability fix: a fact's own value_raw is often
          // several distinct clauses run together in one dense sentence
          // (real content, bad presentation) —
          // splitFactSentences() breaks it onto real lines at sentence/
          // semicolon boundaries only (see app-shared.js for why not
          // commas). Multiple facts for one location each get their own
          // labeled block, blank-line separated, instead of one run-on
          // space-joined string.
          const blocks = facts.map((f) => {
            const body = splitFactSentences(f.text).join("\n");
            return facts.length > 1 ? `${f.label}:\n${body}` : body;
          });
          tooltip = `${loc.display_name}, ${country.name} — Dog import:\n${blocks.join("\n\n")}`;
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
      // Part 15.4: Waldo's Fit index (place quality, persona-rescored where
      // we have real data) and the engine's verdict (visa/residency
      // eligibility) are different claim types, not two richness levels of
      // the same claim — the pin's color channel stays Fit-index-only,
      // unchanged (one-meaning-per-channel doctrine, v8 R1). When no
      // rescore exists but the engine has an answer, that answer rides as
      // a second, clearly distinguished tooltip line instead of changing
      // the pin's color.
      const idx = store.personaIndex("waldo", loc.location_id);
      const value = idx ? idx.value : null;
      const hasPersonaRescore = !!(idx && idx.personaAdjusted === true);
      fill = indexToColor(value);
      gap = isGapValue(value);
      const headline = buildFitHeadline(store, "waldo", loc, country, value);
      const baseTooltip = `${headline}\nWaldo's Fit index: ${value != null ? value.toFixed(1) : "n/a"}/5`;
      if (hasPersonaRescore) {
        faded = false;
        tooltip = baseTooltip;
      } else {
        const engineVerdict = resolveVerdict(store, "waldo", loc);
        if (engineVerdict) {
          faded = false;
          const stateText = STATE_HEADLINE[engineVerdict.overall_state] || engineVerdict.overall_state;
          // Same no-bare-no instead-line every other
          // branch in this file carries, extended here too. Waldo's own pin
          // color/eliminated channel stays Fit-index-only per Part 15.4 —
          // untouched — but the tooltip's own text can still read as a bare
          // hard no, so it gets the same reassurance line, gated on
          // bandVisual()'s `eliminated` flag exactly like everywhere else.
          const insteadLine = bandVisual(engineVerdict.overall_band).eliminated
            ? `\nVisiting short-term is a separate question — open this place's page for the short-stay rules.`
            : "";
          const confSuffix = verdictConfidenceSuffix(engineVerdict.confidence_tier, engineVerdict.overall_band);
          tooltip = `${baseTooltip}\nWaldo's visa/residency check: ${stateText}${confSuffix}${insteadLine}`;
        } else {
          // Defensive fallback only — full 8x38 engine coverage today.
          faded = true;
          tooltip = baseTooltip;
        }
      }
    } else if (persona === "wenda" || persona === "carmen") {
      const general = store.generalIndex(loc.location_id);
      const displayName = persona.charAt(0).toUpperCase() + persona.slice(1);
      const perLoc = store.fixturesByPersona.get(persona)?.get(loc.location_id);
      const verdict = perLoc?.verdict;
      const hasCriterionFixtures = perLoc && perLoc.criteria && perLoc.criteria.size > 0;
      const idx = hasCriterionFixtures ? store.personaIndex(persona, loc.location_id) : null;
      const underlyingValue = idx ? idx.value : (general ? general.value : null);
      // Part 15.3: engine checked second, only when no hand fixture verdict
      // answers this location — same precedence as location.js's
      // buildVerdictBlock (15.2), same engine the five-persona branch below
      // already uses.
      const engineVerdict = !verdict ? resolveVerdict(store, persona, loc) : null;
      const hasRealRead = !!verdict || hasCriterionFixtures || !!engineVerdict;
      fill = indexToColor(underlyingValue);
      gap = isGapValue(underlyingValue);
      faded = !hasRealRead;
      if (verdict) {
        handChecked = true;
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
      } else if (engineVerdict) {
        const visual = bandVisual(engineVerdict.overall_band);
        fill = visual.color;
        gap = visual.gap;
        eliminated = visual.eliminated;
        const stateText = STATE_HEADLINE[engineVerdict.overall_state] || engineVerdict.overall_state;
        // Same instead-line as the `if (verdict)`
        // branch just above, extended to this engine-only case.
        const insteadLine = visual.eliminated
          ? `\nVisiting short-term is a separate question — open this place's page for the short-stay rules.`
          : "";
        const confSuffix = verdictConfidenceSuffix(engineVerdict.confidence_tier, engineVerdict.overall_band);
        tooltip = `${loc.display_name}, ${country.name} — ${displayName}'s check: ${stateText}${confSuffix}\n(Fit index shown: ${underlyingValue != null ? underlyingValue.toFixed(1) : "n/a"}/5 — a different question, place quality not eligibility)${insteadLine}`;
      } else {
        // v8 Part 10 Ruling 2: knowledge-first — the general fit headline,
        // then the general Fit index (labeled as such), then the existing
        // canonical "not checked yet" line last, not alone. Zero new
        // authorship: same buildFitHeadline() mechanism the no-persona
        // branch below already uses, and the exact same closing sentence
        // this branch always rendered, just no longer the WHOLE tooltip.
        // Defensive fallback only — full 8x38 engine coverage today (Part
        // 15.3).
        const generalHeadline = buildFitHeadline(store, null, loc, country, underlyingValue);
        tooltip = `${generalHeadline}\nFit index: ${underlyingValue != null ? underlyingValue.toFixed(1) + "/5" : "not yet scored"} (general figures)\n${loc.display_name}, ${country.name} — not checked yet for this persona.`;
      }
    } else if (persona === "custom") {
      // v11 Part 21 / 8P: a reader-built weight vector never renders a
      // visa/eligibility verdict (21.7's own scope boundary) — this pin's
      // color/tooltip come from the exact same generalIndex()-shaped
      // computation every other pin uses, just weighted by the reader's
      // own answers instead of the site's fixed weight classes. No
      // fixture, no engine verdict, ever, for this identity — eliminated/
      // gap/faded all stay at their default (false) the same way the
      // no-persona branch below leaves them.
      const idx = store.personaIndex("custom", loc.location_id);
      const value = idx ? idx.value : null;
      fill = indexToColor(value);
      gap = isGapValue(value);
      const headline = buildFitHeadline(store, null, loc, country, value);
      tooltip = `${headline}\nFit index: ${value != null ? value.toFixed(1) + "/5" : "not yet scored"} (${CUSTOM_ESTIMATE_SUFFIX})`;
    } else if (persona) {
      // v9 Part 6: the five personas with zero hand fixtures anywhere now
      // get a real, rule-derived read from the verdict-coverage engine
      // (derived/verdicts.jsonl, full 8x38 coverage, confirmed by direct
      // count) instead of the uniform fade this branch used to render
      // unconditionally. `faded` is never set in this branch anymore —
      // Part 6.3: full coverage means there's no "we haven't looked" case
      // left for these five; a `data_gap` answer is a different, weaker
      // claim ("the engine looked and the facts don't reach an answer"),
      // gets its own color below, not the fade treatment.
      const displayName = persona.charAt(0).toUpperCase() + persona.slice(1);
      const verdict = resolveVerdict(store, persona, loc);
      const general = store.generalIndex(loc.location_id);
      const generalValue = general ? general.value : null;
      if (verdict) {
        const visual = bandVisual(verdict.overall_band);
        fill = visual.color;
        gap = visual.gap;
        eliminated = visual.eliminated;
        const stateText = STATE_HEADLINE[verdict.overall_state] || verdict.overall_state;
        // Same instead-line as the Wenda/Carmen and
        // Waldo engine branches above — the five-no-fixture-persona case
        // (Adira, Teo, Noa, Marek, Marguerite).
        const insteadLine = visual.eliminated
          ? `\nVisiting short-term is a separate question — open this place's page for the short-stay rules.`
          : "";
        const confSuffix = verdictConfidenceSuffix(verdict.confidence_tier, verdict.overall_band);
        tooltip = `${loc.display_name}, ${country.name} — ${displayName}'s check: ${stateText}${confSuffix}\n(Fit index shown: ${generalValue != null ? generalValue.toFixed(1) : "n/a"}/5 — a different question, place quality not eligibility)${insteadLine}`;
      } else {
        // Defensive fallback only — the engine ships full 8x38 coverage
        // today (verified directly, zero nulls), so this branch is not
        // expected to fire for any of today's five personas/38 locations.
        // Kept so a genuinely missing verdict row, or a future ninth
        // no-fixture persona the engine hasn't run for yet, degrades to
        // the pre-v9 honest "not checked" shape instead of a blank pin.
        fill = indexToColor(generalValue);
        gap = isGapValue(generalValue);
        faded = true;
        const headline = buildFitHeadline(store, null, loc, country, generalValue);
        tooltip = `${headline}\nFit index: ${generalValue != null ? generalValue.toFixed(1) + "/5" : "not yet scored"} (general figures)\n${loc.display_name}, ${country.name} — not checked yet for this persona.`;
      }
    } else {
      const general = store.generalIndex(loc.location_id);
      fill = indexToColor(general ? general.value : null);
      gap = isGapValue(general ? general.value : null);
      const headline = buildFitHeadline(store, null, loc, country, general ? general.value : null);
      tooltip = `${headline}\nFit index: ${general ? general.value.toFixed(1) + "/5" : "not yet scored"}`;
    }

    // v9 Part 1.3: the teaser's red-flag line, universal across all 38
    // locations -- same filter buildVerdictBlock() (location.js) already
    // uses, computed here so the teaser can show it without a second fetch.
    const redFlagCount = (store.factsByLocation.get(loc.location_id) || [])
      .filter((f) => sectionForFact(f) === "redflags" && f.value_raw !== "[GAP]").length;

    pinEntries.push({ loc, country, cx, cy, fill, tooltip, eliminated, gap, faded, redFlagCount, handChecked });
  }

  const wrap = document.createElement("div");
  wrap.className = "map-wrap";
  wrap.appendChild(svg);
  const tip = document.createElement("div");
  tip.className = "pin-label-tooltip";
  tip.id = "pin-tooltip";
  wrap.appendChild(tip);
  // v9 Part 1.2: the teaser card -- same sibling-of-#pin-tooltip
  // placement, same "built once per renderMap() call" idiom as tip/
  // zoomControls above. Content is filled in by showTeaser() on first
  // pin activation (Part 1.1); empty and hidden until then.
  const teaser = document.createElement("div");
  teaser.className = "pin-teaser";
  teaser.id = "pin-teaser";
  teaser.setAttribute("role", "dialog");
  wrap.appendChild(teaser);
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

  // v10 §13.4: ground layer, appended here — after grain/Ormen Lange (both
  // already in the SVG's child list above) and strictly before any pin
  // below (none have been appended yet at this point in the function) — so
  // paint order alone, not a z-index, guarantees a pin never renders behind
  // its own local terrain, same rule Part 12.1's grain fix already
  // established for this file.
  renderTerrain(svg, svgNS, pinEntries, pxPerWorldUnit);

  // v10 Part 12.3: label-collision fallback, computed once up front (needs
  // every solo pin's true screen position relative to every other, not just
  // its own neighbors) so the render loop below can just check membership.
  // Reasonable-and-simple call, named plainly (spec left this open): earlier
  // location_id keeps its label; a later one that would visually collide
  // with an already-kept label falls back to hover/tap discovery only — the
  // exact mechanism a knotted pin already uses one zoom level down, not an
  // invented third behavior.
  const soloEntries = groups.filter((g) => g.length === 1).map((g) => g[0]);
  const suppressedLabels = computeLabelSuppressions(soloEntries, pxPerWorldUnit);

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

  // v8 Part 11 §11.3 item 1: the visible pin is purely a color/shape mark
  // now — every interactive affordance (click/keydown/hover/focus) moves
  // onto a larger, invisible hit-circle layered on top (built by the two
  // branches below), so the small precise dot never has to double as the
  // touch target. aria-hidden here on purpose: the hit-circle carries the
  // accessible name instead, so screen readers see one described control
  // per place, not two.
  function makeVisualPin(entry) {
    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("cx", entry.cx);
    circle.setAttribute("cy", entry.cy);
    // Part 9 item 3: constant on-screen size, not constant map-unit size.
    // 2026-07-15 fix: the original idiom (PIN_RADIUS divided by a
    // zoom-only "scale" ratio) only holds
    // "constant" for a fixed container width — it silently shrinks on a
    // narrower viewport, because that ratio never accounts for how many
    // real CSS pixels the current render's container actually spans.
    // pxPerWorldUnit (below, same value the hit-circles already use —
    // §11.3 item 1's own fix for the identical bug class) folds container
    // width AND zoom into one number, so dividing by it holds the pin at
    // a true ~PIN_RADIUS CSS-pixel radius on any device, at any zoom.
    circle.setAttribute("r", (PIN_RADIUS / pxPerWorldUnit).toFixed(3));
    circle.style.setProperty("--pin-stroke", (PIN_HALO / pxPerWorldUnit).toFixed(3));
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
    circle.setAttribute("aria-hidden", "true");
    circle.dataset.tooltip = entry.tooltip;
    circle.dataset.loc = entry.loc.location_id;
    return circle;
  }

  // Part 23.9: the verification-status ring — a second, unfilled,
  // slightly-larger-radius stroke circle, same pxPerWorldUnit-scaled idiom
  // the visible pin's own radius/stroke already use (constant on-screen
  // size at any zoom/device width). Pure geometry (presence/absence of a
  // stroke), zero reliance on hue — survives any CVD simulation by
  // construction, and doesn't collide with any existing encoded channel
  // (fill carries verdict meaning; the hatch/gap-stroke carry the
  // hard_fail/data_gap distinction; pin-faded's opacity carries a
  // different claim — "no read exists at all," not "how was this
  // answered"). Returns null (nothing appended) whenever the entry isn't
  // hand-checked — the common case, so most pins pay zero extra markup.
  function makeHandCheckedRing(entry) {
    if (!entry.handChecked) return null;
    const ring = document.createElementNS(svgNS, "circle");
    ring.setAttribute("cx", entry.cx);
    ring.setAttribute("cy", entry.cy);
    ring.setAttribute("r", ((PIN_RADIUS + PIN_HALO + HAND_CHECKED_RING_GAP) / pxPerWorldUnit).toFixed(3));
    ring.style.setProperty("--ring-stroke", (HAND_CHECKED_RING_STROKE_PX / pxPerWorldUnit).toFixed(3));
    ring.setAttribute("class", "hand-checked-ring");
    ring.setAttribute("aria-hidden", "true");
    return ring;
  }

  // Shared by both the solo hit-circle and the knot's own shared hit-shape
  // below: toggles a "lifted" look on the paired visual pin(s) while the
  // hit-circle itself has mouse/keyboard focus (§11.4 item 3 — reactive
  // only, no ambient motion) and shows/hides the existing tooltip.
  function wireHover(hit, visualPins, tooltipText) {
    const enter = (e) => {
      for (const p of visualPins) p.classList.add("pin-lift");
      showTip(e, tooltipText);
    };
    const leave = () => {
      for (const p of visualPins) p.classList.remove("pin-lift");
      hideTip();
    };
    hit.addEventListener("mouseenter", enter);
    hit.addEventListener("focus", enter);
    hit.addEventListener("mouseleave", leave);
    hit.addEventListener("blur", leave);
  }

  // v10 Part 12.2: a one-shot settle-on-release animation, additive beside
  // wireHover()'s own lift (unchanged). Wired to the solo hit-circle only
  // (below) — NOT the knot's shared hit-shape, a real technical reason, not
  // §11.4's "no single visual element to lift" reasoning repeated: a knot's
  // click handler (zoomToCluster(), below) synchronously wipes and rebuilds
  // #map-root's whole innerHTML in the same task pointerup's class-add
  // already ran in (pointerup always fires before click, same synchronous
  // task, no paint between them) — the animating circle would be destroyed
  // before the browser ever gets to paint its first frame, a dead, inert
  // effect, not a degraded one. Confirmed by reading zoomToCluster() itself,
  // not just reasoned — named as an open uncertainty since this specific
  // negative (an animation that provably never paints) hasn't been visually
  // confirmed to show nothing, only traced via the synchronous call chain
  // that would prevent it. pointerup (not a mouseup+touchend
  // pair) per the spec's own explicit, scoped deviation (§12.2) — avoids
  // the synthetic-mouse-event double-fire a touch would otherwise also
  // trigger; keyup parity for the existing Enter/Space activation keys,
  // matching this project's own convention elsewhere. The class is
  // force-removed then re-added (a reflow forced between, via a read of
  // offsetWidth) so a repeat tap always restarts the animation from its own
  // 0% frame, per the spec's own implementation note — without the reflow,
  // re-adding a class already present is a no-op and the animation
  // wouldn't restart.
  function wireSettle(hit, visualPins) {
    const settle = () => {
      for (const p of visualPins) {
        p.classList.remove("pin-settle");
        void p.offsetWidth;
        p.classList.add("pin-settle");
      }
    };
    hit.addEventListener("pointerup", settle);
    hit.addEventListener("keyup", (e) => { if (isActivationKey(e)) settle(); });
  }

  for (const group of groups) {
    if (group.length === 1) {
      // v8 Part 11 §11.3 item 1: solo pins were already under the mobile
      // touch-target floor (visible radius 9px vs. the ~44px/22px-radius
      // guidance every mobile convention converges on) — a real, separate
      // finding from the knot redesign, folded in because it's the same
      // real-device touch-target concern the knot redesign itself exists
      // to fix.
      const entry = group[0];
      const visualPin = makeVisualPin(entry);
      svg.appendChild(visualPin);
      const ring = makeHandCheckedRing(entry);
      if (ring) svg.appendChild(ring);

      const hit = document.createElementNS(svgNS, "circle");
      hit.setAttribute("cx", entry.cx);
      hit.setAttribute("cy", entry.cy);
      // pxPerWorldUnit (not the old zoom-only "scale" ratio, since retired
      // from this file — see makeVisualPin()'s own 2026-07-15 fix note)
      // is the CURRENT render's own true screen-px-per-world-unit ratio,
      // already device-width-aware and recomputed every render, so
      // dividing by it gives a genuinely constant ~HIT_RADIUS_PX CSS
      // pixels on any device. A real mobile-viewport Playwright pass
      // caught the old idiom's shrink concretely (a 22-world-unit radius
      // rendered as ~24 real CSS px on a 390px-wide viewport, well under
      // the ~44px target) before this fix existed.
      hit.setAttribute("r", (HIT_RADIUS_PX / pxPerWorldUnit).toFixed(3));
      hit.setAttribute("fill", "transparent");
      hit.setAttribute("class", "pin-hit-area");
      hit.setAttribute("tabindex", "0");
      hit.setAttribute("role", "link");
      hit.setAttribute("aria-label", `${entry.loc.display_name}, ${entry.country.name}`);
      hit.setAttribute("aria-expanded", "false");
      // Part 26.5: the location search's own post-select lookup needs a
      // solo pin's hit-area findable by location_id — the visible circle
      // already carries this (makeVisualPin(), above); the hit-area alone
      // didn't until this Part touched it.
      hit.dataset.loc = entry.loc.location_id;
      const go = () => { location.href = withPersona(siteUrl(`l/${entry.loc.location_id}.html`)); };
      // v9 Part 1.1: solo pins only (knots, below, are unaffected -- 1.6).
      // First activation opens the teaser (showTeaser, above); a second
      // activation on this SAME pin -- this hit-circle's own aria-expanded
      // already true -- calls the existing go() unchanged. The teaser's own
      // CTA link is a second, independent way to reach the same page
      // (a real <a href>, not routed through this function at all).
      const activatePin = () => {
        if (hit.getAttribute("aria-expanded") === "true") { go(); return; }
        showTeaser(wrap, hit, entry);
      };
      hit.addEventListener("click", activatePin);
      hit.addEventListener("keydown", (e) => { if (isActivationKey(e)) { e.preventDefault(); activatePin(); } });
      wireHover(hit, [visualPin], entry.tooltip);
      wireSettle(hit, [visualPin]);
      svg.appendChild(hit);

      // v10 Part 12.3: a solo pin (this exact branch — group.length === 1)
      // earns a persistent name label the moment it declusters, tied to the
      // same zoom event that already gives it independent tap-target
      // status. Suppressed for a location whose label would visually
      // collide with an already-kept one (computeLabelSuppressions, above)
      // — that location still gets its name via hover/tap, same as any
      // knotted pin.
      if (!suppressedLabels.has(entry.loc.location_id)) {
        svg.appendChild(makeSoloLabel(svgNS, entry, pxPerWorldUnit));
      }
    } else {
      // v8 Part 11 Ruling 1: no centroid badge — retire the merged-circle-
      // plus-numeral mechanism entirely. Every member renders as its own
      // real, individually colored pin at its own true position, carrying
      // the same fill/tooltip/gap/faded/eliminated treatment it would get
      // standalone (Part 1's three-claims color doctrine is untouched;
      // only whether pins may visually collide changes here).

      // Ruling 4, second cap: stable sort by location_id (not draw order,
      // which comes from clusterPins()'s own union-find and isn't stable
      // across renders) so the same members render, in the same order, on
      // every repaint; draw at most RENDER_CAP of them as real circles.
      const sortedGroup = [...group].sort((a, b) => {
        const ai = a.loc.location_id, bi = b.loc.location_id;
        return ai < bi ? -1 : ai > bi ? 1 : 0;
      });
      const rendered = sortedGroup.slice(0, RENDER_CAP);

      // Ruling 2: near-exact coincidence (true on-screen distance under
      // COINCIDENCE_PX_THRESHOLD) gets a small, deterministic, capped
      // nudge — checked only among the members actually drawn, since an
      // unrendered member has no visual position to collide at. Exactly
      // one mover per coincident pair (the later location_id in sort
      // order), so the same member always moves and the pair never both
      // move toward each other.
      const nudgedPos = new Map(); // location_id -> {cx, cy}
      for (let i = 0; i < rendered.length; i++) {
        for (let j = i + 1; j < rendered.length; j++) {
          const a = rendered[i], b = rendered[j];
          const dxPx = (a.cx - b.cx) * pxPerWorldUnit;
          const dyPx = (a.cy - b.cy) * pxPerWorldUnit;
          if (Math.sqrt(dxPx * dxPx + dyPx * dyPx) < COINCIDENCE_PX_THRESHOLD && !nudgedPos.has(b.loc.location_id)) {
            const off = coincidenceNudgePx(b.loc.location_id);
            nudgedPos.set(b.loc.location_id, { cx: b.cx + off.dx / pxPerWorldUnit, cy: b.cy + off.dy / pxPerWorldUnit });
          }
        }
      }

      // Ruling 4: the density cue — growth shared by the ambient-shadow
      // silhouette (visual, §11.4) and the shared hit-shape (functional,
      // Ruling 3) below, so both read as the same knot getting "bigger,"
      // not two independently tuned sizes.
      const growthPx = Math.min(group.length - 1, DENSITY_CAP) * GROWTH_PER_MEMBER;

      const centroidCx = group.reduce((s, p) => s + p.cx, 0) / group.length;
      const centroidCy = group.reduce((s, p) => s + p.cy, 0) / group.length;
      // Real spread of the group's own true positions — ALL members, not
      // just the rendered subset, so the hit-shape keeps covering every
      // real point zoom-to-fit can still reach (Ruling 4's own "still
      // fully reachable" requirement), not only the dozen actually drawn.
      let spreadWorld = 0;
      for (const p of group) {
        const dx = p.cx - centroidCx, dy = p.cy - centroidCy;
        spreadWorld = Math.max(spreadWorld, Math.sqrt(dx * dx + dy * dy));
      }
      // Real screen pixels for the CURRENT device (see the solo hit-circle
      // comment above, and makeVisualPin()'s own note, for why
      // pxPerWorldUnit — not a zoom-only ratio — is the correct
      // conversion for anything sized on this map).
      const spreadPx = spreadWorld * pxPerWorldUnit;

      // §11.4: the "ambient shadow" silhouette — a soft, oxblood-family
      // disc behind the real pins, sized off the SAME growth term the
      // hit-shape uses below, so a bigger knot visibly reads bigger before
      // a reader counts overlapping edges. Not a proxy shape standing in
      // for the group (Ruling 1 forbids that) — purely atmospheric, no
      // fill meaning, no tooltip, no interactivity of its own; painted
      // under the real pins. Reuses the exact map-plate oxblood shadow
      // value (Part 2), not a new color.
      const shadow = document.createElementNS(svgNS, "circle");
      shadow.setAttribute("cx", centroidCx);
      shadow.setAttribute("cy", centroidCy);
      shadow.setAttribute("r", (((PIN_RADIUS + PIN_HALO) + growthPx) / pxPerWorldUnit).toFixed(3));
      shadow.setAttribute("fill", "rgba(140, 47, 27, 0.08)");
      shadow.setAttribute("class", "knot-shadow");
      shadow.setAttribute("aria-hidden", "true");
      shadow.setAttribute("pointer-events", "none");
      svg.appendChild(shadow);

      const visualPins = [];
      for (const entry of rendered) {
        const pos = nudgedPos.get(entry.loc.location_id);
        const drawEntry = pos ? { ...entry, cx: pos.cx, cy: pos.cy } : entry;
        const pin = makeVisualPin(drawEntry);
        svg.appendChild(pin);
        visualPins.push(pin);
        const ring = makeHandCheckedRing(drawEntry);
        if (ring) svg.appendChild(ring);
      }

      // Ruling 3: one shared invisible hit-shape wrapping the group's real
      // footprint (base touch-target floor + real spread + the same
      // density growth as the shadow above) — the ONLY interactive
      // surface for this knot while its members overlap. Individual member
      // pins get no click/keyboard handler of their own (built above with
      // none). Reuses computeViewBoxForLocations() and the existing
      // aria-label pattern unchanged, since both were already honest and
      // never claimed a bare count as their own visual.
      const hitRadiusWorld = (HIT_RADIUS_PX + spreadPx + growthPx) / pxPerWorldUnit;
      const hit = document.createElementNS(svgNS, "circle");
      hit.setAttribute("cx", centroidCx);
      hit.setAttribute("cy", centroidCy);
      hit.setAttribute("r", hitRadiusWorld.toFixed(3));
      hit.setAttribute("fill", "transparent");
      hit.setAttribute("class", "pin-hit-area");
      hit.setAttribute("tabindex", "0");
      hit.setAttribute("role", "button");
      const names = group.map((p) => p.loc.display_name).join(", ");
      // v11 Part 20.2: the label's own "and separate
      // them" claim only renders when this knot's own resolving zoom will
      // actually leave every member mutually solo (knotWillFullySeparate(),
      // above) -- otherwise the mechanically-true "for a closer look" runs
      // instead, so the label never promises a separation the click won't
      // deliver. Same member names either way; only the closing promise
      // changes.
      const separates = knotWillFullySeparate(group, containerWidthPx);
      const promise = separates ? "Activate to zoom in and separate them." : "Activate to zoom in for a closer look.";
      hit.setAttribute("aria-label", `${group.length} locations close together: ${names}. ${promise}`);
      const zoomToCluster = () => {
        STATE.viewBox = parseViewBox(computeViewBoxForLocations(group.map((p) => p.loc)));
        renderMap(store, lenses);
      };
      hit.addEventListener("click", zoomToCluster);
      hit.addEventListener("keydown", (e) => { if (isActivationKey(e)) { e.preventDefault(); zoomToCluster(); } });
      // No wireHover() here on purpose: §11.4 item 3's reactive lift
      // describes a single pin's own tactile feedback; a knot has no one
      // visual element to "lift," so the shared hit-shape gets the same
      // click/keyboard affordance the old badge had (a plain cursor, no
      // tooltip) rather than an invented multi-pin lift effect. Named as a
      // judgment call, not an explicit ruling either way, in the report.
      svg.appendChild(hit);
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
    // Throttled path (2026-07-16 fix): a fast scroll/trackpad gesture fires
    // dozens-to-hundreds of these in under a second — see applyZoomThrottled()'s
    // own header comment for the reproduced freeze this replaces.
    applyZoomThrottled(store, lenses, e.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP, focal);
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
      // Throttled path (2026-07-16 fix, same reason as the wheel handler
      // above): a real 2-finger pinch fires touchmove just as rapidly as a
      // wheel gesture does. Safe with the pivot-from-start line above since
      // computeZoomState() still runs synchronously on every raw event —
      // only the render itself is batched, so the final result is exactly
      // as correct as before, just painted at most once per frame.
      applyZoomThrottled(store, lenses, factor, focal);
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

  // v9 Part 1.1/1.4: click-outside and Escape close an open teaser without
  // navigating. Wired ONCE here, not inside renderMap() -- #pin-teaser is
  // torn down and rebuilt fresh by every renderMap() call the same way
  // #map-root's other children are, so a listener added inside renderMap()
  // itself would accumulate one per render (this function's own header
  // comment already names that exact leak class for wheel/touch; closeTeaser()
  // and showTeaser() operate purely on document.getElementById()/
  // querySelector(), so neither needs re-wiring per render either).
  document.addEventListener("click", (e) => {
    const teaserEl = document.getElementById("pin-teaser");
    if (!teaserEl || teaserEl.style.display === "none" || !teaserEl.innerHTML) return;
    if (teaserEl.contains(e.target)) return; // clicks inside the teaser (its own CTA link) navigate normally
    if (e.target.closest && e.target.closest(".pin-hit-area")) return; // a pin's own activatePin() already decides open-vs-navigate
    closeTeaser(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const teaserEl = document.getElementById("pin-teaser");
    if (!teaserEl || teaserEl.style.display === "none" || !teaserEl.innerHTML) return;
    closeTeaser(true);
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
  rect.style.opacity = "0.16";
  rect.style.pointerEvents = "none";
  svg.appendChild(rect);
}

// v10 Part 13: per-location terrain, Tier A only (a neutral filled circle —
// Tier B's real traced shape/markers are null for every entry today, so
// they're skipped here rather than half-rendered). Per v8 §1.2's
// three-claims doctrine, cited in the spec: terrain asserts no claim — same
// channel as parchment/land/water, never a graded fill, so unlike a pin's
// own radius (constant ON SCREEN, via pxPerWorldUnit) this shape is sized
// in real world-viewBox units and genuinely grows/shrinks with zoom, the
// way real geography should. pxPerWorldUnit is used only to measure the
// shape's own CURRENT on-screen footprint, for the fade-in threshold check.
function renderTerrain(svg, svgNS, pinEntries, pxPerWorldUnit) {
  for (const entry of pinEntries) {
    const features = TERRAIN_FEATURES[entry.loc.location_id];
    if (!features) continue;
    for (const f of features) {
      // Tier B needs a real traced shape/markers — none exist yet for any
      // location (named plainly in terrain-data.js and the spec itself).
      // Not attempted here; a future session's real cartographic pull adds
      // its own render branch when shape/markers stop being null.
      if (f.tier !== "A" || f.radius_km == null) continue;
      const radiusWorld = f.radius_km * WORLD_UNITS_PER_KM;
      const footprintPx = radiusWorld * pxPerWorldUnit * 2; // full diameter — the "narrow axis" for a circle
      if (footprintPx < TERRAIN_FADE_MIN_PX) continue;
      const t = Math.max(0, Math.min(1, (footprintPx - TERRAIN_FADE_MIN_PX) / (TERRAIN_FADE_FULL_PX - TERRAIN_FADE_MIN_PX)));
      const opacity = t * TERRAIN_OPACITY_TARGET;
      if (opacity <= 0) continue;
      const shape = document.createElementNS(svgNS, "circle");
      shape.setAttribute("cx", entry.cx);
      shape.setAttribute("cy", entry.cy);
      shape.setAttribute("r", radiusWorld.toFixed(3));
      shape.setAttribute("class", "terrain-feature");
      shape.style.opacity = opacity.toFixed(3);
      shape.setAttribute("aria-hidden", "true");
      shape.setAttribute("pointer-events", "none");
      svg.appendChild(shape);
    }
  }
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

// v10 Part 15.5, short form kept as the single legend vocabulary by Part
// 23.9: a short chip-style label parallel to STATE_HEADLINE, keyed the
// same way (STATE_HEADLINE's own six states) -- built because
// STATE_HEADLINE's full sentences (one 17-word conditional clause among
// them) read at a genuinely different density/register than a compact
// legend list needs. Meaning preserved, not shortened away --
// QUALIFIES_CONDITIONAL and UNCERTAIN_TYPE stay distinct in text even
// though they share one color, matching STATE_HEADLINE's own doctrine
// (text carries the finer read, color only the coarser one). Now the one
// shared vocabulary every persona's legend uses (renderVerdictKey(),
// below) -- no longer split across two differently-worded legend blocks.
const STATE_CHIP_LABEL = {
  QUALIFIES_AND_CONVERTS: "Clears, leads to permanent residency",
  QUALIFIES_CONDITIONAL: "Clears, with conditions",
  UNCERTAIN_TYPE: "Possible, income type unconfirmed",
  FAILS_AMOUNT: "Doesn't clear the income bar",
  DEAD_END_BLOCKING: "Confirmed dead end",
  GAP_INSUFFICIENT_DATA: "Not enough documented yet",
};

// Part 23.9: one shared verdict-meaning key — replaces the duplicated
// swatch-building logic the hasFixtures branch and the five-no-fixture
// branch used to each carry independently (a DRY win, not just a display
// fix). STATE_CHIP_LABEL's six short strings (already-written UI copy),
// each swatched by its band's already-proven-identical color (bandVisual()
// — confirmed live, this session: a hand-checked pin and a rule-derived
// pin sharing the same verdict meaning render byte-for-byte identical
// fill/hatch). `includePending` appends a real, honest seventh row for the
// one legend meaning the closed six-state engine enum can't express
// ("checked, but the verdict itself hasn't been confirmed" — a human-
// process state, distinct from data_gap) — shown only where reachable
// (fixture-bearing personas, the only place `verdictVisual()`'s own
// "pending"/"unverified" kind can ever fire; confirmed live against real
// fixture data, 3 rows).
function renderVerdictKey(displayName, includePending) {
  const items = Object.entries(STATE_CHIP_LABEL).map(([state, label]) => {
    const band = STATE_HEADLINE_BAND[state];
    if (band === "hard_fail") {
      return `<span class="legend-item"><span class="legend-hatch-demo"></span> ${escapeHtml(label)}</span>`;
    }
    const color = bandVisual(band).color;
    const swatchClass = band === "data_gap" ? "legend-swatch legend-gap-demo" : "legend-swatch";
    return `<span class="legend-item"><span class="${swatchClass}" style="background:${color}"></span> ${escapeHtml(label)}</span>`;
  });
  if (includePending) {
    items.push(`<span class="legend-item"><span class="legend-swatch" style="background:${pendingColor()}"></span> Hand-checked, verdict not yet confirmed</span>`);
  }
  const ringLine = includePending
    ? `<span>A ring around a pin means we hand-checked that answer for ${escapeHtml(displayName)}. No ring means the rule-derived read.</span>`
    : "";
  return `<div class="legend-scale">What each pin color means for ${escapeHtml(displayName)}: ${items.join("")}</div>${ringLine}`;
}

// v8 R7: the legend becomes mode-aware — three mutually exclusive shapes,
// never overlaid on each other, so the colors on screen and the words
// explaining them always agree about what mode is showing. Exact strings
// are ruled UI copy, transported verbatim, not paraphrased here.
function renderLegend(el, persona, activeLens, store) {
  // Re-read the theme-appropriate ramp/colors at render time (not cached),
  // so this legend is always correct for the current light/dark mode.
  //
  // v10 Part 11: each stop reads "<value> · <meaning>" (e.g. "1 · Weakest
  // fit") so color, number, and meaning read together at a glance — the
  // v7 Part 16 hue-name label ("Red"/"Green", withheld in dark mode since
  // it would mislabel the unrelated honey-gold ramp) is retired; a
  // meaning label has no hue to mismatch, so it now renders in both
  // themes for free (see getScaleLegend()'s own comment).
  const scaleHtml = getScaleLegend().map(
    (s) => `<span class="legend-step"><span class="legend-swatch" style="background:${s.color}"></span> ${s.value} · ${escapeHtml(s.name)}</span>`
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

  if (persona === "custom") {
    // v11 Part 21: same general ramp as the no-persona case below, just
    // titled and disclosed as the reader's own weighted read — never a
    // verdict-band legend (21.7's own scope boundary: no eligibility
    // concept exists for this identity).
    el.innerHTML = `
      <div class="legend-scale">Pin color — your own weighted Fit index (${escapeHtml(CUSTOM_ESTIMATE_SUFFIX)}): ${scaleHtml}</div>
      <span>${escapeHtml(SCALE_ANCHOR_STRING)}</span>
      ${bandDisclosureHtml()}
    `;
    return;
  }

  if (persona) {
    const displayName = persona.charAt(0).toUpperCase() + persona.slice(1);

    if (persona === "waldo") {
      // v10 Part 15.5: a genuine pre-existing bug, independent of tonight's
      // fade fix — Waldo's pins have never been colored by any clears/
      // near-miss verdict vocabulary. His own pin/tooltip branch above
      // colors by scoreToColor() over his own Fit index, the same blue-amber
      // ramp the no-persona/lens legends already show (scaleHtml, built once
      // at the top of this function and reused here, not reinvented). Peeled
      // into his own branch so the legend never again describes colors his
      // pins don't paint.
      el.innerHTML = `
        <div class="legend-scale">Pin color — Waldo's Fit index, rescored where we have real data for him: ${scaleHtml}</div>
        <span>${escapeHtml(SCALE_ANCHOR_STRING)} Where we've also checked his visa/residency path, that separate read shows in the tooltip and on his page — place quality and eligibility never share one pin color.</span>
        ${bandDisclosureHtml()}
      `;
      return;
    }

    // Part 23.9: ONE legend, verification carried as a pin-level ring
    // modifier, never a second block — Wenda/Carmen (hasFixtures) and the
    // five no-fixture personas used to get two visually distinct legends
    // implying two vocabularies exist ("hand-verified" vs. "rule-derived"),
    // when the pins themselves only ever paint from one shared six/seven-
    // value channel (bandVisual()/STATE_CHIP_LABEL, confirmed live this
    // session — a hand-checked pin and a rule-derived pin sharing the same
    // verdict meaning render byte-for-byte identical fill/hatch). Both
    // branches now call the one shared key; only whether the honest
    // seventh "pending" row is reachable differs.
    const hasFixtures = store.fixturesByPersona.has(persona);
    el.innerHTML = renderVerdictKey(displayName, hasFixtures);
    return;
  }

  // General (no persona, no lens):
  el.innerHTML = `
    <div class="legend-scale">Pin color — general Fit index: ${scaleHtml}</div>
    <span>${escapeHtml(SCALE_ANCHOR_STRING)}</span>
    <span>${escapeHtml(FIT_INDEX_DEFINITION)}</span>
    ${bandDisclosureHtml()}
  `;
}

// v12 Part 22.8: the comparative-basis disclosure, rendered below the
// swatches on every legend branch whose pin colors use the calibrated
// index bands (general / custom / Waldo — NOT the score-kind lens branch,
// whose per-criterion colors stay on the absolute linear mapping, and not
// the verdict-band legends, which carry no ramp at all). Empty string
// whenever calibration fell back to linear, so the line only renders
// while its claim is true.
function bandDisclosureHtml() {
  const line = indexBandDisclosure();
  return line ? `<span>${escapeHtml(line)}</span>` : "";
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
