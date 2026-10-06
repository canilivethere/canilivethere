// Portrait copy, hook+number lines, and chapter-intro lines — narrative
// prose written and reviewed upstream of this site build, lifted
// verbatim into the build here: zero facts authored, zero words
// reworded, transport only. Every string below traces to a marked-
// shippable block in a reviewed source copy deck, independently re-
// checked against its underlying research before this transport (one
// flagged clause was corrected and re-checked clean before this file
// was written).
//
// v7 §2.3's hard placeholder rule: only locations present in this object
// get a portrait; every other location's slot renders nothing (no
// lorem-ipsum, no "[Portrait pending]" stub) — see location.js's own
// buildPortrait().

export const PORTRAITS = {
  // TWO DEVIATIONS FROM VERBATIM TRANSPORT, both authorised, both in
  // GT-antigua's portrait. The upstream copy still carries the old
  // wording and is tracked for reconciliation:
  //  1. "meters" -> "metres". British spelling is the project standard
  //     for reader copy, and the fact row directly below this prose on
  //     the same screen reads "metres".
  //  2. The clause ", forty-five minutes from the capital's airport and
  //     its best hospitals" is struck, not replaced: the page's own
  //     travel-time row carries the figure and the prose states none.
  //     This seat authors zero facts. Nothing else in the sentence
  //     changed. This comment points at the row rather than naming a
  //     figure of its own, which had gone stale against it.
  "GT-antigua": {
    portrait:
      "Antigua was Guatemala's capital until an earthquake ended that " +
      "arrangement in 1773, and the city never entirely got over the " +
      "demotion: cobblestone streets, a UNESCO-protected colonial core, and " +
      "three volcanoes standing watch over every rooftop view. Sitting at " +
      "1,530 metres keeps the air spring-like all year — no real winter, no " +
      "real summer, just the same mild register morning after morning. It's " +
      "also Guatemala's best-established foreign-resident town by a wide " +
      "margin, with Spanish schools doubling as social clubs and a genuinely " +
      "thriving coworking scene. Call it the country's easy mode: a " +
      "well-worn corridor rather than a frontier, which is exactly the " +
      "tradeoff worth weighing in the chapters below.",
    hook: "Guatemala's easiest on-ramp — a colonial city three volcanoes still watch over.",
  },
  "AR-buenosaires": {
    portrait:
      "Buenos Aires is a genuine world city dressed as a decades-older one — " +
      "nearly 15 million people, block after block of extraordinary " +
      "architecture, and more bookstores per capita than anywhere else on " +
      "Earth. Palermo Soho is where the remote-work crowd actually lands, " +
      "dense with cafés and coworking spaces, a short walk from Recoleta's " +
      "grander, older-money quiet; Belgrano rounds out the neighborhood trio " +
      "as the quieter, still-safe residential option. The climate runs humid " +
      "subtropical rather than the \"eternal spring\" some neighboring " +
      "capitals claim — hot, sticky summers, cool grey winters, no real dry " +
      "season either way. And after decades of a currency story so volatile " +
      "it needed its own vocabulary — the blue dollar, the cuevas, tourists " +
      "bragging about a black-market exchange rate — that particular chapter " +
      "closed in 2025: the official, informal, and market rates finally " +
      "agree, and prices mean what they say.",
    hook: "A world capital with more bookstores per capita than anywhere on Earth — and a currency story that finally calmed down.",
    number: "25 bookstores per 100,000 people — the world's highest count, by a real margin over second place.",
  },
  "TH-chiangmai": {
    portrait:
      "Chiang Mai has been a nomad waypoint since long before the word " +
      "carried its current pandemic-era baggage — one of the original " +
      "\"Four Hour Workweek\"-era destinations, now home to something like " +
      "150,000 foreign residents built around Nimmanhaemin's café-and-" +
      "coworking cluster. The Old City itself is still ringed by a genuine " +
      "730-year-old moat, dug in 1296 and actively kept clean and " +
      "circulating rather than left to sit stagnant, with the Ping River " +
      "running through downtown and a once-degraded canal now slowly being " +
      "brought back to life. Nights in the surrounding hills can drop into " +
      "the low double digits even when the rest of the country never really " +
      "cools at all — a real mountain climate, not a marketing line. It's " +
      "northern Thailand's answer to a well-worn expat hub: deep " +
      "infrastructure, a long social history, and a seasonal rhythm worth " +
      "understanding before committing to it.",
    hook: "Northern Thailand's original nomad hub, moated the old-fashioned way.",
    number: "The Old City moat: dug in 1296, still cleared of debris twice a day.",
  },
  "PT-lagos": {
    portrait:
      "Lagos calls itself the Algarve's digital-nomad capital, but that " +
      "undersells how layered the town actually is: British and German " +
      "retirees who've been here for decades, a real surf-and-beach culture, " +
      "and a growing thirty-something remote-work crowd, all overlapping in " +
      "one small town rather than sorted into separate neighborhoods. " +
      "Unlike its glossier resort neighbors, Portuguese is still the language " +
      "on the street here — a working town with a seafaring past that " +
      "happens to also run a tourist season, not a themed resort built for " +
      "one. And that season is the whole story: a permanent population of " +
      "roughly 31,000 that genuinely doubles every summer, beaches packed by " +
      "11am and driving turned into a daily chore, before the crowds leave " +
      "and rents drop 30-40% into a quieter, tighter-knit winter town. " +
      "Sunniest and driest of the three Portugal locations on file, with " +
      "roughly 3,000 hours of sun a year to show for it.",
    hook: "The Algarve town that's really two towns a year — one built for summer, one for everyone who stays.",
    number: "Population roughly doubles every summer, from a year-round base of about 31,000.",
  },
  "MA-marrakech": {
    portrait:
      "Marrakech is Morocco's clear answer to a digital-nomad hub, though a " +
      "much smaller and more tight-knit one than its reputation might " +
      "suggest — the country's most developed coworking scene, anchored by a " +
      "well-known Gueliz space, and a social calendar built around a rotating " +
      "Thursday-night meetup rather than an anonymous expat sea. Housing " +
      "ranges from modern Gueliz apartments to traditional medina riads, two " +
      "genuinely different ways of living in the same city. Summers run " +
      "properly hot and dry, regularly 40-45°C in the afternoon, while " +
      "winters stay mild by day and cool at the edges — spring and autumn are " +
      "the town's best-kept secret, climate-wise. And getting here has gotten " +
      "easier fast: Marrakech's airport now reaches 108 destinations across " +
      "26 countries, with fares starting as low as $23 one-way since a major " +
      "airline opened its first African base here in 2026.",
    hook: "Morocco's nomad hub — small, walkable, and newly a lot cheaper to fly into.",
    number: "One-way flights from $23, since a major airline's first African base opened here in 2026.",
  },
};

// Chapter-intro lines (v7 §6.4): guide-voice orientation, one per
// section, reusable at every location. Slot: SECTION_TITLES' own six
// keys in location.js — Sources/Verify-yourself weren't drafted this
// pilot round, so those two chapters render without an intro line.
export const CHAPTER_INTROS = {
  visa:
    "How you'd actually get to stay — the real routes, their income " +
    "floors, and how long they realistically take, not the marketing " +
    "version.",
  property:
    "Can you buy here, and what it actually takes to do it — ownership " +
    "rules, structures, and real price bands, not listing-site optimism.",
  cost:
    "What a month here actually runs, in real numbers — not a nomad-blog " +
    "average built for a lifestyle that isn't yours.",
  community:
    "Who else lives here, how you'd actually meet them, and what it's " +
    "like once the novelty wears off.",
  redflags:
    "The hard truths, stated plainly — real risks, sitting right next to " +
    "everything that's actually going well.",
};

// ---------------------------------------------------------------------
// Reader sentences — one layer up from a fact row: a paragraph that
// performs a comparison the rows can only supply the parts of. Thirteen
// Red-flags rows in export order, three of them the same measurement at
// three geographic scopes and none of the three adjacent, are right and
// still leave the comparison undone; nothing on the page was doing it.
// These paragraphs do it.
//
// Specified by the reader-sentence placement spec, AS AMENDED BY CAP
// 2026-10-04, whose amendment moved fixture 1 out of the portrait plate
// and fixture 5 to the foot of its chapter, verbatim: "fixture 1 goes at
// the head of Overview, not the portrait block, so the top of the page
// stays as it is today ... Fixture 5 goes at the bottom of Overview, as
// on Chania. Fixtures 3 and 4 stay at the head of Red flags. Chapters
// stay closed; that is accepted."
//
// Transport only — zero facts authored, zero words reworded, same rule
// as the portrait strings above. Each string is the marked-shippable
// blockquoted lines of its fixture block in the reviewed source copy
// deck, joined with one space; the deck's internal annotation lines
// (which rows a figure came from, and which of the proposed clauses had
// no row behind them and so went unwritten) are internal and do not
// cross. Nothing of them is here. The strings were extracted and written
// by script rather than retyped, and their measured lengths are the
// transport's own check: fixture 3 = 427, fixture 4 = 349, fixture 5 =
// 710. A shipped string of a different length is a failed transport.
// FIXTURE 1 IS 159, NOT THE 200 IT ARRIVED AS: the elevation shows once
// in the opened Overview and the fact row is where it shows, so this
// fixture's closing sentence "It sits at 1,530 metres above sea level."
// is struck. That is a ruled change to
// the string, not a failed transport — the only kind of length change
// this check is not meant to catch, which is why it is named here.
// FIXTURE 3 IS 427, NOT THE 353 IT ARRIVED AS: Cap ruled the Fuego
// clause's qualifier in on 2026-10-06 (17:31 +00), so "Do not rent or
// buy there." now reads "...unless you are really into living in the
// impact zone of an active volcano." That is a ruled change to the
// string, not a failed transport — the same exemption as fixture 1's,
// named here for the same reason. Fixtures 1, 4 and 5 were re-measured
// on that date and match the figures above unchanged.
//
// Characters a "tidying" edit would silently change, named so that it
// cannot: EM DASH U+2014 (fixtures 1, 3 and 4), EN DASH U+2013 (fixture
// 3's "16–18 km" — a different character from the em dash and from a
// hyphen), the accents in Volcán, Diálogos and Sacatepéquez, and the
// British forms metres / paediatrics / orthopaedics, which are
// deliberate. Escaping happens at render, never here.
//
// SHAPE, and the one place it departs from the spec as written. The spec
// specified an above-the-fold `lead` slot plus per-chapter ORDERED
// ARRAYS rendered at the HEAD of their chapter. Cap's amendment needs
// Overview to carry a sentence at its head AND one at its foot, which a
// single array per chapter cannot express, and it leaves `lead` with no
// referent at all. So: `lead` is gone rather than left behind as a dead
// key, and `chapters[key]` is an object of POSITION slots — `head`
// (above the chapter's fact rows) and `foot` (below them, closing the
// chapter) — each holding an ordered array whose order is render order.
// Nothing else of the specified shape moves: same file, same export
// style, same claim-free topic-noun labels, same hard placeholder rule.
// The spec's one-item cap was `lead`'s alone and `lead` is gone; it is
// NOT reimposed on the position arrays, because the spec's own Red-flags
// fill puts two sentences at one position.
//
// `topic` is OPTIONAL. Where present it is a topic noun phrase, three
// words or fewer, with no claim and no question in it: the
// perspective-disclosure law treats a control's promise as a claim, so a
// question-shaped label would promise an answer the paragraph may only
// partly give. "Healthcare" is load-bearing rather than decorative —
// Overview is a catch-all chapter that also holds pet import, climate,
// population and travel time, so an unlabelled healthcare paragraph
// there would misrepresent what the chapter is.
//
// Fixture 1 carries NO topic, and that is a deliberate restraint rather
// than an omission: it had none in the spec (it was the bare `lead`), it
// is the Overview chapter's own subject rather than one scoped reading
// inside it, and authoring a fourth reader-facing label is the design
// spec's call and not this build's.
//
// v7 §2.3's hard placeholder rule, inherited in force: a location with
// no entry renders NOTHING here. No stub, no "[pending]", no empty
// block. And a position slot may only be filled where that chapter has
// at least one fact row at that location — a reader sentence rendered
// above the honest "Not yet researched" line would be a
// self-contradiction shipped to a reader.
// tools/prerender-locations.mjs asserts that at build time and fails
// loudly; js/location.js cannot render the pair by construction, since
// its empty-chapter branch returns before any reader sentence is
// appended.
//
// NO LENS BRANCHING IN THE DATA, EVER. These values are static per
// location. A lens-conditional reader sentence would make
// READER_SENTENCE_SCOPE_LINE below false, so this is a constraint on the
// surface rather than a note about it.
// ---------------------------------------------------------------------
export const READER_SENTENCE_POSITIONS = ["head", "foot"];

export const READER_SENTENCES = {
  "GT-antigua": {
    chapters: {
      overview: {
        head: [
          {
            text:
              "Antigua is a town of 62,839 people, on the national "
              + "statistics institute's projection for 2026. The last time "
              + "anyone counted — the 2018 census — it was 46,054.",
          },
        ],
        foot: [
          {
            topic: "Healthcare",
            text:
              "Across the department of Sacatepéquez, 83% of people had no "
              + "health insurance in 2023, on the national statistics office's "
              + "figures. Antigua's public hospital, Hospital Nacional Pedro "
              + "de Bethancourt, is free, and its stated scope is broad: "
              + "general medicine, surgery, obstetrics, paediatrics, trauma "
              + "and orthopaedics, emergency, intensive care and diagnostics. "
              + "Reviews of it are mixed, with real complaints about "
              + "overcrowding and waiting times. Newborn intensive care opened "
              + "there on 28 March 2025. It gave its first chemotherapy on 7 "
              + "January 2026, and as of 29 September 2026 the oncology unit "
              + "was still incomplete. The capital, with its major hospitals "
              + "and the international airport, is 72 minutes away by road.",
          },
        ],
      },
      redflags: {
        head: [
          {
            topic: "Volcán de Fuego",
            text:
              "Volcán de Fuego is 16–18 km from town, and from town it is a "
              + "view — one of three volcanoes visible from the street. The "
              + "2018 deaths were on Fuego's south and south-east flank, below "
              + "about 2,500 m: the Las Lajas drainage, San Miguel Los Lotes "
              + "and El Rodeo, in Escuintla. Do not rent or buy there unless "
              + "you are really into living in the impact zone of an active "
              + "volcano. Antigua sits on the far side, shielded by Volcán de "
              + "Agua.",
          },
          {
            topic: "Homicide rate",
            text:
              "In the twelve months to March 2026, Antigua Guatemala "
              + "municipality recorded 11.1 killings per 100,000 people. "
              + "Guatemala as a whole recorded 16.2. The surrounding "
              + "department of Sacatepéquez recorded 9.1 — so the town sits "
              + "below the national rate and above its own department's. All "
              + "three figures are from the same report, by the Diálogos "
              + "observatory.",
          },
        ],
      },
    },
  },
};

// Perspective disclosure (the law of 2026-07-17, which makes the no-lens
// state itself a perspective that has to say so). All four strings above
// are general-lens, and the page's own existing disclosure already covers
// them: renderPerspectiveBlock() runs directly under the <h1>, above
// every placement here, and in the no-lens state it reads "Shown as-is —
// the general figures, nobody's situation in particular." A second
// general-lens confession above the content is the thing v8 Part 10
// Ruling 3 rules out — "no surface leads with a process confession when
// it has real content to lead with" — so none is added.
//
// What this line is for is the LENS-SELECTED state, where the line under
// the h1 instead reads "Shown for Waldo …" or "Shown for you …", and a
// reader who has just been told the page is in their lens could
// reasonably take a prose paragraph as part of it. It is not. So the
// scope rides the data at the data's own position, which is v8 Part 10's
// own reconciliation of this tension. Near-verbatim reuse of an
// already-live, already-gated string — js/cost-comparison.js's
// COPY_C1_LENS — rather than new authorship.
//
// It is a claim, and it is true by construction: READER_SENTENCES has no
// lens branch. It goes false the instant anyone gives a reader sentence
// one.
//
// The prerendered twin never renders it — a static page has no lens by
// definition, and its topbar corner already says so.
export const READER_SENTENCE_SCOPE_LINE =
  "General figures — the same for every reader; no persona, passport, "
  + "or saved profile changes them.";
