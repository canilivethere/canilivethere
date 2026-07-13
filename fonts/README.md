# Self-hosted fonts

`css/style.css`'s `@font-face` rules (v7, "The Explorer's Atlas") expect
six files in this directory. **All six are present** (added 2026-07-12,
same day as the build): static latin-subset WOFF2 instances downloaded
from Google Fonts' own serving endpoints, named exactly as the CSS
expects. Both families are SIL OFL-licensed; self-hosting the files
(not a CDN `<link>`) is what law 7 asks for.

If a file is ever lost or a weight is added, the recipe below
reproduces them.

## Files needed, exact names

| File | Family | Weight | Style |
|---|---|---|---|
| `fraunces-latin-600.woff2` | Fraunces | 600 | normal |
| `fraunces-latin-700.woff2` | Fraunces | 650–700 | normal |
| `fraunces-latin-italic-400.woff2` | Fraunces | 400 | italic |
| `work-sans-latin-400.woff2` | Work Sans | 400 | normal |
| `work-sans-latin-500.woff2` | Work Sans | 500 | normal |
| `work-sans-latin-600.woff2` | Work Sans | 600 | normal |

Both are SIL OFL-licensed, hosted on Google Fonts — self-hosting the
static WOFF2 files (not a CDN `<link>`) is what law 7 asks for.

## How to get them (a few minutes, any browser)

1. Visit `https://fonts.google.com/specimen/Fraunces` and
   `https://fonts.google.com/specimen/Work+Sans`, or use a static-subset
   helper like `https://gwfh.mranftl.com/fonts` (search "Fraunces" /
   "Work Sans", pick the weights above, Latin subset, WOFF2 format).
2. Download each weight/style as a `.woff2` file.
3. Rename to match the table above exactly (the `@font-face` `src` paths
   in `css/style.css` are literal) and drop them in this directory.
4. Confirm in a browser: view-source on any page, Network tab should
   show the six files loading with no 404s, and headings should render
   in Fraunces (a warm serif with high-contrast strokes) rather than the
   browser's own default serif.

No code change needed once the files exist — this is purely an asset
drop.
