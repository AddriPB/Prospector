import fs from "node:fs";
import path from "node:path";
import { loadJsonFile, resolveProjectPath } from "../config.js";

export function loadConfiguredCampaigns(fallbackCampaign) {
  const campaignDir = resolveProjectPath("config/campaigns");
  if (!fs.existsSync(campaignDir)) return [fallbackCampaign];

  const campaigns = fs
    .readdirSync(campaignDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => loadJsonFile(path.join("config/campaigns", file)));

  return campaigns.length ? campaigns : [fallbackCampaign];
}
