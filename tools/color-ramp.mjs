// Fit-ramp mechanism — pure color math + ramp generation/validation.
// Build contract: v12 Part 22 (interpolation space 22.3, mud region 22.4,
// the five checks 22.5, anchor validity 22.6, per-theme config 22.9).
//
// DEV-TIME ONLY. This module is imported by tools/generate-ramp.mjs and
// never by any page module in js/ — generation runs when anchors change,
// its validator can REFUSE, and its output is committed. A validator that
// fails in a visitor's browser has no honest recourse (blank the map, or
// ship the failing stop anyway; both forbidden) — so it must never run
// per-pageload. That structural rule is why this file lives in tools/,
// not js/ (js/ is what pages import; placement is this builder's call,
// the contract is not).
//
// Two color spaces, one job each (v12 Part 22.3):
//   - GENERATION runs in OKLab's polar form (OKLCH): L and C linear,
//     hue along a configured arc (CSS Color 4 "shorter"/"longer").
//   - MEASUREMENT runs in CIE Lab with CIE76 ΔE — the standing math of
//     every prior verification pass, so thresholds stay comparable with
//     everything already recorded. WCAG contrast uses WCAG's own math.
//
// CVD simulation: Viénot, Brettel & Mollon (1999) matrix method, for
// protanopia and deuteranopia. Constants sourced from a published
// reference implementation (libDaltonLens, precomputed linear-RGB
// matrices, 5-decimal precision) — NOT recalled from memory — plus an
// independent from-the-paper re-derivation (deriveVienotFromPaper below)
// that the self-test cross-checks against the precomputed values. See
// each constant's own source note.

// ---------------------------------------------------------------------------
// sRGB <-> linear
// ---------------------------------------------------------------------------

export function hexToRgb01(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgb01ToHex(rgb) {
  return (
    "#" +
    rgb
      .map((v) => {
        const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
        return c.toString(16).padStart(2, "0");
      })
      .join("")
  );
}

// IEC 61966-2-1 sRGB transfer function (the piecewise curve, not a flat
// 2.2 gamma — the reference implementation this file's CVD matrices come
// from uses the same, and mixing transfer curves would silently shift
// every simulated ΔE).
export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function hexToLinearRgb(hex) {
  return hexToRgb01(hex).map(srgbToLinear);
}
export function linearRgbToHex(rgb) {
  return rgb01ToHex(rgb.map(linearToSrgb));
}

// ---------------------------------------------------------------------------
// OKLab / OKLCH (Ottosson 2020 — the standard published matrices; the
// self-test must reproduce v12 Part 22.3's test vectors, which is the net
// under these constants)
// ---------------------------------------------------------------------------

export function linearRgbToOklab([r, g, b]) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

export function oklabToLinearRgb([L, a, b]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function hexToOklch(hex) {
  const [L, a, b] = linearRgbToOklab(hexToLinearRgb(hex));
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

export function oklchToLinearRgb({ L, C, h }) {
  const hr = (h * Math.PI) / 180;
  return oklabToLinearRgb([L, C * Math.cos(hr), C * Math.sin(hr)]);
}

function inGamut(rgb, eps = 1e-6) {
  return rgb.every((v) => v >= -eps && v <= 1 + eps);
}

// Gamut mapping: reduce chroma (keep L and h — the two coordinates the
// mud check and the meaning labels care about) until the color fits in
// sRGB, by binary search. Matches CSS Color 4's chroma-reduction spirit
// without importing anything.
export function oklchToHexGamutMapped(oklch) {
  let rgb = oklchToLinearRgb(oklch);
  if (inGamut(rgb)) return { hex: linearRgbToHex(rgb), gamutMapped: false, C: oklch.C };
  let lo = 0;
  let hi = oklch.C;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    rgb = oklchToLinearRgb({ ...oklch, C: mid });
    if (inGamut(rgb)) lo = mid;
    else hi = mid;
  }
  rgb = oklchToLinearRgb({ ...oklch, C: lo }).map((v) => Math.max(0, Math.min(1, v)));
  return { hex: linearRgbToHex(rgb), gamutMapped: true, C: lo };
}

// ---------------------------------------------------------------------------
// CIE Lab (D65, 2°) + CIE76 ΔE — the measurement space (v12 Part 22.3)
// ---------------------------------------------------------------------------

export function hexToLab(hex) {
  const [r, g, b] = hexToLinearRgb(hex);
  const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  const f = (t) => (t > 0.008856451679 ? Math.cbrt(t) : (903.2962962 * t + 16) / 116);
  const fx = f(X / 0.95047);
  const fy = f(Y / 1.0);
  const fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE76(hexA, hexB) {
  const a = hexToLab(hexA);
  const b = hexToLab(hexB);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// ---------------------------------------------------------------------------
// WCAG contrast
// ---------------------------------------------------------------------------

export function relativeLuminance(hex) {
  // WCAG 2.x's own published linearization (0.03928 threshold — WCAG's
  // text, kept verbatim so the number is WCAG's number, even though the
  // 0.04045 sRGB constant is numerically indistinguishable here).
  const lin = hexToRgb01(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// Viénot / Brettel / Mollon (1999) CVD simulation
// ---------------------------------------------------------------------------

// Precomputed full-pipeline matrices (linear RGB -> linear RGB), sourced
// from libDaltonLens (github.com/DaltonLens/libDaltonLens, libDaltonLens.c,
// Unlicense/public domain) — a published reference implementation of the
// Viénot 1999 method, given to 5 decimals. These are the canonical
// constants this validator uses.
export const VIENOT_PROTAN = [
  [0.11238, 0.88762, 0.0],
  [0.11238, 0.88762, -0.0],
  [0.00401, -0.00401, 1.0],
];
export const VIENOT_DEUTAN = [
  [0.29275, 0.70725, 0.0],
  [0.29275, 0.70725, -0.0],
  [-0.02234, 0.02234, 1.0],
];

// Independent re-derivation from the paper's own construction, used by
// the self-test as a cross-check on the precomputed constants above.
// Method (Viénot 1999): convert linear RGB to LMS (Smith–Pokorny
// fundamentals via Judd-Vos XYZ — the paper's published RGB->LMS matrix,
// below), replace the missing cone's response with a linear combination
// of the two remaining ones, chosen so that WHITE and BLUE are invariant
// (the paper's stated anchor colors), then convert back. The projection
// coefficients are SOLVED here from those two invariance constraints —
// derived, not pasted — so agreement with the precomputed matrices is a
// genuine two-path check.
const LMS_FROM_LINEAR_RGB = [
  [17.88240413, 43.51609057, 4.11934969],
  [3.45564232, 27.15538246, 3.86713084],
  [0.02995656, 0.18430896, 1.46708614],
];

function matMulVec(M, v) {
  return M.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
}
function matMul(A, B) {
  return A.map((row, i) =>
    [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j])
  );
}
function matInv(M) {
  const [[a, b, c], [d, e, f], [g, h, i]] = M;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [
    [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}

export function deriveVienotFromPaper() {
  const white = matMulVec(LMS_FROM_LINEAR_RGB, [1, 1, 1]);
  const blue = matMulVec(LMS_FROM_LINEAR_RGB, [0, 0, 1]);
  const rgbFromLms = matInv(LMS_FROM_LINEAR_RGB);

  // Protanopia: L' = a*M + b*S, with L' = L exactly for white and blue.
  // Two constraints, two unknowns — a plain 2x2 solve.
  const solve2 = (m1, s1, t1, m2, s2, t2) => {
    const det = m1 * s2 - s1 * m2;
    return [(t1 * s2 - s1 * t2) / det, (m1 * t2 - t1 * m2) / det];
  };
  const [pa, pb] = solve2(white[1], white[2], white[0], blue[1], blue[2], blue[0]);
  const protanLms = [
    [0, pa, pb],
    [0, 1, 0],
    [0, 0, 1],
  ];
  // Deuteranopia: M' = a*L + b*S, same two anchors.
  const [da, db] = solve2(white[0], white[2], white[1], blue[0], blue[2], blue[1]);
  const deutanLms = [
    [1, 0, 0],
    [da, 0, db],
    [0, 0, 1],
  ];
  return {
    protan: matMul(rgbFromLms, matMul(protanLms, LMS_FROM_LINEAR_RGB)),
    deutan: matMul(rgbFromLms, matMul(deutanLms, LMS_FROM_LINEAR_RGB)),
  };
}

// hex -> hex under a simulated dichromacy ("protan" | "deutan").
export function simulateCvd(hex, kind) {
  const M = kind === "protan" ? VIENOT_PROTAN : VIENOT_DEUTAN;
  const out = matMulVec(M, hexToLinearRgb(hex)).map((v) => Math.max(0, Math.min(1, v)));
  return linearRgbToHex(out);
}

// ---------------------------------------------------------------------------
// Interpolation (CSS Color 4 hue-arc vocabulary: "shorter" | "longer")
// ---------------------------------------------------------------------------

export function interpolateOklch(fromOklch, toOklch, t, hueArc) {
  let h1 = fromOklch.h;
  let h2 = toOklch.h;
  const delta = h2 - h1;
  if (hueArc === "longer") {
    // CSS Color 4: force the long way around.
    if (delta > 0 && delta < 180) h1 += 360;
    else if (delta > -180 && delta <= 0) h2 += 360;
  } else {
    // "shorter" (default): take the near arc.
    if (delta > 180) h2 -= 360;
    else if (delta < -180) h2 += 360;
  }
  return {
    L: fromOklch.L + (toOklch.L - fromOklch.L) * t,
    C: fromOklch.C + (toOklch.C - fromOklch.C) * t,
    h: ((h1 + (h2 - h1) * t) % 360 + 360) % 360,
  };
}

// ---------------------------------------------------------------------------
// The mud region (v12 Part 22.4 — calibrated on the identified-stain +
// accepted-vivid evidence set; constants are the spec's, not this file's)
// ---------------------------------------------------------------------------

export const MUD_HUE_MIN = 50;
export const MUD_HUE_MAX = 130;
export const MUD_CHROMA_MAX = 0.14;

export function isMud(oklch) {
  return oklch.h >= MUD_HUE_MIN && oklch.h <= MUD_HUE_MAX && oklch.C < MUD_CHROMA_MAX;
}

// ---------------------------------------------------------------------------
// buildRamp — generation + the five checks, in ruled order (v12 Part 22.5:
// "order is meaning"; endpoint separation runs FIRST because it was ranked
// first, ahead of everything else)
// ---------------------------------------------------------------------------

export const ENDPOINT_MIN_DELTA_E = 46; // grounded on the smallest already-accepted family separation (45.8), rounded up
export const CONTRAST_MIN = 4.0;
export const NEIGHBOR_MIN_DELTA_E = 15;
export const MEANING_REFUSE_BELOW = 15;
export const MEANING_WARN_BELOW = 46;

const VISION = ["normal", "deutan", "protan"];
function underVision(hex, vision) {
  return vision === "normal" ? hex : simulateCvd(hex, vision);
}
function deltaEUnder(hexA, hexB, vision) {
  return deltaE76(underVision(hexA, vision), underVision(hexB, vision));
}

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

// meaningColors: [{ name, hex }] — the theme's fixed meaning-colors the
// ramp must stay distinct from (includes the gap color: a scored place
// must never look unresearched).
export function buildRamp({ anchorBad, anchorGood, background, stops = 5, hueArc = "shorter", meaningColors = [] }) {
  const fromOk = hexToOklch(anchorBad);
  const toOk = hexToOklch(anchorGood);

  const stopList = [];
  for (let i = 0; i < stops; i++) {
    const t = stops === 1 ? 0 : i / (stops - 1);
    const target = interpolateOklch(fromOk, toOk, t, hueArc);
    const mapped = oklchToHexGamutMapped(target);
    stopList.push({
      index: i + 1,
      hex: mapped.hex,
      oklch: hexToOklch(mapped.hex), // measured on the emitted hex, not the pre-quantization ideal
      gamutMapped: mapped.gamutMapped,
    });
  }
  const hexes = stopList.map((s) => s.hex);

  const checks = [];
  const warnings = [];

  // Check 1 — endpoint separation, FIRST (ruled order).
  {
    const rows = VISION.map((vision) => {
      const d = deltaEUnder(hexes[0], hexes[hexes.length - 1], vision);
      return { vision, deltaE: r1(d), pass: d >= ENDPOINT_MIN_DELTA_E };
    });
    checks.push({
      id: "endpoint-separation",
      name: `Endpoint separation ΔE ≥ ${ENDPOINT_MIN_DELTA_E} (normal + deutan + protan)`,
      pass: rows.every((r) => r.pass),
      rows,
    });
  }

  // Check 2 — WCAG contrast against the theme's real background.
  {
    const rows = stopList.map((s) => {
      const c = contrastRatio(s.hex, background);
      return { stop: s.index, hex: s.hex, contrast: r2(c), pass: c >= CONTRAST_MIN };
    });
    checks.push({
      id: "contrast",
      name: `WCAG contrast ≥ ${CONTRAST_MIN}:1 vs ${background}`,
      pass: rows.every((r) => r.pass),
      rows,
    });
  }

  // Check 3 — neighbor separation under all three vision conditions.
  {
    const rows = [];
    for (let i = 0; i < hexes.length - 1; i++) {
      for (const vision of VISION) {
        const d = deltaEUnder(hexes[i], hexes[i + 1], vision);
        rows.push({ pair: `${i + 1}-${i + 2}`, vision, deltaE: r1(d), pass: d >= NEIGHBOR_MIN_DELTA_E });
      }
    }
    checks.push({
      id: "neighbor-separation",
      name: `Neighbor ΔE ≥ ${NEIGHBOR_MIN_DELTA_E} (normal + deutan + protan)`,
      pass: rows.every((r) => r.pass),
      rows,
    });
  }

  // Check 4 — no mud (hue in [50°,130°] with C < 0.14).
  {
    const rows = stopList.map((s) => ({
      stop: s.index,
      hex: s.hex,
      L: r3(s.oklch.L),
      C: r3(s.oklch.C),
      h: r1(s.oklch.h),
      pass: !isMud(s.oklch),
    }));
    checks.push({
      id: "no-mud",
      name: `No stop in the mud region (h ∈ [${MUD_HUE_MIN}°,${MUD_HUE_MAX}°] ∧ C < ${MUD_CHROMA_MAX})`,
      pass: rows.every((r) => r.pass),
      rows,
    });
  }

  // Check 5 — distinctness from the theme's fixed meaning-colors.
  // Per pair, judged on the MINIMUM ΔE across vision conditions:
  // < 15 refuse; 15–46 pass with printed warning; ≥ 46 clean.
  {
    const rows = [];
    for (const s of stopList) {
      for (const mc of meaningColors) {
        const perVision = VISION.map((vision) => ({ vision, deltaE: deltaEUnder(s.hex, mc.hex, vision) }));
        const worst = perVision.reduce((a, b) => (a.deltaE <= b.deltaE ? a : b));
        const band = worst.deltaE < MEANING_REFUSE_BELOW ? "refuse" : worst.deltaE < MEANING_WARN_BELOW ? "warn" : "clean";
        if (band === "warn") {
          warnings.push(
            `stop ${s.index} (${s.hex}) vs ${mc.name} (${mc.hex}): min ΔE ${r1(worst.deltaE)} under ${worst.vision} — legal but below the ≥46 precedent every previously accepted separation cleared; the felt read should see this pair.`
          );
        }
        rows.push({
          stop: s.index,
          hex: s.hex,
          vs: mc.name,
          vsHex: mc.hex,
          minDeltaE: r1(worst.deltaE),
          worstVision: worst.vision,
          band,
          pass: band !== "refuse",
        });
      }
    }
    checks.push({
      id: "meaning-distinctness",
      name: `Distinct from fixed meaning-colors (min ΔE across visions: <${MEANING_REFUSE_BELOW} refuse, ${MEANING_REFUSE_BELOW}–${MEANING_WARN_BELOW} warn, ≥${MEANING_WARN_BELOW} clean)`,
      pass: rows.every((r) => r.pass),
      rows,
    });
  }

  const ok = checks.every((c) => c.pass);
  return {
    ok,
    stops: ok ? hexes : null, // refusal semantics: nothing usable on failure
    report: {
      config: { anchorBad, anchorGood, background, stops, hueArc },
      anchors: { bad: { hex: anchorBad, oklch: fromOk }, good: { hex: anchorGood, oklch: toOk } },
      stopDetails: stopList,
      checks,
      warnings,
    },
  };
}
