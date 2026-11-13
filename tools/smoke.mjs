// Smoke test of the served site: `npm run smoke`.
//
// Every tracked file must be served (200), except the files kept off the
// site on purpose, which must not be (404): the `exclude` list in
// _config.yml, and the repo's own plumbing below. The expectation comes
// from what the repo means to publish, not from Jekyll's rules, so a file
// Jekyll drops silently (a dot-folder, say) fails here.
//
//   node tools/smoke.mjs [--base https://canilivethere.info]
//
// It checks the live site by default. Exit 0 all as expected, 1 not.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const baseArg = args.indexOf("--base");
const BASE = (baseArg >= 0 ? args[baseArg + 1] : "https://canilivethere.info").replace(/\/$/, "");

// Tracked, but never meant for a reader.
const PLUMBING = [".gitignore", ".gitattributes", "_config.yml"];

function yamlList(text, key) {
  const inline = text.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, "m"));
  if (inline) return inline[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const block = text.match(new RegExp(`^${key}:\\s*\\n((?:[ \\t]+-.*\\n?|[ \\t]*#.*\\n?)*)`, "m"));
  if (!block) return [];
  return [...block[1].matchAll(/^[ \t]+-\s*(.+?)\s*$/gm)].map((m) => m[1].replace(/^["']|["']$/g, ""));
}

const config = fs.readFileSync(path.join(ROOT, "_config.yml"), "utf8");
const excluded = yamlList(config, "exclude");
const isPrivate = (f) => PLUMBING.includes(f) || excluded.some((e) => f === e || f.startsWith(e.replace(/\/?$/, "/")));

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const cases = tracked.map((f) => ({ file: f, want: isPrivate(f) ? 404 : 200 }));
// An excluded file that is not tracked (a local file) must not be served either.
for (const e of excluded) if (!tracked.includes(e)) cases.push({ file: e, want: 404 });
cases.push({ file: "", want: 200 });

async function status(file) {
  const url = `${BASE}/${file.split("/").map(encodeURIComponent).join("/")}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(20000) });
      await res.arrayBuffer();
      return res.status;
    } catch (e) {
      if (attempt === 2) return `error: ${e.cause?.code || e.message}`;
    }
  }
}

const results = [];
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < cases.length) {
    const c = cases[next++];
    results.push({ ...c, got: await status(c.file) });
  }
}));

const wrong = results.filter((r) => r.got !== r.want).sort((a, b) => a.file.localeCompare(b.file));
console.log(`smoke: ${BASE}: ${results.length} paths, ${results.length - wrong.length} as expected, ${wrong.length} not`);
for (const r of wrong) console.log(`  /${r.file}: want ${r.want}, got ${r.got}`);
process.exit(wrong.length ? 1 : 0);
