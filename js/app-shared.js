// CanILiveThere — shared header, persona switcher, and small utilities used
// by every page. No framework, no build step: plain DOM, ES modules loaded
// directly by the browser.

import { topBottomCriteria } from "./data.js";
import { siteUrl } from "./site-root.js";

export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// v7 §7.1: widened from 3 to all 8 locked personas (Amendment 1 §A1.2's
// own widening trigger applies to the whole switcher, not just the three
// that had fixture data first). Exported (v7 Part 10/11): the
// perspective-door tiles and the top-of-page switcher both read this one
// array, in this one order, so the two surfaces can never disagree about
// who exists or what order they come in (Part 11's "one true source, two
// renderings").
export const VALID_PERSONAS = ["waldo", "wenda", "carmen", "adira", "noa", "marek", "marguerite", "teo"];
export function getPersona() {
  const params = new URLSearchParams(location.search);
  const p = params.get("persona");
  return p && VALID_PERSONAS.includes(p) ? p : null;
}

// ---------------------------------------------------------------------
// Reader-preferences localStorage envelope (v11 Part 21, format ruled at
// 8P.3) — the third door's own reader-built weight vector, the
// first occupant of a versioned, namespaced envelope future preferences
// features (custom colors, hidden pins) will get their own sibling key
// inside, not a dedicated flat key each. One bare key ("reader-preferences",
// unprefixed — matches THEME_KEY/DOOR_SEEN_KEY's own existing bare-key
// convention), one JSON object, versioned by an internal `schema_version`
// field rather than the key name (mirrors derived/meta.json's own
// versioning shape). Every touch wrapped in try/catch, failing open to "no
// stored profile, behave as general" — same discipline THEME_KEY/
// DOOR_SEEN_KEY's own read/write functions already use, never a thrown
// error blocking page render for a reader with storage disabled.
// ---------------------------------------------------------------------
const READER_PREFS_KEY = "reader-preferences";
const READER_PREFS_SCHEMA_VERSION = 1;

function readReaderPreferences() {
  try {
    const raw = localStorage.getItem(READER_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // A schema_version mismatch (an old stored blob under a newer site
    // build) fails the same way as no stored value at all — safer than
    // guessing at a shape the running code doesn't recognize; the reader
    // just re-answers the door once (8P.3's own ruled read/write rule).
    if (!parsed || parsed.schema_version !== READER_PREFS_SCHEMA_VERSION) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

// The custom_profile sub-object ({ weights, answers, created_at,
// updated_at }), or null if none is stored / the stored value doesn't
// parse / the version doesn't match.
export function loadCustomProfile() {
  const prefs = readReaderPreferences();
  return prefs && prefs.custom_profile ? prefs.custom_profile : null;
}

// Presence of a valid custom_profile object in the envelope IS the
// completion marker 21.8 item 2 asks for — no separate flag (the ruled
// reconciliation between the two spec authorities this build reads
// from). Used by the door's trigger-condition third clause (21.9) and by
// the switcher's own "Your priorities" entry-detection, both below.
export function hasCustomProfile() {
  const profile = loadCustomProfile();
  return !!(profile && profile.weights);
}

// weights: the 13-key criterion_id -> 0-3 vector (8P.1). answers: the raw
// per-question answer trail (8P.3's own forward-compatibility field, for a
// future "revisit your answers" affordance) — stored alongside the
// computed vector, not instead of it, since the vector is a deterministic
// function of the answers and storing both costs a few dozen bytes.
// created_at is preserved across an edit (only set fresh the first time);
// updated_at always reflects this write. Returns true/false rather than
// throwing, matching this module's fail-open discipline throughout.
export function saveCustomProfile(weights, answers) {
  try {
    const now = new Date().toISOString();
    const existing = readReaderPreferences();
    const createdAt = existing?.custom_profile?.created_at || now;
    const payload = {
      schema_version: READER_PREFS_SCHEMA_VERSION,
      custom_profile: { weights, answers, created_at: createdAt, updated_at: now },
    };
    localStorage.setItem(READER_PREFS_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    return false;
  }
}

// Attaches store.customWeights (or null) onto an already-built store —
// runtime-layered, same category as fixturesByPersona/verdictsByPersona,
// never a derived/ fetch (data.js's own header comment names this
// exception). Must run after loadStore() resolves and before any call to
// store.personaIndex("custom", ...) — call once per page, right after
// awaiting loadStore().
export function applyStoredCustomWeights(store) {
  const profile = loadCustomProfile();
  store.customWeights = profile ? profile.weights : null;
}

// The one place precedence between an explicit URL persona and a stored
// custom weight vector gets decided (8P.2's own ruling) — deliberately
// NOT folded into getPersona() itself, since "custom" is deliberately kept
// out of VALID_PERSONAS (see that export's own comment). URL persona
// always wins (same "explicit signal beats stored state" precedent
// perspective-door.js's own shouldShowDoor() already uses for ?persona=
// vs. door-seen); falls back to "custom" only when no URL persona is set
// AND a stored vector exists; falls back to null (general) otherwise.
export function getActivePersona() {
  const urlPersona = getPersona();
  if (urlPersona) return urlPersona;
  return hasCustomProfile() ? "custom" : null;
}

// Display label for any persona id this site can render, including the
// reserved "custom" identity — one place this mapping lives, so "custom"
// never leaks to a reader as the literal capitalized word "Custom" (which
// a bare `persona.charAt(0).toUpperCase()+...` call would otherwise
// produce at any of this site's several such call sites).
export function personaDisplayLabel(id) {
  if (!id) return "General";
  if (id === "custom") return "Your priorities";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

// The 21.6 item 2 disclosure suffix — appended wherever a custom-weighted
// number renders (map tooltip, Lists column, location-page score readout),
// the same idiom as the existing "(general figures)" suffix elsewhere on
// this site. Placeholder shape, flagged as such in the build record — the
// load-bearing decision is the placement (next to the
// number itself), not these exact five words; a copy-voice pass may revise
// the string without touching any call site.
export const CUSTOM_ESTIMATE_SUFFIX = "your own quick estimate";

// Preserve the persona (and, when given, other params) across internal
// navigation — the brief's "shareable profile URLs" rule, MVP-scoped to a
// query-string persona id since there are no accounts/saved scenarios yet.
export function withPersona(path, extra = {}) {
  const params = new URLSearchParams();
  const persona = getPersona();
  if (persona) params.set("persona", persona);
  for (const [k, v] of Object.entries(extra)) {
    if (v != null) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

// v7 §7.1: the persona switcher's descriptor strings, verbatim from
// this project's own persona-profile source — age, income shape, what
// they want, one honest fear, per persona. Replaces the old three-
// persona "spec sheet" strings (config-line phrasing an outside review
// flagged) — these are the fix, for all eight locked personas at once,
// not just the three that had fixture data first. Markdown bold
// stripped for plain-text rendering only; wording is verbatim from
// source, not reworded here.
const PERSONA_LABELS = {
  waldo: "Waldo — A solo, location-independent worker living on about $2,500 a month with $120,000 saved toward a home — enough to clear most places outright, not enough for many of the popular ones. He wants a real, provable path to stay long-term, not just a good vacation. His fear: picking somewhere that looks affordable right up until the residency paperwork says otherwise.",
  wenda: "Wenda — A 68-year-old retiree living on a $1,900 monthly pension with $95,000 set aside to buy. She's learned the hard way that some places will take her money but not her income type, so what she's really after is somewhere that recognizes a pension as real, qualifying income. Her fear: a country that looks perfect until the paperwork asks where the money comes from.",
  carmen: "Carmen — A 29-year-old freelancer earning about $1,300 a month from client work, with $25,000 put by and no interest in buying — she rents wherever she lands. She's not chasing residency, just somewhere she can legally stay for months at a stretch without a lease turning into a five-year commitment she never asked for. Her fear: a visa door that looks open right up until she learns it never actually leads anywhere.",
  adira: "Adira — A 27-year-old remote worker getting by on around $1,490 a month with barely $27,000 to her name — thin margins, and she knows it. She's open to almost anything, a short stay or a real home, if a place actually earns it, but she's learned her passport sometimes changes the rules in ways nobody mentions upfront. Her fear: a place that would say yes to someone else's passport and no to hers, and finding out only after she's committed.",
  noa: "Noa — Late twenties, maybe thirty, leaving with a modest cushion — about $12,000 — and no job offer yet, just a willingness to start over pulling shifts at a bar or café until something better comes along. She wants what sounds small and isn't: an ordinary week, somewhere nothing is on fire, near people she already loves. Her dog comes too, non-negotiable — a country that would take her but lock him in a month-long quarantine is, to her, simply a country that said no.",
  marek: "Marek — One parent in a family of four — two kids, ages seven and eleven — with a household income around $5,800 a month and $300,000 to buy a real home outright. They didn't leave on a leisurely timeline, and they're not looking for adventure: no super-hot, no super-dangerous, just somewhere safety stops being a question mark. Their fear isn't the unknown in general anymore — it's landing somewhere that turns out to be one more uncertain place, with a hospital too far away if something goes wrong.",
  marguerite: "Marguerite — A 74-year-old widow living on a modest $1,500 pension with $55,000 set aside — not much, but enough if she chooses carefully, since this move likely only happens once. She wants to be warm, to have a small garden of her own, and healthcare she can actually trust with what's left of her life. Her fear isn't missing out on anything — it's choosing somewhere lovely on a good day that turns out to be a hard place to be old, sick, or alone.",
  teo: "Teo — A 34-year-old remote worker with comfortable, unstressed finances — about $3,600 a month, $90,000 in the bank — who's already solved working from anywhere and is now facing a quieter question: does he actually want to keep moving. Three months at a time is his real rhythm, not a placeholder until he can afford to settle, though part of him wonders about a place that's his to return to. His fear: every form and every visa officer treating \"how long are you staying\" as a question with only one right answer, one that keeps getting bigger the longer he keeps coming back.",
};

// One canonical name and definition for the site's central number, reused
// everywhere a reader meets it (map legend, Lists column, location page).
// The name itself ("Fit index") is already the literal text of the Lists
// column header and every tooltip/label below — this is the definition
// that travels with it.
// v6 plain-language pass, item 6: "a weighted 1-5 average of scored
// criteria" -> "a 1-5 score combining every researched factor" — same
// meaning, shorter, drops "weighted"/"average"/"criteria" as load-bearing
// vocabulary a first-time reader has to parse.
// v7 §3.2 (law 4, index demotion): one new clause added, "It's a sort
// key, not a verdict on its own" — the ruling's own instruction was a
// wording ADDITION to this existing canonical string, not a full
// rewrite; the base sentence is unchanged verbatim.
export const FIT_INDEX_DEFINITION =
  "Fit index: a 1–5 score combining every researched factor. Higher is better — 5 is the strongest fit, 1 is the weakest. It's a sort key, not a verdict on its own.";

// v8 Part 5: the scale-anchor disclosure — one canonical string, cited (not
// restated) from this project's own internal scale-semantics ruling: a 5
// is the world benchmark, not perfection and not merely "best of this
// dataset."
// Reused verbatim in three render homes (map legend, Lists caption,
// location page score-breakdown chapter) so a reachable top changes how
// every 4 and 5 on the site reads, the same way FIT_INDEX_DEFINITION
// travels everywhere the Fit index itself appears.
export const SCALE_ANCHOR_STRING =
  "A 5 isn't perfection — it means as good as this realistically gets anywhere in the world, tradeoffs included.";

// v9 Part 6.2/7.1: the verdict-coverage engine's own `overall_state` (a
// closed 6-value enum, derived/verdicts.jsonl, strictly finer-grained than
// `overall_band` — UNCERTAIN_TYPE and QUALIFIES_CONDITIONAL both paint
// CONDITIONAL_COLOR via colors.js's bandVisual() but mean different things
// in words). Text always carries the finer read; color only the coarser
// one (v8 Part 1's own "color answers roughly what kind, text answers
// exactly what" doctrine, cited not restated). Committed UI copy, same
// class as BAND_LABEL/WEIGHT_CLASS_LABEL below.
export const STATE_HEADLINE = {
  QUALIFIES_AND_CONVERTS: "Clears — and this route leads to permanent residency (PR).",
  QUALIFIES_CONDITIONAL: "Clears, with conditions attached.",
  UNCERTAIN_TYPE: "Possible — but whether this profile's income type qualifies for this route isn't confirmed yet.",
  FAILS_AMOUNT: "Doesn't clear the income bar this route sets.",
  DEAD_END_BLOCKING: "Confirmed dead end — this route doesn't lead where this profile needs it to.",
  GAP_INSUFFICIENT_DATA: "Not enough documented yet for a real read.",
};

// Which of the four `overall_band` values each `overall_state` belongs to —
// verified by a direct cross-tab of the real 304-row derived/verdicts.jsonl
// (every state maps to exactly one band, confirmed, not assumed from the
// enum names alone). Used only by the map legend (v9 Part 6.5), to group
// STATE_HEADLINE's six labels under their four band colors.
export const STATE_HEADLINE_BAND = {
  QUALIFIES_AND_CONVERTS: "clean",
  QUALIFIES_CONDITIONAL: "uncertain_or_conditional",
  UNCERTAIN_TYPE: "uncertain_or_conditional",
  FAILS_AMOUNT: "hard_fail",
  DEAD_END_BLOCKING: "hard_fail",
  GAP_INSUFFICIENT_DATA: "data_gap",
};

// v9 Part 8: the mandatory rule-derived-verdict disclosure. Two load-
// bearing content requirements, both from this project's own residency-
// rules research: (1) a plain explanation of what "rule-derived" means
// (computed, checked against a stated profile — not legal advice, not a
// guarantee); (2) the nationality caveat, present on every verdict render,
// never silent — sourcing skews toward common/unrestricted passports, so
// silence on a nationality rule means undocumented, not confirmed open.
// Shipped as committed spec copy per this project's own precedent — one
// canonical sentence, many future render homes, cited not restated, same
// idiom as FIT_INDEX_DEFINITION/SCALE_ANCHOR_STRING above.
export function verdictDisclosureSentence(displayName) {
  return `This read is computed from this project's own documented visa and residency rules, checked against ${displayName}'s stated profile — not a lawyer's opinion, and not a guarantee. Sourcing across this site skews toward information written for common, unrestricted passports: where a nationality rule isn't mentioned here, that means undocumented, not confirmed open. Always check your own passport's specific rule before relying on this.`;
}

// v7 Part 10: the perspective door needs the switcher's own descriptor
// string split into its two rendering halves — a first name (shown at
// larger weight on each tile) and the descriptor sentence itself (shown
// verbatim underneath) — where the switcher's own <option> needs the
// whole "Name — sentence" string unchanged. One mechanical split
// function, not a second hand-copied string: strips only the FIRST
// " — " (several descriptors carry a second one mid-sentence, e.g.
// Noa's own two extra em dashes, so a naive single split() would
// truncate her sentence). Zero new authorship — same source string,
// same order, per Part 11.
export function personaDescriptorSentence(id) {
  const full = PERSONA_LABELS[id] || "";
  const idx = full.indexOf(" — ");
  return idx === -1 ? full : full.slice(idx + 3);
}

// Shared "is this a keyboard activation" check for click-equivalent
// keydown handlers (map pins, source-toggle badges) — one definition of
// what counts as an activation key, reused instead of re-branched per call
// site.
export function isActivationKey(e) {
  return e.key === "Enter" || e.key === " ";
}

// Tooltip voice (v2 addendum §4.1): a fixed four-tier word
// mapping off the Fit index value, extending the same endpoints
// FIT_INDEX_DEFINITION already states ("1 poor fit, 5 strong fit") into
// intermediate bands — a wording rule, same shape as the change-event
// severity labels, not a new claim about any specific place. Boundaries are
// lower-bound inclusive (2.0 itself reads as "a stretch", not "a tough
// fit") — a mechanical tie-break, not a judgment call per location.
export function fitBandWord(value) {
  if (value == null || Number.isNaN(value)) return "not yet scored";
  if (value < 2) return "a tough fit";
  if (value < 3) return "a stretch";
  if (value < 4) return "promising";
  return "a strong fit";
}

// Tooltip voice (v2 addendum §4): the "strength / catch" headline — moved
// here from map.js (v7 §2.2) so location.js's no-persona verdict block can
// reuse the exact same string a reader may have already seen on this
// location's map pin, instead of re-deriving a fresh headline (zero new
// authorship — pure transport of an already-computed value into a second
// render location). map.js imports this instead of defining it locally;
// no behavior change there.
export function buildFitHeadline(store, personaId, loc, country, value) {
  const tb = topBottomCriteria(store, personaId, loc.location_id);
  const band = fitBandWord(value);
  return tb && tb.top.criterion_id !== tb.bottom.criterion_id
    ? `${loc.display_name}, ${country.name} — ${band}; ${tb.top.name} is a strength, ${tb.bottom.name} is the catch.`
    : `${loc.display_name}, ${country.name} — ${band}.`;
}

// ---------------------------------------------------------------------
// Theme (v4 addendum R2): light default, unconditional, for every visitor
// regardless of OS — a stored, explicit toggle is the only way to reach
// dark. Replaces the old bare `prefers-color-scheme` auto-flip (colors.js's
// former prefersDark(), now isDarkTheme(), reads this same attribute
// instead of matchMedia). No third "auto" state — ruled out, see the
// addendum's own reasoning (R2, "Auto (follow-OS)").
// ---------------------------------------------------------------------
const THEME_KEY = "theme";

// Must run before renderTopBar() on every page (the addendum's own
// sequencing rule), so a returning dark-mode visitor's toggle state is set
// before the top bar (and its button's aria-pressed) render.
export function applyStoredTheme() {
  if (localStorage.getItem(THEME_KEY) === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  }
  // Anything else (absent, "light") => default light, no attribute — the
  // whole point of this ruling: no OS read, ever, as a default.
}

function toggleTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  if (dark) {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem(THEME_KEY, "light");
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem(THEME_KEY, "dark");
  }
  // NOT done here, deliberately: re-recoloring already-rendered inline SVG
  // pin fills / list fit-swatches (computed once by scoreToColor() at
  // render time, cached as static attributes/inline styles) to match the
  // freshly toggled theme. That's the addendum's own explicitly EXCLUDED
  // "live-recolor no-reload fix" — CSS-variable-driven chrome (paper/ink/
  // panel/badges/etc.) updates instantly on toggle; map pins and list
  // swatches catch up on the next full page load/navigation in the
  // meantime. Flagged here so it reads as a recorded decision, not a bug.
}

// ---------------------------------------------------------------------
// Header (v4 addendum R4): split into a top bar (brand/nav/theme toggle,
// unchanged position — first thing on the page) and a persona block
// (moved below each page's own H1/orientation — see renderPersonaSlot /
// renderPersonaBlock below). Replaces the old single renderHeader(), which
// put the persona ask before the page said what it even does.
// ---------------------------------------------------------------------
export function renderTopBar(activePage) {
  // Bug fix: prerendered location pages (tools/prerender-
  // locations.mjs) ship a real, static .site-topbar for no-JS visitors —
  // it lives directly in <body>, outside #loc-root, so location.js's own
  // "clear #loc-root, then rebuild" reset never reaches it. Once this
  // script runs, the page is JS-hydrated: the static bar's own job is
  // done (and it never carried a working Dark mode button anyway, since
  // toggling needs JS to run at all), so it's removed here — replaced,
  // not stacked alongside, by the one this function builds. Fixed at the
  // source rather than trying to keep two independently-authored copies
  // of "the top bar" in permanent lockstep, which is exactly the
  // duplication class this project's own build notes warn about
  // elsewhere (generalIndex()/sectionForFact()'s Node-vs-browser twins).
  const existing = document.querySelector(".site-topbar");
  if (existing) existing.remove();
  const bar = document.createElement("div");
  bar.className = "site-topbar";
  // v7 no-JS fallback: siteUrl()-resolved paths (not a bare "index.html")
  // so this same bar renders correct links whether the page including it
  // lives at the site root or one level down (l/<location_id>.html, the
  // prerendered per-location pages) — see tools/prerender-locations.mjs —
  // and under either a domain-root or project-site-subpath deployment.
  bar.innerHTML = `
    <a class="brand" href="${withPersona(siteUrl("index.html"))}">CanILiveThere</a>
    <nav class="site-nav">
      <a href="${withPersona(siteUrl("index.html"))}" class="${activePage === "map" ? "active" : ""}">Map</a>
      <a href="${withPersona(siteUrl("lists.html"))}" class="${activePage === "lists" ? "active" : ""}">Lists</a>
    </nav>
    <button type="button" id="theme-toggle" aria-pressed="false">Dark mode</button>
  `;
  document.body.prepend(bar);

  const btn = bar.querySelector("#theme-toggle");
  const syncButton = () => {
    const dark = document.documentElement.dataset.theme === "dark";
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
    btn.classList.toggle("active", dark);
  };
  syncButton();
  btn.addEventListener("click", () => {
    toggleTheme();
    syncButton();
  });
}

// The persona-block + disclaimer markup shared by both placement
// mechanisms below — one template, not duplicated per page. "General"
// option copy and the unselected-state blurb are the addendum's own R4
// strings, verbatim; the selected-state blurb is unchanged from before
// (still reads clearly, not a failure site — v2 addendum §6).
function personaSlotInnerHtml() {
  // v7 §7.1: 3 options -> 8, same mechanism (v1 §3.6's render-condition
  // fix — the descriptor is always-visible option text, not gated behind
  // selection), just more data through it. VALID_PERSONAS is this
  // module's own order (the switcher-descriptors file's own order too).
  const options = VALID_PERSONAS.map(
    (id) => `<option value="${id}">${escapeHtml(PERSONA_LABELS[id])}</option>`
  ).join("");
  // v11 Part 21.9: a ninth, reserved switcher entry — "Your priorities" —
  // appears only once a reader has actually built a custom weight vector.
  // Deliberately NOT part of VALID_PERSONAS/the loop above (8P.2's own
  // ruling: "custom" never flows through the URL-persona machinery those
  // arrays feed) — a separate, conditional <option> instead, appended
  // after the eight named ones per this Part's own ordering.
  const customOption = hasCustomProfile()
    ? `<option value="custom">Your priorities — your own weighted read from your quick answers</option>`
    : "";
  // "Edit your answers" (21.9): only rendered once a profile exists,
  // reopens the door's own questionnaire (perspective-door.js), pre-filled
  // — reuses that already-built, already-gated flow rather than a second
  // one on this page.
  const editControl = hasCustomProfile()
    ? `<button type="button" class="btn-chip" id="edit-priorities-btn">Edit your answers</button>`
    : "";
  return `
    <div class="persona-block">
      <label for="persona-select">Pick whichever of these eight example relocators is closest to you:</label>
      <select id="persona-select">
        <option value="">General — see every location's own score, unfiltered</option>
        ${options}
        ${customOption}
      </select>
      <p class="persona-blurb" id="persona-blurb"></p>
      ${editControl}
    </div>
    <details class="recede">
      <summary>Information, not advice — read what this site is and isn't</summary>
      <p class="disclaimer recede-body">
        Every figure here carries a source, a last-checked date, and a
        confidence tier — rules change; confirm anything that matters with
        the relevant embassy, notary, or accountant before acting on it.
      </p>
    </details>
  `;
}

function wirePersonaSlot(container, persona) {
  const select = container.querySelector("#persona-select");
  select.value = persona === "custom" ? "custom" : persona || "";
  const blurb = container.querySelector("#persona-blurb");
  // Default (nothing selected) is now a one-line pointer, not the old
  // three-descriptor wall — the descriptors already live individually as
  // the <select>'s own option text, not duplicated a second time (R4
  // §4.2). Selected-persona state: v7 §7.1 drops the old three-only
  // "Closest to you if:" appended clause (PERSONA_CLOSEST_IF) — it never
  // existed for the five newly-widened personas, and the source
  // descriptors already carry the "who this fits" framing inside the
  // want/fear sentences, so a uniform single-descriptor blurb across all
  // eight reads more consistently than three personas getting a second
  // clause and five not. Flagged: this is a real, if small, content
  // simplification of existing authored copy, not a silent change —
  // named here and in the build record for ratification or correction,
  // same as an earlier wording-alignment precedent on this same file.
  if (persona === "custom") {
    blurb.textContent =
      "Every score below is weighted the way you told us matters, from your own quick answers.";
  } else if (persona) {
    blurb.textContent = PERSONA_LABELS[persona] || "";
  } else {
    blurb.textContent =
      "Every score below is shown as-is — pick a name above to see it adjusted for someone in their situation instead.";
  }
  select.addEventListener("change", () => {
    const params = new URLSearchParams(location.search);
    // "custom" is never a URL value (8P.2's own ruling keeps it out of
    // VALID_PERSONAS/getPersona() entirely) — selecting it just clears any
    // ?persona= override, same action as selecting "General." A named
    // simplification, not silently made: once a custom weight vector is
    // stored, getActivePersona()'s own ruled precedence means BOTH options
    // resolve to the custom read from here on — there is no v1 switcher
    // path back to genuinely blank general figures short of clearing the
    // browser's own stored preferences. Flagged in the build record, not
    // fixed here (no escape hatch was specced, and inventing new URL
    // semantics to build one is outside this change's own scope).
    if (select.value && select.value !== "custom") params.set("persona", select.value);
    else params.delete("persona");
    const qs = params.toString();
    location.search = qs ? `?${qs}` : "";
  });
  const editBtn = container.querySelector("#edit-priorities-btn");
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      // Reopens the door's own questionnaire, pre-filled — index.html-only
      // by construction (perspective-door.js is only ever imported by
      // js/map.js), so this always navigates there regardless of which
      // page the switcher is on today.
      location.href = `${siteUrl("index.html")}?edit-priorities=1`;
    });
  }
}

// index.html / lists.html: a static `<div id="persona-slot"></div>`
// already sits in each page's own HTML, positioned after the H1 — this
// fills it in place, matching the existing #map-legend/#purpose-lists
// static-placeholder convention (R4 §4.2) rather than DOM-traversal
// insertion.
export function renderPersonaSlot(el, persona) {
  el.innerHTML = personaSlotInnerHtml();
  wirePersonaSlot(el, persona);
}

// location.html: no static H1 exists at parse time (it's built inside
// location.js's own render, from the location's data) — so no static
// placeholder id is possible here. Caller passes the just-created <h1>
// element as the insertion anchor; this builds the block fresh and
// inserts it immediately after that anchor (R4 §4.3's one named
// exception to the drop-in-copy shape the other two pages share).
export function renderPersonaBlock(persona, anchorEl) {
  const wrap = document.createElement("div");
  wrap.id = "persona-slot";
  wrap.innerHTML = personaSlotInnerHtml();
  anchorEl.insertAdjacentElement("afterend", wrap);
  wirePersonaSlot(wrap, persona);
}

export function renderFooter(store) {
  // Same duplication class as renderTopBar()'s own fix above, found
  // during this build's own dry run (not in the original two-bug ask,
  // fixed anyway since it's the identical root cause I'd just fixed one
  // function up): tools/prerender-locations.mjs ships a real, static
  // .site-footer for no-JS visitors, a sibling of <main> in <body> — this
  // function used to just document.body.appendChild() a second one
  // alongside it rather than replacing it, so a JS-hydrated prerendered
  // page showed two different footer paragraphs stacked on top of each
  // other.
  const existing = document.querySelector(".site-footer");
  if (existing) existing.remove();
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  const meta = store && store.meta;
  footer.innerHTML = `
    <p>
      CanILiveThere is a research tool, not legal or immigration advice.
      Data is extracted from an underlying research vault and regenerated
      periodically — it is never hand-edited here.
      ${meta ? `Snapshot extracted ${escapeHtml(meta.extracted_at || "")}.` : ""}
    </p>
    <p><a href="${withPersona(siteUrl("corrections.html"))}">Corrections &amp; changes</a> — every dated update, including what we got wrong.</p>
    <p><a href="${withPersona(siteUrl("principles.html"))}">How we work</a> — the rules we hold ourselves to, and how to check us on them.</p>
    <p>Anonymous, cookieless visit counts by Cloudflare help us see what's useful.</p>
  `;
  document.body.appendChild(footer);
}

// Comma-group digit runs of 5+ so large figures ("500000 THB") read as
// "500,000 THB" instead of forcing a reader to count zeros. Deliberately
// stops at 4 digits: this project's facts mix genuine 4-digit years
// ("2019", embedded in dates like "2019-10-31") with genuine 4-digit money
// figures ("1900 THB"), and there's no reliable way to tell those apart
// from the string alone — leaving 4-digit runs untouched is the safe
// default (a 4-digit number is also easy enough to read unformatted;
// the real readability problem starts at 5+ digits). Already-formatted
// runs ("50,000") are naturally left alone, since the comma splits them
// into shorter digit groups this regex doesn't re-match.
export function formatNumbersInText(text) {
  return text.replace(/\d{5,}/g, (run) => Number(run).toLocaleString("en-US"));
}

// Some
// fact rows on file (pet-import especially) are one dense run-on
// `value_raw` paragraph bundling several distinct clauses — real content,
// bad presentation. This splits on sentence-ending periods and semicolons
// ONLY (the two boundary types the actual data supports without risking
// meaning), never on commas (comma-joined lists inside one clause, e.g.
// "€42.25 for one pet, €84.50 for two to five pets", stay on one line on
// purpose — splitting every comma over-fragments a real list into noise).
//
// A period only counts as a boundary when followed by whitespace and then
// an uppercase letter, digit, or open-paren (a real new clause/sentence
// start) AND the word immediately before it is not a known abbreviation
// or a single letter — guards against "incl. US" and "N. Ireland"-shaped
// false splits, both real cases found in the live pet-import data during
// this fix (Indonesia's Bali-routing fact, Malaysia's quarantine-exemption
// fact). Decimal numbers ("0.5") are never split: the character before
// the period there is a digit, not a letter, so the abbreviation-word
// check naturally excludes them too — one guard, two problems solved.
// Semicolons always split (no abbreviation ambiguity for a semicolon).
// Verified against all 21 countries' live pet-import fact rows this
// session — every split rejoins (whitespace-normalized) to the original
// string with zero content loss or reordering.
const SENTENCE_ABBREV_STOPLIST = new Set([
  "incl", "etc", "vs", "approx", "no", "eg", "ie", "govt", "dept",
  "st", "mt", "dr", "mr", "mrs", "jr", "sr", "vol", "co", "corp",
  "inc", "ltd", "min", "max", "esp",
]);

export function splitFactSentences(text) {
  if (!text) return [];
  const result = [];
  let cur = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    cur += ch;
    if (ch === ";") {
      if (/\s/.test(text[i + 1] || "")) {
        result.push(cur.trim());
        cur = "";
      }
    } else if (ch === ".") {
      const rest = text.slice(i + 1);
      const wsMatch = rest.match(/^\s+/);
      if (wsMatch) {
        const after = rest.slice(wsMatch[0].length);
        if (/^[A-Z(0-9]/.test(after)) {
          const wordMatch = cur.match(/([A-Za-z]+)\.$/);
          const word = wordMatch ? wordMatch[1].toLowerCase() : "";
          if (word.length > 1 && !SENTENCE_ABBREV_STOPLIST.has(word)) {
            result.push(cur.trim());
            cur = "";
          }
        }
      }
    }
  }
  if (cur.trim()) result.push(cur.trim());
  return result.filter(Boolean);
}

// --- Live FX reference-currency stopgap (2026-07-14) ---
// A reader's own nationality/currency isn't captured anywhere on the site
// yet (that's tomorrow's real build); until then, this appends a USD
// approximation to bare-local-currency figures so "500,000 THB" doesn't
// require a reader to already know an exchange rate. Deliberately a LIVE
// lookup, not a hardcoded rate table: this project's own research already
// shows rates drifting well past a 10% margin within days for volatile
// currencies (Argentina's peso spans 430-510 ARS/USD across sources
// written days apart) — a static number baked into code would look
// authoritative and go visibly wrong. open.er-api.com is free, keyless,
// updates daily, and covers every currency this site's facts use.
// Fails soft everywhere (offline, blocked, unknown currency, no numeric
// value): the reader always sees the real local-currency figure
// regardless — this is a bonus annotation, never load-bearing.
const FX_CACHE_KEY = "clt-fx-rates-v1";
const FX_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — a normal browsing session makes at most one real request
let fxRates = null; // { CODE: rate-per-USD }, null until loaded or on any failure

export async function loadFxRates() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(FX_CACHE_KEY) || "null");
    if (cached && Date.now() - cached.fetchedAt < FX_CACHE_TTL_MS) {
      fxRates = cached.rates;
      return;
    }
  } catch {
    // corrupt/unavailable cache entry - fall through to a fresh fetch
  }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.rates) return;
    fxRates = data.rates;
    try {
      sessionStorage.setItem(FX_CACHE_KEY, JSON.stringify({ rates: fxRates, fetchedAt: Date.now() }));
    } catch {
      // storage full/unavailable/private-browsing - fine, just skip caching
    }
  } catch {
    // offline, blocked, rate-limited, whatever - the page works fine without this
  }
}

// Bare currency-code units only ("THB", "THB/sqm", "RM/month",
// "ZAR/m²") — deliberately conservative. Skipped on purpose: anything
// already carrying a parenthetical/manual approx ("RM (~$213,000)") or a
// "~", since that's either already hand-converted (don't show two
// different USD guesses for one figure) or too free-text to parse
// safely. USD and EUR themselves are excluded — a reader doesn't need
// USD converted to USD, and EUR is already a widely-recognized
// reference currency in its own right, unlike THB/MAD/ARS/etc. for most
// readers.
const BARE_CURRENCY_CODES = ["THB", "RM", "MYR", "ZAR", "MAD", "ARS", "IDR", "EGP", "COP", "MXN"];
const CURRENCY_TO_FX_CODE = { RM: "MYR" };

function detectBareCurrency(unit) {
  if (!unit || unit.includes("(") || unit.includes("~")) return null;
  for (const code of BARE_CURRENCY_CODES) {
    if (unit === code || unit.startsWith(`${code}/`) || unit.startsWith(`${code} `)) {
      return CURRENCY_TO_FX_CODE[code] || code;
    }
  }
  return null;
}

function usdApprox(amount, fxCode) {
  if (!fxRates || !fxRates[fxCode] || !Number.isFinite(amount)) return null;
  const usd = amount / fxRates[fxCode];
  if (!Number.isFinite(usd) || usd <= 0) return null;
  const rounded = usd >= 100 ? Math.round(usd / 10) * 10 : Math.round(usd);
  return rounded.toLocaleString("en-US");
}

export function formatValue(fact) {
  if (fact.value_raw === "[GAP]") return "Not yet researched";
  const raw = formatNumbersInText(String(fact.value_raw));
  // Only append the unit if value_raw doesn't already carry it as text —
  // some facts' own value_raw already spells out its unit inline (e.g.
  // "50km coast / 100km border", "49% of building"), and appending the
  // bare unit again on top of that duplicates it visibly ("...building %").
  let out = raw;
  if (fact.unit && !raw.toLowerCase().includes(String(fact.unit).toLowerCase())) {
    out = `${raw} ${fact.unit}`;
  }
  // Bug fix (2026-07-15, caught by a real-data dry run, not just a read of
  // the code): detectBareCurrency() only inspected fact.unit for an
  // existing manual approximation, but at least one real fact on file
  // (ID:bpjs-kesehatan-monthly-cost-where-eligible) carries its own
  // "(~$3-10)" approximation inside value_raw itself, with a perfectly
  // bare unit ("IDR/month"). Without this second check, the moment that
  // fact (or any future one shaped like it) gains value_num_low/high, a
  // reader would see two different, disagreeing USD guesses stapled
  // together ("(~$3-10) (≈$2-$8)") -- exactly the collision this
  // function's own comment says it exists to prevent. Checking raw here
  // (not fact.value_raw) is equivalent and cheaper: formatNumbersInText()
  // never adds or removes "(" or "~".
  const fxCode = detectBareCurrency(fact.unit);
  if (fxCode && !raw.includes("(") && !raw.includes("~")) {
    const low = usdApprox(fact.value_num_low, fxCode);
    const high = Number.isFinite(fact.value_num_high) && fact.value_num_high !== fact.value_num_low
      ? usdApprox(fact.value_num_high, fxCode)
      : null;
    if (low) out += high ? ` (≈$${low}–$${high})` : ` (≈$${low})`;
  }
  return out;
}

// Exported (not just module-local) so the map's plain-text hover tooltip
// (which can't carry a styled <span> badge) can append the identical
// wording as a text suffix — one vocabulary, two render shapes, never a
// second copy of these three strings.
export const CONF_LABEL = { High: "High confidence", Medium: "Medium confidence", Speculative: "Speculative" };

// Plain-language glosses for the site's own internal sourcing vocabulary —
// one lookup per field, reused everywhere that field is rendered, so a
// visitor never sees the raw internal value (e.g. "aggregator-only") that
// only makes sense to whoever built the dataset.
const SOURCE_COUNT_LABEL = {
  single: "one source",
  "aggregator-only": "an aggregator site",
  "cross-corroborated": "more than one source, cross-checked",
  "primary-institutional": "an official/primary source",
};

export const WEIGHT_CLASS_LABEL = {
  High: "weighted heavily in the index",
  "Medium-High": "weighted above average in the index",
  Medium: "weighted normally in the index",
};

// The §8J disclosure for any criterion whose `reader_dependency` field
// reads "pending-ruling" (today: Community & social fabric only) — a
// criterion score that structurally blends more than one distinct fact,
// honestly labeled rather than rendered identically to a single-fact
// score. One canonical short marker (chip/column-header suffix) and one
// canonical longer paragraph (chapter/section copy), each reused verbatim
// across every render home (location.js, lists.js, criteria.html), same
// idiom as FIT_INDEX_DEFINITION/SCALE_ANCHOR_STRING above. The six named
// facts are transported verbatim from this project's own internal
// criterion-scope ruling, not authored here. Word choice: "blends several
// facts" deliberately avoids "composite" (already used elsewhere for a
// different, killed concept — a blended-across-readers score) to prevent
// a vocabulary collision.
export const READER_DEPENDENCY_PENDING_LABEL = "blends several facts";
export const READER_DEPENDENCY_PENDING_PARAGRAPH =
  'Criteria marked "blends several facts" fold more than one distinct thing into a single number — for Community & social fabric today, that\'s expat/foreigner density, language accessibility, family-friendliness, nightlife/social-scene density, LGBTQ+ safety-and-acceptance, and professional-network depth. We\'re working to score these separately; until then, treat the single figure as a rough signal, not a precise read.';

// ---------------------------------------------------------------------
// Persona verdict-first banding (v4 addendum R1 §1.2, moved here from
// lists.js by v6 addendum §2.3 so map.js's legend can import the exact
// same registry instead of forking its own hardcoded labels — the same
// drift class verdictVisual()'s color grouping and headline prose once
// disagreed on, per that section's own citation). Exact headline string
// -> band; unknown strings fail loud into "unclassified" (verdictBand()
// below), never guessed. The two judgment calls (type-trap rows) are
// argued in the v4 addendum itself, not asserted here.
// ---------------------------------------------------------------------
export const VERDICT_BAND = {
  "Clears": "clears",
  "Near-miss": "near-miss",
  "Clears the number, fails the type": "near-miss",
  "Misses": "doesnt-clear",
  "Categorical absence": "doesnt-clear",
  "One door opens, leads nowhere": "doesnt-clear",
  "Unverified": "not-checked",
};
export function verdictBand(headline) {
  return Object.prototype.hasOwnProperty.call(VERDICT_BAND, headline)
    ? VERDICT_BAND[headline] : "unclassified";
}
export const BAND_ORDER = ["clears", "near-miss", "doesnt-clear", "not-checked", "unclassified"];
export const BAND_LABEL = {
  clears: "Clears", "near-miss": "Near-miss", "doesnt-clear": "Doesn't clear",
  "not-checked": "Not checked yet", unclassified: "Unclassified — needs attention",
};

// `interactive` defaults true (the §5.3.2 pull-affordance shape, for use
// inside a `.fact-meta` block with a `.source-detail` sibling). The Sources
// section already dedicates its own real estate to source name/date, so it
// renders the same badge without the click affordance — `interactive:
// false` — rather than leaving an inert, do-nothing tab stop there.
export function confidenceBadge(fact, { interactive = true } = {}) {
  if (fact.value_raw === "[GAP]") {
    return `<span class="badge badge-gap">Not yet researched</span>`;
  }
  const bits = [];
  if (fact.confidence) bits.push(CONF_LABEL[fact.confidence] || fact.confidence);
  if (fact.source_count) bits.push(SOURCE_COUNT_LABEL[fact.source_count] || fact.source_count.replace(/-/g, " "));
  const label = bits.length ? bits.join(", ") : "confidence not stated";
  // A fact with no explicit `confidence` field is not the same claim as one
  // the schema's own authors tagged Speculative — that field being absent
  // just means no confidence tier was set, and a fact can still carry real
  // sourcing rigor via `source_count` alone (e.g. cross-corroborated). Only
  // an explicit "Speculative" value earns the speculative styling; an
  // absent field gets the same neutral treatment the base .badge class
  // already gives everything else, never a silent demotion.
  const cls = fact.confidence === "High" ? "badge-high"
    : fact.confidence === "Medium" ? "badge-medium"
    : fact.confidence === "Speculative" ? "badge-speculative"
    : "badge-neutral";
  // Pull-not-push (v2 addendum §5.3.2): this badge is the single click/tap
  // target for "how do we know this" — see sourceDetailHtml() and the
  // delegated toggle listener below, which expand it to source name/link
  // and last-checked date in one place, instead of those living as
  // separate always-visible elements doing half a job each.
  if (!interactive) return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
  return `<span class="badge ${cls}" data-toggle-source tabindex="0" role="button" aria-expanded="false" title="How do we know this? Click for source and date.">${escapeHtml(label)}</span>`;
}

// Same three-value vocabulary as confidenceBadge() above, applied to a
// verdict's own sourcing tier instead of a single fact's. Reuses CONF_LABEL
// and the badge-high/medium/speculative/neutral classes verbatim — no
// second confidence system for a reader to learn. Non-interactive only for
// this ship: no click-to-expand "which route set this" affordance yet.
// A verdict with no tier (data-gap rows, and some non-gap rows the engine
// found no single deciding route for) renders nothing at all, matching the
// skip behavior a caller should also apply for overall_band === "data_gap"
// before calling this at all — see call sites in location.js/lists.js/map.js.
export function verdictConfidenceBadge(tier) {
  if (!tier) return "";
  const label = CONF_LABEL[tier] || "confidence not stated";
  const cls = tier === "High" ? "badge-high" : tier === "Medium" ? "badge-medium"
    : tier === "Speculative" ? "badge-speculative" : "badge-neutral";
  return `<span class="badge ${cls}" title="Sourcing confidence for the route(s) behind this verdict">${escapeHtml(label)}</span>`;
}

// The expand content for the confidence-badge pull affordance above —
// source name/link plus last-checked date, the two pieces that used to
// render as separate, always-visible elements next to the badge.
export function sourceDetailHtml(fact) {
  if (fact.value_raw === "[GAP]") return "";
  const src = fact.source_url
    ? `<a href="${escapeHtml(fact.source_url)}" target="_blank" rel="noopener">source link</a>`
    : "Source noted — no link available yet";
  const parts = [src];
  if (fact.date) parts.push(`last checked ${escapeHtml(fact.date)}`);
  return parts.join(" · ");
}

// Delegated once, here, so every page gets the toggle just by importing
// this module — no per-page wiring. The detail panel is expected to be the
// next sibling element (a `.source-detail`) right after the `.fact-meta`
// block the clicked badge lives in.
if (typeof document !== "undefined") {
  const toggleSourceDetail = (badge) => {
    const metaRow = badge.closest(".fact-meta");
    const detail = metaRow ? metaRow.nextElementSibling : null;
    if (!detail || !detail.classList.contains("source-detail")) return;
    const open = detail.classList.toggle("open");
    badge.setAttribute("aria-expanded", open ? "true" : "false");
  };
  document.addEventListener("click", (e) => {
    const badge = e.target.closest(".fact-meta .badge[data-toggle-source]");
    if (badge) toggleSourceDetail(badge);
  });
  document.addEventListener("keydown", (e) => {
    if (!isActivationKey(e)) return;
    const badge = e.target.closest(".fact-meta .badge[data-toggle-source]");
    if (!badge) return;
    e.preventDefault();
    toggleSourceDetail(badge);
  });
}

export function sourceLine(fact) {
  if (fact.value_raw === "[GAP]") return "";
  if (fact.source_url) {
    return `<a class="source-link" href="${escapeHtml(fact.source_url)}" target="_blank" rel="noopener">source</a>`;
  }
  // Data-contract rule: a null source_url still means a source exists, just
  // nothing to click yet — never rendered as if there were no source at all.
  return `<span class="source-onfile">Source noted — no link available yet</span>`;
}

export function divergenceBadge(fact) {
  if (!fact.divergence_flag || fact.divergence_flag === "N/A") return "";
  const map = {
    "Confirmed-matches": ["div-match", "Confirmed: the written rule matches what happens in practice"],
    "Confirmed-diverges": ["div-diverge", "Confirmed: the written rule does not match what happens in practice"],
    "Not yet checked": ["div-unchecked", "Not yet checked against real-world practice"],
  };
  const [cls, label] = map[fact.divergence_flag] || ["div-unchecked", fact.divergence_flag];
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}
