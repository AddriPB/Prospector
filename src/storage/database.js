import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import { ensureDir, resolveProjectPath } from "../config.js";

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

export function saveCampaignRun(connection, campaign, prospects) {
  const { db } = connection;
  const now = new Date().toISOString();

  db.run("BEGIN TRANSACTION");
  try {
    run(
      db,
      `INSERT INTO campaigns (id, name, business_type, target_count, created_at, last_run_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        business_type = excluded.business_type,
        target_count = excluded.target_count,
        last_run_at = excluded.last_run_at`,
      [campaign.id, campaign.name, campaign.businessType, campaign.targetCount, now, now]
    );

    for (const prospect of prospects) {
      run(
        db,
        `INSERT INTO prospects (
          dedupe_key, name, address, city, lat, lon, website, phone, email,
          social_json, sources_json, raw_json, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          campaign_id, prospect_id, score, score_reasons_json, message, first_seen_at, last_seen_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(campaign_id, prospect_id) DO UPDATE SET
          score = excluded.score,
          score_reasons_json = excluded.score_reasons_json,
          message = excluded.message,
          last_seen_at = excluded.last_seen_at`,
        [
          campaign.id,
          prospectId,
          prospect.score,
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
      p.*,
      cp.score,
      cp.score_reasons_json,
      cp.message,
      cp.first_seen_at,
      cp.last_seen_at
    FROM campaign_prospects cp
    JOIN prospects p ON p.id = cp.prospect_id
    WHERE cp.campaign_id = ?
    ORDER BY cp.score DESC, p.name ASC`,
    [campaignId]
  ).map((row) => ({
    ...row,
    social: JSON.parse(row.social_json || "[]"),
    sources: JSON.parse(row.sources_json || "[]"),
    scoreReasons: JSON.parse(row.score_reasons_json || "[]")
  }));
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

function prospectContacts(prospect) {
  return [
    prospect.website ? { type: "website", value: prospect.website } : null,
    prospect.phone ? { type: "phone", value: prospect.phone } : null,
    prospect.email ? { type: "email", value: prospect.email } : null,
    ...(prospect.social || []).map((value) => ({ type: "social", value }))
  ].filter(Boolean);
}
