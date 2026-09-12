// CanILiveThere — the door. One box, one process, and submit opens the map.
//
// DOOR V2. What changed and why, because the shape of this file is the
// whole point:
//
//   BEFORE: three wing cards — "Your passport", "Your priorities", "Your
//   numbers" — three separate entries into three separate flows, each
//   ending its own way. A reader's passport, priorities and numbers are
//   one job, and the door asked them as three, joined by "or".
//
//   NOW: one entry card, "Be you", opening one three-step process —
//   numbers, then priorities, then passport, in that order because income
//   and preferences are what move the answer most. Every step is
//   skippable and nothing is mandatory. One submit, "See the world",
//   which closes the box in place and re-renders the map underneath from
//   what the reader gave. No second page, no result screen, no dead end.
//
//   AND THE PART THE SHORTHAND DROPS: the profile BAR goes; the eight
//   worked examples DO NOT. They stay exactly where they were, open,
//   below the entry card, at the same size, with the same portraits and
//   the same descriptors — the secondary, exploratory option this shape
//   needs. A reader who came to see a worked example must not have to
//   scroll past a form to find one.
//
// index.html-only by construction: this module is only ever imported by
// js/map.js, which only index.html loads. Every other page reaches the
// door through the corner control, which navigates here with ?reopen=1.
//
// Reads the SAME source as everything else that names the eight
// (VALID_PERSONAS order + the shared descriptor strings, both in
// app-shared.js) — one true source, several renderings.

import {
  VALID_PERSONAS, personaDescriptorSentence, withPersona, escapeHtml, isActivationKey,
  hasCustomProfile, loadCustomProfile, saveCustomProfile,
  loadNationality, saveNationality, loadSavedPerspective, saveSavedPerspective,
  setExplicitGeneral, clearExplicitGeneral,
  hasAnySavedReaderState, wireForgetControl,
  isDoorAnswered, markDoorAnswered, loadOwnNumbers,
  saveOwnNumbersForVisit, saveOwnNumbers,
  clearOwnNumbers, hasDurableOwnNumbers,
  isReaderStorageAvailable, CUSTOM_TILE_ICON, REOPEN_FLAG,
} from "./app-shared.js";
import { loadStore, defaultWeightForCriterion } from "./data.js";
import {
  createOwnNumbersStep, SAVE_LABEL, SAVE_NOTE, SAVE_UNAVAILABLE_LINE,
} from "./own-numbers.js";
import { ISO_COUNTRY_NAMES } from "./iso-names.js";
import { siteUrl } from "./site-root.js";

// Retired as a show/don't-show gate; the only remaining code that reads
// this name is the one-line deletion below.
const DOOR_SEEN_KEY = "door-seen";

// Part 34.3: the site identity the hidden topbar carries while the door
// is open. Static text, never a link — a brand link from an open,
// unanswered door reloads index.html, which re-summons the door.
const DOOR_BRAND_LINE = "CanILiveThere";

// REPLACED. The shipped line opened "A visa rule, a rent number, a safety
// record — they read the same to everyone" and then offered the reader
// three things joined by "or". It was built on a false premise: a visa
// rule does not read the same to everyone — a passport is exactly what
// makes it read differently. The replacement states the offer and the reward, names the
// three things as one process rather than three choices, and says up
// front that every part of it is optional.
const WELCOME_LINE =
  "Want to see the world as it looks for you? Tell the site what you live on, what matters to you and what passport you hold — as much or as little as you like — and the map opens for you.";
const ESCAPE_HATCH_LABEL = "See the facts as they are.";

// The one entry card. "Be you" is one half of a two-part choice — be
// you, or be one of the friendly neighbourhood test profiles — and the
// persona row below is the other half, which is why neither needs to
// explain the other.
const ENTRY_CARD_LABEL = "Be you";
const ENTRY_CARD_SUBLINE =
  "What you live on, what matters to you, your passport — one quick process, every step optional. Nothing you enter leaves this browser.";

// Unchanged: it already reads as the alternative.
const PERSONA_ROW_HEADING = "Or compare against eight worked examples — fictional people, real rules.";

// The three step headings. The position is carried
// inline in the heading, never as a separate progress element.
const STEP_HEADINGS = [
  "Your numbers — 1 of 3",
  "Your priorities — 2 of 3",
  "Your passport — 3 of 3",
];

// The step controls, at equal reading weight. "Skip
// this" is never disabled: a step the reader skips commits nothing for
// that dimension, and the site uses the general figures for it.
const NEXT_LABEL = "Next";
const SKIP_LABEL = "Skip this";
const SUBMIT_LABEL = "See the world";
const SKIP_AND_SUBMIT_LABEL = "Skip this and see the world";
const BACK_LABEL = "‹ Back";

// Step 3's interior — the passport picker, transported verbatim.
const PASSPORT_BOX_SCOPE = "One real thing about you, and the entry rules on this site re-read themselves around it.";
const DUAL_CITIZEN_LINE = "Holding more than one passport? Check each — the better answer wins.";
const PASSPORT_ABSENCE_BEFORE = "Don't see your passport? We haven't verified its rules yet — tell us at ";
const PASSPORT_ABSENCE_LINK_TEXT = "our contact page";
const PASSPORT_ABSENCE_AFTER = " and we'll research it.";
const PASSPORT_MORE_LINE = "That's the whole form — one passport, nothing else about you.";
const PASSPORT_SCOPE_FOOTER = "This reads entry rules from your passport — nothing more.";
const PASSPORT_PLACEHOLDER_OPTION = "Choose a passport…";

const FORGET_LABEL = "Forget what I've saved here";
const SWITCH_LABEL = "Switch or start over";

// REWORDED — the return greeting. "Your saved view" described the band;
// "Welcome back." greets the reader, which is the point of a greeting.
// The state sentence below it is unchanged — a fact ABOUT
// the reader, never an instruction FROM the site. "Want to make changes?"
// is not asked in words because the entry card and the eight tiles are
// sitting directly beneath it, pre-filled: the box IS the change surface.
const RESUME_KICKER_LABEL = "Welcome back.";
const RESUME_CONTINUE_LABEL = "Continue where you left off";

// The keep-switch's own home. AUTHORED PLACEMENT, flagged: the spec has
// the durable save as a switch the reader turns on "after you've seen the
// map" and does not say where it lives. It lives
// here, on the door's main screen, beside the resume band — which is the
// one surface a reader reaches AFTER the map, through the corner control,
// and the surface that already carries the other control over their saved
// state. It renders only while there is something to keep: figures
// carried for this visit that the device is not already holding.
const KEEP_HEADING = "Your figures are here for this visit.";
// The switch's SECOND state, needed once un-ticking un-saves. That fix
// makes un-ticking un-save, so the switch has to stay on screen once it is
// ticked; the heading above it then goes on saying "for this visit" about
// figures the device is holding, which is the same false-by-one-state
// shape F2 itself was. No instruction in the heading: SAVE_NOTE already
// says what the switch does.
const KEEP_HEADING_KEPT = "Your figures are kept on this device.";

function portraitSrc(id) {
  return `assets/portraits/${id}.png`;
}

function personaDisplayName(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

// 25.2: ?persona= deep links still bypass the door — an explicit signal
// beats the ritual. clt-door-answered (sessionStorage, set by every
// completion path) is the visit-scoped "already met the door" state.
function shouldShowDoor() {
  const params = new URLSearchParams(location.search);
  if (params.has("persona")) return false;
  return !isDoorAnswered();
}

// §8AA.1/25.4: the compound phrase the resume band names in two places.
// Every saved dimension named at once — a reader who saved a passport AND
// built priorities sees both named, not just one. Now also names figures,
// because under one process figures are a dimension of the same answer
// and a band that silently omitted them would under-describe what the
// reader has on this device.
function savedPerspectiveDescriptor() {
  const savedPersp = loadSavedPerspective();
  const nationality = loadNationality();
  const nationalityName = nationality ? ISO_COUNTRY_NAMES[nationality.code] : null;

  let lensKind = null;
  let personaName = null;
  if (savedPersp && savedPersp.kind === "persona" && VALID_PERSONAS.includes(savedPersp.persona_id)) {
    lensKind = "persona";
    personaName = personaDisplayName(savedPersp.persona_id);
  } else if (hasCustomProfile()) {
    lensKind = "priorities";
  }

  if (!lensKind && !nationalityName) return null;
  return { lensKind, personaName, nationalityName };
}

// 29.2B/29.2D: the shared fragment+verb pair every resume-band string is
// built from — one branch per saved combination.
function resumeStateParts(descriptor) {
  const { lensKind, personaName, nationalityName } = descriptor;
  if (lensKind === "persona" && nationalityName) {
    return { fragment: `${personaName}'s example and a ${nationalityName} passport`, verb: "are" };
  }
  if (lensKind === "priorities" && nationalityName) {
    return { fragment: `Your own priorities and a ${nationalityName} passport`, verb: "are" };
  }
  if (lensKind === "persona") {
    return { fragment: `${personaName}'s example`, verb: "is" };
  }
  if (lensKind === "priorities") {
    return { fragment: "Your own priorities", verb: "are" };
  }
  if (nationalityName) {
    return { fragment: `A ${nationalityName} passport`, verb: "is" };
  }
  return null;
}

function buildResumeStateSentence(descriptor) {
  const parts = resumeStateParts(descriptor);
  return parts ? `${parts.fragment} ${parts.verb} saved on this device.` : null;
}

function buildResumeAriaFragment(descriptor) {
  const parts = resumeStateParts(descriptor);
  return parts ? parts.fragment : null;
}

function markSeenLegacyKeyRemoved() {
  // §8AA.4: delete on sight, not "ignore forever".
  try { localStorage.removeItem(DOOR_SEEN_KEY); } catch (e) {}
}

function tilesHtml() {
  // Eight named personas, unchanged order/size/portraits/descriptors.
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
// Medium-High weight-class criteria. Unchanged.
const CUSTOM_QUESTIONS = [
  { criterion_id: "community-social-fabric", question: "How much does being part of a real community — neighbors who know you, a social life that comes easily — matter to you?" },
  { criterion_id: "nature-water-adjacency", question: "How much do mountains, water, or green space right outside your door matter to you?" },
  { criterion_id: "income-viability", question: "How much does being able to actually earn a living there matter to you?" },
  { criterion_id: "routine-sustainability-pace-of-life", question: "How much does it matter to you that daily life there just works — simple errands, reliable services, a routine that doesn't fall apart with the seasons?" },
  { criterion_id: "cost-of-living-affordability", question: "How much does your money going further — rent, groceries, the ordinary bills — matter to you?" },
  { criterion_id: "visa-legal-pathway-ease", question: "How much does simple paperwork — a visa that's easy to get and easy to keep, whether for a season or for good — matter to you?" },
  { criterion_id: "room-for-others-group-viability", question: "How much does having room for friends or family to join you later matter to you?" },
];
const TIER_CHOICES = [
  { value: 3, label: "A lot" },
  { value: 2, label: "Some" },
  { value: 1, label: "Not much" },
  { value: 0, label: "Not at all" },
];

// The priorities INTRO SCREEN is retired as a screen: a
// screen between the reader and the questions is a step inside a step.
// Its content does not vanish — the scope line and the honesty line are
// the step's own lead paragraphs, verbatim, and the "what it does" line's
// no-hard-filter clause is the one thing a reader must know before
// answering, so it leads.
const PRIORITIES_SCOPE =
  "Seven quick questions — community, nature, making a living, pace, cost, visas, and room for company — and the same facts every visitor sees get weighed by what matters to you, not by which of the eight examples you most resemble. One limit, worth knowing up front: this tips scales, it doesn't hide places. You can't tell it “never show me X” — only “this matters more, that matters less.” Every place stays on the map.";
const PRIORITIES_HONESTY =
  "Seven answers make a quick sketch of what you care about, not a full profile. Read the result as a rough first fit, not a verdict.";
const PRIORITIES_BOUNDARY =
  "It builds a Fit index, not a visa verdict; no eligibility check runs off these answers.";
// RETIRED with the intro screen: "A fuller version is coming — one where
// you set every priority yourself, not just these seven." It is a forward
// promise about a capability the site does not have, and the promise-
// surface rule forbids one. Nothing replaces it.

/**
 * Summon (and own) the door.
 *
 * @param onCommit  called after "See the world" closes the box in place,
 *                  so the map underneath can re-render from what the
 *                  reader just gave. Owned by js/map.js — this module
 *                  navigates nothing on that path.
 * @returns { open } — the corner control's handle.
 */
export function initPerspectiveDoor({ onCommit } = {}) {
  markSeenLegacyKeyRemoved();

  const params = new URLSearchParams(location.search);
  // The corner control's one-shot flag, in the exact
  // shape of the shipped ?edit-priorities=1 — read once, stripped from the
  // URL, never stored, carrying no reader data of any kind.
  const reopenRequested = params.get(REOPEN_FLAG) === "1";
  // The legacy flag still works: it used to be set by "Edit your answers"
  // in the profile bar, which is gone, but a bookmarked or in-flight URL
  // should still land somewhere sensible. It now opens step 2 of the one
  // process rather than a standalone questionnaire.
  const editRequested = params.get("edit-priorities") === "1";

  if (reopenRequested || editRequested) {
    // Strip the one-shot flags so a later reload doesn't reopen unasked.
    try {
      const url = new URL(location.href);
      url.searchParams.delete(REOPEN_FLAG);
      url.searchParams.delete("edit-priorities");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch (e) {}
  }

  const mapRoot = document.getElementById("map-root");
  let overlay = null;
  let panel = null;

  // The reader's answers for THIS pass through the process, held in
  // memory and committed at flow exit (Part 35's commit-on-exit). A step
  // the reader skipped leaves its slot null and commits nothing, which is
  // what makes "the site uses the general figures for it" literally true
  // rather than a claim about an empty write.
  let flow = { numbers: null, answers: null, nationality: null };

  function fog() {
    if (mapRoot) mapRoot.classList.add("map-fogged");
    document.body.classList.add("door-open");
  }
  function unfog() {
    if (mapRoot) mapRoot.classList.remove("map-fogged");
    document.body.classList.remove("door-open");
  }

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "perspective-door";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Tell the site who's asking");
    overlay.innerHTML = `<div class="door-panel" id="door-panel" tabindex="-1"></div>`;
    document.body.appendChild(overlay);
    panel = overlay.querySelector("#door-panel");
    // Escape dismisses via the same no-lens path as the escape hatch,
    // whichever screen is showing. Full focus-trap looping is NOT built
    // here — named as a gap rather than silently left unstated.
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); leaveWithoutLens(); }
    });
  }

  function closeInPlace() {
    if (overlay) { overlay.remove(); overlay = null; panel = null; }
    unfog();
  }

  // ------------------------------------------------------------------
  // Flow exit — the one place anything the reader gave is written.
  // ------------------------------------------------------------------
  function commitFlow() {
    let committed = false;
    if (flow.numbers) {
      // The VISIT-scoped write. Durable keeping is the reader's own
      // switch, on the main screen, after they have seen the map — which
      // is exactly what the privacy paragraph on step 1 promises.
      saveOwnNumbersForVisit(flow.numbers);
      // ...but if the reader ALREADY turned that switch on, new figures
      // replace the kept ones. Without this, a reader who saved, came
      // back and changed their income would leave the OLD figures on the
      // device while the switch showed unticked — kept without knowing
      // it, which is F2's defect wearing different clothes. The answered
      // fields only; the durable copy owns its own timestamps.
      if (hasDurableOwnNumbers()) {
        saveOwnNumbers({
          amount: flow.numbers.amount,
          currency: flow.numbers.currency,
          period: flow.numbers.period,
          income_type: flow.numbers.income_type,
          duration_band: flow.numbers.duration_band,
          ...(flow.numbers.property_capital ? { property_capital: flow.numbers.property_capital } : {}),
        });
      }
      committed = true;
    }
    if (flow.answers) {
      // A subset commits. The all-seven-required gate is retired: a
      // reader who answers three questions has told the site three true
      // things, and refusing to store them because there are four more is
      // the site holding its own form hostage. The untouched criteria
      // take their own site-wide default weight, never zero and never an
      // absent key.
      saveCustomProfile(flow.answers.weights, flow.answers.answers);
      committed = true;
    }
    if (flow.nationality) {
      saveNationality(flow.nationality);
      committed = true;
    }
    if (committed) {
      saveSavedPerspective("custom", null);
      clearExplicitGeneral();
    }
    flow = { numbers: null, answers: null, nationality: null };
    return committed;
  }

  // "See the world" — the one submit. Commits, closes in place, and hands
  // the map back to js/map.js to re-render. A reload would paint the old
  // map for a frame before the reader's own one arrived; a reveal does
  // not, and the reveal is the point.
  function seeTheWorld() {
    commitFlow();
    markDoorAnswered();
    closeInPlace();
    // The map re-renders either way. A reader who gave nothing at all
    // lands exactly where the escape hatch lands — the disclosed no-lens
    // map — and the perspective line says so in its own words.
    if (typeof onCommit === "function") onCommit();
  }

  // Escape, and the escape hatch. Keeps whatever was explicitly answered
  // (Part 35.1's own ruling) and then goes to the disclosed no-lens map.
  // A reader with nothing saved and nothing answered writes nothing at
  // all — zero writes, which is the check Part 35.10 item 1 states.
  function leaveWithoutLens() {
    const committed = commitFlow();
    const priorSaved = loadSavedPerspective();
    const hadLensToSetAside = !committed && (hasCustomProfile()
      || loadOwnNumbers()
      || (priorSaved && priorSaved.kind === "persona" && VALID_PERSONAS.includes(priorSaved.persona_id)));
    markDoorAnswered();
    if (hadLensToSetAside) {
      // Viewing plainly and forgetting permanently are two different
      // acts: the lens is set aside for this visit, not deleted, and the
      // perspective line says so in those words.
      saveSavedPerspective("none", null);
      setExplicitGeneral();
      location.href = location.pathname + location.hash;
      return;
    }
    closeInPlace();
    if (typeof onCommit === "function") onCommit();
  }

  // ------------------------------------------------------------------
  // Screen: the main screen
  // ------------------------------------------------------------------
  function renderMainScreen() {
    const descriptor = savedPerspectiveDescriptor();
    const stateSentence = descriptor ? buildResumeStateSentence(descriptor) : null;
    const ariaFragment = descriptor ? buildResumeAriaFragment(descriptor) : null;
    // F2: the switch renders whenever there are figures in play at all,
    // not only while they are visit-only. The old condition made the
    // control delete itself the instant it was used — it asked "are these
    // figures visit-only?", which a successful save makes false — so
    // there was no untick to wire and a stranger's income went durable
    // one-way. (That predicate is gone; see app-shared.js's note.)
    const keepBlock = loadOwnNumbers() ? keepSwitchHtml() : "";
    const forgetBtn = hasAnySavedReaderState()
      ? `<button type="button" class="door-link-btn" id="door-forget-resume">${escapeHtml(FORGET_LABEL)}</button>`
      : "";

    const resumeHtml = descriptor
      ? `
        <div class="door-resume">
          <p class="door-resume-kicker">${escapeHtml(RESUME_KICKER_LABEL)}</p>
          <p class="door-resume-line">${escapeHtml(stateSentence)}</p>
          <button type="button" class="door-escape door-resume-continue" id="door-continue" aria-label="${escapeHtml(`${RESUME_CONTINUE_LABEL} — ${ariaFragment}`)}">${escapeHtml(RESUME_CONTINUE_LABEL)}</button>
          ${keepBlock}
          <div class="door-resume-controls">
            <button type="button" class="door-link-btn" id="door-switch">${escapeHtml(SWITCH_LABEL)}</button>
            ${forgetBtn}
          </div>
        </div>
      `
      // Figures carried for this visit are reader state but not a lens,
      // so they build no resume band. They still need both controls — the
      // one that keeps them and the one that clears them.
      : (keepBlock || forgetBtn)
        ? `
        <div class="door-resume">
          ${keepBlock}
          <div class="door-resume-controls">${forgetBtn}</div>
        </div>
      `
        : "";

    panel.innerHTML = `
      <p class="door-brand">${escapeHtml(DOOR_BRAND_LINE)}</p>
      <p class="door-welcome">${escapeHtml(WELCOME_LINE)}</p>
      ${resumeHtml}
      <div class="door-wings door-wings-single" id="door-wings">
        <button type="button" class="door-wing" data-wing="be-you">
          <span class="door-portrait door-portrait-icon">${CUSTOM_TILE_ICON}</span>
          <span class="door-wing-label">${escapeHtml(ENTRY_CARD_LABEL)}</span>
          <span class="door-wing-subline">${escapeHtml(ENTRY_CARD_SUBLINE)}</span>
        </button>
      </div>
      <div class="door-persona-row">
        <p class="door-persona-row-heading">${escapeHtml(PERSONA_ROW_HEADING)}</p>
        <div class="door-tiles">${tilesHtml()}</div>
      </div>
      <button type="button" class="door-escape" id="door-escape">${escapeHtml(ESCAPE_HATCH_LABEL)}</button>
    `;

    // No entry ever renders a broken-image icon: a failed portrait load
    // removes the <img>, leaving the neutral circle showing through.
    panel.querySelectorAll(".door-portrait-img").forEach((img) => {
      img.addEventListener("error", () => img.remove());
    });

    panel.querySelectorAll(".door-tile[data-persona]").forEach((btn) => {
      const choose = () => {
        const persona = btn.dataset.persona;
        saveSavedPerspective("persona", persona);
        clearExplicitGeneral();
        markDoorAnswered();
        location.href = withPersona(location.pathname + location.hash, { persona });
      };
      btn.addEventListener("click", choose);
      btn.addEventListener("keydown", (e) => { if (isActivationKey(e)) { e.preventDefault(); choose(); } });
    });

    const entryCard = panel.querySelector('.door-wing[data-wing="be-you"]');
    const openFlow = () => renderStep(1);
    entryCard.addEventListener("click", openFlow);
    entryCard.addEventListener("keydown", (e) => { if (isActivationKey(e)) { e.preventDefault(); openFlow(); } });

    panel.querySelector("#door-escape").addEventListener("click", leaveWithoutLens);

    const continueBtn = panel.querySelector("#door-continue");
    if (continueBtn) {
      continueBtn.addEventListener("click", () => {
        clearExplicitGeneral();
        markDoorAnswered();
        const savedPersp = loadSavedPerspective();
        if (savedPersp && savedPersp.kind === "persona" && VALID_PERSONAS.includes(savedPersp.persona_id)) {
          location.href = withPersona(location.pathname + location.hash, { persona: savedPersp.persona_id });
        } else {
          closeInPlace();
          if (typeof onCommit === "function") onCommit();
        }
      });
    }
    const switchBtn = panel.querySelector("#door-switch");
    if (switchBtn) {
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
    wireKeepSwitch();

    // 25.2: focus starts on the resume band's continue button when one
    // renders; a fresh visitor starts on the entry card. Part 31:
    // preventScroll, so native focus-scroll can't carry the welcome line
    // out of view on a short viewport.
    (continueBtn || panel.querySelector(".door-wing"))?.focus({ preventScroll: true });
  }

  // The durable-save switch. Off by default, always — the reader has to
  // reach for it, which is the strongest form the site's zero-backend
  // posture can take on the one field it would most like to keep.
  function keepSwitchHtml() {
    const available = isReaderStorageAvailable();
    // The tick mark IS the state of the device, read fresh on every
    // render — not a local flag the handler sets. A checkbox whose
    // checked-ness is a guess about what is stored is the same class of
    // lie as a switch with no un-save behind it.
    const kept = hasDurableOwnNumbers();
    return `
      <div class="own-save" id="door-keep-block">
        <p class="door-resume-line">${escapeHtml(kept ? KEEP_HEADING_KEPT : KEEP_HEADING)}</p>
        <label class="priority-choice own-choice">
          <input type="checkbox" id="door-keep-toggle"${kept ? " checked" : ""}${available ? "" : " disabled"}>
          <span>${escapeHtml(SAVE_LABEL)}</span>
        </label>
        <p class="own-field-note">${escapeHtml(SAVE_NOTE)}</p>
        ${available ? "" : `<p class="own-field-note">${escapeHtml(SAVE_UNAVAILABLE_LINE)}</p>`}
      </div>`;
  }

  function wireKeepSwitch() {
    const toggle = panel.querySelector("#door-keep-toggle");
    if (!toggle) return;
    toggle.addEventListener("change", () => {
      if (!toggle.checked) {
        // THE UN-SAVE FIX. This branch used to be a bare
        // `return` — the un-save path went out with the retired result
        // screen and nothing replaced it, so clearOwnNumbers() sat in
        // app-shared.js with zero call sites and a stranger's income went
        // durable one-way. The durable copy goes; the visit-scoped copy
        // stays, because the reader unticked "keep this", not "forget
        // this" — see clearOwnNumbers()'s own note. The map they are
        // looking at does not change, and next visit there is nothing
        // left to resume from.
        clearOwnNumbers();
        renderMainScreen();
        return;
      }
      const numbers = loadOwnNumbers();
      if (!numbers) return;
      // Copy the visit-scoped figures into the durable store, field for
      // field — never the stored object, which carries timestamps the
      // durable copy owns for itself.
      const ok = saveOwnNumbers({
        amount: numbers.amount,
        currency: numbers.currency,
        period: numbers.period,
        income_type: numbers.income_type,
        duration_band: numbers.duration_band,
        ...(numbers.property_capital ? { property_capital: numbers.property_capital } : {}),
      });
      if (!ok) {
        toggle.checked = false;
        toggle.disabled = true;
        return;
      }
      renderMainScreen();
    });
  }

  // ------------------------------------------------------------------
  // The three steps
  // ------------------------------------------------------------------
  //
  // Each is a full-panel re-render behind the shared .door-back control —
  // the same shape the passport picker and the questionnaire already
  // used. The controls are identical on every step and sit at equal
  // reading weight, because "Skip this" is a real answer and a secondary
  // button that looks like an apology is not an offer.

  function stepControlsHtml(step, primaryDisabled) {
    const isLast = step === 3;
    return `
      <div class="door-step-controls">
        <button type="button" class="door-escape door-step-primary" id="door-step-next"${primaryDisabled ? " disabled" : ""}>${escapeHtml(isLast ? SUBMIT_LABEL : NEXT_LABEL)}</button>
        <button type="button" class="door-escape door-step-skip" id="door-step-skip">${escapeHtml(isLast ? SKIP_AND_SUBMIT_LABEL : SKIP_LABEL)}</button>
      </div>`;
  }

  function renderStepShell(step, innerHtml, primaryDisabled) {
    panel.innerHTML = `
      <button type="button" class="door-back" id="door-back">${escapeHtml(BACK_LABEL)}</button>
      <h2 class="door-passport-heading">${escapeHtml(STEP_HEADINGS[step - 1])}</h2>
      <div class="door-step-body" id="door-step-body">${innerHtml}</div>
      ${stepControlsHtml(step, primaryDisabled)}
    `;
    // .door-back on step 1 returns to the main screen; on 2 and 3 to the
    // previous step, with its answers intact.
    panel.querySelector("#door-back").addEventListener("click", () => {
      if (step === 1) renderMainScreen();
      else renderStep(step - 1);
    });
  }

  function wireStepControls(step, { commit }) {
    const next = panel.querySelector("#door-step-next");
    const skip = panel.querySelector("#door-step-skip");
    const advance = () => {
      if (step === 3) seeTheWorld();
      else renderStep(step + 1);
    };
    next.addEventListener("click", () => {
      if (next.disabled) return;
      commit();
      advance();
    });
    // Never disabled, and never commits: a half-filled step that is
    // skipped stores nothing for that dimension.
    skip.addEventListener("click", () => {
      clearStep(step);
      advance();
    });
  }

  function clearStep(step) {
    if (step === 1) flow.numbers = null;
    if (step === 2) flow.answers = null;
    if (step === 3) flow.nationality = null;
  }

  function renderStep(step) {
    if (step === 1) return renderNumbersStep();
    if (step === 2) return renderPrioritiesStep();
    return renderPassportStep();
  }

  // ---- step 1 of 3: the numbers ----
  async function renderNumbersStep() {
    const store = await loadStore();
    renderStepShell(1, "", true);
    const body = panel.querySelector("#door-step-body");
    const next = panel.querySelector("#door-step-next");
    // Pre-filled from whatever the reader has on this device or has
    // already typed this pass — reopening the box must never make them
    // type their income twice.
    const prefill = flow.numbers || loadOwnNumbers();
    const stepApi = createOwnNumbersStep({
      container: body,
      store,
      prefill,
      onValidity: (ok) => { next.disabled = !ok; },
    });
    wireStepControls(1, {
      commit: () => { flow.numbers = stepApi.readInput(); },
    });
    panel.focus();
  }

  // ---- step 2 of 3: the priorities ----
  async function renderPrioritiesStep() {
    // The store is awaited BEFORE the step renders, not inside its
    // commit: a commit that has to wait for a fetch is a commit that can
    // lose a race with the reader tapping "Next" — the weights would be
    // null at flow exit and the whole step would vanish silently. Every
    // step in this process resolves what it needs up front, and the
    // promise is already in flight from page load, so this is normally
    // already-resolved rather than a real wait.
    const store = await loadStore();
    const existing = loadCustomProfile();
    const prefillAnswers = (flow.answers && flow.answers.answers)
      || (existing ? existing.answers : null);
    renderStepShell(2, `
      <div class="own-numbers-box">
        <p class="door-passport-scope">${escapeHtml(PRIORITIES_SCOPE)}</p>
        <p class="own-field-note">${escapeHtml(PRIORITIES_BOUNDARY)}</p>
        <p class="own-field-note">${escapeHtml(PRIORITIES_HONESTY)}</p>
        <div class="door-questions">
          ${CUSTOM_QUESTIONS.map((q) => questionRowHtml(q, prefillAnswers)).join("")}
        </div>
      </div>
    `, true);

    const next = panel.querySelector("#door-step-next");
    const answeredAny = () =>
      CUSTOM_QUESTIONS.some((q) => panel.querySelector(`input[name="q-${q.criterion_id}"]:checked`));
    const sync = () => { next.disabled = !answeredAny(); };
    panel.querySelectorAll('input[type="radio"]').forEach((input) => {
      input.addEventListener("change", sync);
    });
    sync();

    wireStepControls(2, {
      commit: () => {
        if (!answeredAny()) { flow.answers = null; return; }
        const answers = {};
        for (const q of CUSTOM_QUESTIONS) {
          const checked = panel.querySelector(`input[name="q-${q.criterion_id}"]:checked`);
          if (checked) answers[q.criterion_id] = checked.value;
        }
        // 8P.1: all 13 criterion_ids present, always — the untouched ones
        // take this criterion's own site-wide weight, never 0 and never an
        // absent key. A reader who answered three of seven gets three
        // real weights and ten site defaults, which is a truthful record
        // of what they said; a vector with ten zeroes in it would not be.
        const weights = {};
        for (const crit of store.criteria) {
          weights[crit.criterion_id] = Object.prototype.hasOwnProperty.call(answers, crit.criterion_id)
            ? Number(answers[crit.criterion_id])
            : defaultWeightForCriterion(crit);
        }
        flow.answers = { answers, weights };
      },
    });
    panel.focus();
  }

  // ---- step 3 of 3: the passport ----
  async function renderPassportStep() {
    const store = await loadStore();
    const tierCodes = new Set(store.nationalityCodes);
    const codes = store.nationalityCodes
      .filter((code) => ISO_COUNTRY_NAMES[code])
      .sort((a, b) => ISO_COUNTRY_NAMES[a].localeCompare(ISO_COUNTRY_NAMES[b]));
    const optionsHtml = codes
      .map((code) => `<option value="${code}">${escapeHtml(ISO_COUNTRY_NAMES[code])}</option>`)
      .join("");
    const existing = flow.nationality ? { code: flow.nationality } : loadNationality();
    // Never preselect a code the current list doesn't offer, and never
    // touch the reader's own saved value either.
    const existingOffered = Boolean(existing) && tierCodes.has(existing.code);

    renderStepShell(3, `
      <div class="door-passport-box">
        <p class="door-passport-scope">${escapeHtml(PASSPORT_BOX_SCOPE)}</p>
        <label for="door-nationality-select">Your nationality</label>
        <select id="door-nationality-select">
          <option value="" disabled${existingOffered ? "" : " selected"}>${escapeHtml(PASSPORT_PLACEHOLDER_OPTION)}</option>
          ${optionsHtml}
        </select>
        <p class="door-passport-absence">${escapeHtml(PASSPORT_ABSENCE_BEFORE)}<a href="${withPersona(siteUrl("contact.html"))}">${escapeHtml(PASSPORT_ABSENCE_LINK_TEXT)}</a>${escapeHtml(PASSPORT_ABSENCE_AFTER)}</p>
        <p class="door-dual-citizen-line">${escapeHtml(DUAL_CITIZEN_LINE)}</p>
        <p class="door-passport-more">${escapeHtml(PASSPORT_MORE_LINE)}</p>
        <p class="door-passport-footer">${escapeHtml(PASSPORT_SCOPE_FOOTER)}</p>
      </div>
    `, !existingOffered);

    const select = panel.querySelector("#door-nationality-select");
    if (existingOffered) select.value = existing.code;
    const next = panel.querySelector("#door-step-next");
    const sync = () => { next.disabled = !select.value; };
    select.addEventListener("change", sync);
    sync();

    wireStepControls(3, {
      // §8Z item 5 / §8AA.5: personal fields never serialize into URLs.
      // Nothing here touches URLSearchParams or location.search with this
      // value; the reader's own storage is the only carrier.
      commit: () => { flow.nationality = select.value || null; },
    });
    select.focus();
  }

  // ------------------------------------------------------------------
  // Open
  // ------------------------------------------------------------------
  function open(screen) {
    ensureOverlay();
    fog();
    if (screen === "priorities") renderStep(2);
    else renderMainScreen();
  }

  if (reopenRequested) open();
  else if (editRequested) open("priorities");
  else if (shouldShowDoor()) open();

  return { open };
}
