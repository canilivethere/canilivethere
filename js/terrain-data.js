// Per-location terrain — a static, hand-authored asset (no runtime
// dependency, no CDN, no tile server), same "no-runtime-dependency"
// convention as worldmap-data.js's own COUNTRY_PATHS. Distinct file, not an
// export bolted onto worldmap-data.js: a schema ruling this session (see
// Part 13.5) reasons that terrain is an
// independently-growing concern from country-outline geometry, and
// worldmap-data.js is already this site's single largest static asset
// (flagged for size sensitivity in its own build notes) — kept separate on
// purpose.
//
// Shape, per that ruling: TERRAIN_FEATURES keyed by location_id -> an ARRAY
// of feature objects (array, not a single object, so a location with more
// than one terrain feature — e.g. a future candidate with both a lake and a
// coastline — never needs a redesign). Each feature object:
// { kind, tier, radius_km, shape, markers, source }.
//   - kind: a short string ("lake", "coastline", "volcano-cluster", etc.)
//   - tier: "A" (neutral filled shape, sourced only from radius_km) or "B"
//     (a real hand-traced shape via `shape`/`markers`)
//   - radius_km: Tier A sizing only — the shape's own real-world radius in
//     kilometers, converted to world-viewBox units at render time (map.js)
//   - shape: Tier B only — a traced point array or SVG path; null until a
//     real cartographic pull sources it
//   - markers: Tier B only — named peak/point array (e.g. volcano peaks);
//     null until sourced
//   - source: citation once Tier B is real; for a Tier A entry built from
//     unverified general knowledge (like this one), the honest caveat
//     instead
//
// This is the naming convention for every future per-location terrain
// feature, not just this one: same TERRAIN_FEATURES export, same
// location_id key, a new `kind` value — never a new file, new field name,
// or new per-candidate schema shape.

export const TERRAIN_FEATURES = {
  // Part 13: Atitlán as the worked case. Tier A
  // only tonight — Tier B (a real traced Lake Atitlán shoreline plus the
  // three volcano peaks ringing its south shore) is blocked on an
  // unstarted cartographic pull, named plainly in the spec itself (§13.4,
  // §13.5) and not attempted here.
  //
  // radius_km: half of the ~18km long-axis figure the spec cites (a
  // commonly-cited general figure, NOT verified against a primary source
  // this session — stated plainly in the spec's own §13.3/§13.5 and
  // repeated here so it travels with the data, not just the prose that
  // produced it) — sized so the rendered shape's diameter approximates the
  // lake's real long-axis extent, not its radius.
  "GT-atitlan": [
    {
      kind: "lake",
      tier: "A",
      radius_km: 9,
      shape: null,
      markers: null,
      source: "Lake Atitlan long-axis ~18km, a commonly-cited general "
        + "figure — not verified against a primary source this session "
        + "(Part 13.3/13.5). Tier B "
        + "(a real traced shoreline plus the three volcano peaks) is "
        + "blocked on an unstarted cartographic pull.",
    },
  ],
};
