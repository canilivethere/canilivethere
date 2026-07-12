import { loadStore, verdictHeadline } from "./data.js";
import { scoreToColor, verdictVisual } from "./colors.js";
import {
  applyStoredTheme, renderTopBar, renderPersonaSlot,
  renderFooter, getPersona, withPersona, escapeHtml,
  FIT_INDEX_DEFINITION, WEIGHT_CLASS_LABEL,
  verdictBand, BAND_ORDER, BAND_LABEL,
} from "./app-shared.js";

applyStoredTheme();
renderTopBar("lists");
renderPersonaSlot(document.getElementById("persona-slot"), getPersona());
main();

let STATE = { sortKey: "fit", sortDir: "desc", country: "", purposeCriterion: null };

// Purpose lists (v2 addendum §3): "Pick what matters most", built
// entirely over already-shipped data (criteria.jsonl + scores.jsonl) —
// no new research, no new facts. The three featured views use a
// specific requested order, not an arbitrary one: easiest visa, money
// goes furthest, best property access. The blended Fit index stays the
// default/first option, not replaced.
const FEATURED_CRITERIA = [
  { criterion_id: "visa-legal-pathway-ease", label: "Easiest visa" },
  { criterion_id: "cost-of-living-affordability", label: "Money goes furthest" },
  { criterion_id: "land-property-access", label: "Best property access" },
];

// Persona verdict-first banding (v4 addendum R1 §1.2): VERDICT_BAND/
// verdictBand/BAND_ORDER/BAND_LABEL moved to app-shared.js by v6
// addendum §2.3 so map.js's legend reuses the exact same registry
// instead of forking its own labels — imported above, not redefined
// here.

async function main() {
  const store = await loadStore();
  renderFooter(store);
  const persona = getPersona();

  const countrySelect = document.getElementById("country-filter");
  countrySelect.innerHTML =
    `<option value="">All countries</option>` +
    store.countries
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `<option value="${c.country_id}">${escapeHtml(c.name)}</option>`)
      .join("");
  countrySelect.addEventListener("change", () => {
    STATE.country = countrySelect.value;
    render(store, persona);
  });

  // The persona-context line moved into render() itself (below) — §1.5's
  // coverage counts must respect the active country filter, so it's
  // recomputed on every render() call, not set once here.
  document.getElementById("fit-def-caption").textContent = FIT_INDEX_DEFINITION;

  renderPurposeSelector(store, persona);
  render(store, persona);
}

function renderPurposeSelector(store, persona) {
  const el = document.getElementById("purpose-lists");
  const featuredIds = new Set(FEATURED_CRITERIA.map((f) => f.criterion_id));
  // "All thirteen, always reachable" (§3.3): the remaining ten criteria,
  // sorted by the schema's own display_order, not re-ordered here.
  const moreCriteria = store.criteria.filter((c) => !featuredIds.has(c.criterion_id));

  const chipHtml = (id, label, active) =>
    `<button type="button" class="btn-chip purpose-chip${active ? " active" : ""}" data-purpose="${id || ""}">${escapeHtml(label)}</button>`;

  el.innerHTML =
    chipHtml("", "Blended Fit index", !STATE.purposeCriterion) +
    FEATURED_CRITERIA.map((f) => chipHtml(f.criterion_id, f.label, STATE.purposeCriterion === f.criterion_id)).join("") +
    `<select class="purpose-more" id="purpose-more">
      <option value="">More…</option>
      ${moreCriteria.map((c) => `<option value="${c.criterion_id}"${STATE.purposeCriterion === c.criterion_id ? " selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
    </select>`;

  // No-op guard: clicking the already-active chip (or re-selecting the
  // same "More…" option) shouldn't discard and rebuild this whole subtree
  // and re-render the table for a selection that hasn't actually changed.
  const setPurpose = (value) => {
    if (STATE.purposeCriterion === value) return;
    STATE.purposeCriterion = value;
    renderPurposeSelector(store, persona);
    render(store, persona);
  };
  el.querySelectorAll(".purpose-chip").forEach((btn) => {
    btn.addEventListener("click", () => setPurpose(btn.dataset.purpose || null));
  });
  el.querySelector("#purpose-more").addEventListener("change", (e) => setPurpose(e.target.value || null));

  updatePurposeExplainer(store);
}

// One-line explanation per view, template not hand-written per criterion
// (§3.5): the bracketed clause is picked mechanically off criteria.jsonl's
// own `kind` field, the same "gloss the field, don't invent content" move
// as the confidence/weight_class glosses elsewhere on this site. v4
// addendum R1 §1.1 extends this with a second, shared "doesn't-check"
// clause — the actual gap behind "what is the point of them" — and swaps
// the old hardcoded "13 scored criteria" literal for store.criteria.length
// (computed, so a 14th criterion never needs a second manual edit).
function updatePurposeExplainer(store) {
  const el = document.getElementById("purpose-explainer");
  const persona = getPersona();
  // "groups below" (not the spec's original "band below"): aligned to the
  // vocabulary the page actually renders — the group headers read
  // Clears/Near-miss/Doesn't clear/Not checked yet and the coverage
  // sentence above already calls them groups; "band" had no visible
  // referent on the page (review finding). Minimal referent-word change
  // only, meaning intact — flagged for the spec author's ratification.
  const doesntClause = persona
    ? "it doesn't decide the groups below — that's a separate, persona-specific read, unaffected by this sort"
    : "it doesn't check your own visa, budget, or eligibility — pick a persona above for that";
  if (!STATE.purposeCriterion) {
    el.textContent = `Sorted by the blended Fit index — a weighted average across all ${store.criteria.length} scored criteria, for every researched location. Ranks the place, not you: ${doesntClause}.`;
    return;
  }
  const crit = store.criteriaById.get(STATE.purposeCriterion);
  if (!crit) return;
  const clause = crit.kind === "threshold-shaped"
    ? "how comfortably a place clears this, not just a number"
    : "how strong this factor is here";
  el.textContent = `Sorted by ${crit.name} — ${clause}, for every researched location. Ranks the place, not you: ${doesntClause}.`;
}

// The "fit" column header's own label, owned by render()'s th[data-sort]
// loop below rather than by updatePurposeExplainer() reaching into markup
// it doesn't own.
function fitColumnLabel(store) {
  if (!STATE.purposeCriterion) return "Fit index";
  const crit = store.criteriaById.get(STATE.purposeCriterion);
  return crit ? crit.name : "Fit index";
}

// v4 addendum R1 §1.5, coverage honesty: which of the three shapes this
// persona's fixture data actually has — mechanically detected from the
// data itself (not a hardcoded persona-name check), so a future fourth
// persona falls into the right branch automatically. "verdict" (Wenda/
// Carmen today) takes priority over "criterion" when a persona somehow has
// both, since the verdict-grouped banding is the richer read.
function personaCoverageKind(store, persona) {
  const perPersona = store.fixturesByPersona.get(persona);
  if (!perPersona) return "neither";
  let hasVerdict = false, hasCriteria = false;
  for (const entry of perPersona.values()) {
    if (entry.verdict) hasVerdict = true;
    if (entry.criteria.size > 0) hasCriteria = true;
  }
  if (hasVerdict) return "verdict";
  if (hasCriteria) return "criterion";
  return "neither";
}

// Computed, never hardcoded, from the same filtered `rows` array render()
// already builds — so a country filter narrows the claim correctly.
function personaCoverage(rows) {
  const checked = rows.filter((r) => r.verdict).length;
  return { checked, total: rows.length };
}

// Persona-locked claim line (§1.5) — three cases, mechanically detected,
// not assumed from a hardcoded persona name. Numbers are computed per
// personaCoverage() above; any figures in the addendum's own illustration
// strings were examples, not literals to hardcode. One deliberate wording
// deviation, flagged rather than silent: the addendum's illustrative
// criterion-only sentence used "His" (Waldo, today's only occupant of this
// branch) — no gender field exists anywhere in profiles.jsonl, and every
// other persona-facing string on this site is already gender-neutral, so
// this build repeats the display name instead of guessing a pronoun for
// whichever persona lands in this branch next.
function personaCoverageLine(store, persona, rows) {
  const displayName = persona.charAt(0).toUpperCase() + persona.slice(1);
  const kind = personaCoverageKind(store, persona);
  if (kind === "verdict") {
    const { checked, total } = personaCoverage(rows);
    return `${displayName}'s own verdict is checked for ${checked} of ${total} researched places — grouped below as Clears, Near-miss, Doesn't clear, and Not checked yet, ranked inside each group by whatever you've picked above. Each row shows its own reasoning directly, not just a colored chip.`;
  }
  if (kind === "criterion") {
    const checked = rows.filter((r) => r.personaAdjusted === true).length;
    const total = rows.length;
    return `${displayName}'s own criterion scores are refined for ${checked} of ${total} researched places — used in the ranking above. ${displayName}'s specific visa/residency verdict isn't checked yet anywhere, so every place below sits in Not checked yet until that lands.`;
  }
  return `No persona-specific read exists yet for ${displayName} — every place below uses the general figures.`;
}

function buildRows(store, persona) {
  return store.locations
    .filter((loc) => !STATE.country || loc.country_id === STATE.country)
    .map((loc) => {
      const country = store.countriesById.get(loc.country_id);
      const general = store.generalIndex(loc.location_id);
      let fitValue = general ? general.value : null;
      let verdict = null;
      // null = no persona selected (the question doesn't apply); true = a
      // real persona-adjusted figure; false = a persona is selected but this
      // row has no rescore, so the general figure is shown as a fallback —
      // the page's own promise ("labeled per row") that this flag exists to
      // honor in the render below.
      let personaAdjusted = null;
      if (persona) {
        const perLoc = store.fixturesByPersona.get(persona)?.get(loc.location_id);
        if (perLoc && perLoc.criteria.size > 0) {
          const idx = store.personaIndex(persona, loc.location_id);
          fitValue = idx ? idx.value : null;
          personaAdjusted = true;
        } else {
          personaAdjusted = false;
        }
        verdict = perLoc?.verdict || null;
      }
      // Purpose-list score (§3): a straight read of scores.jsonl for the
      // one criterion currently selected, independent of persona — the
      // view changes what the table is sorted/shown by, not which rows
      // exist or how the blended Fit index itself is computed.
      let purposeScore = null;
      if (STATE.purposeCriterion) {
        const row = store.scoresByLocation.get(loc.location_id)?.get(STATE.purposeCriterion);
        purposeScore = row && row.status === "scored" && row.score != null ? row.score : null;
      }
      return { loc, country, general, fitValue, verdict, personaAdjusted, purposeScore };
    });
}

// The comparator already driving the flat table — factored out so §1.3's
// per-band sort ("ranked inside each group by whatever purpose is
// selected") reuses the exact same logic instead of re-implementing it.
function compareRows(a, b) {
  let av, bv;
  if (STATE.sortKey === "name") { av = a.loc.display_name; bv = b.loc.display_name; }
  else if (STATE.sortKey === "country") { av = a.country.name; bv = b.country.name; }
  // Purpose-list sort (§3.4): the "fit" column's sort key is a straight
  // sort of the selected criterion's own score, descending, replacing
  // the blended Fit index as the sort key while a purpose is active —
  // no locations are filtered out, only the sort/display value changes.
  else if (STATE.purposeCriterion) { av = a.purposeScore ?? -1; bv = b.purposeScore ?? -1; }
  else { av = a.fitValue ?? -1; bv = b.fitValue ?? -1; }
  if (av < bv) return STATE.sortDir === "asc" ? -1 : 1;
  if (av > bv) return STATE.sortDir === "asc" ? 1 : -1;
  return 0;
}

function render(store, persona) {
  const rows = buildRows(store, persona);

  // §1.5 coverage line, recomputed every render (not just once in main())
  // so a country filter narrows the claim correctly.
  document.getElementById("persona-context").textContent = persona
    ? personaCoverageLine(store, persona, rows)
    : "Unpersonalized general ranking — the same 13-criterion weighted index shown on the map.";

  const tbody = document.getElementById("rank-tbody");
  tbody.innerHTML = "";

  if (persona) {
    renderBanded(store, persona, rows, tbody);
  } else {
    rows.sort(compareRows);
    for (const row of rows) renderRow(store, row, persona, tbody);
  }

  document.querySelectorAll("th[data-sort]").forEach((th) => {
    const key = th.dataset.sort;
    th.removeAttribute("aria-sort");
    if (STATE.sortKey === key) th.setAttribute("aria-sort", STATE.sortDir === "asc" ? "ascending" : "descending");
    if (key === "fit") th.textContent = fitColumnLabel(store);
  });
}

// v4 addendum R1 §1.3: persona verdict-first banding. Groups the same
// buildRows() output (post country-filter) by verdictBand() off each row's
// own headline — a row with no verdict fixture at all (Waldo's shape, or
// any currently-unfixtured location) routes to "not-checked" directly,
// absence detected rather than assumed (§1.3's own named edge case).
function renderBanded(store, persona, rows, tbody) {
  const kind = personaCoverageKind(store, persona);
  const groups = new Map(BAND_ORDER.map((b) => [b, []]));
  for (const row of rows) {
    const headline = row.verdict ? verdictHeadline(row.verdict.expected) : null;
    const band = headline ? verdictBand(headline) : "not-checked";
    groups.get(band).push(row);
  }

  // Amendment 1, §A1.1: empty bands render at (0) ONLY for personas in the
  // "has verdict fixtures" coverage branch — an empty Clears band header
  // is itself the answer ("checked, none clear"). Criterion-only/neither
  // personas keep the original non-empty-only rule (asserting a verdict
  // check that never ran would be the opposite lie). `unclassified` stays
  // non-empty-only in every branch — it's a build-time registry-gap
  // signal, never a normal user-facing state.
  const alwaysShowCount = kind === "verdict";

  for (const band of BAND_ORDER) {
    const groupRows = groups.get(band);
    const isUnclassified = band === "unclassified";
    const shouldRender = groupRows.length > 0 || (alwaysShowCount && !isUnclassified);
    if (!shouldRender) continue;

    groupRows.sort(compareRows);

    const headerTr = document.createElement("tr");
    headerTr.className = "band-header-row";
    const headerTd = document.createElement("td");
    headerTd.colSpan = 5;
    headerTd.innerHTML = `<strong>${escapeHtml(BAND_LABEL[band])} (${groupRows.length})</strong>`;
    headerTr.appendChild(headerTd);
    tbody.appendChild(headerTr);

    for (const row of groupRows) renderRow(store, row, persona, tbody);
  }
}

// One row (+ its expand-row sibling) — factored out of render() so both
// the flat (no persona) and banded (persona locked) paths share it.
function renderRow(store, row, persona, tbody) {
  const tr = document.createElement("tr");
  const fallbackTag = row.personaAdjusted === false && !STATE.purposeCriterion
    ? ` <span class="scope-tag">(no rescore for this persona yet — general figure shown)</span>`
    : "";
  // While a purpose view is active, the column shows that criterion's own
  // score directly — the whole point of §3 is answering "just the visa
  // question" (etc.) without opening the breakdown row to find the number.
  const displayValue = STATE.purposeCriterion ? row.purposeScore : row.fitValue;
  const fitCellHtml = displayValue != null
    ? `<span class="fit-swatch" style="background:${scoreToColor(displayValue)}"></span> ${displayValue.toFixed(1)}/5${fallbackTag}`
    : `<span class="fit-swatch" style="background:${scoreToColor(displayValue)}"></span> not scored`;

  let verdictHtml = "";
  if (row.verdict) {
    const headline = verdictHeadline(row.verdict.expected);
    const v = verdictVisual(headline);
    // Sell-the-no framing (§1.4): the verdict's full prose, always visible
    // under the chip, not gated behind the breakdown toggle. Zero new text
    // authored — the exact string verdictHeadline() already splits out,
    // shown in full instead of truncated.
    verdictHtml = `<span class="verdict-chip" style="background:${v.color}">${escapeHtml(v.label)}</span>
      <div class="verdict-prose">${escapeHtml(row.verdict.expected)}</div>`;
  }

  // Visit-layer affordance (§1.6): the honest interim pointer to the one
  // real place tourist facts already live (the flat visa section) — only
  // when a persona is locked, uniform across every band (not only
  // negative ones).
  // v7 no-JS fallback: link to the prerendered l/<id>.html page, not
  // location.html?loc=<id> — real static content exists there for
  // crawlers/no-JS visitors (tools/prerender-locations.mjs).
  const visitLink = persona
    ? `<a class="visit-link" href="${withPersona(`/l/${row.loc.location_id}.html`)}#sec-visa">Just visiting instead?</a>`
    : "";

  tr.innerHTML = `
    <td><a href="${withPersona(`/l/${row.loc.location_id}.html`)}">${escapeHtml(row.loc.display_name)}</a></td>
    <td>${escapeHtml(row.country.name)}</td>
    <td class="rank-fit-cell">${fitCellHtml}</td>
    <td>${verdictHtml}${visitLink}</td>
    <td><button class="expand-toggle" aria-expanded="false">breakdown</button></td>
  `;
  tbody.appendChild(tr);

  const expandTr = document.createElement("tr");
  expandTr.className = "expand-row";
  expandTr.style.display = "none";
  const td = document.createElement("td");
  td.colSpan = 5;
  td.appendChild(buildBreakdown(store, row, persona));
  expandTr.appendChild(td);
  tbody.appendChild(expandTr);

  tr.querySelector(".expand-toggle").addEventListener("click", (e) => {
    const open = expandTr.style.display !== "none";
    expandTr.style.display = open ? "none" : "table-row";
    e.target.setAttribute("aria-expanded", String(!open));
    e.target.textContent = open ? "breakdown" : "hide";
  });
}

function buildBreakdown(store, row, persona) {
  const wrap = document.createElement("div");
  wrap.className = "breakdown-grid";
  const scoreRows = store.scoresByLocation.get(row.loc.location_id);
  const personaFixtures = persona ? store.fixturesByPersona.get(persona)?.get(row.loc.location_id)?.criteria : null;
  // Capitalized once, reused everywhere this function needs to name the
  // persona in prose — the same display-name convention every other call
  // site in this file already applies (personaCoverageLine, the verdict
  // item below), rather than rendering the raw lowercase URL-param slug.
  const displayName = persona ? persona.charAt(0).toUpperCase() + persona.slice(1) : "";

  for (const crit of store.criteria) {
    const item = document.createElement("div");
    item.className = "breakdown-item";
    const scoreRow = scoreRows ? scoreRows.get(crit.criterion_id) : null;
    const fixtureRow = personaFixtures ? personaFixtures.get(crit.criterion_id) : null;

    let valueText, sourceTag = "";
    if (fixtureRow) {
      valueText = `${fixtureRow.expected}/5`;
      sourceTag = ` (${displayName}'s own fixture)`;
    } else if (scoreRow && scoreRow.status === "scored") {
      valueText = `${scoreRow.score}/5`;
    } else if (scoreRow && scoreRow.status === "gap") {
      valueText = "Not scored yet";
    } else {
      valueText = "no data";
    }
    const weightLabel = WEIGHT_CLASS_LABEL[crit.weight_class] || crit.weight_class;
    item.innerHTML = `<strong>${escapeHtml(crit.name)}</strong> <span class="scope-tag">(${escapeHtml(weightLabel)})</span><br>${escapeHtml(valueText)}${sourceTag}`;
    wrap.appendChild(item);
  }

  if (row.verdict) {
    const item = document.createElement("div");
    item.className = "breakdown-item";
    item.innerHTML = `<strong>${displayName}'s visa/elimination read</strong><br>${escapeHtml(row.verdict.expected)}`;
    wrap.appendChild(item);
  }
  return wrap;
}

document.addEventListener("click", (e) => {
  const th = e.target.closest("th[data-sort]");
  if (!th) return;
  const key = th.dataset.sort;
  if (STATE.sortKey === key) STATE.sortDir = STATE.sortDir === "asc" ? "desc" : "asc";
  else { STATE.sortKey = key; STATE.sortDir = key === "name" || key === "country" ? "asc" : "desc"; }
  loadStore().then((store) => render(store, getPersona()));
});
