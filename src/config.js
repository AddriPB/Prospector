import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

export const DEFAULT_CAMPAIGN_PATH =
  process.env.PROSPECTOR_DEFAULT_CAMPAIGN ||
  "config/campaigns/garages-pre-saint-gervais.json";

export function resolveProjectPath(filePath) {
  return path.resolve(process.cwd(), filePath);
}

export function loadJsonFile(filePath, { optional = false } = {}) {
  const absolutePath = resolveProjectPath(filePath);
  if (!fs.existsSync(absolutePath)) {
    if (optional) return null;
    throw new Error(`Fichier introuvable: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

export function ensureDir(dirPath) {
  fs.mkdirSync(resolveProjectPath(dirPath), { recursive: true });
}

export function getRuntimeConfig() {
  return {
    dbPath: process.env.PROSPECTOR_DB_PATH || "data/prospector.sqlite",
    exportDir: process.env.PROSPECTOR_EXPORT_DIR || "exports",
    cacheDir: process.env.PROSPECTOR_CACHE_DIR || ".local-prospector-cache",
    overpassEndpoint:
      process.env.PROSPECTOR_OVERPASS_ENDPOINT ||
      "https://overpass-api.de/api/interpreter",
    overpassEndpoints: (process.env.PROSPECTOR_OVERPASS_ENDPOINTS || "")
      .split(",")
      .map((endpoint) => endpoint.trim())
      .filter(Boolean),
    overpassTimeoutMs: Number(process.env.PROSPECTOR_OVERPASS_TIMEOUT_MS || 25000),
    websiteEnrichmentLimit: Number(process.env.PROSPECTOR_WEBSITE_ENRICHMENT_LIMIT || 10),
    websiteEnrichmentTimeoutMs: Number(
      process.env.PROSPECTOR_WEBSITE_ENRICHMENT_TIMEOUT_MS || 3000
    ),
    nightlyHour: Number(process.env.PROSPECTOR_NIGHTLY_HOUR || 4),
    nightlyMinute: Number(process.env.PROSPECTOR_NIGHTLY_MINUTE || 0),
    timezone: process.env.PROSPECTOR_TIMEZONE || "Europe/Paris",
    host: process.env.PROSPECTOR_HOST || "0.0.0.0",
    port: Number(process.env.PROSPECTOR_PORT || 4174),
    corsOrigins: (process.env.PROSPECTOR_CORS_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  };
}
