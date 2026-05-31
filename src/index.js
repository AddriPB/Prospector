import { DEFAULT_CAMPAIGN_PATH, getRuntimeConfig, loadJsonFile } from "./config.js";
import { startServer } from "./server/index.js";
import { startNightlyWorker } from "./scheduler/nightly.js";

const runtimeConfig = getRuntimeConfig();
const campaign = loadJsonFile(DEFAULT_CAMPAIGN_PATH);

await startServer(campaign, runtimeConfig);
startNightlyWorker(campaign, runtimeConfig);
