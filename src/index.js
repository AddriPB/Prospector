import { DEFAULT_CAMPAIGN_PATH, getRuntimeConfig, loadJsonFile } from "./config.js";
import { loadConfiguredCampaigns } from "./campaign/configuredCampaigns.js";
import { startServer } from "./server/index.js";
import { startNightlyWorker } from "./scheduler/nightly.js";

const runtimeConfig = getRuntimeConfig();
const campaign = loadJsonFile(DEFAULT_CAMPAIGN_PATH);
const campaigns = loadConfiguredCampaigns(campaign);

await startServer(campaign, runtimeConfig);
startNightlyWorker(campaigns, runtimeConfig);
