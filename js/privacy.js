// CanILiveThere — "What this site does with your browser" (the trust-
// statement page, Part 27.7's placement ruling: a standalone root page,
// same static-shell + JS-module idiom as principles.html/corrections.html,
// footer-linked in the same accountability-surface family). No persona
// block, no lens machinery — same reasoning corrections.js's own comment
// already states for omitting a persona picker: nothing here renders data
// or makes a claim whose truth depends on a lens.
//
// Renders the approved copy deck verbatim (register pass 2026-07-21,
// Doubt 6's own drafted default, ratified rather than restructured) — this
// build authors zero words of its own. One deliberate omission, named
// here rather than silently added: the deck's own placement ruling notes
// a one-line pointer from "If you don't believe us" to the contact page
// as a follow-up still owed by the deck's own author, not written for her
// here — this section ships exactly as drafted, without that pointer,
// until that follow-up lands.
//
// A real staleness flag, not smoothed over: the "What stays on your
// device" paragraph below is the deck's own verbatim text, drafted before
// the door rework (2026-07-21, this same day) that retired the old
// persistent "have you seen the welcome screen" flag in favor of a
// per-visit session flag, and added a passport/nationality pick as a
// fourth thing this site remembers in the browser — neither of which
// this paragraph's specific wording reflects. Not fixed here (this build
// authors zero copy of its own); logged as a follow-up fix for the copy
// owner instead.

import { loadStore } from "./data.js";
import { applyStoredTheme, renderTopBar, renderFooter, escapeHtml } from "./app-shared.js";

applyStoredTheme();
renderTopBar("privacy");
main();

// Approved copy, embedded verbatim (the ratified copy deck's SHIP THIS block).
const INTRO_TEXT =
  "Most sites you visit are quietly talking to a dozen other companies " +
  "before the page even finishes loading — ad networks, tracking " +
  "pixels, session recorders watching where your mouse goes. You're " +
  "owed a straight answer about whether this one does that. Short " +
  "version: almost never, and here's exactly what “almost” means.";

const LEAVES_INTRO = "Two things call out to anyone else. Only two.";

const LEAVES_ITEMS = [
  {
    lead: "A currency check.",
    body:
      "When a price on this site is shown in a currency you didn't " +
      "start in, your browser asks a currency-conversion service " +
      "(open.er-api.com) for today's exchange rate. That request " +
      "carries nothing about you — no page you're on, no place you're " +
      "looking at, nothing you've typed. It's a bare question: what's " +
      "a US dollar worth today. If it fails, or you're offline, the " +
      "converted figure just doesn't show up. Nothing else breaks.",
  },
  {
    lead: "A visit count.",
    body:
      "This site uses Cloudflare's cookie-free analytics to see " +
      "roughly how many people visit and which pages get read — not " +
      "who, not what you did once you got here. No cookie gets set on " +
      "your device for this. No profile gets built.",
  },
];

const LEAVES_CLOSING =
  "That's the whole list. No ad network. No fonts fetched fresh from " +
  "Google's own servers every time you land here — we host all six " +
  "font files ourselves. No tracking pixel. No session recorder. No " +
  "live-chat widget phoning a vendor. No account, no login, nothing to " +
  "sign up for — there's no database on our end with your name in it, " +
  "because there's no “our end” collecting names at all.";

const STAYS_TEXT =
  "A few things you tell this site get remembered, and they never " +
  "leave your browser: a dark-mode preference, whether you've already " +
  "seen the welcome screen, your own priority weightings if you build " +
  "a custom search. All of it lives in your browser's own local " +
  "storage, not on any server. Clear your browser data and it's gone. " +
  "We never see it, because it's never sent to us in the first place.";

const LIGHT_PARAS = [
  "The other half of this promise is what we don't make you download. " +
  "The map is drawn by hand, not loaded from a third-party mapping " +
  "library your browser would otherwise fetch fresh. The typefaces " +
  "live in this site's own folder, not fetched from a font service on " +
  "every visit. No images, no video, no JavaScript framework sitting " +
  "underneath it all — plain code, nothing to download before the " +
  "download can even start. We could add all of that. We didn't, on " +
  "purpose: every extra kilobyte is a small tax on whoever's reading " +
  "this from an airport, or a country where a megabyte still costs " +
  "something — and that's not a hypothetical reader for a site about " +
  "moving somewhere.",
  "Turn off JavaScript entirely and a location page still renders — " +
  "every fact, every source link — because the page itself was built " +
  "once ahead of time, not assembled in your browser after the fact. " +
  "JavaScript adds the live map, the currency conversion, the ability " +
  "to reweight things to your own priorities. It was never required " +
  "just to read what we know.",
];

const CHECKABLE_PARAS = [
  "Don't just take our word for any of this. The code that runs this " +
  "site is public — read it yourself, the same way you'd check a " +
  "source citation on any fact here. That's not a courtesy. It's the " +
  "same “check us, don't just trust us” rule this site holds " +
  "itself to everywhere else.",
  "This page describes what the site actually does today. If that " +
  "ever changes — a new vendor, a new script, a new thing we ask your " +
  "browser to do — it changes here first, the same day, not sometime " +
  "after the fact.",
];

function paras(list) {
  return list.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
}

async function main() {
  const store = await loadStore();
  renderFooter(store);

  document.getElementById("privacy-intro").textContent = INTRO_TEXT;

  document.getElementById("privacy-leaves").innerHTML =
    `<p>${escapeHtml(LEAVES_INTRO)}</p>` +
    LEAVES_ITEMS.map((it) => `<p><strong>${escapeHtml(it.lead)}</strong> ${escapeHtml(it.body)}</p>`).join("") +
    `<p>${escapeHtml(LEAVES_CLOSING)}</p>`;

  document.getElementById("privacy-stays").textContent = STAYS_TEXT;

  document.getElementById("privacy-light").innerHTML = paras(LIGHT_PARAS);
  document.getElementById("privacy-checkable").innerHTML = paras(CHECKABLE_PARAS);
}
