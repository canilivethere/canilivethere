// Test 1, schema: every store row carries the fields its file needs.
// Returns one failure ID per problem; IDs are stable so the baseline can
// name them.

const VERIFICATION_STATES = new Set(["archived", "cited-unfetched", "no-source", "declared-gap", "fetched-lost"]);
const CONFIDENCE = new Set(["High", "Medium", "Speculative"]);
const SOURCE_COUNT = new Set(["single", "cross-corroborated", "primary-institutional", "aggregator-only"]);
const BAR_KINDS = new Set(["income", "capital", "none"]);
const ISO_DATE = /^\d{4}(-\d\d(-\d\d)?)?$/;
const YMD = /^\d{4}-\d\d-\d\d$/;

const blank = (v) => v === undefined || v === null || v === "";
const isUrl = (v) => typeof v === "string" && /^https?:\/\/\S+$/.test(v);

export function schemaFailures(store) {
  const out = [];
  const fail = (kind, key, problem) => out.push(`${kind}:${key}:${problem}`);
  const countries = new Set(store.countries.map((c) => c.country_id));
  const locations = new Set(store.locations.map((l) => l.location_id));
  const criteria = new Set(store.criteria.map((c) => c.criterion_id));
  const personas = new Set(store.profiles.map((p) => p.persona_id));
  const factKeys = new Map();
  const routeKeys = new Set(store.routes.map((r) => r.route_key));

  // A row the export marks as a declared gap is a gap, not a claim.
  // Every other row is a claim and carries the public trust layer.
  for (const f of store.facts) {
    const key = f.fact_key;
    if (blank(key)) { fail("fact", `${f._file}:?`, "no-fact-key"); continue; }
    if (factKeys.has(key)) fail("fact", key, "duplicate-fact-key");
    factKeys.set(key, f);
    const cc = f._file.match(/([A-Z]{2})\.jsonl$/)[1];
    if (f.country_id !== cc) fail("fact", key, "country-not-file");
    if (!blank(f.location_id) && !locations.has(f.location_id)) fail("fact", key, "unknown-location");
    if (!blank(f.criterion_id) && !criteria.has(f.criterion_id)) fail("fact", key, "unknown-criterion");
    if (blank(f.value_raw)) fail("fact", key, "no-value");
    if (!VERIFICATION_STATES.has(f.verification_state)) fail("fact", key, "unknown-verification-state");
    // Never a path, on any row: that is the publication boundary.
    if (/[\\/]/.test(f.source_ref || "")) fail("fact", key, "source-ref-is-a-path");
    // A stored value means one thing on its own: a bare Yes or No on a
    // row whose role carries the meaning does not.
    if (!blank(f.group_role) && /^(yes|no)$/i.test(String(f.value_raw).trim())) fail("fact", key, "bare-yes-no-on-role");
    if (f.verification_state === "declared-gap") continue;
    if (!isUrl(f.source_url)) fail("fact", key, "no-source-url");
    // A claim names its source file; a marker such as [GAP] or [on file] does not.
    if (!/^[^\s[\]\\/]+\.[A-Za-z0-9]+$/.test(f.source_ref || "")) fail("fact", key, "source-ref-not-a-filename");
    if (!ISO_DATE.test(f.date || "")) fail("fact", key, "date-not-iso");
    if (!CONFIDENCE.has(f.confidence)) fail("fact", key, "no-confidence");
    if (!SOURCE_COUNT.has(f.source_count)) fail("fact", key, "no-source-count");
  }

  const seenRoutes = new Set();
  for (const r of store.routes) {
    const key = r.route_key;
    if (seenRoutes.has(key)) fail("route", key, "duplicate-route-key");
    seenRoutes.add(key);
    if (!countries.has(r.country_id)) fail("route", key, "unknown-country");
    if (!isUrl(r.source_url)) fail("route", key, "no-source-url");
    if (!ISO_DATE.test(r.date || "")) fail("route", key, "date-not-iso");
    if (!CONFIDENCE.has(r.confidence)) fail("route", key, "no-confidence");
    if (!SOURCE_COUNT.has(r.source_count)) fail("route", key, "no-source-count");
    if (!blank(r.threshold_fact_key) && !factKeys.has(r.threshold_fact_key)) fail("route", key, "threshold-fact-missing");
    if (!key.includes(":route:")) continue;
    if (!BAR_KINDS.has(r.bar_kind)) { fail("route", key, "unknown-bar-kind"); continue; }
    if (r.bar_kind === "none") continue;
    if (!Number.isFinite(r.value_num_low)) fail("route", key, "bar-not-a-number");
    // A route bar holds one figure in the source's currency.
    else if (Number.isFinite(r.value_num_high) && r.value_num_high !== r.value_num_low) fail("route", key, "bar-is-a-range");
    if (blank(r.currency_code) || r.currency_code === "unstated") fail("route", key, "bar-currency-unstated");
    if (r.bar_kind === "income" && !["month", "year"].includes(r.period)) fail("route", key, "bar-period-unstated");
  }

  for (const c of store.cost) {
    const key = c.fact_key || `${c.location_id}:${c.category}`;
    if (!locations.has(c.location_id)) fail("cost", key, "unknown-location");
    if (c.status !== "ok") continue;
    if (!isUrl(c.source_url)) fail("cost", key, "no-source-url");
    if (!ISO_DATE.test(c.date || "")) fail("cost", key, "date-not-iso");
    if (!CONFIDENCE.has(c.confidence)) fail("cost", key, "no-confidence");
  }

  const seenScores = new Set();
  for (const s of store.scores) {
    const key = `${s.location_id}:${s.criterion_id}`;
    if (seenScores.has(key)) fail("score", key, "duplicate");
    seenScores.add(key);
    if (!locations.has(s.location_id)) fail("score", key, "unknown-location");
    if (!criteria.has(s.criterion_id)) fail("score", key, "unknown-criterion");
    if (s.status === "scored" && !(Number.isInteger(s.score) && s.score >= 1 && s.score <= 5)) fail("score", key, "score-out-of-range");
    if (s.status === "scored" && !YMD.test(s.scored_date || "")) fail("score", key, "no-scored-date");
  }

  for (const t of store.tiers) {
    const key = `${t.nationality}:${t.country_id}`;
    if (!/^[A-Z]{2}$/.test(t.nationality)) fail("tier", key, "bad-nationality");
    if (!countries.has(t.country_id)) fail("tier", key, "unknown-country");
    if (!factKeys.has(t.fact_key)) fail("tier", key, "fact-missing");
    if (!YMD.test(t.last_verified_date || "")) fail("tier", key, "no-verified-date");
  }

  for (const l of store.locations) {
    if (!countries.has(l.country_id)) fail("location", l.location_id, "unknown-country");
    if (!Number.isFinite(l.lat) || !Number.isFinite(l.lon)) fail("location", l.location_id, "no-coordinates");
  }

  for (const v of store.verdicts) {
    const key = `${v.persona_id}:${v.location_id || v.country_id}`;
    if (!personas.has(v.persona_id)) fail("verdict", key, "unknown-persona");
    if (!countries.has(v.country_id)) fail("verdict", key, "unknown-country");
    if (!blank(v.location_id) && !locations.has(v.location_id)) fail("verdict", key, "unknown-location");
    let detail = [];
    try { detail = JSON.parse(v.routes_detail || "[]"); } catch { fail("verdict", key, "routes-detail-not-json"); }
    for (const d of detail) {
      if ((d.group_kind === "route" || d.group_kind === "visit") && !routeKeys.has(d.route_key)) fail("verdict", `${key}:${d.route_key}`, "route-missing");
    }
  }
  return out;
}
