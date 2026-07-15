# Persona portrait images

`js/perspective-door.js` (v7 Part 10, the lens-first landing door) reads
one face image per persona from this directory, keyed mechanically off
`VALID_PERSONAS` (`js/app-shared.js`) — no per-name code, so a file
simply landing here is all that's needed.

**All eight are present.** Portrait images are supplied directly by
whoever owns this project (not fetchable or generatable by any build
tooling); all eight files below now exist and have cleared the
adversarial publication-boundary review described below. Until a given
file exists, its tile renders a neutral circular stub (`.door-portrait`'s
own background, `css/style.css`) — never a broken-image icon;
`js/perspective-door.js` removes a failed `<img>` on load error, leaving
the stub visible. That stub path is still live code (it's what protects
any future ninth persona or a temporarily-missing file), just not
currently exercised by any of the eight named below.

## Files, exact names

| File | Persona |
|---|---|
| `waldo.png` | Waldo |
| `wenda.png` | Wenda |
| `carmen.png` | Carmen |
| `adira.png` | Adira |
| `noa.png` | Noa |
| `marek.png` | Marek |
| `marguerite.png` | Marguerite |
| `teo.png` | Teo |

`.jpg` also works in principle (any real image file a browser will
render) — `js/perspective-door.js`'s own `portraitSrc()` currently
points at `<persona-id>.png` specifically, so a supplied `.jpg` should
be renamed to `.png` on drop-in, or the lookup widened to try both
extensions as a follow-up build change.

## Before any of these ship

Every face image passes the same adversarial publication-boundary
review as any other public-bound asset on this site before a
production build — fictional people, but review discipline is review
discipline. No code change is needed once a file exists; this is
purely an asset drop, same pattern as `fonts/README.md`. All eight
files currently in this directory have cleared that review.
