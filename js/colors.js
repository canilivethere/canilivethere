// CanILiveThere — color logic for the map, lists, and score chips.
//
// Light-mode Fit-index scale + dark theme (2026-07-10 revision,
// "score-scale valence + site warmth"): value 1 (poor fit) -> value 5
// (strong fit) now runs one warm hue
// (OKLCH ~82°, "honey-gold"), monotone lightness, light->dark in light
// mode and dark->light in dark mode ("flips anchor in dark" per the
// project's color-formula method) — replacing the prior cool YlGnBu
// scale, whose light end (bright pale yellow) read as the *friendliest*
// looking color despite being the worst score, the opposite of the
// scale's own meaning. Both ramps were run through the dataviz skill's
// palette validator (Python port, Node unavailable on this machine —
// see the v2 addendum §1 for the full validator output)
// against this project's own surfaces, not eyeballed.
const SCALE_STOPS_LIGHT = ["#c3a774", "#a7833b", "#856214", "#614500", "#402d02"];
const SCALE_STOPS_DARK = ["#634c1e", "#916a11", "#bd8c1d", "#e5b147", "#fad99d"];

// Boring, dependency-light dark-mode detection: the OS/browser's own
// `prefers-color-scheme`, no toggle UI, no stored preference — the
// craft standard's "no framework, no build step" extended to theming.
export function prefersDark() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function currentScaleStops() {
  return prefersDark() ? SCALE_STOPS_DARK : SCALE_STOPS_LIGHT;
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
  if (value == null || Number.isNaN(value)) return prefersDark() ? "#4a4640" : "#e2e2e2";
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
export function getScaleLegend() {
  const stops = currentScaleStops();
  return [1, 2, 3, 4, 5].map((v) => ({ value: v, color: stops[v - 1] }));
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
export const ELIMINATED_STROKE = "#3a2a1a";
const ELIMINATED_STROKE_DARK = "#846546"; // v2 addendum §2.3, 3.24:1 vs dark paper, non-text floor
export function eliminatedColor() {
  return prefersDark() ? ELIMINATED_STROKE_DARK : ELIMINATED_STROKE;
}
export const CONDITIONAL_COLOR = "#e07b1a"; // amber/orange, "possible, painfully" — same value both themes
export const PENDING_COLOR = "#9a9a9a"; // verification-pending gray — same value both themes

// "Clears" needs its own dark-mode value: the light-mode green
// (#1a7a3c) fails WCAG AA against the dark paper (3.21:1); #319751
// clears 4.68:1 (v2 addendum §2.3).
const CLEARS_LIGHT = "#1a7a3c";
const CLEARS_DARK = "#319751";
export function clearsColor() {
  return prefersDark() ? CLEARS_DARK : CLEARS_LIGHT;
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
