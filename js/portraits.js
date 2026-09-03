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
  "GT-antigua": {
    portrait:
      "Antigua was Guatemala's capital until an earthquake ended that " +
      "arrangement in 1773, and the city never entirely got over the " +
      "demotion: cobblestone streets, a UNESCO-protected colonial core, and " +
      "three volcanoes standing watch over every rooftop view. Sitting at " +
      "1,530 meters keeps the air spring-like all year — no real winter, no " +
      "real summer, just the same mild register morning after morning. It's " +
      "also Guatemala's best-established foreign-resident town by a wide " +
      "margin, with Spanish schools doubling as social clubs and a genuinely " +
      "thriving coworking scene, forty-five minutes from the capital's " +
      "airport and its best hospitals. Call it the country's easy mode: a " +
      "well-worn corridor rather than a frontier, which is exactly the " +
      "tradeoff worth weighing in the chapters below.",
    hook: "Guatemala's easiest on-ramp — a colonial city three volcanoes still watch over.",
    number: "Elevation 1,530m — the reason it never really has a summer or a winter.",
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
