// CanILiveThere — the "How We Work" (principles) page.
//
// Renders the site's approved six-principle copy deck verbatim, in a
// deliberate reading order (individual applicability first, then the
// three-part honesty/checkability argument, then how a reader actually
// uses the site) — traced and held up against a second, independent
// test: what question is a first-time visitor actually asking, in what
// order? Same static-placeholder shell as corrections.html/js — no new
// page pattern invented. Zero new facts: this page states method, not
// place-data, so there is no data fetch for content, only loadStore()
// for renderFooter()'s snapshot-date line (same reason criteria.js and
// corrections.js both call it). No persona picker — method isn't
// persona-specific, same reasoning those two pages already use for
// omitting one.

import { loadStore } from "./data.js";
import { applyStoredTheme, renderTopBar, renderFooter, escapeHtml, withPersona } from "./app-shared.js";
import { siteUrl } from "./site-root.js";

applyStoredTheme();
renderTopBar("principles");
main();

// Approved copy, embedded verbatim. Lead sentence (bold) + supporting
// sentence(s), split exactly as approved — no rewording, no reordering
// within a principle, no seventh item added.
const INTRO_TEXT =
  "A relocation guide makes a hundred quiet choices before you ever " +
  "see a page — what counts as a red flag, whose passport gets checked " +
  "first, which number gets the biggest font. Most guides never tell " +
  "you what those choices were, so you're left trusting the page " +
  "instead of understanding it. We'd rather you understood it. Here's " +
  "how we actually work, stated plainly enough that you can hold us to " +
  "every line of it.";

// Reading order confirmed, not reshuffled. No principle carries any
// extra visual weight over another — order is the only emphasis signal
// this page uses.
const PRINCIPLES = [
  {
    lead: "Your passport changes your rules. It never changes your welcome.",
    body:
      "A visa route that takes four months on one passport can take " +
      "four years — or not exist at all — on another, and we'll tell " +
      "you which is true for yours, good news or bad. Whether you're " +
      "staying three months or for good, the same facts apply; only " +
      "what they add up to for you changes.",
  },
  {
    lead: "We report the world. We don't referee it.",
    body:
      "We won't tell you where you're allowed to want to live. Where a " +
      "housing market is genuinely strained, or a place is genuinely " +
      "pushing back against newcomers, that's information you get too " +
      "— not a verdict, just the truth of it.",
  },
  {
    lead: "A red flag gets the same size text as a strength.",
    body:
      "We don't bury bad news to keep a place looking good, and we " +
      "don't invent problems to look balanced either. When we're less " +
      "sure of something, we say so — and that changes only when the " +
      "sourcing behind it does.",
  },
  {
    lead: "Check us. Don't just trust us.",
    body:
      "Every fact here carries where it came from and when we last " +
      "confirmed it. A site you can verify is worth more than one you " +
      "merely believe.",
  },
  {
    lead: "There's no average relocator, so we don't build for one.",
    body:
      "The same rent number, the same visa rule, means something " +
      "different depending on who's reading it. See the facts as they " +
      "are, or see them through a life closer to your own — either " +
      "way, nothing's hidden from you to make the choice for you.",
  },
  {
    lead: "We'd rather be fun to explore than impressive to look at.",
    body:
      "Every number on this site is a door, not a dead end — click it " +
      "and you're two steps from the real answer, sourcing included. " +
      "If something doesn't make your own search easier, it doesn't " +
      "earn a place here, no matter how good it looks in a screenshot.",
  },
];

const CLOSING_TEXT =
  "None of this makes the search easy. It just means nothing here is " +
  "hiding from you.";

function buildPrincipleHtml(p) {
  return `<div class="principle"><p><strong>${escapeHtml(p.lead)}</strong> ${escapeHtml(p.body)}</p></div>`;
}

// The helpful-or-onward law: one onward link, pointing at Corrections &
// changes rather than back to browsing.
function onwardHtml() {
  const href = withPersona(siteUrl("corrections.html"));
  return `See it in practice → <a href="${href}">Corrections &amp; changes</a>, every dated update including what we got wrong.`;
}

async function main() {
  const store = await loadStore();
  renderFooter(store);

  document.getElementById("principles-intro").textContent = INTRO_TEXT;
  document.getElementById("principles-list").innerHTML = PRINCIPLES.map(buildPrincipleHtml).join("");
  document.getElementById("principles-closing").textContent = CLOSING_TEXT;
  document.getElementById("principles-onward").innerHTML = onwardHtml();
}
