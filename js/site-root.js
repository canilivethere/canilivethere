// CanILiveThere — site-root URL resolution.
//
// Every internal link and data fetch has to work unmodified at two
// different mounts with no code change at cutover: the GitHub Pages
// project-site subpath (https://.../canilivethere/) today, and the future
// custom-domain root (https://canilivethere.info/) later. A root-absolute
// path ("/css/style.css") only works at a domain root — under a subpath
// mount it resolves to the domain root instead and 404s. A bare relative
// path ("css/style.css") only works from pages that sit at the site's own
// top level — it breaks from the prerendered l/<location_id>.html pages,
// one directory down.
//
// This module sidesteps both failure modes: it resolves paths from THIS
// FILE's own script URL, not from the including page's URL. js/site-root.js
// always sits exactly one directory below the site root, on every page
// that imports it, at both depths (root pages and l/*.html alike) and
// under both mounts (the browser already resolved this file's own <script>
// src correctly to get here) — so the site root is derived from where the
// browser actually loaded this file from, never guessed or hardcoded.
export const SITE_ROOT = new URL("../", import.meta.url);

export function siteUrl(path) {
  return new URL(path, SITE_ROOT).href;
}
