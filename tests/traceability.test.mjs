import test from "node:test";
import assert from "node:assert/strict";
import { loadStore } from "./lib/store.mjs";
import { assertAgainstBaseline } from "./lib/baseline.mjs";
import { traceabilityFailures } from "./checks/traceability.mjs";

test("traceability: every number on a place page resolves to the store; templates carry none", () => {
  assertAgainstBaseline(assert, "traceability", traceabilityFailures(loadStore()));
});
