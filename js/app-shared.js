// CanILiveThere — shared header, persona switcher, and small utilities used
// by every page. No framework, no build step: plain DOM, ES modules loaded
// directly by the browser.

export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getPersona() {
  const params = new URLSearchParams(location.search);
  const p = params.get("persona");
  return p && ["waldo", "wenda", "carmen"].includes(p) ? p : null;
}

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

const PERSONA_LABELS = {
  waldo: "Waldo — remote-income relocator, $2,500/mo, $120k to buy",
  wenda: "Wenda — retiree, $1,900/mo pension, $95k to buy",
  carmen: "Carmen — tighter-budget roamer, $1,300/mo freelance, renting",
};

// Persona framing (v2 addendum §6): "someone most like
// you," not a neutral "Viewing as" — each clause reuses the exact income
// type/budget/stage figures PERSONA_LABELS already states above, just
// reframed as a self-recognition question instead of a spec sheet. No new
// persona facts authored here.
const PERSONA_CLOSEST_IF = {
  waldo: "Closest to you if: remote income, ~$2,500/mo, buying around $120k",
  wenda: "Closest to you if: retired on a pension, ~$1,900/mo, buying around $95k",
  carmen: "Closest to you if: tighter-budget freelance income, ~$1,300/mo, renting rather than buying",
};

// One canonical name and definition for the site's central number, reused
// everywhere a reader meets it (map legend, Lists column, location page).
// The name itself ("Fit index") is already the literal text of the Lists
// column header and every tooltip/label below — this is the definition
// that travels with it.
export const FIT_INDEX_DEFINITION =
  "Fit index: a weighted 1–5 average of scored criteria. Higher is better — 5 is the strongest fit, 1 is the weakest.";

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
  const bar = document.createElement("div");
  bar.className = "site-topbar";
  bar.innerHTML = `
    <a class="brand" href="${withPersona("index.html")}">CanILiveThere</a>
    <nav class="site-nav">
      <a href="${withPersona("index.html")}" class="${activePage === "map" ? "active" : ""}">Map</a>
      <a href="${withPersona("lists.html")}" class="${activePage === "lists" ? "active" : ""}">Lists</a>
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
  return `
    <div class="persona-block">
      <label for="persona-select">Pick whichever of these three example relocators is closest to you:</label>
      <select id="persona-select">
        <option value="">General — see every location's own score, unfiltered</option>
        <option value="waldo">${escapeHtml(PERSONA_LABELS.waldo)}</option>
        <option value="wenda">${escapeHtml(PERSONA_LABELS.wenda)}</option>
        <option value="carmen">${escapeHtml(PERSONA_LABELS.carmen)}</option>
      </select>
      <p class="persona-blurb" id="persona-blurb"></p>
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
  select.value = persona || "";
  const blurb = container.querySelector("#persona-blurb");
  // Default (nothing selected) is now a one-line pointer, not the old
  // three-descriptor wall — the descriptors already live individually as
  // the <select>'s own option text, not duplicated a second time (R4
  // §4.2). Selected-persona state is unchanged (§6's own framing).
  if (persona) {
    blurb.textContent = `${PERSONA_LABELS[persona]} — ${PERSONA_CLOSEST_IF[persona]}`;
  } else {
    blurb.textContent =
      "Every score below is shown as-is — pick a name above to see it adjusted for someone in their situation instead.";
  }
  select.addEventListener("change", () => {
    const params = new URLSearchParams(location.search);
    if (select.value) params.set("persona", select.value);
    else params.delete("persona");
    const qs = params.toString();
    location.search = qs ? `?${qs}` : "";
  });
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
  `;
  document.body.appendChild(footer);
}

export function formatValue(fact) {
  if (fact.value_raw === "[GAP]") return "Not yet researched";
  const raw = String(fact.value_raw);
  // Only append the unit if value_raw doesn't already carry it as text —
  // some facts' own value_raw already spells out its unit inline (e.g.
  // "50km coast / 100km border", "49% of building"), and appending the
  // bare unit again on top of that duplicates it visibly ("...building %").
  if (fact.unit && !raw.toLowerCase().includes(String(fact.unit).toLowerCase())) {
    return `${raw} ${fact.unit}`;
  }
  return raw;
}

const CONF_LABEL = { High: "High confidence", Medium: "Medium confidence", Speculative: "Speculative" };

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
