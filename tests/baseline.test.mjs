import test from "node:test";
import assert from "node:assert/strict";
import { baseRevision, readAtRevision } from "./lib/store.mjs";
import { loadBaseline, BASELINE_PATH } from "./lib/baseline.mjs";
import { BASELINED } from "./checks/index.mjs";

test("baseline: dated by the tool, and only for checks that exist", () => {
  const b = loadBaseline();
  assert.match(b.generated || "", /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/, "baseline has no tool-written date");
  for (const k of Object.keys(b.checks)) assert.ok(k in BASELINED, `unknown check in baseline: ${k}`);
  for (const [k, ids] of Object.entries(b.checks)) assert.equal(b.counts?.[k], ids.length, `${k}: count does not match its list`);
});

test("baseline: may only shrink against the base revision", (t) => {
  const base = baseRevision();
  const old = base && readAtRevision(base, BASELINE_PATH);
  if (!old) { t.skip("no baseline on the base revision yet"); return; }
  const before = JSON.parse(old).checks;
  const now = loadBaseline().checks;
  const grown = [];
  for (const [k, ids] of Object.entries(now)) {
    const was = new Set(before[k] || []);
    for (const id of ids) if (!was.has(id)) grown.push(`${k}: ${id}`);
  }
  assert.deepEqual(grown, [], `baseline grew against ${base.slice(0, 7)}:\n  ${grown.slice(0, 20).join("\n  ")}`);
});
