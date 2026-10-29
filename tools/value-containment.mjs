// value-containment.mjs — the second measurement, beside the reader walk.
//
// WHY A SECOND INSTRUMENT. tools/reader-walk.mjs keys a row on its
// scope-tag-stripped `.fact-label`. That key cannot see the loss Cap
// named on 2026-10-28: the countries in a nationality-tier row are the
// row's `.fact-value`, not its label, so a row that keeps its label and
// drops 84 of its 95 country codes scores zero on the walk's key and
// lands in `changed`, which the walk prints as a number and nobody
// reads as a loss.
//
// THE TEST. For every served row with a non-empty `.fact-value`, that
// value's text must still be CONTAINED in the hydrated value of a row
// carrying the same key. Containment, not equality: hydration
// legitimately appends (a converted figure, "315.04-440.87 MXN/day"
// becoming "315.04-440.87 MXN/day (~$17-$24)"), and an addition passes.
// ANYTHING REMOVED COUNTS AS LOST.
//
// Twins are handled by the key GROUP, not by position. The same bare
// label appears twice on a served page (once with a country list as its
// value, once with a source line); a served value passes if ANY hydrated
// row under that key contains it. That is deliberately the generous
// reading — it cannot manufacture a loss out of the walk's own
// twin-misattribution defect, which is still open and out of scope here.
//
// Each failure is sub-classified, for repair only, never to soften the
// count: GONE (the text appears nowhere on the hydrated page) or MOVED
// (it is somewhere on the page, but not in a `.fact-value` under its own
// label). Both count as lost.
//
// KNOWN-POSITIVE DISCIPLINE. This check is worthless until it has been
// shown to see losses that are independently known to exist. It is run
// against the unrepaired tree first and must report the dropped country
// lists and the lost refusal rows there. A check that reports zero on
// the before-tree is broken, and tools/known-positive-grep.py's false
// trustworthy zero is the reason that is a step and not an opinion.
//
// Writes nothing into the repo. Starts its own node:http server, blocks
// the Cloudflare beacon exactly as the reader walk does.
//
//   node tools/value-containment.mjs --repo DIR --out DIR [--label TAG]
//
// INSTALLED IN THE REPO 2026-10-28, and the bar for it was lifted by
// name. Cap's ruling of that date, paraphrased only where it named a
// seat: the 2026-09-19 bar is lifted for tools/value-containment.mjs by
// name, installed in this crossing and gated before it ships; nothing
// else. Whether it becomes a pre-push gate is decided after the push.
// It is therefore NOT wired into any hook, any
// gate or any other script. It is run by hand, like tools/reader-walk.mjs
// beside it, and it refuses to write anywhere inside the repo.

import { chromium } from "playwright";
import { createServer } from "node:http";
import { createReadStream, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, normalize, extname, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
// NEITHER DEFAULT NAMES A MACHINE. This file is published, so a default
// spelling out an account name and a local directory layout would ship
// the build machine's own address to every reader of the repo. --repo
// defaults to this script's own repository root, derived from the
// script's location (tools/ -> ..), so it is correct wherever the
// repository is cloned and says nothing about where that is. --out
// defaults inside the platform's temp directory, which node:os reports
// rather than this file asserting. --out is still REFUSED if it resolves
// inside the repository (below), unchanged.
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(arg("--repo", join(HERE, "..")));
const OUT = resolve(arg("--out", join(tmpdir(), "canilivethere-containment")));
const LABEL = arg("--label", "run");
mkdirSync(OUT, { recursive: true });
if (OUT.startsWith(REPO)) { console.error("REFUSED: --out is inside the repo."); process.exit(2); }

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".jsonl": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".md": "text/plain; charset=utf-8", ".ico": "image/x-icon",
};
function startServer(port) {
  const srv = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const full = join(REPO, normalize(p));
    if (!full.startsWith(REPO)) { res.writeHead(403).end(); return; }
    let st; try { st = statSync(full); } catch { res.writeHead(404).end("not found"); return; }
    if (!st.isFile()) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "content-type": MIME[extname(full).toLowerCase()] || "application/octet-stream", "content-length": st.size });
    createReadStream(full).pipe(res);
  });
  srv.keepAliveTimeout = 60000;
  return new Promise((ok) => srv.listen(port, "127.0.0.1", () => ok(srv)));
}

// Identical row reading to tools/reader-walk.mjs's extractRows(), on
// purpose: two instruments disagreeing about what a row IS would make
// their two numbers incomparable.
const extractRows = () =>
  [...document.querySelectorAll(".fact-item")].map((el) => {
    const n = (s) => (s || "").replace(/\s+/g, " ").trim();
    const labelEl = el.querySelector(".fact-label");
    let bare = "";
    if (labelEl) {
      const clone = labelEl.cloneNode(true);
      clone.querySelectorAll(".scope-tag").forEach((t) => t.remove());
      bare = n(clone.textContent);
    }
    // EVERY .fact-value in the row, not the first. The hydrated route
    // card is one .fact-item holding several label/value pairs; reading
    // only the first would score the rest as missing.
    const values = [...el.querySelectorAll(".fact-value")].map((v) => n(v.textContent)).filter(Boolean);
    return { key: bare, values, text: n(el.textContent) };
  });

// textContent, NOT innerText. innerText returns only what is VISIBLE,
// and the hydrated build renders its chapters as closed <details> — so
// innerText scored the entire hydrated page as empty and classified
// every loss as GONE. Caught by calibration, which is what calibration
// is for.
const pageText = () => (document.body.textContent || "").replace(/\s+/g, " ").trim();

const BEACON = /cloudflareinsights\.com|cloudflare-insights\.com/i;
let beaconsBlocked = 0;
async function newCtx(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route(BEACON, (r) => { beaconsBlocked++; return r.fulfill({ status: 200, contentType: "text/javascript", body: "" }); });
  return ctx;
}
async function waitForSettled(page, { quietMs = 400, timeoutMs = 20000 } = {}) {
  const started = Date.now(); let last = -1;
  while (Date.now() - started < timeoutMs) {
    const n = await page.evaluate(() => document.querySelectorAll(".fact-item").length);
    if (n === last) return true;
    last = n; await page.waitForTimeout(quietMs);
  }
  return false;
}

// ---------------------------------------------------------------------
// THE TEST ITSELF, and the one correction this check makes to its own
// brief. Plain substring containment is the WRONG implementation of
// "additions pass, anything removed counts as lost", because the
// hydrated build's additions are not all appended — it INSERTS. It
// inserts digit-group separators inside a number ("90119 ALL/month"
// becomes "90,119 ALL/month") and it inserts a confidence phrase into
// the middle of a source line ("source dated 2026-07-11" becomes
// "source Medium confidence, more than one source, cross-checked dated
// 2026-07-11"). Both are pure additions. Both fail a substring test.
// Measured on the before-tree: 171 and ~400 values respectively, every
// one of them a false alarm.
//
// So the test is INSERTION-ONLY at word granularity: the served value's
// word sequence must appear, in order, inside the hydrated value's word
// sequence. Plain substring also passes (it is strictly stronger
// evidence that nothing was removed). One sub-word normalisation is
// applied to both sides first, and it is the only one: digit-group
// commas, named here because an unnamed normalisation is a thumb on the
// scale.
//
// WHAT THIS CAN STILL GET WRONG, stated rather than hidden: a very
// short served value can pass on scattered words. "Yes" surviving as
// "Yes" somewhere inside a longer hydrated sentence is counted as
// kept even if the sentence now says something else. Passes that rely
// on word-subsequence rather than substring, where the served value is
// two words or fewer, are counted separately and printed, so the size
// of that exposure is on the report instead of in a comment.
const denum = (s) => s.replace(/(?<=\d),(?=\d\d\d)/g, "");
const words = (s) => denum(s).split(/\s+/).filter(Boolean);
function wordSubsequence(a, b) {
  let i = 0;
  for (const w of b) { if (w === a[i]) i++; if (i === a.length) return true; }
  return a.length === 0;
}
// Returns null if kept, or the reason it is lost.
function keptIn(servedValue, hydratedValue) {
  if (denum(hydratedValue).includes(denum(servedValue))) return "substring";
  const a = words(servedValue);
  if (wordSubsequence(a, words(hydratedValue))) return a.length <= 2 ? "weak-subsequence" : "subsequence";
  return null;
}

const REFUSAL = /Rules this kind of income out/i;
// A country list: two or more bare ISO-2 codes, comma separated. Used
// only to report the known positive separately, never to filter.
const COUNTRY_LIST = /^[A-Z]{2}(,\s*[A-Z]{2}){1,}$/;

const port = 8131 + Math.floor(Math.random() * 300);
const server = await startServer(port);
const base = `http://127.0.0.1:${port}`;
console.log(`value-containment [${LABEL}] — serving ${REPO} at ${base}`);
const browser = await chromium.launch();

const pages = readdirSync(join(REPO, "l")).filter((f) => f.endsWith(".html")).sort();
let tServed = 0, tChecked = 0, tLost = 0, tGone = 0, tMoved = 0;
let tRefServed = 0, tRefLost = 0, tCListServed = 0, tCListLost = 0, tCodeLost = 0;
let tWeak = 0, tSub = 0, tSlotLost = 0;
const results = [];
console.log("page".padEnd(26) + "values".padStart(8) + "lost".padStart(7) + "gone".padStart(7) + "moved".padStart(7) + "  notes");

for (const file of pages) {
  const url = `${base}/l/${file}`;
  const ctxOff = await newCtx(browser, { javaScriptEnabled: false });
  const pOff = await ctxOff.newPage();
  await pOff.goto(url, { waitUntil: "load" });
  const served = await pOff.evaluate(extractRows);
  await ctxOff.close();

  let hydrated, hText, attempts = 0;
  for (;;) {
    attempts++;
    const ctxOn = await newCtx(browser);
    const pOn = await ctxOn.newPage();
    const failed = [];
    pOn.on("requestfailed", (r) => failed.push(r.url()));
    await pOn.goto(url, { waitUntil: "networkidle" });
    await waitForSettled(pOn);
    hydrated = await pOn.evaluate(extractRows);
    hText = await pOn.evaluate(pageText);
    await ctxOn.close();
    const transportFailed = failed.some((u) => /\.js|\.jsonl/.test(u) && !BEACON.test(u));
    if (!transportFailed || attempts >= 3) break;
  }

  // TWO targets per key, measured side by side rather than one chosen
  // quietly. Cap's rule is that a served value's text must still be
  // "inside its hydrated ROW" — so `byKeyRow` (the whole row's text) is
  // the headline. `byKeyValue` (the `.fact-value` slots only) is the
  // stricter reading and is reported beside it, because the gap between
  // them is a real thing about the page: 136 declared-gap rows move the
  // words "Not yet researched" out of the value slot and into a
  // `.fact-meta` badge in the SAME row, deliberately and by a documented
  // double-stamp fix (js/app-shared.js formatValue/confidenceBadge). On
  // the row reading those are kept, which is correct — nothing left the
  // reader's eye. On the value-slot reading they are lost. Printing one
  // number and not the other would be choosing an answer.
  const byKeyRow = new Map(), byKeyValue = new Map();
  for (const r of hydrated) {
    if (!byKeyRow.has(r.key)) byKeyRow.set(r.key, []);
    byKeyRow.get(r.key).push(r.text);
    if (!byKeyValue.has(r.key)) byKeyValue.set(r.key, []);
    byKeyValue.get(r.key).push(...r.values);
  }

  const lost = [];
  const kept = {};
  let nServed = 0, nChecked = 0, nSlotLost = 0;
  const slotLostRecs = [];
  for (const r of served) {
    nServed++;
    for (const v of r.values) {
      if (!v) continue;
      nChecked++;
      const vpool = byKeyValue.get(r.key) || [];
      let vhow = null;
      for (const hv of vpool) { const k = keptIn(v, hv); if (k === "substring") { vhow = k; break; } if (k && !vhow) vhow = k; }
      if (!vhow) { nSlotLost++; slotLostRecs.push({ key: r.key, servedValue: v, hydratedSlots: vpool.slice(0, 3) }); }

      const pool = byKeyRow.get(r.key) || [];
      let how = null;
      for (const hv of pool) { const k = keptIn(v, hv); if (k === "substring") { how = k; break; } if (k && !how) how = k; }
      if (how) { kept[how] = (kept[how] || 0) + 1; continue; }
      const onPage = hText.includes(v);
      const rec = { key: r.key, servedValue: v, verdict: onPage ? "MOVED" : "GONE", hydratedRowsUnderKey: pool.slice(0, 3).map((t) => t.slice(0, 300)) };
      if (REFUSAL.test(r.text)) rec.refusal = true;
      if (COUNTRY_LIST.test(v)) {
        rec.countryList = true;
        // How many of the codes survive anywhere on the hydrated page.
        const codes = v.split(/,\s*/);
        rec.codesServed = codes.length;
        rec.codesMissing = codes.filter((c) => !new RegExp(`\\b${c}\\b`).test(hText)).length;
      }
      lost.push(rec);
    }
  }

  const refServed = served.filter((r) => REFUSAL.test(r.text)).length;
  const refLost = lost.filter((r) => r.refusal).length;
  const cl = served.flatMap((r) => r.values).filter((v) => COUNTRY_LIST.test(v)).length;
  const clLost = lost.filter((r) => r.countryList);
  const codeLost = clLost.reduce((a, r) => a + r.codesMissing, 0);

  const gone = lost.filter((r) => r.verdict === "GONE").length;
  const moved = lost.length - gone;
  const notes = [];
  if (refLost) notes.push(`${refLost}/${refServed} refusal values lost`);
  if (clLost.length) notes.push(`${clLost.length}/${cl} country lists lost (${codeLost} codes absent from page)`);
  console.log(file.padEnd(26) + String(nChecked).padStart(8) + String(lost.length).padStart(7) + String(gone).padStart(7) + String(moved).padStart(7) + (notes.length ? "  " + notes.join("; ") : ""));

  tServed += nServed; tChecked += nChecked; tLost += lost.length; tGone += gone; tMoved += moved;
  tRefServed += refServed; tRefLost += refLost; tCListServed += cl; tCListLost += clLost.length; tCodeLost += codeLost;
  tWeak += kept["weak-subsequence"] || 0; tSub += kept["subsequence"] || 0; tSlotLost += nSlotLost;
  results.push({ file, servedRows: nServed, servedValues: nChecked, kept, slotLost: nSlotLost, slotLostRecs, lost });
}

console.log("-".repeat(80));
console.log("TOTAL".padEnd(26) + String(tChecked).padStart(8) + String(tLost).padStart(7) + String(tGone).padStart(7) + String(tMoved).padStart(7));
console.log(`\nserved rows: ${tServed}   served values checked: ${tChecked}`);
console.log(`served values NOT contained in a hydrated value under their own label: ${tLost}`);
console.log(`  of those, GONE (text appears nowhere on the hydrated page): ${tGone}`);
console.log(`  of those, MOVED (on the page, but not in its own row's value): ${tMoved}`);
console.log(`stricter reading — not inside the row's .fact-value SLOTS: ${tSlotLost} (the gap to ${tLost} is the declared-gap double-stamp: value slot shows an em dash, the words ride a badge in the same row)`);
console.log(`passes that needed word-subsequence, not substring: ${tSub + tWeak} (of those, ${tWeak} on values of 2 words or fewer — this check's own soft edge)`);
console.log(`KNOWN POSITIVE 1 — country-list values: ${tCListServed} served, ${tCListLost} lost, ${tCodeLost} page x code absences`);
console.log(`KNOWN POSITIVE 2 — refusal rows: ${tRefServed} served values on refusal rows, ${tRefLost} lost`);
if (tLost === 0) console.log("ZERO. On the before-tree this means the CHECK is broken. On the after-tree it is the result.");

const path = join(OUT, `containment-${LABEL}.json`);
writeFileSync(path, JSON.stringify({ label: LABEL, totals: { servedRows: tServed, servedValues: tChecked, lost: tLost, gone: tGone, moved: tMoved, keptBySubsequence: tSub, keptByWeakSubsequence: tWeak, countryListsServed: tCListServed, countryListsLost: tCListLost, codeAbsences: tCodeLost, refusalValuesServed: tRefServed, refusalValuesLost: tRefLost }, pages: results }, null, 1));
console.log(`full record: ${path}`);
console.log(`analytics beacons blocked: ${beaconsBlocked}`);

await browser.close();
server.close();
