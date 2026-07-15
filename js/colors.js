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

// v8 R4: the unscored/null branch no longer returns a bare gray — it
// adopts the site's existing GAP voice (same family as confidenceBadge()'s
// badge-gap and the fact-list's own "Not yet researched" treatment), so
// "not researched" reads as one honest gap-shape site-wide instead of a
// fourth unrelated gray. Duplicated as literal hex here rather than a CSS
// var() reference — same intentional-duplication pattern this file already
// uses for ELIMINATED_STROKE/CONDITIONAL_COLOR/pendingColor(), since this
// value has to work as a plain SVG fill attribute and an inline chip
// background alike, not just inside a stylesheet. Matches style.css's own
// --gap-bg token, both themes (that token already carries a real dark-mode
// value, so this isn't a new dark-mode surface — reusing an existing one).
const GAP_BG_LIGHT = "#E4D8BC";
const GAP_BG_DARK = "#2c2c28";

// value: 1..5 (fractional allowed), or null/NaN for "not researched."
// v8 R2: quantized to the ramp's 5 NAMED stops — no more linear
// interpolation between them. A value snaps to its nearest stop
// (Math.round(clamped) - 1, per the ruling's own arithmetic) everywhere
// this function is consumed: map pins, list chips, location chips — one
// semantic per color site-wide. The exact fractional number stays the
// fact, rendered as text (tooltips/chips already carry it); color now
// only ever answers "roughly what kind," never "exactly what."
export function scoreToColor(value) {
  if (value == null || Number.isNaN(value)) return isDarkTheme() ? GAP_BG_DARK : GAP_BG_LIGHT;
  const stops = currentScaleStops();
  const clamped = Math.max(1, Math.min(5, value));
  const idx = Math.max(0, Math.min(4, Math.round(clamped) - 1));
  return stops[idx];
}

// v8: a plain "is this the gap state" check, shared by any caller that
// needs to branch on it (map.js's per-pin gap stroke class, the dog-import
// facts lens) instead of re-testing value==null/NaN independently.
export function isGapValue(value) {
  return value == null || Number.isNaN(value);
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
// Part 16. **Resolved, v8 R4:** aubergine vs. the ramp's own weakest stop
// (now red, #7a2213, since Part 16) separates at ΔE 54.1 — distinctness
// holds by measurement, hex unchanged. Dark aubergine clears 3.19:1
// against dark paper, matching brown's old floor — the dark general ramp
// is still honey-gold with no dark violet/red anchor, so no dark-mode
// hue-family claim is made either way (carried over, not re-argued).
export const ELIMINATED_STROKE = "#370036";
const ELIMINATED_STROKE_DARK = "#984f92";
export function eliminatedColor() {
  return isDarkTheme() ? ELIMINATED_STROKE_DARK : ELIMINATED_STROKE;
}
export const CONDITIONAL_COLOR = "#e07b1a"; // amber/orange, "possible, painfully" — same value both themes

// v8 R4: theme-split — light moves #9a9a9a -> #8A8272 (3.13:1 vs paper,
// warm family, replacing a cool gray that measured 2.32:1); dark theme
// keeps its prior value, explicitly out of scope this pass. Was a bare
// exported constant; now a function (same pattern as clearsColor()/
// eliminatedColor() above) since the value is theme-dependent. Meaning:
// "checked, but the verdict itself is unverified" — pending verdicts,
// never an unscored/gap state (this file's own gap-voice branch above) —
// two claims, two colors, not one gray standing in for both. (A "count"
// was a third claim R5's cluster-badge panel used to carry; Part 11
// retired that mechanism entirely — a knot is now real overlapping pins,
// no separate badge color at all, so there's nothing left to distinguish
// this value from on that front.)
const PENDING_LIGHT = "#8A8272";
const PENDING_DARK = "#9a9a9a";
export function pendingColor() {
  return isDarkTheme() ? PENDING_DARK : PENDING_LIGHT;
}

// v8 Part 6: the dog-import facts lens's one positive state ("rules on
// file") — deliberately outside both the ramp and the verdict-color
// family (minimum ΔE 45.8 against every ramp stop and every verdict
// color, validated), a third, distinct family for a third kind of claim
// ("rules exist," never a grade). Same value both themes; the lens's own
// "nothing on file" state reuses scoreToColor(null)'s gap voice instead of
// a fourth color, per the same file's own doctrine.
export const DOG_LENS_COLOR = "#3D5A72";

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
  if (h.startsWith("unverified")) return { kind: "pending", color: pendingColor(), label: "Unverified" };
  if (h.startsWith("misses") || h.startsWith("categorical absence"))
    return { kind: "eliminated", color: eliminatedColor(), label: "Misses" };
  return { kind: "unknown", color: pendingColor(), label: headline };
}
