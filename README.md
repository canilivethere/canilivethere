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

**Path convention:** every internal link, stylesheet, and script tag
uses a root-absolute path (`/css/style.css`, `/l/GT-antigua.html`), not
a relative one — required so the same shared JS (`app-shared.js`,
`data.js`) resolves assets correctly whether the including page lives
at the site root or one level down in `l/`. This assumes the site is
served from its domain root (`canilivethere.info`), not a subpath.

**Fonts: a real, unfilled gap.** `css/style.css`'s `@font-face` rules
expect two self-hosted WOFF2 families (Fraunces, Work Sans) in
`fonts/` — not present yet; see `fonts/README.md` for exactly what's
missing and how to get it (a few minutes in any browser). Every
fallback in the CSS is a bare generic (`serif`/`sans-serif`), never a
named system font, so the site doesn't render Inter/Roboto/Arial in the
meantime — it renders the browser's own default serif/sans until the
real files are dropped in.

**Local preview:** needs a real HTTP server (not `file://`) — e.g.
`python -m http.server` from this directory, then open `index.html`.
`l/*.html` pages work the same way once `tools/prerender-locations.mjs`
has been run at least once.

**Before any push:** everything in this repo passes an adversarial
publication-boundary review against the project's threat model and the
data contract's export rules. Vault-internal provenance is stripped on
export — bare source filenames at most, never internal paths, anchors,
or process references. No exceptions. Nothing in this repo has been
pushed to a remote yet.
