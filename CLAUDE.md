# CanILiveThere — site repo

The public site at canilivethere.info. A reader enters a passport, an income and, if they have it, capital, and sees for every country which routes open for them, by how much, or how far off they are. It is plain HTML, CSS and browser ES modules, with no framework, backend or bundler.

## Jobs, principles, plan

The maintainer's four jobs, the principles, the rulings and the current plan are in the research vault's own instructions. They load through `CLAUDE.local.md`, which is gitignored and never committed. If it has not loaded, stop and ask.

This repo is public, and every pushed commit is published. Tracked files, commit messages and PR text never contain vault paths, the names of people, internal process vocabulary or rulebook citations.

## Commands (from the repo root)

- **Build:** `node tools/prerender-locations.mjs` writes `l/<location_id>.html` from `derived/`. Re-run it after any change to `derived/` or `js/portraits.js`, and commit the output. It has no dependencies.
- **Test:** `npm test` runs the store checks (schema, traceability, change rule, reader fixtures) with no dependencies. Known failures are in `tests/baseline.json`, which may only shrink; `npm run baseline` rewrites it. `npm run smoke` checks every tracked file against the live site, and `--base` points it elsewhere. Other instruments:
  - `node tools/generate-ramp.mjs --check` re-derives the map colours and exits nonzero on drift. `--self-test` runs the reference vectors.
  - `node tools/reader-walk.mjs` renders every page and the eight test readers in headless Chromium. It reports and never fails.
  - `node tools/value-containment.mjs --repo . --out <dir outside the repo>` reports any value lost between the served page and the hydrated page.
  - The two rendered checks need a one-time setup: `npm install && npx playwright install chromium`. They start their own server. Don't pass `--base` pointing at `python3 -m http.server`, which drops connections and produces false losses.
- **Preview:** run `python3 -m http.server 8137` and open http://127.0.0.1:8137/. Use HTTP, not `file://`, because the pages are ES modules that fetch `derived/`.
- **Deploy:** GitHub Pages serves `master` at the root as canilivethere.info. Whatever reaches `master` on origin goes live, so merging the PR is the deploy.
- **Git hooks:** `core.hooksPath` is `.githooks/`, which is local and gitignored. A refusal stands: never `--no-verify`, never an override variable.
  - The commit-message check blocks vault vocabulary, and that list includes this file's own name. Call this file "the repo's instructions for Claude Code" in commit messages.
  - The pre-push gate guards `master` only. It refuses any tree that has no cleared review record in the vault.
- **Pushing a branch publishes it,** because the repo is public. Push a branch only after the maintainer has read its brief and said push in this session.
- **Off the site:** Pages runs Jekyll, which serves Markdown both raw and rendered. `_config.yml` excludes this file, and any other file meant only for Claude goes on that list too.

## Store and evidence

- **Store, as published:** `derived/*.jsonl`, `derived/facts/<CC>.jsonl` and `derived/meta.json`. It is a one-way export from the store in the vault. Never hand-edit it here: change the vault, re-export, then rebuild.
- **Test readers:** `derived/profiles.jsonl` holds the eight personas. `derived/fixtures.jsonl` holds the expected result for each persona, location and criterion.
- **Evidence** lives only in the vault, with one research folder per place. A public row carries its `source_url`, `confidence`, `source_count` and the bare filename of its source, never a path.

## Done

Tests green, cross-check clean, PR open with a one-page brief. Never push to or merge into `master` without the maintainer's push word in this session.
