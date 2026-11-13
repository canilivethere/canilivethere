import test from "node:test";
import assert from "node:assert/strict";
import { loadStore } from "./lib/store.mjs";
import { assertAgainstBaseline } from "./lib/baseline.mjs";
import { fixtureReferenceFailures, verdictComparison, verdictFailures } from "./checks/fixtures.mjs";

const store = loadStore();

test("fixtures: every fixture names a persona, place and criterion that exist", () => {
  assertAgainstBaseline(assert, "fixture-references", fixtureReferenceFailures(store));
});

test("fixtures: the site's engine agrees with the shipped verdict on every amount-decided route", (t) => {
  const c = verdictComparison(store);
  t.diagnostic(`${c.agree.length} agree, ${c.mismatches.length} disagree, ${c.notComparable.length} not comparable`);
  assert.ok(c.agree.length > 0, "no route was compared at all");
  assertAgainstBaseline(assert, "verdicts", verdictFailures(store));
});
