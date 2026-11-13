// The checks that carry a baseline, by name. The change rule has none:
// it compares against the base revision, so it starts at zero.
import { schemaFailures } from "./schema.mjs";
import { traceabilityFailures } from "./traceability.mjs";
import { fixtureReferenceFailures, verdictFailures } from "./fixtures.mjs";

export const BASELINED = {
  schema: schemaFailures,
  traceability: traceabilityFailures,
  "fixture-references": fixtureReferenceFailures,
  verdicts: verdictFailures,
};
