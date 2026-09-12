# CanILiveThere

A born-clean public repository — site code and the derived data layer
only. Never the research project's journal, working notes, transcripts,
or personal layer. Generated one-way from a private research vault; if
this repo is ever contaminated, it gets deleted and regenerated, never
scrubbed.

**Status: v7 ("The Explorer's Atlas") build pass, publication review in
progress.** Derived data snapshot copied in (`derived/`, see
`derived/meta.json` for the provenance policy). Site code — plain
HTML/CSS/ES-modules, no framework, no backend — covers Map, Lists,
Location pages, and the persona visa layer. The Board and Watch surfaces
are deliberately not started yet.

**Runtime stays build-free**: every page fetches `derived/*.jsonl`
client-side and renders with plain DOM, no bundler. **One real, small
build step now exists**, run once locally before publish, not at
request time: `node tools/prerender-locations.mjs` reads `derived/`
with plain Node `fs`/`JSON` (zero dependencies) and writes one real,
crawlable static HTML page per location into `l/<location_id>.html` —
the no-JS/crawler fallback (`location.html?loc=X` used to render 651
bytes of nothing without JavaScript; it still works as a legacy route,
but `/l/<id>.html` is now the real, indexable URL every internal link
points to). Re-run this script any time `derived/` or `js/portraits.js`
changes, before publishing.

**Path convention: deployment-agnostic, not root-absolute.** Every
internal link, stylesheet, and script tag is a plain relative path from
top-level pages (`css/style.css`, `lists.html`) or a `../`-prefixed one
from `l/*.html` (one directory down, emitted by
`tools/prerender-locations.mjs`, which knows its own depth). Shared JS
that renders links/fetches from both depths (`app-shared.js`,
`data.js`, `lists.js`, `location.js`, `map.js`) resolves them via
`js/site-root.js`'s `siteUrl()`, computed from that module's own script
URL (`import.meta.url`) rather than the including page's path or any
hardcoded prefix — so the same build works unmodified both at a GitHub
Pages project-site subpath (`https://canilivethere.github.io/canilivethere/`)
and at a future custom-domain root (`canilivethere.info`), with no code
change at cutover. A root-absolute path (`/css/style.css`) only works
when the site is mounted at a domain root — under a subpath mount it
resolves to the domain root instead and 404s, which is exactly what
shipped and broke on first launch (see git history: the v7 push and its
rollback). `sitemap.xml`/`robots.txt` are the one deliberate exception —
crawlers need real absolute URLs, so those carry the recorded canonical
domain (`https://canilivethere.info/...`) regardless of where the site
happens to be mounted today.

**Fonts: self-hosted, and present.** `css/style.css`'s `@font-face`
rules expect six WOFF2 files — two families, Fraunces and Work Sans — in
`fonts/`, and all six are there; `fonts/README.md` lists their exact
names and the recipe for reproducing any that is ever lost. Every
fallback in the CSS is a bare generic (`serif`/`sans-serif`), never a
named system font, so if a file ever fails to load the site renders the
browser's own default serif/sans rather than Inter/Roboto/Arial.

**Local preview:** needs a real HTTP server (not `file://`) — e.g.
`python -m http.server` from this directory, then open `index.html`.
`l/*.html` pages work the same way once `tools/prerender-locations.mjs`
has been run at least once.

**Inspecting a rendered page (the only reason `package.json` exists).**
Most of this site is built by JavaScript at read time — `index.html`
contains no `.door-tile` element at all, for instance; all eight are
created by `js/perspective-door.js` once the page runs. So reading the
source tells you what the code *intends*, not what a reader's eye
actually meets, and defects that live only in the rendered result
(markup that renders an empty list marker, an element nothing ever
scrolls to) are invisible to `grep`. Playwright plus a headless Chromium
is installed as a **dev dependency** so that gap can be closed:

    npm install                        # 2 packages, dev-only
    npx playwright install chromium    # browser binary -> user cache, NOT this repo

Nothing here is served to a reader and nothing here is part of the
build: the site itself still ships zero JavaScript dependencies, and
`node_modules/` is gitignored. This is an instrument for looking, not a
test suite — there is deliberately no runner, no spec folder and no
`scripts` block.

**Pages must be served over HTTP to be inspected**, for the same reason
the local preview above does: they are browser ES modules that `fetch`
`derived/*.jsonl`, and `file://` blocks both. Serve the working tree
first, then point a browser at `127.0.0.1`:

```js
// node probe.mjs   — with `python3 -m http.server 8137` running here
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();   // fresh: empty localStorage
await page.goto("http://127.0.0.1:8137/index.html", { waitUntil: "networkidle" });
console.log(await page.evaluate(() => document.querySelectorAll(".door-tile").length));
await browser.close();
```

A fresh `browser.newContext()` starts with empty `localStorage`, which
is what makes it a first-time reader — several surfaces here behave
differently once a lens has been saved, so reusing a context quietly
changes what you are looking at. One known noise source offline: the
Cloudflare analytics beacon on `index.html` logs a single
`ERR_NAME_NOT_RESOLVED` console error when there is no network. That is
the environment, not the page.

**Before any push:** everything in this repo passes an adversarial
publication-boundary review against the project's threat model and the
data contract's export rules. Fact provenance is truncated on export to
a bare source filename, never a path; score and change-event provenance
is dropped outright. What the review forbids anywhere in the published
tree: paths inside the private vault, the names of the people who did the
work, and dated process references — anything recording when a thing was
measured, checked or shipped. Two things are deliberately not on that
list. Bare section anchors (`§8AA.6`, `Part 30`) are pointers into the
project's own documents and say nothing about anybody. Dates written for
readers — a fact's own date, a source's check date, the date on
`TERMS.md` — are content, not provenance. What still falls short of that
rule today is named here rather than papered over: dated notes inside
individual facts in the country data and the location pages built from
them, the `scored_date` field carried by the scores export, the dates in
`THIRD-PARTY-NOTICES.md`, and the hand-maintained note in
`derived/meta.json`, which records when the export was built and from
which commit — all of it inherited from earlier work, none of it
introduced by this update, and all of it on the list to be fixed.
This repo is published: its history is pushed to a public remote, and
each push goes through that review first.
