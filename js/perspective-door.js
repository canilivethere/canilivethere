// CanILiveThere — the lens-first landing door (v7 Part 10). The site
// opens with a welcome and a forced perspective choice, the map visible
// but de-emphasized behind it until one is made; switching stays easy
// afterward via the existing top-of-page switcher (see Part 11). Shows
// once per browser, first-arrival only (door-seen in localStorage), and
// never on a deep link that already carries ?persona= — index.html-only
// by construction, since this module is only ever imported by js/map.js,
// which only index.html loads (a reading of "the site opens with...",
// not a literal requirement that every page carry this door — a scoping
// judgment made at build time).
//
// Reads the SAME source as the top-of-page switcher (VALID_PERSONAS order
// + the shared descriptor strings, both in app-shared.js) — one true
// source, two renderings, so the two surfaces can never list a different
// persona set or different wording from each other.
//
// v11 Part 21: a ninth door, "Build your own" — the third door / v1 of
// the profile centre. Reuses this same overlay (map fog, pointer-events:
// none, focus trap, ESC handling) rather than a second one — clicking the
// ninth tile swaps .door-panel's own inner content between three screens
// (tile grid / intro-disclosure / seven-question form) in place. Its own
// computation and storage are ruled at 8P — this file
// only builds the form and calls the two functions that ruling names
// (defaultWeightForCriterion, saveCustomProfile).

import {
  VALID_PERSONAS, personaDescriptorSentence, withPersona, escapeHtml, isActivationKey,
  hasCustomProfile, loadCustomProfile, saveCustomProfile,
} from "./app-shared.js";
import { loadStore, defaultWeightForCriterion } from "./data.js";

const DOOR_SEEN_KEY = "door-seen";

// Already-reviewed public-bound copy, transported verbatim, not authored
// in this file.
const WELCOME_LINE =
  "A visa rule, a rent number, a safety record — they read the same to everyone. What they add up to for you doesn't. Pick whoever below comes closest to you, and see what these same facts mean for someone like that.";
const ESCAPE_HATCH_LABEL = "See the facts as they are.";

// v11 21.5 — the seven forced-choice questions, restricted to the High/
// Medium-High weight-class criteria per that Part's own reasoning (the
// criteria that actually move generalIndex()'s weighted average the
// most — confirmed against derived/criteria.jsonl directly, not
// asserted: these seven ARE exactly that tier). Structural draft copy,
// mine, per the dispatch's own explicit allowance ("ships as the
// stopgap") — not yet run through a copy-voice pass.
const CUSTOM_QUESTIONS = [
  { criterion_id: "community-social-fabric", question: "How much does feeling like part of a real community there — knowing your neighbors, an easy social life — matter to you?" },
  { criterion_id: "nature-water-adjacency", question: "How much do mountains, ocean, or green space right outside your door matter to you?" },
  { criterion_id: "income-viability", question: "How much does being able to actually earn a living there matter to you?" },
  { criterion_id: "routine-sustainability-pace-of-life", question: "How much does the day-to-day pace of life — something you could keep up for years — matter to you?" },
  { criterion_id: "cost-of-living-affordability", question: "How much does your money stretching further matter to you?" },
  { criterion_id: "visa-legal-pathway-ease", question: "How much does an easy, low-friction path to stay long-term matter to you?" },
  { criterion_id: "room-for-others-group-viability", question: "How much does having room for friends or family to join you later matter to you?" },
];
// Most-important option first, left to right (21.5's own ordering
// instruction) — value is the exact 0-3 weight this choice sets (8P.1's
// own tier vocabulary), not a separate code needing translation later.
const TIER_CHOICES = [
  { value: 3, label: "Matters a lot" },
  { value: 2, label: "Matters some" },
  { value: 1, label: "Not a big factor" },
  { value: 0, label: "Doesn't matter to me." },
];

// 21.4 screen 1's three fixed parts, in order, plus the topic list and
// controls. Structural draft copy, mine — flagged the same as
// CUSTOM_QUESTIONS above.
const CUSTOM_INTRO_WHAT =
  "This weighs the same facts the rest of the site uses by what matters to you — not the closest of eight example people.";
const CUSTOM_INTRO_HONESTY =
  "A short question set is a rougher read on something as real as your own life — not a full profile.";
const CUSTOM_INTRO_FALLBACK =
  "A fuller version — where you set every priority yourself, not just these seven — is on the way.";
const CUSTOM_INTRO_TOPICS =
  "Seven quick questions: community, nature, income, pace of life, cost, visa ease, and room for others.";
const CUSTOM_INTRO_SCOPE =
  "This can't yet say “never show me X” — only “care more or less about X.” It builds a Fit Index, not a visa verdict; no eligibility check runs off these answers.";

// Asset handoff (Part 17): portrait face images are supplied directly,
// not fetchable at build time. Read mechanically off VALID_PERSONAS ids,
// never hardcoded per name — a file simply not being present yet is the
// expected, normal state until one is dropped in (see
// assets/portraits/README.md). Every image goes through the same
// publication-boundary review as any other public-bound asset before a
// production build.
function portraitSrc(id) {
  return `assets/portraits/${id}.png`;
}

function personaDisplayName(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

// A plain, abstract "adjustable/build" glyph — a dial, not a photo and
// not a silhouette (21.3's own explicit, argued requirement: the eight
// circles depict actual fictional people, this one depicts a process;
// a generic human silhouette would visually claim "a ninth person" the
// site doesn't have). Inline SVG, zero new asset/dependency — colors
// inherit from the surrounding text color via currentColor.
const CUSTOM_TILE_ICON = `
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <line x1="12" y1="12" x2="12" y2="6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <line x1="12" y1="12" x2="16" y2="14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="12" cy="12" r="1.4" fill="currentColor"/>
  </svg>
`;

// Trigger condition (Part 10, generalized by 21.9): show only when no
// persona is already set via ?persona= (a deep link, or a returning
// visitor mid-task), no door-seen choice exists yet, AND no stored custom
// weight vector exists yet — a reader who already built their own
// priorities gets the door suppressed exactly the way an explicit
// ?persona= already does (same "never force the ritual on someone who
// already chose" reasoning, one more condition on the same check, not new
// doctrine).
function shouldShowDoor() {
  const params = new URLSearchParams(location.search);
  if (params.has("persona")) return false;
  try {
    if (localStorage.getItem(DOOR_SEEN_KEY) === "1") return false;
  } catch (e) {
    // localStorage unavailable (private-browsing edge cases, etc.) — fail
    // open to "don't show the door" rather than risk showing it on every
    // single load for a reader who can't ever silence it.
    return false;
  }
  if (hasCustomProfile()) return false;
  return true;
}

function markSeen() {
  try { localStorage.setItem(DOOR_SEEN_KEY, "1"); } catch (e) {}
}

function tilesHtml() {
  const personaTiles = VALID_PERSONAS.map((id) => {
    const name = personaDisplayName(id);
    const sentence = personaDescriptorSentence(id);
    return `
      <button type="button" class="door-tile" data-persona="${id}">
        <span class="door-portrait"><img class="door-portrait-img" src="${portraitSrc(id)}" alt="" loading="lazy"></span>
        <span class="door-name">${escapeHtml(name)}</span>
        <span class="door-descriptor">${escapeHtml(sentence)}</span>
      </button>
    `;
  }).join("");
  // 21.3: appended last, after the eight named tiles, before the escape-
  // hatch row — preserves VALID_PERSONAS' own fixed order rather than
  // inserting mid-list.
  const customTile = `
    <button type="button" class="door-tile" data-action="custom-priorities">
      <span class="door-portrait door-portrait-icon">${CUSTOM_TILE_ICON}</span>
      <span class="door-name">Build your own</span>
      <span class="door-descriptor">Answer a few quick questions instead of picking one of the eight.</span>
    </button>
  `;
  return personaTiles + customTile;
}

function questionRowHtml(q, prefillAnswers) {
  const prefilled = prefillAnswers ? prefillAnswers[q.criterion_id] : null;
  const choices = TIER_CHOICES.map(
    (c) => `
      <label class="priority-choice">
        <input type="radio" name="q-${q.criterion_id}" value="${c.value}"${String(c.value) === String(prefilled) ? " checked" : ""}>
        <span>${escapeHtml(c.label)}</span>
      </label>`
  ).join("");
  return `
    <fieldset class="door-question" data-criterion="${q.criterion_id}">
      <legend>${escapeHtml(q.question)}</legend>
      <div class="priority-choices">${choices}</div>
    </fieldset>
  `;
}

export function initPerspectiveDoor() {
  const params = new URLSearchParams(location.search);
  // "Edit your answers" (app-shared.js's switcher control) lands here with
  // this flag — reopens the questionnaire directly, pre-filled, even on a
  // return visit where the door would otherwise stay suppressed.
  const editRequested = params.get("edit-priorities") === "1" && hasCustomProfile();
  if (!editRequested && !shouldShowDoor()) return;

  // Strip the one-shot flag from the URL so a later reload of this same
  // page doesn't reopen the questionnaire unasked — cosmetic, not load-
  // bearing, wrapped defensively since history.replaceState can throw in
  // rare sandboxed contexts.
  if (editRequested) {
    try {
      const url = new URL(location.href);
      url.searchParams.delete("edit-priorities");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch (e) {}
  }

  const mapRoot = document.getElementById("map-root");
  if (mapRoot) mapRoot.classList.add("map-fogged");

  const overlay = document.createElement("div");
  overlay.id = "perspective-door";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Choose whose eyes to see this map through");
  overlay.innerHTML = `<div class="door-panel" id="door-panel" tabindex="-1"></div>`;
  document.body.appendChild(overlay);
  const panel = overlay.querySelector("#door-panel");

  const unfog = () => { if (mapRoot) mapRoot.classList.remove("map-fogged"); };
  const dismissWithoutPersona = () => {
    markSeen();
    overlay.remove();
    unfog();
  };

  function renderTileGrid() {
    panel.innerHTML = `
      <p class="door-welcome">${escapeHtml(WELCOME_LINE)}</p>
      <div class="door-tiles">${tilesHtml()}</div>
      <button type="button" class="door-escape" id="door-escape">${escapeHtml(ESCAPE_HATCH_LABEL)}</button>
    `;

    // No entry ever renders a broken-image icon (Part 17's own "no visible
    // placeholder artifact" discipline): a failed portrait load removes
    // the <img>, leaving the neutral circle background showing through.
    panel.querySelectorAll(".door-portrait-img").forEach((img) => {
      img.addEventListener("error", () => img.remove());
    });

    panel.querySelectorAll(".door-tile[data-persona]").forEach((btn) => {
      const choose = () => {
        const persona = btn.dataset.persona;
        markSeen();
        location.href = withPersona(location.pathname + location.hash, { persona });
      };
      btn.addEventListener("click", choose);
      btn.addEventListener("keydown", (e) => { if (isActivationKey(e)) { e.preventDefault(); choose(); } });
    });

    const customBtn = panel.querySelector('.door-tile[data-action="custom-priorities"]');
    const openIntro = () => renderIntro();
    customBtn.addEventListener("click", openIntro);
    customBtn.addEventListener("keydown", (e) => { if (isActivationKey(e)) { e.preventDefault(); openIntro(); } });

    panel.querySelector("#door-escape").addEventListener("click", dismissWithoutPersona);
    panel.focus();
  }

  function renderIntro() {
    panel.innerHTML = `
      <button type="button" class="door-back" id="door-back">&lsaquo; Back</button>
      <div class="door-disclosure">
        <p>${escapeHtml(CUSTOM_INTRO_WHAT)}</p>
        <p>${escapeHtml(CUSTOM_INTRO_HONESTY)}</p>
        <p>${escapeHtml(CUSTOM_INTRO_FALLBACK)}</p>
        <p class="door-intro-list">${escapeHtml(CUSTOM_INTRO_TOPICS)}</p>
        <p class="door-intro-list">${escapeHtml(CUSTOM_INTRO_SCOPE)}</p>
      </div>
      <button type="button" class="door-escape door-start" id="door-start">Start</button>
    `;
    panel.querySelector("#door-back").addEventListener("click", renderTileGrid);
    panel.querySelector("#door-start").addEventListener("click", () => renderQuestionnaire(null));
    panel.focus();
  }

  // prefillAnswers: { criterion_id: "0".."3" } or null — pre-checks the
  // matching radio when reopened via "Edit your answers" (21.9).
  function renderQuestionnaire(prefillAnswers) {
    panel.innerHTML = `
      <button type="button" class="door-back" id="door-back">&lsaquo; Back</button>
      <div class="door-questions">
        ${CUSTOM_QUESTIONS.map((q) => questionRowHtml(q, prefillAnswers)).join("")}
      </div>
      <button type="button" class="door-escape door-submit" id="door-submit" disabled>See my priorities</button>
    `;
    panel.querySelector("#door-back").addEventListener("click", renderIntro);

    const submitBtn = panel.querySelector("#door-submit");
    const allAnswered = () =>
      CUSTOM_QUESTIONS.every((q) => panel.querySelector(`input[name="q-${q.criterion_id}"]:checked`));
    const syncSubmit = () => { submitBtn.disabled = !allAnswered(); };
    panel.querySelectorAll('input[type="radio"]').forEach((input) => {
      input.addEventListener("change", syncSubmit);
    });
    syncSubmit();

    submitBtn.addEventListener("click", async () => {
      if (!allAnswered()) return;
      // Disabled during the async save so a double-click can't fire this
      // twice — cheap, since loadStore()'s own promise is already in
      // flight/cached by the time a reader reaches this screen.
      submitBtn.disabled = true;
      const answers = {};
      for (const q of CUSTOM_QUESTIONS) {
        const checked = panel.querySelector(`input[name="q-${q.criterion_id}"]:checked`);
        answers[q.criterion_id] = checked.value;
      }
      // 8P.1: all 13 criterion_ids present, always — the untouched six
      // default to this criterion's own site-wide weight, never to 0 and
      // never to an absent key. Needs store.criteria (weight_class per
      // criterion), fetched here rather than at door-open time so the
      // door's own first paint never waits on a network round trip.
      const store = await loadStore();
      const weights = {};
      for (const crit of store.criteria) {
        weights[crit.criterion_id] = Object.prototype.hasOwnProperty.call(answers, crit.criterion_id)
          ? Number(answers[crit.criterion_id])
          : defaultWeightForCriterion(crit);
      }
      saveCustomProfile(weights, answers);
      // Both markers, per 21.8 item 2: door-seen (shared with every other
      // choice) AND the custom_profile object itself (the completion
      // marker the switcher/trigger both read).
      markSeen();
      // Full reload rather than an in-place re-render — the same idiom
      // the eight named tiles already use (choose() above) — so every
      // page-level index computation picks up store.customWeights fresh,
      // with no URL persona present (getActivePersona()'s own ruled
      // precedence then resolves to "custom").
      location.href = location.pathname + location.hash;
    });
    panel.focus();
  }

  if (editRequested) {
    const existing = loadCustomProfile();
    renderQuestionnaire(existing ? existing.answers : null);
  } else {
    renderTileGrid();
  }

  // Basic modal keyboard support: focus starts inside the dialog, Escape
  // dismisses via the same no-persona path as the escape-hatch link,
  // regardless of which of the three screens is currently showing — a
  // real, if partial, accessibility pass (full focus-trap looping is NOT
  // built here, named as a gap rather than silently left unstated).
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); dismissWithoutPersona(); }
  });
}
