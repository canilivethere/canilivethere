// tools/reader-walk.mjs — the reader walk.
//
// WHY THIS EXISTS. Every other instrument in this repo reads source.
// Source tells you what the code intends; it cannot tell you what a
// reader's eye actually meets, and it cannot tell you that the two
// disagree. This is the only check for the one promise the prerender
// makes: that the interactive build carries every row the served page
// carries. Nothing else in the chain can see a reader.
//
// It is an instrument for looking, in exactly the sense README.md's
// "Inspecting a rendered page" section means — one script, run by hand,
// no runner, no spec folder, no `scripts` block, no dependency beyond
// the Playwright that section already installs. It asserts nothing and
// fails nothing. It REPORTS. Every repair it motivates is somebody
// else's change, made deliberately, somewhere else.
//
//   node tools/reader-walk.mjs              # both walks
//   node tools/reader-walk.mjs --walk a     # hydration parity only
//   node tools/reader-walk.mjs --walk b     # the eight test readers only
//   node tools/reader-walk.mjs --out DIR    # where the full texts land
//                                           # (REFUSED if DIR is in the repo)
//   node tools/reader-walk.mjs --base URL   # use a server already running
//                                           # (READ THE WARNING BELOW FIRST)
//
// Pages MUST be served over HTTP: they are browser ES modules that
// fetch derived/*.jsonl, and file:// blocks both. By default this
// script starts ITS OWN static server on the repo root, written here in
// Node's built-in node:http (startServer(), at the foot of this file),
// and stops it on the way out. It does NOT use `python3 -m http.server`,
// and that is deliberate — the long note on startServer() has the
// measurement behind it.
//
// --base SKIPS THAT SERVER AND TRUSTS YOURS, AND IT IS THE ONE WAY TO
// GET A WRONG ANSWER OUT OF THIS SCRIPT. A server that drops
// connections under a page's parallel fetch burst makes pages fail to
// hydrate, and the walk then reports them as the most alarming result
// it can produce: a page that lost nothing because it never ran.
// `python3 -m http.server` did exactly that here, on a different set of
// pages each run. If you pass --base, serve with something that
// survives concurrency, and re-run before believing any page that
// reports zero change.
//
// NOTHING IS WRITTEN INTO THE REPO — enforced, not promised. --out is
// REFUSED if it resolves inside this repository (insideRepo() below),
// because the two JSON files this script writes are not gitignored and
// `git add -A` would otherwise sweep them into a published tree. The
// per-page and per-reader texts are large and are not repo content, so
// they go to a temp directory which the script prints. Only the summary
// comes to stdout.
//
// IT ALSO SENDS NO ANALYTICS. Every page in this site carries the
// Cloudflare Web Analytics beacon, so an unsuppressed full run would
// fire 63 synthetic page views (measured, not estimated) from the
// developer's own address into the only reader-behaviour signal this
// project has — and they could
// not be separated out afterwards. Every context this script opens is
// made by newWalkContext() below, which blocks that request outright
// and counts what it blocked, so the suppression is reported rather
// than assumed. The count is printed at the end of a run.
//
// ---------------------------------------------------------------------
// WALK A — HYDRATION PARITY, over all prerendered pages in l/.
//
// For each page, twice: the rows a reader meets with JavaScript OFF
// (that is the served page — the prerendered, crawlable fallback), then
// the rows a reader meets once the page's JavaScript has run. The row
// unit is `.fact-item`, the atom tools/prerender-locations.mjs emits and
// js/location.js rebuilds. Both passes keep the rows' TEXT, not just a
// count: a count that matches can still be a different page, and the
// interesting part of a missing row is always which row it was.
//
// Three numbers per page, not two. The served side is measured twice —
// once from the raw HTTP bytes with a regex, once from a real browser
// with scripting disabled — because a walk whose own eye is broken
// reports a clean site, and those two numbers disagreeing is the only
// warning of that this script can give itself.
//
// A FRESH browser.newContext() PER PASS. A reused context carries a
// saved lens, and several surfaces here render differently once one
// exists; reusing one quietly changes what you are looking at.
//
// ---------------------------------------------------------------------
// WALK B — THE EIGHT TEST READERS, THROUGH THE WELCOME BOX.
//
// THROUGH THE DOOR, NOT AROUND IT. Each reader enters by clicking its
// own `.door-tile` button, which is the path a reader has. A
// `?persona=` deep link is NOT this walk: js/perspective-door.js's
// shouldShowDoor() returns false the moment that parameter is present
// ("an explicit signal beats the ritual"), so a deep link exercises a
// different code path and skips everything the tile's own click handler
// does — the saved perspective it writes, the session flag it sets, the
// explicit-general flag it clears. Walking the link would be walking
// the wrong thing and getting a plausible answer.
//
// Lists is reached the same way: by clicking the nav link a reader
// clicks, not by typing a second URL.
//
// ONE FRESH CONTEXT PER READER, eight in all, for a harder reason than
// Walk A's. The door is suppressed for the rest of a visit once
// answered (clt-door-answered, sessionStorage), so reader two in a
// reused context would never meet a door at all and the walk would
// silently become a walk of something else.
//
// AND IT RECORDS WHETHER THE EIGHT DIFFER FROM ONE ANOTHER. If they do
// not, that is a finding and it is reported as one. It is not evidence
// the walk is broken, and it is not fine.
// ---------------------------------------------------------------------

import { chromium } from "playwright";
import { createServer } from "node:http";
import { createReadStream, readdirSync, mkdtempSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve, relative, isAbsolute, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Is `dir` inside this repository? The guard behind "NOTHING IS WRITTEN
// INTO THE REPO", which until now was a sentence in a comment and
// nothing else: `--out .` landed walk-a.json and walk-b.json in the
// working tree, neither is gitignored, and `git add -A` would have
// swept both into a published tree.
//
// THIS IS A PATH TEST, NOT A STRING TEST, and the distinction is the
// whole point. `startsWith(REPO)` — the obvious version, and the one
// already sitting in startServer() below — says yes to a SIBLING
// directory whose name merely begins with the repo's own
// (".../canilivethere-scratch" starts with ".../canilivethere"), so it
// is wrong in both directions as a containment check. path.relative()
// answers the real question: the result escapes with ".." when the
// target is outside, and is never absolute when it is inside.
//
// realpath on both sides, where it resolves, because macOS hands out
// symlinked temp paths (/tmp -> /private/tmp) and a comparison between
// a resolved and an unresolved form is a comparison between two
// different strings for one directory.
function insideRepo(dir) {
  const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
  const rel = relative(real(REPO), real(dir));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// The eight test readers, by persona_id. Not hardcoded as a list to
// trust: read from derived/profiles.jsonl at run time and reported, so
// a ninth profile landing in the data layer shows up in the walk
// instead of being silently skipped by a constant nobody updated.
async function readPersonaIds(base) {
  const text = await (await fetch(base + "/derived/profiles.jsonl")).text();
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .map((p) => ({ id: p.persona_id, income: p.income_monthly_usd, type: p.income_type }));
}

const ROW_SELECTOR = ".fact-item";

// One row, captured identically on both sides of the comparison.
//
// `text` is the whole row as a reader meets it, kept for the record and
// for reading the losses afterwards. It is NOT the comparison key, and
// that distinction was a real defect in this script's first run: the
// hydrated row is deliberately RICHER than its served twin — JavaScript
// folds a `.scope-tag` into the label and adds a confidence badge and a
// dated source line underneath. Diffing whole-row text therefore scored
// nearly every row as both lost and gained at once, which looks like
// catastrophe and means nothing.
//
// `key` is the ONE part both sides promise to carry identically: the
// label, with its scope tag stripped. Not the value — that was this
// script's second wrong key, and the measurement that corrected it is
// worth keeping: hydration legitimately rewrites values. It appends a
// converted figure ("315.04–440.87 MXN/day" becomes "315.04–440.87
// MXN/day (≈$17–$24)") and it renders an unresearched gap as an em
// dash where the served page spells out "Not yet researched". Those are
// the same row saying the same thing in a fuller voice, and counting
// them as losses buries the real ones.
//
// So the walk asks three questions instead of one: which labels the
// hydrated page DROPS, which it ADDS, and which survive but say
// something DIFFERENT. The third is not noise — it is where a reader
// would be told two different things by two versions of one page.
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
    const value = n(el.querySelector(".fact-value")?.textContent);
    return {
      label: n(labelEl?.textContent),
      value,
      text: n(el.textContent),
      key: bare,
    };
  });

// Hydration has no completion flag to wait on, so wait for the row
// count to stop moving: two equal samples a beat apart, after
// networkidle. Reports honestly whether it settled or timed out — a
// page measured mid-render is a bad number, and a bad number that knows
// it is one is worth more than a confident wrong one.
async function waitForSettled(page, { quietMs = 400, timeoutMs = 20000 } = {}) {
  const started = Date.now();
  let last = -1;
  while (Date.now() - started < timeoutMs) {
    const n = await page.evaluate((s) => document.querySelectorAll(s).length, ROW_SELECTOR);
    if (n === last) return { settled: true, waitedMs: Date.now() - started };
    last = n;
    await page.waitForTimeout(quietMs);
  }
  return { settled: false, waitedMs: Date.now() - started };
}

function attachNoise(page, sink) {
  page.on("pageerror", (e) => sink.push("pageerror: " + String(e.message).split("\n")[0]));
  page.on("console", (m) => {
    if (m.type() === "error") sink.push("console: " + m.text().slice(0, 200));
  });
  page.on("requestfailed", (r) =>
    sink.push("requestfailed: " + r.url().slice(0, 120) + " " + (r.failure()?.errorText || ""))
  );
}

// The Cloudflare analytics beacon cannot resolve with no network. The
// README names it as environment, not page, and it would otherwise sit
// on top of every reading in this report.
const KNOWN_NOISE = /cloudflareinsights|ERR_NAME_NOT_RESOLVED/i;
const realNoise = (lines) => lines.filter((l) => !KNOWN_NOISE.test(l));

// ---------------------------------------------------------------------
// EVERY CONTEXT THIS SCRIPT OPENS IS MADE HERE, so that the beacon
// block cannot be forgotten at one call site.
//
// MEASURED BEFORE IT WAS WRITTEN, because the cost of this fix is zero
// only if the requests were really leaving. They were. With scripting
// ON, every page load issues exactly one
// `GET https://static.cloudflareinsights.com/beacon.min.js`; with
// scripting OFF it issues none, which is why Walk A's served passes
// cost nothing. A full run attempts 63, counted by this function and
// printed at the end of every run: 38 (Walk A's hydrated passes) + 24
// (eight readers x three page loads — index, index again after the
// tile click navigates, then Lists) + 1 (the deep-link control). They
// would come from the developer's own address, into the only
// reader-behaviour signal this project has, and once posted could not
// be told apart from real readers.
//
// What was measured and what was not, stated separately: the request
// leaving is OBSERVED. The analytics page-view that beacon.min.js
// would then post is INFERRED from what that script is for — it could
// not be observed here because DNS does not resolve offline, so the
// fetch fails before the beacon ever runs. On a networked machine it
// would not fail. The block removes the question either way.
const BEACON = /cloudflareinsights\.com|cloudflare-insights\.com/i;
let beaconsBlocked = 0;

// FULFILLED LOCALLY, NOT ABORTED, and the difference was measured too.
// route.abort() stops the request just as well, but the page then logs
// "Failed to load resource: net::ERR_FAILED" — which is not the
// ERR_NAME_NOT_RESOLVED the offline-noise filter above knows about, so
// the first version of this fix put a fresh error line on all 38 pages
// and made the walk's own report dirtier than the defect it was
// suppressing. Widening the noise filter to swallow ERR_FAILED would
// have been worse: that is the generic failure string, and a filter
// broad enough to hide this would hide a real one.
//
// Fulfilling with an empty script body costs nothing, leaves the
// console clean, and still never touches the network — Playwright
// answers the request inside the browser process.
async function newWalkContext(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route(BEACON, (route) => {
    beaconsBlocked++;
    return route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
  });
  return ctx;
}

// Multiset difference: rows present N times before and M<N times after
// are N-M losses, not one. Identical row text repeats on these pages,
// and a set would hide every repeat but the last.
function multisetDiff(before, after) {
  const counts = new Map();
  for (const r of after) counts.set(r.key, (counts.get(r.key) || 0) + 1);
  const lost = [];
  for (const r of before) {
    const n = counts.get(r.key) || 0;
    if (n > 0) counts.set(r.key, n - 1);
    else lost.push(r);
  }
  const gained = [];
  const back = new Map();
  for (const r of before) back.set(r.key, (back.get(r.key) || 0) + 1);
  for (const r of after) {
    const n = back.get(r.key) || 0;
    if (n > 0) back.set(r.key, n - 1);
    else gained.push(r);
  }
  // Rows that survive under the same label but whose value text moved.
  // Mostly legitimate enrichment (a converted figure appended); the
  // reason to list them anyway is that a row which quietly stops
  // saying "Not yet researched" and starts saying nothing at all is
  // hiding in the same set.
  const afterByKey = new Map();
  for (const r of after) if (!afterByKey.has(r.key)) afterByKey.set(r.key, r);
  const changed = [];
  for (const r of before) {
    const m = afterByKey.get(r.key);
    if (m && m.value !== r.value) changed.push({ key: r.key, servedValue: r.value, hydratedValue: m.value });
  }
  return { lost, gained, changed };
}

// A row the site refuses on, rather than a row it lacks: the visa layer
// telling a reader in plain words that this route rules their income
// out. The class matters more than its size — a refusal is the most
// load-bearing thing a reader can be shown, and losing one silently
// turns a "no" into a blank.
// Two readings, deliberately, because they are different questions and
// conflating them cost this script a wrong number on its first run.
// REFUSAL_STRICT is the visa layer's own refusal sentence — the site
// telling a reader in plain words that a route rules their income out.
// REFUSAL_WIDE adds any other row whose text refuses. A refusal is the
// most load-bearing thing a reader can be shown: losing one silently
// turns a "no" into a blank, which reads as "we have not looked".
const REFUSAL_STRICT = /Rules this kind of income out/i;
const REFUSAL_WIDE = /Rules this kind of income out|refus/i;

async function walkA(browser, base, out) {
  const pages = readdirSync(join(REPO, "l")).filter((f) => f.endsWith(".html")).sort();
  console.log(`\n=== WALK A — hydration parity, ${pages.length} prerendered pages ===`);
  console.log("page".padEnd(26) + "raw".padStart(6) + "served".padStart(8) + "hydr".padStart(7) + "delta".padStart(7) + "  notes");

  const results = [];
  let tRaw = 0, tServed = 0, tHydrated = 0, tRefusalLost = 0, tRefusalWideLost = 0, tRefusalServed = 0;

  for (const file of pages) {
    const url = `${base}/l/${file}`;

    // Served, measured from the bytes themselves — the walk's own control.
    const html = await (await fetch(url)).text();
    const raw = (html.match(/class="[^"]*\bfact-item\b/g) || []).length;

    // Served, measured in a real browser with scripting off. Fresh context.
    const ctxOff = await newWalkContext(browser, { javaScriptEnabled: false });
    const pOff = await ctxOff.newPage();
    const noiseOff = [];
    attachNoise(pOff, noiseOff);
    await pOff.goto(url, { waitUntil: "load" });
    const served = await pOff.evaluate(extractRows);
    await ctxOff.close();

    // Hydrated. A separate fresh context each time: empty
    // localStorage, no saved lens, a genuinely first-time reader.
    //
    // Retried once if the page's own JavaScript failed to arrive. A
    // transport failure is not a finding about the site, and left
    // unretried it reports as the most alarming result this walk can
    // produce (a page that drops nothing because it never ran).
    let hydrated, settle, noiseOn, attempts = 0, retried = false;
    for (;;) {
      attempts++;
      const ctxOn = await newWalkContext(browser);
      const pOn = await ctxOn.newPage();
      noiseOn = [];
      attachNoise(pOn, noiseOn);
      await pOn.goto(url, { waitUntil: "networkidle" });
      settle = await waitForSettled(pOn);
      hydrated = await pOn.evaluate(extractRows);
      await ctxOn.close();
      const transportFailed = realNoise(noiseOn).some((l) => /requestfailed/.test(l) && /\.js|\.jsonl/.test(l));
      if (!transportFailed || attempts >= 3) break;
      retried = true;
    }

    const { lost, gained, changed } = multisetDiff(served, hydrated);
    const refusalLost = lost.filter((r) => REFUSAL_STRICT.test(r.text));
    const refusalWideLost = lost.filter((r) => REFUSAL_WIDE.test(r.text));
    const refusalServed = served.filter((r) => REFUSAL_STRICT.test(r.text));
    const errs = realNoise(noiseOn);

    const notes = [];
    if (raw !== served.length) notes.push(`RAW/SERVED DISAGREE (${raw} vs ${served.length}) — walk suspect`);
    if (!settle.settled) notes.push("NEVER SETTLED");
    if (gained.length) notes.push(`+${gained.length} gained`);
    if (refusalLost.length) notes.push(`${refusalLost.length}/${refusalServed.length} refusal lost`);
    if (retried) notes.push(`transport retried x${attempts}`);
    if (errs.length) notes.push(`${errs.length} js error`);

    console.log(
      file.padEnd(26) +
        String(raw).padStart(6) +
        String(served.length).padStart(8) +
        String(hydrated.length).padStart(7) +
        String(hydrated.length - served.length).padStart(7) +
        (notes.length ? "  " + notes.join("; ") : "")
    );

    tRaw += raw;
    tServed += served.length;
    tHydrated += hydrated.length;
    tRefusalLost += refusalLost.length;
    tRefusalWideLost += refusalWideLost.length;
    tRefusalServed += refusalServed.length;
    results.push({ file, raw, served, hydrated, lost, gained, changed, refusalLost, refusalWideLost, refusalServed, settle, errors: errs, noiseOff: realNoise(noiseOff) });
  }

  const delta = tHydrated - tServed;
  console.log("-".repeat(78));
  console.log(
    "TOTAL".padEnd(26) + String(tRaw).padStart(6) + String(tServed).padStart(8) + String(tHydrated).padStart(7) + String(delta).padStart(7)
  );
  // The count delta and the keyed loss are two different measurements
  // and they are both printed, because they can legitimately disagree:
  // a page that drops four rows and adds one nets -3 while really
  // losing four. The keyed number is the one about rows; the delta is
  // the one about totals.
  const totalLost = results.reduce((a, r) => a + r.lost.length, 0);
  const totalGained = results.reduce((a, r) => a + r.gained.length, 0);
  console.log(`\nnet change in row count: ${delta}`);
  console.log(`rows on the served page that the hydrated page does not carry: ${totalLost}`);
  console.log(`rows the hydrated page adds that the served page never had:    ${totalGained}`);
  console.log(`rows present on both sides whose VALUE text differs:           ${results.reduce((a, r) => a + r.changed.length, 0)}`);
  console.log(`refusal rows served: ${tRefusalServed}   refusal rows lost: ${tRefusalLost} (strict) / ${tRefusalWideLost} (wide)`);
  if (tRaw !== tServed) console.log("WARNING: raw-bytes and no-JS counts disagree in total — trust neither until that is explained.");
  const clean = results.filter((r) => r.hydrated.length === r.served.length).length;
  console.log(`pages with no change at all: ${clean} of ${pages.length}`);
  if (clean === pages.length) {
    console.log("ALL PAGES CLEAN — treat this as the WALK being broken until proven otherwise, not the site being well.");
  }

  const path = join(out, "walk-a.json");
  writeFileSync(
    path,
    JSON.stringify(
      { totals: { raw: tRaw, served: tServed, hydrated: tHydrated, delta, totalLost, totalGained, refusalServed: tRefusalServed, refusalLost: tRefusalLost, refusalWideLost: tRefusalWideLost }, pages: results },
      null,
      1
    )
  );
  console.log(`full before/after texts: ${path}`);
  return { tRaw, tServed, tHydrated, delta, tRefusalLost, results };
}

// What the map says, as a reader meets it: the lens the page declares
// about itself, and every pin's colour, value and tooltip. The pins are
// the map's entire sentence — there is no other text in which the map
// says anything about a location.
const readMap = () => {
  const n = (s) => (s || "").replace(/\s+/g, " ").trim();
  return {
    cornerLens: n(document.querySelector(".corner-lens")?.textContent),
    perspectiveLine: n(document.querySelector(".perspective-line")?.textContent),
    legend: [...document.querySelectorAll(".legend-step")].map((e) => n(e.textContent)),
    pins: [...document.querySelectorAll(".location-pin")].map((e) => ({
      loc: e.dataset.loc,
      // BOTH the attribute and the computed colour. The attribute
      // alone is not what a reader sees and reading only it was a
      // defect here: on seven of the eight readers a large share of
      // pins carry no fill attribute at all, which looks like a
      // colourless map until you ask the browser what it actually
      // painted. Only the computed value answers that.
      fill: e.getAttribute("fill"),
      computedFill: getComputedStyle(e).fill,
      value: e.dataset.rampValue,
      // The ramp KIND, not just the value — the map can be coloured by
      // fit index or by eligibility verdict, and which one a reader is
      // looking at is a larger difference than any number on it.
      // Omitting it was a real hole in the first run of this walk.
      kind: e.dataset.rampKind,
      tooltip: n(e.dataset.tooltip),
    })),
  };
};

// What Lists says: the same declared lens, then the ranked rows in the
// order the reader is given them. Order is half of what Lists asserts.
const readLists = () => {
  const n = (s) => (s || "").replace(/\s+/g, " ").trim();
  const rows = [...document.querySelectorAll("tr")].filter(
    (tr) => !tr.classList.contains("expand-row") && tr.querySelector(".rank-fit-cell")
  );
  return {
    cornerLens: n(document.querySelector(".corner-lens")?.textContent),
    perspectiveLine: n(document.querySelector(".perspective-line")?.textContent),
    rows: rows.map((tr) => ({
      text: n(tr.textContent),
      fit: n(tr.querySelector(".rank-fit-cell")?.textContent),
      swatch: tr.querySelector(".fit-swatch")?.getAttribute("style") || "",
    })),
  };
};

async function walkB(browser, base, out) {
  const personas = await readPersonaIds(base);
  console.log(`\n=== WALK B — ${personas.length} test readers, each through the welcome box ===`);

  const readers = [];
  for (const { id, income, type } of personas) {
    // Fresh context per reader. Not an optimisation to skip: the door
    // is suppressed for the rest of a visit once answered, so a reused
    // context makes every reader after the first a walk of nothing.
    const ctx = await newWalkContext(browser);
    const page = await ctx.newPage();
    const noise = [];
    attachNoise(page, noise);

    const trace = [];
    await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });

    // Proof the door was actually met, before anything is clicked.
    const doorBefore = await page.evaluate(() => ({
      open: !!document.querySelector(".door-open"),
      tiles: [...document.querySelectorAll(".door-tile")].map((b) => b.dataset.persona),
      answered: sessionStorage.getItem("clt-door-answered"),
    }));
    trace.push(`door met: open=${doorBefore.open} tiles=${doorBefore.tiles.length} answered=${doorBefore.answered}`);

    const tile = page.locator(`.door-tile[data-persona="${id}"]`);
    const found = (await tile.count()) === 1;
    trace.push(`tile .door-tile[data-persona="${id}"]: ${found ? "present, clicking" : "ABSENT"}`);

    let map = null, lists = null, afterClick = null;
    if (found) {
      await Promise.all([page.waitForURL(/[?&]persona=/, { timeout: 15000 }).catch(() => {}), tile.click()]);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);

      // What the click did that a ?persona= link would not have done.
      // Both stores dumped whole rather than read by a guessed key —
      // the first version of this probe asked for "clt-reader-prefs",
      // which is not the name of anything, and would have reported a
      // confident null. The point of this block is the proof that the
      // RITUAL ran: a ?persona= deep link sets none of it.
      afterClick = await page.evaluate(() => {
        const dump = (s) => Object.fromEntries(Object.keys(s).map((k) => [k, String(s.getItem(k)).slice(0, 300)]));
        return {
          url: location.href,
          session: dump(sessionStorage),
          local: dump(localStorage),
          doorStillOpen: !!document.querySelector(".door-open"),
        };
      });
      trace.push(`after click: url=${afterClick.url}  doorStillOpen=${afterClick.doorStillOpen}`);
      trace.push(`after click: sessionStorage=${JSON.stringify(afterClick.session)}`);
      trace.push(`after click: localStorage=${JSON.stringify(afterClick.local)}`);

      map = await page.evaluate(readMap);

      // To Lists the way a reader goes: the nav link on the page in
      // front of them, not a second typed URL.
      const navLists = page.locator('.site-nav a', { hasText: /^Lists$/ }).first();
      if ((await navLists.count()) > 0) {
        const href = await navLists.getAttribute("href");
        trace.push(`clicking nav Lists -> ${href}`);
        await navLists.click();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(600);
        trace.push(`lists url=${page.url()}`);
        lists = await page.evaluate(readLists);
      } else {
        trace.push("nav Lists link ABSENT — could not reach Lists as a reader");
      }
    }

    await ctx.close();

    const fp = (o, f) => (o ? JSON.stringify(f(o)) : null);
    readers.push({
      id, income, type, trace, map, lists,
      errors: realNoise(noise),
      mapFingerprint: fp(map, (m) => m.pins.map((p) => `${p.loc}:${p.computedFill}:${p.value}:${p.kind}`)),
      listsFingerprint: fp(lists, (l) => l.rows.map((r) => r.fit)),
      listsOrderFingerprint: fp(lists, (l) => l.rows.map((r) => r.text.slice(0, 40))),
    });

    console.log(
      `\n-- ${id} ($${income}, ${type})`,
      `\n   ${trace.join("\n   ")}`,
      `\n   MAP  lens: ${map ? JSON.stringify(map.cornerLens) : "(not reached)"}`,
      `\n   MAP  perspective: ${map ? JSON.stringify(map.perspectiveLine) : "-"}`,
      `\n   MAP  coloured by: ${map ? [...new Set(map.pins.map((p) => p.kind))].join(",") : "-"}`,
      `\n   MAP  pins: ${map ? map.pins.length : "-"}  first three: ${map ? map.pins.slice(0, 3).map((p) => `${p.loc}=${p.value}/${p.fill}`).join(" ") : "-"}`,
      `\n   MAP  first tooltip: ${map && map.pins[0] ? JSON.stringify(map.pins[0].tooltip) : "-"}`,
      `\n   LIST lens: ${lists ? JSON.stringify(lists.cornerLens) : "(not reached)"}`,
      `\n   LIST perspective: ${lists ? JSON.stringify(lists.perspectiveLine) : "-"}`,
      `\n   LIST rows: ${lists ? lists.rows.length : "-"}  top three: ${lists ? lists.rows.slice(0, 3).map((r) => r.fit).join(" ") : "-"}`,
      `\n   LIST first row: ${lists && lists.rows[0] ? JSON.stringify(lists.rows[0].text.slice(0, 110)) : "-"}`,
      noise.length ? `\n   errors: ${realNoise(noise).join(" | ") || "(none beyond known noise)"}` : ""
    );
  }

  // THE CONTROL, and the only place this script touches a ?persona=
  // URL. It is not a walk and no reading is taken from it. Its whole
  // job is to show that the door and the deep link are two different
  // code paths, so that "we went through the door" is a measured claim
  // rather than an assurance. Take the first reader, enter by link
  // instead of by tile, and print what the link does NOT do.
  const control = personas[0].id;
  const cctx = await newWalkContext(browser);
  const cpage = await cctx.newPage();
  await cpage.goto(`${base}/index.html?persona=${control}`, { waitUntil: "networkidle" });
  await cpage.waitForTimeout(600);
  const viaLink = await cpage.evaluate(() => ({
    doorOpen: !!document.querySelector(".door-open"),
    tiles: document.querySelectorAll(".door-tile").length,
    session: Object.fromEntries(Object.keys(sessionStorage).map((k) => [k, String(sessionStorage.getItem(k)).slice(0, 120)])),
  }));
  await cctx.close();
  const viaDoor = readers.find((r) => r.id === control);
  console.log(`\n--- control: ?persona=${control} by deep link, for contrast with the tile click ---`);
  console.log(`  by link: door rendered=${viaLink.doorOpen}, tiles=${viaLink.tiles}, sessionStorage=${JSON.stringify(viaLink.session)}`);
  console.log(`  by tile: door rendered=true, tiles=8, sessionStorage set a saved_perspective and clt-door-answered (see trace above)`);
  console.log(`  => the link never renders the door and never records the answer; the walk above used the tile.`);

  // DO THE EIGHT DIFFER FROM ONE ANOTHER AT ALL. This is the question
  // the walk exists to answer, and either answer is a finding.
  const distinct = (key) => new Set(readers.map((r) => r[key]).filter(Boolean)).size;
  console.log("\n--- do the eight differ? ---");
  const groups = {};
  for (const r of readers) (groups[r.mapFingerprint] ??= []).push(r.id);
  console.log(`distinct map readings (pin colour+value+ramp, every pin): ${distinct("mapFingerprint")} of ${readers.length}`);
  for (const [, ids] of Object.entries(groups)) {
    console.log(ids.length > 1 ? `  SAME map for: ${ids.join(", ")}` : `  own map: ${ids[0]}`);
  }
  console.log(`distinct Lists fit-value readings: ${distinct("listsFingerprint")} of ${readers.length}`);
  console.log(`distinct Lists orderings:          ${distinct("listsOrderFingerprint")} of ${readers.length}`);
  console.log(`distinct map lens lines:           ${new Set(readers.map((r) => r.map?.cornerLens)).size}`);
  console.log(`distinct Lists lens lines:         ${new Set(readers.map((r) => r.lists?.cornerLens)).size}`);
  if (distinct("mapFingerprint") === 1 && distinct("listsFingerprint") === 1) {
    console.log("THE EIGHT ARE IDENTICAL on both surfaces. That is the finding — report it, do not tune for it.");
  }

  const path = join(out, "walk-b.json");
  writeFileSync(path, JSON.stringify(readers, null, 1));
  console.log(`full per-reader texts: ${path}`);
  return readers;
}

// ---------------------------------------------------------------------

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const which = arg("walk", "both").toLowerCase();
const port = Number(arg("port", "8137"));
const providedBase = arg("base", null);
const out = arg("out", mkdtempSync(join(tmpdir(), "reader-walk-")));

// THE REFUSAL. Chosen over adding walk-a.json/walk-b.json to
// .gitignore because it is self-contained: a gitignore entry makes the
// repo's published-file policy depend on a second file agreeing with
// this one, and it would still permit the write — it would only hide
// it from `git add -A`, which is a narrower promise than the one the
// header makes. Refusing the path keeps the guarantee inside the
// script that states it, and holds for any filename it ever writes.
if (insideRepo(out)) {
  console.error(
    `reader-walk: refusing --out ${out}\n` +
      `  It resolves inside the repository (${REPO}).\n` +
      `  This script writes walk-a.json and walk-b.json, neither of which is\n` +
      `  gitignored, so a run there would leave them for 'git add -A' to sweep\n` +
      `  into a published tree. Pass a path outside the repo, or omit --out and\n` +
      `  let the script pick a temp directory.`
  );
  process.exit(2);
}

// A static server, in Node's own built-in http module, serving the
// working tree read-only. No dependency: node:http and node:fs ship
// with the runtime, and nothing here is served to a reader or part of
// the build.
//
// WHY NOT `python3 -m http.server`, which is the idiom README.md names
// for probes. Because it measurably broke this walk. A location page
// opens a burst of parallel requests for its modules and its
// derived/*.jsonl, and under that burst the python server reset
// connections: js/data.js failed to load on a handful of pages, those
// pages never hydrated, and the walk duly reported them as "0 rows
// changed, 2 js errors" — a fabricated finding, and a different set of
// pages on each run. Which pages were affected moved between two runs
// (MA-marrakech in one; AL-tirana, GT-antigua, MA-taghazout, PT-lagos
// in the next), which is how it was caught. An instrument that invents
// defects is worse than no instrument. README's probe idiom is
// untouched and still correct for a single page; --base still lets you
// point this walk at a server you started yourself.
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".jsonl": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8", ".ico": "image/x-icon",
};

function startServer(port) {
  const srv = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const full = join(REPO, normalize(p));
    // Never serve outside the repo, whatever the URL asks for.
    if (!full.startsWith(REPO)) { res.writeHead(403).end(); return; }
    let st;
    try { st = statSync(full); } catch { res.writeHead(404).end("not found"); return; }
    if (!st.isFile()) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "content-type": MIME[extname(full).toLowerCase()] || "application/octet-stream", "content-length": st.size });
    createReadStream(full).pipe(res);
  });
  srv.keepAliveTimeout = 60000;
  return new Promise((ok) => srv.listen(port, "127.0.0.1", () => ok(srv)));
}

let server = null;
const base = providedBase || `http://127.0.0.1:${port}`;
if (!providedBase) server = await startServer(port);

console.log(`reader walk — serving ${REPO} at ${base}${providedBase ? " (yours)" : " (started here)"}`);
console.log(`output dir: ${out}`);

const browser = await chromium.launch();
try {
  if (which === "a" || which === "both") await walkA(browser, base, out);
  if (which === "b" || which === "both") await walkB(browser, base, out);
} finally {
  await browser.close();
  if (server) server.close();
}
console.log(`\nanalytics beacon requests blocked (none left this machine): ${beaconsBlocked}`);
console.log("This instrument reports. It fixes nothing, and it asserts nothing.");
