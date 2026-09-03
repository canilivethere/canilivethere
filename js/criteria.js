// v9 Part 5.2: the score-breakdown "every stat is a door" anchor page —
// one <section> per criterion, in display_order, reached by a second
// click from any location page's score-breakdown chip. Same shared-shell
// pattern every other page uses (renderTopBar, applyStoredTheme, persona
// preserved via withPersona on every internal link in and out — the
// incoming link already carries ?persona=, renderTopBar's own withPersona()
// calls preserve it outward automatically, no new mechanism). This page
// carries no persona-specific content itself (v9 Part 5.4: WEIGHT_CLASS_LABEL
// is one flat label per criterion, no persona context here at all) — no
// persona picker is rendered on purpose.

import { loadStore } from "./data.js";
import {
  applyStoredTheme, renderTopBar, renderFooter, escapeHtml,
  SCALE_ANCHOR_STRING, WEIGHT_CLASS_LABEL,
  READER_DEPENDENCY_PENDING_LABEL, READER_DEPENDENCY_PENDING_PARAGRAPH,
} from "./app-shared.js";

applyStoredTheme();
renderTopBar("criteria");
main();

async function main() {
  const store = await loadStore();
  renderFooter(store);
  document.getElementById("scale-anchor").textContent = SCALE_ANCHOR_STRING;
  const root = document.getElementById("criteria-root");
  // store.criteria is already sorted by display_order (data.js's own
  // buildStore()) — no re-sort needed here.
  root.innerHTML = store.criteria.map(buildCriterionSection).join("");
  // No cross-page-hash-into-closed-<details> fix needed here (contrast
  // v9 Part 1.3's location.js fix): every section below is a plain
  // <section>, not a collapsed element, so the browser's own native
  // fragment scroll already reaches it on a cold arrival.
}

// criteria.jsonl carries no `definition` field today (checked directly,
// confirmed absent — a real content gap, not solved here). This reads
// crit.definition defensively so the page is forward-compatible the day
// that field lands (either as a criteria.jsonl column or a shared
// constant elsewhere in this codebase) without a second build pass; until
// then it renders the same honest "not yet" gap voice this site already
// uses elsewhere (Verify Yourself, Sources), never an invented
// definition.
function buildCriterionSection(crit) {
  const weightLabel = WEIGHT_CLASS_LABEL[crit.weight_class] || crit.weight_class;
  const definitionHtml = crit.definition
    ? `<p>${escapeHtml(crit.definition)}</p>`
    : `<p class="fact-notes">What this measures, in plain language, isn't drafted yet for this criterion — a copy gap, not a claim that it doesn't matter. Every location's own score is real; this page's own explanation is what's still on its way.</p>`;
  // v10 Part 16.3: the §8J disclosure, same marker + same shared paragraph
  // as location.js's chapter (16.1) and lists.js's explainer (16.2),
  // keyed off the identical field check so it's structural in this page
  // from the day it ships, not retrofitted after.
  const pendingHtml = crit.reader_dependency === "pending-ruling"
    ? `<p><span class="scope-tag" title="Several distinct facts folded into one number">${escapeHtml(READER_DEPENDENCY_PENDING_LABEL)}</span></p>
       <p class="fact-notes">${escapeHtml(READER_DEPENDENCY_PENDING_PARAGRAPH)}</p>`
    : "";
  return `
    <section id="${escapeHtml(crit.criterion_id)}" class="criterion-detail">
      <h2>${escapeHtml(crit.name)}</h2>
      ${definitionHtml}
      ${pendingHtml}
      <p class="fact-notes">This criterion is ${escapeHtml(weightLabel)}.</p>
    </section>
  `;
}
