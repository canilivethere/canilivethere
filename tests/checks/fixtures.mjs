// Test 4, reader fixtures: the eight test readers as test cases.
//
// (a) Every fixture row names a persona, location, criterion and country
//     that exist, and the location sits in that country.
// (b) The site's own engine (js/own-numbers-data.js, the code the browser
//     runs) re-reads each test reader against each route bar, and the
//     result must agree with the verdict the store ships for that reader.
//     Only routes the store decided on the amount are compared; the rest
//     are counted as not comparable, with the engine's reason.

import { barForRow, evaluateRow } from "../../js/own-numbers-data.js";
import { fxRates } from "../lib/store.mjs";

const PROFILE_INCOME_TYPE = { "remote-active": "remote_active", "local-active": "local_active", pension: "pension", passive: "passive" };
const AMOUNT_STATES = {
  FAILS_AMOUNT: (r) => r < 1,
  NEAR_LINE_AMOUNT: (r) => r >= 0.9 && r < 1.1,
  QUALIFIES_AND_CONVERTS: (r) => r >= 1,
  QUALIFIES_CONDITIONAL: (r) => r >= 1,
};

export function fixtureReferenceFailures(store) {
  const out = [];
  const personas = new Set(store.profiles.map((p) => p.persona_id));
  const countryOf = new Map(store.locations.map((l) => [l.location_id, l.country_id]));
  const countries = new Set(store.countries.map((c) => c.country_id));
  const criteria = new Set(store.criteria.map((c) => c.criterion_id));
  const ids = new Set();
  for (const f of store.fixtures) {
    const id = f.fixture_id;
    if (ids.has(id)) out.push(`fixture:${id}:duplicate`);
    ids.add(id);
    if (!personas.has(f.persona_id)) out.push(`fixture:${id}:unknown-persona`);
    if (f.location_id != null && !countryOf.has(f.location_id)) out.push(`fixture:${id}:unknown-location`);
    if (f.country_id != null && !countries.has(f.country_id)) out.push(`fixture:${id}:unknown-country`);
    if (f.location_id != null && f.country_id != null && countryOf.get(f.location_id) !== f.country_id) out.push(`fixture:${id}:location-not-in-country`);
    if (f.location_id == null && f.country_id == null) out.push(`fixture:${id}:no-place`);
    if (f.criterion_id != null && !criteria.has(f.criterion_id)) out.push(`fixture:${id}:unknown-criterion`);
    if (f.criterion_id != null && !/^[1-5]$/.test(String(f.expected))) out.push(`fixture:${id}:expected-not-a-score`);
    if (f.criterion_id == null && !/^[1-5]$/.test(String(f.expected)) && !String(f.expected || "").trim()) out.push(`fixture:${id}:no-expected`);
  }
  return out;
}

export function readerInput(profile) {
  const input = {
    amount: profile.income_monthly_usd, currency: "USD", period: "month",
    income_type: PROFILE_INCOME_TYPE[profile.income_type] || "unspecified",
    duration_band: "long_stay",
  };
  if (profile.property_capital_usd > 0) input.property_capital = { amount: profile.property_capital_usd };
  return input;
}

// The engine refuses a rate older than 30 days by the running clock. The
// test pins the clock to the rate table's own date, so its answer depends
// on the store and not on the day it runs.
function withClock(ms, fn) {
  const real = Date.now;
  Date.now = () => ms;
  try { return fn(); } finally { Date.now = real; }
}

export function verdictComparison(store) {
  const fx = fxRates(store.rules);
  const asOf = fx ? Math.max(...Object.values(fx.rates).map((e) => Date.parse(`${e.as_of}T00:00:00Z`))) : Date.now();
  const routes = new Map(store.routes.map((r) => [r.route_key, r]));
  const profiles = new Map(store.profiles.map((p) => [p.persona_id, p]));
  const agree = [];
  const mismatches = [];
  const notComparable = [];
  for (const v of store.verdicts) {
    if (v.scope !== "country") continue;
    const profile = profiles.get(v.persona_id);
    if (!profile) continue;
    for (const d of JSON.parse(v.routes_detail || "[]")) {
      const expect = AMOUNT_STATES[d.composed_state];
      if (d.group_kind !== "route" || !expect) continue;
      const row = routes.get(d.route_key);
      const tag = `${v.persona_id}:${d.route_key}:${d.composed_state}`;
      if (!row || !barForRow(row)) { notComparable.push({ tag, reason: row ? "no-bar" : "route-missing" }); continue; }
      const result = withClock(asOf, () => evaluateRow(row, readerInput(profile), fx));
      const c = result.gate2?.comparable;
      if (!c) { notComparable.push({ tag, reason: result.gate2?.reason || result.typeState || "no-comparison" }); continue; }
      const ratio = c.readerAmount / c.threshold;
      const entry = { tag, ratio, reader: c.readerAmount, bar: c.threshold, currency: row.currency_code, kind: row.bar_kind };
      (expect(ratio) ? agree : mismatches).push(entry);
    }
  }
  return { agree, mismatches, notComparable };
}

export function verdictFailures(store) {
  return verdictComparison(store).mismatches.map((m) => `verdict:${m.tag}:engine-${m.ratio >= 1 ? "clears" : "short"}`);
}

