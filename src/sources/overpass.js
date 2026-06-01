import fs from "node:fs";
import path from "node:path";
import { ensureDir, resolveProjectPath } from "../config.js";
import { normalizeSourceRecord } from "../normalize/prospect.js";
import { stableHash } from "../utils/hash.js";

const OVERPASS_TAG_QUERY = `
[out:json][timeout:45];
(
  nwr["shop"~"^(car|car_repair|tyres)$"](around:{{radius}},{{lat}},{{lon}});
  nwr["craft"~"^(car_repair|mechanic)$"](around:{{radius}},{{lat}},{{lon}});
  nwr["amenity"="car_wash"](around:{{radius}},{{lat}},{{lon}});
);
out center tags;
`;

export async function collectOverpass(campaign, runtimeConfig) {
  if (!campaign.sources?.overpass?.enabled) return [];

  ensureDir(runtimeConfig.cacheDir);
  const cacheKey = stableHash(
    `${campaign.id}:${campaign.center.lat}:${campaign.center.lon}:${campaign.radiusMeters}:overpass`
  );
  const cachePath = resolveProjectPath(
    path.join(runtimeConfig.cacheDir, `${cacheKey}.overpass.json`)
  );

  let payload;
  if (fs.existsSync(cachePath)) {
    payload = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } else {
    const query = OVERPASS_TAG_QUERY.replaceAll(
      "{{radius}}",
      String(campaign.radiusMeters)
    )
      .replaceAll("{{lat}}", String(campaign.center.lat))
      .replaceAll("{{lon}}", String(campaign.center.lon));

    payload = await fetchOverpass(query, runtimeConfig);
    fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2));
  }

  return (payload.elements || []).map((element) =>
    normalizeSourceRecord({
      source: "overpass",
      sourceId: `${element.type}/${element.id}`,
      name: element.tags?.name,
      address: buildAddress(element.tags),
      city: element.tags?.["addr:city"],
      lat: element.lat || element.center?.lat,
      lon: element.lon || element.center?.lon,
      website: element.tags?.website || element.tags?.["contact:website"],
      phone: element.tags?.phone || element.tags?.["contact:phone"],
      email: element.tags?.email || element.tags?.["contact:email"],
      social: [
        element.tags?.facebook,
        element.tags?.["contact:facebook"],
        element.tags?.instagram,
        element.tags?.["contact:instagram"]
      ].filter(Boolean),
      raw: element,
      evidence: [
        `Fiche OpenStreetMap ${element.type}/${element.id}`,
        `Tags metier: ${Object.entries(element.tags || {})
          .filter(([key]) => ["shop", "craft", "amenity"].includes(key))
          .map(([key, value]) => `${key}=${value}`)
          .join(", ")}`
      ].filter(Boolean)
    })
  );
}

collectOverpass.sourceName = "overpass";

async function fetchOverpass(query, runtimeConfig) {
  const endpoints = [
    ...(runtimeConfig.overpassEndpoints || []),
    runtimeConfig.overpassEndpoint,
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter"
  ].filter(Boolean);

  const uniqueEndpoints = [...new Set(endpoints)];
  const errors = [];

  for (const endpoint of uniqueEndpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), runtimeConfig.overpassTimeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": "Prospector/0.1 local qualified prospecting"
        },
        body: new URLSearchParams({ data: query })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      return response.json();
    } catch (error) {
      errors.push(`${endpoint} -> ${compactError(error.message)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`Overpass indisponible (${errors.join(" | ")})`);
}

function compactError(message) {
  return String(message).replace(/\s+/g, " ").slice(0, 500);
}

function buildAddress(tags = {}) {
  return [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:postcode"],
    tags["addr:city"]
  ]
    .filter(Boolean)
    .join(" ");
}
