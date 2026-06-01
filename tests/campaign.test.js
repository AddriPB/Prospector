import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCampaign } from "../src/campaign/runCampaign.js";
import { normalizeSourceRecord } from "../src/normalize/prospect.js";
import {
  getDashboardState,
  getProspectPage,
  openDatabase,
  updateProspectOutreachStatus
} from "../src/storage/database.js";

test("pipeline campagne avec fixtures, SQLite et exports", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prospector-"));
  const campaign = {
    id: "test-campaign",
    name: "Test Campaign",
    businessType: "garages automobiles",
    targetCount: 50,
    cities: ["Pantin"],
    localAngle: "Angle local.",
    sources: {}
  };
  const runtimeConfig = {
    dbPath: path.join(tmp, "prospector.sqlite"),
    exportDir: path.join(tmp, "exports"),
    cacheDir: path.join(tmp, "cache")
  };
  const fixtureRecords = [
    normalizeSourceRecord({
      source: "fixture",
      sourceId: "1",
      name: "Garage Auto Pantin",
      city: "Pantin",
      phone: "0102030405",
      evidence: ["shop=car_repair", "Fiche fixture"]
    })
  ];

  const result = await runCampaign(campaign, runtimeConfig, { fixtureRecords });

  assert.equal(result.qualified, 1);
  assert.equal(result.rows[0].confidence, "high");
  assert.equal(result.rows[0].contactability, "good");
  assert.equal(result.rows[0].qualification_state, "priority");
  assert.equal(fs.existsSync(result.exportPaths.csvPath), true);
  assert.equal(fs.existsSync(result.exportPaths.markdownPath), true);

  const db = await openDatabase(runtimeConfig.dbPath);
  try {
    const dashboard = getDashboardState(db, campaign.id);
    const prospectsPage = getProspectPage(db, { campaignId: campaign.id });
    assert.equal(dashboard.campaign.sector, "automotive");
    assert.equal(dashboard.summary.totalProspects, 1);
    assert.equal(prospectsPage.total, 1);
    assert.equal(prospectsPage.items[0].sector, "automotive");
    assert.equal(prospectsPage.items[0].outreachStatus, "A contacter");

    updateProspectOutreachStatus(db, prospectsPage.items[0].id, "Contacté");
    const updatedProspectsPage = getProspectPage(db, { campaignId: campaign.id });
    assert.equal(updatedProspectsPage.items[0].outreachStatus, "Contacté");
  } finally {
    db.close();
  }
});
