import { stableHash } from "../utils/hash.js";
import { compactWhitespace, normalizeKey, uniqBy } from "../utils/text.js";

export function normalizeSourceRecord(input) {
  const name = compactWhitespace(input.name);
  const address = compactWhitespace(input.address);
  const city = compactWhitespace(input.city);
  const website = normalizeUrl(input.website);
  const phone = compactWhitespace(input.phone);
  const email = compactWhitespace(input.email).toLowerCase();
  const social = uniqBy(input.social || [], (value) => String(value).toLowerCase());
  const keyBase = [name, city || address].filter(Boolean).join("|");

  return {
    externalKey: input.sourceId
      ? `${input.source}:${input.sourceId}`
      : `${input.source}:${stableHash(keyBase)}`,
    dedupeKey: normalizeKey(keyBase || input.sourceId || input.website || ""),
    source: input.source,
    sourceId: input.sourceId,
    name,
    address,
    city,
    lat: input.lat ?? null,
    lon: input.lon ?? null,
    website,
    phone,
    email,
    social,
    evidence: uniqBy(input.evidence || [], (value) => value),
    raw: input.raw || {}
  };
}

export function mergeDuplicateProspects(records) {
  const byKey = new Map();
  for (const record of records) {
    const existing = byKey.get(record.dedupeKey);
    if (!existing) {
      byKey.set(record.dedupeKey, { ...record, sources: [record.source] });
      continue;
    }

    existing.sources = uniqBy([...existing.sources, record.source], (value) => value);
    existing.website ||= record.website;
    existing.phone ||= record.phone;
    existing.email ||= record.email;
    existing.address ||= record.address;
    existing.city ||= record.city;
    existing.lat ??= record.lat;
    existing.lon ??= record.lon;
    existing.social = uniqBy(
      [...(existing.social || []), ...(record.social || [])],
      (value) => value.toLowerCase()
    );
    existing.evidence = uniqBy(
      [...(existing.evidence || []), ...(record.evidence || [])],
      (value) => value
    );
  }
  return [...byKey.values()].filter((record) => record.name);
}

function normalizeUrl(value) {
  const trimmed = compactWhitespace(value);
  if (!trimmed) return "";
  try {
    return new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return trimmed;
  }
}
