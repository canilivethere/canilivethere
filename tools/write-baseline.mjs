// Writes tests/baseline.json from the checks' current failures, stamped
// with the clock. Run it once to create the baseline, and afterwards only
// to remove entries that no longer fail: tests/baseline.test.mjs refuses
// any entry the base revision did not already have.
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadStore } from "../tests/lib/store.mjs";
import { BASELINE_PATH } from "../tests/lib/baseline.mjs";
import { BASELINED } from "../tests/checks/index.mjs";

const store = loadStore();
const checks = {};
const counts = {};
for (const [name, fn] of Object.entries(BASELINED)) {
  checks[name] = [...new Set(fn(store))].sort();
  counts[name] = checks[name].length;
}
const generated = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const out = { generated, note: "Failures that existed when the tests arrived. The list may only shrink.", counts, checks };
fs.writeFileSync(path.join(ROOT, BASELINE_PATH), JSON.stringify(out, null, 1) + "\n");
console.log(`${BASELINE_PATH}: ${generated}`, counts);
