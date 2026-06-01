import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCampaign } from "../src/campaign/runCampaign.js";
import { recalculateScoringV2 } from "../src/migrations/recalculateScoringV2.js";
import { normalizeSourceRecord } from "../src/normalize/prospect.js";
import {
  getDashboardState,
  getProspectPage,
  openDatabase,
  updateCommercialScript,
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
    }),
    normalizeSourceRecord({
      source: "fixture-alt",
      sourceId: "2",
      name: "Garage Auto Pantin",
      city: "Pantin",
      phone: "01 02 03 04 05",
      evidence: ["shop=car_repair", "Fiche doublon"]
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
    assert.equal(dashboard.citySegments[0].city, "Pantin");
    assert.equal(dashboard.citySegments[0].prospects, 1);
    assert.equal(dashboard.citySegments[0].contactable, 1);
    assert.deepEqual(
      dashboard.commercialScripts.map((script) => script.sectorId),
      ["automotive", "restaurants", "building_trades"]
    );
    assert.equal(
      dashboard.commercialScripts.every((script) =>
        [
          script.smsHook,
          script.callAngle,
          script.commonObjection,
          script.shortAnswer,
          script.commercialOffer,
          script.followUpJ3,
          script.followUpJ7
        ].every(Boolean)
      ),
      true
    );

    assert.throws(
      () => updateProspectOutreachStatus(db, prospectsPage.items[0].id, "Décliné"),
      /invalid_rejection_reason/
    );
    updateProspectOutreachStatus(db, prospectsPage.items[0].id, "Décliné", "doublon");
    const updatedProspectsPage = getProspectPage(db, { campaignId: campaign.id });
    assert.equal(updatedProspectsPage.items[0].outreachStatus, "Décliné");
    assert.equal(updatedProspectsPage.items[0].rejectionReason, "doublon");

    const script = updateCommercialScript(db, "restaurants", {
      smsHook: "Nouvelle accroche"
    });
    assert.equal(script.smsHook, "Nouvelle accroche");

    const beforeScore = updatedProspectsPage.items[0].score;
    const stats = recalculateScoringV2(db, [campaign]);
    const rescoredPage = getProspectPage(db, { campaignId: campaign.id });
    assert.equal(stats.processed, 1);
    assert.equal(stats.updated, 1);
    assert.equal(rescoredPage.items[0].score > 0, true);
    assert.equal(typeof beforeScore, "number");
  } finally {
    db.close();
  }
});

test("signale les doublons persistants sans supprimer de prospect", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prospector-duplicates-"));
  const runtimeConfig = {
    dbPath: path.join(tmp, "prospector.sqlite"),
    exportDir: path.join(tmp, "exports"),
    cacheDir: path.join(tmp, "cache")
  };
  const campaign = {
    id: "duplicate-campaign",
    name: "Duplicate Campaign",
    businessType: "garages automobiles",
    targetCount: 50,
    cities: ["Pantin"],
    localAngle: "Angle local.",
    sources: {}
  };

  await runCampaign(campaign, runtimeConfig, {
    fixtureRecords: [
      normalizeSourceRecord({
        source: "fixture",
        sourceId: "1",
        name: "Garage Nord",
        city: "Pantin",
        sourceUrl: "https://annuaire.example/garage-nord",
        evidence: ["shop=car_repair"]
      }),
      normalizeSourceRecord({
        source: "manual",
        sourceId: "2",
        name: "Garage Nord SARL",
        city: "Pantin",
        sourceUrl: "https://annuaire.example/garage-nord",
        evidence: ["garage"]
      })
    ]
  });

  const db = await openDatabase(runtimeConfig.dbPath);
  try {
    const page = getProspectPage(db, { campaignId: campaign.id, sort: "name" });
    assert.equal(page.total, 2);
    assert.equal(page.items.filter((prospect) => prospect.duplicateSuspected).length, 1);
    assert.equal(Boolean(page.items.find((prospect) => prospect.duplicateSuspected).duplicateOf), true);
  } finally {
    db.close();
  }
});
