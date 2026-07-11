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

export function renderHeader(activePage) {
  const persona = getPersona();
  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `
    <div class="site-header-row">
      <a class="brand" href="${withPersona("index.html")}">CanILiveThere</a>
      <nav class="site-nav">
        <a href="${withPersona("index.html")}" class="${activePage === "map" ? "active" : ""}">Map</a>
        <a href="${withPersona("lists.html")}" class="${activePage === "lists" ? "active" : ""}">Lists</a>
      </nav>
      <div class="persona-switch">
        <label for="persona-select">See it as someone most like you:</label>
        <select id="persona-select">
          <option value="">General (unpersonalized)</option>
          <option value="waldo">${escapeHtml(PERSONA_LABELS.waldo)}</option>
          <option value="wenda">${escapeHtml(PERSONA_LABELS.wenda)}</option>
          <option value="carmen">${escapeHtml(PERSONA_LABELS.carmen)}</option>
        </select>
      </div>
    </div>
    <p class="persona-blurb" id="persona-blurb"></p>
    <details class="recede">
      <summary>Information, not advice — read what this site is and isn't</summary>
      <p class="disclaimer recede-body">
        Every figure here carries a source, a last-checked date, and a
        confidence tier — rules change; confirm anything that matters with
        the relevant embassy, notary, or accountant before acting on it.
      </p>
    </details>
  `;
  document.body.prepend(header);

  const select = header.querySelector("#persona-select");
  select.value = persona || "";
  const blurb = header.querySelector("#persona-blurb");
  // Always show something here, before and after a persona is picked — the
  // pre-click intro reuses the exact same blurb strings the post-click line
  // shows, never new persona facts. Persona framing (§6): each descriptor
  // carries its own "Closest to you if..." lead-in, built from the same
  // figures PERSONA_LABELS already states, not new content.
  if (persona) {
    blurb.textContent = `${PERSONA_LABELS[persona]} — ${PERSONA_CLOSEST_IF[persona]}`;
  } else {
    blurb.textContent =
      "Personas you can view the site as: " +
      Object.entries(PERSONA_LABELS).map(([id, label]) => `${label} — ${PERSONA_CLOSEST_IF[id]}`).join(" · ");
  }
  select.addEventListener("change", () => {
    const params = new URLSearchParams(location.search);
    if (select.value) params.set("persona", select.value);
    else params.delete("persona");
    const qs = params.toString();
    location.search = qs ? `?${qs}` : "";
  });
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
