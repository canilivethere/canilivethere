import { loadStore, sectionForFact, verdictHeadline } from "./data.js";
import { scoreToColor, verdictVisual } from "./colors.js";
import {
  applyStoredTheme, renderTopBar, renderPersonaBlock,
  renderFooter, getPersona, withPersona, escapeHtml,
  formatValue, confidenceBadge, sourceLine, sourceDetailHtml, divergenceBadge,
  FIT_INDEX_DEFINITION, buildFitHeadline,
} from "./app-shared.js";
import { PORTRAITS, CHAPTER_INTROS } from "./portraits.js";

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
  const store = await loadStore();
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
    root.innerHTML = `<p>No location matches <code>${escapeHtml(locId || "")}</code>. <a href="${withPersona("/lists.html")}">Back to the list</a>.</p>`;
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
    } else {
      // v5 §3.4 amended copy (folded into this cycle) — same meaning as
      // the old bare sentence, now carrying its own why + instead; covers
      // Waldo's criterion-only shape and any "neither" persona uniformly.
      div.innerHTML = `
        <p class="verdict-prose">Not checked yet for this persona at this location — a coverage gap on our side, not a verdict. The general figures below apply unchanged.</p>
        ${redFlagBadge}
        ${breakdownLink}
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
  details.innerHTML = `<summary>Score breakdown</summary><p class="fit-def">${escapeHtml(FIT_INDEX_DEFINITION)}</p><div class="criterion-scorebar">${chips.join("")}</div>`;
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
    <ul>${candidates.map((c) => `<li><a href="${withPersona(`/l/${c.l.location_id}.html`)}">
      ${escapeHtml(c.l.display_name)}</a> — ${c.val.toFixed(1)}/5</li>`).join("")}</ul>
    <p><a href="${withPersona("/lists.html")}">Back to the full list</a> · <a href="${withPersona("/index.html")}">Back to the map</a></p>`;
  return div;
}
