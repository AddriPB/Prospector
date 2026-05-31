import { collectOverpass } from "./overpass.js";
import { collectPagesJaunesAssisted } from "./pagesjaunes-assisted.js";
import { enrichWithWebsiteContacts } from "./web-contact.js";

export async function collectProspects(campaign, runtimeConfig, options = {}) {
  const collectors = [collectOverpass, collectPagesJaunesAssisted];
  const sourceRecords = [];

  for (const collect of collectors) {
    const records = await collect(campaign, runtimeConfig);
    sourceRecords.push(...records);
  }

  if (options.skipWebsiteEnrichment) return sourceRecords;
  return enrichWithWebsiteContacts(sourceRecords);
}
