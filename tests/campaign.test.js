import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCampaign } from "../src/campaign/runCampaign.js";
import { normalizeSourceRecord } from "../src/normalize/prospect.js";

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
  assert.equal(fs.existsSync(result.exportPaths.csvPath), true);
  assert.equal(fs.existsSync(result.exportPaths.markdownPath), true);
});
