// CanILiveThere — color logic for the map, lists, and score chips.
//
// Light-mode Fit-index scale. **v7 Part 16 (2026-07-13) supersedes v6
// R2.1's own "stays unchanged" ruling — it does not stay unchanged.**
// Tone instruction, verbatim: "same kinda shades as
// were used already." Three of five stops are the exact hexes already
// shipped and already CVD/contrast-validated (v6) — only their POSITION
// on the ramp moves; #006726/#596e00/#ae7d00 are reused verbatim, not
// re-derived. Two new stops (#7a2213 Red, #a35a0e Orange) replace the
// old violet/blue worst-end, checked this session against parchment
// (#F2E8D5) with the same WCAG relative-luminance math the rest of this
// palette uses as its stand-in for the still-unresolved dataviz skill:
// #7a2213 8.36:1, #a35a0e 4.29:1 — both clear the 3:1 non-text floor
// with real margin. Hue check, computed not eyeballed: 7.8°→30.6°→
// 43.1°→71.4°→142.2°, a clean monotonic red-to-green progression, muted/
// dark-saturated throughout, no stop reads neon or primary-traffic-light.
// **Named open gap, an explicit deferral, not silently
// dropped:** no lightness/saturation CVD accommodation this pass — a
// hue-only red-to-green ramp is the single worst-case failure mode for
// red-green colorblindness (deuteranopia/protanopia, ~8% of men), and
// this ships anyway on direct instruction; the Machado-2009 CVD
// simulation that validated the PRIOR ramp's hues against each other
// was not re-run against this one. Revisit in a dedicated later color
// pass, not decided here.
const SCALE_STOPS_LIGHT = ["#7a2213", "#a35a0e", "#ae7d00", "#596e00", "#006726"];
const SCALE_STOPS_DARK = ["#634c1e", "#916a11", "#bd8c1d", "#e5b147", "#fad99d"];
// v7 Part 16 names, light ramp only — paired with SCALE_STOPS_LIGHT by
// index, red (weakest) -> green (strongest). getScaleLegend() below
// withholds names in dark mode rather than mislabeling an unrelated
// honey-gold swatch "Red"/"Green" (see that function's own comment) —
// dark-mode ramp is UNCHANGED, out of scope this pass (same v6 R2.1
// caution), still the honey-gold scale from the 2026-07-10 revision.
const SCALE_STOP_NAMES_LIGHT = ["Red", "Orange", "Yellow", "Yellow-green", "Green"];

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
// v6 addendum §2.3 / v7 Part 16: each stop carries its own `name` (Red/
// Orange/Yellow/Yellow-green/Green as of Part 16 — was Violet/Blue/
// Green/Yellow-green/Yellow) so the legend can label steps instead of
// showing an unlabeled swatch strip. Light-mode only, deliberately: the
// dark ramp is explicitly out of scope this pass (R2.1, still true post-
// Part-16) and stays the old honey-gold hues, so naming it "Red"..."Green"
// would put a wrong color name on an unrelated swatch — a scoped
// extension of the addendum's own dark-ramp exclusion, not a
// contradiction of it (flagged for the record, not silently decided).
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
// surfaces and stays distinct from every other frozen verdict color
// (ΔE 66-98) — that distinctness check still holds today, untouched by
// Part 16. **Stale as of v7 Part 16, flagged rather than silently left
// asserting a now-false claim:** the "same dark violet-purple family as
// the ramp's own weakest stop" coherence read (ΔE 27.2 against the old
// #330063) no longer applies — Part 16 moved the ramp's weakest stop to
// #7a2213 (red), so this color and the ramp's low end are no longer the
// same hue family. Not re-derived here (out of this change's own scope,
// which Part 16 explicitly named as ramp-hexes-and-legend-names only) —
// a real, named gap for whoever next tunes ELIMINATED_STROKE, not a
// contradiction quietly left standing. Dark aubergine clears 3.19:1
// against dark paper, matching brown's old floor — was never provably
// "same family" as a ramp end even before Part 16, since the dark
// general ramp is still honey-gold with no dark violet/red anchor (a
// named, carried-over caveat, stated here verbatim rather than
// re-argued).
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
