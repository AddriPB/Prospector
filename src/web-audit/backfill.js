import { loadConfiguredCampaigns } from "../campaign/configuredCampaigns.js";
import { buildContactMessage } from "../messages/contactMessage.js";
import { computeQualificationState } from "../normalize/prospect.js";
import { scoreProspect } from "../score/scoreProspect.js";
import { auditWebsite, buildMissingWebsiteAudit, webAuditEvidence } from "./auditWebsite.js";

export async function backfillWebAudits(connection, campaign, runtimeConfig, options = {}) {
  const limit = Math.max(1, Math.min(500, Number(options.limit) || 25));
  const force = Boolean(options.force);
  const dryRun = Boolean(options.dryRun);
  const campaigns = dedupeCampaigns([campaign, ...loadConfiguredCampaigns(campaign)]);
  const campaignById = new Map(campaigns.map((item) => [item.id, item]));
  const rows = getBackfillCandidates(connection.db, {
    campaignIds: campaigns.map((item) => item.id),
    limit
  });
  const stats = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    cacheHits: 0,
    affectedProspectIds: [],
    dryRun,
    force
  };

  for (const row of rows) {
    stats.processed += 1;
    try {
      const existingAudit = safeJsonParse(row.web_audit_json, {});
      if (!force && existingAudit?.checkedAt) {
        stats.skipped += 1;
        continue;
      }

      const result = row.website
        ? await auditWebsite(row.website, {
            timeoutMs: runtimeConfig.websiteEnrichmentTimeoutMs,
            cacheDir: runtimeConfig.cacheDir,
            force
          })
        : { audit: buildMissingWebsiteAudit(), cacheHit: false };

      if (result.cacheHit) stats.cacheHits += 1;
      stats.affectedProspectIds.push(Number(row.id));
      if (dryRun) {
        stats.updated += 1;
        continue;
      }

      updateProspectAudit(connection.db, row.id, result.audit);
      insertAuditEvidence(connection.db, row.id, webAuditEvidence(result.audit));
      rescoreProspectCampaigns(connection.db, row.id, campaignById);
      stats.updated += 1;
    } catch (error) {
      stats.errors += 1;
      console.error(`[web-audit] prospect ${row.id}: ${error.message}`);
    }
  }

  if (!dryRun && stats.updated) connection.persist();
  return stats;
}

function getBackfillCandidates(db, { campaignIds, limit }) {
  const campaignFilter = campaignIds.length
    ? `WHERE cp.campaign_id IN (${campaignIds.map(() => "?").join(", ")})`
    : "";
  return all(
    db,
    `SELECT
      p.id,
      p.website,
      p.web_audit_json,
      MAX(cp.score) AS best_score,
      MAX(cp.first_seen_at) AS first_seen_at
     FROM prospects p
     LEFT JOIN campaign_prospects cp ON cp.prospect_id = p.id
     ${campaignFilter}
     GROUP BY p.id
     ORDER BY best_score DESC, first_seen_at DESC, p.id ASC
     LIMIT ?`,
    [...campaignIds, limit]
  );
}

function dedupeCampaigns(campaigns) {
  const byId = new Map();
  for (const campaign of campaigns.filter(Boolean)) {
    if (!byId.has(campaign.id)) byId.set(campaign.id, campaign);
  }
  return [...byId.values()];
}

function updateProspectAudit(db, prospectId, audit) {
  run(
    db,
    `UPDATE prospects
     SET web_audit_json = ?, updated_at = ?
     WHERE id = ?`,
    [JSON.stringify(audit || {}), new Date().toISOString(), prospectId]
  );
}

function insertAuditEvidence(db, prospectId, evidences) {
  const now = new Date().toISOString();
  for (const evidence of evidences || []) {
    run(
      db,
      `INSERT OR IGNORE INTO evidences (prospect_id, source, text, created_at)
       VALUES (?, ?, ?, ?)`,
      [prospectId, "web-audit", evidence, now]
    );
  }
}

function rescoreProspectCampaigns(db, prospectId, campaignById) {
  const rows = all(
    db,
    `SELECT
      cp.campaign_id,
      c.id AS stored_campaign_id,
      c.name AS stored_campaign_name,
      c.business_type,
      c.sector,
      c.target_count,
      p.id AS prospect_id,
      p.name,
      p.address,
      p.city,
      p.website,
      p.phone,
      p.email,
      p.social_json,
      p.sources_json,
      p.source_records_json,
      p.web_audit_json,
      p.source_url,
      p.confidence,
      p.contactability,
      p.qualification_state
     FROM campaign_prospects cp
     JOIN campaigns c ON c.id = cp.campaign_id
     JOIN prospects p ON p.id = cp.prospect_id
     WHERE p.id = ?`,
    [prospectId]
  );
  const evidence = all(
    db,
    `SELECT text
     FROM evidences
     WHERE prospect_id = ?
     ORDER BY id ASC`,
    [prospectId]
  ).map((row) => row.text);
  const now = new Date().toISOString();

  for (const row of rows) {
    const campaign =
      campaignById.get(row.campaign_id) ||
      fallbackCampaign(row);
    const prospect = prospectForRow(row, evidence);
    const scoreResult = scoreProspect(prospect, campaign);
    const qualificationState = computeQualificationState(prospect, {
      score: scoreResult.score
    });
    run(
      db,
      `UPDATE campaign_prospects
       SET previous_score_total = COALESCE(previous_score_total, score),
           score = ?,
           score_breakdown_json = ?,
           score_reasons_json = ?,
           scoring_version = ?,
           scoring_recalculated_at = ?,
           message = ?
       WHERE campaign_id = ? AND prospect_id = ?`,
      [
        scoreResult.score,
        JSON.stringify(scoreResult.scoreBreakdown || {}),
        JSON.stringify(scoreResult.reasons || []),
        "web-audit-v1",
        now,
        buildContactMessage(prospect, campaign, scoreResult),
        row.campaign_id,
        prospectId
      ]
    );
    run(
      db,
      `UPDATE prospects
       SET qualification_state = ?, updated_at = ?
       WHERE id = ?`,
      [qualificationState, now, prospectId]
    );
  }
}

function fallbackCampaign(row) {
  return {
    id: row.stored_campaign_id,
    name: row.stored_campaign_name,
    businessType: row.business_type,
    sector: row.sector,
    targetCount: Number(row.target_count || 0),
    cities: [row.city].filter(Boolean),
    localAngle: "",
    sources: {}
  };
}

function prospectForRow(row, evidence) {
  return {
    id: row.prospect_id,
    name: row.name,
    address: row.address,
    city: row.city,
    website: row.website,
    phone: row.phone,
    email: row.email,
    social: safeJsonParse(row.social_json, []),
    sources: safeJsonParse(row.sources_json, []),
    sourceRecords: safeJsonParse(row.source_records_json, []),
    webAudit: safeJsonParse(row.web_audit_json, {}),
    sourceUrl: row.source_url,
    evidence,
    confidence: row.confidence,
    contactability: row.contactability,
    qualificationState: row.qualification_state
  };
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function run(db, sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.run(params);
  } finally {
    stmt.free();
  }
}

function all(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const rows = [];
  try {
    stmt.bind(params);
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}
