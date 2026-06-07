import { getCampaignSector } from "../sectors.js";
import { scoreProspect } from "../score/scoreProspect.js";
import { buildContactMessage } from "../messages/contactMessage.js";
import { computeQualificationState } from "../normalize/prospect.js";

export const SCORING_VERSION = "v2";

export function recalculateScoringV2(connection, campaigns = [], options = {}) {
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const batchSize = Math.max(25, Math.min(500, Number(options.batchSize) || 100));
  const total = Number(
    get(
      connection.db,
      `SELECT COUNT(*) AS count
       FROM campaign_prospects cp
       JOIN campaigns c ON c.id = cp.campaign_id
       JOIN prospects p ON p.id = cp.prospect_id`
    )?.count || 0
  );

  const stats = { processed: 0, updated: 0, ignored: 0, errors: 0 };
  const now = new Date().toISOString();

  for (let offset = 0; offset < total; offset += batchSize) {
    const rows = all(
      connection.db,
      `SELECT
        cp.campaign_id,
        cp.prospect_id,
        cp.score,
        c.id AS stored_campaign_id,
        c.name AS stored_campaign_name,
        c.business_type,
        c.sector,
        c.target_count,
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
      ORDER BY cp.campaign_id ASC, cp.prospect_id ASC
      LIMIT ? OFFSET ?`,
      [batchSize, offset]
    );
    const evidenceByProspectId = getEvidenceByProspectId(
      connection.db,
      rows.map((row) => row.prospect_id)
    );
    recalculateRows(connection, rows, evidenceByProspectId, campaignById, now, stats);
  }
  connection.persist();

  return stats;
}

function recalculateRows(connection, rows, evidenceByProspectId, campaignById, now, stats) {
  const savepoint = `scoring_batch_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  connection.db.run(`SAVEPOINT ${savepoint}`);
  let savepointActive = true;
  try {
    for (const row of rows) {
      stats.processed += 1;
      try {
        const campaign = campaignForRow(row, campaignById);
        const prospect = prospectForRow(row, evidenceByProspectId);
        const scoreResult = scoreProspect(prospect, campaign);
        const qualificationState = computeQualificationState(prospect, {
          score: scoreResult.score
        });
        const message = buildContactMessage(prospect, campaign, scoreResult);
        run(
          connection.db,
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
            SCORING_VERSION,
            now,
            message,
            row.campaign_id,
            row.prospect_id
          ]
        );
        run(
          connection.db,
          `UPDATE prospects
           SET qualification_state = ?, updated_at = ?
           WHERE id = ?`,
          [qualificationState, now, row.prospect_id]
        );
        stats.updated += 1;
      } catch (error) {
        stats.errors += 1;
        console.error(
          `[scoring:${SCORING_VERSION}] ${row.campaign_id}/${row.prospect_id}: ${error.message}`
        );
      }
    }
    connection.db.run(`RELEASE ${savepoint}`);
    savepointActive = false;
  } catch (error) {
    if (savepointActive) {
      try {
        connection.db.run(`ROLLBACK TO ${savepoint}`);
        connection.db.run(`RELEASE ${savepoint}`);
      } catch (rollbackError) {
        console.error(
          `[scoring:${SCORING_VERSION}] rollback ignore: ${rollbackError.message}`
        );
      }
    }
    throw error;
  }
}

function getEvidenceByProspectId(db, prospectIds) {
  if (!prospectIds.length) return new Map();
  const placeholders = prospectIds.map(() => "?").join(", ");
  const rows = all(
    db,
    `SELECT prospect_id, text
     FROM evidences
     WHERE prospect_id IN (${placeholders})
     ORDER BY prospect_id ASC, id ASC`,
    prospectIds
  );
  const evidenceByProspectId = new Map();
  for (const row of rows) {
    const current = evidenceByProspectId.get(row.prospect_id) || [];
    current.push(row.text);
    evidenceByProspectId.set(row.prospect_id, current);
  }
  return evidenceByProspectId;
}

function campaignForRow(row, campaignById) {
  const configured = campaignById.get(row.campaign_id);
  if (configured) return configured;
  return {
    id: row.stored_campaign_id,
    name: row.stored_campaign_name,
    businessType: row.business_type,
    sector: getCampaignSector({ sector: row.sector }).id,
    targetCount: Number(row.target_count || 0),
    cities: [row.city].filter(Boolean),
    localAngle: "",
    sources: {}
  };
}

function prospectForRow(row, evidenceByProspectId) {
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
    evidence: evidenceByProspectId.get(row.prospect_id) || [],
    confidence: row.confidence,
    contactability: row.contactability,
    qualificationState: row.qualification_state,
    raw: safeJsonParse(row.raw_json, {})
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

function get(db, sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    return stmt.step() ? stmt.getAsObject() : null;
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
