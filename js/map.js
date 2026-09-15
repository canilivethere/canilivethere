import { loadStore, verdictHeadline, sectionForFact, resolveVerdict } from "./data.js";
import { scoreToColor, indexToColor, calibrateIndexBands, indexBandDisclosure, getScaleLegend, verdictVisual, bandVisual, eliminatedColor, isGapValue, pendingColor, DOG_LENS_COLOR, RAMP_VALUE_ATTR, RAMP_KIND_ATTR } from "./colors.js";
import {
  applyStoredTheme, renderTopBar,
  renderFooter, getActivePersona, withPersona, escapeHtml,
  FIT_INDEX_DEFINITION, SCALE_ANCHOR_STRING, buildFitHeadline, isActivationKey,
  formatNumbersInText, splitFactSentences, stateHeadline, STATE_HEADLINE_BAND,
  CONF_LABEL, CUSTOM_ESTIMATE_SUFFIX, initLocationSearch,
  READER_ID, personaDisplayLabel, hasReaderWeights,
  loadViewIndex, saveViewIndex, wireCornerLensInPlace,
  READER_BASIS_DECLARED_LINE,
  READER_STATE_SHORT, readerStateShort, READER_LABEL_UNREAD, READER_LABEL_UNREAD_MEMBER,
  READER_LABEL_READ_PREFIX,
} from "./app-shared.js";
import {
  applyReaderLens, renderPerspectiveSlot, hasReaderVerdicts, readerPinPaint,
  readerBasisIsAssumed,
} from "./reader-lens.js";

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

// =====================================================================
// THE READER'S MARK. Four constraints govern it: >=3:1 against land, a
// shape and not only a hue, a legend beside the map, and the band in the
// aria-label.
//
// WHAT IT REPLACES, kept so the change is legible: `.reader-mark`, a
// band-coloured stroke widened to 1.75x the halo, drawn on the pin
// itself. Walked in a browser — the first time this site was read as a
// rendered page rather than as source — it failed twice over. Measured
// in both themes against the shipped hexes, then re-verified:
//   LIGHT land #d6cdb8: gap 1.118  cond 1.893  clean 3.412  hard 10.927
//   DARK  land #4a4234: gap 1.415  cond 3.310  clean 1.522  hard  1.825
//   --ink:              light 10.896                        dark  8.854
// Three of four band colours fail the 3:1 non-text floor against dark
// land and two fail against light land. NO ASSIGNMENT OF THE EXISTING
// BAND HUES CLEARS 3:1 IN BOTH THEMES; only ink does. So the first
// constraint (contrast) and the second (a shape, not only a hue) are not
// two constraints pulling apart — they are one constraint reached from
// two directions, and the mark's carrier is INK GEOMETRY.
//
// THE SECOND FAILURE, and it is the one that decides the draw order: the
// invisible cream was GAP_BG_LIGHT — the data_gap mark, "the site
// couldn't read this" — on 10 of 12 marked pins, and those same 10 sit
// in cluster knots that give NO TOOLTIP AT ALL. The sentence was 2 to 7
// zoom clicks away while the mark stayed fully visible and meant nothing.
// That is why badges are drawn AFTER every pin (a neighbour's pin can
// never cover one) and why the glyph has to carry the band without a
// hover.
//
// THE BADGE OVERLAPS the pin's edge rather than sitting inside it. That
// is a deviation from "a mark ON the pin", taken deliberately: ink inside
// the pin sits on five ramp stops and measures 2.38-3.61 across them —
// under the floor on two stops in each theme. Beside is the only place
// the first constraint can be met without minting a new hex.
// HUE IS DROPPED from the map mark ENTIRELY. Lists chips and page chips
// keep band colour (they sit on paper, not land);
// the map mark carries none. One legible device beats two channels that
// disagree by theme.
const BADGE_RADIUS_PX = 6;        // 12px disc — a 7px glyph reads at 1x DPR, and a knot of three stays legible
const BADGE_OFFSET_PX = 7;        // upper-right (+7, -7): overlaps the 7px pin by ~3px, leaving ~3/4 of the fit fill visible
const BADGE_BOX = BADGE_RADIUS_PX * 2;
// The disc's own radius inside the 12-unit symbol box, set so the 1.25
// border's OUTER edge lands exactly on 12px: 6 - 1.25/2.
const BADGE_DISC_R = BADGE_RADIUS_PX - 0.625;

// Band -> glyph. Geometry and luminance only, never hue:
// the tri-state-checkbox set (tick, bar) plus the two glyphs every reader
// already owns (cross, question mark). Each pair differs by vertex count
// AND stroke direction, so they stay distinct under any CVD simulation
// and at 7px.
//
// The paths are authored in a 10x10 box at stroke 1.6 with round caps and
// joins; they are placed inside the 12x12 badge box by translate(1,1),
// which centres the authoring box in the disc. The stroke is therefore
// 1.6 SCREEN px wherever the badge is drawn at 12 screen px, at any zoom.
//
// THE MOST COMMON HONEST ANSWER GETS A POSITIVE GLYPH ON PURPOSE. The
// finding that prompted it: "couldn't read this" wore the quietest
// treatment on the map. A "?" is a shape that asks to be read.
const BADGE_GLYPHS = {
  clean: { id: "reader-badge-clean", d: "M2.5 5.6 L4.6 7.6 L7.8 3.2" },
  uncertain_or_conditional: { id: "reader-badge-uncertain", d: "M2.6 5 L7.4 5" },
  hard_fail: { id: "reader-badge-hardfail", d: "M3 3 L7 7 M7 3 L3 7" },
  data_gap: { id: "reader-badge-gap", d: "M3.5 3.9 A1.6 1.6 0 1 1 5.9 5.3 C5.2 5.7 5 6.1 5 6.7 M5 8.4 L5 8.5" },
};

// One <symbol> per glyph, defined once in the map's <defs> and placed
// with <use> — by the map AND by the key below, so the two cannot drift
// into drawing different pictures of the same thing. Fill and stroke come
// from CSS classes rather than presentation attributes, because the
// tokens are CSS custom properties (--panel, --ink) and var() is not
// legal in a presentation attribute; the theme toggle therefore needs no
// repaint hook here, unlike every ramp-coloured element on this map.
const READER_BADGE_SYMBOLS = Object.values(BADGE_GLYPHS).map(({ id, d }) => `
    <symbol id="${id}" viewBox="0 0 ${BADGE_BOX} ${BADGE_BOX}">
      <circle class="reader-badge-disc" cx="${BADGE_RADIUS_PX}" cy="${BADGE_RADIUS_PX}" r="${BADGE_DISC_R}" />
      <path class="reader-badge-glyph" transform="translate(1,1)" d="${d}" />
    </symbol>`).join("");

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
// Door v2: the perspective line needs the store (it names the read set's
// countries from the data, never from a string typed here), so it is
// rendered inside main() rather than synchronously at module load the way
// the profile bar was. Same element, same position.
//
// The door still summons at module load, before the store resolves — its
// first paint never depended on the store and must not start doing so.
// What it now carries is a commit callback: "See the world" closes the
// box in place and this re-renders the map underneath, so the reward is a
// reveal and not a reload. A reload paints the old map for a frame; a
// reveal does not.
let mapCtx = null; // { store, lenses } — set by main() once, read by the door

function refreshAfterBoxCommit() {
  if (!mapCtx) {
    // The reader finished the box before the store resolved. Rare, and a
    // plain reload is the honest degrade — it re-reads their figures from
    // storage on the way in, and the door does not re-summon because
    // every completion path marks it answered.
    location.href = location.pathname + location.hash;
    return;
  }
  applyReaderLens(mapCtx.store);
  const persona = getActivePersona();
  renderTopBar("map");
  wireCornerLensInPlace(() => door.open());
  renderPerspectiveSlot(document.getElementById("persona-slot"), mapCtx.store, persona);
  renderPurposeSelector(mapCtx.store, mapCtx.lenses);
  renderMap(mapCtx.store, mapCtx.lenses);
  // NOT wireMapInteractions() — deliberately. It binds to #map-root,
  // which renderMap() empties but never replaces, so a second call would
  // double-bind every wheel, drag, pinch and key listener on the map:
  // one wheel notch would zoom twice. This is the same reason setLens()
  // re-renders without re-wiring, and it is why the door's commit path
  // re-renders rather than re-initialising.
}

// v7 Part 10: index.html-only by construction (this is the one page that
// imports this module).
const door = initPerspectiveDoor({ onCommit: refreshAfterBoxCommit });
wireCornerLensInPlace(() => door.open());
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
    // Door v2: this used to end "— this view ignores any
    // persona pick above", which named a bar that no longer exists AND
    // said the quiet part wrong: under the reader's own lens it is the
    // READER being switched away from. The identity-specific half is
    // appended at render time (renderPurposeSelector below), because a
    // lens object is built once and the identity can change without it.
    explainerText: `Pins colored by ${displayLabel} alone, general figures.`,
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
      "Unscored on purpose — these are the import rules on file, not a grade. Blue pins have researched rules; hover to read them.",
  };
}

// The two lenses Part 13 confirms as already-built and spec-compliant
// (easiest visa, money goes furthest), folded into this build as-is.
// "Best property access" was already a third entry in this array before
// this change (ported from lists.js's own FEATURED_CRITERIA) — it's
// not one of Part 13's four named purpose lenses, but it's already a
// working, criterion-backed lens with no reason to drop it. The dog-
// import lens (v8 Part 6) stays a fourth member of this SAME array
// (Part 28.3: demoted from its own chip to the "More…"
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
// The index the reader picked survives a box round-trip and travels to
// the Lists and back. loadViewIndex() is sessionStorage, written on every
// switch below — not personal data, not the reader-preferences envelope.
let STATE = { lensId: loadViewIndex(), viewBox: null };

// Craft latitude, named per the spec's own permission (same class as the
// grain filter's own untested-on-paper parameters) — zoom-step factor,
// deepest-zoom cap, cluster pixel-radius threshold, and pan-per-keypress
// fraction are starting values, tuned by eye, not measured.
const ZOOM_STEP = 1.4; // one discrete +/- button click or +/- keypress
// Deliberately much smaller than ZOOM_STEP: a wheel/trackpad gesture fires
// many events per scroll (a trackpad can send dozens for one swipe), so
// reusing ZOOM_STEP here compounded into runaway zoom (1.4^10 = ~29x from
// a single fast scroll) — flagged live: "you have to work to
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

// Bug fix: wireMapInteractions()'s wheel and touchmove
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
  // The reader's weights AND the reader's verdict rows, layered
  // onto the built store before anything renders. One call, one position —
  // the same position applyStoredCustomWeights() held, which it now wraps.
  applyReaderLens(store);
  renderFooter(store);
  document.getElementById("fit-def-caption").textContent = FIT_INDEX_DEFINITION;
  const lenses = buildFeaturedLenses(store);
  mapCtx = { store, lenses };
  renderPerspectiveSlot(document.getElementById("persona-slot"), store, getActivePersona());
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
    // Remembered for the visit and shared with the Lists, so map ->
    // Lists on "Easiest visa" no longer lands on blended fit.
    saveViewIndex(STATE.lensId);
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
    if (persona === READER_ID) {
      // Door v2: three reader states, because the reader identity now
      // carries three genuinely different things and each colours the map
      // differently. AUTHORED-CHOICE — the spec covers the LENS explainer
      // and leaves the blended one, so this is composed from the shipped
      // persona and custom lines, which is why they read alike.
      if (hasReaderVerdicts(store)) {
        // Two variants on hasReaderWeights(), because under
        // the overlay the FILL is the thing the first clause describes and
        // the fill is weighted or general depending on this exact test.
        explainerEl.textContent = hasReaderWeights()
          ? READER_EXPLAINER_VERDICTS_WEIGHTED
          : READER_EXPLAINER_VERDICTS_GENERAL;
      } else if (hasReaderWeights()) {
        explainerEl.textContent = `Pins colored by your own weighted Fit index (${CUSTOM_ESTIMATE_SUFFIX}).`;
      } else {
        explainerEl.textContent = READER_EXPLAINER_PASSPORT_ONLY;
      }
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
    // The promise stops lying. A criterion lens colours
    // by a general per-criterion score and folds no verdict into that
    // colour — for a persona or for the reader. The old sentence named
    // the bar that is gone; these name the identity the view is NOT
    // answering, and where the answer does live.
    const lens = resolveLens(store, lenses, STATE.lensId);
    const persona = getActivePersona();
    let suffix = "";
    if (persona === READER_ID) {
      suffix = " — your verdict isn't folded into this view yet; the blended view carries it.";
    } else if (persona) {
      suffix = ` — ${personaDisplayLabel(persona)}'s verdict isn't folded into this view yet; the blended view carries it.`;
    }
    explainerEl.textContent = lens ? `${lens.explainerText}${suffix}` : "";
  }
}

// BOTH VARIANTS, landed verbatim from the spec. They were written for
// the overlay and were untrue of the earlier fill-replacement build —
// "every pin is colored by the Fit index" was false on the 2 or 3 the box
// had answered, and "the mark on a pin" described a device nothing drew.
// The overlay is what ships; both sentences are now true of what renders, which is why the placeholder they replace is
// gone rather than reworded.
//
// The variants split on hasReaderWeights() because the FILL is the thing
// the first clause names, and the fill is the reader's weighted index or
// the general one on exactly that test.
const READER_EXPLAINER_VERDICTS_WEIGHTED =
  "Every pin is colored by the Fit index, weighted by your priorities — how well the place fits what you said matters. The mark on a pin is your own read, and only the countries this box has read carry one; hover a pin and it says which.";
const READER_EXPLAINER_VERDICTS_GENERAL =
  "Every pin is colored by the general Fit index — place quality, not eligibility. The mark on a pin is your own read, and only the countries this box has read carry one; hover a pin and it says which.";
const READER_EXPLAINER_PASSPORT_ONLY =
  "Pins colored by the general Fit index. Your saved passport changes the entry rules on each place's own page, not these colors.";

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
    ${READER_BADGE_SYMBOLS}
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
  // after the base fills and before the pins, so no pin gets textured —
  // only the fills do, per Part 15's own scope (coastline/border strokes
  // explicitly untouched).
  renderMapGrain(svg, svgNS);


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
    // THE OVERLAY: a SECOND channel on the pin,
    // independent of `fill`. Null on every pin in every other branch of
    // this function — only the reader's own lens paints a mark, and only
    // where the box read that country. It is deliberately not folded into
    // `fill` or `eliminated`: the whole point of the overlay is that the
    // eligibility read sits BESIDE the quality colour instead of replacing
    // it, and two meanings sharing one variable is how that gets undone.
    //
    // CHANGED: the channel carries the BAND, not a colour. `markColor` is retired from this file and from
    // readerPinPaint()'s contract — the mark has no hue at all now, in
    // either theme, and a colour variable left lying around is how a hue
    // creeps back onto a device that is meant to have none. The state
    // rides alongside it because the pin's accessible name needs the
    // state's own short form, which the band alone cannot give.
    let markBand = null;
    let readerState = null;
    // THE PRESENCE FILTER'S OWN INPUTS — the persona legend lists a state
    // iff a pin on THIS render carries it. Two
    // fields, not one, because a pin can carry its reading in either of
    // the two vocabularies this map paints from:
    //   verdictState  - the engine's `overall_state`, the key
    //                   STATE_CHIP_LABEL is indexed by.
    //   verdictKind   - verdictVisual()'s own kind, for the hand-fixture
    //                   pins on Wenda/Carmen, which carry no engine state
    //                   at all. Recorded so the filter can never drop the
    //                   only row explaining a colour a fixture pin paints.
    let verdictState = null;
    let verdictKind = null;
    let readerBarKind = null;
    // Part 30.8 (score-driven pin draw order): set
    // alongside `fill` in every branch below. `isRampColored` is true only
    // when the FINAL rendered fill is a scoreToColor()/indexToColor() call
    // (the five-stop ramp, gap state included) -- classified by which
    // function actually produced `fill`, not by whether a verdict color's
    // hex happens to coincide with a ramp value. Verdict-colored pins
    // (bandVisual()/verdictVisual() consumers, and the eliminated hatch,
    // which ignores `fill` entirely at render time) stay false -- Part
    // 30.8 rules the ramp's own draw order only and explicitly leaves
    // verdict-pin draw order unanswered, not silently decided here.
    // rampKind ("score" | "index"): which of the two theme-aware ramp
    // functions actually produced `fill`, wherever isRampColored is true —
    // needed so a live theme-toggle repaint (colors.js's
    // repaintRampSwatches()) calls the SAME function back, not the wrong
    // one (scoreToColor's linear mapping vs. indexToColor's calibrated
    // bands are two different honest readings of the same raw number).
    let isRampColored = false, rampValue = null, rampKind = null;

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
          // Readability fix: a fact's own value_raw is often
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
          isRampColored = true; // the gap voice IS a scoreToColor() consumer -- 30.8's own gap rule applies
          rampKind = "score";
          rampValue = null;
          tooltip = `${loc.display_name}, ${country.name} — Dog import: not researched yet.`;
        }
      } else {
        const val = activeLens.valueForLocation(loc.location_id);
        fill = scoreToColor(val);
        gap = isGapValue(val);
        isRampColored = true;
        rampKind = "score";
        rampValue = val;
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
      // Part 15.4's own doctrine holds regardless of what follows below
      // (engine verdict rides a second tooltip line, never the color
      // channel) -- Waldo's pin is always a ramp consumer, unconditionally.
      isRampColored = true;
      rampKind = "index";
      rampValue = value;
      const headline = buildFitHeadline(store, "waldo", loc, country, value);
      const baseTooltip = `${headline}\nWaldo's Fit index: ${value != null ? value.toFixed(1) : "n/a"}/5`;
      if (hasPersonaRescore) {
        faded = false;
        tooltip = baseTooltip;
      } else {
        const engineVerdict = resolveVerdict(store, "waldo", loc);
        if (engineVerdict) {
          faded = false;
          const stateText = stateHeadline(engineVerdict.overall_state);
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
      isRampColored = true; // provisional -- both branches below override to false, the else branch (no read at all) keeps this
      rampKind = "index";
      rampValue = underlyingValue;
      faded = !hasRealRead;
      if (verdict) {
        handChecked = true;
        const vHeadline = verdictHeadline(verdict.expected);
        const visual = verdictVisual(vHeadline);
        isRampColored = false; // a verdictVisual() consumer either way (eliminated hatch ignores `fill`; the else branch overwrites it)
        verdictKind = visual.kind;
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
        isRampColored = false; // a bandVisual() consumer -- 30.8's own scope note, not a ramp pin
        verdictState = engineVerdict.overall_state;
        const stateText = stateHeadline(engineVerdict.overall_state);
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
    } else if (persona === READER_ID) {
      // Door v2. THE RULE, superseding the grey this branch once shipped
      // for the 26: the reader's map keeps the quality layer for all 38
      // (fit index from their priorities) and overlays eligibility only
      // where the box read the route. Entering numbers never subtracts a
      // pin. Resolved as an overlay — fit fill on all 38, eligibility as
      // a mark on the pin.
      //
      // TWO LAYERS, and they no longer contend for one channel.
      //   QUALITY — the fit index, reweighted by the reader's own
      //   priorities where they gave any, general where they did not. It
      //   is the FILL, on every one of the 38 locations, every time, and
      //   nothing overlays it. (Measured: all 38 carry at
      //   least one score in derived/scores.jsonl, zero unscored — the
      //   layer has data everywhere, so "all 38" is not aspirational.)
      //   ELIGIBILITY — the reader's own read, carried as a MARK beside
      //   the fill, wherever the box read that country; the mark's colour
      //   comes from the SAME bandVisual() call a persona's pin takes and
      //   its sentence from the same stateHeadline() — one pipeline.
      //   readerVerdictHasAnswer() no longer decides any colour here; it
      //   decides only which question the WORDS lead with.
      //
      // THE TEST: entering numbers never subtracts a pin.
      // Under the overlay the build now passes a STRICTER form of it,
      // measured rather than argued: entering numbers changes 0 of 38
      // fills. Every location keeps the exact colour it had before a
      // number was typed — the 26 the box never reads, and the 12 it
      // does, which is the half the fill-replacement build failed.
      // The no-verdict-for-unread-countries rule is scoped and survives
      // — it governs the ELIGIBILITY layer (no verdict for the countries
      // the box hasn't read, and there is none below), not the
      // priorities-based quality index.
      // The paint decision itself is readerPinPaint() in
      // js/reader-lens.js — one call, no branch of its own here, because
      // the ruling has to be runnable and not merely readable. What stays
      // here is the tooltip, which is this file's job.
      const paint = readerPinPaint(store, loc);
      const readerVerdict = paint.verdict;
      const weighted = hasReaderWeights();
      const value = paint.value;
      const indexSuffix = weighted ? CUSTOM_ESTIMATE_SUFFIX : "general figures";
      const qualityLine = `Fit index: ${value != null ? value.toFixed(1) + "/5" : "not yet scored"} (${indexSuffix})`;
      fill = paint.fill;
      gap = paint.gap;
      eliminated = paint.eliminated;
      isRampColored = paint.isRampColored;
      rampKind = paint.rampKind;
      rampValue = paint.rampValue;
      markBand = paint.markBand;
      readerState = paint.state;
      // The bar-kind summary rides with the state so the PIN's accessible
      // name can carry the same correction the tooltip sentence does.
      readerBarKind = paint.verdict ? paint.verdict.reader_bar_kind : null;
      // THE TOOLTIP BRANCHES ON `read`, NOT ON "REACHED AN ANSWER" — the
      // overlay reaching the words as well as the paint. Under it a
      // data_gap read carries a MARK (in the gap colour), so it is a pin
      // the reader can see the box acted on, which is why it folds into
      // the verdict-present tooltip: stateHeadline(READER_NOT_ENOUGH) is a real
      // sentence about a real read ("The site couldn't read this against
      // your figures…"), not an absence. This is the branch that used to
      // carry an unplaced-copy placeholder: it needed one only while the
      // pin was silent about the read, and it is not anymore.
      if (paint.read) {
        const stateText = stateHeadline(readerVerdict.overall_state, readerVerdict.reader_bar_kind);
        // The same no-bare-no instead-line every other verdict branch in
        // this file carries — now on `bandEliminated`, because the pin's
        // own `eliminated` is false on every reader pin by construction
        // (the hatch would erase the fit fill). The COPY rule is
        // unchanged; only the flag it reads moved, and it reads the same
        // bandVisual() value it always did.
        const insteadLine = paint.bandEliminated
          ? `\nVisiting short-term is a separate question — open this place's page for the short-stay rules.`
          : "";
        const confSuffix = verdictConfidenceSuffix(readerVerdict.confidence_tier, readerVerdict.overall_band);
        // The SECOND of the three surfaces this sentence is specified
        // for: its own line after the headline line. The doubt against it
        // is recorded rather than quietly resolved — this makes a compact
        // surface four lines deep, and if it crowds, this is the copy of
        // the sentence to drop, not the location page's.
        const basisLine = readerBasisIsAssumed(store, loc)
          ? `\n${READER_BASIS_DECLARED_LINE}`
          : "";
        // The first tooltip, landed from the spec: "The pin's color is
        // the Fit index, {value}/5 ({indexSuffix}) — place quality, a
        // different question from eligibility." The only thing
        // substituted into it is the value expression, which has to carry
        // a null ("not yet scored") the specified literal has no form for
        // and which is this file's own already-shipped phrase for it. The sentence
        // now names the colour as the FILL, which is the whole difference
        // the overlay makes here: under fill-replacement this line was
        // describing a colour the reader was not looking at.
        const qualitySentence = `The pin's color is the Fit index, ${value != null ? value.toFixed(1) + "/5" : "not yet scored"} (${indexSuffix}) — place quality, a different question from eligibility.`;
        tooltip = `${loc.display_name}, ${country.name} — your own read: ${stateText}${confSuffix}${basisLine}\n${qualitySentence}${insteadLine}`;
      } else {
        // The box did NOT read this country. One state only now — the
        // read-but-no-answer case moved to the branch above, where the
        // mark it carries is described. The quality layer stands,
        // unchanged from what it was before any number was typed.
        const headline = buildFitHeadline(store, null, loc, country, value);
        // The SECOND tooltip, landed verbatim from its second sentence
        // onward. Its specified first line reads "{place}, {country} — Fit
        // index {value}/5 ({indexSuffix})"; the two lines already above
        // this one say exactly that and say it null-safely, so they stay
        // and the sentence lands as the line it was written to be. It also
        // closes an older defect by construction: the sentence it replaces
        // said "no color is shown" on a pin that is painted, and this one
        // names the colour it is.
        //
        // Where the reader gave no figures at all, no eligibility claim is
        // made or denied — the line simply is not there, and that is the
        // no-lens state disclosing itself by silence rather than by a
        // sentence about a read that never happened.
        const eligibilityLine = hasReaderVerdicts(store)
          ? `\nThis box hasn't read ${country.name} against your figures, so there's no read for you here — the color is the place's Fit index, not a verdict. Open this place's page for the general figures.`
          : "";
        tooltip = `${headline}\n${qualityLine}${eligibilityLine}`;
      }
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
        isRampColored = false; // a bandVisual() consumer -- 30.8's own scope note
        verdictState = verdict.overall_state;
        const stateText = stateHeadline(verdict.overall_state);
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
        isRampColored = true; // defensive fallback only (full engine coverage today) -- ramp when it does fire
        rampKind = "index";
        rampValue = generalValue;
        const headline = buildFitHeadline(store, null, loc, country, generalValue);
        tooltip = `${headline}\nFit index: ${generalValue != null ? generalValue.toFixed(1) + "/5" : "not yet scored"} (general figures)\n${loc.display_name}, ${country.name} — not checked yet for this persona.`;
      }
    } else {
      const general = store.generalIndex(loc.location_id);
      fill = indexToColor(general ? general.value : null);
      gap = isGapValue(general ? general.value : null);
      isRampColored = true;
      rampKind = "index";
      rampValue = general ? general.value : null;
      const headline = buildFitHeadline(store, null, loc, country, general ? general.value : null);
      tooltip = `${headline}\nFit index: ${general ? general.value.toFixed(1) + "/5" : "not yet scored"}`;
    }

    // v9 Part 1.3: the teaser's red-flag line, universal across all 38
    // locations -- same filter buildVerdictBlock() (location.js) already
    // uses, computed here so the teaser can show it without a second fetch.
    const redFlagCount = (store.factsByLocation.get(loc.location_id) || [])
      .filter((f) => sectionForFact(f) === "redflags" && f.value_raw !== "[GAP]").length;

    pinEntries.push({ loc, country, cx, cy, fill, tooltip, eliminated, gap, faded, redFlagCount, handChecked, isRampColored, rampValue, rampKind, markBand, readerState, readerBarKind, verdictState, verdictKind });
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

  // v10 §13.4: ground layer, appended here — after the grain (already in
  // the SVG's child list above) and strictly before any pin
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
    // Fix: the original idiom (PIN_RADIUS divided by a
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
    // RETIRED — kept as a note, not as code, because
    // the reason it went is the finding: the eligibility mark used to be
    // a band-coloured stroke widened on this circle (`.reader-mark`,
    // `--mark-color`), and it measured 1.118:1 against light land on the
    // most common answer of all. The mark is now a separate ink badge
    // beside the pin (makeReaderBadge below), so THE PIN ITSELF IS
    // UNTOUCHED by the reader's read: same fill on all 38, same halo,
    // same radius, whether the box read that country or not. The test —
    // "entering numbers never subtracts a pin" — now holds on the stroke
    // as well as the fill.
    // Live-toggle repaint fix: only a real ramp consumer gets
    // marked (never an `eliminated` pin, whose fill is never applied
    // above anyway, and never a bandVisual()/verdictVisual() consumer —
    // that's the separate, unfixed verdict-color family, see colors.js's
    // repaintRampSwatches() header). colors.js's repaintRampSwatches()
    // reads these two attributes back on every theme toggle.
    if (entry.isRampColored) {
      circle.setAttribute(RAMP_VALUE_ATTR, entry.rampValue == null || Number.isNaN(entry.rampValue) ? "" : String(entry.rampValue));
      circle.setAttribute(RAMP_KIND_ATTR, entry.rampKind);
    }
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

  // THE READER'S MARK, drawn. Returns null for every pin
  // that carries no band, which is every pin outside the reader's lens
  // and every country the box did not read, so most pins pay no markup at
  // all (the same contract makeHandCheckedRing() above already keeps).
  //
  // Sized in WORLD units off pxPerWorldUnit, exactly as PIN_RADIUS and
  // PIN_HALO already are, so the badge is a constant 12 CSS px at every
  // zoom and on every device width — and because the symbol's own viewBox
  // is 12 units wide, its 1.25 border and 1.6 glyph stroke land as 1.25
  // and 1.6 CSS px with no vector-effect trickery.
  //
  // Never a pointer target and never a second thing for a screen reader
  // to find: pointer-events:none (in CSS, with the rest of the badge's
  // presentation) and aria-hidden here. The hit-area's own label carries
  // the band in words — the badge carries it in geometry.
  // Every badge this render produces, held back and placed in one pass
  // after the group loop — the draw-order rule, and the single line that
  // makes the band reachable on the 10 knotted pins without a hover the
  // knot never offers. Appending each badge beside its own pin
  // would put a later pin on top of an earlier pin's badge, which inside
  // a knot is the common case, not the edge case. Held as ENTRIES rather
  // than as elements because the placement pass below needs to see every
  // badge at once (see placeReaderBadges).
  const readerBadgeEntries = [];
  function collectReaderBadge(entry) {
    if (entry.markBand && BADGE_GLYPHS[entry.markBand]) readerBadgeEntries.push(entry);
  }

  // The painted set, collected at the same two draw sites as the badges
  // above and for the same reason: this is the only place that knows which
  // pins a render actually put on the map. A knot draws at most RENDER_CAP
  // of its members, so reading the verdict file instead would describe a
  // map that was not drawn.
  const paintedStates = new Set();
  const paintedKinds = new Set();
  // Whether a hand-checked RING is actually drawn on this render, which is
  // a different question from whether this persona has fixture ROWS.
  // Measured: five personas carry fixture rows, render the sentence
  // explaining what a ring means, and draw ZERO rings — the sentence
  // describes a mark that is not on their map. The ring is drawn by
  // makeHandCheckedRing() iff entry.handChecked, so this is the same
  // signal the drawing uses, collected at the same two draw sites as the
  // badges and the painted states above.
  let ringDrawn = false;
  function collectPaintedVerdict(entry) {
    if (entry.verdictState) paintedStates.add(entry.verdictState);
    if (entry.verdictKind) paintedKinds.add(entry.verdictKind);
    if (entry.handChecked) ringDrawn = true;
  }

  // THE SPEC'S OWN NAMED RISK, MEASURED FIRING AND FIXED HERE. It was
  // named with its own remedy: if badges collide, the fix is a per-knot
  // badge angle — alternate upper-right / upper-left — which is geometry
  // the build owns.
  //
  // IT FAILED. Rendered at 1x DPR in a 900px viewport with a reader at
  // €2,500/month passive (all four bands on screen at once), badges on
  // knotted pins overlapped each other and one glyph was partly covered
  // by a neighbour's disc — on Portugal's three, on Crete's two and on
  // Guatemala's two. Draw order keeps every badge above every PIN; it
  // does nothing about a badge above a badge, which is the case a knot
  // makes ordinary.
  //
  // THE RULE, and it is two lines because a knot is not one shape:
  //   1. Upper-right is the default and stays the default — the badge
  //      shape readers already parse, and the only side measured.
  //   2. A badge that would overlap one already placed tries upper-LEFT,
  //      and takes it only if that overlaps nothing. Otherwise it keeps
  //      upper-right: a predictable position beats a scattered one, and a
  //      knot dense enough to defeat both sides is a knot the reader
  //      resolves by zooming, which this map already offers three ways.
  // Placement order is by location_id, NOT by draw order, so a badge does
  // not move because a fit score changed: the same knot resolves the same
  // way on every render and between renders.
  function placeReaderBadges() {
    const size = BADGE_BOX / pxPerWorldUnit;
    const dx = BADGE_OFFSET_PX / pxPerWorldUnit;
    const placed = [];
    const overlaps = (a, b) => Math.abs(a.x - b.x) < size && Math.abs(a.y - b.y) < size;
    const ordered = [...readerBadgeEntries].sort((a, b) =>
      a.loc.location_id < b.loc.location_id ? -1 : a.loc.location_id > b.loc.location_id ? 1 : 0);
    const els = [];
    for (const entry of ordered) {
      const y = entry.cy - dx - size / 2;
      const right = { x: entry.cx + dx - size / 2, y, side: "right" };
      const left = { x: entry.cx - dx - size / 2, y, side: "left" };
      let box = right;
      if (placed.some((p) => overlaps(right, p)) && !placed.some((p) => overlaps(left, p))) box = left;
      placed.push(box);
      const glyph = BADGE_GLYPHS[entry.markBand];
      const use = document.createElementNS(svgNS, "use");
      use.setAttribute("href", `#${glyph.id}`);
      use.setAttribute("x", box.x.toFixed(4));
      use.setAttribute("y", box.y.toFixed(4));
      use.setAttribute("width", size.toFixed(4));
      use.setAttribute("height", size.toFixed(4));
      use.setAttribute("class", "reader-badge");
      use.setAttribute("aria-hidden", "true");
      use.dataset.band = entry.markBand;
      use.dataset.loc = entry.loc.location_id;
      use.dataset.side = box.side;
      els.push(use);
    }
    return els;
  }

  // THE BAND IN THE ARIA-LABEL — the fourth constraint.
  // Under the reader's lens with verdicts ONLY; every other lens's labels
  // are untouched, byte for byte. This is the one gate, read once per
  // render rather than per pin, so a solo label and a knot label can
  // never disagree about whether the reader has a read at all.
  const readerLabelling = persona === READER_ID && hasReaderVerdicts(store);
  // The state's own short form, or null where the box never read that
  // country. READER_STATE_SHORT is asserted against STATE_HEADLINE's
  // reader keys at module load (app-shared.js), so a lookup that comes
  // back undefined here is impossible rather than merely unlikely.
  const readerShort = (entry) => (entry.readerState ? readerStateShort(entry.readerState, entry.readerBarKind) : null);
  // Both forms of the pin label.
  function soloAriaLabel(entry) {
    const base = `${entry.loc.display_name}, ${entry.country.name}`;
    if (!readerLabelling) return base;
    const short = readerShort(entry);
    return short
      ? `${base}. ${READER_LABEL_READ_PREFIX} ${short}.`
      : `${base}. ${READER_LABEL_UNREAD}`;
  }
  // §4.2 — one member's name, with its own read in parentheses. This is
  // how a screen-reader user reaches the band on the 10 pins hover cannot.
  function knotMemberName(entry) {
    if (!readerLabelling) return entry.loc.display_name;
    return `${entry.loc.display_name} (${readerShort(entry) || READER_LABEL_UNREAD_MEMBER})`;
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
      collectReaderBadge(entry);
      collectPaintedVerdict(entry);

      const hit = document.createElementNS(svgNS, "circle");
      hit.setAttribute("cx", entry.cx);
      hit.setAttribute("cy", entry.cy);
      // pxPerWorldUnit (not the old zoom-only "scale" ratio, since retired
      // from this file — see makeVisualPin()'s own fix note)
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
      hit.setAttribute("aria-label", soloAriaLabel(entry));
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
      const byLocationId = (a, b) => {
        const ai = a.loc.location_id, bi = b.loc.location_id;
        return ai < bi ? -1 : ai > bi ? 1 : 0;
      };
      const sortedGroup = [...group].sort(byLocationId);
      // A MARKED MEMBER IS NEVER THE ONE THE CAP DROPS, and this is a real
      // defect fix, not a preference.
      //
      // MEASURED: at <=390px the Mediterranean/Iberia band collapses into
      // ONE knot of 14 members. RENDER_CAP is 12, the truncation was by
      // location_id alone, and the two members past the cut were
      // PT-lisbon and PT-porto — both of which the reader's box HAD read
      // and marked. The map drew 34 pins and 10 badges where the desktop
      // drew 38 and 12; the knot's own aria-label went on naming all 14.
      // So the key's promise — a mark sits on a pin — was false on a
      // phone, for the two places a reader is most likely to care about,
      // silently and at every render.
      //
      // It was reported as marks lost on the door's close path. It is not
      // that: the count is identical before and after a full box round
      // trip at every width (verified), and identical below 390 in both
      // states. The trigger is width, and the mechanism is this cap.
      //
      // The cap stays — it exists so a dense knot does not become a blob —
      // and the order it cuts in changes: members carrying a reader mark
      // are kept first, the rest fill the remainder by location_id, and
      // the selected set is then re-sorted by location_id so draw order
      // is unchanged in character. Deterministic and repeat-stable for a
      // given reader state. Unmarked members past the cap are still named
      // in the knot's aria-label and still reachable by zoom, exactly as
      // before; that was already the cap's accepted cost.
      const isMarked = (e) => !!(e.markBand && BADGE_GLYPHS[e.markBand]);
      const rendered = (sortedGroup.length <= RENDER_CAP
        ? sortedGroup
        : [...sortedGroup.filter(isMarked), ...sortedGroup.filter((e) => !isMarked(e))].slice(0, RENDER_CAP)
      ).sort(byLocationId);

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

      // Rule: the 'better' result goes on top of the weaker pin, while
      // maintaining accuracy. Immediately before paint, reorder the
      // ramp-colored subset of `rendered` into ascending active-view
      // value -- SVG has no z-index; the last circle appended wins any
      // overlap, so ascending order leaves the highest-scoring pin
      // painted last/on top. Gap pins (isGapValue) sort as -Infinity,
      // i.e. lowest/underneath, per 30.8's own explicit rule (a scored
      // pin should always show over an unscored one). Scope, per 30.8's
      // own boundary: only entries whose fill actually came from
      // scoreToColor()/indexToColor() (isRampColored, set in the pin-data
      // pass above) are reordered -- their sorted values are written back
      // into the exact index slots they already occupied, so every
      // verdict-colored pin (bandVisual()/verdictVisual() consumers) is
      // left at whatever position it already held. That draw-order
      // question is explicitly NOT answered by Part 30 -- not decided
      // here either.
      const rampSortValue = (e) => (isGapValue(e.rampValue) ? -Infinity : e.rampValue);
      const rampSlots = [];
      rendered.forEach((e, i) => { if (e.isRampColored) rampSlots.push(i); });
      const rampSortedEntries = rampSlots
        .map((i) => rendered[i])
        .sort((a, b) => rampSortValue(a) - rampSortValue(b));
      rampSlots.forEach((slot, k) => { rendered[slot] = rampSortedEntries[k]; });

      const visualPins = [];
      for (const entry of rendered) {
        const pos = nudgedPos.get(entry.loc.location_id);
        const drawEntry = pos ? { ...entry, cx: pos.cx, cy: pos.cy } : entry;
        const pin = makeVisualPin(drawEntry);
        svg.appendChild(pin);
        visualPins.push(pin);
        const ring = makeHandCheckedRing(drawEntry);
        if (ring) svg.appendChild(ring);
        // Every knot member is already a real pin at its
        // own true position, so each gets its own badge — drawn from the
        // NUDGED entry so the badge follows the pin it belongs to when
        // coincidence resolution moves it. Held for the after-loop pass.
        collectReaderBadge(drawEntry);
        collectPaintedVerdict(drawEntry);
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
      // THE SEPARATOR IS "; ", IN BOTH BRANCHES — a live defect, not a
      // preference. Three display names CONTAIN ", " (Asheville, NC ·
      // Chattanooga, TN · Rincón, Puerto Rico), so joining with ", "
      // made the Americas knot announce itself as SEVENTEEN places for
      // fourteen. In the reader's lens it is worse by construction:
      // knotMemberName() appends the state's short form in parentheses and
      // five of the ten READER_STATE_SHORT strings carry a comma of their
      // own. A semicolon is standard English for a list whose items
      // contain commas, and it is a pause in speech rather than a
      // character read aloud — which matters, because this label's only
      // reader is a screen-reader reader (§4.5: the knot has no tooltip).
      const KNOT_SEPARATOR = "; ";
      // Ordered off a FRESH copy of `group`, and neither off `rendered` nor
      // off `sortedGroup`. Both of those are unsafe here and it is not
      // obvious from reading them: where a knot does not truncate,
      // `rendered` IS `sortedGroup` (the same array object, not a copy),
      // and the ramp-sort above reorders it in place by fit value. Reading
      // the names off either one made a knot announce its members in a
      // different order whenever a score changed — measured on the
      // reader's lens, where every pin is ramp-coloured. `group` is never
      // mutated, so a copy of it sorts the same way on every render.
      const drawnIds = new Set(rendered.map((e) => e.loc.location_id));
      const orderedMembers = [...group].sort(byLocationId);
      const shown = orderedMembers.filter((e) => drawnIds.has(e.loc.location_id));
      const notShown = orderedMembers.filter((e) => !drawnIds.has(e.loc.location_id));
      // v11 Part 20.2: the label's own "and separate
      // them" claim only renders when this knot's own resolving zoom will
      // actually leave every member mutually solo (knotWillFullySeparate(),
      // above) -- otherwise the mechanically-true "for a closer look" runs
      // instead, so the label never promises a separation the click won't
      // deliver. Same member names either way; only the closing promise
      // changes.
      //
      // AND IT STILL PROMISES NOTHING ABOUT THE UNDRAWN ONES. Activating
      // re-fits the view to every member and the cap then applies again to
      // whatever knots remain, so "zooming shows the rest" is not
      // guaranteed by construction and is not claimed (§4.4).
      const separates = knotWillFullySeparate(group, containerWidthPx);
      const promise = separates ? "Activate to zoom in and separate them." : "Activate to zoom in for a closer look.";
      // THE COUNT AND THE SHORTFALL LAND IN THE FIRST SIX WORDS, before a
      // twelve-name list, not after it: a caveat behind twelve names is a
      // caveat most listeners never reach. The names of the undrawn members
      // then close the disclosure, so "some are missing" is never left as
      // an unresolvable claim. {M} is rendered.length — the count actually
      // appended to the SVG — and NOT RENDER_CAP, so if the drawing rules
      // change the label follows the drawing rather than the constant.
      const knotLabel = notShown.length === 0
        ? `${group.length} locations close together: ${shown.map(knotMemberName).join(KNOT_SEPARATOR)}. ${promise}`
        : `${group.length} locations close together, ${shown.length} of them shown here: ${shown.map(knotMemberName).join(KNOT_SEPARATOR)}. Not shown here: ${notShown.map(knotMemberName).join(KNOT_SEPARATOR)}. ${promise}`;
      hit.setAttribute("aria-label", knotLabel);
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

  // THE DRAW-ORDER RULE, executed: every badge of this render, appended
  // after every visual pin of this render. SVG has no z-index — the last
  // element appended wins any overlap — so this one loop is what
  // guarantees a neighbour's pin can never cover a badge, which inside a
  // knot is the ordinary case and is exactly the reading that otherwise
  // costs 2 to 7 zoom clicks.
  //
  // DEVIATION FROM THE LITERAL WORDING, NAMED: the spec says "before
  // hit-areas", and these land after them, because the hit-areas are
  // appended inside the group loop and pulling them out would rework the
  // wiring of every pin on the map for no effect a reader can find. The
  // badges are pointer-events:none and aria-hidden, so a badge over a
  // transparent hit-circle changes neither what is clickable nor what a
  // screen reader hears; what that order was FOR — no pin over a badge —
  // is delivered strictly more strongly here than by the literal one.
  for (const badge of placeReaderBadges()) svg.appendChild(badge);

  // THE KEY IS A RESERVED BAND INSIDE THE PLATE — .map-wrap's first
  // child, in normal flow, immediately above the projection with no gap.
  // The plate's border, radius, background and shadow live on .map-wrap
  // (css/style.css), so the key and the map are one card and the key is
  // printed on the map's own surface rather than on a second card above
  // it. THE INSERTION IS THE CHANGE. Moving the CSS without moving this
  // node leaves the key outside the plate it is now styled to sit
  // inside, and every measured height is then wrong.
  //
  // Built here, at the end of the render, because readerLabelling and
  // the badge set are only known once the pins are drawn — which is also
  // what lets the key list the bands this render actually PAINTED rather
  // than all four it could paint. readerBadgeEntries is the drawn set,
  // so there is no second source of truth to drift: a band is in the key
  // if and only if a badge carrying it is on the map.
  if (readerLabelling) {
    const bandsPresent = new Set(readerBadgeEntries.map((e) => e.markBand));
    const key = buildReaderMarkKey(bandsPresent);
    if (key) wrap.insertBefore(key, wrap.firstChild);
  }

  renderLegend(document.getElementById("map-legend"), persona, activeLens, store, { states: paintedStates, kinds: paintedKinds, ringDrawn });
  renderJudgmentNote(document.getElementById("map-judgment-note"));
}

// =====================================================================
// THE KEY BESIDE THE MAP, INSIDE THE PLATE, NEVER BELOW IT
//
// THE DEFECT, MEASURED WITH A RULER: the map sits at y=564-1098 and
// the mark legend at y~1182 in a 900px viewport, so a reader could never
// see a marked pin and its legend row at the same time. No amount of
// wording fixes that; the key has to move.
//
// IT IS A BAND ABOVE THE PLATE, NOT A PANEL INSIDE IT. First child of
// #map-root, before .map-wrap, in normal flow — DOM, not SVG, so it never
// pans, scales or zooms with the map, and it occupies its own space
// rather than taking any from the map.
//
// WHY IT LEFT THE PLATE, and this is the whole reason: an absolutely
// positioned in-plate key COVERS PINS. It was placed bottom-left on the
// reasoning that WORLD_VIEWBOX's bottom-left corner is open Pacific —
// but the home view is not WORLD_VIEWBOX. It is
// computeViewBoxForLocations(), a padded crop around the 38, whose
// bottom-left corner sits at Patagonian latitude with the Andes about
// 230px in. Measured on the rendered page, a 240x299 panel at 94%
// opacity in a 534px plate covered three pins (CO-medellin,
// CO-santamarta, EC-cuenca) and four labels at 1280 and 1440; collapsed
// at 700 it still covered AR-buenosaires.
//
// AND NO CORNER FIXES IT. Measured at 1179 wide: top-left covers 13 pins
// including both marked Guatemala pins and their badges, top-right
// covers 5 including three marked Thai pins, bottom-right covers 4 and
// sits on .zoom-controls. The largest clear rectangle in the bottom-left
// corner is 232x180, too small for these rows at their real wording, and
// below 700px the only state that covers nothing is a collapsed "Key".
// A key the reader must close to see the pin it explains is a pin
// subtracted from the eye at the moment the key is read.
//
// WHY ABOVE AND NOT BELOW: the below-map legend's defect was DISTANCE,
// not direction — it sat after the Fit ramp and its anchor string, about
// 500px from the nearest marked pin. Above, the reader meets the
// vocabulary before the marks, and 7 of the 12 marked pins (Portugal x3,
// Spain x2, Crete x2) sit in the plate's top ~115px, roughly one glance
// from the band.
//
// COVERAGE IS 0 PINS, 0 BADGES, 0 LABELS AT EVERY WIDTH BY CONSTRUCTION:
// nothing here is absolutely positioned, so nothing can overlap the map.
//
// THE ROWS ARE KEYED BY BAND, NOT BY STATE, and that is the structural
// half of the fix rather than a tidy-up. The retired key had seven
// state-keyed rows, and the re-band left three states — the partial-read
// ones — wearing a mark that stood under no row at all. A
// band-keyed key cannot have that gap: every state STATE_BAND can emit
// sits under exactly one row, and each label is written to be true of
// every state in its band. The tooltip still carries each state's own
// sentence; the key compresses, the tooltip diagnoses.
// THE HEADING AND ITS ROWS MOVE TOGETHER, ALWAYS. This summary sits over
// READER_MARK_ROWS below; dropping "income" here while a row still reads
// "on income" would ship a heading and a list that disagree inside one
// open <details>.
const READER_MARK_KEY_TITLE = "Mark on a pin — your own read:";
const READER_MARK_ROWS = [
  // "on income" deleted — matches the same deletion on the sentence this
  // row compresses. A clean band can be earned against a capital bar.
  { band: "clean", label: "Above the bar" },
  { band: "uncertain_or_conditional", label: "Not settled — right at the line, above with conditions, or a no on only the routes the site could read" },
  // Lead deleted, trailing clause KEPT: "or not this kind of income" is
  // READER_WRONG_TYPE, which genuinely is about income type. Only the
  // lead claimed the whole band was an income reading.
  { band: "hard_fail", label: "Doesn't clear — below the bar, or not this kind of income" },
  { band: "data_gap", label: "Couldn't be read — not enough recorded, or the bar is in another currency" },
];
// The trailing line, no swatch: the absence is a state too, and the
// perspective-disclosure law makes it one the key has to name.
const READER_MARK_KEY_TRAILING = "No mark: this box hasn't read that country against your figures.";

// bandsPresent: a Set of the mark bands this render actually drew. The
// key prints one row per band PRESENT, in READER_MARK_ROWS' fixed order,
// and nothing else — a decoder for the map in front of this reader, not
// a catalogue of every verdict the engine can reach. A reader whose map
// carries two kinds of mark was being handed four rows, two of them
// explaining symbols that appear nowhere on his map; on a phone that
// cost ~90px of vertical space to say nothing.
//
// THIS IS A RULE, NOT A HARDCODE OF "TWO ROWS". The day the currency
// read lands and countries start banding uncertain_or_conditional, that
// row starts printing with no edit here.
//
// NOT SUPPRESSION, and the objection is worth stating rather than
// ducking: a key listing only "Above the bar" and "Couldn't be read"
// stops telling the reader that a "Doesn't clear" mark exists. No
// downside is ever hidden — a failing place still draws its mark and its
// row appears with it — but the key no longer doubles as a vocabulary
// list. The tooltip carries each state's own sentence either way.
//
// Returns null when the set is empty: a title promising marks above a
// map with none is worse than silence, and the colour legend already
// states the no-mark rule in its own words.
function buildReaderMarkKey(bandsPresent) {
  const rowsForRender = READER_MARK_ROWS.filter((r) => bandsPresent && bandsPresent.has(r.band));
  if (!rowsForRender.length) return null;
  const details = document.createElement("details");
  details.className = "reader-mark-key";
  details.id = "reader-mark-key";
  // OPEN AT EVERY WIDTH. Co-visible by default is the constraint, and a
  // key that starts closed on a narrow screen is the same defect in
  // miniature: present in the DOM, reaching nobody. The reader can still
  // fold it — a fold moves the plate up by the band's height and changes
  // nothing else, because the band is in normal flow. No matchMedia and
  // no resize listener: there is no width at which the default differs,
  // so there is no state a rotation could strand.
  details.open = true;
  const rows = rowsForRender.map(({ band, label }) => `
      <li class="reader-mark-key-row">
        <svg class="reader-mark-key-swatch" viewBox="0 0 ${BADGE_BOX} ${BADGE_BOX}" width="${BADGE_BOX}" height="${BADGE_BOX}" aria-hidden="true" focusable="false"><use href="#${BADGE_GLYPHS[band].id}"></use></svg>
        <span>${escapeHtml(label)}</span>
      </li>`).join("");
  details.innerHTML = `
    <summary>${escapeHtml(READER_MARK_KEY_TITLE)}</summary>
    <ul class="reader-mark-key-rows">${rows}</ul>
    <p class="reader-mark-key-trailing">${escapeHtml(READER_MARK_KEY_TRAILING)}</p>
  `;
  return details;
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
    // Throttled path (fix): a fast scroll/trackpad gesture fires
    // dozens-to-hundreds of these in under a second — see applyZoomThrottled()'s
    // own header comment for the reproduced freeze this replaces.
    applyZoomThrottled(store, lenses, e.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP, focal);
  }, { passive: false });

  // Entry point 2b: click-and-drag panning — flagged live:
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
      // Throttled path (fix, same reason as the wheel handler
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
//
// NO SEVENTH ROW HERE, deliberately. This object is a COLOR
// key -- renderVerdictKey() below reads STATE_HEADLINE_BAND[state] to pick
// each row's swatch -- and the seventh verdict state (the location-capped
// null; see STATE_HEADLINE's own note in app-shared.js) is precisely the
// one state with no single band: its real rows land in `hard_fail` AND in
// `uncertain_or_conditional`, non-empty on both sides. No ratio is written
// out here, deliberately — both halves move on every re-export (the pair
// this comment used to carry had already gone stale, by different amounts
// in the shipped export and in the source one), and it is the
// two-sidedness and not any particular split that makes a single swatch
// false. A row here would have to claim one color and would mislead the
// readers on the other side. The `includePending` row below is NOT a
// precedent for adding one -- pending has its own real color
// (pendingColor()); this case has two. Pins carrying it are already
// painted correctly by bandVisual(overall_band), and their sentence is
// carried by stateHeadline() in the tooltip; what is genuinely missing is
// a legend line explaining WHY such a pin is that color, and that is a
// design call, not a mechanical one. Named, not invented.
const STATE_CHIP_LABEL = {
  QUALIFIES_AND_CONVERTS: "Clears, leads to permanent residency",
  QUALIFIES_CONDITIONAL: "Clears, with conditions",
  UNCERTAIN_TYPE: "Possible, income type unconfirmed",
  // Kind-neutral: FAILS_AMOUNT fires on capital bars in the shipped data,
  // so naming the instrument here would be false on those rows. Kind-aware
  // persona wording is a separate question and is not answered here.
  FAILS_AMOUNT: "Doesn't clear the bar",
  DEAD_END_BLOCKING: "Confirmed dead end",
  GAP_INSUFFICIENT_DATA: "Not enough documented yet",
  // The engine's four new states. Each is already registered in
  // STATE_HEADLINE and STATE_HEADLINE_BAND (app-shared.js), so the row
  // below and the pin above it read one band table.
  //
  // Two departures from the six labels above, named rather than smoothed
  // over: an em dash where the second clause is a REASON rather than a
  // qualifier, and 42-45 characters against the 35-character ceiling the
  // six set. Both follow from one argument — a label that drops a state's
  // distinguishing caveat is a shorter label for a different state.
  PARTIAL_READ_NO_CLEAR: "Doesn't clear, and some routes weren't read",
  UNCERTAIN_BAR_BASIS: "Not decided \u2014 after-tax bar, before-tax figure",
  NEAR_LINE_AMOUNT: "Right at the line",
  UNCERTAIN_FX_UNAVAILABLE: "Not decided \u2014 no exchange rate to compare on",
};

// Door v2: the reader's legend, REBUILT FOR THE OVERLAY.
//
// WHAT IT REPLACES, kept so the change is legible: a three-row key of
// BANDS, written for the fill-replacement build, whose rows described the
// colour a read pin was PAINTED. Under the overlay no pin is painted a
// band colour at all — the fill is the Fit ramp on all 38 — so a
// band-coloured fill key would describe colours the pins do not paint,
// which is this file's own Part 15.5 defect exactly.
//
// THE SHAPE, as specified: the Fit ramp and its anchor line come FIRST,
// because the ramp is what the fills mean now; the mark key follows,
// titled for what a mark is rather than what a colour is; the trailing
// sentence carries the two layers in one line. The rows are keyed by STATE, one
// label each, which is the same shape the shipped persona legend
// (renderVerdictKey below) already uses and swatches the same way —
// STATE_HEADLINE_BAND[state] -> bandVisual().color — so the reader's key
// and the personas' key are one construction, not two.
//
// THE SWATCH IS A RING, NOT A FILLED BLOCK, and not the hatch. Both
// follow from the overlay rather than from taste: the mark is a stroke on
// a pin whose fill is the reader's fit colour, so a filled swatch would
// claim the pin is painted that colour, and the hatch is a FILL (see
// readerPinPaint's own note) and is not drawn on any reader pin.
//
// THE SEVEN STATE-KEYED MARK ROWS ARE RETIRED, and the gap this comment
// used to name is closed by the retirement rather than by filling it.
// KEPT SO THE CHANGE IS LEGIBLE, because the gap was real: the key's
// state table was written before the three partial-read states were
// re-banded, which left READER_BELOW_SOME_UNREAD,
// READER_WRONG_TYPE_SOME_UNREAD and READER_NONE_CLEARS_SOME_UNREAD
// wearing a mark that stood under no row.
// The seven rows were:
//   READER_ABOVE_BAR          "Above the bar, on income"
//   READER_ABOVE_CONDITIONAL  "Above the bar, with conditions"
//   READER_AT_LINE            "Right at the line"
//   READER_BELOW_BAR          "Below the income bar"
//   READER_WRONG_TYPE         "Not this kind of income"
//   READER_NONE_CLEARS        "No route clears on income"
//   READER_NOT_ENOUGH         "Not enough recorded to read against your figures"
// plus the title "What a mark on a pin means for you:".
//
// THE FIX IS STRUCTURAL, NOT A SEVENTH-AND-EIGHTH ROW: the mark is per
// BAND, so the key is keyed by band (READER_MARK_ROWS, above, beside the
// key that now renders it), and a band-keyed key cannot have that gap
// again. The last row also retires a second defect of its own — "Not
// enough recorded to read against your figures" was the misdiagnosed
// cause, corrected in the headline in app-shared.js and left standing
// here, so the key and the tooltip disagreed about the cause set. The band row that replaces it carries the
// headline's own cause set.
//
// ONE KEY, IN THE PLATE. Not two keys that can drift, and not a key a
// reader cannot see at the same time as the thing it explains.
// The legend's trailing sentence, with one substitution landed: "the
// mark" -> "the mark at a pin's top-right", once, in the first clause,
// because the mark is no longer a stroke ON the pin and a sentence that
// says otherwise sends the eye to the wrong pixels. ONE constant, ONE
// remaining substitution: "fits your priorities" / "fits, on the general
// figures".
// THE MIDDLE CLAUSE CARRIED BOTH DEFECTS AT ONCE and the third sentence
// is transported verbatim.
//   "whether ITS residence routes take your income" was the same
//   every-route claim the two scope strings carried — false inside the
//   named countries independently of bar kind.
//   "your income" became "your figures", the site's own noun for what
//   the reader gave, and what the mark is actually computed from.
//   "take" became "read against": "take" describes income-TYPE
//   acceptance alone, while this mark carries above, at-line, below,
//   wrong-type and couldn't-read. That third edit is not a scope fix —
//   it is the clause being made true of the mark it explains.
//   "income bars and nothing else yet" became the same condition clause
//   now on three surfaces: one condition, one wording.
//
// WHY THIS ONE MATTERED MORE THAN ITS SIZE: index.html renders this
// legend and the corrected scope sentence on the SAME page, both
// reader-lens-only, and for the reader who found this crossing's defect
// the mark took its value from a CAPITAL bar. A stale legend here walked
// that reader straight back to "my income is below the income bar" —
// one paragraph from where it had just been repaired.
const READER_LEGEND_NOTE_TEMPLATE =
  "The color is how well the place {fitClause}; the mark at a pin's top-right is how your figures read against residence routes in that country — income bars and capital bars, where a route states one this site can compare. Pins with no mark are in countries this box hasn't read against your figures — their color is still the place's Fit index, and none of it is a verdict.";
const READER_LEGEND_FIT_CLAUSE_WEIGHTED = "fits your priorities";
const READER_LEGEND_FIT_CLAUSE_GENERAL = "fits, on the general figures";
// The two recede summaries. UI copy about the site's own display, not a
// claim about any place. Each names what is behind it, so the summary is a
// real answer to "what am I opening" and not a "more" affordance.
const RING_RECEDE_SUMMARY = "What a ring around a pin means";
const WALDO_RECEDE_SUMMARY = "What this color compares, and where his visa read lives";
// The one new string this change adds, and it is UI copy about the site's
// own display, not a claim about any place. Its first clause is the
// site's own shipped phrasing (the legend note above closes with "none of
// it is a verdict"); its second names what is behind the fold, so a
// reader knows what they are choosing not to open.
const READER_LEGEND_RECEDE_SUMMARY =
  "The colour is not a verdict — what it compares, and what a mark adds";

function renderReaderVerdictKey(scaleHtml, weighted) {
  // The ramp's own title is the SHIPPED one this same reader sees in the
  // no-verdicts state two branches below — reused rather than rewritten,
  // so entering numbers does not change what the fill legend calls
  // itself, which is the legend-side reading of "entering numbers never
  // subtracts a pin".
  const rampTitle = weighted
    ? `Pin color — your own weighted Fit index (${escapeHtml(CUSTOM_ESTIMATE_SUFFIX)})`
    : "Pin color — general Fit index";
  const note = READER_LEGEND_NOTE_TEMPLATE.replace(
    "{fitClause}",
    weighted ? READER_LEGEND_FIT_CLAUSE_WEIGHTED : READER_LEGEND_FIT_CLAUSE_GENERAL
  );
  // THE PHONE BAR. At 390 this legend measured 464.2px against a map card
  // of 300.5 — the map was not the tallest thing on its own page, it was
  // explanation wrapped around a map. The fix moves NO WORDS: at <=700px
  // the two long prose children go behind the page's own existing
  // details.recede mechanism (already shipping twice on this page, above
  // and below the map), byte-identical, one tap away, under a summary
  // that states the limit rather than saying "More".
  //
  // THE RAMP AND THE 5-ANCHOR STAY VISIBLE, deliberately: the five step
  // labels are relative words, and SCALE_ANCHOR_STRING is the one
  // sentence that stops "Strongest fit" reading as "good enough".
  // Receding it too was measured and would have bought another ~77px by
  // making a misreading more likely. Above 700 nothing changes for
  // anyone: the same children render in the same order, unfolded.
  const alwaysVisible = `<div class="legend-scale">${rampTitle}: ${scaleHtml}</div>`
    + `<span>${escapeHtml(SCALE_ANCHOR_STRING)}</span>`;
  const prose = `<span>${escapeHtml(note)}</span>` + bandDisclosureHtml();
  // Render-time decision, no matchMedia and no resize listener: a reader
  // who resizes across the breakpoint keeps whatever state they had,
  // which is benign in both directions because the prose is one tap away
  // either way. Named rather than handled.
  const openAttr = (typeof window !== "undefined" && window.innerWidth > 700) ? " open" : "";
  return alwaysVisible
    + `<details class="recede legend-recede"${openAttr}>`
    + `<summary>${escapeHtml(READER_LEGEND_RECEDE_SUMMARY)}</summary>`
    + `<div class="recede-body">${prose}</div>`
    + `</details>`;
}

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
//
// THE PRESENCE FILTER. Before it,
// this function iterated the whole STATE_CHIP_LABEL table, so every
// persona's legend listed every state the table could name whether or not
// that persona's map painted it. With six rows that was merely untrue;
// with ten it is also the tallest thing on a phone page (measured at 390:
// 200.3px of legend against a 159.7px map plate, going to 320.2px
// unfiltered). A legend that explains colours this map does not paint is a
// legend about a different map.
//
// THE RULE: a row renders iff a pin on THIS render carries its state. It
// is the same construction buildReaderMarkKey() already ships fifteen
// lines below for the reader's own key ("a band is in the key iff a badge
// carrying it is on the map") — the same idea, applied to the older of the
// two keys, not a new one.
//
// THE SECOND CLAUSE BELOW IS AN INTERIM, and it is recorded as one so the
// next reader does not have to rediscover why it is shaped this way.
//
// MEASURED in the browser, on the real painted sets: Wenda's
// and Carmen's maps are MIXED. Some of their pins come from the engine and
// carry an `overall_state`; the rest come from hand fixtures and are
// painted by verdictVisual(), which returns a KIND, not a state. Wenda at
// 1280 paints three states (UNCERTAIN_TYPE, FAILS_AMOUNT,
// GAP_INSUFFICIENT_DATA) and four kinds (nearmiss, clear, eliminated,
// pending). So the spec's rule, read literally, would drop the rows that
// explain her green pins and her amber near-miss pins — colours that ARE
// on her map.
//
// But a kind resolves to a BAND, and a band holds several rows. Admitting
// every row of a painted band put Wenda's and Carmen's legends at ELEVEN
// rows — 427.4px at 390 against a 159.7px plate, worse than the 307.5px
// they ship today and a direct failure of the spec's own height check —
// because one amber fixture pin pulled in all five uncertain-family rows,
// four of which name readings her map does not contain.
//
// THE INTERIM, and it makes no legend taller than the one shipping today:
//   - the four states added last render ONLY where a pin on this render
//     actually carries them — the rule above, unweakened;
//   - the six older states also survive when a stateless
//     pin painted their band, so a hand-fixture pin's colour is never left
//     without a row to explain it.
// On the six no-fixture personas the second clause never fires at all
// (measured: zero kinds painted). On Wenda and Carmen it is what keeps the
// six pre-existing rows, and their legend is byte-identical to the one
// they ship today.
//
// WHAT IS HELD, NOT DECIDED: what a hand-fixture persona's legend should
// actually be. Their pins speak verdictVisual()'s vocabulary ("Clears",
// "Near-miss", "Misses", "Unverified") and the legend speaks the engine's;
// the two have never been reconciled and reconciling them is the
// band-grouped rebuild the spec names as the real next move and
// deliberately does not specify. Not this build's to answer.
//
// A PAINTED STATE WITH NO LABEL IS A BUILD ERROR, REPORTED, NOT SILENTLY
// DROPPED (the spec's own words). It warns to the console and renders
// nothing, because the alternative — rendering the raw token as its own
// label — is the exact defect this table exists to prevent.
//
// `painted` is optional. Called without it (nothing does today) the whole
// table renders, i.e. the pre-filter behaviour.
const VERDICT_KIND_BAND = {
  clear: "clean",
  typetrap: "uncertain_or_conditional",
  nearmiss: "uncertain_or_conditional",
  eliminated: "hard_fail",
};
// The four states added last, after the six above them. A row for one of
// these renders only when a pin on this render carries that exact state —
// never on the band fallback. See the interim note on renderVerdictKey().
const LATEST_ADDED_STATES = new Set([
  "PARTIAL_READ_NO_CLEAR",
  "UNCERTAIN_BAR_BASIS",
  "NEAR_LINE_AMOUNT",
  "UNCERTAIN_FX_UNAVAILABLE",
]);
function renderVerdictKey(displayName, includePending, painted) {
  const statesPainted = painted && painted.states;
  const bandsFromStatelessPins = new Set();
  if (painted && painted.kinds) {
    for (const kind of painted.kinds) {
      const band = VERDICT_KIND_BAND[kind];
      if (band) bandsFromStatelessPins.add(band);
    }
  }
  if (statesPainted) {
    for (const state of statesPainted) {
      if (!STATE_CHIP_LABEL[state]) {
        console.warn(
          "renderVerdictKey: a pin on this render carries a verdict state with no legend label — " +
          "the legend cannot explain its colour:", state, "(persona:", displayName + ")"
        );
      }
    }
  }
  const items = Object.entries(STATE_CHIP_LABEL).filter(([state]) => {
    if (!statesPainted) return true;
    if (statesPainted.has(state)) return true;
    if (LATEST_ADDED_STATES.has(state)) return false;
    return bandsFromStatelessPins.has(STATE_HEADLINE_BAND[state]);
  }).map(([state, label]) => {
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
  // THE RING SENTENCE IS ABSENT WHERE NO RING IS DRAWN — not receded,
  // absent. It was gated on `includePending`, i.e. "does this persona have
  // fixture ROWS", which is a coarser question than "is a ring on this
  // map". Measured at 1280: adira, marek, marguerite, noa and teo each
  // draw 0 rings and each rendered this sentence; Wenda and Carmen draw 24
  // apiece. A sentence explaining a mark the reader cannot find is false,
  // and receding a false sentence only makes it quieter, so the gate is
  // now the same signal the ring itself is drawn from.
  //
  // Absent at EVERY width, not only at <=700: the sentence is no more true
  // on a desktop than on a phone. This is why the five personas' 1280
  // legends get shorter here rather than staying unchanged.
  const ringDrawn = painted ? !!painted.ringDrawn : true;
  const ringText = `A ring around a pin means we hand-checked that answer for ${escapeHtml(displayName)}. No ring means the rule-derived read.`;
  // AND WHERE IT IS TRUE, IT RECEDES AT <=700 ONLY. The branch is on the
  // ELEMENT, not on the `open` attribute: an open <details> carries a
  // summary line a bare <span> does not, so reusing the shipped
  // `<details open>` idiom at all widths lengthens every desktop legend
  // instead of shortening anything. Above 700 the span renders verbatim,
  // same string, same position.
  const narrow = typeof window !== "undefined" && window.innerWidth <= 700;
  const ringLine = !(includePending && ringDrawn)
    ? ""
    : narrow
      ? `<details class="recede legend-recede">`
        + `<summary>${escapeHtml(RING_RECEDE_SUMMARY)}</summary>`
        + `<div class="recede-body">${ringText}</div>`
        + `</details>`
      : `<span>${ringText}</span>`;
  // "What each pin color means" claimed a colour resolves to a meaning,
  // and it does not: two rows already shared the
  // amber swatch before the four new rows landed and up to four share it
  // after, so
  // the old heading was plainly false. This one still introduces
  // swatch-and-label rows and still states whose lens the legend shows.
  return `<div class="legend-scale">What the pins say for ${escapeHtml(displayName)}: ${items.join("")}</div>${ringLine}`;
}

// v8 R7: the legend becomes mode-aware — three mutually exclusive shapes,
// never overlaid on each other, so the colors on screen and the words
// explaining them always agree about what mode is showing. Exact strings
// are ruled UI copy, transported verbatim, not paraphrased here.
function renderLegend(el, persona, activeLens, store, painted) {
  // Re-read the theme-appropriate ramp/colors at render time (not cached),
  // so this legend is always correct for the current light/dark mode.
  //
  // v10 Part 11: each stop reads "<value> · <meaning>" (e.g. "1 · Weakest
  // fit") so color, number, and meaning read together at a glance — the
  // v7 Part 16 hue-name label ("Red"/"Green", withheld in dark mode since
  // it would mislabel the unrelated honey-gold ramp) is retired; a
  // meaning label has no hue to mismatch, so it now renders in both
  // themes for free (see getScaleLegend()'s own comment).
  // Live-toggle repaint fix: each stop marked with the exact
  // integer value getScaleLegend() derived its color from (equal to
  // scoreToColor(s.value) by construction — both index stops[v-1] off the
  // same currentScaleStops()) — "score" kind, RAMP_VALUE_ATTR/
  // RAMP_KIND_ATTR (colors.js), so repaintRampSwatches() can recompute it
  // after a toggle instead of leaving this legend's swatches stuck at
  // whichever theme was live when the persona/lens view last (re-)rendered.
  const scaleHtml = getScaleLegend().map(
    (s) => `<span class="legend-step"><span class="legend-swatch" style="background:${s.color}" ${RAMP_VALUE_ATTR}="${s.value}" ${RAMP_KIND_ATTR}="score"></span> ${s.value} · ${escapeHtml(s.name)}</span>`
  ).join("");

  if (activeLens && activeLens.kind === "facts") {
    // Facts-lens variant (Part 6): two swatches, no ramp, no scale-anchor
    // line — nothing 1-5 is on screen in this mode. DOG_LENS_COLOR is
    // theme-INDEPENDENT (colors.js's own const, not a function) so it
    // needs no repaint marker; the gap-demo swatch is a real
    // scoreToColor(null) consumer and gets one.
    el.innerHTML = `
      <div class="legend-scale">
        <span class="legend-item"><span class="legend-swatch" style="background:${DOG_LENS_COLOR}"></span> Rules on file</span>
        <span class="legend-item"><span class="legend-swatch legend-gap-demo" style="background:${scoreToColor(null)}" ${RAMP_VALUE_ATTR}="" ${RAMP_KIND_ATTR}="score"></span> Not researched yet</span>
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

  if (persona === READER_ID) {
    // Door v2: the reader's legend follows the reader's pins, which is
    // the whole reason this branch exists rather than one generic one —
    // a legend that describes colours the pins are not painting is the
    // defect Part 15.5 was written to fix, and the reader identity can
    // now paint two completely different channels.
    const weighted = hasReaderWeights();
    if (hasReaderVerdicts(store)) {
      el.innerHTML = renderReaderVerdictKey(scaleHtml, weighted);
      return;
    }
    const title = weighted
      ? `Pin color — your own weighted Fit index (${escapeHtml(CUSTOM_ESTIMATE_SUFFIX)})`
      : "Pin color — general Fit index";
    el.innerHTML = `
      <div class="legend-scale">${title}: ${scaleHtml}</div>
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
      // AT <=700 THE PROSE RECEDES AND THE KEY DOES NOT. This is the
      // tallest legend on the site at 390 and no filter or label change has
      // ever been able to reach it, because it carries no verdict rows to
      // filter — it is a ramp, five step labels and two sentences.
      //
      // SCALE_ANCHOR_STRING STAYS VISIBLE, deliberately, and it is split out
      // of the span it was concatenated into rather than reworded: the five
      // step labels are relative words, and the anchor is the one sentence
      // that stops "Strongest fit" reading as "good enough". Receding it too
      // would buy more pixels by making a misreading more likely — the same
      // call, for the same reason, that the reader's own key above already
      // made. The visa sentence and the calibration disclosure are the two
      // that can wait behind a summary.
      //
      // Above 700 this renders exactly as it always has, concatenation
      // included, and the branch is on the ELEMENT for the reason given at
      // the ring sentence: an open <details> is TALLER than the span it
      // replaces, so reusing that idiom at all widths regresses desktop.
      const waldoVisaLine = "Where we've also checked his visa/residency path, that separate read shows in the tooltip and on his page — place quality and eligibility never share one pin color.";
      const waldoNarrow = typeof window !== "undefined" && window.innerWidth <= 700;
      const waldoProse = waldoNarrow
        ? `<span>${escapeHtml(SCALE_ANCHOR_STRING)}</span>`
          + `<details class="recede legend-recede">`
          + `<summary>${escapeHtml(WALDO_RECEDE_SUMMARY)}</summary>`
          + `<div class="recede-body"><span>${escapeHtml(waldoVisaLine)}</span>${bandDisclosureHtml()}</div>`
          + `</details>`
        : `<span>${escapeHtml(SCALE_ANCHOR_STRING)} ${escapeHtml(waldoVisaLine)}</span>${bandDisclosureHtml()}`;
      el.innerHTML = `
        <div class="legend-scale">Pin color — Waldo's Fit index, rescored where we have real data for him: ${scaleHtml}</div>
        ${waldoProse}
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
    el.innerHTML = renderVerdictKey(displayName, hasFixtures, painted);
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
