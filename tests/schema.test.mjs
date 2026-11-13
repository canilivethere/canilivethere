import test from "node:test";
import assert from "node:assert/strict";
import { loadStore } from "./lib/store.mjs";
import { assertAgainstBaseline } from "./lib/baseline.mjs";
import { schemaFailures } from "./checks/schema.mjs";

test("schema: every store row carries the fields its file needs", () => {
  assertAgainstBaseline(assert, "schema", schemaFailures(loadStore()));
});
