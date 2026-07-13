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
// persona set or different wording from each other. Authors no copy of
// its own beyond the two fixed strings below, both already-reviewed
// public-bound copy, transported verbatim.

import { VALID_PERSONAS, personaDescriptorSentence, withPersona, escapeHtml, isActivationKey } from "./app-shared.js";

const DOOR_SEEN_KEY = "door-seen";

// Already-reviewed public-bound copy, transported verbatim, not authored
// in this file.
const WELCOME_LINE =
  "A visa rule, a rent number, a safety record — they read the same to everyone. What they add up to for you doesn't. Pick whoever below comes closest to you, and see what these same facts mean for someone like that.";
const ESCAPE_HATCH_LABEL = "See the facts as they are.";

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

// Trigger condition (Part 10): show only when no persona is already set
// via ?persona= (a deep link, or a returning visitor mid-task) AND no
// stored choice exists yet. Both a tile pick and the escape hatch set
// door-seen, so this only ever fires once per browser, first-arrival.
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
  return true;
}

function markSeen() {
  try { localStorage.setItem(DOOR_SEEN_KEY, "1"); } catch (e) {}
}

export function initPerspectiveDoor() {
  if (!shouldShowDoor()) return;

  const mapRoot = document.getElementById("map-root");
  if (mapRoot) mapRoot.classList.add("map-fogged");

  const overlay = document.createElement("div");
  overlay.id = "perspective-door";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Choose whose eyes to see this map through");

  const tilesHtml = VALID_PERSONAS.map((id) => {
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

  overlay.innerHTML = `
    <div class="door-panel" id="door-panel" tabindex="-1">
      <p class="door-welcome">${escapeHtml(WELCOME_LINE)}</p>
      <div class="door-tiles">${tilesHtml}</div>
      <button type="button" class="door-escape" id="door-escape">${escapeHtml(ESCAPE_HATCH_LABEL)}</button>
    </div>
  `;
  document.body.appendChild(overlay);

  // No entry ever renders a broken-image icon (Part 17's own "no visible
  // placeholder artifact" discipline, same class as the portrait-text
  // hard-placeholder rule elsewhere on this page): a failed portrait load
  // removes the <img>, leaving the neutral circle background (CSS,
  // .door-portrait) showing through instead.
  overlay.querySelectorAll(".door-portrait-img").forEach((img) => {
    img.addEventListener("error", () => img.remove());
  });

  const unfog = () => { if (mapRoot) mapRoot.classList.remove("map-fogged"); };

  overlay.querySelectorAll(".door-tile").forEach((btn) => {
    const choose = () => {
      const persona = btn.dataset.persona;
      markSeen();
      // "Choosing a tile: sets ?persona=X via the existing withPersona()
      // mechanism (zero new routing)" — withPersona()'s own `extra`
      // param overrides whatever getPersona() currently reads, so this
      // is the same function every other persona-setting control on the
      // site already calls, not a new one.
      location.href = withPersona(location.pathname + location.hash, { persona });
    };
    btn.addEventListener("click", choose);
    btn.addEventListener("keydown", (e) => { if (isActivationKey(e)) { e.preventDefault(); choose(); } });
  });

  const escapeBtn = overlay.querySelector("#door-escape");
  const dismissWithoutPersona = () => {
    markSeen();
    overlay.remove();
    unfog();
  };
  escapeBtn.addEventListener("click", dismissWithoutPersona);

  // Basic modal keyboard support: focus starts inside the dialog, Escape
  // dismisses via the same no-persona path as the escape-hatch link. A
  // real, if partial, accessibility pass — full focus-trap looping
  // (Tab wrapping at the dialog's own edges) is NOT built here, named as
  // a gap in the build report rather than silently left unstated.
  //
  // Focuses the PANEL itself (tabindex="-1", not the escape-hatch button
  // at the bottom) — focusing a control below the fold was pulling the
  // welcome line and top tile row out of view via the browser's own
  // automatic scroll-into-view the moment the dialog opened, which
  // directly undermined "read the welcome line and tiles before any
  // choice" (Part 17 item 2). The panel sits at scroll-top 0 already, so
  // focusing it causes no scroll at all.
  const panel = overlay.querySelector("#door-panel");
  panel.focus();
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); dismissWithoutPersona(); }
  });
}
