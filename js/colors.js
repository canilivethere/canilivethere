// CanILiveThere — color logic for the map, lists, and score chips.
//
// Light-mode Fit-index scale (v6 addendum R2.1, 2026-07-12, "pins
// recolored, brown retired"): the honey-gold single-hue ramp this
// comment used to describe survived the site's warmth pass but was
// a live-site "coffee stains" complaint — replaced with a
// five-step, quantized, multi-hue ramp (violet weakest -> yellow
// strongest, bright = strong), lightness-monotone across hues, the same
// CVD-safety mechanism a single-hue ordinal ramp uses, extended per the
// most recent live-site palette review. Run through the dataviz skill's palette validator
// (Python port, Node unavailable — same method as every prior pass)
// against this project's own three surfaces (landmass/water/paper) PLUS
// Machado-2009 CVD and a categorical --pairs-all check (a multi-hue
// ramp sits outside the validator's two documented shapes, so both ran);
// full numbers in the addendum. One named exception trusted over its own
// proxy: green->yellow-green's raw lightness delta (0.055) reads just
// under the ordinal heuristic's floor, but the pair's real CVD
// separation (ΔE 14.9/20.9) clears the 12.0 target with room, so the
// direct measurement won under the proxy it approximates.
//
// Dark-mode ramp: UNCHANGED, out of scope this pass (same caution v4 R3
// used for map water before extending it later) — still the honey-gold
// scale from the 2026-07-10 revision, value 1 (poor fit) -> value 5
// (strong fit), dark->light in dark mode ("flips anchor in dark" per the
// project's color-formula method), validated then, not re-validated now.
const SCALE_STOPS_LIGHT = ["#330063", "#002d88", "#006726", "#596e00", "#ae7d00"];
const SCALE_STOPS_DARK = ["#634c1e", "#916a11", "#bd8c1d", "#e5b147", "#fad99d"];
// v6 §2.1 names, light ramp only — paired with SCALE_STOPS_LIGHT by index.
// getScaleLegend() below withholds names in dark mode rather than
// mislabeling an unrelated honey-gold swatch "Violet"/"Yellow" (see that
// function's own comment).
const SCALE_STOP_NAMES_LIGHT = ["Violet", "Blue", "Green", "Yellow-green", "Yellow"];

// Theme detection (v4 addendum R2): reads the `data-theme` attribute
// app-shared.js's applyStoredTheme()/toggleTheme() set on <html>, not the
// OS/browser's `prefers-color-scheme` — light is the unconditional
// default, dark only via an explicit, persisted toggle. Formerly
// prefersDark() (a cached MediaQueryList read); renamed, same call-site
// contract (every caller below is unchanged), no OS read left anywhere.
export function isDarkTheme() {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.theme === "dark";
}

function currentScaleStops() {
  return isDarkTheme() ? SCALE_STOPS_DARK : SCALE_STOPS_LIGHT;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

// value: 1..5 (fractional allowed). Clamped and linearly interpolated
// across the 5 stops of the theme-appropriate ramp above.
export function scoreToColor(value) {
  // Neutral gray, unscored — a warmer, darker neutral in dark mode so it
  // reads as "no data" against the dark paper rather than a stray bright
  // patch (a builder color choice, not run through the palette
  // validator — same class of minor, unspecced fill decision as the
  // map's own dark water tone, see the v2 addendum §2.4).
  if (value == null || Number.isNaN(value)) return isDarkTheme() ? "#4a4640" : "#e2e2e2";
  const stops = currentScaleStops();
  const clamped = Math.max(1, Math.min(5, value));
  const pos = clamped - 1; // 0..4
  const i = Math.min(3, Math.floor(pos));
  const frac = pos - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  const mixed = a.map((v, idx) => v + (b[idx] - v) * frac);
  return rgbToHex(mixed);
}

// Recomputed on every call (not a cached const) so it reflects the
// current theme at render time — call sites re-read this each render,
// same as scoreToColor.
//
// v6 addendum §2.3: each stop now carries its own `name` (Violet/Blue/
// Green/Yellow-green/Yellow) so the legend can label steps instead of
// showing an unlabeled swatch strip. Light-mode only, deliberately: the
// dark ramp is explicitly out of scope this pass (R2.1) and stays the
// old honey-gold hues, so naming it "Violet"..."Yellow" would put a
// wrong color name on an unrelated swatch — a scoped extension of the
// addendum's own dark-ramp exclusion, not a contradiction of it (flagged
// for the record, not silently decided).
export function getScaleLegend() {
  const stops = currentScaleStops();
  const dark = isDarkTheme();
  return [1, 2, 3, 4, 5].map((v) => ({
    value: v,
    color: stops[v - 1],
    name: dark ? null : SCALE_STOP_NAMES_LIGHT[v - 1],
  }));
}

// Distinct, deliberately NOT-on-the-continuum states (per website-brief:
// "eliminated = visibly dark/hatched" — never just the darkest end of the
// same scale, which would visually read as "merely low," not "gone").
// Unchanged in dark mode per the v2 addendum's own contrast table (both
// already clear their floors against the dark surface) — CONDITIONAL_COLOR
// is also now the single unified value for this "possible, painfully"
// concept (v2 addendum §2.5: style.css's `--conditional` token was a
// different hex for the same meaning; that CSS token now matches this one,
// not the reverse).
export const ELIMINATED_FILL = "url(#hatch-eliminated)";
// v6 addendum §2.2: aubergine, brown retired here too (was #3a2a1a light /
// #846546 dark). Light aubergine clears 10.9-16.3:1 against all three
// surfaces and reads as the same dark violet-purple family as the ramp's
// own weakest stop (#330063, ΔE 27.2 — reviewed as a "coherence check,
// met") while staying distinct from every other frozen verdict color
// (ΔE 66-98). Dark aubergine clears 3.19:1 against dark paper, matching
// brown's old floor — not yet provably "same family" as a violet ramp end
// the way the light one is, since the dark general ramp is still
// honey-gold with no dark violet anchor (a named, carried-over caveat,
// stated here verbatim rather than re-argued).
export const ELIMINATED_STROKE = "#370036";
const ELIMINATED_STROKE_DARK = "#984f92";
export function eliminatedColor() {
  return isDarkTheme() ? ELIMINATED_STROKE_DARK : ELIMINATED_STROKE;
}
export const CONDITIONAL_COLOR = "#e07b1a"; // amber/orange, "possible, painfully" — same value both themes
export const PENDING_COLOR = "#9a9a9a"; // verification-pending gray — same value both themes

// "Clears" needs its own dark-mode value. clearsColor()'s only consumer is
// verdictVisual()'s "clear" branch, whose color is always rendered as a
// .verdict-chip BACKGROUND under hardcoded white text (never as plain text
// against the paper) — so the dark value must clear AA as a background
// under white (needs relative luminance <= ~0.183), not just as text
// against the dark paper. #319751 (~3.7:1 under white) undershoots that;
// #1d6b3f clears ~6.5:1.
const CLEARS_LIGHT = "#1a7a3c";
const CLEARS_DARK = "#1d6b3f";
export function clearsColor() {
  return isDarkTheme() ? CLEARS_DARK : CLEARS_LIGHT;
}

// Wenda/Carmen verdict-headline -> visual treatment. Mechanical keyword
// match on the fixture's own leading clause (see data.js verdictHeadline),
// never a re-interpretation of the prose.
export function verdictVisual(headline) {
  const h = headline.toLowerCase();
  // NOTE: the two "type-trap" checks (a real, distinct fixture shape —
  // "clears the number, fails the type" / "one door opens, leads nowhere")
  // MUST be checked before the plain "clears" check below, since both
  // start with a shared prefix and the more specific case would otherwise
  // be unreachable.
  if (h.startsWith("clears the number")) return { kind: "typetrap", color: CONDITIONAL_COLOR, label: "Clears the number, fails the type" };
  if (h.startsWith("one door opens")) return { kind: "typetrap", color: CONDITIONAL_COLOR, label: "One door opens, leads nowhere" };
  if (h.startsWith("clears")) return { kind: "clear", color: clearsColor(), label: "Clears" };
  if (h.startsWith("near-miss")) return { kind: "nearmiss", color: CONDITIONAL_COLOR, label: "Near-miss" };
  if (h.startsWith("unverified")) return { kind: "pending", color: PENDING_COLOR, label: "Unverified" };
  if (h.startsWith("misses") || h.startsWith("categorical absence"))
    return { kind: "eliminated", color: eliminatedColor(), label: "Misses" };
  return { kind: "unknown", color: PENDING_COLOR, label: headline };
}
