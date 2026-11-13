// Report, not a test: each test reader's expected criterion value in
// derived/fixtures.jsonl against the place's current score in
// derived/scores.jsonl, plus the verdict comparison test 4 runs.
//
//   node tools/fixture-report.mjs [--out report.md]
import fs from "node:fs";
import { loadStore, tally } from "../tests/lib/store.mjs";
import { fixtureScoreComparison, verdictComparison } from "../tests/checks/fixtures.mjs";

const store = loadStore();
const rows = fixtureScoreComparison(store);
const off = rows.filter((r) => !r.match);
const lines = [];
lines.push(`# Fixture report`, ``, `Criterion fixtures: ${rows.length}. Expected equals the current score: ${rows.length - off.length}. Differs: ${off.length}.`, ``);
lines.push(`## Differences by criterion`, ``, `| criterion | differs | of |`, `|---|---|---|`);
const all = tally(rows.map((r) => r.criterion));
for (const [c, n] of Object.entries(tally(off.map((r) => r.criterion))).sort()) lines.push(`| ${c} | ${n} | ${all[c]} |`);
lines.push(``, `## Differences by test reader`, ``, `| reader | differs | of |`, `|---|---|---|`);
const allP = tally(rows.map((r) => r.persona));
for (const [p, n] of Object.entries(tally(off.map((r) => r.persona))).sort()) lines.push(`| ${p} | ${n} | ${allP[p]} |`);
lines.push(``, `## Every difference`, ``, `| reader | place | criterion | expected | current score | fixture captured | score dated |`, `|---|---|---|---|---|---|---|`);
for (const r of off.sort((a, b) => a.persona.localeCompare(b.persona) || a.location.localeCompare(b.location) || a.criterion.localeCompare(b.criterion))) {
  lines.push(`| ${r.persona} | ${r.location} | ${r.criterion} | ${r.expected} | ${r.current} | ${r.captured} | ${r.scored ?? ""} |`);
}
const v = verdictComparison(store);
lines.push(``, `## Verdicts: the site's engine against the shipped verdict`, ``, `Agree: ${v.agree.length}. Disagree: ${v.mismatches.length}. Not comparable: ${v.notComparable.length} (${Object.entries(tally(v.notComparable.map((x) => x.reason))).map(([k, n]) => `${k} ${n}`).join(", ")}).`, ``);
for (const m of v.mismatches) lines.push(`- ${m.tag}: reader ${m.reader.toFixed(0)} against bar ${m.bar} ${m.currency} (${m.kind}), ratio ${m.ratio.toFixed(3)}`);
const text = lines.join("\n") + "\n";
const outArg = process.argv.indexOf("--out");
if (outArg >= 0) { fs.writeFileSync(process.argv[outArg + 1], text); console.log(`wrote ${process.argv[outArg + 1]}: ${off.length} differences`); }
else process.stdout.write(text);
