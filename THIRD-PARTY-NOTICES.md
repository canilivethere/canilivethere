# Third-party notices

Everything CanILiveThere bundles from someone else, with the attribution
its licence actually requires. Created 2026-08-26.

---

## World map outlines — `js/worldmap-data.js`

> **"World map - low resolution.svg"** by **Al MacDonald** (original),
> edited by **Fritz Lekschas** — [flekschas/simple-world-map](https://github.com/flekschas/simple-world-map),
> itself from Wikimedia Commons' *BlankMap-World* family.
>
> Licensed under [Creative Commons Attribution-ShareAlike 3.0 Unported
> (CC BY-SA 3.0)](https://creativecommons.org/licenses/by-sa/3.0/).
>
> **Changes made:** simplified, re-projected to equirectangular, and
> annotated with ISO 3166-1 alpha-2 country codes. The path data is
> otherwise copied verbatim.

The asset is bundled as static path data. There is no runtime dependency,
no CDN request and no map-tile server — the outlines ship with the page.

**Correction of record.** Until 2026-08-26 the source comment described
this asset as "MIT-licensed". That was incorrect. The upstream `LICENSE`
file is CC BY-SA 3.0, the upstream README requires credit to both Al
MacDonald and Fritz Lekschas, and GitHub reports the repository's licence
as `NOASSERTION` / "Other" precisely because CC BY-SA is not a standard
software licence. Verified against the upstream `LICENSE`, `README.md`
and the GitHub API before this file was written.

**Open question, deliberately not answered here.** CC BY-SA's ShareAlike
term is copyleft. Annotating the map with ISO codes makes
`js/worldmap-data.js` an *Adaptation*, which carries CC BY-SA 3.0 with it.
CC 3.0 distinguishes an Adaptation from a *Collection*, and a collection
does not inherit the licence merely by including a work — so the rest of
the site is not automatically CC BY-SA. That distinction is load-bearing
for whatever licence this project adopts and deserves a real decision,
not a confident sentence in a notices file. The clean alternative, if the
entanglement is unwelcome: replace the asset with a public-domain source
such as Natural Earth.
