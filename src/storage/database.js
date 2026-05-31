import Database from "better-sqlite3";
import { ensureDir, resolveProjectPath } from "../config.js";
import path from "node:path";

export function openDatabase(dbPath) {
  ensureDir(path.dirname(dbPath));
  const db = new Database(resolveProjectPath(dbPath));
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

export function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      business_type TEXT NOT NULL,
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
      raw_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaign_prospects (
      campaign_id TEXT NOT NULL,
      prospect_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      score_reasons_json TEXT NOT NULL,
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
  `);
}

export function saveCampaignRun(db, campaign, prospects) {
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO campaigns (id, name, business_type, target_count, created_at, last_run_at)
       VALUES (@id, @name, @businessType, @targetCount, @now, @now)
       ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        business_type = excluded.business_type,
        target_count = excluded.target_count,
        last_run_at = excluded.last_run_at`
    ).run({ ...campaign, now });

    for (const prospect of prospects) {
      const result = db.prepare(
        `INSERT INTO prospects (
          dedupe_key, name, address, city, lat, lon, website, phone, email,
          social_json, sources_json, raw_json, updated_at
        )
        VALUES (
          @dedupeKey, @name, @address, @city, @lat, @lon, @website, @phone, @email,
          @socialJson, @sourcesJson, @rawJson, @now
        )
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
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at
        RETURNING id`
      ).get({
        ...prospect,
        socialJson: JSON.stringify(prospect.social || []),
        sourcesJson: JSON.stringify(prospect.sources || [prospect.source]),
        rawJson: JSON.stringify(prospect.raw || {}),
        now
      });

      const prospectId = result.id;
      db.prepare(
        `INSERT INTO campaign_prospects (
          campaign_id, prospect_id, score, score_reasons_json, message, first_seen_at, last_seen_at
        )
        VALUES (@campaignId, @prospectId, @score, @reasons, @message, @now, @now)
        ON CONFLICT(campaign_id, prospect_id) DO UPDATE SET
          score = excluded.score,
          score_reasons_json = excluded.score_reasons_json,
          message = excluded.message,
          last_seen_at = excluded.last_seen_at`
      ).run({
        campaignId: campaign.id,
        prospectId,
        score: prospect.score,
        reasons: JSON.stringify(prospect.scoreReasons || []),
        message: prospect.message,
        now
      });

      for (const evidence of prospect.evidence || []) {
        db.prepare(
          `INSERT OR IGNORE INTO evidences (prospect_id, source, text, created_at)
           VALUES (?, ?, ?, ?)`
        ).run(prospectId, prospect.source || "merged", evidence, now);
      }

      for (const contact of prospectContacts(prospect)) {
        db.prepare(
          `INSERT OR IGNORE INTO contacts (prospect_id, type, value, source, created_at)
           VALUES (?, ?, ?, ?, ?)`
        ).run(prospectId, contact.type, contact.value, prospect.source || "merged", now);
      }
    }
  });
  tx();
}

export function getCampaignResults(db, campaignId) {
  return db
    .prepare(
      `SELECT
        p.*,
        cp.score,
        cp.score_reasons_json,
        cp.message,
        cp.first_seen_at,
        cp.last_seen_at
      FROM campaign_prospects cp
      JOIN prospects p ON p.id = cp.prospect_id
      WHERE cp.campaign_id = ?
      ORDER BY cp.score DESC, p.name ASC`
    )
    .all(campaignId)
    .map((row) => ({
      ...row,
      social: JSON.parse(row.social_json || "[]"),
      sources: JSON.parse(row.sources_json || "[]"),
      scoreReasons: JSON.parse(row.score_reasons_json || "[]")
    }));
}

function prospectContacts(prospect) {
  return [
    prospect.website ? { type: "website", value: prospect.website } : null,
    prospect.phone ? { type: "phone", value: prospect.phone } : null,
    prospect.email ? { type: "email", value: prospect.email } : null,
    ...(prospect.social || []).map((value) => ({ type: "social", value }))
  ].filter(Boolean);
}
