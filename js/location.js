import { loadStore, sectionForFact, verdictHeadline, resolveVerdict, resolveNationalityTier } from "./data.js";
import {
  applyReaderLens, renderPerspectiveBlock, hasReaderVerdicts, readerBasisIsAssumed,
} from "./reader-lens.js";
import { scoreToColor, verdictVisual, bandVisual, eliminatedColor, RAMP_VALUE_ATTR, RAMP_KIND_ATTR } from "./colors.js";
import {
  applyStoredTheme, renderTopBar,
  renderFooter, getActivePersona, withPersona, escapeHtml,
  formatValue, confidenceBadge, sourceLine, sourceDetailHtml, divergenceBadge,
  FIT_INDEX_DEFINITION, SCALE_ANCHOR_STRING, FIT_INDEX_DEFAULT_WEIGHTING_LINE,
  buildFitHeadline, loadFxRates,
  stateHeadline, verdictDisclosureSentence, verdictConfidenceBadge,
  READER_DEPENDENCY_PENDING_LABEL, READER_DEPENDENCY_PENDING_PARAGRAPH,
  personaDisplayLabel, glossaryWrap, verdictProvenanceBadge,
  READER_ID, READER_VERDICT_DISCLOSURE_SCOPE, READER_VERDICT_DISCLOSURE_PASSPORT,
  READER_BASIS_DECLARED_LINE,
  verdictChipMarkup, renewalLifeExplainerLine, loadNationality,
  sentenceCaseRuleParagraph, locationGateProvenanceHtml,
  readerVerdictBlockClaim, readerClearedGroups, readerMissGroups,
  readerRouteItemParts, readerMissToggleLabels,
  readerUnreadLine, readerHeadlineBadgeSuppressed,
  readerRendersBothClearedLists, READER_NOTHING_READ_LINE,
  READER_GATES_DISCLOSURE_LINE, readerMissSummary, readerVerdictBlockCauses,
} from "./app-shared.js";
import {
  PORTRAITS, CHAPTER_INTROS,
  READER_SENTENCES, READER_SENTENCE_SCOPE_LINE, READER_SENTENCE_POSITIONS,
} from "./portraits.js";
import {
  STORE_VALUE_STRINGS, declaredGapFactKeys, indexLineFor, unregisteredStoreToken,
} from "./reader-strings.js";
import { siteUrl } from "./site-root.js";
import { ISO_COUNTRY_NAMES } from "./iso-names.js";

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
// Chapter order: verdict, intro, visa, cost of living,
// property, community, red flags, score breakdown, sources. Cost of
// living now precedes property. Must stay identical to
// tools/prerender-locations.mjs's own copy of these two constants so the
// prerendered and hydrated pages agree.
const SECTION_ORDER = ["overview", "visa", "cost", "property", "community", "redflags"];
// The overview chapter is folded into the intro: it renders with the
// portrait block, second on the page after the verdict, not down in the
// chapter run. Content untouched — position only.
const INTRO_SECTION = "overview";

// THE declared-gap set, evaluated ONCE per page load inside main() (see
// below) over every fact row the store holds, by the register's own
// declaredGapFactKeys(). Both of this file's surfaces — the fact rows and
// the route cards — consult this one set; neither restates the predicate,
// and the route card joins by its row's own `threshold_fact_key` because
// derived/visa-routes.jsonl carries no `group_role` column. Empty until
// main() fills it, which is before anything
// renders; an empty set means every [GAP] slot keeps today's words, which
// is the safe direction.
let declaredGapKeys = new Set();

function isDeclaredGap(factKey) {
  return declaredGapKeys.has(factKey);
}

// The index line: its own block-level sibling, FIRST in the sub-line
// stack, immediately after the fact-value div and inside the same
// <li class="fact-item">. `.index-line` is a hook with
// no CSS declarations of its own; it inherits `.fact-notes` entirely.
// Same table, same keys, as the prerendered twin.
function indexLineHtml(factKey) {
  const line = indexLineFor(factKey);
  return line ? `<div class="fact-notes index-line">${escapeHtml(line)}</div>` : "";
}

// A row renders only when its value has a reader string, and until then
// it is HELD FROM RENDER, NOT DROPPED. The build
// throws on an unregistered store token (readerStringFor(), in the
// register); a throw at a reader would be worse than the token, so this
// side drops the row's markup and says so in the console instead.
function heldFromRender(fact) {
  if (!unregisteredStoreToken(fact.value_raw)) return false;
  console.error(
    `reader-strings: no reader string for store value "${fact.value_raw}" — row held from render`,
    fact.fact_key || fact.fact_label || "(unkeyed row)",
  );
  return true;
}

async function main() {
  // Run together, not sequentially: the FX lookup is a best-effort
  // annotation (formatValue()/detectBareCurrency() degrade to showing no
  // USD approx at all if this hasn't resolved or failed), so it must
  // never delay the actual page content behind a second network round
  // trip. loadFxRates() never rejects (every failure path inside it is
  // caught and swallowed), so this Promise.all can't itself throw.
  const [store] = await Promise.all([loadStore(), loadFxRates()]);
  // A4/A5: the reader's weights and their own verdict rows, layered on
  // before anything renders — the same one call every page makes. This is
  // what makes a prerendered location page open in the reader's own
  // perspective after hydration, which is the whole of A4 on this surface.
  applyReaderLens(store);
  // One evaluation, two surfaces (see declaredGapKeys above). factsByKey
  // holds every fact row in the store, one per fact_key, which is exactly
  // the domain the predicate is defined over.
  declaredGapKeys = declaredGapFactKeys([...store.factsByKey.values()]);
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
  renderPerspectiveBlock(store, persona, headerDiv.querySelector("h1"));

  // Top-to-bottom order, superseding the earlier list this comment used
  // to carry — verdict block, section nav, intro (portrait
  // + the folded-in overview chapter), the remaining chapters
  // (collapsed), score breakdown (its own chapter), sources/
  // verify-yourself (chapters), RECENT CHANGE EVENTS, "Where now?". The
  // nav sits ABOVE the intro so its first link (#sec-overview) scrolls
  // forward, never backward; it is kept above the portrait rather than
  // between portrait and overview so the intro stays one unbroken block.
  //
  // Change events used to sit third, directly under the intro. They now
  // sit below every content section, sources included: a dated log of
  // what moved recently answers a question a reader can only have AFTER
  // reading the place itself, so it cannot stand between them and it.
  // "Where now?" stays the page's last element — it is wayfinding, not
  // content, and its own rule (always visible, uncollapsed, at the very
  // bottom) is untouched by this move.
  const facts = store.factsByLocation.get(loc.location_id) || [];
  const bySection = new Map(SECTION_ORDER.map((s) => [s, []]));
  for (const f of facts) {
    const s = sectionForFact(f);
    if (!bySection.has(s)) bySection.set(s, []);
    bySection.get(s).push(f);
  }

  root.appendChild(buildVerdictBlock(store, loc, country, persona));
  root.appendChild(buildSectionNav());
  root.appendChild(buildPortrait(loc));
  root.appendChild(buildSection(INTRO_SECTION, bySection.get(INTRO_SECTION) || [], "", loc.location_id));

  // Part 25.6: the passport lens re-renders the ENTRY LAYER only, inside
  // this one section — nothing else on the page changes under it (25.9's
  // own scope line). `nationalityRow` is null both for "no nationality
  // saved" and "nationality saved, no row for this country" — the two
  // cases render differently (buildPassportStripHtml reads
  // loadNationality() itself to tell them apart), but buildVisaRoutesHtml
  // only needs the resolved row (or null) to know which route cards, if
  // any, carry a gate line.
  const nationality = loadNationality();
  const nationalityRow = nationality ? resolveNationalityTier(store, nationality.code, country.country_id) : null;

  for (const sectionKey of SECTION_ORDER) {
    if (sectionKey === INTRO_SECTION) continue; // already rendered, up in the intro
    const extraHtml = sectionKey === "visa"
      ? buildPassportStripHtml(store, nationality, nationalityRow, country) + buildVisaRoutesHtml(store, country, nationalityRow)
      : "";
    root.appendChild(buildSection(sectionKey, bySection.get(sectionKey) || [], extraHtml, loc.location_id));
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
  // The "Recent change events" section used to render here. The change log
  // is internal — a reader never sees it — so the section is gone rather
  // than shortened. Nothing replaces it: a fact that is still true renders
  // in its own chapter, and the site no longer narrates the rows that
  // dropped.
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

  if (persona === READER_ID) {
    // Door v2, A4: the reader's own verdict block. Three states, the same
    // three the map pin and the Lists row resolve — decided by what the
    // reader gave, never by a default.
    const readerVerdict = resolveVerdict(store, READER_ID, loc);
    const idx = store.personaIndex(READER_ID, loc.location_id);
    const value = idx ? idx.value : null;
    if (readerVerdict) {
      const visual = bandVisual(readerVerdict.overall_band);
      // THE SURFACE OF RECORD for the reader's own read, and the one
      // surface that ENUMERATES: every route that clears, full width,
      // uncapped, biggest clearance first, with the routes that do not
      // clear beneath them. Cap, 2026-10-18 and 2026-10-20; specified in
      // the information-design spec for this crossing, and worded in its copy
      // deck; both are held outside this repo.
      //
      // THE BLOCK'S ORDER, which is the spec's and is not this file's
      // to reshuffle:
      //   1. the country claim — CLAIM ONLY, chip, tier badge, scope tag
      //   2. the disclosure's SCOPE half — what the read covered
      //   3. the cleared routes, income group then capital group
      //   4. the miss line, below them, opening to the full list
      //   5. the could-not-read disclosure, OUTSIDE that widget
      //   6. the disclosure's PASSPORT half (B8, ruled 2026-10-20)
      //   7. the standing gates disclosure, once
      //   8. basisLine, redFlagBadge, renewalLifeExplainerLine(),
      //      insteadLine, breakdownLink — unchanged, all in place
      //
      // B8 PUT ITEM 6 WHERE IT IS. The disclosure used to be one
      // paragraph at position 2, and measured at 390 it was 14 visual
      // lines and ~381px of caveat between the chip and the first route
      // label — the largest single thing standing between a reader and
      // his own figures once the 21-name perspective line was cut. The
      // half that states what the read COVERED stays above the answer,
      // because a reader has to know the scope before he reads a
      // verdict. The half that caveats the read's SOURCING sits below
      // the lists, where it is the consequence of an answer rather than
      // a toll on the way to one. Still inside the block, still on every
      // reader page, nothing hidden.
      //
      // THE LEDGER HAS MOVED OUT OF THE HEADLINE AND INTO THE ITEMS, so
      // this surface calls readerVerdictBlockClaim() rather than
      // stateHeadline(): the figures, the closeness note and the rate
      // line now ride on the route they are about, and the trailing gates
      // disclosure is lifted to a line of its own (item 6) so it cannot
      // vanish when the lead item is conditional. The three compact
      // surfaces still call stateHeadline() and still get the whole
      // sentence, because one route is all they can hold.
      const carry = readerVerdict.reader_margin;
      const clearedGroups = readerClearedGroups(carry);
      const clearedCount = clearedGroups.reduce((n, g) => n + g.items.length, 0);
      const missGroups = readerMissGroups(carry);
      const missCount = missGroups.reduce((n, g) => n + g.items.length, 0);
      const stateText = readerVerdictBlockClaim(
        readerVerdict.overall_state, readerVerdict.reader_bar_kind,
        readerRendersBothClearedLists(carry)
      );
      // The same no-bare-no instead-line every other verdict branch on
      // this page carries, on the same gate: two pointers to content
      // already on this page, zero new facts.
      const insteadLine = visual.eliminated
        ? `<p class="fact-notes">Still open: <a href="#sec-visa">short-stay rules for visiting</a> are below, and <a href="#where-now">other places that scored well for you</a> are at the end of this page.</p>`
        : "";
      // Never shown for a data-gap band — that band already says "not
      // enough to judge", so a tier badge there would imply a tier exists.
      // That is the ONE meaning an empty badge slot carries here, and it
      // stays the only one: the tier a reader row shows is now the tier of
      // the very bar its sentence names, so there is no second case in
      // which a tier exists and is withheld.
      //
      // AND THE SECOND REASON IT CAN BE EMPTY, which is the iff rule: the
      // headline badge renders if and only if NO list item renders one.
      // Measured, mixed tiers inside one list in 3,380 reads and a
      // tier-less lead beside a tiered sibling in 1,070 — so one badge
      // over a five-item list would be a claim about one route standing
      // where a reader reads it as a claim about five. The iff is what
      // keeps the absence single-meaning: a reader never meets an absent
      // headline badge on a page where tiers are present, because if any
      // tier exists it is visible on the item that holds it.
      const tierBadge = (readerVerdict.overall_band === "data_gap" || readerHeadlineBadgeSuppressed(carry))
        ? "" : verdictConfidenceBadge(readerVerdict.confidence_tier);
      // The reader's row is computed once for every location in this
      // country, not for this place specifically — the same disclosure a
      // persona's country-scope row carries, in the same words.
      const scopeNote = `<span class="scope-tag" title="Computed once for every ${escapeHtml(country.name)} location, not this place specifically">(countrywide read)</span>`;
      // Where a route's per-person basis isn't on file, the read DECLARES
      // the assumption instead of refusing on it — the box has no
      // dependents field, so there is nothing for it to refuse with.
      // readerBasisIsAssumed() is the condition, and this is the one
      // surface the reader's verdict already speaks a full sentence on.
      // Measured: no route row carries a basis field, so this renders on
      // every reader verdict today — and stops on its own, row by row,
      // once a real `bar_basis` field lands on the route rows.
      const basisLine = readerBasisIsAssumed(store, loc)
        ? `<p class="fact-notes">${escapeHtml(READER_BASIS_DECLARED_LINE)}</p>`
        : "";
      // ONE ITEM, AND NOTHING IS NUMBERED. A `<ul>`, never an `<ol>`: an
      // ordinal is a ranking claim and would be false on a tie, and ties
      // are the common case — Ecuador's three +190.5% items print the same
      // bar and the same difference, which discloses the tie better than
      // any sentence about ties could. Every part comes off the item's own
      // state and its own summary, so the closeness note, the placement
      // clause, the conditional clause and the tier each render against
      // the route they were computed from.
      const routeItem = (item) => {
        const part = readerRouteItemParts(item);
        const badge = part.confidence ? verdictConfidenceBadge(part.confidence) : "";
        return `<li class="reader-route">`
          + `<span class="reader-route-bar">${escapeHtml(part.label)}</span>${badge}`
          + (part.claim ? `<span class="reader-route-claim">${escapeHtml(part.claim)}</span>` : "")
          // What kind of income this route counts, in the box's own
          // words. Clearing items only, and only for a reader who did
          // not name a kind — both conditions decided upstream.
          + (part.incomeKind ? `<span class="reader-route-kind">${escapeHtml(part.incomeKind)}</span>` : "")
          + (part.ledger ? `<span class="reader-route-ledger">${escapeHtml(part.ledger)}</span>` : "")
          + (part.note ? `<span class="reader-route-note">${escapeHtml(part.note)}</span>` : "")
          + (part.rate ? `<span class="reader-route-rate">${escapeHtml(part.rate)}</span>` : "")
          + `</li>`;
      };
      const routeGroup = (group) => `<div class="reader-route-group">`
        + `<p class="reader-route-label">${escapeHtml(group.label)}</p>`
        + `<ul class="reader-route-list">${group.items.map(routeItem).join("")}</ul>`
        + `</div>`;
      const clearedHtml = clearedGroups.map(routeGroup).join("");

      // THE MISS SIDE: one line, below the cleared list, carrying the
      // count and the nearest miss with its shortfall — and it OPENS to
      // the full list. Cap's own words, 2026-10-20: "The page never says
      // nothing opens without saying what would."
      //
      // OPEN ON ARRIVAL WHERE NOTHING CLEARS — Cap's B6, yes. THIS IS THE
      // LINE THAT SETS IT: `clearedCount === 0`. A reader whose answer is
      // "nothing opens" should not have to click to find out how close he
      // came, and that is ~9,600 reads across every country carrying
      // routes. Where something does clear, the widget arrives closed and
      // the answer is what is open.
      //
      // WHAT THIS KNOWINGLY COSTS, built as specified rather than
      // designed around: under an open-on-arrival widget the nearest miss
      // PRINTS TWICE — once in the summary line Cap ruled must carry it,
      // once as the first item of the list directly beneath, the same
      // figure. The copy deck declined to fix it by dropping the figure from the
      // summary, because the closed state is one click away and a summary
      // that loses its shortfall on collapse breaks the requirement in
      // the state it was written for. So the repetition ships, visibly,
      // to be priced off a real screen by the seats that ruled it. The
      // writer's view, recorded:
      // if it goes, the honest cut is the list's first item, never the
      // ruled summary.
      //
      // THE LABEL IS CSS-SWITCHED, NOT SCRIPTED: both strings are in the
      // DOM and `details[open]` picks which one shows. No event wiring, so
      // the label cannot fall out of step with the widget's actual state —
      // and the closed label is the one a reader without CSS meets, which
      // is the honest default because it names what is inside.
      const missLabels = readerMissToggleLabels(carry);
      const missSummary = readerMissSummary(readerVerdict.overall_state, carry);
      // THE SUMMARY SAYS TWO DIFFERENT THINGS IN ITS TWO STATES, and both
      // are in the DOM with `details[open]` picking between them — the
      // same CSS mechanism the two labels already use, and deliberately
      // NOT a toggle listener. A listener can fall out of step with the
      // widget's real state; a selector cannot, and this block re-renders
      // in place when the reader changes their figures. So the
      // state-neutral fallback is not needed: the closed state keeps the
      // figure Cap's ruling put there, and the open state drops it
      // because the first item one line below is already printing it.
      const missHtml = missCount
        ? `<details class="reader-miss"${clearedCount === 0 ? " open" : ""}>`
          + `<summary><span class="reader-miss-line">`
          + `<span class="reader-miss-closed">${escapeHtml(missSummary.closed)}</span>`
          + `<span class="reader-miss-open">${escapeHtml(missSummary.open)}</span>`
          + `</span> <span class="reader-miss-toggle">`
          + `<span class="reader-miss-toggle-closed">${escapeHtml(missLabels.closed)}</span>`
          + `<span class="reader-miss-toggle-open">${escapeHtml(missLabels.open)}</span>`
          + `</span></summary>`
          + missGroups.map(routeGroup).join("")
          + `</details>`
        : "";

      // POPULATION 3, OUTSIDE THE WIDGET AND AT THE SAME LEVEL AS THE MISS
      // LINE. Cap, 2026-10-20: "unread routes are not noes." The widget
      // counts noes; a route the site could not read is ignorance, not a
      // no, and a reader who opens a list of eight noes must not then
      // discover that eleven routes nobody read were never mentioned —
      // Thailand reaches exactly that, all eleven of its route rows, on a
      // reachable read. This line is why the count in the widget can
      // honestly exclude them.
      //
      // WHERE NOTHING CLEARS AND NOTHING MISSES there is no shortfall in
      // existence to show, and the page must still not be read as a no:
      // the deck's two declaratives render instead of the count line. That is
      // 39.6% of reads, 2.6 times the population Cap's own sentence was
      // written against. What WOULD change it is already on the page in
      // the engine's own cause sentence, which is the chip above.
      const nothingRead = clearedCount === 0 && missCount === 0;
      const unreadText = nothingRead
        ? READER_NOTHING_READ_LINE
        : readerUnreadLine(carry, { clearedPresent: clearedCount > 0 });
      const unreadLine = unreadText
        ? `<p class="reader-unread-line">${escapeHtml(unreadText)}</p>`
        : "";

      // The cause clauses leave the pill on this surface only. At
      // Thailand that is a 250-character paragraph inside a coloured
      // lozenge becoming a 49-character claim with its reasons in body
      // ink beneath it — and on the one band where the pill is the whole
      // answer, the pill also stops being white on sand (1.41:1) and
      // becomes ink on it (12.18:1 light, 12.53:1 dark). Same words,
      // same order, two containers.
      const causeLine = readerVerdictBlockCauses(readerVerdict.overall_state, readerVerdict.reader_bar_kind);
      const causeHtml = causeLine ? `<p class="reader-cause-line">${escapeHtml(causeLine)}</p>` : "";
      div.innerHTML = `
        <p class="verdict-headline">${verdictChipMarkup(visual.color, stateText, null, { gapBand: visual.gap })}${tierBadge}${scopeNote}</p>
        ${causeHtml}
        <p class="verdict-prose">${escapeHtml(READER_VERDICT_DISCLOSURE_SCOPE)}</p>
        ${clearedHtml}
        ${missHtml}
        ${unreadLine}
        <p class="verdict-prose reader-passport-line">${escapeHtml(READER_VERDICT_DISCLOSURE_PASSPORT)}</p>
        <p class="reader-gates-line">${escapeHtml(READER_GATES_DISCLOSURE_LINE)}</p>
        ${basisLine}
        ${redFlagBadge}
        ${renewalLifeExplainerLine()}
        ${insteadLine}
        ${breakdownLink}
      `;
    } else if (hasReaderVerdicts(store)) {
      // One of the countries the box has not read. This replaces an
      // earlier line that carried TWO false things for one real reader:
      //
      //   (a) "(general figures)" was appended to a headline built from
      //       personaIndex(READER_ID, ...), which IS the reweighted value
      //       whenever the reader gave priorities. A false label on a real
      //       number, on all 26 unread-country pages. The suffix now
      //       resolves exactly as the third branch below already resolves
      //       it.
      //   (b) "the general figures above apply unchanged" is wrong for
      //       that same reader for the same reason.
      //
      // What survives untouched is the sentence's job: name the cause,
      // never imply a judgement about the place.
      // Both resolve unconditionally now: the weighted readings were gated
      // on the reader's own stored weight vector, which is retired, and
      // the general phrasings were already written beside them.
      const readSuffix = "general figures";
      const readSuffixPhrase = "the general figures";
      div.innerHTML = `
        <p class="verdict-headline">${escapeHtml(buildFitHeadline(store, null, loc, country, value))} (${escapeHtml(readSuffix)})</p>
        <p class="verdict-prose">Not checked yet for you at this location — this box hasn't read this country's residence routes against your figures, so nothing here is a read or a verdict. The Fit index above is ${escapeHtml(readSuffixPhrase)} and stands on its own.</p>
        ${redFlagBadgeGeneral}
        ${breakdownLinkGeneral}
      `;
    } else {
      // The reader gave no figures (a passport only, or said "a visit"):
      // no eligibility read exists for them anywhere, so the honest-gap
      // voice the site already ships, fed the value that actually ranked
      // this place. The suffix is the general one in every case — the
      // alternative named the reader's own priorities and retired with
      // them.
      const suffix = " (general figures)";
      div.innerHTML = `
        <p class="verdict-headline">${escapeHtml(buildFitHeadline(store, null, loc, country, value))}${suffix}</p>
        ${redFlagBadge}
        ${breakdownLink}
      `;
    }
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
        <p class="verdict-headline"><span class="verdict-chip" style="background:${v.color}">${escapeHtml(v.label)}</span> ${verdictProvenanceBadge(true, displayName)}</p>
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
        const stateText = stateHeadline(engineVerdict.overall_state);
        // The fixture branch above's v5/v7 no-bare-no
        // instead-line, extended to the engine-only case. The line is pure
        // page navigation (two anchors already on this page) with no
        // fixture-specific content, so it transports verbatim — gated on
        // bandVisual()'s own `eliminated` flag, the engine's equivalent of
        // verdictVisual()'s `kind === "eliminated"` above.
        // Part 24.3: widened per §13.9's own reasoning — a composed case
        // whose deciding group is the visit layer (overall_band
        // "uncertain_or_conditional", not "hard_fail") has the identical
        // practical need as a true hard-fail reader ("nowhere to convert
        // to residency"), so `visual.eliminated` alone would silently skip
        // this reader. Zero new content — same two anchors, only the gate
        // condition widens.
        const insteadLine = (visual.eliminated || !!engineVerdict.companion_disclosure)
          ? `<p class="fact-notes">Still open: <a href="#sec-visa">short-stay rules for visiting</a> are below, and <a href="#where-now">other places that scored well for you</a> are at the end of this page.</p>`
          : "";
        // Sourcing-confidence tier for this verdict, same three-value
        // vocabulary as the per-fact badges elsewhere on this page. Never
        // shown for a data-gap band — that band already says "not enough to
        // judge," so a tier badge there would wrongly imply a tier exists.
        const tierBadge = engineVerdict.overall_band === "data_gap"
          ? "" : verdictConfidenceBadge(engineVerdict.confidence_tier);
        // Part 23.5 / §8Q item 4: never render the raw word "scope" —
        // disclose the effect instead. A "country" scope row is computed
        // once for every location in that country (not this place
        // specifically), so a single-location page showing it needs to say
        // so, not let the reader assume it was checked at this exact
        // place. A "location" scope row (Part 37, this build) needs no
        // such disclosure — it WAS computed for this exact place.
        // PLACEHOLDER WORDING, not final copy — needs a register pass
        // before shipping; flagged in the build report.
        const scopeNote = engineVerdict.scope === "country"
          ? `<span class="scope-tag" title="Computed once for every ${escapeHtml(country.name)} location, not this place specifically">(countrywide read)</span>`
          : "";
        // Part 24.3: §13.9's mandatory companion disclosure, when it
        // fires, as its OWN paragraph directly under the headline and
        // BEFORE the generic verdictDisclosureSentence paragraph below —
        // the specific, load-bearing finding reads before the general
        // methodology boilerplate. Verbatim from the engine's own
        // `companion_disclosure` field (the ratified §13.9 item 2
        // sentence), not reworded here.
        const companionParagraph = engineVerdict.companion_disclosure
          ? `<p class="verdict-prose">${escapeHtml(sentenceCaseRuleParagraph(engineVerdict.companion_disclosure))}</p>`
          : "";
        // Part 37: the location-scope gate-provenance block ("This
        // location" — cost/property/safety/education, whichever apply),
        // directly under the headline+companion paragraph, same position
        // Part 36's own (not yet built) national coverage line would
        // occupy once it ships — see this build's own report for that
        // sequencing note. No-op (returns "") for scope="country" rows.
        const gateProvenance = locationGateProvenanceHtml(store, engineVerdict, persona, country, loc);
        div.innerHTML = `
          <p class="verdict-headline">${verdictChipMarkup(visual.color, stateText, engineVerdict.companion_disclosure)} ${verdictProvenanceBadge(false, displayName)}${tierBadge}${scopeNote}</p>
          ${companionParagraph}
          ${gateProvenance}
          <p class="verdict-prose">${escapeHtml(verdictDisclosureSentence(displayName))}</p>
          ${redFlagBadge}
          ${renewalLifeExplainerLine()}
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
      // by design (the Waldo/Wenda/Carmen stale-fade tension is known
      // and deliberately left untouched here).
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
        const stateText = stateHeadline(engineVerdict.overall_state);
        // Same instead-line extension as the branch above (Waldo/Wenda/
        // Carmen's own no-fixture-at-this-location case), same Part 24.3
        // widening — see that branch's own comment for the reasoning.
        const insteadLine = (visual.eliminated || !!engineVerdict.companion_disclosure)
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
        // Same Part 24.3 companion-disclosure paragraph as the branch above.
        const companionParagraph = engineVerdict.companion_disclosure
          ? `<p class="verdict-prose">${escapeHtml(sentenceCaseRuleParagraph(engineVerdict.companion_disclosure))}</p>`
          : "";
        // Same Part 37 gate-provenance block as the branch above — see its
        // comment.
        const gateProvenance = locationGateProvenanceHtml(store, engineVerdict, persona, country, loc);
        div.innerHTML = `
          <p class="verdict-headline">${verdictChipMarkup(visual.color, stateText, engineVerdict.companion_disclosure)} ${verdictProvenanceBadge(false, displayName)}${tierBadge}${scopeNote}</p>
          ${companionParagraph}
          ${gateProvenance}
          <p class="verdict-prose">${escapeHtml(verdictDisclosureSentence(displayName))}</p>
          ${redFlagBadge}
          ${renewalLifeExplainerLine()}
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
    //
    // The index renders in this state rather than waiting for the box to
    // be filled, and it says whose weighting it is while it is not yet the
    // reader's — the no-lens state naming itself, per the
    // perspective-disclosure law. The string is canonical in app-shared.js
    // so the prerendered no-JS twin can carry the identical sentence.
    const general = store.generalIndex(loc.location_id);
    const headline = buildFitHeadline(store, null, loc, country, general ? general.value : null);
    // One line, not two: the saved-priorities variant retired with the
    // population that could reach it. This is now the same sentence the
    // prerendered no-JS twin emits, in every state.
    const weightingLine = FIT_INDEX_DEFAULT_WEIGHTING_LINE;
    div.innerHTML = `
      <p class="verdict-headline">${escapeHtml(headline)}</p>
      <p class="verdict-prose">${escapeHtml(weightingLine)}</p>
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
    <p class="portrait-teaser">${escapeHtml(data.hook)}${data.number ? ` — ${escapeHtml(data.number)}` : ""}</p>
  `;
  return div;
}

// Part 23.7: one fact-item <li>, byte-for-byte the same shape
// buildSection()'s own plain-facts list already uses (confidenceBadge() +
// sourceDetailHtml() + notes, suppressGapText since a badge sits right
// alongside per 23.3) — extracted here so the receipts panel below reuses
// it instead of hand-copying a second markup shape for the same claim.
function factItemHtml(f) {
  if (heldFromRender(f)) return "";
  // Addendum A §A.1: ONE boolean, two slots. The value slot and the chip are
  // both fed from this local so they can never disagree about the row's state
  // the way a phrase-keyed dedupe did.
  const dg = isDeclaredGap(f.fact_key);
  return `
      <li class="fact-item">
        <div class="fact-label">${escapeHtml(f.fact_label)}</div>
        <div class="fact-value">${escapeHtml(formatValue(f, { suppressGapText: true, declaredGap: dg }))}</div>
        ${indexLineHtml(f.fact_key)}
        <div class="fact-meta">${confidenceBadge(f, { declaredGap: dg })} ${divergenceBadge(f)}</div>
        <div class="source-detail">${sourceDetailHtml(f)}</div>
        ${f.notes ? `<div class="fact-notes">${escapeHtml(f.notes)}</div>` : ""}
      </li>`;
}

// Part 23.7: the score-receipts panel's own content, lazy-built on first
// expand (never pre-rendered — a reader who doesn't open any chip pays
// zero byte cost for this feature). "Evidence on file," never "what built
// this number": the join (every fact tagged with this criterion_id at this
// location) is real and computable today, but not proven causal for an
// already-existing score — the header/footer wording says exactly that,
// nothing stronger.
function buildReceiptPanelHtml(store, crit, loc) {
  const facts = (store.factsByLocation.get(loc.location_id) || [])
    .filter((f) => f.criterion_id === crit.criterion_id)
    // Most-recently-checked first — an available, non-interpretive field
    // (recency), not a claim about which fact contributed most. Plain
    // string comparison: dates on file mostly share the YYYY-MM-DD-leading
    // shape; a handful of free-text dates ("2026 (early)") sort by that
    // same lexical rule as everywhere else this file already compares
    // dates (buildSourcesSection above), not a new convention.
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const header = `<p class="receipt-header"><strong>Evidence on file — ${escapeHtml(crit.name)} at ${escapeHtml(loc.display_name)}</strong></p>`;
  const criteriaHref = withPersona(siteUrl(`criteria.html#${crit.criterion_id}`));
  const globalLink = `<p class="fit-link-line"><a href="${criteriaHref}">What does ${escapeHtml(crit.name)} mean, in general? &rarr;</a></p>`;
  if (!facts.length) {
    return `${header}<p class="fact-notes">No facts on file for ${escapeHtml(crit.name)} here yet — we haven't done that digging.</p>${globalLink}`;
  }
  const LEAD_COUNT = 3;
  const lead = facts.slice(0, LEAD_COUNT);
  const rest = facts.slice(LEAD_COUNT);
  const restHtml = rest.length
    ? `<button type="button" class="receipt-more-toggle" aria-expanded="false">+${rest.length} more fact${rest.length === 1 ? "" : "s"} on file</button>
       <ul class="fact-list receipt-more-list" hidden>${rest.map(factItemHtml).join("")}</ul>`
    : "";
  const scopeLine = `<p class="fact-notes receipt-scope-line">These are the facts on file for ${escapeHtml(crit.name)} here — the evidence behind the number, not a line-by-line calculation of it.</p>`;
  return `${header}<ul class="fact-list">${lead.map(factItemHtml).join("")}</ul>${restHtml}${scopeLine}${globalLink}`;
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
  // Part 23.1/23.7: the chip's own explain-link used to sit at the
  // boundary between two adjacent, independently-bordered chips (no
  // explicit width on either) — close enough to read as ambiguous about
  // which chip it belonged to, the exact collision a screenshot review
  // circled. Fixed as one build, not two: `.criterion-chip` gets an
  // explicit flex-basis (css/style.css) so each chip claims its own
  // column, and the old <a> is replaced by a toggle button pinned to
  // *this chip's own* right edge (margin-left: auto, same rule) — there is
  // no longer a second bordered control riding the boundary between
  // chips. The toggle also answers a different, more useful question
  // first: not "what does this mean in general" but "why is THIS place a
  // 2" — the local receipts panel, global definition moved one click
  // deeper inside it (23.7's own two-questions framing).
  const chips = store.criteria.map((crit) => {
    const scoreRow = scoreRows ? scoreRows.get(crit.criterion_id) : null;
    const fixtureRow = personaFixtures ? personaFixtures.get(crit.criterion_id) : null;
    let val, swatch, tag = "";
    if (fixtureRow) { val = Number(fixtureRow.expected); tag = ` (${personaLabel})`; }
    else if (scoreRow && scoreRow.status === "scored") { val = scoreRow.score; }
    else { val = null; }
    swatch = scoreToColor(val);
    // The pending-ruling disclosure -- a marker on any criterion whose
    // reader_dependency reads "pending-ruling" (today: Community & social
    // fabric only), reusing .scope-tag verbatim (the existing "small
    // italic muted annotation beside a value" class). Zero new claim: this
    // renders only when the field is actually present and set, so it's a
    // silent no-op wherever the export a page loads from doesn't carry it.
    const pendingTag = crit.reader_dependency === "pending-ruling"
      ? ` <span class="scope-tag" title="Several distinct facts folded into one number — see the note above">${escapeHtml(READER_DEPENDENCY_PENDING_LABEL)}</span>`
      : "";
    // Own word choice, same craft-latitude tier as every other short UI
    // control label on this site — matches the existing "breakdown"/"hide"
    // toggle idiom (lists.js) exactly, rather than inventing a new one.
    return `<span class="criterion-chip">
      <span class="fit-swatch" style="background:${swatch}" ${RAMP_VALUE_ATTR}="${val == null ? "" : val}" ${RAMP_KIND_ATTR}="score"></span>
      ${escapeHtml(crit.name)}: ${val != null ? val + "/5" : "gap"}${tag}${pendingTag}
      <button type="button" class="expand-toggle criterion-receipt-toggle" aria-expanded="false" data-criterion-id="${crit.criterion_id}">evidence</button>
      </span><div class="receipt-panel" hidden></div>`;
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

  // Part 23.7: lazy render on first expand only — the panel element
  // already exists (empty, hidden) from the template above; content is
  // built and inserted the first time its own toggle is clicked, never
  // before, confirmed by construction (no .receipt-panel markup is
  // present until then — the panel-content build only ever runs inside
  // this listener).
  details.querySelectorAll(".criterion-receipt-toggle").forEach((btn) => {
    const critId = btn.dataset.criterionId;
    const crit = store.criteriaById.get(critId);
    const panel = btn.closest(".criterion-chip").nextElementSibling;
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") === "true";
      if (!open && !panel.dataset.built) {
        panel.innerHTML = buildReceiptPanelHtml(store, crit, loc);
        panel.dataset.built = "1";
        const moreToggle = panel.querySelector(".receipt-more-toggle");
        if (moreToggle) {
          // Copy, Part 23.7: "+{N} more facts on file" closed, "Show
          // fewer" open — the closed label is saved once, up front, so
          // toggling back and forth never has to reconstruct it.
          const closedLabel = moreToggle.textContent;
          moreToggle.addEventListener("click", () => {
            const moreOpen = moreToggle.getAttribute("aria-expanded") === "true";
            const moreList = panel.querySelector(".receipt-more-list");
            moreList.hidden = moreOpen;
            moreToggle.setAttribute("aria-expanded", String(!moreOpen));
            moreToggle.textContent = moreOpen ? closedLabel : "Show fewer";
          });
        }
      }
      panel.hidden = open;
      btn.setAttribute("aria-expanded", String(!open));
      btn.textContent = open ? "evidence" : "hide";
    });
  });
  return details;
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
// a tooltip, or Lists; (3) the consequence line renders only when the
// published data carries a consequence. The former named-gap fallback
// string (v5's "...isn't researched yet.") was removed once `notes` left
// the published export: it would have asserted "not researched" over
// consequences that HAD been researched and were simply no longer
// published. Silence is the honest empty state here, matching the same
// absent-note discipline the plain fact rows already use.
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
    // (c) the real, sourced consequence if researched. If it isn't in the
    // published data, this line renders nothing at all — say nothing rather
    // than say something false. Never a severity invented to fill the gap.
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
        ${consequence ? `<div class="fact-notes">${escapeHtml(consequence)}</div>` : ""}
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
// THE FOUR READER STRINGS THAT SAT HERE ARE GONE, and the comment above
// is NOT about them — it is about the overview-then-detail rendering
// order, a different and still-open judgement call, which is why it
// stays. What sat here was a private strings table on one render path:
// `INCOME_TYPE_LABEL`, four store values mapped to four reader
// sentences, in no copy deck and gated by nobody, one of which (its
// `supplementary_only` entry) contradicted the ratified wording for the
// same store value. The four dead strings are deliberately NOT restated
// here, not even as an example: a verbatim grep for them across js/ and
// tools/ has to come back empty, and a comment quoting one would defeat
// it. They are replaced by js/reader-strings.js — THE register, read by
// this file, by js/app-shared.js, and by tools/prerender-locations.mjs.
// The route-card path reads the same table as everything else.

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
    // THE OLD COMMENT HERE WAS FALSE AND COST EVERY ROUTE CARD ITS
    // CITATION. It claimed visa-routes.jsonl "carries source_ref (a
    // filename), never a URL". Measured on the shipped file: 100 of its
    // 101 rows carry a real `source_url`, and `source_ref` is stripped on
    // export precisely so `source_url` can be the public trust layer. The
    // hard-coded null sent all 101 cards down sourceDetailHtml()'s
    // no-link fallback, so a reader could read a threshold and never
    // reach the page it came from.
    //
    // PASSED THROUGH FOR ':route:' ROWS ONLY, AND THE RESTRICTION IS THE
    // WHOLE CORRECTNESS ARGUMENT, not caution. The view builds a
    // ':route:' row around ONE fact row — the one whose group_role is
    // 'threshold' — and takes that row's label, its value, its unit, its
    // confidence, its date AND its source_url together. So on a ':route:'
    // card the link certifies exactly the figure printed above it: one
    // fact, one citation. That is the only claim this helper makes.
    //
    // A ':visit:' row is built the other way round: it has no threshold
    // row at all, and its provenance fields are COALESCEd across up to
    // four different companion facts (restricted/eligible nationality
    // list, max duration, renewability) whose values the card never
    // prints. Measured: 9 of the 42 ':visit:' rows carry more than one of
    // those companions, and MA:visit:visa-free-entry--most-nationalities
    // carries two genuinely DIFFERENT urls — the duration fact cites one
    // site, the nationality fact another, and the coalesce silently picks
    // the nationality one. Linking that under a bare de-slugged category
    // name would tell a reader "here is the source for this" while
    // pointing at a page that may not carry the thing they came to check.
    // Those rows therefore keep the existing no-link wording, unchanged
    // from what ships today; which fact a ':visit:' citation belongs to
    // is a schema question routed to the data layer, not one to settle in
    // a render helper.
    //
    // `|| null` is not decoration: one row (AR:route:digital-nomad-visa)
    // omits the key entirely, and the fallback must be a missing-link
    // state, never an empty href. That row is also the only ':route:' row
    // whose threshold reads "[GAP]", and sourceDetailHtml() returns ""
    // before it ever looks at a url, so today it renders no source line
    // whatsoever — but the guard is what keeps that true if the threshold
    // is ever filled in while the url is still absent.
    source_url: isVisitRoute(r.route_key) ? null : (r.source_url || null),
    date: r.date,
    divergence_flag: r.divergence_flag,
  };
}

// Bug fix: a route_key of shape `{country_id}:visit:{slug}`
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

// Part 25.6: the entry-tier display phrases, all five ruled tokens
// (§8Z's own `entry_tier_kind` enum). `suspended` is handled entirely
// separately (buildPassportSuspendedHtml, 25.7) — it's a register
// obligation, not a phrase variant, so it never reaches this function.
function entryTierPhrase(row) {
  const days = row.entry_max_days;
  // "when null, no day count renders — never '0 days,' never a guessed
  // number" — §8Z's own null-semantics, honored render-side.
  const daysSuffix = days != null ? `, up to ${days} days` : "";
  switch (row.entry_tier_kind) {
    case "exempt": return `visa-free entry${daysSuffix}`;
    case "visa-on-arrival": return `visa on arrival${daysSuffix}`;
    case "evisa": return `eVisa required before travel${days != null ? `, up to ${days} days granted` : ""}`;
    case "visa-required": return "visa required before travel — apply at an embassy or consulate first";
    default: return row.entry_tier_kind;
  }
}

// Part 25.7: the `suspended` render — plain mechanism, scope, and date,
// nothing else. Visual register: the existing hard-fail token
// (eliminatedColor()), words-first, always-visible — never theatrical
// (no icons, no exclamation marks, no sympathy-performance). No
// editorializing about WHY a suspension exists — this renders exactly
// what the fact row carries, verbatim-or-silent.
function buildPassportSuspendedHtml(row, country) {
  const sentence = `Entry through ${country.name}'s ordinary visa channels is currently suspended for your passport. Verified ${row.last_verified_date}.`;
  let html = `<p class="passport-strip-line passport-strip-suspended" style="color:${eliminatedColor()};font-weight:600">${escapeHtml(sentence)}</p>`;
  if (row.document_conditional_note) {
    html += `<p class="passport-strip-line passport-strip-note">${escapeHtml(row.document_conditional_note)}</p>`;
  }
  return html;
}

// Part 25.6: the passport strip — the governing render rule is that its
// OWN render condition is the reader's state (a nationality is saved),
// never the table's (a row exists for it). No nationality saved changes
// NOTHING on this page (the existing general-foundation render is
// already a disclosed no-lens state via the persona-block's own blurb
// line) — this function returns "" in that case, not a phantom
// "select a passport" nag.
//
// The "how we know" receipt affordance §8Z's own `fact_key` column is
// meant to wire (the score-receipts idiom, one interaction away) is
// deliberately NOT built here: a direct check this session found every
// one of the 11 fact_key values on file in derived/nationality-tiers-
// public.jsonl point at a fact that does not exist anywhere in this
// repo's own derived/facts/*.jsonl — a real, systemic data-layer gap
// (not something this seat authors a fix for), flagged to the owning
// specialist rather than built as a dead click target. The mandatory
// claim itself (the date) still renders as plain text either way,
// satisfying §15.3's own literal requirement.
function buildPassportStripHtml(store, nationality, nationalityRow, country) {
  if (!nationality) return "";
  const nationalityName = ISO_COUNTRY_NAMES[nationality.code] || nationality.code;
  const lines = [`<section class="passport-strip"><h4 class="passport-strip-heading">Your passport (${escapeHtml(nationalityName)})</h4>`];

  if (!nationalityRow) {
    lines.push(`<p class="passport-strip-line">Entry rules aren't yet verified for your passport — what you see below is the general foreign-national picture.</p>`);
  } else if (nationalityRow.entry_tier_kind === "suspended") {
    lines.push(buildPassportSuspendedHtml(nationalityRow, country));
  } else {
    const tierPhrase = entryTierPhrase(nationalityRow);
    lines.push(`<p class="passport-strip-line">Your passport: ${escapeHtml(tierPhrase)}. Verified ${escapeHtml(nationalityRow.last_verified_date)}.</p>`);
    if (nationalityRow.document_conditional_note) {
      lines.push(`<p class="passport-strip-line passport-strip-note">${escapeHtml(nationalityRow.document_conditional_note)}</p>`);
    }
  }

  // Item 5: the never-silence rule for route-gate absence, at strip
  // level, once — not per card. Fires whenever a nationality is selected
  // AND at least one documented route on this country's own list carries
  // no gate line (true for every route on file today — route_gates is
  // empty on every row currently exported, a real and expected state,
  // not a bug this build introduces).
  const routes = store.visaRoutesByCountry.get(country.country_id) || [];
  if (routes.length) {
    const gateKeys = new Set((nationalityRow?.route_gates || []).map((g) => g.group_key));
    const routeKeys = new Set(routes.map((r) => r.route_key));
    const hasGatelessRoute = [...routeKeys].some((k) => !gateKeys.has(k));
    if (hasGatelessRoute) {
      lines.push(`<p class="passport-strip-line passport-strip-note">Routes below that don't mention your passport haven't had their nationality rules checked for it yet.</p>`);
    }
  }

  lines.push("</section>");
  return lines.join("");
}

// Part 25.6 item 4: one route-eligibility line per card, where a
// `route_gates` entry exists for that route's own key. `gate0_result`
// membership semantics are the engine's own (§13.2's Gate 0, imported by
// the export, never re-implemented) — this is a pure lookup-and-render,
// no eligibility logic runs here. Both outcomes render at the SAME visual
// weight (no muting on the ineligible line) — a red-flag-class finding
// gets the same prominence discipline as a strength, per the spec's own
// instruction.
function passportGateLineHtml(nationalityRow, routeKey) {
  if (!nationalityRow) return "";
  const gate = (nationalityRow.route_gates || []).find((g) => g.group_key === routeKey);
  if (!gate) return "";
  const ineligible = gate.gate0_result === "confirmed-ineligible";
  const label = ineligible
    ? "Not open to your passport under this route's nationality rules."
    : "Open to your passport under this route's nationality rules.";
  const style = ineligible ? ` style="color:${eliminatedColor()};font-weight:600"` : ` style="font-weight:600"`;
  return `<div class="fact-notes passport-gate-line"${style}>${escapeHtml(label)}</div>`;
}

function buildVisaRoutesHtml(store, country, nationalityRow = null) {
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
    const routeKey = group[0].route_key;
    // One route_key can hold several threshold rows (Thailand's LTR
    // categories, Egypt's three real-estate tiers). Those rows carry the
    // SAME documentation_shape text where they carry one at all — measured:
    // all 3 EG:route:real-estate-investment-residency rows are identical —
    // so it is rendered once per card, at the first row that has it, rather
    // than three times verbatim under three <hr>s. Distinct texts within one
    // card would still each render; none exist today.
    const seenDocShapes = new Set();
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
      // THE REGISTER, not a private table, and no `|| raw` fallback: an
      // unregistered store value is HELD FROM RENDER (the line is simply
      // not emitted) rather than leaked as vocabulary, which is what the
      // old `|| r.income_type_passive` tail did. The build-side throw is
      // the loud half of the same rule.
      if (r.income_type_passive) {
        const s = STORE_VALUE_STRINGS[r.income_type_passive];
        if (s) notes.push(`<div class="fact-notes">Passive income treatment: <strong>${escapeHtml(s)}</strong></div>`);
        else console.error(`reader-strings: no string for income_type_passive "${r.income_type_passive}" on ${r.route_key}`);
      }
      if (r.income_type_pension) {
        const s = STORE_VALUE_STRINGS[r.income_type_pension];
        if (s) notes.push(`<div class="fact-notes">Pension income treatment: <strong>${escapeHtml(s)}</strong></div>`);
        else console.error(`reader-strings: no string for income_type_pension "${r.income_type_pension}" on ${r.route_key}`);
      }
      // age_gate "0" is the one real case on file (Thailand's Privilege
      // visa) and reads as this schema's own floor value, not a genuine
      // "must be over 0" finding — rendering it as a real age would
      // manufacture a claim nobody researched. Omitted rather than
      // guessed at, same honest-omission convention this page already
      // uses elsewhere (e.g. a zero-red-flag location shows no badge at
      // all rather than "0 red flags").
      if (r.age_gate && r.age_gate !== "0") {
        // "[GAP]" is a gap marker, not an age. Rendering it raw shipped
        // "Minimum age: [GAP] years" on 21 routes across 9 countries;
        // it takes the same wording the sibling fields above already use.
        const ageText = r.age_gate === "[GAP]"
          ? "Not yet researched"
          : `${escapeHtml(r.age_gate)} years`;
        notes.push(`<div class="fact-notes">Minimum age: <strong>${ageText}</strong></div>`);
      }
      // `documentation_shape` — what this route asks an applicant to PRODUCE,
      // as opposed to what it asks them to earn. Substance, not overhead: a
      // route a reader clears on income can still be unreachable on paperwork
      // (an apostilled police certificate from a country you left, a
      // consular-legalized bank history), and until now the field reached no
      // reader at all — it is in derived/visa-routes.jsonl and nothing
      // rendered it.
      //
      // Site-wide, every country, on the same terms as its sibling fields
      // above: 34 of 95 route rows carry one, across 11 countries. The other
      // 61 do not carry the key at all, and render NOTHING — no label, no
      // empty bullet, no "not available" line. An absent shape is an
      // un-researched gap, and a gap stated in a bullet is still a bullet.
      //
      // Rendered as prose on its own line, not as an inline value: these run
      // 323-1,384 characters (median 578), which no `<strong>` tail can hold
      // legibly. Text is rendered exactly as stored, escaped, never trimmed
      // to a summary — a documentation list with an item silently dropped is
      // worse than none.
      const docShape = typeof r.documentation_shape === "string" ? r.documentation_shape.trim() : "";
      if (docShape && !seenDocShapes.has(docShape)) {
        seenDocShapes.add(docShape);
        notes.push(`<div class="fact-label route-doc-label">What this route asks you for</div><p class="route-doc">${escapeHtml(docShape)}</p>`);
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
      // Addendum A §A.2 RETIRES the earlier "front of the notes array"
      // reading: on THIS template the notes array is not adjacent to the
      // value — `.fact-meta` and `.source-detail` sit between them — so
      // front-of-notes delivered the opposite of its own stated reason
      // ("This bar" needs the line directly under its own row's value).
      // Child order is now the same on every surface a reader meets:
      // .fact-label → .fact-value → .fact-notes.index-line → .fact-meta
      // → .source-detail → notes.
      // HARD INVARIANT: the line goes BEFORE `.fact-meta`, never between
      // `.fact-meta` and `.source-detail` — toggleSourceDetail() finds the
      // panel as `.fact-meta`'s nextElementSibling, so that placement would
      // silently kill the source toggle on every row that has one.
      // Joined on this row's own `threshold_fact_key`: the same table every
      // other surface reads, reached through the row's own pointer at the fact.
      const indexLine = indexLineHtml(r.threshold_fact_key);
      const visit = isVisitRoute(r.route_key);
      const label = visit ? routeCategoryLabel(r.route_key) : r.threshold_label;
      // Addendum A §A.1: ONE boolean, two slots — load-bearing here above all,
      // because formatValue() is keyed on `r.threshold_fact_key` while
      // confidenceBadge() is handed the synthesised `asFact`. Two different
      // inputs deciding one row's two slots is the defect class this removes.
      const dg = isDeclaredGap(r.threshold_fact_key);
      const valueHtml = visit ? "" : `<div class="fact-value">${escapeHtml(formatValue(asFact, { suppressGapText: true, declaredGap: dg }))}</div>`;
      return `
        <div class="fact-label">${escapeHtml(label)}</div>
        ${valueHtml}
        ${valueHtml ? indexLine : ""}
        <div class="fact-meta">${confidenceBadge(asFact, { declaredGap: dg })} ${divergenceBadge(asFact)}</div>
        <div class="source-detail">${sourceDetailHtml(asFact)}</div>
        ${notes.join("")}
      `;
    }).join("<hr>");
    return `<div class="fact-item">${rowsHtml}${passportGateLineHtml(nationalityRow, routeKey)}</div>`;
  }).join("");
  return `
    <h3>Visa routes at a glance</h3>
    <p class="fact-notes">Every documented route into ${escapeHtml(country.name)}, compared side by side — the general figures, not read against anyone in particular. Only the verdict above is read for whoever this page is shown for, where there is one. The full write-up for each, with sourced notes, is right below.</p>
    <div class="fact-list">${cards}</div>
  `;
}

// ---------------------------------------------------------------------
// Reader sentences inside a chapter. Specified by the reader-sentence
// placement spec, its §2.3 and §5, as amended by Cap 2026-10-04 — the
// amendment's own words and the head/foot shape it forces are documented
// once, in js/portraits.js's own header, and not restated here.
//
// Two positions per chapter: `head` renders between the chapter-intro
// line and the chapter's own extra content (so the visa chapter's
// passport strip and route cards stay BELOW any reader sentence —
// orientation that arrives after the thing it orients is not
// orientation), and `foot` renders last inside the chapter, below the
// fact rows, closing it. The foot position is Cap's, on the Chania
// precedent: that page's Overview chapter already closes on a
// healthcare row whose content is a referral drive to a bigger city.
//
// SEMANTICS: <p class="reader-sentence-topic">, never a heading element.
// Inside a <details> the <summary> is the heading, and the rows below
// use <div class="fact-label"> for exactly this labelling role; an <h4>
// here would inject phantom levels into the document outline for a
// screen-reader user. The topic carries `fact-label` as a second class
// because the spec names that rule's own font-weight: 600 as the
// treatment to reuse rather than a label treatment to invent (its §2.4).
//
// NO CSS SHIPS WITH THIS CHANGE, by instruction. `.reader-sentences`,
// `.reader-sentence` and `.reader-sentence-scope` are therefore
// undefined in css/style.css and carry no rule: these paragraphs render
// at the chapter's inherited body type with the stylesheet's default
// paragraph margins and no measure constraint — the same unconstrained
// measure the already-live `.chapter-intro` line above them runs at,
// which matters more here only because these paragraphs are longer (710
// characters against an intro line's ~140). The class names ship as the
// hooks the spec's §2.4 rules attach to if and when those are ruled in.
//
// The scope line renders ONCE PER CHAPTER, and in lens-selected states
// only. getActivePersona() returns null in the explicit-general state,
// which is a general view and correctly gets no line; it returns a
// persona id or READER_ID otherwise.
//
// ONCE PER CHAPTER REPLACES ONCE PER BLOCK.
// The head/foot split made the old rule render the line twice in
// Antigua's Overview under a lens, eighteen rows apart, and the wording
// here argued that was the acceptable cost of the split. It is not:
// `withScope` is false for the foot block whenever the head block
// already rendered one, so the chapter carries exactly one line, at the
// first block that appears in it. A chapter with only a foot block still
// gets its line, because nothing suppressed it there.
// ---------------------------------------------------------------------
function readerSentencesHtml(locationId, key, position, withScope = true) {
  if (!locationId || !READER_SENTENCE_POSITIONS.includes(position)) return "";
  const entry = READER_SENTENCES[locationId];
  const slots = entry && entry.chapters ? entry.chapters[key] : null;
  const list = slots ? slots[position] : null;
  // Hard placeholder rule (v7 §2.3): no entry renders nothing at all.
  if (!Array.isArray(list) || !list.length) return "";
  let html = `<div class="reader-sentences reader-sentences-${position}">`;
  for (const item of list) {
    if (item.topic) {
      html += `<p class="reader-sentence-topic fact-label">${escapeHtml(item.topic)}</p>`;
    }
    html += `<p class="reader-sentence">${escapeHtml(item.text)}</p>`;
  }
  if (withScope && getActivePersona()) {
    html += `<p class="reader-sentence-scope">${escapeHtml(READER_SENTENCE_SCOPE_LINE)}</p>`;
  }
  return html + `</div>`;
}

// v7 §2.4: each fact section is now a <details class="chapter">, closed
// by default, every location, no exceptions — including Overview, which
// gets no silent default-open exemption (the verdict block + portrait
// above already carry the page's own "overview"). A guide-voice intro
// line (js/portraits.js's CHAPTER_INTROS, verbatim source copy) sits
// right under the summary where one exists (5 of 6 sections this pilot;
// Overview has none drafted, renders without one).
function buildSection(key, facts, extraHtml = "", locationId = null) {
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

  // DELIBERATE DEPARTURE from the spec's §2.3, which said to insert the
  // reader-sentence block in BOTH places introHtml is used. Its own §2.1
  // forbids a reader sentence and the "Not yet researched" line
  // co-rendering — that pair is a self-contradiction shipped to a reader
  // — and §2.1 is the rule, so this branch renders no reader sentence at
  // all. A location/chapter whose slots are filled but whose facts are
  // empty is a DATA error, not a render case: the prerender build asserts
  // it and fails loudly, and this branch makes the pair unreachable here
  // by construction.
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

  const readerHeadHtml = readerSentencesHtml(locationId, key, "head");
  let bodyHtml = introHtml + readerHeadHtml + extraHtml;
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
      bodyHtml += thresholds.map((t) => {
        if (heldFromRender(t)) return "";
        // Addendum A §A.1: ONE boolean, two slots.
        const dg = isDeclaredGap(t.fact_key);
        return `
        <div class="fact-label">${escapeHtml(t.fact_label)}${scopeTagHtml(t)}</div>
        <div class="fact-value">${escapeHtml(formatValue(t, { suppressGapText: true, declaredGap: dg }))}</div>
        ${indexLineHtml(t.fact_key)}
        <div class="fact-meta">${confidenceBadge(t, { declaredGap: dg })} ${divergenceBadge(t)}</div>
        <div class="source-detail">${sourceDetailHtml(t)}</div>
        ${t.notes ? `<div class="fact-notes">${escapeHtml(t.notes)}</div>` : ""}
      `;
      }).join(thresholds.length > 1 ? "<hr>" : "");
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

  bodyHtml += `<ul class="fact-list">` + plain.map((f) => {
    if (heldFromRender(f)) return "";
    // Addendum A §A.1: ONE boolean, two slots.
    const dg = isDeclaredGap(f.fact_key);
    return `
    <li class="fact-item">
      <div class="fact-label">${escapeHtml(f.fact_label)}${scopeTagHtml(f)}</div>
      <div class="fact-value">${escapeHtml(formatValue(f, { suppressGapText: true, declaredGap: dg }))}</div>
      ${indexLineHtml(f.fact_key)}
      <div class="fact-meta">${confidenceBadge(f, { declaredGap: dg })} ${divergenceBadge(f)}</div>
      <div class="source-detail">${sourceDetailHtml(f)}</div>
      ${f.notes ? `<div class="fact-notes">${escapeHtml(f.notes)}</div>` : ""}
    </li>`;
  }).join("") + `</ul>`;

  // v7 Part 14: reads this SAME section's own already-loaded `facts`
  // array (before the routeGroups/plain split above), since a
  // `mechanism_legality` fact carries a group_key and would otherwise
  // only ever reach the routeGroups branch — which silently drops any
  // group with no `threshold` role fact (see the comment above), meaning
  // it would never render at all without this dedicated pass. Renders
  // nothing (empty string) until a real prohibited-enforced fact exists
  // in this section's facts.
  bodyHtml += buildIllegalRoutesHtml(facts);

  // Last inside the chapter, below the fact rows: Cap's foot position. The
  // scope line rides the head block when there is one, so the foot asks for
  // it only when the head rendered nothing at all.
  bodyHtml += readerSentencesHtml(locationId, key, "foot", !readerHeadHtml);

  details.innerHTML = `<summary>${title}</summary>${bodyHtml}`;
  return details;
}

// Part 23.2 (F3): a location with N facts noted-but-unlinked used to
// render N identical "Source noted — no link available yet" rows, once per
// fact, differing only by date — a section saying nothing, N times. Split
// by whether a fact has a real, clickable link: linked sources are real,
// distinguishing information (a URL) and stay fully itemized, one <li>
// each, dedup'd by URL exactly as before; unlinked sources collapse to
// ONE honest, count-stated line — never suppressed outright, since "on
// file but unlinked" is still real evidence.
// --- Date semantics: a hard rule, not a style choice -------------------
// A fact's `date` is when the figure was true or the rule took effect —
// it never moves on a recheck. The check date is a separate field,
// `last_verified_date`, and it is SPARSE (165 of 2,196 public rows carry
// one). Absent is therefore the default case, and nothing below may say
// "checked" from `date`. Hand-synced with the identical block in
// tools/prerender-locations.mjs, so the prerendered and hydrated pages
// say the same thing about the same fact.
const ISO_DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;

// One date value as a chip that names its own subject.
// `dated X` is the same string the inline source pull-down renders
// (sourceDetailHtml(), app-shared.js), so both surfaces name this field
// pair with the same two words instead of two vocabularies for one pair.
// `Not stated` is the date field's only null-marker — an exact stored
// string — and it is glossed rather than printed raw: "dated Not stated"
// is not a sentence, and a bare "Not stated" chip sitting beside the word
// "source" reads as "the source is not stated", which is false, since
// every one of those rows carries a live link. Same move, and the same
// class of copy, as this chapter's "Source noted — no link available yet".
function dateChip(value) {
  return value === "Not stated"
    ? `<span class="scope-tag">date not stated</span>`
    : `<span class="scope-tag">dated ${escapeHtml(value)}</span>`;
}

// One fact's own dates: its effective date, plus the check date only
// where one really exists.
function factDateTags(f) {
  const parts = [];
  if (f.date) parts.push(dateChip(f.date));
  if (f.last_verified_date) parts.push(`<span class="scope-tag">checked ${escapeHtml(f.last_verified_date)}</span>`);
  return parts.join(" ");
}

// The group-level date claim for a URL group. URL grouping is kept. This
// prints on the row's TRAILING attribution line beside the link, never
// above the facts, and only ever states something true of EVERY fact in
// the group:
//   - all dates and check dates identical -> that one date (+ check),
//     and no per-fact breakdown is needed;
//   - dates identical, check dates differ -> the shared date alone, with
//     no check claim, because no check claim is true of all of them;
//   - dates differ, all real ISO dates -> a span, earliest to latest;
//   - dates differ and any is not a plain ISO date ("Not stated",
//     "2026-06-02 (passed)") -> no date at all; a span across a non-date
//     would be nonsense. The per-fact lines carry the truth.
// Position is load-bearing: printed BELOW the per-fact lines, a span can
// only be read as a summary of what the reader has just read. Printed
// above them, in the same chip style a single fact's date uses, it reads
// as one figure's validity period, which it is not.
function sourceGroupDate(groupFacts) {
  const dates = [...new Set(groupFacts.map((f) => f.date || ""))];
  const checks = [...new Set(groupFacts.map((f) => f.last_verified_date || ""))];
  if (dates.length === 1 && checks.length === 1) {
    return { uniform: true, html: factDateTags(groupFacts[0]) };
  }
  if (dates.length === 1) {
    return { uniform: false, html: dates[0] ? dateChip(dates[0]) : "" };
  }
  if (dates.every((d) => ISO_DATE_RE.test(d))) {
    const sorted = dates.slice().sort();
    return {
      uniform: false,
      html: `<span class="scope-tag">dated ${escapeHtml(sorted[0])} to ${escapeHtml(sorted[sorted.length - 1])}</span>`,
    };
  }
  return { uniform: false, html: "" };
}

// The per-fact breakdown, rendered whenever a group's facts do not share
// one date: every fact named with its OWN date, in data order (no
// re-sort — string-sorting mixed date shapes is exactly the bug this
// avoids). The span on the attribution line below is therefore a summary
// of the set, not a claim about this list's order, and nothing on the
// page says otherwise. The confidence badge rides down here with its own
// fact too: one badge for the group would be the first fact's,
// generalised over claims that don't share it.
function sourceFactLinesHtml(groupFacts) {
  return `<ul class="source-facts">${groupFacts.map((f) => `
            <li class="source-fact"><span class="source-fact-label">${escapeHtml(f.fact_label)}</span> ${confidenceBadge(f, { interactive: false })} ${factDateTags(f)}</li>`).join("")}
          </ul>`;
}

function buildSourcesSection(sourcedFacts) {
  const details = document.createElement("details");
  details.className = "chapter";
  details.id = "sec-sources";

  const linkedSeen = new Map();
  const unlinkedSeen = new Map();
  for (const f of sourcedFacts) {
    if (f.source_url) {
      // Kept as one row per distinct URL (a "source" is a citation, not a
      // fact), but every fact this same URL backs gets named in that row —
      // the row previously kept only the first fact it met and rendered no
      // label at all, so a reader with several linked sources on one page
      // had no way to tell which claim any given link actually documents.
      // `facts` collects every fact sharing this URL; `fact` (kept as the
      // first match, unchanged from before) still supplies the link.
      // It must NOT supply the DATE for the whole group: doing so silently
      // hid every corrected date sitting behind a URL whose first fact
      // happened not to be corrected. Dates come from the group as a
      // whole, or per fact — never from whichever row was met first.
      if (!linkedSeen.has(f.source_url)) linkedSeen.set(f.source_url, { fact: f, facts: [] });
      linkedSeen.get(f.source_url).facts.push(f);
    } else {
      // Dedup by the same key the old single-list code used
      // (source_ref/fact_label) — a "source" here is a distinct citation,
      // not one row per fact; several facts commonly cite the same
      // unlinked source (e.g. the same research file backing a dozen
      // facts), and counting raw facts instead of distinct sources would
      // badly overstate N.
      const key = `onfile:${f.source_ref || f.fact_label}`;
      if (!unlinkedSeen.has(key)) unlinkedSeen.set(key, f);
    }
  }
  const linked = [...linkedSeen.values()];
  const unlinked = [...unlinkedSeen.values()];

  const linkedHtml = linked.map(({ fact: f, facts: groupFacts }) => {
    const { uniform, html: dateHtml } = sourceGroupDate(groupFacts);
    if (uniform) {
      return `
        <li class="fact-item">
          <div class="fact-label">${escapeHtml(groupFacts.map((g) => g.fact_label).join(", "))}</div>
          <div class="fact-value">${sourceLine(f)} ${confidenceBadge(f, { interactive: false })}${dateHtml ? ` ${dateHtml}` : ""}</div>
        </li>`;
    }
    // Facts first, source last — the same reading order the uniform branch
    // above already has. The listed form leads with the per-fact lines and
    // closes with one attribution line, so a reader scanning the chapter
    // meets a fact label at the top of every row without exception.
    return `
        <li class="fact-item">
          ${sourceFactLinesHtml(groupFacts)}
          <div class="fact-value">${sourceLine(f)}${dateHtml ? ` ${dateHtml}` : ""}</div>
        </li>`;
  }).join("");

  // Most recent of the unlinked sources' own dates — already-available
  // data, no new field. Plain string comparison: every date on file uses
  // the same YYYY-MM-DD-leading shape, so lexical order is date order.
  let mostRecentDate = null;
  for (const f of unlinked) {
    if (f.date && (!mostRecentDate || f.date > mostRecentDate)) mostRecentDate = f.date;
  }
  const dateText = escapeHtml(mostRecentDate || "an unstated date");
  let unlinkedHtml = "";
  if (unlinked.length > 0) {
    let sentence;
    if (linked.length === 0) {
      // This variant's own source copy is written generically for "N > 0,
      // linked = 0" without a singular sub-form — a real, small copy gap
      // at N=1 ("1 sources"), flagged rather than silently patched here
      // (not this seat's copy to write). See the build report.
      sentence = `${unlinked.length} sources are on file here, none with a public link yet — the most recent dates from ${dateText}.`;
    } else if (unlinked.length === 1) {
      sentence = `One more source is on file here without a public link yet — it dates from ${dateText}.`;
    } else {
      sentence = `${unlinked.length} more sources are on file here without a public link yet — the most recent dates from ${dateText}.`;
    }
    unlinkedHtml = `<li class="fact-item"><p class="fact-notes">${sentence}</p></li>`;
  }

  const rowsHtml = linkedHtml + unlinkedHtml;
  details.innerHTML = `<summary>Sources</summary>` + (rowsHtml
    ? `<ul class="fact-list">${rowsHtml}</ul>`
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
  // The reader's own next-best list is ranked by the general figures, so
  // it carries NO label at all — which is what the retired branch already
  // did for every reader without stored priorities. " matching your own
  // priorities" is deleted: it was a label on a ranking nothing of theirs
  // shaped, and claiming it over a general ranking would be a false label
  // on a real list.
  const personaLabel = persona === READER_ID
    ? ""
    : persona ? ` for ${personaDisplayLabel(persona)}` : "";
  div.innerHTML = `<h2>Where now?</h2><p>Ranked next-best alternatives${personaLabel}:</p>
    <ul>${candidates.map((c) => `<li><a href="${withPersona(siteUrl(`l/${c.l.location_id}.html`))}">
      ${escapeHtml(c.l.display_name)}</a> — ${c.val.toFixed(1)}/5</li>`).join("")}</ul>
    <p><a href="${withPersona(siteUrl("lists.html"))}">Back to the full list</a> · <a href="${withPersona(siteUrl("index.html"))}">Back to the map</a></p>`;
  return div;
}
