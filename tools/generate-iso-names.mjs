// CanILiveThere — one-time generator for js/iso-names.js (§8AA.5).
// Zero dependencies (this project's own "boring, dependency-light"
// tools/ convention — same standard prerender-locations.mjs already
// holds itself to): plain Node Intl.DisplayNames against a hardcoded
// ISO 3166-1 alpha-2 code list, nothing fetched over the network at
// generation time or at runtime.
//
// Per the ruling: this generator is SCAFFOLDING — the checked-in
// js/iso-names.js is the source of truth, reviewed and committed like
// any other shipped asset (through the standing publication-review
// gate, same as every other commit), not regenerated silently on
// every build. Re-run only when a deliberate, reviewed refresh is
// wanted (a newer bundled ICU/CLDR version, or a real-world ISO code
// change — a new/retired country code). Runtime code (js/*.js loaded by
// the browser) never calls Intl.DisplayNames itself — see js/iso-names.js's
// own header for why.
//
// The 250-code list below is the full ISO 3166-1 alpha-2 set (current
// assigned codes plus the handful of long-standing exceptional-reservation
// codes this project's own data already treats as real entries — TW, PS,
// XK — per §8AA.5's own naming of that class). Sourced by cross-checking
// against the `world-countries` npm package's own cca2 list at generation
// time (not a runtime dependency of this script or the site — used once,
// off to the side, purely to confirm this hardcoded array is complete and
// current; see this generator's own commit message for the exact check).

const ISO_ALPHA2_CODES = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS",
  "BT","BV","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN",
  "CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE",
  "EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR","GA","GB","GD","GE","GF",
  "GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY","HK","HM",
  "HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM",
  "JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC",
  "LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MH","MK",
  "ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA",
  "NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG",
  "PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW",
  "SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS",
  "ST","SV","SX","SY","SZ","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO",
  "TR","TT","TV","TW","TZ","UA","UG","UM","US","UY","UZ","VA","VC","VE","VG","VI",
  "VN","VU","WF","WS","XK","YE","YT","ZA","ZM","ZW",
];

const dn = new Intl.DisplayNames(["en"], { type: "region", fallback: "code" });

const entries = ISO_ALPHA2_CODES.map((code) => [code, dn.of(code)]);
const unresolved = entries.filter(([code, name]) => name === code).map(([code]) => code);
if (unresolved.length) {
  console.error("Codes with no CLDR English name (fell back to bare code) — not written:", unresolved);
  process.exit(1);
}

const nodeVersion = process.version;
const icuVersion = process.versions.icu;
const unicodeVersion = process.versions.unicode;

const body = entries
  .map(([code, name]) => `  ${code}: ${JSON.stringify(name)},`)
  .join("\n");

const output = `// CanILiveThere — vendored ISO 3166-1 alpha-2 -> English short name.
// Generated ${new Date().toISOString().slice(0, 10)} by tools/generate-iso-names.mjs
// (§8AA.5). Source: Unicode CLDR English territory display names, via
// Node's own Intl.DisplayNames at generation time — bundled with Node
// ${nodeVersion} (process.versions.icu
// = ${icuVersion}, process.versions.unicode = ${unicodeVersion}; ICU ${icuVersion}
// ships CLDR 48.2 per the Unicode Consortium's own release notes — the
// named CLDR version this file's data traces to). This file is the
// source of truth once committed; the generator is scaffolding, re-run
// only for a deliberate, reviewed refresh (the standing publication-
// review gate applies to any regeneration exactly as it does to this
// first commit).
//
// Runtime NEVER calls Intl.DisplayNames — not even as a fallback. A
// runtime fallback would be a second name authority that varies by
// browser/locale data; this vendored, checked-in list is the one true
// source the nationality picker builds from (js/perspective-door.js's
// wing-1 build, 25.5), so no code the site can save is ever missing
// from it.
//
// Politically sensitive entries (TW, PS, XK, ...) carry CLDR's own
// neutral wording, wholesale — hand-editing a single entry would be
// fact-authorship no seat here holds; this list updates only by
// regenerating from a newer CLDR version, each regeneration its own
// reviewed, gated commit.
//
// The nationality axis this file serves never consults
// derived/countries.jsonl or the project's own location-ID registry —
// two separate vocabularies on the same two-letter alphabet, never
// joined (§8AA.5's own explicit ruling: this project's country_id
// deliberately departs from ISO for sub-national candidates, e.g. CR is
// Crete in the registry and Costa Rica in ISO).

export const ISO_COUNTRY_NAMES = {
${body}
};
`;

const fs = await import("node:fs");
const path = await import("node:path");
const outPath = path.join(import.meta.dirname, "..", "js", "iso-names.js");
fs.writeFileSync(outPath, output, "utf-8");
console.log(`Wrote ${entries.length} entries to ${outPath}`);
