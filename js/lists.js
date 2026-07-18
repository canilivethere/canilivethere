import { loadStore, verdictHeadline, resolveVerdict } from "./data.js";
import { scoreToColor, indexToColor, calibrateIndexBands, verdictVisual, bandVisual } from "./colors.js";
import {
  applyStoredTheme, renderTopBar, renderPersonaSlot,
  renderFooter, getActivePersona, applyStoredCustomWeights, withPersona, escapeHtml,
  FIT_INDEX_DEFINITION, SCALE_ANCHOR_STRING, WEIGHT_CLASS_LABEL,
  verdictBand, BAND_ORDER, BAND_LABEL, STATE_HEADLINE,
  READER_DEPENDENCY_PENDING_LABEL, verdictConfidenceBadge, CUSTOM_ESTIMATE_SUFFIX, glossaryWrap,
  personaDisplayLabel, verdictProvenanceBadge,
} from "./app-shared.js";
import { siteUrl } from "./site-root.js";

applyStoredTheme();
renderTopBar("lists");
renderPersonaSlot(document.getElementById("persona-slot"), getActivePersona());
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

// Third application of the same map.js/location.js fallback pattern
// (Part 15.2/15.3): the six personas with no hand-authored VERDICT
// fixture (Waldo, Adira, Noa, Marek, Marguerite, Teo) still get a real,
// rule-derived read from the verdict-coverage engine
// (derived/verdicts.jsonl, full 8x38 coverage, confirmed elsewhere) —
// this table's own band-group headers need to sort those rows into the
// correct bucket too, not silently drop them all into "not checked yet".
// The engine's own `overall_band` is a closed 4-value enum (colors.js's
// bandVisual() cites the same verification) — mapped onto four of this
// table's five band-group keys (BAND_ORDER, above). "unclassified" is
// this table's own build-time registry-gap signal (an unrecognized
// fixture headline string) and has no engine equivalent; kept only as a
// defensive catch for a future, currently-unseen band value, same
// fail-loud idiom verdictBand()/bandVisual() already use rather than
// silently mis-sorting an unrecognized value.
const ENGINE_BAND_TO_GROUP = {
  clean: "clears",
  uncertain_or_conditional: "near-miss",
  hard_fail: "doesnt-clear",
  data_gap: "not-checked",
};
function engineVerdictGroup(overallBand) {
  if (Object.prototype.hasOwnProperty.call(ENGINE_BAND_TO_GROUP, overallBand)) {
    return ENGINE_BAND_TO_GROUP[overallBand];
  }
  console.warn("Unknown overall_band value in lists.js banding:", overallBand);
  return "unclassified";
}

async function main() {
  const store = await loadStore();
  applyStoredCustomWeights(store);
  renderFooter(store);
  const persona = getActivePersona();

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
  document.getElementById("fit-def-caption").textContent = `${FIT_INDEX_DEFINITION} ${SCALE_ANCHOR_STRING}`;

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
  const persona = getActivePersona();
  // "groups below" (not the spec's original "band below"): aligned to the
  // vocabulary the page actually renders — the group headers read
  // Clears/Near-miss/Doesn't clear/Not checked yet and the coverage
  // sentence above already calls them groups; "band" had no visible
  // referent on the page (review finding). Minimal referent-word change
  // only, meaning intact — flagged for the spec author's ratification.
  // v11 Part 21: "custom" never renders those verdict groups at all
  // (21.7's own scope boundary — a flat table, same shape as no persona)
  // — its own clause names that directly rather than reusing the
  // eight-persona wording, which would wrongly imply a "groups below" a
  // custom-weighted view never has.
  const doesntClause = persona === "custom"
    ? "it doesn't check your own visa, budget, or eligibility either — this sort only reweights the same facts by what you told us matters"
    : persona
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
  // v10 Part 16.2: the §8J disclosure, extended with the mechanical
  // field-gloss pattern this function already uses for `kind` — one more
  // clause, same template-not-hand-written style, appended only when the
  // sorted criterion's own reader_dependency reads "pending-ruling"
  // (today: Community & social fabric only).
  const pendingClause = crit.reader_dependency === "pending-ruling"
    ? ` Blends several distinct facts into one number — see the criteria page for what's inside it.`
    : "";
  el.textContent = `Sorted by ${crit.name} — ${clause}, for every researched location.${pendingClause} Ranks the place, not you: ${doesntClause}.`;
}

// The "fit" column header's own label, owned by render()'s th[data-sort]
// loop below rather than by updatePurposeExplainer() reaching into markup
// it doesn't own.
function fitColumnLabel(store) {
  if (!STATE.purposeCriterion) return "Fit index";
  const crit = store.criteriaById.get(STATE.purposeCriterion);
  if (!crit) return "Fit index";
  // v10 Part 16.2: same marker as the location-page chip and the
  // criteria-page section (16.1/16.3) — a reader scanning the table
  // itself, not the explainer sentence above it, still sees it on every
  // row via the column header, not just once at the top. th.textContent
  // is plain text (no markup possible), so this is a plain-text suffix,
  // not the styled .scope-tag span the other two surfaces use.
  return crit.reader_dependency === "pending-ruling"
    ? `${crit.name} (${READER_DEPENDENCY_PENDING_LABEL})`
    : crit.name;
}

// v4 addendum R1 §1.5, coverage honesty: which of the three shapes this
// persona's data actually has — mechanically detected from the data
// itself (not a hardcoded persona-name check), so a future ninth persona
// falls into the right branch automatically. "verdict" (a hand fixture
// verdict, Wenda/Carmen today, OR full engine coverage — every persona,
// today) takes priority over "criterion" when a persona somehow has more
// than one shape, since the verdict-grouped banding is the richer read.
function personaCoverageKind(store, persona) {
  const perPersona = store.fixturesByPersona.get(persona);
  let hasVerdict = false, hasCriteria = false;
  if (perPersona) {
    for (const entry of perPersona.values()) {
      if (entry.verdict) hasVerdict = true;
      if (entry.criteria.size > 0) hasCriteria = true;
    }
  }
  if (hasVerdict) return "verdict";
  // Engine-only coverage (derived/verdicts.jsonl) is a real, informative
  // verdict read even where no hand fixture verdict exists — checked
  // ahead of "criterion" on purpose: Waldo has both a criterion-fixture
  // rescore AND full engine coverage, and the engine's categorical
  // clears/conditional/fails/gap read is the richer, verdict-shaped
  // claim (this exact split argued and held in Part 15.4's own build
  // record), not a second copy of the Fit-index rescore. Also closes the
  // five-zero-fixture-persona case (Adira/Noa/Marek/Marguerite/Teo),
  // previously falling all the way through to "neither" even though the
  // engine has answered every one of their locations for months.
  if (store.verdictsByPersona.has(persona)) return "verdict";
  if (hasCriteria) return "criterion";
  return "neither";
}

// Computed, never hardcoded, from the same filtered `rows` array render()
// already builds — so a country filter narrows the claim correctly.
function personaCoverage(rows) {
  // A hand fixture and an engine read are both a real, checked answer —
  // counted together here so the coverage line above the table (e.g.
  // "checked for N of M places") states the true total, not just the
  // hand-fixture subset of it.
  const checked = rows.filter((r) => r.verdict || r.engineVerdict).length;
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
  // Part 23.4 item 1: the short per-row "(general)" marker's own full
  // meaning, stated once here rather than repeated on every row it marks.
  // Written to append to whichever branch below actually returns, not
  // just the "criterion" branch — checked live, not assumed: today every
  // one of the 8 named personas resolves to coverage kind "verdict"
  // (store.verdictsByPersona now covers all eight), so the "criterion"
  // branch is unreachable in practice and a fixed sentence living only
  // there would never actually explain a marker a reader can see. The
  // marker's real firing condition is row.personaAdjusted === false,
  // independent of coverage kind — this checks that condition directly.
  const anyFallback = rows.some((r) => r.personaAdjusted === false);
  const fallbackExplainer = anyFallback
    ? ` Rows marked (general) still show the general figure — ${displayName}'s own re-score hasn't reached that place yet.`
    : "";
  if (kind === "verdict") {
    const { checked, total } = personaCoverage(rows);
    return `${displayName}'s own verdict is checked for ${checked} of ${total} researched places — grouped below as Clears, Near-miss, Doesn't clear, and Not checked yet, ranked inside each group by whatever you've picked above. Each row shows its own reasoning directly, not just a colored chip.${fallbackExplainer}`;
  }
  if (kind === "criterion") {
    const checked = rows.filter((r) => r.personaAdjusted === true).length;
    const total = rows.length;
    return `${displayName}'s own criterion scores are refined for ${checked} of ${total} researched places — used in the ranking above. ${displayName}'s specific visa/residency verdict isn't checked yet anywhere, so every place below sits in Not checked yet until that lands.${fallbackExplainer}`;
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
      // Fallback verdict from the verdict-coverage engine (derived/
      // verdicts.jsonl) — same precedence as location.js's buildVerdictBlock
      // (15.2) and map.js's pin/tooltip (15.3): only populated when this
      // persona has no hand fixture verdict at all for this location, hand
      // fixture always wins where one exists (checked first, unchanged
      // above). Null whenever `verdict` (the fixture) is set, or no persona
      // is selected, or the engine itself has no row for this persona (a
      // defensive gap only — full 8x38 coverage today, confirmed elsewhere).
      let engineVerdict = null;
      // null = no persona selected (the question doesn't apply); true = a
      // real persona-adjusted figure; false = a persona is selected but this
      // row has no rescore, so the general figure is shown as a fallback —
      // the page's own promise ("labeled per row") that this flag exists to
      // honor in the render below.
      let personaAdjusted = null;
      if (persona === "custom") {
        // v11 Part 21 / 8P: no fixture, no engine verdict, ever, for this
        // identity (21.7's own scope boundary) — the fit value comes
        // straight from the reader's own weight vector, personaAdjusted
        // reads true (a real, computed reweighting, just not a fixture
        // rescore), verdict/engineVerdict stay null.
        const idx = store.personaIndex("custom", loc.location_id);
        fitValue = idx ? idx.value : null;
        personaAdjusted = true;
      } else if (persona) {
        const perLoc = store.fixturesByPersona.get(persona)?.get(loc.location_id);
        if (perLoc && perLoc.criteria.size > 0) {
          const idx = store.personaIndex(persona, loc.location_id);
          fitValue = idx ? idx.value : null;
          personaAdjusted = true;
        } else {
          personaAdjusted = false;
        }
        verdict = perLoc?.verdict || null;
        if (!verdict) {
          engineVerdict = resolveVerdict(store, persona, loc);
        }
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
      return { loc, country, general, fitValue, verdict, engineVerdict, personaAdjusted, purposeScore };
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
  // v12 Part 22.7: calibrate the fit-index color bands over the FULL
  // location set under the active view's index basis — deliberately not
  // the country-filtered rows (the comparative claim is against every
  // researched place, and a 3-row country filter would otherwise flip
  // the colors to a different basis than the map's). Same basis rule as
  // map.js's own render; personaIndex() already falls back to the
  // general figure wherever no persona-specific read exists, which is
  // exactly the value buildRows() puts in each row's fit column.
  calibrateIndexBands(store.locations.map((l) => {
    const idx = persona ? store.personaIndex(persona, l.location_id) : store.generalIndex(l.location_id);
    return idx ? idx.value : null;
  }));

  const rows = buildRows(store, persona);

  // §1.5 coverage line, recomputed every render (not just once in main())
  // so a country filter narrows the claim correctly.
  // Part 23.4 item 3: the "visiting is a separate, easier question"
  // framing used to repeat as link text on every row (38 times, identical
  // wording). Relocated here, page chrome, stated once, present whenever a
  // persona is active regardless of which persona or country filter — the
  // per-row affordance below keeps its own navigation (each row's own
  // #sec-visa anchor), just not the repeated sentence.
  const visitContextLine = persona
    ? " Just visiting instead? Every place below also has its own short-stay and tourist-visa rules — open any location's page and look under Visa & residency."
    : "";
  document.getElementById("persona-context").textContent =
    (persona === "custom"
      ? `Ranked by your own priorities — the same facts, weighted the way you told us matters (${CUSTOM_ESTIMATE_SUFFIX}).`
      : persona
      ? personaCoverageLine(store, persona, rows)
      : "Unpersonalized general ranking — the same 13-criterion weighted index shown on the map.") + visitContextLine;

  const tbody = document.getElementById("rank-tbody");
  tbody.innerHTML = "";

  // v11 Part 21: "custom" never bands by verdict (21.7 — no eligibility
  // concept for this identity) — same flat, sorted table as no persona.
  if (persona && persona !== "custom") {
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
// own headline where a hand fixture verdict exists, or by the engine's own
// `overall_band` where it doesn't (see the loop below) — only a row with
// neither (no persona-specific read has ever run for it) routes to
// "not-checked" directly, absence detected rather than assumed (§1.3's own
// named edge case).
function renderBanded(store, persona, rows, tbody) {
  const kind = personaCoverageKind(store, persona);
  const groups = new Map(BAND_ORDER.map((b) => [b, []]));
  for (const row of rows) {
    // Hand fixture wins where one exists (verdictBand() is built for its
    // fixture-shaped headline text, unchanged); engine-fallback rows are
    // banded off their own `overall_band` instead (engineVerdictGroup(),
    // above) — not run through verdictBand(), which only recognizes the
    // fixture headline vocabulary and would silently mis-sort every engine
    // row into "unclassified". Rows with neither are the genuine
    // not-checked case.
    let band;
    if (row.verdict) {
      band = verdictBand(verdictHeadline(row.verdict.expected));
    } else if (row.engineVerdict) {
      band = engineVerdictGroup(row.engineVerdict.overall_band);
    } else {
      band = "not-checked";
    }
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
    // Part 23.8 (F12/perspective-disclosure law): a scrolled viewport can
    // lose which persona's lens produced these groupings above it —
    // "Clears (0)" alone, mid-scroll, doesn't say for whom. renderBanded()
    // only ever runs with a real, non-custom persona locked (see its call
    // site in render()), so the "for {name}" clause always applies here —
    // the unlocked/no-persona state renders through the flat path below,
    // never reaching this function, and stays correctly un-qualified there
    // (the law's own "no-lens state is itself a perspective and says so"
    // clause, already true by omission).
    headerTd.innerHTML = `<strong>${escapeHtml(BAND_LABEL[band])} for ${escapeHtml(personaDisplayLabel(persona))} (${groupRows.length})</strong>`;
    headerTr.appendChild(headerTd);
    tbody.appendChild(headerTr);

    // Part 23.5 (F13, §8Q): group by (persona_id, country_id) when the
    // row's own engineVerdict is scope="country" — never by string-
    // matching prose (the spec's own hard constraint). A hand fixture
    // (row.verdict) is a genuinely per-location claim and is never
    // grouped; a forward scope="location" row (none live today) also
    // renders inline, unchanged — mixed scope within one band is the
    // expected shape, not special-cased away (§8Q item 4). Country
    // clusters render in the same relative position their first row would
    // have held under the existing sort, one subheader per country, not
    // re-sorted to the top/bottom of the band.
    const countryRowsSeen = new Map(); // country_id -> rows[]
    for (const row of groupRows) {
      if (!row.verdict && row.engineVerdict && row.engineVerdict.scope === "country") {
        const cid = row.country.country_id;
        if (!countryRowsSeen.has(cid)) countryRowsSeen.set(cid, []);
        countryRowsSeen.get(cid).push(row);
      }
    }
    const emittedCountries = new Set();
    for (const row of groupRows) {
      if (!row.verdict && row.engineVerdict && row.engineVerdict.scope === "country") {
        const cid = row.country.country_id;
        if (emittedCountries.has(cid)) continue;
        emittedCountries.add(cid);
        const countryRows = countryRowsSeen.get(cid);
        renderCountrySubheader(store, countryRows[0], countryRows.length, tbody, persona);
        for (const r of countryRows) renderRow(store, r, persona, tbody, { suppressVerdict: true });
      } else {
        renderRow(store, row, persona, tbody);
      }
    }
  }
}

// Part 23.5: the verdict chip + prose, extracted out of renderRow() so the
// new country-subheader row (below) can render the identical markup once,
// at country grain, instead of each location row re-deriving its own copy
// of an identical string. Zero behavior change for the row-level callers —
// same branches, same strings, same order.
// `persona` (added for the provenance-label fix below): the caller
// always has a real, non-custom persona locked whenever row.verdict or
// row.engineVerdict is populated (buildRows() only fills either field
// inside its own `else if (persona)` branch) — so this never needs a
// null-persona fallback the way personaCoverageLine()'s display-name
// convention does elsewhere in this file.
function buildVerdictHtml(store, row, persona) {
  const displayName = personaDisplayLabel(persona);
  if (row.verdict) {
    const headline = verdictHeadline(row.verdict.expected);
    const v = verdictVisual(headline);
    // Sell-the-no framing (§1.4): the verdict's full prose, always visible
    // under the chip, not gated behind the breakdown toggle. Zero new text
    // authored — the exact string verdictHeadline() already splits out,
    // shown in full instead of truncated.
    // Provenance label (perspective-disclosure law): this
    // is the hand-checked branch — reuses the map's own already-cleared
    // "hand-checked" vocabulary, not new copy.
    return `<span class="verdict-chip" style="background:${v.color}">${escapeHtml(v.label)}</span> ${verdictProvenanceBadge(true, displayName)}
      <div class="verdict-prose">${glossaryWrap(row.verdict.expected, store)}</div>`;
  }
  if (row.engineVerdict) {
    // Third application of the same map.js/location.js engine fallback
    // (Part 15.2/15.3). There's no fixture-shaped prose for this claim, so
    // (per this dispatch's own instruction) the chip carries the same
    // STATE_HEADLINE sentence location.js's own verdict block already uses
    // for the identical claim — zero new copy authored, and no separate
    // verdict-prose line, since STATE_HEADLINE already states the finer
    // read in full (the same "color answers roughly what kind, text
    // answers exactly what" doctrine app-shared.js's own STATE_HEADLINE
    // comment cites).
    const visual = bandVisual(row.engineVerdict.overall_band);
    const stateText = STATE_HEADLINE[row.engineVerdict.overall_state] || row.engineVerdict.overall_state;
    // Sourcing-confidence tier badge, same skip-on-data-gap rule as
    // location.js's own verdict block (a data-gap band already says "not
    // enough to judge" — a tier badge there would wrongly imply one exists).
    const tierBadge = row.engineVerdict.overall_band === "data_gap"
      ? "" : verdictConfidenceBadge(row.engineVerdict.confidence_tier);
    // Provenance label, same fix as above: this is the rule-derived
    // branch — the majority case, 5 of 8 personas at every location.
    return `<span class="verdict-chip" style="background:${visual.color}">${escapeHtml(stateText)}</span> ${verdictProvenanceBadge(false, displayName)}${tierBadge}`;
  }
  return "";
}

// Part 23.5 (F13, §8Q): a country-scope verdict is now stored ONCE per
// (persona, country) — every location under that country shares the exact
// same engineVerdict row (confirmed live: today, every engineVerdict row is
// scope="country"). Renders that shared verdict once, at a new subheader
// row directly under the band header — parallel structure (same
// `.band-header-row` shape, one level narrower via a modifier class),
// never string-matching prose to detect the duplication (the spec's own
// hard constraint) — this groups by the data's own scope+join key instead.
function renderCountrySubheader(store, sourceRow, count, tbody, persona) {
  const tr = document.createElement("tr");
  tr.className = "band-header-row country-subheader-row";
  const td = document.createElement("td");
  td.colSpan = 5;
  // Copy, Part 23.5: "one verdict, applying to every location below"
  // states the scope explicitly rather than leaving it to indentation
  // alone — the perspective-disclosure law's own point (a grouping is
  // itself a claim about what the number covers).
  td.innerHTML = `<span class="country-subheader-label">${escapeHtml(sourceRow.country.name)} — one verdict, applying to every location below.</span> ${buildVerdictHtml(store, sourceRow, persona)}`;
  tr.appendChild(td);
  tbody.appendChild(tr);
}

// One row (+ its expand-row sibling) — factored out of render() so both
// the flat (no persona) and banded (persona locked) paths share it.
// `suppressVerdict` (23.5): true when this row's own verdict is already
// shown once at a country-subheader row directly above it — the cell that
// used to carry the duplicated prose renders empty/dash instead, per
// F10/F13's own "never render a claim twice to the same eye" fix. The
// visit-link icon is NOT suppressed — its own destination is per-location
// and unrelated to the verdict-scope question.
function renderRow(store, row, persona, tbody, { suppressVerdict = false } = {}) {
  const tr = document.createElement("tr");
  // Part 23.4 item 1: this genuinely varies row by row (whether THIS
  // location has a persona rescore is computed per location, independent
  // of which band the row sorts into), so the caveat-scope principle's own
  // boundary condition applies here — compress the repeated words, don't
  // relocate the fact itself to a table-scope header (that would assert a
  // uniformity the data doesn't have). Full meaning stated once, in
  // personaCoverageLine()'s own per-page sentence, below.
  const fallbackTag = row.personaAdjusted === false && !STATE.purposeCriterion
    ? ` <span class="scope-tag" title="General figure — ${escapeHtml(persona.charAt(0).toUpperCase() + persona.slice(1))} hasn't been individually re-scored here yet.">(general)</span>`
    : "";
  // 21.6 item 2: the disclosure suffix rides wherever the custom-weighted
  // number itself renders — here, not on the purpose-criterion view (that
  // column shows one raw, unweighted score, unrelated to the reader's own
  // weight vector).
  const customTag = persona === "custom" && !STATE.purposeCriterion
    ? ` <span class="scope-tag">(${CUSTOM_ESTIMATE_SUFFIX})</span>`
    : "";
  // While a purpose view is active, the column shows that criterion's own
  // score directly — the whole point of §3 is answering "just the visa
  // question" (etc.) without opening the breakdown row to find the number.
  //
  // v12 Part 22.7 consumer split: the blended fit value colors by the
  // calibrated index bands (indexToColor); a purpose-view criterion score
  // is a raw, absolute, authored number and keeps the linear mapping
  // (scoreToColor) — two honest mappings, one stop set.
  const displayValue = STATE.purposeCriterion ? row.purposeScore : row.fitValue;
  const colorFor = STATE.purposeCriterion ? scoreToColor : indexToColor;
  const fitCellHtml = displayValue != null
    ? `<span class="fit-swatch" style="background:${colorFor(displayValue)}"></span> ${displayValue.toFixed(1)}/5${fallbackTag}${customTag}`
    : `<span class="fit-swatch" style="background:${colorFor(displayValue)}"></span> not scored`;

  // Part 23.5: verdict already shown once at this row's own country
  // subheader — this cell carries no repeated prose, an em dash instead
  // (same "cell says nothing new, don't repeat the claim" convention 23.3
  // already established for a different collision). A trailing <br> stays
  // on the non-suppressed engine branch (unchanged from before) so the
  // visit-link icon lands on its own line rather than squeezed against the
  // chip — caught live, by screenshot, not assumed, in the original build.
  let verdictHtml = "";
  if (suppressVerdict) {
    verdictHtml = `<span class="scope-tag">—</span><br>`;
  } else if (row.verdict) {
    verdictHtml = buildVerdictHtml(store, row, persona);
  } else if (row.engineVerdict) {
    verdictHtml = buildVerdictHtml(store, row, persona) + "<br>";
  }

  // Visit-layer affordance (§1.6): the honest interim pointer to the one
  // real place tourist facts already live (the flat visa section) — only
  // when a persona is locked, uniform across every band (not only
  // negative ones).
  // v7 no-JS fallback: link to the prerendered l/<id>.html page, not
  // location.html?loc=<id> — real static content exists there for
  // crawlers/no-JS visitors (tools/prerender-locations.mjs).
  // Part 23.4 item 3: same href/destination as before, no repeated
  // sentence — the explanatory framing now lives once, in page chrome
  // (render(), above). A compact, real Unicode glyph (not an image asset,
  // not emoji) with a full accessible label, so a screen-reader user gets
  // the whole meaning even though the visible glyph is minimal.
  const visitLink = persona
    ? `<a class="visit-icon-link" href="${withPersona(siteUrl(`l/${row.loc.location_id}.html`))}#sec-visa" aria-label="Short-stay and visitor rules for ${escapeHtml(row.loc.display_name)}" title="Short-stay and visitor rules">&#9432;</a>`
    : "";

  tr.innerHTML = `
    <td><a href="${withPersona(siteUrl(`l/${row.loc.location_id}.html`))}">${escapeHtml(row.loc.display_name)}</a></td>
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
    item.innerHTML = `<strong>${displayName}'s visa/elimination read</strong><br>${glossaryWrap(row.verdict.expected, store)}`;
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
  loadStore().then((store) => render(store, getActivePersona()));
});
