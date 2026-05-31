import fs from "node:fs";
import path from "node:path";
import { ensureDir, resolveProjectPath } from "../config.js";
import { normalizeSourceRecord } from "../normalize/prospect.js";
import { stableHash } from "../utils/hash.js";

const OVERPASS_TAG_QUERY = `
(
  nwr["shop"~"^(car|car_repair|tyres)$"](around:{{radius}},{{lat}},{{lon}});
  nwr["craft"~"^(car_repair|mechanic)$"](around:{{radius}},{{lat}},{{lon}});
  nwr["amenity"~"^(car_wash|charging_station)$"](around:{{radius}},{{lat}},{{lon}});
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

    const response = await fetch(runtimeConfig.overpassEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "Prospector/0.1 local qualified prospecting"
      },
      body: new URLSearchParams({ data: query })
    });

    if (!response.ok) {
      throw new Error(`Overpass HTTP ${response.status}: ${await response.text()}`);
    }
    payload = await response.json();
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
