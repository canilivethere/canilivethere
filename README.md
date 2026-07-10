# CanILiveThere

A born-clean public repository — site code and the derived data layer
only. Never the research project's journal, working notes, transcripts,
or personal layer. Generated one-way from a private research vault; if
this repo is ever contaminated, it gets deleted and regenerated, never
scrubbed.

**Status: first build pass, publication review in progress.** Derived
data snapshot copied in (`derived/`, see `derived/meta.json` for the
provenance policy). Site code — plain HTML/CSS/ES-modules, no build
step, no framework, no backend — covers Map, Lists, Location pages, and
the persona visa layer. The Board and Watch surfaces are deliberately
not started yet.

**Local preview:** this is a static site with client-side `fetch()` of
the `derived/*.jsonl` files, so it needs a real HTTP server (not
`file://`) — e.g. `python -m http.server` from this directory, then open
`index.html`.

**Before any push:** everything in this repo passes an adversarial
publication-boundary review against the project's threat model and the
data contract's export rules. Vault-internal provenance is stripped on
export — bare source filenames at most, never internal paths, anchors,
or process references. No exceptions. Nothing in this repo has been
pushed to a remote yet.
