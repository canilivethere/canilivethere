// The baseline: failures that already existed when the tests arrived.
// A failure not on the list fails the run. An entry that no longer fails
// must be removed. The list may never grow against the base revision
// (tests/baseline.test.mjs).

import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./store.mjs";

export const BASELINE_PATH = "tests/baseline.json";

export function loadBaseline(text = null) {
  const raw = text ?? (fs.existsSync(path.join(ROOT, BASELINE_PATH)) ? fs.readFileSync(path.join(ROOT, BASELINE_PATH), "utf8") : null);
  if (!raw) return { generated: null, checks: {} };
  return JSON.parse(raw);
}

// Compare one check's current failures with its baseline entries.
// Returns the two lists a test fails on.
export function compare(check, failures) {
  const known = new Set(loadBaseline().checks[check] || []);
  const current = new Set(failures);
  return {
    added: [...current].filter((f) => !known.has(f)).sort(),
    stale: [...known].filter((f) => !current.has(f)).sort(),
  };
}

export function assertAgainstBaseline(assert, check, failures, limit = 20) {
  const { added, stale } = compare(check, failures);
  const show = (xs) => xs.slice(0, limit).join("\n  ") + (xs.length > limit ? `\n  … and ${xs.length - limit} more` : "");
  assert.deepEqual(added, [], `${check}: ${added.length} new failure(s), not in ${BASELINE_PATH}:\n  ${show(added)}`);
  assert.deepEqual(stale, [], `${check}: ${stale.length} baseline entr(ies) no longer fail; remove them with \`npm run baseline\`:\n  ${show(stale)}`);
}
