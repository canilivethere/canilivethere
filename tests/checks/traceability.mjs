// Test 2, traceability: every number a reader sees on a prerendered place
// page resolves to a value in the store rows for that place's country, and
// no number is written into a page template or a reader-facing string.

import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/store.mjs";
import { defaultWeightForCriterion } from "../../js/data.js";

// Thousands separators the site prints: comma, narrow and plain no-break space.
const NUMBER = /\d{1,3}(?:[,\u202f\u00a0]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

function normalise(token) {
  const n = Number(token.replace(/[,\u202f\u00a0]/g, ""));
  return Number.isFinite(n) ? String(n) : null;
}

export function numbersIn(text) {
  const out = [];
  for (const m of String(text).matchAll(NUMBER)) {
    const n = normalise(m[0]);
    if (n !== null) out.push(n);
  }
  return out;
}

function collectNumbers(value, into) {
  if (value === null || value === undefined) return;
  if (typeof value === "number") { into.add(String(value)); return; }
  if (typeof value === "string") {
    for (const n of numbersIn(value)) into.add(n);
    // Nested JSON (routes_detail, rule expressions) holds numbers too.
    if (/^[[{]/.test(value.trim())) { try { collectNumbers(JSON.parse(value), into); } catch { /* prose */ } }
    return;
  }
  if (Array.isArray(value)) { for (const v of value) collectNumbers(v, into); return; }
  if (typeof value === "object") for (const v of Object.values(value)) collectNumbers(v, into);
}

// Visible text: markup, scripts, styles and attribute values removed.
export function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, "\u00a0")
    .replace(/&#8239;/g, "\u202f")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;|&#\d+;/gi, " ");
}

function generalIndices(store) {
  const crit = new Map(store.criteria.map((c) => [c.criterion_id, c]));
  const sums = new Map();
  for (const s of store.scores) {
    if (s.status === "gap" || s.score == null || !crit.has(s.criterion_id)) continue;
    const w = defaultWeightForCriterion(crit.get(s.criterion_id));
    const acc = sums.get(s.location_id) || { sum: 0, w: 0 };
    acc.sum += s.score * w; acc.w += w;
    sums.set(s.location_id, acc);
  }
  return [...sums.values()].filter((a) => a.w > 0).map((a) => String(Number((a.sum / a.w).toFixed(1))));
}

export function traceabilityFailures(store) {
  const out = [];
  const shared = new Set();
  for (const rows of [store.criteria, store.glossary, store.rules, [store.meta]]) collectNumbers(rows, shared);
  // The one figure the site computes rather than stores: each place's
  // general index, the weighted mean of its scores, shown to one decimal.
  for (const n of generalIndices(store)) shared.add(n);

  const countryOf = new Map(store.locations.map((l) => [l.location_id, l.country_id]));
  const byCountry = new Map();
  const add = (cc, row) => {
    if (!cc) return;
    if (!byCountry.has(cc)) byCountry.set(cc, new Set(shared));
    collectNumbers(row, byCountry.get(cc));
  };
  for (const r of store.facts) add(r.country_id, r);
  for (const r of store.routes) add(r.country_id, r);
  for (const r of store.locations) add(r.country_id, r);
  for (const r of store.scores) add(countryOf.get(r.location_id), r);
  for (const r of store.cost) add(countryOf.get(r.location_id), r);
  for (const r of store.tiers) add(r.country_id, r);
  for (const r of store.verdicts) add(r.country_id, r);

  const dir = path.join(ROOT, "l");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort()) {
    const loc = file.replace(/\.html$/, "");
    const cc = countryOf.get(loc);
    if (!cc) { out.push(`page:l/${file}:unknown-location`); continue; }
    const known = byCountry.get(cc) || shared;
    const text = visibleText(fs.readFileSync(path.join(dir, file), "utf8"));
    for (const n of new Set(numbersIn(text))) if (!known.has(n)) out.push(`page:l/${file}:${n}`);
  }

  // Templates: the top-level pages' own visible text, and the reader-facing
  // string table, carry no figures. A number there was typed, not stored.
  for (const file of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort()) {
    const text = visibleText(fs.readFileSync(path.join(ROOT, file), "utf8"));
    for (const n of new Set(numbersIn(text))) out.push(`template:${file}:${n}`);
  }
  const strings = fs.readFileSync(path.join(ROOT, "js/reader-strings.js"), "utf8")
    .split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  for (const m of strings.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)) {
    for (const n of new Set(numbersIn(m[2]))) out.push(`template:js/reader-strings.js:${n}:${m[2].slice(0, 40).replace(/\s+/g, " ")}`);
  }
  return [...new Set(out)];
}
