// CanILiveThere — the lens-first landing door (v7 Part 10; reworked per
// Part 25.2-25.4, Cap's ratified direction "you should always meet this
// door, but have the option of saving yours").
//
// The site opens with a welcome and a choice of how to see it: three
// wings (your passport / your priorities / eight worked-example people),
// the map visible but de-emphasized behind it until the reader acts.
// index.html-only by construction, since this module is only ever
// imported by js/map.js, which only index.html loads.
//
// Semantic change from the original v7 door (25.2): the door is no
// longer once-per-browser. Every plain visit to index.html meets it —
// the OLD door-seen-suppresses-forever gate is retired entirely, not
// replaced by any new show/don't-show state. The one thing that still
// bypasses it is an explicit ?persona= deep link (unchanged — an
// explicit signal beats the ritual, same precedent §8P's
// getActivePersona() already codifies for URL vs. stored state). A
// saved perspective (a persona choice, a built weight vector, a saved
// passport, or any combination) never suppresses the door either — it
// changes what the door LEADS WITH: a resume band above the wings,
// pre-offering the saved perspective as one keystroke, not a toll.
//
// Reads the SAME source as the top-of-page switcher (VALID_PERSONAS order
// + the shared descriptor strings, both in app-shared.js) — one true
// source, two renderings, so the two surfaces can never list a different
// persona set or different wording from each other.
//
// Three wings, not nine tiles: "Your passport" (the data-input box, v1 —
// this file's own new build, 25.5) leads; "Your priorities" is the
// existing seven-question flow, now reachable on EVERY visit (fixes the
// build-your-own dead end — before this rework, the flow only ever lived
// inside the first-arrival door, and door-seen sealed it off forever
// after); the eight named personas demote to a labeled reference row
// below the wings — same tiles, same portraits, same descriptors, same
// size, just not the primary way in. The old ninth "Build your own" tile
// is retired: one entry per flow (the wing 2 card), not two doors to the
// same room.

import {
  VALID_PERSONAS, personaDescriptorSentence, withPersona, escapeHtml, isActivationKey,
  hasCustomProfile, loadCustomProfile, saveCustomProfile,
  loadNationality, saveNationality, loadSavedPerspective, saveSavedPerspective,
  isExplicitGeneral, setExplicitGeneral, clearExplicitGeneral,
  hasAnySavedReaderState, wireForgetControl,
} from "./app-shared.js";
import { loadStore, defaultWeightForCriterion } from "./data.js";
import { ISO_COUNTRY_NAMES } from "./iso-names.js";

// §8AA.4: retired 2026-07-21 as a show/don't-show gate (Cap's
// always-meet-the-door direction ends the once-per-browser semantic this
// key existed to implement). The only remaining code that reads this
// name is the one-line deletion below — no new key replaces it.
const DOOR_SEEN_KEY = "door-seen";

// Already-reviewed public-bound copy, transported verbatim, not authored
// in this file. NOT reframed for the new three-wing layout (25.3's own
// instruction, C12 in the Part 25 copy table): the door's most-read line
// deserves a real register pass, not a placeholder shipped by default —
// this ships as-is until that pass lands.
const WELCOME_LINE =
  "A visa rule, a rent number, a safety record — they read the same to everyone. What they add up to for you doesn't. Pick whoever below comes closest to you, and see what these same facts mean for someone like that.";
const ESCAPE_HATCH_LABEL = "See the facts as they are.";

// Part 25 copy table, C1-C8 — every string here is DRAFTED (a design
// register pass is a named follow-up, not this build's call), shipped
// as-drafted per the dispatch's own instruction. Kept in one place, same
// discipline the rest of this file already uses for its own committed
// strings, so a future register pass is cheap.
const WING_PASSPORT_LABEL = "Your passport";
const WING_PASSPORT_SUBLINE = "Pick your nationality and see what entry actually looks like for you.";
const WING_PRIORITIES_LABEL = "Your priorities";
const WING_PRIORITIES_SUBLINE = "Seven quick questions, weighed your way.";
const PERSONA_ROW_HEADING = "Or compare against eight worked examples — fictional people, real rules.";
const PASSPORT_BOX_HEADING = "Start from your passport";
const PASSPORT_BOX_SCOPE = "One real thing about you, and the entry rules on this site re-read themselves around it.";
// §15.4, verbatim (case-adapted per 25.8's own ruling: a ratified rule
// sentence renders sentence-cased once it becomes its own standalone
// reader paragraph — words unchanged from the source).
const DUAL_CITIZEN_LINE = "Holding more than one passport? Check each — the better answer wins.";
const PASSPORT_MORE_LINE = "That's all it asks for now. Income, savings, family, pets — the rest of you gets a place here soon.";
const PASSPORT_SCOPE_FOOTER = "This checks entry rules only — nothing here compares your income or savings to any threshold yet.";
const PASSPORT_SAVE_LABEL = "See it through your passport";
const PASSPORT_PLACEHOLDER_OPTION = "Choose a passport…";
const FORGET_LABEL = "Forget what I've saved here";
const SWITCH_LABEL = "Switch or start over";

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
// inherit from the surrounding text color via currentColor. Reused here
// for the Wing 2 card (the ninth-tile icon's own new home).
const CUSTOM_TILE_ICON = `
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <line x1="12" y1="12" x2="12" y2="6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <line x1="12" y1="12" x2="16" y2="14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="12" cy="12" r="1.4" fill="currentColor"/>
  </svg>
`;
// A plain passport-book glyph for Wing 1 — same non-photo, non-silhouette
// reasoning as the icon above, applied to the passport-lens wing.
const PASSPORT_TILE_ICON = `
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
    <rect x="5" y="3" width="14" height="18" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <circle cx="12" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.4"/>
    <line x1="9" y1="16" x2="15" y2="16" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  </svg>
`;

// 25.2: ?persona= deep links still bypass the door — unchanged, an
// explicit signal beats the ritual. Nothing else suppresses it anymore —
// door-seen is retired (below), and a saved perspective changes what the
// door LEADS WITH, not whether it shows.
function shouldShowDoor() {
  const params = new URLSearchParams(location.search);
  return !params.has("persona");
}

// §8AA.1/25.4: builds the one compound phrase the resume band names in
// two places (the intro line and the continue button) — every saved
// dimension named at once (perspective-disclosure law: a reader who
// saved a passport AND built priorities sees both named, not just one).
// Returns null when nothing is saved at all (no band renders). A stored
// PERSONA choice is read here (the door's own memory, §8AA.1) but never
// applied anywhere outside an explicit "Continue" click — this function
// only describes it.
function savedPerspectiveDescriptor() {
  const savedPersp = loadSavedPerspective();
  const nationality = loadNationality();
  const nationalityName = nationality ? ISO_COUNTRY_NAMES[nationality.code] : null;

  let lensPart = null;
  if (savedPersp && savedPersp.kind === "persona" && VALID_PERSONAS.includes(savedPersp.persona_id)) {
    lensPart = `as ${personaDisplayName(savedPersp.persona_id)}`;
  } else if (hasCustomProfile()) {
    lensPart = "with your priorities";
  }

  const passportPart = nationalityName
    ? (lensPart ? `a ${nationalityName} passport` : `with a ${nationalityName} passport`)
    : null;

  const parts = [lensPart, passportPart].filter(Boolean);
  return parts.length ? parts.join(" + ") : null;
}

function markSeenLegacyKeyRemoved() {
  // §8AA.4: delete on sight, not "ignore forever" — a permanently-ignored
  // live key is a stale index left plugged in, the exact failure class
  // this project's own schema/storage discipline exists to clear.
  try { localStorage.removeItem(DOOR_SEEN_KEY); } catch (e) {}
}

function tilesHtml() {
  // The old ninth "Build your own" tile is retired (25.3) — the wing 2
  // card is that same flow's one entry point now. Eight named personas
  // only, unchanged order/size/portraits/descriptors from before.
  return VALID_PERSONAS.map((id) => {
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

// v11 21.5 — the seven forced-choice questions, restricted to the High/
// Medium-High weight-class criteria per that Part's own reasoning (the
// criteria that actually move generalIndex()'s weighted average the
// most — confirmed against derived/criteria.jsonl directly, not
// asserted: these seven ARE exactly that tier). Copy-voice pass applied
// (2026-07-17): five questions reworded, two kept verbatim. Q6
// deliberately names both short and long stays — a baked-in "long-term"
// was dropped on purpose: shorter stays are in scope, not a lesser case
// (a same-day product decision, not drift).
const CUSTOM_QUESTIONS = [
  { criterion_id: "community-social-fabric", question: "How much does being part of a real community — neighbors who know you, a social life that comes easily — matter to you?" },
  { criterion_id: "nature-water-adjacency", question: "How much do mountains, water, or green space right outside your door matter to you?" },
  { criterion_id: "income-viability", question: "How much does being able to actually earn a living there matter to you?" },
  { criterion_id: "routine-sustainability-pace-of-life", question: "How much does the day-to-day pace of life — a rhythm you could settle into and keep — matter to you?" },
  { criterion_id: "cost-of-living-affordability", question: "How much does your money going further — rent, groceries, the ordinary bills — matter to you?" },
  { criterion_id: "visa-legal-pathway-ease", question: "How much does simple paperwork — a visa that's easy to get and easy to keep, whether for a season or for good — matter to you?" },
  { criterion_id: "room-for-others-group-viability", question: "How much does having room for friends or family to join you later matter to you?" },
];
// Most-important option first, left to right (21.5's own ordering
// instruction) — value is the exact 0-3 weight this choice sets (8P.1's
// own tier vocabulary), not a separate code needing translation later.
const TIER_CHOICES = [
  { value: 3, label: "Matters a lot" },
  { value: 2, label: "Matters some" },
  { value: 1, label: "Not a big factor" },
  // No trailing period — matches the other three pills' punctuation
  // pattern (a review nit, fixed for uniformity across all four).
  { value: 0, label: "Doesn't matter to me" },
];

// 21.4 screen 1's three fixed parts, in order, plus the scope line.
// Copy-voice pass applied (2026-07-17): the "what it does" line now
// carries the seven topics AND the no-hard-filter limit inline (this
// retired the separate topics line and the scope line's own "never show
// me X" sentence — same substance, one home each, no duplication). The
// remaining scope sentence is the eligibility boundary (21.7), kept
// verbatim apart from the site-wide "Fit index" casing fix.
const CUSTOM_INTRO_WHAT =
  "Seven quick questions — community, nature, making a living, pace, cost, visas, and room for company — and the same facts every visitor sees get weighed by what matters to you, not by which of the eight examples you most resemble. One limit, worth knowing up front: this tips scales, it doesn't hide places. You can't tell it “never show me X” — only “this matters more, that matters less.” Every place stays on the map.";
const CUSTOM_INTRO_HONESTY =
  "Seven answers make a quick sketch of what you care about, not a full profile. Read the result as a rough first fit, not a verdict.";
const CUSTOM_INTRO_FALLBACK =
  "A fuller version is coming — one where you set every priority yourself, not just these seven.";
const CUSTOM_INTRO_SCOPE =
  "It builds a Fit index, not a visa verdict; no eligibility check runs off these answers.";

export function initPerspectiveDoor() {
  // §8AA.4: delete on sight, every load this module ever runs on,
  // regardless of whether the door itself shows this visit — "the door's
  // own init code," per the ruling, means this function, not just its
  // show branch.
  markSeenLegacyKeyRemoved();

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

  // 25.2/§8AA.2/§8AA.1: dismissing to the no-lens state. If there was a
  // real lens (a saved custom profile or a saved PERSONA choice) that
  // this dismissal is setting aside, that's td12's own mandatory middle
  // state — set the session flag AND do a full reload, since main()'s
  // own render may already be under way (or finished) using the
  // still-precedent-active stored lens; an in-place overlay removal alone
  // wouldn't retroactively fix an already-painted page. A genuinely fresh
  // dismissal (nothing saved to set aside) stays a cheap in-place close,
  // unchanged from before this rework — no reload, no write.
  const dismissWithoutPersona = () => {
    const priorSaved = loadSavedPerspective();
    const hadLensToSetAside = hasCustomProfile()
      || (priorSaved && priorSaved.kind === "persona" && VALID_PERSONAS.includes(priorSaved.persona_id));
    if (hadLensToSetAside) {
      saveSavedPerspective("none", null);
      setExplicitGeneral();
      location.href = location.pathname + location.hash;
      return;
    }
    overlay.remove();
    unfog();
  };

  function renderMainScreen() {
    const descriptor = savedPerspectiveDescriptor();
    const resumeHtml = descriptor
      ? `
        <div class="door-resume">
          <p class="door-resume-line">Welcome back — continue ${escapeHtml(descriptor)}.</p>
          <button type="button" class="door-escape door-resume-continue" id="door-continue">Continue ${escapeHtml(descriptor)}</button>
          <div class="door-resume-controls">
            <button type="button" class="door-link-btn" id="door-switch">${escapeHtml(SWITCH_LABEL)}</button>
            ${hasAnySavedReaderState() ? `<button type="button" class="door-link-btn" id="door-forget-resume">${escapeHtml(FORGET_LABEL)}</button>` : ""}
          </div>
        </div>
      `
      : "";

    panel.innerHTML = `
      <p class="door-welcome">${escapeHtml(WELCOME_LINE)}</p>
      ${resumeHtml}
      <div class="door-wings" id="door-wings">
        <button type="button" class="door-wing" data-wing="passport">
          <span class="door-portrait door-portrait-icon">${PASSPORT_TILE_ICON}</span>
          <span class="door-wing-label">${escapeHtml(WING_PASSPORT_LABEL)}</span>
          <span class="door-wing-subline">${escapeHtml(WING_PASSPORT_SUBLINE)}</span>
        </button>
        <button type="button" class="door-wing" data-wing="priorities">
          <span class="door-portrait door-portrait-icon">${CUSTOM_TILE_ICON}</span>
          <span class="door-wing-label">${escapeHtml(WING_PRIORITIES_LABEL)}</span>
          <span class="door-wing-subline">${escapeHtml(WING_PRIORITIES_SUBLINE)}</span>
        </button>
      </div>
      <div class="door-persona-row">
        <p class="door-persona-row-heading">${escapeHtml(PERSONA_ROW_HEADING)}</p>
        <div class="door-tiles">${tilesHtml()}</div>
      </div>
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
        saveSavedPerspective("persona", persona);
        clearExplicitGeneral();
        location.href = withPersona(location.pathname + location.hash, { persona });
      };
      btn.addEventListener("click", choose);
      btn.addEventListener("keydown", (e) => { if (isActivationKey(e)) { e.preventDefault(); choose(); } });
    });

    const passportWing = panel.querySelector('.door-wing[data-wing="passport"]');
    const openPassport = () => renderPassportBox();
    passportWing.addEventListener("click", openPassport);
    passportWing.addEventListener("keydown", (e) => { if (isActivationKey(e)) { e.preventDefault(); openPassport(); } });

    const prioritiesWing = panel.querySelector('.door-wing[data-wing="priorities"]');
    const openIntro = () => renderIntro();
    prioritiesWing.addEventListener("click", openIntro);
    prioritiesWing.addEventListener("keydown", (e) => { if (isActivationKey(e)) { e.preventDefault(); openIntro(); } });

    panel.querySelector("#door-escape").addEventListener("click", dismissWithoutPersona);

    const continueBtn = panel.querySelector("#door-continue");
    if (continueBtn) {
      continueBtn.addEventListener("click", () => {
        // 25.2: activating the offer applies the perspective through the
        // SAME mechanisms every other door choice already uses — a
        // ?persona= reload for a saved persona, a plain reload otherwise
        // (getActivePersona()'s own precedence then resolves the rest:
        // custom profile if one exists, general otherwise). Choosing a
        // lens IS leaving the general view (§8AA.2) — clear the flag
        // either way, even if it wasn't set, harmless.
        clearExplicitGeneral();
        const savedPersp = loadSavedPerspective();
        if (savedPersp && savedPersp.kind === "persona" && VALID_PERSONAS.includes(savedPersp.persona_id)) {
          location.href = withPersona(location.pathname + location.hash, { persona: savedPersp.persona_id });
        } else {
          location.href = location.pathname + location.hash;
        }
      });
    }
    const switchBtn = panel.querySelector("#door-switch");
    if (switchBtn) {
      // "Scrolls focus to the wings — no data touched" (25.2): purely a
      // focus/scroll affordance, zero storage writes.
      switchBtn.addEventListener("click", () => {
        const wings = panel.querySelector("#door-wings");
        wings.querySelector(".door-wing")?.focus();
        wings.scrollIntoView({ block: "nearest" });
      });
    }
    const forgetResumeBtn = panel.querySelector("#door-forget-resume");
    if (forgetResumeBtn) {
      wireForgetControl(forgetResumeBtn, {
        onDone: () => { location.href = location.pathname + location.hash; },
      });
    }

    // 25.2: keyboard focus starts on the resume band's own continue
    // button when one renders; a fresh visitor (no band) starts on the
    // first wing instead. Never an empty/missing focus target either way.
    (continueBtn || panel.querySelector(".door-wing"))?.focus();
  }

  // Wing 1 interior (25.5) — one screen, no multi-step wizard. Native
  // <select>, full ISO list, deliberately: ~250 options is exactly what
  // OS-level pickers already handle with built-in type-ahead, especially
  // on mobile (the device class that surfaced the original build-your-
  // own dead end this whole door rework fixes) — a custom combobox is a
  // real accessibility project this v1 doesn't need.
  function renderPassportBox() {
    const codes = Object.keys(ISO_COUNTRY_NAMES).sort(
      (a, b) => ISO_COUNTRY_NAMES[a].localeCompare(ISO_COUNTRY_NAMES[b])
    );
    const optionsHtml = codes
      .map((code) => `<option value="${code}">${escapeHtml(ISO_COUNTRY_NAMES[code])}</option>`)
      .join("");
    const existing = loadNationality();

    panel.innerHTML = `
      <button type="button" class="door-back" id="door-back">&lsaquo; Back</button>
      <div class="door-passport-box">
        <h2 class="door-passport-heading">${escapeHtml(PASSPORT_BOX_HEADING)}</h2>
        <p class="door-passport-scope">${escapeHtml(PASSPORT_BOX_SCOPE)}</p>
        <label for="door-nationality-select">Your nationality</label>
        <select id="door-nationality-select">
          <option value="" disabled${existing ? "" : " selected"}>${escapeHtml(PASSPORT_PLACEHOLDER_OPTION)}</option>
          ${optionsHtml}
        </select>
        <p class="door-dual-citizen-line">${escapeHtml(DUAL_CITIZEN_LINE)}</p>
        <button type="button" class="door-escape door-passport-save" id="door-passport-save" disabled>${escapeHtml(PASSPORT_SAVE_LABEL)}</button>
        <p class="door-passport-more">${escapeHtml(PASSPORT_MORE_LINE)}</p>
        <p class="door-passport-footer">${escapeHtml(PASSPORT_SCOPE_FOOTER)}</p>
      </div>
    `;
    const select = panel.querySelector("#door-nationality-select");
    if (existing && ISO_COUNTRY_NAMES[existing.code]) select.value = existing.code;
    const saveBtn = panel.querySelector("#door-passport-save");
    const syncSave = () => { saveBtn.disabled = !select.value; };
    select.addEventListener("change", syncSave);
    syncSave();

    panel.querySelector("#door-back").addEventListener("click", renderMainScreen);
    saveBtn.addEventListener("click", () => {
      if (!select.value) return;
      // §8Z item 5 / §8AA.5: personal fields never serialize into URLs —
      // localStorage only. Nothing below ever touches
      // URLSearchParams/location.search with this value; the full reload
      // reads it back from storage on the next page build.
      saveNationality(select.value);
      // §8AA.2: choosing the passport lens IS leaving the general view.
      clearExplicitGeneral();
      location.href = location.pathname + location.hash;
    });
    select.focus();
  }

  function renderIntro() {
    panel.innerHTML = `
      <button type="button" class="door-back" id="door-back">&lsaquo; Back</button>
      <div class="door-disclosure">
        <p>${escapeHtml(CUSTOM_INTRO_WHAT)}</p>
        <p class="door-intro-list">${escapeHtml(CUSTOM_INTRO_SCOPE)}</p>
        <p>${escapeHtml(CUSTOM_INTRO_HONESTY)}</p>
        <p>${escapeHtml(CUSTOM_INTRO_FALLBACK)}</p>
      </div>
      <button type="button" class="door-escape door-start" id="door-start">Start</button>
    `;
    panel.querySelector("#door-back").addEventListener("click", renderMainScreen);
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
      // §8AA.1: this is now a real, explicit door choice — record it as
      // the door's own memory, same as choosing a named persona does.
      saveSavedPerspective("custom", null);
      clearExplicitGeneral();
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
    renderMainScreen();
  }

  // Basic modal keyboard support: focus starts inside the dialog, Escape
  // dismisses via the same no-persona path as the escape-hatch link,
  // regardless of which screen is currently showing — a real, if
  // partial, accessibility pass (full focus-trap looping is NOT built
  // here, named as a gap rather than silently left unstated).
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); dismissWithoutPersona(); }
  });
}
