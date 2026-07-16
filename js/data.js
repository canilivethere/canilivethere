// CanILiveThere — derived-data loader.
//
// Reads the JSONL snapshot in derived/ directly in the browser (no backend,
// no build step, no bundler — fetch + JSON.parse, per the "boring,
// dependency-light" craft standard). Facts are per-country files
// (derived/facts/{country_id}.jsonl), everything else is one flat file.
//
// This module ONLY transports and indexes what's already in derived/. It
// authors nothing: no scores, no facts, no verdicts. The one computed value
// it produces — generalIndex() — is a documented, transparent aggregation
// over already-scored criteria (see the comment on WEIGHT_NUMERIC below),
// clearly labeled wherever it's shown, not a new fact and not a rules-engine
// verdict.

import { siteUrl } from "./site-root.js";

const WEIGHT_NUMERIC = { High: 3, "Medium-High": 2, Medium: 1 };

async function fetchJsonl(path) {
  let res;
  try {
    res = await fetch(path);
  } catch (e) {
    console.warn("Fetch failed for", path, e);
    return [];
  }
  if (!res.ok) {
    console.warn("Missing or unreadable:", path, res.status);
    return [];
  }
  const text = await res.text();
  const rows = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch (e) {
      console.warn("Bad JSONL row in", path, trimmed.slice(0, 80));
    }
  }
  return rows;
}

let _storePromise = null;

// v7 no-JS fallback: resolved via siteUrl() (site-root.js), not a bare
// relative "derived/" or a root-absolute "/derived/" — the same call needs
// to work correctly from a page one level down (l/<location_id>.html) as
// well as from the site root, and under both a domain-root mount and a
// project-site subpath mount, with no code change at cutover. A bare
// relative "derived/" from l/ resolves to l/derived/, which doesn't exist;
// a root-absolute "/derived/" resolves to the domain root, which 404s
// under a subpath mount.
export function loadStore(basePath = siteUrl("derived/")) {
  if (_storePromise) return _storePromise;
  _storePromise = buildStore(basePath);
  return _storePromise;
}

async function fetchJson(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn("Fetch failed for", path, e);
    return null;
  }
}

async function buildStore(basePath) {
  const [countries, locations, criteria, scores, changeEvents, profiles, fixtures, verdicts, visaRoutes, meta] =
    await Promise.all([
      fetchJsonl(basePath + "countries.jsonl"),
      fetchJsonl(basePath + "locations.jsonl"),
      fetchJsonl(basePath + "criteria.jsonl"),
      fetchJsonl(basePath + "scores.jsonl"),
      fetchJsonl(basePath + "change-events.jsonl"),
      fetchJsonl(basePath + "profiles.jsonl"),
      fetchJsonl(basePath + "fixtures.jsonl"),
      // v9 Part 6/7: the verdict-coverage engine's public export — the
      // free-text reasons[] audit trail and internal engine_version are
      // already stripped before this file ever reaches derived/, not
      // filtered here.
      fetchJsonl(basePath + "verdicts.jsonl"),
      // The rules layer's complete route export — one
      // row per documented threshold, country-scoped (route_key/
      // threshold_fact_key already public, no new exposure). Previously
      // published but never fetched client-side; this is the first
      // consumer. rules.jsonl (the engine's own parameter table, one row
      // today) is not fetched here — nothing on this site renders it
      // directly yet; see the location-page build notes.
      fetchJsonl(basePath + "visa-routes.jsonl"),
      fetchJson(basePath + "meta.json"),
    ]);

  const factsByCountry = {};
  await Promise.all(
    countries.map(async (c) => {
      factsByCountry[c.country_id] = await fetchJsonl(
        `${basePath}facts/${c.country_id}.jsonl`
      );
    })
  );
  const allFacts = Object.values(factsByCountry).flat();

  criteria.sort((a, b) => a.display_order - b.display_order);

  const countriesById = new Map(countries.map((c) => [c.country_id, c]));
  const locationsById = new Map(locations.map((l) => [l.location_id, l]));
  const criteriaById = new Map(criteria.map((c) => [c.criterion_id, c]));

  // scoresByLocation: location_id -> criterion_id -> score row
  const scoresByLocation = new Map();
  for (const s of scores) {
    if (!scoresByLocation.has(s.location_id)) scoresByLocation.set(s.location_id, new Map());
    scoresByLocation.get(s.location_id).set(s.criterion_id, s);
  }

  // factsByLocation: location_id -> [facts that apply], i.e. its own
  // location/sub-location facts PLUS its country's country-scoped facts
  // (this project's own data-model rule: country-level facts are inherited by locations).
  const factsByLocation = new Map();
  for (const loc of locations) {
    const own = allFacts.filter((f) => f.location_id === loc.location_id);
    const inherited = allFacts.filter(
      (f) => f.scope === "country" && f.country_id === loc.country_id
    );
    factsByLocation.set(loc.location_id, [...inherited, ...own]);
  }

  // changeEventsByCountry / ByLocation
  const changeEventsByCountry = new Map();
  const changeEventsByLocation = new Map();
  for (const ev of changeEvents) {
    if (!changeEventsByCountry.has(ev.country_id)) changeEventsByCountry.set(ev.country_id, []);
    changeEventsByCountry.get(ev.country_id).push(ev);
    if (ev.location_id) {
      if (!changeEventsByLocation.has(ev.location_id)) changeEventsByLocation.set(ev.location_id, []);
      changeEventsByLocation.get(ev.location_id).push(ev);
    }
  }

  // fixturesByPersona: persona_id -> location_id -> { criteria: Map(critId->row), verdict: row|null }
  const fixturesByPersona = new Map();
  for (const f of fixtures) {
    if (!fixturesByPersona.has(f.persona_id)) fixturesByPersona.set(f.persona_id, new Map());
    const perLoc = fixturesByPersona.get(f.persona_id);
    if (!perLoc.has(f.location_id)) perLoc.set(f.location_id, { criteria: new Map(), verdict: null });
    const entry = perLoc.get(f.location_id);
    if (f.criterion_id) entry.criteria.set(f.criterion_id, f);
    else entry.verdict = f;
  }

  const profilesById = new Map(profiles.map((p) => [p.persona_id, p]));

  // visaRoutesByCountry: country_id -> [route rows] — the general,
  // non-persona "visa routes on file" list. Grouping only,
  // no filtering or reshaping — every row transports as exported.
  const visaRoutesByCountry = new Map();
  for (const r of visaRoutes) {
    if (!visaRoutesByCountry.has(r.country_id)) visaRoutesByCountry.set(r.country_id, []);
    visaRoutesByCountry.get(r.country_id).push(r);
  }

  // verdictsByPersona: persona_id -> location_id -> verdict row (v9 Part
  // 6/7 — the five no-fixture personas' only source of a real, rule-derived
  // read; `routes_detail` stays a JSON-string-of-a-list on the row exactly
  // as exported, unparsed here, since Tier 1 (this build) never reads it —
  // a future Tier 2 build parses it at its own point of use).
  const verdictsByPersona = new Map();
  for (const v of verdicts) {
    if (!verdictsByPersona.has(v.persona_id)) verdictsByPersona.set(v.persona_id, new Map());
    verdictsByPersona.get(v.persona_id).set(v.location_id, v);
  }

  const store = {
    countries,
    locations,
    criteria,
    scores,
    changeEvents,
    profiles,
    fixtures,
    verdicts,
    countriesById,
    locationsById,
    criteriaById,
    scoresByLocation,
    factsByLocation,
    factsByCountry,
    changeEventsByCountry,
    changeEventsByLocation,
    fixturesByPersona,
    verdictsByPersona,
    visaRoutesByCountry,
    profilesById,
    meta,
  };

  store.generalIndex = (locationId) => generalIndex(store, locationId);
  store.personaIndex = (personaId, locationId) => personaIndex(store, personaId, locationId);
  return store;
}

// The unpersonalized "general relocation-friendliness index": a weighted
// average of every scored (status='scored') criterion for a location,
// weighted by the scorecard's own High / Medium-High / Medium weight
// classes (3 / 2 / 1). This weighting formula is a site-build judgment
// call, not part of the data layer's own contract — flagged as such in
// the build notes. It
// operates only on already-judged criterion scores (scores.jsonl), never
// on raw facts, and skips any criterion in status='gap' rather than
// silently zero-filling it.
function generalIndex(store, locationId) {
  const rows = store.scoresByLocation.get(locationId);
  if (!rows) return null;
  let weightedSum = 0;
  let weightTotal = 0;
  let gaps = 0;
  const used = [];
  for (const crit of store.criteria) {
    const row = rows.get(crit.criterion_id);
    if (!row) continue;
    if (row.status === "gap" || row.score == null) {
      gaps++;
      continue;
    }
    const w = WEIGHT_NUMERIC[crit.weight_class] || 1;
    weightedSum += row.score * w;
    weightTotal += w;
    used.push(crit.criterion_id);
  }
  if (weightTotal === 0) return null;
  return {
    value: weightedSum / weightTotal,
    criteriaUsed: used.length,
    criteriaTotal: store.criteria.length,
    gaps,
  };
}

// Shared per-criterion value resolution (fixture override -> scored
// fallback -> skip gaps): the one walk over store.criteria that both
// personaIndex() and topBottomCriteria() reduce over — a weighted average
// for the former, min/max for the latter — instead of each re-implementing
// the same fixture-lookup loop independently.
function resolvedCriterionValues(store, personaId, locationId) {
  const perLoc = personaId ? store.fixturesByPersona.get(personaId)?.get(locationId) : null;
  const scoreRows = store.scoresByLocation.get(locationId);
  const entries = [];
  let gaps = 0;
  for (const crit of store.criteria) {
    const fixtureRow = perLoc?.criteria?.get(crit.criterion_id);
    let val;
    if (fixtureRow) {
      val = Number(fixtureRow.expected);
    } else {
      const row = scoreRows ? scoreRows.get(crit.criterion_id) : null;
      if (!row || row.status === "gap" || row.score == null) {
        gaps++;
        continue;
      }
      val = row.score;
    }
    entries.push({ criterion_id: crit.criterion_id, name: crit.name, weight_class: crit.weight_class, val });
  }
  return { entries, gaps };
}

// Waldo has real per-criterion fixture overrides for 4 dynamic criteria
// (income-viability, infrastructure-connectivity, land-property-access,
// visa-legal-pathway-ease) — swap those into the general-index computation.
// Wenda/Carmen have ONLY a verdict-shaped fixture (no criterion overrides),
// per the runbook: rendered as "verification pending", never computed.
function personaIndex(store, personaId, locationId) {
  const perLoc = store.fixturesByPersona.get(personaId);
  const entry = perLoc ? perLoc.get(locationId) : null;
  if (!entry || entry.criteria.size === 0) {
    // No numeric override data for this persona (Wenda/Carmen) — fall back
    // to the general index, but the caller MUST label this as general, not
    // persona-specific (depth-honesty rule). Stay null when there's no
    // general index either (e.g. no scored criteria yet) rather than
    // spreading null into a valueless {personaAdjusted:false} object —
    // callers rely on `idx ? idx.value : ...` to detect "no data".
    const general = generalIndex(store, locationId);
    return general ? { ...general, personaAdjusted: false } : null;
  }
  const { entries, gaps } = resolvedCriterionValues(store, personaId, locationId);
  let weightedSum = 0;
  let weightTotal = 0;
  for (const e of entries) {
    const w = WEIGHT_NUMERIC[e.weight_class] || 1;
    weightedSum += e.val * w;
    weightTotal += w;
  }
  if (weightTotal === 0) return null;
  return {
    value: weightedSum / weightTotal,
    criteriaUsed: entries.length,
    criteriaTotal: store.criteria.length,
    gaps,
    personaAdjusted: true,
  };
}

// Tooltip voice (v2 addendum §4.1): the location's own
// highest- and lowest-scoring criteria, over whichever values actually feed
// its index (a persona's own fixture override where one exists, the general
// scorecard everywhere else) — the exact same substitution personaIndex()
// already does, just returning the extremes instead of the weighted
// average. `personaId=null` gives the plain general-index reading. Purely a
// max/min over numbers that already exist; authors nothing.
export function topBottomCriteria(store, personaId, locationId) {
  const { entries } = resolvedCriterionValues(store, personaId, locationId);
  if (!entries.length) return null;
  let top = entries[0];
  let bottom = entries[0];
  for (const e of entries) {
    if (e.val > top.val) top = e;
    if (e.val < bottom.val) bottom = e;
  }
  return { top, bottom };
}

// Verdict fixtures (Wenda/Carmen) are freeform prose, e.g.
// "Near-miss - Rentista ~$2,000 threshold missed by ~5%; ...". The leading
// clause before the first " - " is extracted MECHANICALLY (a plain string
// split, not an interpretation) as the at-a-glance headline; the full
// string is always shown too. This is deliberately not a synthesized
// pass/fail enum — see the build notes.
export function verdictHeadline(expectedText) {
  const idx = expectedText.indexOf(" - ");
  if (idx === -1) return expectedText;
  return expectedText.slice(0, idx);
}

// Mechanical fact->section bucketing, keyed off which source research file
// a fact's source_ref names (the six-file set: overview / visa-legal /
// property / cost-of-living / community-network / red-flags.md). This is a
// lookup, not a judgment call — every candidate location's research was
// authored as one of these six files, and the public export preserves the
// bare filename. Falls back to a criterion_id-based guess only when
// source_ref is a [GAP] marker (no real file behind it yet).
const FILE_SECTION_MAP = [
  ["red-flags.md", "redflags"],
  ["visa-legal.md", "visa"],
  ["property.md", "property"],
  ["cost-of-living.md", "cost"],
  ["community-network.md", "community"],
  ["overview.md", "overview"],
];

const CRITERION_SECTION_FALLBACK = {
  "visa-legal-pathway-ease": "visa",
  "land-property-access": "property",
  "cost-of-living-affordability": "cost",
  "community-social-fabric": "community",
  "room-for-others-group-viability": "community",
};

export function sectionForFact(fact) {
  const ref = fact.source_ref || "";
  for (const [needle, section] of FILE_SECTION_MAP) {
    if (ref.includes(needle)) return section;
  }
  if (fact.criterion_id && CRITERION_SECTION_FALLBACK[fact.criterion_id]) {
    return CRITERION_SECTION_FALLBACK[fact.criterion_id];
  }
  return "overview";
}
