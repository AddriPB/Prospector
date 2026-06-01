import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import initSqlJs from "sql.js";
import { runCampaign } from "../src/campaign/runCampaign.js";
import { recalculateScoringV2 } from "../src/migrations/recalculateScoringV2.js";
import { normalizeSourceRecord } from "../src/normalize/prospect.js";
import { OUTREACH_STATUSES } from "../src/outreachStatus.js";
import { nextNightlyDelayMs } from "../src/scheduler/nightly.js";
import {
  getDashboardState,
  getFollowUpProspectPage,
  getProspectPage,
  openDatabase,
  updateCommercialScript,
  updateProspectFollowUp,
  updateProspectOutreachStatus,
  updateProspectRejectionReason
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
    assert.equal(dashboard.dailyRuns[0].runs, 1);
    assert.equal(dashboard.dailyRuns[0].collected, 2);
    assert.equal(dashboard.dailyRuns[0].qualified, 1);
    assert.equal(dashboard.dailyRuns[0].topScore, prospectsPage.items[0].score);
    assert.equal(dashboard.recentRuns[0].campaignId, campaign.id);
    assert.equal(dashboard.recentRuns[0].collected, 2);
    assert.equal(dashboard.recentRuns[0].qualified, 1);
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
    updateProspectRejectionReason(db, prospectsPage.items[0].id, "");
    const clearedRejectionPage = getProspectPage(db, { campaignId: campaign.id });
    assert.equal(clearedRejectionPage.items[0].rejectionReason, "");
    updateProspectFollowUp(db, prospectsPage.items[0].id, {
      lastContactedAt: "2026-06-01",
      followUpNotes: "Relancer apres devis."
    });
    const followUpPage = getFollowUpProspectPage(db, { outreachStatus: "Décliné" });
    assert.equal(followUpPage.total, 1);
    assert.equal(followUpPage.items[0].lastContactedAt, "2026-06-01");
    assert.equal(followUpPage.items[0].followUpNotes, "Relancer apres devis.");
    assert.equal(getFollowUpProspectPage(db, { outreachStatus: "A contacter" }).total, 0);

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

test("planifie la collecte quotidienne a 4h heure locale", () => {
  const runtimeConfig = {
    timezone: "Europe/Paris",
    nightlyHour: 4,
    nightlyMinute: 0
  };

  assert.equal(
    nextNightlyDelayMs(runtimeConfig, new Date("2026-06-01T01:30:00.000Z")),
    30 * 60 * 1000
  );
  assert.equal(
    nextNightlyDelayMs(runtimeConfig, new Date("2026-06-01T02:30:00.000Z")),
    23.5 * 60 * 60 * 1000
  );
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

test("conserve les statuts commerciaux autorises apres migration et relance collecte", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prospector-statuses-"));
  const runtimeConfig = {
    dbPath: path.join(tmp, "prospector.sqlite"),
    exportDir: path.join(tmp, "exports"),
    cacheDir: path.join(tmp, "cache")
  };
  const campaign = {
    id: "status-campaign",
    name: "Status Campaign",
    businessType: "garages automobiles",
    targetCount: 50,
    cities: ["Pantin"],
    localAngle: "Angle local.",
    sources: {}
  };
  const fixtureRecords = [
    normalizeSourceRecord({
      source: "fixture",
      sourceId: "1",
      name: "Garage Statut Pantin",
      city: "Pantin",
      phone: "0102030405",
      evidence: ["shop=car_repair"]
    })
  ];

  await runCampaign(campaign, runtimeConfig, { fixtureRecords });

  for (const outreachStatus of OUTREACH_STATUSES) {
    let db = await openDatabase(runtimeConfig.dbPath);
    try {
      const page = getProspectPage(db, { campaignId: campaign.id });
      const rejectionReason = outreachStatus === "Décliné" ? "doublon" : null;
      updateProspectOutreachStatus(db, page.items[0].id, outreachStatus, rejectionReason);
    } finally {
      db.close();
    }

    db = await openDatabase(runtimeConfig.dbPath);
    try {
      const pageAfterReopen = getProspectPage(db, { campaignId: campaign.id });
      assert.equal(pageAfterReopen.items[0].outreachStatus, outreachStatus);
    } finally {
      db.close();
    }

    await runCampaign(campaign, runtimeConfig, { fixtureRecords });

    db = await openDatabase(runtimeConfig.dbPath);
    try {
      const dashboard = getDashboardState(db, campaign.id);
      const pageAfterCollection = getProspectPage(db, { campaignId: campaign.id });
      assert.deepEqual(dashboard.filters.outreachStatuses, OUTREACH_STATUSES);
      assert.equal(pageAfterCollection.items[0].outreachStatus, outreachStatus);
    } finally {
      db.close();
    }
  }

  const db = await openDatabase(runtimeConfig.dbPath);
  try {
    const page = getProspectPage(db, { campaignId: campaign.id });
    assert.throws(
      () => updateProspectOutreachStatus(db, page.items[0].id, "Contacté"),
      /invalid_outreach_status/
    );
  } finally {
    db.close();
  }
});

test("conserve les champs de suivi apres relance collecte", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prospector-follow-up-"));
  const runtimeConfig = {
    dbPath: path.join(tmp, "prospector.sqlite"),
    exportDir: path.join(tmp, "exports"),
    cacheDir: path.join(tmp, "cache")
  };
  const campaign = {
    id: "follow-up-campaign",
    name: "Follow Up Campaign",
    businessType: "garages automobiles",
    targetCount: 50,
    cities: ["Pantin"],
    localAngle: "Angle local.",
    sources: {}
  };
  const fixtureRecords = [
    normalizeSourceRecord({
      source: "fixture",
      sourceId: "1",
      name: "Garage Suivi Pantin",
      city: "Pantin",
      phone: "0102030405",
      evidence: ["shop=car_repair"]
    })
  ];

  await runCampaign(campaign, runtimeConfig, { fixtureRecords });
  let db = await openDatabase(runtimeConfig.dbPath);
  try {
    const page = getProspectPage(db, { campaignId: campaign.id });
    updateProspectOutreachStatus(db, page.items[0].id, "Interessé");
    updateProspectFollowUp(db, page.items[0].id, {
      lastContactedAt: "2026-06-01",
      followUpNotes: "A rappeler vendredi."
    });
  } finally {
    db.close();
  }

  await runCampaign(campaign, runtimeConfig, { fixtureRecords });

  db = await openDatabase(runtimeConfig.dbPath);
  try {
    const followUpPage = getFollowUpProspectPage(db);
    assert.equal(followUpPage.total, 1);
    assert.equal(followUpPage.items[0].outreachStatus, "Interessé");
    assert.equal(followUpPage.items[0].lastContactedAt, "2026-06-01");
    assert.equal(followUpPage.items[0].followUpNotes, "A rappeler vendredi.");
  } finally {
    db.close();
  }
});

test("suivi liste les statuts traites et exclut a contacter", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prospector-follow-up-statuses-"));
  const runtimeConfig = {
    dbPath: path.join(tmp, "prospector.sqlite"),
    exportDir: path.join(tmp, "exports"),
    cacheDir: path.join(tmp, "cache")
  };
  const campaign = {
    id: "follow-up-statuses-campaign",
    name: "Follow Up Statuses Campaign",
    businessType: "garages automobiles",
    targetCount: 50,
    cities: ["Pantin"],
    localAngle: "Angle local.",
    sources: {}
  };

  await runCampaign(campaign, runtimeConfig, {
    fixtureRecords: ["Decline", "Interesse", "Accepte", "Nouveau"].map((name, index) =>
      normalizeSourceRecord({
        source: "fixture",
        sourceId: String(index + 1),
        name: `Garage ${name} Pantin`,
        city: "Pantin",
        phone: `010203040${index}`,
        evidence: ["shop=car_repair"]
      })
    )
  });

  const db = await openDatabase(runtimeConfig.dbPath);
  try {
    const page = getProspectPage(db, { campaignId: campaign.id, sort: "name" });
    const byName = new Map(page.items.map((prospect) => [prospect.name, prospect.id]));
    updateProspectOutreachStatus(db, byName.get("Garage Accepte Pantin"), "A accepté");
    updateProspectOutreachStatus(db, byName.get("Garage Decline Pantin"), "Décliné", "doublon");
    updateProspectOutreachStatus(db, byName.get("Garage Interesse Pantin"), "Interessé");

    const followUpPage = getFollowUpProspectPage(db, { sort: "name" });
    assert.equal(followUpPage.total, 3);
    assert.deepEqual(
      followUpPage.items.map((prospect) => prospect.outreachStatus).sort(),
      ["A accepté", "Décliné", "Interessé"].sort()
    );
    assert.equal(
      followUpPage.items.some((prospect) => prospect.outreachStatus === "A contacter"),
      false
    );
  } finally {
    db.close();
  }
});

test("restaure automatiquement une base supprimee depuis le dernier snapshot", async () => {
  const { campaign, runtimeConfig, fixtureRecords } = statusRecoveryFixture(
    "prospector-deleted-db-"
  );

  await runCampaign(campaign, runtimeConfig, { fixtureRecords });
  let db = await openDatabase(runtimeConfig.dbPath);
  try {
    const page = getProspectPage(db, { campaignId: campaign.id });
    updateProspectOutreachStatus(db, page.items[0].id, "Interessé");
  } finally {
    db.close();
  }

  fs.rmSync(runtimeConfig.dbPath);

  db = await openDatabase(runtimeConfig.dbPath);
  try {
    const restoredPage = getProspectPage(db, { campaignId: campaign.id });
    assert.equal(restoredPage.total, 1);
    assert.equal(restoredPage.items[0].outreachStatus, "Interessé");
  } finally {
    db.close();
  }
});

test("restaure automatiquement une base vide depuis le dernier snapshot", async () => {
  const { campaign, runtimeConfig, fixtureRecords } = statusRecoveryFixture(
    "prospector-empty-db-"
  );

  await runCampaign(campaign, runtimeConfig, { fixtureRecords });
  let db = await openDatabase(runtimeConfig.dbPath);
  try {
    const page = getProspectPage(db, { campaignId: campaign.id });
    updateProspectOutreachStatus(db, page.items[0].id, "A accepté");
  } finally {
    db.close();
  }

  const SQL = await initSqlJs();
  const emptyDb = new SQL.Database();
  fs.writeFileSync(runtimeConfig.dbPath, Buffer.from(emptyDb.export()));
  emptyDb.close();

  db = await openDatabase(runtimeConfig.dbPath);
  try {
    const restoredPage = getProspectPage(db, { campaignId: campaign.id });
    assert.equal(restoredPage.total, 1);
    assert.equal(restoredPage.items[0].outreachStatus, "A accepté");
  } finally {
    db.close();
  }
});

test("restaure automatiquement une base corrompue depuis le dernier snapshot", async () => {
  const { campaign, runtimeConfig, fixtureRecords } = statusRecoveryFixture(
    "prospector-corrupt-db-"
  );

  await runCampaign(campaign, runtimeConfig, { fixtureRecords });
  let db = await openDatabase(runtimeConfig.dbPath);
  try {
    const page = getProspectPage(db, { campaignId: campaign.id });
    updateProspectOutreachStatus(db, page.items[0].id, "Décliné", "doublon");
  } finally {
    db.close();
  }

  fs.writeFileSync(runtimeConfig.dbPath, "not a sqlite database");

  db = await openDatabase(runtimeConfig.dbPath);
  try {
    const restoredPage = getProspectPage(db, { campaignId: campaign.id });
    assert.equal(restoredPage.total, 1);
    assert.equal(restoredPage.items[0].outreachStatus, "Décliné");
    assert.equal(restoredPage.items[0].rejectionReason, "doublon");
  } finally {
    db.close();
  }
});

function statusRecoveryFixture(tmpPrefix) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), tmpPrefix));
  return {
    campaign: {
      id: "status-recovery-campaign",
      name: "Status Recovery Campaign",
      businessType: "garages automobiles",
      targetCount: 50,
      cities: ["Pantin"],
      localAngle: "Angle local.",
      sources: {}
    },
    runtimeConfig: {
      dbPath: path.join(tmp, "prospector.sqlite"),
      exportDir: path.join(tmp, "exports"),
      cacheDir: path.join(tmp, "cache")
    },
    fixtureRecords: [
      normalizeSourceRecord({
        source: "fixture",
        sourceId: "1",
        name: "Garage Snapshot Pantin",
        city: "Pantin",
        phone: "0102030405",
        evidence: ["shop=car_repair"]
      })
    ]
  };
}
