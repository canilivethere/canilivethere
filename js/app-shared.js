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

// Pre-click explanation of who the three personas are, built from the same
// blurb strings shown after selection — one true source for persona text,
// readable before the dropdown is ever touched.
const PERSONA_INTRO = "Personas you can view the site as: " + Object.values(PERSONA_LABELS).join(" · ");

// One canonical name and definition for the site's central number, reused
// everywhere a reader meets it (map legend, Lists column, location page).
// The name itself ("Fit index") is already the literal text of the Lists
// column header and every tooltip/label below — this is the definition
// that travels with it.
export const FIT_INDEX_DEFINITION =
  "Fit index: a weighted 1–5 average of scored criteria. Higher is better — 5 is the strongest fit, 1 is the weakest.";

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
        <label for="persona-select">Viewing as</label>
        <select id="persona-select">
          <option value="">General (unpersonalized)</option>
          <option value="waldo">${escapeHtml(PERSONA_LABELS.waldo)}</option>
          <option value="wenda">${escapeHtml(PERSONA_LABELS.wenda)}</option>
          <option value="carmen">${escapeHtml(PERSONA_LABELS.carmen)}</option>
        </select>
      </div>
    </div>
    <p class="persona-blurb" id="persona-blurb"></p>
    <p class="disclaimer">
      Information, not advice. Every figure here carries a source, a
      last-checked date, and a confidence tier — rules change; confirm
      anything that matters with the relevant embassy, notary, or
      accountant before acting on it.
    </p>
  `;
  document.body.prepend(header);

  const select = header.querySelector("#persona-select");
  select.value = persona || "";
  const blurb = header.querySelector("#persona-blurb");
  // Always show something here, before and after a persona is picked — the
  // pre-click intro reuses the exact same blurb strings the post-click line
  // shows, never new persona facts.
  blurb.textContent = persona ? PERSONA_LABELS[persona] : PERSONA_INTRO;
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
  if (fact.unit) return `${fact.value_raw} ${fact.unit}`;
  return fact.value_raw;
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

export function confidenceBadge(fact) {
  if (fact.value_raw === "[GAP]") {
    return `<span class="badge badge-gap">Not yet researched</span>`;
  }
  const bits = [];
  if (fact.confidence) bits.push(CONF_LABEL[fact.confidence] || fact.confidence);
  if (fact.source_count) bits.push(SOURCE_COUNT_LABEL[fact.source_count] || fact.source_count.replace(/-/g, " "));
  const label = bits.length ? bits.join(", ") : "confidence not stated";
  const cls = fact.confidence === "High" ? "badge-high" : fact.confidence === "Medium" ? "badge-medium" : "badge-speculative";
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
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
