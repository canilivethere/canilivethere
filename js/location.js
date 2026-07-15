import { loadStore, sectionForFact, verdictHeadline } from "./data.js";
import { scoreToColor, verdictVisual, bandVisual } from "./colors.js";
import {
  applyStoredTheme, renderTopBar, renderPersonaBlock,
  renderFooter, getPersona, withPersona, escapeHtml,
  formatValue, confidenceBadge, sourceLine, sourceDetailHtml, divergenceBadge,
  FIT_INDEX_DEFINITION, SCALE_ANCHOR_STRING, buildFitHeadline, loadFxRates,
  STATE_HEADLINE, verdictDisclosureSentence,
} from "./app-shared.js";
import { PORTRAITS, CHAPTER_INTROS } from "./portraits.js";
import { siteUrl } from "./site-root.js";

applyStoredTheme();
renderTopBar("location");
wireChapterNav();
main();

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
  renderFooter(store);
  const persona = getPersona();

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
    root.appendChild(buildSection(sectionKey, bySection.get(sectionKey) || []));
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

  if (persona) {
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
        <p class="verdict-prose">${displayName}: ${escapeHtml(verdict.expected)}</p>
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
      const engineVerdict = store.verdictsByPersona.get(persona)?.get(loc.location_id);
      if (engineVerdict) {
        const visual = bandVisual(engineVerdict.overall_band);
        const stateText = STATE_HEADLINE[engineVerdict.overall_state] || engineVerdict.overall_state;
        div.innerHTML = `
          <p class="verdict-headline"><span class="verdict-chip" style="background:${visual.color}">${escapeHtml(stateText)}</span></p>
          <p class="verdict-prose">${escapeHtml(verdictDisclosureSentence(displayName))}</p>
          ${redFlagBadge}
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
  const personaLabel = persona ? persona.charAt(0).toUpperCase() + persona.slice(1) : "";
  const chips = store.criteria.map((crit) => {
    const scoreRow = scoreRows ? scoreRows.get(crit.criterion_id) : null;
    const fixtureRow = personaFixtures ? personaFixtures.get(crit.criterion_id) : null;
    let val, swatch, tag = "";
    if (fixtureRow) { val = Number(fixtureRow.expected); tag = ` (${personaLabel})`; }
    else if (scoreRow && scoreRow.status === "scored") { val = scoreRow.score; }
    else { val = null; }
    swatch = scoreToColor(val);
    return `<span class="criterion-chip"><span class="fit-swatch" style="background:${swatch}"></span>
      ${escapeHtml(crit.name)}: ${val != null ? val + "/5" : "gap"}${tag}</span>`;
  });
  details.innerHTML = `<summary>Score breakdown</summary><p class="fit-def">${escapeHtml(FIT_INDEX_DEFINITION)}</p><p class="fit-def">${escapeHtml(SCALE_ANCHOR_STRING)}</p><div class="criterion-scorebar">${chips.join("")}</div>`;
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

// v7 §2.4: each fact section is now a <details class="chapter">, closed
// by default, every location, no exceptions — including Overview, which
// gets no silent default-open exemption (the verdict block + portrait
// above already carry the page's own "overview"). A guide-voice intro
// line (js/portraits.js's CHAPTER_INTROS, verbatim source copy) sits
// right under the summary where one exists (5 of 6 sections this pilot;
// Overview has none drafted, renders without one).
function buildSection(key, facts) {
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

  if (!facts.length) {
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

  let bodyHtml = introHtml;
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
        <div class="fact-value">${escapeHtml(formatValue(t))}</div>
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
      <div class="fact-value">${escapeHtml(formatValue(f))}</div>
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
  const personaLabel = persona ? ` for ${persona.charAt(0).toUpperCase() + persona.slice(1)}` : "";
  div.innerHTML = `<h2>Where now?</h2><p>Ranked next-best alternatives${personaLabel}:</p>
    <ul>${candidates.map((c) => `<li><a href="${withPersona(siteUrl(`l/${c.l.location_id}.html`))}">
      ${escapeHtml(c.l.display_name)}</a> — ${c.val.toFixed(1)}/5</li>`).join("")}</ul>
    <p><a href="${withPersona(siteUrl("lists.html"))}">Back to the full list</a> · <a href="${withPersona(siteUrl("index.html"))}">Back to the map</a></p>`;
  return div;
}
