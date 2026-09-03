// Part 39 — the cost-comparison panel (lists.html, #compare-costs):
// horizontal range bars over derived/cost-comparison.jsonl, one row per
// location, one category live today (rent, 2-bedroom class).
//
// Layer discipline, stated up front:
// - This module authors zero facts. Every figure, unit, confidence
//   tier, date, scope note, and local term renders verbatim from the
//   derived export (§8AP: one designated anchor or explicit gap row per
//   location, validated at generation). Selection is not done here.
// - Zero JS-computed colors, by construction (§39.7): every painted
//   element takes its color from a CSS class resolving theme tokens
//   (var(--chip-active-bg), --gap-*, --muted, --line). A theme flip
//   repaints natively with no JS from this module executing. The only
//   inline styles written here are geometry percentages (left/width),
//   which a theme toggle never changes.
// - Currency conversion for bar geometry and sort uses the shared
//   display-FX module (usdNumeric(), §39.6/§8AP.4), keyed off each
//   row's config-explicit `currency_code` — never parsed from a unit
//   string, never the verdict-side rate table. Displayed text keeps
//   the site's shipped ≈-suffix rules untouched (formatValue()).
//
// Degrade ladder (§39.6) — the base layer is an honest native-currency
// list; the chart is the enhancement:
//   1. FX loaded  -> full chart, sorted by converted USD midpoint.
//   2. FX unavailable -> rows render with native figures + badges,
//      alphabetical, no bars/axis, one plain line says why.
//   3. One unconvertible currency while FX is loaded -> that row moves
//      to the gap list; never a silently wrong bar position.
// Gap rows always render as stated gaps (§39.5) — a location never
// silently vanishes from the comparison.

import { fetchJsonl } from "./data.js";
import { siteUrl } from "./site-root.js";
import {
  escapeHtml, formatValue, confidenceBadge, sourceLine,
  usdNumeric, fxRatesLoaded, withPersona,
} from "./app-shared.js";

// Category title registry. "Rent — 2-bedroom apartment" is Part 39.2's
// own ruled panel title, verbatim. A future category must land here
// WITH its own ruled title (a data event plus one registry line) — an
// unknown category fails loud below rather than rendering a raw id as
// if it were ratified copy.
const CATEGORY_TITLE = {
  "rent-2br": "Rent — 2-bedroom apartment",
};

// ---------------------------------------------------------------------
// Copy slots C1–C5 (Part 39.9) — RATIFIED deck strings, transported
// verbatim, zero prose authored here. Each carries exactly the claims
// 39.8 fixes for its slot.
// ---------------------------------------------------------------------
// C1 — perspective/basis disclosure (law, 2026-07-17). Three fixed
// claims: (1) general figures, persona-independent (worded to read
// true in the no-lens state too); (2) USD is a display conversion,
// approximate, not the sourced figure; (3) sort basis named. Rendered
// in EVERY panel state (39.10 check 9).
const COPY_C1_LENS =
  "Rent doesn't care who's asking: these are the site's general figures, the same for every reader — no persona, passport, or saved profile changes them.";
const COPY_C1_BASIS_FX =
  "Each place's own currency figure is the sourced fact; dollar figures are approximate conversions at today's rate, shown for side-by-side reading only.";
const COPY_C1_BASIS_NOFX =
  "Each place's own currency figure is the sourced fact.";
const COPY_C1_SORT_FX =
  "Sorted cheapest first by the approximate dollar midpoint.";
// "not by price": in the FX-blocked state the order must say it
// carries no cost claim (39.4 — the sort never smuggles an unlabeled
// claim).
const COPY_C1_SORT_NOFX =
  "Shown alphabetically, not by price.";
// C2 — panel heading.
const COPY_C2_HEADING = "What does rent cost, place by place?";
// C3 — gap-list state wordings, three ruled states (§39.5/§8AP.1).
// The unconvertible-currency case (ladder step 3) reuses the
// state-(c) wording — "can't plot yet" is true for both causes, and
// the limitation is placed on the chart, not on the fact.
const COPY_C3_STATE = {
  no_fact: "No figure on file yet.",
  different_unit_class: null, // built per-row from detail_label, below
  not_machine_comparable: "A figure is on file that this chart can't plot yet — see the location page.",
};
// C4 — FX-unavailable line (ladder step 2): what's missing, why, and
// that everything real still renders.
const COPY_C4_FX_BLOCKED =
  "We couldn't fetch today's exchange rates, so no bars and no dollar conversions this time. The figures below are unaffected.";
// C5 — sourcing footnote. Note the bar-length sentence: on a range
// chart, length means low-to-high spread, not price — position on the
// axis carries the price. The scope sentence points at the per-row
// notes (segment / season / wider-than-the-place anchors, §8AP's
// mandatory disclosures) without restating them.
const COPY_C5_FOOTNOTE =
  "Every figure here is a sourced fact with its own date and confidence badge; the dollar figures are approximations at today's rate. Bar color carries no meaning, and a longer bar means a wider low-to-high range, not a costlier place. Where a figure covers one neighborhood, one season, or an area wider than the place itself, the note under its row says so. A place missing from the chart is a research gap, not a verdict.";

// Linear, zero-based axis with ticks at round USD values (§39.4): the
// smallest 1/2/5×10^k step that spans the maximum in at most six
// intervals. Returns { top, ticks } or null for no positive maximum.
function axisScale(maxUsd) {
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) return null;
  for (let k = 1; k <= 1e9; k *= 10) {
    for (const mult of [1, 2, 5]) {
      const step = mult * k;
      if (maxUsd / step <= 6) {
        const top = Math.ceil(maxUsd / step) * step;
        const ticks = [];
        for (let v = 0; v <= top; v += step) ticks.push(v);
        return { top, ticks };
      }
    }
  }
  return null;
}

function locationLink(loc, country) {
  const href = withPersona(siteUrl(`l/${loc.location_id}.html`));
  return `<a href="${href}">${escapeHtml(loc.display_name)}</a>, ${escapeHtml(country ? country.name : "")}`;
}

// The per-row detail line (§39.8): generic term leads, the fact's own
// local label in parens (feel-clever law — the generic phrase is the
// panel title's own noun, the parenthetical is the export's
// `local_term` field, data not copy); then the anchor's scope/season
// note verbatim; then the fact's date in the location pages' own
// "last checked" register; then the shared source-line affordance.
function rowDetailHtml(row) {
  const parts = [];
  if (row.local_term) {
    parts.push(`2-bedroom apartment (${escapeHtml(row.local_term)})`);
  }
  if (row.scope_note) parts.push(escapeHtml(row.scope_note));
  if (row.date) parts.push(`last checked ${escapeHtml(row.date)}`);
  const src = sourceLine(row);
  if (src) parts.push(src);
  return parts.join(" · ");
}

function gapItemHtml(store, row) {
  const loc = store.locationsById.get(row.location_id);
  const country = loc ? store.countriesById.get(loc.country_id) : null;
  if (!loc) {
    console.warn("cost-comparison: unknown location_id in gap row", row.location_id);
    return "";
  }
  let text;
  if (row.status === "different_unit_class") {
    // State (b): a figure exists at another unit size — named via the
    // export's own detail_label, linked to the location page (§39.5);
    // the wording teaches WHY it isn't plotted (39.2's own
    // false-comparison principle) instead of just asserting absence.
    text = `A ${escapeHtml(row.detail_label || "different-size")} figure is on file, but a different size isn't an honest comparison — see the location page.`;
  } else if (row.status === "no_fact") {
    text = escapeHtml(COPY_C3_STATE.no_fact);
  } else {
    // State (c) — covers both not_machine_comparable rows from the
    // export and the FX ladder's step-3 rows routed here at render.
    text = escapeHtml(COPY_C3_STATE.not_machine_comparable);
  }
  return `<li>${locationLink(loc, country)} — ${text}</li>`;
}

// The category strip exists in the DOM ONLY when two or more categories
// carry at least one plottable row (§39.2 — promise-surface
// conservatism: no tabs, no greyed stubs, no coming-soon over a single
// category). With one category the panel renders under a plain heading.
function categoryStripHtml(categories, active) {
  return `<div class="cost-category-strip">` +
    categories.map((c) =>
      `<button type="button" class="btn-chip cost-tab${c === active ? " active" : ""}" data-cost-category="${escapeHtml(c)}">${escapeHtml(CATEGORY_TITLE[c] || c)}</button>`
    ).join("") +
    `</div>`;
}

export function renderCostComparisonPanel(store, rows, container) {
  if (!container) return;
  if (!Array.isArray(rows) || rows.length === 0) {
    // No data file, or an empty one: the whole panel is simply absent —
    // no dead render, no promise of a comparison that doesn't exist.
    container.innerHTML = "";
    return;
  }

  // Categories in first-appearance order; a category qualifies for the
  // strip only with at least one plottable ("ok") row.
  const categoryOrder = [];
  for (const r of rows) {
    if (!categoryOrder.includes(r.category)) categoryOrder.push(r.category);
  }
  const qualifying = categoryOrder.filter((c) =>
    rows.some((r) => r.category === c && r.status === "ok"));
  const active = container.dataset.activeCategory && categoryOrder.includes(container.dataset.activeCategory)
    ? container.dataset.activeCategory
    : (qualifying[0] || categoryOrder[0]);
  container.dataset.activeCategory = active;
  if (!CATEGORY_TITLE[active]) {
    console.warn("cost-comparison: category has no ruled title:", active);
  }

  const catRows = rows.filter((r) => r.category === active);
  const fxOk = fxRatesLoaded();

  const plotted = []; // { row, loc, country, lowUsd, highUsd, mid }
  const gaps = [];    // export gap rows + step-3 rows, render order = export order
  for (const row of catRows) {
    if (row.status !== "ok") { gaps.push(row); continue; }
    const loc = store.locationsById.get(row.location_id);
    if (!loc) {
      console.warn("cost-comparison: unknown location_id", row.location_id);
      continue;
    }
    const country = store.countriesById.get(loc.country_id);
    let lowUsd = null, highUsd = null;
    if (fxOk) {
      lowUsd = usdNumeric(row.value_num_low, row.currency_code);
      highUsd = usdNumeric(row.value_num_high, row.currency_code);
      if (lowUsd == null || highUsd == null) {
        // Ladder step 3: rates loaded, this one currency isn't covered
        // — the row moves to the gap list, never a wrong bar.
        gaps.push({ ...row, status: "not_machine_comparable" });
        continue;
      }
    }
    plotted.push({ row, loc, country, lowUsd, highUsd,
      mid: lowUsd != null ? (lowUsd + highUsd) / 2 : null });
  }

  // Sort basis matches what the disclosure line claims (§39.4): USD
  // midpoint ascending when FX is live; alphabetical when it isn't.
  if (fxOk) {
    plotted.sort((a, b) => (a.mid - b.mid) || a.loc.display_name.localeCompare(b.loc.display_name));
  } else {
    plotted.sort((a, b) => a.loc.display_name.localeCompare(b.loc.display_name));
  }

  const scale = fxOk ? axisScale(Math.max(0, ...plotted.map((p) => p.highUsd))) : null;

  const disclosure = [
    COPY_C1_LENS,
    fxOk && scale ? COPY_C1_BASIS_FX : COPY_C1_BASIS_NOFX,
    fxOk && scale ? COPY_C1_SORT_FX : COPY_C1_SORT_NOFX,
  ].join(" ");

  let html = `<h2 id="compare-costs-heading">${escapeHtml(COPY_C2_HEADING)}</h2>`;
  html += qualifying.length >= 2
    ? categoryStripHtml(qualifying, active)
    : `<h3 class="cost-category-heading">${escapeHtml(CATEGORY_TITLE[active] || active)}</h3>`;
  html += `<p class="cost-disclosure">${escapeHtml(disclosure)}</p>`;
  if (!fxOk) {
    html += `<p class="cost-fx-note">${escapeHtml(COPY_C4_FX_BLOCKED)}</p>`;
  }

  html += `<div class="cost-chart">`;
  if (scale) {
    html += `<div class="cost-axis" aria-hidden="true">` +
      scale.ticks.map((v, i) => {
        const pct = (v / scale.top) * 100;
        const posClass = i === 0 ? " cost-tick-first" : i === scale.ticks.length - 1 ? " cost-tick-last" : "";
        return `<span class="cost-tick${posClass}" style="left:${pct}%">$${v.toLocaleString("en-US")}</span>`;
      }).join("") +
      `</div>`;
  }
  for (const p of plotted) {
    // Label line (§39.4): location + country, the native-currency
    // figure verbatim via the site's shipped formatValue() conventions
    // (incl. its existing ≈-suffix rules, untouched), the fact's own
    // confidence badge. Non-interactive badge: the detail line beneath
    // already carries date + source, so a click-to-reveal here would
    // duplicate what's in plain sight (same reasoning as the location
    // pages' Sources section).
    const detail = rowDetailHtml(p.row);
    html += `<div class="cost-row" data-fact-key="${escapeHtml(p.row.fact_key)}">
      <p class="cost-row-label">${locationLink(p.loc, p.country)} — ${escapeHtml(formatValue(p.row))} ${confidenceBadge(p.row, { interactive: false })}</p>
      ${detail ? `<p class="cost-row-detail">${detail}</p>` : ""}`;
    if (scale) {
      const leftPct = (p.lowUsd / scale.top) * 100;
      const widthPct = ((p.highUsd - p.lowUsd) / scale.top) * 100;
      const gridlines = scale.ticks.filter((v) => v > 0)
        .map((v) => `<span class="cost-gridline" style="left:${(v / scale.top) * 100}%"></span>`).join("");
      // A single-figure fact renders a point marker, not a zero-width
      // bar (§39.4) — no spread is manufactured.
      const mark = p.row.value_num_low === p.row.value_num_high
        ? `<span class="cost-bar-point" style="left:${leftPct}%"></span>`
        : `<span class="cost-bar" style="left:${leftPct}%;width:${widthPct}%"></span>`;
      html += `<div class="cost-bar-track" aria-hidden="true">${gridlines}${mark}</div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;

  if (gaps.length > 0) {
    html += `<ul class="cost-gap-list">` +
      gaps.map((g) => gapItemHtml(store, g)).join("") +
      `</ul>`;
  }
  html += `<p class="cost-footnote">${escapeHtml(COPY_C5_FOOTNOTE)}</p>`;

  container.innerHTML = html;

  container.querySelectorAll("[data-cost-category]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (container.dataset.activeCategory === btn.dataset.costCategory) return;
      container.dataset.activeCategory = btn.dataset.costCategory;
      renderCostComparisonPanel(store, rows, container);
    });
  });
}

export async function initCostComparison(store) {
  const container = document.getElementById("compare-costs");
  if (!container) return;
  const rows = await fetchJsonl(siteUrl("derived/cost-comparison.jsonl"));
  renderCostComparisonPanel(store, rows, container);
}
