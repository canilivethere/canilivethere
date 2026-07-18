import { loadStore, sectionForFact, verdictHeadline, resolveVerdict } from "./data.js";
import { scoreToColor, verdictVisual, bandVisual } from "./colors.js";
import {
  applyStoredTheme, renderTopBar, renderPersonaBlock,
  renderFooter, getActivePersona, applyStoredCustomWeights, withPersona, escapeHtml,
  formatValue, confidenceBadge, sourceLine, sourceDetailHtml, divergenceBadge,
  FIT_INDEX_DEFINITION, SCALE_ANCHOR_STRING, buildFitHeadline, loadFxRates,
  STATE_HEADLINE, verdictDisclosureSentence, verdictConfidenceBadge,
  READER_DEPENDENCY_PENDING_LABEL, READER_DEPENDENCY_PENDING_PARAGRAPH,
  personaDisplayLabel, CUSTOM_ESTIMATE_SUFFIX, glossaryWrap,
} from "./app-shared.js";
import { PORTRAITS, CHAPTER_INTROS } from "./portraits.js";
import { siteUrl } from "./site-root.js";

applyStoredTheme();
renderTopBar("location");
wireChapterNav();
main().then(openHashTargetIfClosedDetails);

const SECTION_TITLES = {
  overview: "Overview",
  visa: "Visa & residency",
  property: "Property",
  cost: "Cost of living",
  community: "Community",
  redflags: "Red flags",
};
const SECTION_ORDER = ["overview", "visa", "property", "cost", "community", "redflags"];

async function main() {
  // Run together, not sequentially: the FX lookup is a best-effort
  // annotation (formatValue()/detectBareCurrency() degrade to showing no
  // USD approx at all if this hasn't resolved or failed), so it must
  // never delay the actual page content behind a second network round
  // trip. loadFxRates() never rejects (every failure path inside it is
  // caught and swallowed), so this Promise.all can't itself throw.
  const [store] = await Promise.all([loadStore(), loadFxRates()]);
  applyStoredCustomWeights(store);
  renderFooter(store);
  const persona = getActivePersona();

  const params = new URLSearchParams(location.search);
  // v7's no-JS prerender step (tools/prerender-locations.mjs) sets
  // <body data-loc-id="..."> on every static l/<id>.html page — that's
  // the primary id source now; the ?loc= query param stays a supported
  // fallback for the legacy /location.html?loc=X entry point (old
  // bookmarks, direct links), not removed.
  const locId = params.get("loc") || document.body.dataset.locId;
  const root = document.getElementById("loc-root");
  const loc = store.locationsById.get(locId);

  if (!loc) {
    root.innerHTML = `<p>No location matches <code>${escapeHtml(locId || "")}</code>. <a href="${withPersona(siteUrl("lists.html"))}">Back to the list</a>.</p>`;
    return;
  }
  const country = store.countriesById.get(loc.country_id);
  document.title = `${loc.display_name} (${country.name}) — CanILiveThere`;

  // Prerendered pages ship real static content inside #loc-root for
  // no-JS visitors (crawlers, previews). Once this script runs, it
  // replaces that content wholesale with the full interactive build —
  // clear first so nothing duplicates.
  root.innerHTML = "";

  const headerDiv = buildHeader(loc, country);
  root.appendChild(headerDiv);
  // v4 addendum R4 §4.3: the one branch that isn't a drop-in copy of
  // index.html/lists.html's static-placeholder shape — this page's H1 is
  // built dynamically (the location's own name), so there's no pre-parsed
  // #persona-slot id to target; the just-created H1 is the insertion
  // anchor instead. This is the site-wide persona SWITCHER; buildVerdictBlock
  // below is a different, location-specific component (the "does this work
  // for me" read) — kept distinct on purpose, not merged.
  renderPersonaBlock(persona, headerDiv.querySelector("h1"));

  // v7 §2.1: new top-to-bottom order — verdict block, portrait, change
  // events, section nav, chapters (collapsed), score breakdown (its own
  // chapter now), sources/verify-yourself (chapters), "Where now?"
  // (always visible, uncollapsed, at the very bottom).
  root.appendChild(buildVerdictBlock(store, loc, country, persona));
  root.appendChild(buildPortrait(loc));
  root.appendChild(buildChangeEvents(store, loc, country));
  root.appendChild(buildSectionNav());

  const facts = store.factsByLocation.get(loc.location_id) || [];
  const bySection = new Map(SECTION_ORDER.map((s) => [s, []]));
  for (const f of facts) {
    const s = sectionForFact(f);
    if (!bySection.has(s)) bySection.set(s, []);
    bySection.get(s).push(f);
  }

  for (const sectionKey of SECTION_ORDER) {
    const extraHtml = sectionKey === "visa" ? buildVisaRoutesHtml(store, country) : "";
    root.appendChild(buildSection(sectionKey, bySection.get(sectionKey) || [], extraHtml));
  }

  root.appendChild(buildScoreBar(store, loc, persona));

  // Partitioned once here instead of buildSourcesSection() and
  // buildVerifyYourself() each independently scanning `facts` for the same
  // value_raw === "[GAP]" condition.
  const gapFacts = [];
  const sourcedFacts = [];
  for (const f of facts) {
    (f.value_raw === "[GAP]" ? gapFacts : sourcedFacts).push(f);
  }
  root.appendChild(buildSourcesSection(sourcedFacts));
  root.appendChild(buildVerifyYourself(gapFacts));
  root.appendChild(buildNextBest(store, loc, persona));
}

// v7 §2.4: "Section nav -> chapter, wired together" — clicking a nav
// link (or the verdict block's score-breakdown link, or the red-flag
// pointer badge) both scrolls to AND opens (details.open = true) its
// target chapter, so a reader doesn't have to find and click the
// chapter's own toggle a second time. Delegated once at module load
// (same pattern as app-shared.js's source-toggle listener) rather than
// re-wired per render. Default anchor navigation/scroll is left alone
// (no preventDefault) — this only adds the "also open" behavior.
function wireChapterNav() {
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a[href^='#']");
    if (!link) return;
    const id = link.getAttribute("href").slice(1);
    const target = document.getElementById(id);
    if (target && target.tagName === "DETAILS") target.open = true;
  });
}

// wireChapterNav() above only opens a closed <details> chapter on an
// in-page click -- a cold cross-page arrival with the hash already in the
// URL (e.g. the map teaser's own red-flag link) never fires that
// listener. Tested directly (Chrome 120, --headless=new --dump-dom):
// native fragment-auto-open does not cover a closed <details> on
// cross-page arrival. General fix, not a one-off patch for red flags
// alone -- covers any current or future cross-page hash-into-chapter
// link. Called once, after main()'s DOM build finishes (the <details>
// elements this targets don't exist until then).
function openHashTargetIfClosedDetails() {
  if (!location.hash) return;
  const target = document.getElementById(location.hash.slice(1));
  if (target && target.tagName === "DETAILS" && !target.open) {
    target.open = true;
    target.scrollIntoView();
  }
}

// Scope-tag disclosure for country-wide facts (v2 addendum §5.1, part 1 —
// mechanical, no schema change): every fact rendering with `scope:
// "country"` gets the same visual pattern already used for sub-location
// facts, reading "Applies country-wide" instead of leaving a reader to
// infer that silently. A pure `scope`-field read, zero new claims.
function scopeTagHtml(fact) {
  if (fact.scope === "sub-location" && fact.scope_detail) {
    return ` <span class="scope-tag">(${escapeHtml(fact.scope_detail)})</span>`;
  }
  if (fact.scope === "country") {
    return ` <span class="scope-tag">(Applies country-wide)</span>`;
  }
  return "";
}

// "What to verify yourself" (v2 addendum §5.4): this location's own
// facts (own + inherited) whose value_raw is "[GAP]" (pre-partitioned by
// the caller, see main()) — now its own collapsed chapter (v7 §2.1 item
// 8). Zero new claims: every row here is already published as [GAP]
// somewhere on the page above.
function buildVerifyYourself(gaps) {
  if (!gaps.length) return document.createElement("div");
  const details = document.createElement("details");
  details.className = "chapter";
  details.id = "sec-verify";
  details.innerHTML = `
    <summary>What to verify yourself</summary>
    <p class="fact-notes">This site hasn't researched everything yet. Here's what's still open for this location — worth checking directly if it matters to you:</p>
    <ul>${gaps.map((f) => `<li>${escapeHtml(f.fact_label)} — not yet researched for this location.</li>`).join("")}</ul>
  `;
  return details;
}

function buildHeader(loc, country) {
  const div = document.createElement("div");
  // loc.status ("Rescored" for every location, as of this build) is this
  // project's own internal build-pipeline status, not place data — it
  // carries no reader-facing meaning and is deliberately not rendered here.
  div.innerHTML = `
    <div class="loc-header">
      <h1>${escapeHtml(loc.display_name)} <span class="scope-tag">(${escapeHtml(country.name)})</span></h1>
    </div>
  `;
  return div;
}

// v7 §2.2: the verdict block — headline-first, replaces the old always-
// verbose buildPersonaPanel(). Three cases, keyed on whether a real
// VERDICT fixture exists (not on whether criterion fixtures exist —
// Waldo's shape today is criteria-only/no-verdict, and correctly falls
// into the "no verdict fixture" branch: his re-scored Fit index is still
// reachable one click away via the score-breakdown chapter, this block's
// own job is the narrower "has a visa/residency verdict actually been
// checked for this persona" question).
function buildVerdictBlock(store, loc, country, persona) {
  const div = document.createElement("div");
  div.className = "verdict-block";

  // Red-flags count badge (v1 §2.1.1, "still owed," finally lands here):
  // a mechanical row count of this location's own real (non-[GAP])
  // red-flag facts — zero new claims, pure transport of an already-
  // published count. Shown regardless of persona/verdict state (a
  // location's red flags aren't persona-specific), not just inside the
  // verdict-fixture-exists case the spec's own prose describes it
  // under — a deliberate, named scope choice, flagged in the build
  // record rather than silently narrowed or widened without comment.
  const redFlagFacts = (store.factsByLocation.get(loc.location_id) || [])
    .filter((f) => sectionForFact(f) === "redflags" && f.value_raw !== "[GAP]");
  const redFlagBadge = redFlagFacts.length
    ? `<a class="redflag-pointer" href="#sec-redflags">${redFlagFacts.length} red flag${redFlagFacts.length === 1 ? "" : "s"} noted &#9656;</a>`
    : "";
  const breakdownLink = `<p class="fit-link-line"><a href="#sec-breakdown">See the full score breakdown</a></p>`;
  // v7 Part 12 (a live-render review of the Marguerite persona found
  // this sequencing problem): the "no verdict fixture" branch below
  // discloses that its own red-flag count and breakdown
  // link both lead to the same general, persona-blind figures the box
  // just told her haven't been checked against her specifically — only
  // THAT branch gets the scope-disclosed label; the real-verdict and
  // no-persona branches are unaffected, unchanged, still using the two
  // plain variables above.
  const redFlagBadgeGeneral = redFlagFacts.length
    ? `<a class="redflag-pointer" href="#sec-redflags">${redFlagFacts.length} red flag${redFlagFacts.length === 1 ? "" : "s"} noted (general figures) &#9656;</a>`
    : "";
  const breakdownLinkGeneral = `<p class="fit-link-line"><a href="#sec-breakdown">See the general score breakdown</a></p>`;

  if (persona === "custom") {
    // v11 Part 21 / 8P: no verdict, ever, for this identity (21.7's own
    // scope boundary — a weight vector reweights the general Fit index
    // only) — same "no persona selected" honest-gap voice the site
    // already ships for any view with no fixture and no engine input,
    // reused verbatim, just fed the custom-weighted value and disclosed.
    const idx = store.personaIndex("custom", loc.location_id);
    const headline = buildFitHeadline(store, null, loc, country, idx ? idx.value : null);
    div.innerHTML = `
      <p class="verdict-headline">${escapeHtml(headline)} (${CUSTOM_ESTIMATE_SUFFIX})</p>
      ${redFlagBadge}
      ${breakdownLink}
    `;
  } else if (persona) {
    const perLoc = store.fixturesByPersona.get(persona)?.get(loc.location_id);
    const verdict = perLoc?.verdict;
    const displayName = persona.charAt(0).toUpperCase() + persona.slice(1);

    if (verdict) {
      const headline = verdictHeadline(verdict.expected);
      const v = verdictVisual(headline);
      // v5 §3.2/§3.3 no-bare-no (folded into this cycle, v7 §7.2): for
      // the one hard-no class (eliminated), append the fixed "still
      // open" instead-line — two pointers to content already on this
      // same page, zero new facts.
      const insteadLine = v.kind === "eliminated"
        ? `<p class="fact-notes">Still open: <a href="#sec-visa">short-stay rules for visiting</a> are below, and <a href="#where-now">other places that scored well for you</a> are at the end of this page.</p>`
        : "";
      div.innerHTML = `
        <p class="verdict-headline"><span class="verdict-chip" style="background:${v.color}">${escapeHtml(v.label)}</span></p>
        <p class="verdict-prose">${displayName}: ${glossaryWrap(verdict.expected, store)}</p>
        ${redFlagBadge}
        ${insteadLine}
        ${breakdownLink}
      `;
    } else if (!store.fixturesByPersona.has(persona)) {
      // v9 Part 7 Tier 1: the five personas with zero hand fixtures
      // anywhere now get a real, rule-derived read from the verdict-
      // coverage engine (derived/verdicts.jsonl) here, instead of falling
      // through to this box's own always-fires "not checked yet"
      // confession below — Part 6's map-pin fix, a second render home for
      // the identical claim (mirrors map.js's own persona branch exactly).
      const engineVerdict = resolveVerdict(store, persona, loc);
      if (engineVerdict) {
        const visual = bandVisual(engineVerdict.overall_band);
        const stateText = STATE_HEADLINE[engineVerdict.overall_state] || engineVerdict.overall_state;
        // The fixture branch above's v5/v7 no-bare-no
        // instead-line, extended to the engine-only case. The line is pure
        // page navigation (two anchors already on this page) with no
        // fixture-specific content, so it transports verbatim — gated on
        // bandVisual()'s own `eliminated` flag, the engine's equivalent of
        // verdictVisual()'s `kind === "eliminated"` above.
        const insteadLine = visual.eliminated
          ? `<p class="fact-notes">Still open: <a href="#sec-visa">short-stay rules for visiting</a> are below, and <a href="#where-now">other places that scored well for you</a> are at the end of this page.</p>`
          : "";
        // Sourcing-confidence tier for this verdict, same three-value
        // vocabulary as the per-fact badges elsewhere on this page. Never
        // shown for a data-gap band — that band already says "not enough to
        // judge," so a tier badge there would wrongly imply a tier exists.
        const tierBadge = engineVerdict.overall_band === "data_gap"
          ? "" : verdictConfidenceBadge(engineVerdict.confidence_tier);
        // Part 23.5 / §8Q item 4: never render the raw word "scope" —
        // disclose the effect instead. Every verdict on file today is
        // computed once per country, not per location (confirmed live:
        // 168/168 rows), so a single-location page showing it needs to say
        // so, not let the reader assume it was checked at this exact place.
        // PLACEHOLDER WORDING, not final copy — needs a register pass
        // before shipping; flagged in the build report.
        const scopeNote = engineVerdict.scope === "country"
          ? `<span class="scope-tag" title="Computed once for every ${escapeHtml(country.name)} location, not this place specifically">(countrywide read)</span>`
          : "";
        div.innerHTML = `
          <p class="verdict-headline"><span class="verdict-chip" style="background:${visual.color}">${escapeHtml(stateText)}</span>${tierBadge}${scopeNote}</p>
          <p class="verdict-prose">${escapeHtml(verdictDisclosureSentence(displayName))}</p>
          ${redFlagBadge}
          ${insteadLine}
          ${breakdownLink}
        `;
      } else {
        // Defensive fallback only — the engine ships full 8x38 coverage
        // today (verified directly, zero nulls), so this branch is not
        // expected to fire. Falls back to the pre-v9 coverage-gap box
        // (below) rather than rendering a blank verdict block.
        const general = store.generalIndex(loc.location_id);
        const generalHeadline = buildFitHeadline(store, null, loc, country, general ? general.value : null);
        div.innerHTML = `
          <p class="verdict-headline">${escapeHtml(generalHeadline)} (general figures)</p>
          <p class="verdict-prose">Not checked yet for this persona at this location — a coverage gap on our side, not a verdict (this project's own term for a checked, persona-specific judgment). The general figures above apply unchanged.</p>
          ${redFlagBadgeGeneral}
          ${breakdownLinkGeneral}
        `;
      }
    } else {
      // v9 Part 6/7 scoping note: this branch now only fires for
      // Waldo/Wenda/Carmen at a location where their own fixture set has
      // no entry (store.fixturesByPersona.has(persona) is true, but not
      // for this location_id) — the five no-fixture personas are peeled
      // off into the branch above and never reach here. Unchanged below,
      // per this dispatch's own scope (v9 Part 6.4 names Waldo/Wenda/
      // Carmen's own stale-fade tension but leaves it untouched).
      //
      // v7 Part 12 (amends v5 §3.4/the original two-piece box: a
      // review found an honesty admission immediately followed by an
      // unweighted alarm count, both exits looping back into the same
      // unvetted material the box just flagged as unvetted). Three
      // pieces now, in this fixed order — solid ground before any alarm:
      // (1) the existing honest line, unchanged verbatim, now carrying
      // a "verdict" term-of-art gloss on its own first use in this box
      // (a smaller finding from the same review, not a project-wide
      // restyle); (2) NEW — the general Fit-index one-liner, the exact
      // zero-new-authorship mechanism the "no persona selected" branch
      // below already uses (buildFitHeadline()), transported into this
      // new render position — the same string a reader may already have
      // seen on this location's own map pin; (3) the red-flag badge, if
      // any, with a scope-disclosed label so she isn't led to think it
      // was checked against her specifically. Both exit links disclose
      // the same thing, before she clicks, not after.
      //
      // Correction found on a later pass over this same branch, before
      // it ever shipped: item (2)'s own Fit-index line is the same
      // general/unchecked-for-her category as the red-flag badge in (3)
      // — it needs the identical "(general figures)" disclosure suffix,
      // not just the badge. Appended directly here rather than inside
      // buildFitHeadline() itself, since that shared function is also
      // used by the "no persona selected" branch below (and the map pin
      // tooltip), where the same string is correctly UNqualified —
      // there, no persona is in play at all, so there's no "checked for
      // someone specific" expectation to disclose against.
      // v8 Part 10 Ruling 1: reorders this box — lead with what we know,
      // not with a confession about our own process. Every element and
      // every word survives from v7 Part 12 (this supersedes only the
      // ORDER, per Part 10's own amendment note); only positions move:
      // (1) the general Fit one-liner now leads; (2) the honest gap line
      // renders directly beneath it, unchanged verbatim, still above the
      // fold and read before any click — it now scopes the line above it
      // instead of confessing ahead of content the reader hasn't met yet;
      // (3) the red-flag badge stays last, ground-before-alarm preserved
      // exactly as Part 12 first won it.
      // Part 15.2: Waldo/Wenda/Carmen, no hand fixture verdict for this
      // location (Waldo: every location, no exceptions; Wenda/Carmen:
      // wherever their own fixture set has no entry) — check the same
      // engine (derived/verdicts.jsonl) the branch above already uses for
      // the five no-fixture personas, one level down the same precedence
      // chain this box already enforces (hand fixture always wins when
      // present, checked first, unchanged above this Part).
      const engineVerdict = resolveVerdict(store, persona, loc);
      if (engineVerdict) {
        const visual = bandVisual(engineVerdict.overall_band);
        const stateText = STATE_HEADLINE[engineVerdict.overall_state] || engineVerdict.overall_state;
        // Same instead-line extension as the branch
        // above (Waldo/Wenda/Carmen's own no-fixture-at-this-location case).
        const insteadLine = visual.eliminated
          ? `<p class="fact-notes">Still open: <a href="#sec-visa">short-stay rules for visiting</a> are below, and <a href="#where-now">other places that scored well for you</a> are at the end of this page.</p>`
          : "";
        // Same sourcing-confidence tier badge as the no-fixture branch
        // above — skip on a data-gap band for the identical reason.
        const tierBadge = engineVerdict.overall_band === "data_gap"
          ? "" : verdictConfidenceBadge(engineVerdict.confidence_tier);
        // Same scope disclosure as the no-fixture branch above — see its
        // comment. PLACEHOLDER WORDING, not final — see above.
        const scopeNote = engineVerdict.scope === "country"
          ? `<span class="scope-tag" title="Computed once for every ${escapeHtml(country.name)} location, not this place specifically">(countrywide read)</span>`
          : "";
        div.innerHTML = `
          <p class="verdict-headline"><span class="verdict-chip" style="background:${visual.color}">${escapeHtml(stateText)}</span>${tierBadge}${scopeNote}</p>
          <p class="verdict-prose">${escapeHtml(verdictDisclosureSentence(displayName))}</p>
          ${redFlagBadge}
          ${insteadLine}
          ${breakdownLink}
        `;
      } else {
        // Defensive fallback only — full 8x38 engine coverage today. Unchanged
        // text from before this Part.
        const general = store.generalIndex(loc.location_id);
        const generalHeadline = buildFitHeadline(store, null, loc, country, general ? general.value : null);
        div.innerHTML = `
          <p class="verdict-headline">${escapeHtml(generalHeadline)} (general figures)</p>
          <p class="verdict-prose">Not checked yet for this persona at this location — a coverage gap on our side, not a verdict (this project's own term for a checked, persona-specific judgment). The general figures above apply unchanged.</p>
          ${redFlagBadgeGeneral}
          ${breakdownLinkGeneral}
        `;
      }
    }
  } else {
    // No persona selected: the general-case hook, reusing
    // buildFitHeadline()'s exact mechanism — the same string a reader
    // may have already seen on this location's map pin (zero new
    // authorship, transport of an already-computed value).
    const general = store.generalIndex(loc.location_id);
    const headline = buildFitHeadline(store, null, loc, country, general ? general.value : null);
    div.innerHTML = `
      <p class="verdict-headline">${escapeHtml(headline)}</p>
      ${redFlagBadge}
      ${breakdownLink}
    `;
  }
  return div;
}

// v7 §2.3: the portrait — a narrative-copy slot. Strings lifted verbatim
// from js/portraits.js (itself a verbatim transport of already-reviewed
// source copy). Hard placeholder rule: no entry for this location_id ->
// renders nothing at all, not a stub. The hook+number "teaser" line's
// placement here (portrait-adjacent) is this build's own reading of an
// interpretation already flagged as uncertain upstream — an open
// question for design review to confirm or correct, not resolved by
// building it.
function buildPortrait(loc) {
  const div = document.createElement("div");
  const data = PORTRAITS[loc.location_id];
  if (!data) return div;
  div.className = "portrait-block";
  div.innerHTML = `
    <p>${escapeHtml(data.portrait)}</p>
    <p class="portrait-teaser">${escapeHtml(data.hook)} — ${escapeHtml(data.number)}</p>
  `;
  return div;
}

// v7 §2.1 item 7: the old always-on 13-chip score bar is now its own
// collapsed chapter, linked from the verdict block's Fit-index line
// rather than rendered inline at full weight (law 4's index demotion,
// applied to this surface).
function buildScoreBar(store, loc, persona) {
  const details = document.createElement("details");
  details.className = "chapter";
  details.id = "sec-breakdown";
  const scoreRows = store.scoresByLocation.get(loc.location_id);
  // Any persona with real criterion fixtures gets their override shown here,
  // not just Waldo - see buildVerdictBlock's comment for why the verdict
  // block itself no longer branches on this same distinction.
  const personaFixtures = persona ? store.fixturesByPersona.get(persona)?.get(loc.location_id)?.criteria : null;
  const personaLabel = persona ? personaDisplayLabel(persona) : "";
  // v9 Part 5: every stat is a door -- each chip's own name links one
  // click deeper to criteria.html, the shared anchor page (5.1: DRY on the
  // fact layer, one canonical definition per criterion instead of one
  // copy per location page). withPersona() so the persona active on this
  // location page is preserved into and back out of that page, same
  // convention as every other internal link on this site.
  const chips = store.criteria.map((crit) => {
    const scoreRow = scoreRows ? scoreRows.get(crit.criterion_id) : null;
    const fixtureRow = personaFixtures ? personaFixtures.get(crit.criterion_id) : null;
    let val, swatch, tag = "";
    if (fixtureRow) { val = Number(fixtureRow.expected); tag = ` (${personaLabel})`; }
    else if (scoreRow && scoreRow.status === "scored") { val = scoreRow.score; }
    else { val = null; }
    swatch = scoreToColor(val);
    // v10 Part 16.1: the §8J disclosure -- a marker on any criterion whose
    // reader_dependency reads "pending-ruling" (today: Community & social
    // fabric only), reusing .scope-tag verbatim (the existing "small
    // italic muted annotation beside a value" class). Zero new claim: this
    // renders only when the field is actually present and set, so it's a
    // silent no-op wherever the export a page loads from doesn't carry it.
    const pendingTag = crit.reader_dependency === "pending-ruling"
      ? ` <span class="scope-tag" title="Several distinct facts folded into one number — see the note above">${escapeHtml(READER_DEPENDENCY_PENDING_LABEL)}</span>`
      : "";
    const explainHref = withPersona(siteUrl(`criteria.html#${crit.criterion_id}`));
    return `<span class="criterion-chip"><span class="fit-swatch" style="background:${swatch}"></span>
      ${escapeHtml(crit.name)}: ${val != null ? val + "/5" : "gap"}${tag}${pendingTag}
      <a class="criterion-explain-link" href="${explainHref}">What this measures &rarr;</a></span>`;
  });
  // v10 Part 16.1: the shared paragraph, once per chapter (not once per
  // chip), reusing the existing .fit-def pattern already used for
  // FIT_INDEX_DEFINITION/SCALE_ANCHOR_STRING above -- renders only if at
  // least one criterion actually carries the field today, so it vanishes
  // automatically the day this decomposes, keyed off the field rather
  // than a hardcoded criterion_id.
  const hasPending = store.criteria.some((c) => c.reader_dependency === "pending-ruling");
  const pendingParagraph = hasPending
    ? `<p class="fit-def">${escapeHtml(READER_DEPENDENCY_PENDING_PARAGRAPH)}</p>`
    : "";
  details.innerHTML = `<summary>Score breakdown</summary><p class="fit-def">${escapeHtml(FIT_INDEX_DEFINITION)}</p><p class="fit-def">${escapeHtml(SCALE_ANCHOR_STRING)}</p>${pendingParagraph}<div class="criterion-scorebar">${chips.join("")}</div>`;
  return details;
}

function buildChangeEvents(store, loc, country) {
  const div = document.createElement("div");
  const events = [
    ...(store.changeEventsByLocation.get(loc.location_id) || []),
    ...(store.changeEventsByCountry.get(country.country_id) || []).filter((e) => !e.location_id),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!events.length) return div;
  div.innerHTML = `<h2>Recent change events</h2>` + events.map((ev) => `
    <div class="change-event sev-${ev.severity}">
      <strong>${escapeHtml(ev.date)}</strong> — ${escapeHtml(ev.headline)}
      <span class="badge">${ev.category}</span> <span class="badge">severity ${ev.severity}</span>
      ${ev.detail ? `<div class="fact-notes">${escapeHtml(ev.detail)}</div>` : ""}
    </div>`).join("");
  return div;
}

function buildSectionNav() {
  const div = document.createElement("nav");
  div.className = "section-nav";
  div.innerHTML = SECTION_ORDER.map((s) => `<a href="#sec-${s}">${SECTION_TITLES[s]}</a>`).join("");
  return div;
}

// v7 Part 14: illegal-but-practiced routes. Governs how a
// `mechanism_legality: prohibited-enforced` fact renders, wherever it
// has actually been filed (Thailand's nominee-company property
// workaround is the one worked example documented in the data schema;
// NOT yet exported into this repo's own derived/ snapshot as of this
// build — this function renders nothing today, same empty-state
// discipline as the rest of this page, and that's confirmed by a live
// dry run, not assumed). Zero new facts authored here — render-shape
// only, built against the section's own already-loaded fact list.
//
// Field-mapping judgment call, named plainly (not settled by a schema
// ruling this build can point to): the one real worked example on file
// (the schema documentation's own Thailand nominee-arrangement example)
// shows the practice's own plain description and its sourced legal
// consequence BOTH living on the sibling `mechanism`-role fact (same
// group_key, same group_role_detail) — fact_label for (a), notes for
// (c) — not on the `mechanism_legality` fact itself, which mostly just
// asserts the token and an enforcement-trend note. This function reads
// it that way, falling back to the mechanism_legality fact's own
// fact_label/notes only if no sibling `mechanism` fact exists. A
// different reasonable reader could map these fields differently; this
// is an open judgment call, not a certainty — named here plainly rather
// than presented as settled.
//
// v8 Part 3 completions: (1) scope transport needs no extra code — a
// country-scope `mechanism_legality` fact already inherits onto every one
// of that country's location pages via factsByLocation()'s own existing
// country->location inheritance (data.js), the same mechanism every other
// country-scope fact already gets; (2) surface confinement is already
// true by construction — this function is only ever called from
// buildSection(), i.e. inside a location-page chapter, never from the map,
// a tooltip, or Lists; (3) the consequence-gap fallback string below is
// the ruled fixed string for this row type specifically (v5's named-gap
// form, not the generic "Not yet researched" every other fact uses).
function buildIllegalRoutesHtml(facts) {
  const illegalFacts = facts.filter(
    (f) => f.group_role === "mechanism_legality" && f.value_raw === "prohibited-enforced"
  );
  if (!illegalFacts.length) return "";

  const rows = illegalFacts.map((legalityFact) => {
    const groupFacts = facts.filter((f) => f.group_key === legalityFact.group_key);
    const mechanismFact = groupFacts.find(
      (f) => f.group_role === "mechanism" && f.group_role_detail === legalityFact.group_role_detail
    );
    // (a) the practice, plain language, verbatim from the researched
    // fact, never softened or dramatized — never authored here.
    const practice = mechanismFact ? mechanismFact.fact_label : legalityFact.fact_label;
    // (c) the real, sourced consequence if researched, GAP-marked
    // honestly if not — never a severity invented to fill the gap.
    const consequence = (mechanismFact && mechanismFact.notes) || legalityFact.notes || "";
    // v5 why+instead: a sibling `mechanism` fact in the same group whose
    // own legality sibling reads "legitimate" is a real lawful
    // alternative already rendered elsewhere in this same chapter (the
    // plain fact list above) — named and pointed to, never invented when
    // none exists.
    const lawfulAlternatives = groupFacts.filter((f) => {
      if (f.group_role !== "mechanism" || f.group_role_detail === legalityFact.group_role_detail) return false;
      const sibling = groupFacts.find(
        (g) => g.group_role === "mechanism_legality" && g.group_role_detail === f.group_role_detail
      );
      return sibling && sibling.value_raw === "legitimate";
    });
    const insteadHtml = lawfulAlternatives.length
      ? `<div class="fact-notes">Lawful alternative in this same section: ${lawfulAlternatives.map((a) => escapeHtml(a.fact_label)).join(", ")}.</div>`
      : `<div class="fact-notes">No lawful alternative is recorded in this section yet — a gap, not a claim that none exists.</div>`;
    return `
      <div class="illegal-route-row">
        <div class="fact-label">${escapeHtml(practice)}</div>
        <div class="fact-value"><strong>Illegal</strong></div>
        <div class="fact-notes">${consequence ? escapeHtml(consequence) : "What enforcement actually looks like here isn't researched yet."}</div>
        ${insteadHtml}
      </div>
    `;
  }).join("");

  // Heading + label strings ("Illegal but sometimes practiced", "Illegal")
  // are fixed template copy, ruled by v7 Part 14 item 2/3 (confirmed in
  // Part 17) — transported verbatim here, not reworded.
  return `<div class="illegal-routes"><h3>Illegal but sometimes practiced</h3>${rows}</div>`;
}

// "Your realistic paths in" per location — the
// website-brief's own §4 spec for this chapter ("Visa & residency
// (routes, thresholds, ... last-verified)"), sourced from the rules
// layer's own complete route export (derived/visa-routes.jsonl, now
// fetched — see data.js) rather than the fact-group mechanism below.
// General figures only, same as every other figure on this page before
// a persona is read against it — the persona-specific eligibility read
// (verdict block, above) is a separate, already-built surface, not
// duplicated here.
//
// A real finding from checking live, not assumed: every one of
// visa-routes.jsonl's 52 rows traces back (via threshold_fact_key) to a
// fact that ALSO already renders below via the older group-key route
// cards — a direct check against every derived/facts/*.jsonl file found
// zero rows this export covers that the older mechanism doesn't. So
// this is not a coverage-gap fill (an earlier finding, "7 of 51 render
// nothing," may since have been closed on the data side — not verified
// either way here, just found not to apply to this file's own 52 rows
// today); it is the same underlying facts through a second, structured
// pipeline. Rendering both in full would be genuine, confusing
// duplication — the two-click law's own "no dead ends, never pours"
// spirit argues against it as much as against a gap. Resolved here as
// **overview-then-detail** (this chapter's own established doctrine —
// v7 work order law 5, "depth is opt-in"): this list renders FIRST, as
// a compact, comparable quick-reference table across every route on
// file; the older mechanism's fuller narrative cards (with each
// threshold's own sourced notes) render immediately below as the
// detail a reader opts into. This is an interpretive call made after
// finding the overlap live rather than routing it as an open question
// — named honestly as a judgment call in the build log, not a settled
// design ruling.
const INCOME_TYPE_LABEL = {
  primary_accepted: "accepted as primary qualifying income",
  supplementary_only: "accepted only as supplementary income",
  explicitly_rejected: "explicitly not accepted",
  not_stated_by_source: "not stated by the source",
};

// Adapts a visa-routes.jsonl row into the fact-shaped object
// formatValue()/confidenceBadge()/divergenceBadge()/sourceDetailHtml()
// already expect — same field meanings, different column names
// (income_threshold/threshold_label in place of value_raw/fact_label).
// Zero new formatting logic: every one of these helpers is reused
// verbatim, not reimplemented.
function routeAsFact(r) {
  return {
    value_raw: r.income_threshold,
    unit: r.unit,
    value_num_low: r.value_num_low,
    value_num_high: r.value_num_high,
    confidence: r.confidence,
    source_count: r.source_count,
    source_url: null, // visa-routes.jsonl carries source_ref (a filename), never a URL, same as every fact on file today
    date: r.date,
    divergence_flag: r.divergence_flag,
  };
}

// Bug fix (2026-07-16): a route_key of shape `{country_id}:visit:{slug}`
// (the tourist/visitor-entry-category kind) is structurally forbidden
// from ever carrying a 'threshold' role fact — so `r.threshold_label`/
// `r.income_threshold` are NULL by design for every ':visit:' row, never
// a data gap on their own. This render code only expected ':route:'-kind
// rows (the only kind that existed until a recent data update landed the
// first two real ':visit:' rows — Colombia's PIP and Morocco's e-Visa
// nationality carve-outs) and had no branch for the other legal kind, so
// it rendered escapeHtml(undefined) (empty label) and
// formatValue({value_raw: undefined}) (the literal string "undefined")
// for both. isVisitRoute() mirrors the same group-kind signal the export
// pipeline already keys off
// (`group_key LIKE '%:visit:%'`) — mechanical, not a new classification.
function isVisitRoute(routeKey) {
  return typeof routeKey === "string" && routeKey.includes(":visit:");
}

// Mechanical de-slug of the route_key's own category-name segment — never
// a new fact. Per §8F.7, that segment already *is* "the source file's own
// established name" for the entry category, just written as a URL-safe
// slug; this only reverses that one mechanical transform (hyphens back to
// spaces, word-initial capitals) to get a readable label where no
// human-authored `threshold_label` exists for this row's kind. A doubled
// hyphen in the source slug (the source's own way of joining two distinct
// clauses, e.g. "visa-free-entry--most-nationalities") renders as an
// en-dash-joined pair of phrases rather than one run-on phrase.
function routeCategoryLabel(routeKey) {
  const slug = routeKey.split(":visit:")[1] || routeKey;
  return slug
    .split("--")
    .map((clause) => clause.split("-").map((w) => w ? w[0].toUpperCase() + w.slice(1) : w).join(" "))
    .join(" – ");
}

function buildVisaRoutesHtml(store, country) {
  const rows = store.visaRoutesByCountry.get(country.country_id) || [];
  if (!rows.length) return "";
  // Grouped by route_key so a route documented as several sub-thresholds
  // (Thailand's LTR categories, its O-A/O-X tiers) renders as one card
  // with each threshold as its own row — mirrors the existing
  // fact-group route-card idiom above exactly, applied to this data
  // source instead.
  const byRoute = new Map();
  for (const r of rows) {
    if (!byRoute.has(r.route_key)) byRoute.set(r.route_key, []);
    byRoute.get(r.route_key).push(r);
  }
  const cards = [...byRoute.values()].map((group) => {
    const rowsHtml = group.map((r) => {
      const asFact = routeAsFact(r);
      const notes = [];
      if (r.converts_to_pr) {
        const v = r.converts_to_pr === "[GAP]" ? "Not yet researched" : r.converts_to_pr;
        notes.push(`<div class="fact-notes">Converts to permanent residency: <strong>${escapeHtml(v)}</strong></div>`);
      }
      if (r.accepts_passive_income) {
        const v = r.accepts_passive_income === "[GAP]" ? "Not yet researched" : r.accepts_passive_income;
        notes.push(`<div class="fact-notes">Accepts passive income: <strong>${escapeHtml(v)}</strong></div>`);
      }
      if (r.income_type_passive) {
        notes.push(`<div class="fact-notes">Passive income treatment: <strong>${escapeHtml(INCOME_TYPE_LABEL[r.income_type_passive] || r.income_type_passive)}</strong></div>`);
      }
      if (r.income_type_pension) {
        notes.push(`<div class="fact-notes">Pension income treatment: <strong>${escapeHtml(INCOME_TYPE_LABEL[r.income_type_pension] || r.income_type_pension)}</strong></div>`);
      }
      // age_gate "0" is the one real case on file (Thailand's Privilege
      // visa) and reads as this schema's own floor value, not a genuine
      // "must be over 0" finding — rendering it as a real age would
      // manufacture a claim nobody researched. Omitted rather than
      // guessed at, same honest-omission convention this page already
      // uses elsewhere (e.g. a zero-red-flag location shows no badge at
      // all rather than "0 red flags").
      if (r.age_gate && r.age_gate !== "0") {
        notes.push(`<div class="fact-notes">Minimum age: <strong>${escapeHtml(r.age_gate)}</strong> years</div>`);
      }
      // ':visit:' rows (see isVisitRoute() above): threshold_label/
      // income_threshold are structurally NULL by design, not a gap on
      // this row alone. Label falls back to a mechanical de-slug of the
      // route_key's own category name (routeCategoryLabel()); the
      // fact-value line is omitted rather than shown empty or as the
      // literal "undefined" — same honest-omission convention this file
      // already uses elsewhere (e.g. age_gate "0", a zero-red-flag
      // location's badge) rather than fabricating a figure that was
      // never researched. Confidence/divergence/source-detail still
      // render: those provenance fields are real, computed values for
      // every ':visit:' row, not placeholders.
      const visit = isVisitRoute(r.route_key);
      const label = visit ? routeCategoryLabel(r.route_key) : r.threshold_label;
      const valueHtml = visit ? "" : `<div class="fact-value">${escapeHtml(formatValue(asFact, { suppressGapText: true }))}</div>`;
      return `
        <div class="fact-label">${escapeHtml(label)}</div>
        ${valueHtml}
        <div class="fact-meta">${confidenceBadge(asFact)} ${divergenceBadge(asFact)}</div>
        <div class="source-detail">${sourceDetailHtml(asFact)}</div>
        ${notes.join("")}
      `;
    }).join("<hr>");
    return `<div class="fact-item">${rowsHtml}</div>`;
  }).join("");
  return `
    <h3>Visa routes at a glance</h3>
    <p class="fact-notes">Every documented route into ${escapeHtml(country.name)}, compared side by side — general figures, not checked against any one persona (see the verdict above for a persona-specific read where one exists). The full write-up for each, with sourced notes, is right below.</p>
    <div class="fact-list">${cards}</div>
  `;
}

// v7 §2.4: each fact section is now a <details class="chapter">, closed
// by default, every location, no exceptions — including Overview, which
// gets no silent default-open exemption (the verdict block + portrait
// above already carry the page's own "overview"). A guide-voice intro
// line (js/portraits.js's CHAPTER_INTROS, verbatim source copy) sits
// right under the summary where one exists (5 of 6 sections this pilot;
// Overview has none drafted, renders without one).
function buildSection(key, facts, extraHtml = "") {
  const details = document.createElement("details");
  details.id = `sec-${key}`;
  // Red Flags keeps its stronger heading treatment even while collapsed
  // (v1 §2.1.1) — the <summary> itself carries that weight now, since
  // nothing stays open by default anymore (v7 §2.4).
  details.className = "chapter" + (key === "redflags" ? " chapter-redflags" : "");
  const title = SECTION_TITLES[key] || key;
  const introHtml = CHAPTER_INTROS[key]
    ? `<p class="chapter-intro">${escapeHtml(CHAPTER_INTROS[key])}</p>`
    : "";

  if (!facts.length && !extraHtml) {
    details.innerHTML = `<summary>${title}</summary>${introHtml}<p class="fact-notes">Not yet researched — a gap, not a claim that nothing is true here.</p>`;
    return details;
  }

  // Group visa-route facts (group_key) into route cards; everything else
  // renders as a plain fact item. Mechanical grouping only (schema §2's
  // visa_route view), no interpretation of what a route "means". Facts are
  // accumulated per group_role as an array, never assigned to a single
  // slot: a route can legitimately hold several distinct facts sharing one
  // role (e.g. one "threshold" fact per named sub-category, like Thailand's
  // five LTR categories or its two O-A/O-X tiers) — collapsing them to one
  // would silently render a combination the data never actually states.
  const routeGroups = new Map();
  const plain = [];
  for (const f of facts) {
    if (f.group_key) {
      if (!routeGroups.has(f.group_key)) routeGroups.set(f.group_key, new Map());
      const byRole = routeGroups.get(f.group_key);
      if (!byRole.has(f.group_role)) byRole.set(f.group_role, []);
      byRole.get(f.group_role).push(f);
    } else {
      plain.push(f);
    }
  }

  let bodyHtml = introHtml + extraHtml;
  if (routeGroups.size) {
    bodyHtml += `<div class="fact-list">`;
    for (const [, byRole] of routeGroups) {
      const thresholds = byRole.get("threshold") || [];
      // No threshold fact in this group: nothing to anchor a card on.
      // Not rendered here — a data-layer coverage gap (route-card
      // extraction), not something this render pass authors a fix for.
      if (!thresholds.length) continue;
      const convertsToPr = byRole.get("converts_to_pr") || [];
      const acceptsPassive = byRole.get("accepts_passive_income") || [];
      bodyHtml += `<div class="fact-item">`;
      // One label/value/meta block per threshold sub-category — every one
      // renders, none silently wins over another.
      bodyHtml += thresholds.map((t) => `
        <div class="fact-label">${escapeHtml(t.fact_label)}${scopeTagHtml(t)}</div>
        <div class="fact-value">${escapeHtml(formatValue(t, { suppressGapText: true }))}</div>
        <div class="fact-meta">${confidenceBadge(t)} ${divergenceBadge(t)}</div>
        <div class="source-detail">${sourceDetailHtml(t)}</div>
        ${t.notes ? `<div class="fact-notes">${escapeHtml(t.notes)}</div>` : ""}
      `).join(thresholds.length > 1 ? "<hr>" : "");
      // Same for the two route-mechanics lines: when a role holds more than
      // one fact (e.g. Thailand's LTR "accepts passive income" differs by
      // sub-category), each one renders under its own fact_label instead of
      // one generic prefix standing in for facts that disagree.
      bodyHtml += convertsToPr.map((c) => `<div class="fact-notes">${convertsToPr.length > 1 ? escapeHtml(c.fact_label) : "Converts to permanent residency"}: <strong>${escapeHtml(c.value_raw)}</strong></div>`).join("");
      bodyHtml += acceptsPassive.map((a) => `<div class="fact-notes">${acceptsPassive.length > 1 ? escapeHtml(a.fact_label) : "Accepts passive income"}: <strong>${escapeHtml(a.value_raw)}</strong></div>`).join("");
      bodyHtml += `</div>`;
    }
    bodyHtml += `</div>`;
  }

  bodyHtml += `<ul class="fact-list">` + plain.map((f) => `
    <li class="fact-item">
      <div class="fact-label">${escapeHtml(f.fact_label)}${scopeTagHtml(f)}</div>
      <div class="fact-value">${escapeHtml(formatValue(f, { suppressGapText: true }))}</div>
      <div class="fact-meta">${confidenceBadge(f)} ${divergenceBadge(f)}</div>
      <div class="source-detail">${sourceDetailHtml(f)}</div>
      ${f.notes ? `<div class="fact-notes">${escapeHtml(f.notes)}</div>` : ""}
    </li>`).join("") + `</ul>`;

  // v7 Part 14: reads this SAME section's own already-loaded `facts`
  // array (before the routeGroups/plain split above), since a
  // `mechanism_legality` fact carries a group_key and would otherwise
  // only ever reach the routeGroups branch — which silently drops any
  // group with no `threshold` role fact (see the comment above), meaning
  // it would never render at all without this dedicated pass. Renders
  // nothing (empty string) until a real prohibited-enforced fact exists
  // in this section's facts.
  bodyHtml += buildIllegalRoutesHtml(facts);

  details.innerHTML = `<summary>${title}</summary>${bodyHtml}`;
  return details;
}

function buildSourcesSection(sourcedFacts) {
  const details = document.createElement("details");
  details.className = "chapter";
  details.id = "sec-sources";
  const seen = new Map();
  for (const f of sourcedFacts) {
    const key = f.source_url || `onfile:${f.source_ref || f.fact_label}`;
    if (!seen.has(key)) seen.set(key, f);
  }
  const rows = [...seen.values()];
  details.innerHTML = `<summary>Sources</summary>` + (rows.length
    ? `<ul class="fact-list">` + rows.map((f) => `
        <li class="fact-item">
          <div class="fact-value">${sourceLine(f)} ${confidenceBadge(f, { interactive: false })} <span class="scope-tag">${escapeHtml(f.date || "")}</span></div>
        </li>`).join("") + `</ul>`
    : `<p class="fact-notes">No sources on file yet.</p>`);
  return details;
}

// v7 §2.1 item 9: always-rendered, uncollapsed, at the very bottom — the
// one exception to "everything above collapses." v7 §7.1 item 1: the
// ranking ternary is persona-generic now (any truthy persona with real
// personaIndex data uses it, general index only as the true fallback),
// not hardcoded to Waldo alone — Wenda/Carmen (and any future persona)
// with real personaIndex data were silently falling back to the general
// index before this fix.
function buildNextBest(store, loc, persona) {
  const div = document.createElement("div");
  div.className = "next-best";
  div.id = "where-now";
  const candidates = store.locations
    .filter((l) => l.location_id !== loc.location_id)
    .map((l) => {
      const idx = persona
        ? (store.personaIndex(persona, l.location_id) || store.generalIndex(l.location_id))
        : store.generalIndex(l.location_id);
      return { l, val: idx ? idx.value : -1 };
    })
    .filter((c) => c.val >= 0)
    .sort((a, b) => b.val - a.val)
    .slice(0, 5);
  const personaLabel = persona === "custom" ? ` matching your own priorities` : persona ? ` for ${persona.charAt(0).toUpperCase() + persona.slice(1)}` : "";
  div.innerHTML = `<h2>Where now?</h2><p>Ranked next-best alternatives${personaLabel}:</p>
    <ul>${candidates.map((c) => `<li><a href="${withPersona(siteUrl(`l/${c.l.location_id}.html`))}">
      ${escapeHtml(c.l.display_name)}</a> — ${c.val.toFixed(1)}/5</li>`).join("")}</ul>
    <p><a href="${withPersona(siteUrl("lists.html"))}">Back to the full list</a> · <a href="${withPersona(siteUrl("index.html"))}">Back to the map</a></p>`;
  return div;
}
