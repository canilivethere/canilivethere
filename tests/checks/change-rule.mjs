// Test 3, change rule: a row whose figure changed against the base
// revision must also carry a changed date, and must still name a source.
//
// What counts as the figure: any field that gives it its meaning, which
// is value, unit, period, currency, denominator or scope, bar basis, and
// statutory multiple with its index. Labels and notes are left out.

import { parseJsonl, readAtRevision, listAtRevision, factFiles, readJsonl } from "../lib/store.mjs";

export const FIGURE_FIELDS = [
  "value_raw", "value_num_low", "value_num_high", "value_bool", "income_threshold",
  "unit", "period", "currency_code",
  "scope", "scope_detail", "scope_note", "bar_basis", "bar_kind", "property_rule",
  "statutory_multiple", "statutory_base_fact_key", "statutory_base_label",
  "score", "expected", "entry_tier_kind", "entry_max_days",
];
const DATE_FIELDS = ["date", "last_verified_date", "scored_date", "captured_date"];

// file -> identity fields
const FILES = [
  ...factFiles().map((f) => [f, ["fact_key"]]),
  ["derived/visa-routes.jsonl", ["route_key"]],
  ["derived/cost-comparison.jsonl", ["location_id", "category", "fact_key"]],
  ["derived/scores.jsonl", ["location_id", "criterion_id"]],
  ["derived/fixtures.jsonl", ["fixture_id"]],
  ["derived/nationality-tiers-public.jsonl", ["nationality", "country_id"]],
];

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
// Rows whose source is another row (a score, a fixture, a tier's fact) carry no URL of their own.
const SOURCELESS = new Set(["derived/scores.jsonl", "derived/fixtures.jsonl", "derived/nationality-tiers-public.jsonl"]);

function keyed(rows, idFields) {
  const m = new Map();
  for (const r of rows) {
    const id = idFields.map((f) => r[f] ?? "").join("|");
    // Duplicate keys (a schema failure of their own) are compared as a list.
    if (m.has(id)) m.set(id, [].concat(m.get(id), [r])); else m.set(id, r);
  }
  return m;
}

export function changeRuleFailures(baseRev, { removed = [] } = {}) {
  const out = [];
  if (!baseRev) return out;
  const baseFacts = new Set(listAtRevision(baseRev, "derived/facts").map((f) => `derived/facts/${f}`));
  const files = [...FILES, ...[...baseFacts].filter((f) => !FILES.some(([g]) => g === f)).map((f) => [f, ["fact_key"]])];
  for (const [file, idFields] of files) {
    const oldText = readAtRevision(baseRev, file);
    if (oldText === null) continue; // a new file: nothing to compare against
    let now = [];
    try { now = readJsonl(file); } catch { now = []; }
    const before = keyed(parseJsonl(oldText, `${baseRev}:${file}`), idFields);
    const after = keyed(now, idFields);
    for (const [id, a] of after) {
      const b = before.get(id);
      if (!b || Array.isArray(a) || Array.isArray(b)) continue;
      const changed = FIGURE_FIELDS.filter((f) => !same(a[f], b[f]));
      if (!changed.length) continue;
      const dated = DATE_FIELDS.some((f) => f in a && !same(a[f], b[f]));
      if (!dated) out.push(`change:${file}:${id}:figure-changed-date-not (${changed.join(",")})`);
      if (!SOURCELESS.has(file) && !a.source_url) out.push(`change:${file}:${id}:figure-changed-no-source`);
    }
    for (const id of before.keys()) if (!after.has(id)) removed.push(`${file}:${id}`);
  }
  return out;
}
