// Fit-ramp anchor configuration — the ONE file that changes when the
// anchor pick lands (v12 Part 22.9: per-theme anchor-pair table, not a
// single pair; same hexes in both slots or theme-specific pairs both
// supported; each theme validates against its own real background).
//
// ANCHORS ARE DELIBERATELY NULL TODAY. The anchor pair is an open
// product/taste decision, not this tool's to make — the mechanism builds
// and self-tests against placeholder anchors only (tools/generate-ramp.mjs
// --self-test), and the live map keeps its interim hand-set stops until a
// real pick lands here and the generated, validated output is committed.
//
// To generate once a pick exists:
//   1. Fill in a theme's entry: { anchorBad, anchorGood, hueArc }
//      (hueArc: "shorter" | "longer" — CSS Color 4 hue-interpolation
//      vocabulary; for red-family -> green-family pairs on the light
//      theme, see the self-test's own findings before assuming either
//      arc is viable).
//   2. Run: node tools/generate-ramp.mjs --theme <light|dark>
//      It either prints a validated constants block for js/colors.js
//      (plus the full per-check report), or refuses with the failing
//      stop and check named — a refusing pick costs a printed table,
//      never a shipped mistake.
//   3. Commit the emitted block; node tools/generate-ramp.mjs --check
//      re-derives and diffs it forever after (drift guard).

export const RAMP_CONFIG = {
  light: null, // e.g. { anchorBad: "#7a2213", anchorGood: "#006726", hueArc: "longer" }
  dark: null,
};

// The themes' real page backgrounds (--paper in css/style.css, both
// :root blocks — the actual tokens, not an assumed value; v12 Part 22.1
// records that an earlier candidate was measured against a background
// this site does not use).
export const THEME_BACKGROUND = {
  light: "#F2E8D5",
  dark: "#1e1a14",
};

// Fixed meaning-colors each theme's ramp must stay distinct from
// (check 5). Values duplicated from js/colors.js on purpose — that file
// documents the same intentional-duplication pattern for values that
// must work outside a stylesheet. generate-ramp.mjs --check verifies
// every hex below still appears in js/colors.js source, so this table
// cannot silently drift from the real one.
export const MEANING_COLORS = {
  light: [
    { name: "conditional-amber", hex: "#e07b1a" },
    { name: "eliminated-aubergine", hex: "#370036" },
    { name: "clears-green", hex: "#1a7a3c" },
    { name: "pending-gray", hex: "#8A8272" },
    { name: "dog-lens-blue", hex: "#3D5A72" },
    { name: "gap", hex: "#E4D8BC" },
  ],
  dark: [
    { name: "conditional-amber", hex: "#e07b1a" },
    { name: "eliminated-aubergine", hex: "#984f92" },
    { name: "clears-green", hex: "#1d6b3f" },
    { name: "pending-gray", hex: "#9a9a9a" },
    { name: "dog-lens-blue", hex: "#3D5A72" },
    { name: "gap", hex: "#2c2c28" },
  ],
};
