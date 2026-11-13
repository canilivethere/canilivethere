import test from "node:test";
import assert from "node:assert/strict";
import { baseRevision } from "./lib/store.mjs";
import { changeRuleFailures } from "./checks/change-rule.mjs";

test("change rule: a changed figure carries a changed date and a source", (t) => {
  const base = baseRevision();
  if (!base) { t.skip("no base revision to compare against"); return; }
  const removed = [];
  const failures = changeRuleFailures(base, { removed });
  if (removed.length) t.diagnostic(`${removed.length} row(s) removed against ${base.slice(0, 7)}: ${removed.slice(0, 10).join(", ")}`);
  assert.deepEqual(failures, [], `against ${base.slice(0, 7)}:\n  ${failures.join("\n  ")}`);
});
