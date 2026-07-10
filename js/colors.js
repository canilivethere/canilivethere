// CanILiveThere — color logic for the map, lists, and score chips.
//
// No project-level dataviz conventions existed when this was written
// (checked first, per the craft standard — see the build notes). In
// their absence, this uses a published, tested colorblind-safe
// sequential scale (ColorBrewer's 5-class "YlGnBu", verified for
// deuteranopia/protanopia/tritanopia legibility: https://colorbrewer2.org)
// rather than an improvised palette, per the craft standard. Flagged as a
// judgment call, easy to swap for a house palette later if one gets
// authored.

// 1 (poor fit) -> 5 (strong fit)
const SCALE_STOPS = ["#ffffcc", "#a1dab4", "#41b6c4", "#2c7fb8", "#253494"];

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
// across the 5 stops above.
export function scoreToColor(value) {
  if (value == null || Number.isNaN(value)) return "#e2e2e2"; // neutral gray, unscored
  const clamped = Math.max(1, Math.min(5, value));
  const pos = clamped - 1; // 0..4
  const i = Math.min(3, Math.floor(pos));
  const frac = pos - i;
  const a = hexToRgb(SCALE_STOPS[i]);
  const b = hexToRgb(SCALE_STOPS[i + 1]);
  const mixed = a.map((v, idx) => v + (b[idx] - v) * frac);
  return rgbToHex(mixed);
}

export const SCALE_LEGEND = [1, 2, 3, 4, 5].map((v) => ({ value: v, color: SCALE_STOPS[v - 1] }));

// Distinct, deliberately NOT-on-the-continuum states (per website-brief:
// "eliminated = visibly dark/hatched" — never just the darkest end of the
// same scale, which would visually read as "merely low," not "gone").
export const ELIMINATED_FILL = "url(#hatch-eliminated)";
export const ELIMINATED_STROKE = "#3a2a1a";
export const CONDITIONAL_COLOR = "#e07b1a"; // amber/orange, "possible, painfully"
export const PENDING_COLOR = "#9a9a9a"; // verification-pending gray, dashed outline in CSS

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
  if (h.startsWith("clears")) return { kind: "clear", color: "#1a7a3c", label: "Clears" };
  if (h.startsWith("near-miss")) return { kind: "nearmiss", color: CONDITIONAL_COLOR, label: "Near-miss" };
  if (h.startsWith("unverified")) return { kind: "pending", color: PENDING_COLOR, label: "Unverified" };
  if (h.startsWith("misses") || h.startsWith("categorical absence"))
    return { kind: "eliminated", color: ELIMINATED_STROKE, label: "Misses" };
  return { kind: "unknown", color: PENDING_COLOR, label: headline };
}
