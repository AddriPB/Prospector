import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import { ensureDir, resolveProjectPath } from "../config.js";
import {
  COMMERCIAL_SCRIPT_SECTOR_IDS,
  DEFAULT_COMMERCIAL_SCRIPTS,
  LEGACY_DEFAULT_COMMERCIAL_SCRIPTS
} from "../commercialScripts.js";
import {
  computeDedupeCandidates,
  normalizeDomain,
  normalizePhone
} from "../normalize/prospect.js";
import { REJECTION_REASONS } from "../rejectionReasons.js";
import { DEFAULT_SECTOR, getCampaignSector, sectorOptions } from "../sectors.js";
import { OUTREACH_STATUSES } from "../outreachStatus.js";
import { normalizeKey } from "../utils/text.js";

export async function openDatabase(dbPath) {
  ensureDir(path.dirname(dbPath));
  const absolutePath = resolveProjectPath(dbPath);
  const SQL = await initSqlJs();
  const db = fs.existsSync(absolutePath)
    ? new SQL.Database(fs.readFileSync(absolutePath))
    : new SQL.Database();

  migrate(db);

  return {
    db,
    path: absolutePath,
    persist() {
      fs.writeFileSync(absolutePath, Buffer.from(db.export()));
    },
    close() {
      this.persist();
      db.close();
    }
  };
}

export function migrate(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      business_type TEXT NOT NULL,
      sector TEXT NOT NULL DEFAULT 'automotive',
      target_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      last_run_at TEXT
    );

    CREATE TABLE IF NOT EXISTS prospects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupe_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      lat REAL,
      lon REAL,
      website TEXT,
      phone TEXT,
      email TEXT,
      social_json TEXT NOT NULL DEFAULT '[]',
      sources_json TEXT NOT NULL DEFAULT '[]',
      source_records_json TEXT NOT NULL DEFAULT '[]',
      source_url TEXT,
      collected_at TEXT,
      confidence TEXT NOT NULL DEFAULT 'low',
      contactability TEXT NOT NULL DEFAULT 'none',
      qualification_state TEXT NOT NULL DEFAULT 'discovered',
      outreach_status TEXT NOT NULL DEFAULT 'A contacter',
      rejection_reason TEXT,
      duplicate_suspected INTEGER NOT NULL DEFAULT 0,
      duplicate_of INTEGER,
      raw_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaign_prospects (
      campaign_id TEXT NOT NULL,
      prospect_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      previous_score_total INTEGER,
      score_breakdown_json TEXT NOT NULL DEFAULT '{}',
      score_reasons_json TEXT NOT NULL,
      scoring_version TEXT,
      scoring_recalculated_at TEXT,
      message TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      PRIMARY KEY (campaign_id, prospect_id)
    );

    CREATE TABLE IF NOT EXISTS evidences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (prospect_id, source, text)
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (prospect_id, type, value)
    );

    CREATE TABLE IF NOT EXISTS commercial_scripts (
      sector_id TEXT PRIMARY KEY,
      sector_label TEXT NOT NULL,
      sms_hook TEXT NOT NULL,
      call_angle TEXT NOT NULL,
      common_objection TEXT NOT NULL,
      short_answer TEXT NOT NULL,
      commercial_offer TEXT NOT NULL,
      follow_up_j3 TEXT NOT NULL,
      follow_up_j7 TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

  `);

  addColumnIfMissing(db, "prospects", "source_records_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "prospects", "source_url", "TEXT");
  addColumnIfMissing(db, "prospects", "collected_at", "TEXT");
  addColumnIfMissing(db, "prospects", "confidence", "TEXT NOT NULL DEFAULT 'low'");
  addColumnIfMissing(db, "prospects", "contactability", "TEXT NOT NULL DEFAULT 'none'");
  addColumnIfMissing(
    db,
    "prospects",
    "qualification_state",
    "TEXT NOT NULL DEFAULT 'discovered'"
  );
  addColumnIfMissing(
    db,
    "prospects",
    "outreach_status",
    "TEXT NOT NULL DEFAULT 'A contacter'"
  );
  addColumnIfMissing(db, "prospects", "rejection_reason", "TEXT");
  addColumnIfMissing(
    db,
    "prospects",
    "duplicate_suspected",
    "INTEGER NOT NULL DEFAULT 0"
  );
  addColumnIfMissing(db, "prospects", "duplicate_of", "INTEGER");
  addColumnIfMissing(
    db,
    "campaigns",
    "sector",
    `TEXT NOT NULL DEFAULT '${DEFAULT_SECTOR}'`
  );
  addColumnIfMissing(db, "campaign_prospects", "previous_score_total", "INTEGER");
  addColumnIfMissing(
    db,
    "campaign_prospects",
    "score_breakdown_json",
    "TEXT NOT NULL DEFAULT '{}'"
  );
  addColumnIfMissing(db, "campaign_prospects", "scoring_version", "TEXT");
  addColumnIfMissing(db, "campaign_prospects", "scoring_recalculated_at", "TEXT");

  db.run("UPDATE prospects SET outreach_status = 'Décliné' WHERE outreach_status = 'Contacté'");
  migrateLegacyCommercialScriptSectors(db);
  seedCommercialScripts(db);
  refreshUnmodifiedCommercialScriptDefaults(db);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_campaign_prospects_score
      ON campaign_prospects(score DESC);
    CREATE INDEX IF NOT EXISTS idx_campaign_prospects_first_seen
      ON campaign_prospects(first_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_campaigns_sector
      ON campaigns(sector);
    CREATE INDEX IF NOT EXISTS idx_prospects_outreach_status
      ON prospects(outreach_status);
    CREATE INDEX IF NOT EXISTS idx_prospects_city
      ON prospects(city);
    CREATE INDEX IF NOT EXISTS idx_prospects_duplicate
      ON prospects(duplicate_suspected, duplicate_of);
  `);

  markDuplicateSuspicions(db);
}

export function saveCampaignRun(connection, campaign, prospects) {
  const { db } = connection;
  const now = new Date().toISOString();

  db.run("BEGIN TRANSACTION");
  try {
    run(
      db,
      `INSERT INTO campaigns (id, name, business_type, sector, target_count, created_at, last_run_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        business_type = excluded.business_type,
        sector = excluded.sector,
        target_count = excluded.target_count,
        last_run_at = excluded.last_run_at`,
      [
        campaign.id,
        campaign.name,
        campaign.businessType,
        getCampaignSector(campaign).id,
        campaign.targetCount,
        now,
        now
      ]
    );

    for (const prospect of prospects) {
      run(
        db,
        `INSERT INTO prospects (
          dedupe_key, name, address, city, lat, lon, website, phone, email,
          social_json, sources_json, source_records_json, source_url, collected_at,
          confidence, contactability, qualification_state, outreach_status, raw_json, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(dedupe_key) DO UPDATE SET
          name = excluded.name,
          address = COALESCE(excluded.address, prospects.address),
          city = COALESCE(excluded.city, prospects.city),
          lat = COALESCE(excluded.lat, prospects.lat),
          lon = COALESCE(excluded.lon, prospects.lon),
          website = COALESCE(NULLIF(excluded.website, ''), prospects.website),
          phone = COALESCE(NULLIF(excluded.phone, ''), prospects.phone),
          email = COALESCE(NULLIF(excluded.email, ''), prospects.email),
          social_json = excluded.social_json,
          sources_json = excluded.sources_json,
          source_records_json = excluded.source_records_json,
          source_url = COALESCE(NULLIF(excluded.source_url, ''), prospects.source_url),
          collected_at = COALESCE(prospects.collected_at, excluded.collected_at),
          confidence = excluded.confidence,
          contactability = excluded.contactability,
          qualification_state = excluded.qualification_state,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at`,
        [
          prospect.dedupeKey,
          prospect.name,
          prospect.address,
          prospect.city,
          prospect.lat,
          prospect.lon,
          prospect.website,
          prospect.phone,
          prospect.email,
          JSON.stringify(prospect.social || []),
          JSON.stringify(prospect.sources || [prospect.source]),
          JSON.stringify(prospect.sourceRecords || []),
          prospect.sourceUrl,
          prospect.collectedAt,
          prospect.confidence || "low",
          prospect.contactability || "none",
          prospect.qualificationState || "discovered",
          prospect.outreachStatus || "A contacter",
          JSON.stringify(prospect.raw || {}),
          now
        ]
      );

      const prospectId = get(db, "SELECT id FROM prospects WHERE dedupe_key = ?", [
        prospect.dedupeKey
      ]).id;

      run(
        db,
        `INSERT INTO campaign_prospects (
          campaign_id, prospect_id, score, score_breakdown_json, score_reasons_json, message, first_seen_at, last_seen_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(campaign_id, prospect_id) DO UPDATE SET
          score = excluded.score,
          score_breakdown_json = excluded.score_breakdown_json,
          score_reasons_json = excluded.score_reasons_json,
          message = excluded.message,
          last_seen_at = excluded.last_seen_at`,
        [
          campaign.id,
          prospectId,
          prospect.score,
          JSON.stringify(prospect.scoreBreakdown || {}),
          JSON.stringify(prospect.scoreReasons || []),
          prospect.message,
          now,
          now
        ]
      );

      for (const evidence of prospect.evidence || []) {
        run(
          db,
          `INSERT OR IGNORE INTO evidences (prospect_id, source, text, created_at)
           VALUES (?, ?, ?, ?)`,
          [prospectId, prospect.source || "merged", evidence, now]
        );
      }

      for (const contact of prospectContacts(prospect)) {
        run(
          db,
          `INSERT OR IGNORE INTO contacts (prospect_id, type, value, source, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [prospectId, contact.type, contact.value, prospect.source || "merged", now]
        );
      }
    }

    markDuplicateSuspicions(db);

    db.run("COMMIT");
    connection.persist();
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }
}

export function getCampaignResults(connection, campaignId) {
  return all(
    connection.db,
    `SELECT
      c.id AS campaign_id,
      c.sector AS campaign_sector,
      p.*,
      cp.score,
      cp.score_breakdown_json,
      cp.score_reasons_json,
      cp.message,
      cp.first_seen_at,
      cp.last_seen_at
    FROM campaign_prospects cp
    JOIN prospects p ON p.id = cp.prospect_id
    JOIN campaigns c ON c.id = cp.campaign_id
    WHERE cp.campaign_id = ?
    ORDER BY cp.score DESC, p.name ASC`,
    [campaignId]
  ).map((row) => ({
    ...row,
    social: JSON.parse(row.social_json || "[]"),
    sources: JSON.parse(row.sources_json || "[]"),
    sourceRecords: JSON.parse(row.source_records_json || "[]"),
    scoreBreakdown: parseScoreBreakdown(row.score_breakdown_json, row.score),
    scoreReasons: JSON.parse(row.score_reasons_json || "[]")
  }));
}

export function getDashboardState(connection, campaignId = null) {
  const campaigns = campaignId
    ? [
        get(
          connection.db,
          `SELECT id, name, business_type, sector, target_count, last_run_at
           FROM campaigns
           WHERE id = ?`,
          [campaignId]
        )
      ].filter(Boolean)
    : all(
        connection.db,
        `SELECT id, name, business_type, sector, target_count, last_run_at
         FROM campaigns
         ORDER BY id ASC`
      );
  const campaign = campaigns[0] || null;
  const newByDay = all(
    connection.db,
    `SELECT substr(first_seen_at, 1, 10) AS day, COUNT(*) AS count
     FROM campaign_prospects
     WHERE (? IS NULL OR campaign_id = ?)
     GROUP BY day
     ORDER BY day DESC
     LIMIT 14`,
    [campaignId, campaignId]
  );
  const today = localDateKey(new Date());
  const newToday = Number(newByDay.find((row) => row.day === today)?.count || 0);
  const totalProspects = getProspectCount(connection, { campaignId });
  const citySegments = getCitySegments(connection, campaignId);

  return {
    campaign: campaign || null,
    campaigns,
    summary: {
      totalProspects,
      newToday,
      targetCount: campaigns.reduce((sum, item) => sum + Number(item.target_count || 0), 0),
      latestRunAt: latestDate(campaigns.map((item) => item.last_run_at))
    },
    newByDay,
    citySegments,
    commercialScripts: getCommercialScripts(connection),
    filters: {
      sectors: sectorOptions(),
      outreachStatuses: OUTREACH_STATUSES,
      rejectionReasons: REJECTION_REASONS
    }
  };
}

export function getProspectPage(connection, options = {}) {
  const limit = clampPositiveInteger(options.limit, 100, 500);
  const offset = Math.max(0, Number(options.offset) || 0);
  const { whereSql, params } = buildProspectsWhere(options);
  const orderSql = prospectOrderSql(options.sort);
  const total = getProspectCount(connection, options);
  const rows = all(
    connection.db,
    `SELECT
      c.id AS campaign_id,
      c.sector AS campaign_sector,
      p.*,
      cp.score,
      cp.score_breakdown_json,
      cp.score_reasons_json,
      cp.message,
      cp.first_seen_at,
      cp.last_seen_at
    FROM campaign_prospects cp
    JOIN prospects p ON p.id = cp.prospect_id
    JOIN campaigns c ON c.id = cp.campaign_id
    ${whereSql}
    ${orderSql}
    LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  ).map((row) => ({
    ...row,
    social: JSON.parse(row.social_json || "[]"),
    sources: JSON.parse(row.sources_json || "[]"),
    sourceRecords: JSON.parse(row.source_records_json || "[]"),
    scoreBreakdown: parseScoreBreakdown(row.score_breakdown_json, row.score),
    scoreReasons: JSON.parse(row.score_reasons_json || "[]")
  }));

  return {
    items: rows.map((prospect) => toDashboardProspect(prospect)),
    total,
    limit,
    offset
  };
}

function getProspectCount(connection, options = {}) {
  const { whereSql, params } = buildProspectsWhere(options);
  const row = get(
    connection.db,
    `SELECT COUNT(*) AS count
     FROM campaign_prospects cp
     JOIN prospects p ON p.id = cp.prospect_id
     JOIN campaigns c ON c.id = cp.campaign_id
     ${whereSql}`,
    params
  );
  return Number(row?.count || 0);
}

export function updateProspectOutreachStatus(
  connection,
  prospectId,
  outreachStatus,
  rejectionReason = null
) {
  const now = new Date().toISOString();
  const normalizedReason = outreachStatus === "Décliné" ? String(rejectionReason || "") : null;
  if (outreachStatus === "Décliné" && !REJECTION_REASONS.some((reason) => reason.id === normalizedReason)) {
    throw new Error("invalid_rejection_reason");
  }
  run(
    connection.db,
    `UPDATE prospects
     SET outreach_status = ?, rejection_reason = ?, updated_at = ?
     WHERE id = ?`,
    [outreachStatus, normalizedReason, now, prospectId]
  );
  connection.persist();
}

export function updateProspectRejectionReason(connection, prospectId, rejectionReason) {
  if (!REJECTION_REASONS.some((reason) => reason.id === rejectionReason)) {
    throw new Error("invalid_rejection_reason");
  }
  const now = new Date().toISOString();
  run(
    connection.db,
    `UPDATE prospects
     SET rejection_reason = ?, updated_at = ?
     WHERE id = ?`,
    [rejectionReason, now, prospectId]
  );
  connection.persist();
}

export function updateCommercialScript(connection, sectorId, updates) {
  const current = getCommercialScripts(connection).find((script) => script.sectorId === sectorId);
  if (!current) throw new Error("invalid_script_sector");
  const next = {
    ...current,
    ...Object.fromEntries(
      Object.entries(updates || {}).map(([key, value]) => [key, String(value || "").trim()])
    )
  };
  const now = new Date().toISOString();
  run(
    connection.db,
    `UPDATE commercial_scripts
     SET sms_hook = ?,
         call_angle = ?,
         common_objection = ?,
         short_answer = ?,
         commercial_offer = ?,
         follow_up_j3 = ?,
         follow_up_j7 = ?,
         updated_at = ?
     WHERE sector_id = ?`,
    [
      next.smsHook,
      next.callAngle,
      next.commonObjection,
      next.shortAnswer,
      next.commercialOffer,
      next.followUpJ3,
      next.followUpJ7,
      now,
      sectorId
    ]
  );
  connection.persist();
  return getCommercialScripts(connection).find((script) => script.sectorId === sectorId);
}

function getAllCampaignResults(connection) {
  return all(
    connection.db,
    `SELECT
      c.id AS campaign_id,
      c.sector AS campaign_sector,
      p.*,
      cp.score,
      cp.score_breakdown_json,
      cp.score_reasons_json,
      cp.message,
      cp.first_seen_at,
      cp.last_seen_at
    FROM campaign_prospects cp
    JOIN prospects p ON p.id = cp.prospect_id
    JOIN campaigns c ON c.id = cp.campaign_id
    ORDER BY cp.score DESC, p.name ASC`
  ).map((row) => ({
    ...row,
    social: JSON.parse(row.social_json || "[]"),
    sources: JSON.parse(row.sources_json || "[]"),
    sourceRecords: JSON.parse(row.source_records_json || "[]"),
    scoreBreakdown: parseScoreBreakdown(row.score_breakdown_json, row.score),
    scoreReasons: JSON.parse(row.score_reasons_json || "[]")
  }));
}

function buildProspectsWhere(options = {}) {
  const conditions = [];
  const params = [];
  if (options.campaignId) {
    conditions.push("cp.campaign_id = ?");
    params.push(options.campaignId);
  }
  if (options.sector && options.sector !== "all") {
    conditions.push("c.sector = ?");
    params.push(options.sector);
  }
  if (options.outreachStatus && options.outreachStatus !== "all") {
    conditions.push("p.outreach_status = ?");
    params.push(options.outreachStatus);
  }

  return {
    whereSql: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params
  };
}

function getCitySegments(connection, campaignId = null) {
  return all(
    connection.db,
    `SELECT
      COALESCE(NULLIF(TRIM(p.city), ''), 'A confirmer') AS city,
      COUNT(*) AS prospects,
      ROUND(AVG(cp.score), 1) AS average_score,
      SUM(CASE WHEN p.phone IS NOT NULL AND p.phone != '' OR p.email IS NOT NULL AND p.email != '' THEN 1 ELSE 0 END) AS contactable,
      SUM(CASE WHEN p.website IS NULL OR p.website = '' THEN 1 ELSE 0 END) AS without_site,
      SUM(CASE WHEN p.outreach_status = 'Décliné' THEN 1 ELSE 0 END) AS rejected
     FROM campaign_prospects cp
     JOIN prospects p ON p.id = cp.prospect_id
     WHERE (? IS NULL OR cp.campaign_id = ?)
     GROUP BY city
     ORDER BY prospects DESC, average_score DESC, city ASC
     LIMIT 100`,
    [campaignId, campaignId]
  ).map((row) => ({
    city: row.city,
    prospects: Number(row.prospects || 0),
    averageScore: Number(row.average_score || 0),
    contactable: Number(row.contactable || 0),
    withoutSite: Number(row.without_site || 0),
    rejected: Number(row.rejected || 0)
  }));
}

function prospectOrderSql(sort = "priority") {
  if (sort === "newest") {
    return "ORDER BY cp.first_seen_at DESC, cp.score DESC, p.name ASC";
  }
  if (sort === "name") {
    return "ORDER BY p.name ASC, cp.score DESC, cp.first_seen_at DESC";
  }
  return "ORDER BY cp.score DESC, cp.first_seen_at DESC, p.name ASC";
}

function clampPositiveInteger(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function toDashboardProspect(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    sector: row.campaign_sector || DEFAULT_SECTOR,
    name: row.name,
    city: row.city,
    address: row.address,
    score: row.score,
    scoreBreakdown: row.scoreBreakdown,
    website: row.website,
    phone: row.phone,
    email: row.email,
    social: row.social,
    sources: row.sources,
    sourceRecords: row.sourceRecords,
    sourceUrl: row.source_url,
    duplicateSuspected: Boolean(row.duplicate_suspected),
    duplicateOf: row.duplicate_of || null,
    collectedAt: row.collected_at,
    confidence: row.confidence,
    contactability: row.contactability,
    qualificationState: row.qualification_state,
    outreachStatus: row.outreach_status || "A contacter",
    rejectionReason: row.rejection_reason || "",
    scoreReasons: row.scoreReasons,
    message: row.message,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at
  };
}

function getCommercialScripts(connection) {
  const orderSql = COMMERCIAL_SCRIPT_SECTOR_IDS
    .map((sectorId, index) => `WHEN '${sectorId}' THEN ${index}`)
    .join(" ");
  return all(
    connection.db,
    `SELECT sector_id, sector_label, sms_hook, call_angle, common_objection,
      short_answer, commercial_offer, follow_up_j3, follow_up_j7, updated_at
     FROM commercial_scripts
     WHERE sector_id IN (${COMMERCIAL_SCRIPT_SECTOR_IDS.map(() => "?").join(", ")})
     ORDER BY CASE sector_id ${orderSql} ELSE 999 END`,
    COMMERCIAL_SCRIPT_SECTOR_IDS
  ).map((row) => ({
    sectorId: row.sector_id,
    sectorLabel: row.sector_label,
    smsHook: row.sms_hook,
    callAngle: row.call_angle,
    commonObjection: row.common_objection,
    shortAnswer: row.short_answer,
    commercialOffer: row.commercial_offer,
    followUpJ3: row.follow_up_j3,
    followUpJ7: row.follow_up_j7,
    updatedAt: row.updated_at
  }));
}

function migrateLegacyCommercialScriptSectors(db) {
  const migrations = [
    { from: "restaurant", to: "restaurants", label: "Restaurants" },
    { from: "artisan", to: "building_trades", label: "Artisans bâtiment" }
  ];

  for (const migration of migrations) {
    const legacy = getCommercialScriptRow(db, migration.from);
    if (!legacy) continue;

    const target = getCommercialScriptRow(db, migration.to);
    if (!target) {
      run(
        db,
        `UPDATE commercial_scripts
         SET sector_id = ?, sector_label = ?
         WHERE sector_id = ?`,
        [migration.to, migration.label, migration.from]
      );
      continue;
    }

    if (matchesCommercialScript(legacy, legacyDefaultFor(migration.from))) {
      run(db, "DELETE FROM commercial_scripts WHERE sector_id = ?", [migration.from]);
    }
  }
}

function refreshUnmodifiedCommercialScriptDefaults(db) {
  const legacyDefaultsByCurrentSector = new Map([
    ["restaurants", legacyDefaultFor("restaurant")],
    ["building_trades", legacyDefaultFor("artisan")]
  ]);

  for (const script of DEFAULT_COMMERCIAL_SCRIPTS) {
    const current = getCommercialScriptRow(db, script.sectorId);
    if (!current) continue;

    const legacyDefault = legacyDefaultsByCurrentSector.get(script.sectorId);
    const isCurrentDefault = matchesCommercialScript(current, script);
    const isLegacyDefault = legacyDefault && matchesCommercialScript(current, legacyDefault);
    if (!isCurrentDefault && !isLegacyDefault) continue;

    writeCommercialScriptDefaults(db, script);
  }
}

function getCommercialScriptRow(db, sectorId) {
  return get(
    db,
    `SELECT sector_id, sector_label, sms_hook, call_angle, common_objection,
      short_answer, commercial_offer, follow_up_j3, follow_up_j7, updated_at
     FROM commercial_scripts
     WHERE sector_id = ?`,
    [sectorId]
  );
}

function legacyDefaultFor(sectorId) {
  return LEGACY_DEFAULT_COMMERCIAL_SCRIPTS.find((script) => script.sectorId === sectorId) || null;
}

function matchesCommercialScript(row, script) {
  if (!row || !script) return false;
  return (
    row.sms_hook === script.smsHook &&
    row.call_angle === script.callAngle &&
    row.common_objection === script.commonObjection &&
    row.short_answer === script.shortAnswer &&
    row.commercial_offer === script.commercialOffer &&
    row.follow_up_j3 === script.followUpJ3 &&
    row.follow_up_j7 === script.followUpJ7
  );
}

function writeCommercialScriptDefaults(db, script) {
  run(
    db,
    `UPDATE commercial_scripts
     SET sector_label = ?,
         sms_hook = ?,
         call_angle = ?,
         common_objection = ?,
         short_answer = ?,
         commercial_offer = ?,
         follow_up_j3 = ?,
         follow_up_j7 = ?,
         updated_at = ?
     WHERE sector_id = ?`,
    [
      script.sectorLabel,
      script.smsHook,
      script.callAngle,
      script.commonObjection,
      script.shortAnswer,
      script.commercialOffer,
      script.followUpJ3,
      script.followUpJ7,
      new Date().toISOString(),
      script.sectorId
    ]
  );
}

function seedCommercialScripts(db) {
  const now = new Date().toISOString();
  for (const script of DEFAULT_COMMERCIAL_SCRIPTS) {
    run(
      db,
      `INSERT OR IGNORE INTO commercial_scripts (
        sector_id, sector_label, sms_hook, call_angle, common_objection,
        short_answer, commercial_offer, follow_up_j3, follow_up_j7, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        script.sectorId,
        script.sectorLabel,
        script.smsHook,
        script.callAngle,
        script.commonObjection,
        script.shortAnswer,
        script.commercialOffer,
        script.followUpJ3,
        script.followUpJ7,
        now
      ]
    );
  }
}

function markDuplicateSuspicions(db) {
  const rows = all(
    db,
    `SELECT id, name, address, city, website, phone, email, source_url, sources_json, source_records_json
     FROM prospects
     ORDER BY id ASC`
  );
  const ownerByCandidate = new Map();
  const duplicateOf = new Map();

  for (const row of rows) {
    const candidates = duplicateCandidatesForRow(row);
    const ownerId = candidates.map((candidate) => ownerByCandidate.get(candidate.key)).find(Boolean);
    if (ownerId) {
      duplicateOf.set(row.id, ownerId);
    }
    const canonicalId = ownerId || row.id;
    for (const candidate of candidates) {
      if (!ownerByCandidate.has(candidate.key)) ownerByCandidate.set(candidate.key, canonicalId);
    }
  }

  run(db, "UPDATE prospects SET duplicate_suspected = 0, duplicate_of = NULL");
  for (const [id, parentId] of duplicateOf) {
    run(
      db,
      `UPDATE prospects
       SET duplicate_suspected = 1, duplicate_of = ?
       WHERE id = ?`,
      [parentId, id]
    );
  }
}

function duplicateCandidatesForRow(row) {
  const sourceRecords = safeJsonParse(row.source_records_json, []);
  const sourceUrls = [
    row.source_url,
    ...sourceRecords.map((record) => record.sourceUrl)
  ].filter(Boolean);
  const sourceIds = sourceRecords
    .filter((record) => record.source && record.sourceId)
    .map((record) => ({
      type: "sourceId",
      key: `source:${normalizeKey(record.source)}:${normalizeKey(record.sourceId)}`
    }));
  return [
    ...computeDedupeCandidates({
      name: row.name,
      address: row.address,
      city: row.city,
      website: row.website,
      phone: row.phone,
      email: row.email
    }),
    normalizePhone(row.phone) ? { type: "phone", key: `phone:${normalizePhone(row.phone)}` } : null,
    normalizeDomain(row.website) ? { type: "domain", key: `domain:${normalizeDomain(row.website)}` } : null,
    ...sourceUrls.map((url) => ({ type: "sourceUrl", key: `source-url:${normalizeKey(url)}` })),
    ...sourceIds
  ]
    .filter(Boolean)
    .filter((candidate, index, candidates) =>
      candidates.findIndex((item) => item.key === candidate.key) === index
    );
}

function latestDate(values) {
  return values.filter(Boolean).sort().at(-1) || null;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseScoreBreakdown(value, fallbackScore = 0) {
  const parsed = safeJsonParse(value, {});
  const empty = !parsed || !Object.keys(parsed).length;
  if (empty) {
    return {
      base: { score: 0, max: 15, reasons: [] },
      webNeed: { score: 0, max: 35, reasons: [] },
      commercialPotential: { score: 0, max: 25, reasons: [] },
      actionability: { score: 0, max: 25, reasons: [] },
      legacy: true,
      legacyScore: Number(fallbackScore) || 0
    };
  }
  return {
    base: normalizeBreakdownPart(parsed.base, 15),
    webNeed: normalizeBreakdownPart(parsed.webNeed, 35),
    commercialPotential: normalizeBreakdownPart(parsed.commercialPotential, 25),
    actionability: normalizeBreakdownPart(parsed.actionability, 25)
  };
}

function normalizeBreakdownPart(part, max) {
  const score = Math.max(0, Math.min(max, Math.round(Number(part?.score) || 0)));
  return {
    score,
    max,
    reasons: Array.isArray(part?.reasons) ? part.reasons : []
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

function addColumnIfMissing(db, table, column, definition) {
  const columns = all(db, `PRAGMA table_info(${table})`);
  if (columns.some((row) => row.name === column)) return;
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function prospectContacts(prospect) {
  return [
    prospect.website ? { type: "website", value: prospect.website } : null,
    prospect.phone ? { type: "phone", value: prospect.phone } : null,
    prospect.email ? { type: "email", value: prospect.email } : null,
    ...(prospect.social || []).map((value) => ({ type: "social", value }))
  ].filter(Boolean);
}
