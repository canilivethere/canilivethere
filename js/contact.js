// CanILiveThere — the contact page (Part 27, copy deck C1-C9, register
// pass 2026-07-21).
//
// Renders the approved copy deck verbatim: the privacy posture is the
// reason to write in, stated before the address (27.3's own reading
// order) — a bare mailto with no "why" is furniture. Same static-shell +
// JS-module idiom as principles.html/corrections.html (one-word lowercase
// filename, no fresh format question to route): no persona block, no lens
// machinery — copy here makes no claim whose truth depends on a lens
// (perspective-disclosure law), same reasoning corrections.js's own
// comment already states for omitting a persona picker.
//
// C8 ("We read what arrives") ships: the mailbox is monitored, confirmed
// 2026-07-21 — a claim about actual practice this build could never
// author on its own, so it's gated on that confirmation rather than
// assumed from the ask that created the mailbox. Slotted between C5 and
// C6, per the copy deck's own placement note.

import { loadStore } from "./data.js";
import { applyStoredTheme, renderTopBar, renderFooter, escapeHtml, withPersona } from "./app-shared.js";
import { siteUrl } from "./site-root.js";

applyStoredTheme();
renderTopBar("contact");
main();

// Approved copy, embedded verbatim (register pass 2026-07-21, Unit 1.1).
const WHY_TEXT =
  "Everything you tell this site — your answers, your priorities, your " +
  "passport pick — stays in your browser. We never see any of it. " +
  "That's by design, and it has one honest cost: we also can't see what " +
  "you need. We don't know which place you searched for and didn't " +
  "find, which passport we haven't checked, or which page left you with " +
  "a question. The only way we find out is if you tell us.";

const WHAT_TEXT =
  "Worth a sentence: a place you want researched. A passport we haven't " +
  "verified. A figure that looks wrong or out of date. Anything that " +
  "confused you — if it made you hesitate, we want to know.";

const CONTACT_EMAIL = "canilivethere@gmail.com";

const MAIL_TEXT =
  "Mail lands in one plain mailbox. There's no list to join, no " +
  "follow-up machinery, and your address goes nowhere else.";

// Gated on Cap's confirmation, 2026-07-21 — this whole page stands
// complete without it if that confirmation is ever revoked; flip this
// one flag rather than restructure anything else.
const READ_CLAIM_CONFIRMED = true;
const READ_CLAIM_TEXT = "We read what arrives.";

const SAFETY_TEXT =
  "Don't send documents or anything sensitive — no passport scans, no " +
  "financial statements. A sentence about what you need is enough.";

async function main() {
  const store = await loadStore();
  renderFooter(store);

  document.getElementById("contact-why").textContent = WHY_TEXT;
  document.getElementById("contact-what").textContent = WHAT_TEXT;

  document.getElementById("contact-address").innerHTML =
    `Write to <a href="mailto:${CONTACT_EMAIL}">${escapeHtml(CONTACT_EMAIL)}</a>.`;

  document.getElementById("contact-mail").textContent = MAIL_TEXT;

  const readClaimEl = document.getElementById("contact-readclaim");
  if (READ_CLAIM_CONFIRMED) {
    readClaimEl.textContent = READ_CLAIM_TEXT;
  } else {
    readClaimEl.remove();
  }

  document.getElementById("contact-safety").textContent = SAFETY_TEXT;

  document.getElementById("contact-corrections").innerHTML =
    `If you're reporting an error: fixes land on the ` +
    `<a href="${withPersona(siteUrl("corrections.html"))}">corrections page</a>, dated, including what we got wrong.`;
}
