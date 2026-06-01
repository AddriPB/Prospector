import { loadJsonFile } from "../config.js";
import { normalizeSourceRecord } from "../normalize/prospect.js";

export async function collectManualProspects(campaign) {
  const options = campaign.sources?.manual;
  if (!options?.enabled || !options.seedFile) return [];

  const seeds = loadJsonFile(options.seedFile, { optional: true });
  if (!seeds) return [];

  return asArray(seeds).map((seed, index) =>
    normalizeSourceRecord({
      source: "manual",
      sourceId: seed.url || seed.website || `${campaign.id}:manual:${index}`,
      sourceUrl: seed.url,
      name: seed.name,
      address: seed.address,
      city: seed.city,
      website: seed.website,
      phone: seed.phone,
      email: seed.email,
      social: seed.social || [],
      raw: seed,
      evidence: [
        seed.url ? `Source manuelle: ${seed.url}` : "Source manuelle locale",
        seed.notes || null,
        seed.phone || seed.email || seed.website ? "Contact fourni manuellement" : null
      ].filter(Boolean)
    })
  );
}

collectManualProspects.sourceName = "manual";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}
