// Shared loaders for the store tests. Reads derived/ from the working tree,
// or from any git revision, with no dependencies beyond Node itself.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function parseJsonl(text, label) {
  return text.split("\n").filter((l) => l.trim()).map((l, i) => {
    try { return JSON.parse(l); } catch (e) { throw new Error(`${label}:${i + 1}: not valid JSON (${e.message})`); }
  });
}

export function readJsonl(rel) {
  return parseJsonl(fs.readFileSync(path.join(ROOT, rel), "utf8"), rel);
}

export function factFiles() {
  return fs.readdirSync(path.join(ROOT, "derived/facts")).filter((f) => f.endsWith(".jsonl")).sort()
    .map((f) => `derived/facts/${f}`);
}

export function loadStore() {
  const facts = factFiles().flatMap((f) => readJsonl(f).map((r) => ({ ...r, _file: f })));
  return {
    facts,
    countries: readJsonl("derived/countries.jsonl"),
    locations: readJsonl("derived/locations.jsonl"),
    criteria: readJsonl("derived/criteria.jsonl"),
    scores: readJsonl("derived/scores.jsonl"),
    profiles: readJsonl("derived/profiles.jsonl"),
    fixtures: readJsonl("derived/fixtures.jsonl"),
    verdicts: readJsonl("derived/verdicts.jsonl"),
    routes: readJsonl("derived/visa-routes.jsonl"),
    cost: readJsonl("derived/cost-comparison.jsonl"),
    tiers: readJsonl("derived/nationality-tiers-public.jsonl"),
    rules: readJsonl("derived/rules.jsonl"),
    glossary: readJsonl("derived/glossary.jsonl"),
    meta: JSON.parse(fs.readFileSync(path.join(ROOT, "derived/meta.json"), "utf8")),
  };
}

export function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

// The revision the change rule and the shrink-only rule compare against.
// STORE_TEST_BASE overrides it. Otherwise: where this branch left master.
// On master itself (merge-base is HEAD), the parent commit.
export function baseRevision() {
  if (process.env.STORE_TEST_BASE) return process.env.STORE_TEST_BASE;
  for (const ref of ["origin/master", "master"]) {
    try {
      const mb = git(["merge-base", "HEAD", ref]).trim();
      const head = git(["rev-parse", "HEAD"]).trim();
      if (mb !== head) return mb;
      return git(["rev-parse", "HEAD^"]).trim();
    } catch { /* try the next ref */ }
  }
  return null;
}

export function readAtRevision(rev, rel) {
  try { return git(["show", `${rev}:${rel}`]); } catch { return null; }
}

export function listAtRevision(rev, dir) {
  try { return git(["ls-tree", "--name-only", `${rev}:${dir}`]).split("\n").filter(Boolean); } catch { return []; }
}

// The site's own currency table, as js/data.js resolves it.
export function fxRates(rules) {
  const rows = rules.filter((r) => r.rule_id === "visa-fit:_param:fx_rates").sort((a, b) => (b.version || 0) - (a.version || 0));
  return rows.length ? JSON.parse(rows[0].expression) : null;
}

export function tally(items) {
  const out = {};
  for (const k of items) out[k] = (out[k] || 0) + 1;
  return out;
}
