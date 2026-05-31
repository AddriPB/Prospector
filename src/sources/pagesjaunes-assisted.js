import { loadJsonFile } from "../config.js";
import { normalizeSourceRecord } from "../normalize/prospect.js";

export async function collectPagesJaunesAssisted(campaign) {
  const options = campaign.sources?.pagesJaunesAssisted;
  if (!options?.enabled || !options.seedFile) return [];

  const seeds = loadJsonFile(options.seedFile, { optional: true });
  if (!seeds) return [];

  return seeds.map((seed, index) =>
    normalizeSourceRecord({
      source: "pagesjaunes-assisted",
      sourceId: seed.url || `${campaign.id}:pagesjaunes:${index}`,
      name: seed.name,
      address: seed.address,
      city: seed.city,
      website: seed.website,
      phone: seed.phone,
      email: seed.email,
      social: seed.social || [],
      raw: seed,
      evidence: [
        seed.url ? `Fiche PagesJaunes fournie: ${seed.url}` : null,
        seed.notes || null
      ].filter(Boolean)
    })
  );
}
