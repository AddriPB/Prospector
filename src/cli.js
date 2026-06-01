#!/usr/bin/env node
import { DEFAULT_CAMPAIGN_PATH, getRuntimeConfig, loadJsonFile } from "./config.js";
import { runCampaign } from "./campaign/runCampaign.js";
import { loadConfiguredCampaigns } from "./campaign/configuredCampaigns.js";
import { recalculateScoringV2 } from "./migrations/recalculateScoringV2.js";
import { openDatabase, getCampaignResults } from "./storage/database.js";
import { exportCampaign } from "./exports/exportCampaign.js";
import { startNightlyWorker } from "./scheduler/nightly.js";

const args = process.argv.slice(2);

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

async function main() {
  const [scope, command] = args;
  const runtimeConfig = getRuntimeConfig();
  const campaignPath = optionValue("--campaign") || DEFAULT_CAMPAIGN_PATH;
  const campaign = loadJsonFile(campaignPath);

  if (scope === "campaign" && command === "run") {
    const result = await runCampaign(campaign, runtimeConfig);
    console.log(`Collectes brutes: ${result.collected}`);
    console.log(`Prospects qualifies: ${result.qualified}`);
    console.log(`CSV: ${result.exportPaths.csvPath}`);
    console.log(`Rapport: ${result.exportPaths.markdownPath}`);
    return;
  }

  if (scope === "campaign" && command === "nightly") {
    startNightlyWorker(loadConfiguredCampaigns(campaign), runtimeConfig);
    return;
  }

  if (scope === "export") {
    const db = await openDatabase(runtimeConfig.dbPath);
    try {
      const rows = getCampaignResults(db, campaign.id);
      const exportPaths = exportCampaign(campaign, rows, runtimeConfig.exportDir);
      console.log(`CSV: ${exportPaths.csvPath}`);
      console.log(`Rapport: ${exportPaths.markdownPath}`);
    } finally {
      db.close();
    }
    return;
  }

  if (scope === "scoring" && command === "recalculate-v2") {
    const db = await openDatabase(runtimeConfig.dbPath);
    try {
      const stats = recalculateScoringV2(db, loadConfiguredCampaigns(campaign));
      console.log(`Prospects traites: ${stats.processed}`);
      console.log(`Mis a jour: ${stats.updated}`);
      console.log(`Ignores: ${stats.ignored}`);
      console.log(`Erreurs: ${stats.errors}`);
    } finally {
      db.close();
    }
    return;
  }

  printHelp();
}

function optionValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function printHelp() {
  console.log(`Prospector

Commandes:
  prospector campaign run [--campaign path]
  prospector campaign nightly [--campaign path]
  prospector export [--campaign path]
  prospector scoring recalculate-v2 [--campaign path]
`);
}
