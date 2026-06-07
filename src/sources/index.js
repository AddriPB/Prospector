import { collectOverpass } from "./overpass.js";
import { collectPagesJaunesAssisted } from "./pagesjaunes-assisted.js";
import { collectManualProspects } from "./manual.js";
import { enrichWithWebsiteContacts } from "./web-contact.js";

export async function collectProspects(campaign, runtimeConfig, options = {}) {
  const collectors = [collectOverpass, collectPagesJaunesAssisted, collectManualProspects];
  const sourceRecords = [];
  const errors = [];

  for (const collect of collectors) {
    const sourceName = collect.sourceName || collect.name || "unknown";
    try {
      const records = await collect(campaign, runtimeConfig);
      sourceRecords.push(...records);
    } catch (error) {
      errors.push({ source: sourceName, message: error.message });
      console.error(
        `[prospector] Source ${sourceName} ignoree: ${error.stack || error.message}`
      );
    }
  }

  const records = options.skipWebsiteEnrichment
    ? sourceRecords
    : await enrichWithWebsiteContacts(sourceRecords, {
        limit: options.websiteEnrichmentLimit ?? runtimeConfig.websiteEnrichmentLimit,
        timeoutMs:
          options.websiteEnrichmentTimeoutMs ?? runtimeConfig.websiteEnrichmentTimeoutMs,
        cacheDir: runtimeConfig.cacheDir,
        force: Boolean(options.forceWebsiteEnrichment)
      });

  return { records, errors };
}
