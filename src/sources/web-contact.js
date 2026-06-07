import { normalizeSourceRecord } from "../normalize/prospect.js";
import {
  buildMissingWebsiteAudit,
  extractPublicContacts,
  webAuditEvidence
} from "../web-audit/auditWebsite.js";

export async function enrichWithWebsiteContacts(
  records,
  { timeoutMs = 3000, limit = 10, cacheDir, force = false } = {}
) {
  const enriched = [];
  let enrichedWebsiteCount = 0;

  for (const record of records) {
    if (!record.website) {
      enriched.push({
        ...record,
        webAudit: buildMissingWebsiteAudit()
      });
      continue;
    }
    if (enrichedWebsiteCount >= limit) {
      enriched.push(record);
      continue;
    }

    enrichedWebsiteCount += 1;
    try {
      const extracted = await extractPublicContacts(record.website, {
        timeoutMs,
        cacheDir,
        force
      });
      enriched.push(
        normalizeSourceRecord({
          ...record,
          sources: [...(record.sources || [record.source]), "web"],
          sourceRecords: [
            ...(record.sourceRecords || []),
            {
              source: "web",
              sourceId: record.website,
              sourceUrl: record.website,
              collectedAt: new Date().toISOString()
            }
          ],
          email: record.email || extracted.emails[0],
          phone: record.phone || extracted.phones[0],
          social: [...(record.social || []), ...extracted.social],
          webAudit: extracted.audit,
          evidence: [
            ...(record.evidence || []),
            ...webAuditEvidence(extracted.audit),
            ...extracted.contactUrls.map((url) => `Page contact publique: ${url}`),
            extracted.emails.length ? "Email public detecte sur le site" : null,
            extracted.phones.length ? "Telephone public detecte sur le site" : null
          ].filter(Boolean)
        })
      );
    } catch (error) {
      enriched.push({
        ...record,
        evidence: [...(record.evidence || []), `Audit web impossible: ${error.message}`]
      });
    }
  }
  return enriched;
}
