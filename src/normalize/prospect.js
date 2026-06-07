import { stableHash } from "../utils/hash.js";
import { compactWhitespace, normalizeKey, uniqBy } from "../utils/text.js";
import { normalizeAudit } from "../web-audit/auditWebsite.js";

const PRIORITY_SCORE_THRESHOLD = 70;

export function normalizeSourceRecord(input) {
  const name = compactWhitespace(input.name);
  const address = compactWhitespace(input.address);
  const city = compactWhitespace(input.city);
  const website = normalizeUrl(input.website);
  const phone = compactWhitespace(input.phone);
  const email = compactWhitespace(input.email).toLowerCase();
  const social = uniqBy(input.social || [], (value) => String(value).toLowerCase());
  const source = input.source || "manual";
  const sourceId = compactWhitespace(input.sourceId);
  const sourceUrl = normalizeUrl(input.sourceUrl || input.url);
  const collectedAt = input.collectedAt || new Date().toISOString();
  const evidence = uniqBy(input.evidence || [], (value) => value);
  const webAudit = normalizeWebAudit(input.webAudit);
  const keyBase = [name, city || address].filter(Boolean).join("|");
  const baseRecord = {
    name,
    address,
    city,
    website,
    phone,
    email,
    social,
    evidence
  };
  const confidence = input.confidence || computeConfidence(baseRecord);
  const contactability = input.contactability || computeContactability(baseRecord);
  const qualificationState =
    input.qualificationState ||
    computeQualificationState({ ...baseRecord, confidence, contactability });

  return {
    externalKey: sourceId
      ? `${source}:${sourceId}`
      : `${source}:${stableHash(keyBase || website || email || phone)}`,
    dedupeKey: bestDedupeKey({
      source,
      sourceId,
      name,
      address,
      city,
      website,
      phone,
      email
    }),
    source,
    sourceId,
    sourceUrl,
    collectedAt,
    name,
    address,
    city,
    lat: input.lat ?? null,
    lon: input.lon ?? null,
    website,
    phone,
    email,
    social,
    webAudit,
    evidence,
    confidence,
    contactability,
    qualificationState,
    sourceRecords: uniqSourceRecords([
      ...(input.sourceRecords || []),
      {
        source,
        sourceId,
        sourceUrl,
        collectedAt,
        confidence,
        contactability,
        qualificationState
      }
    ]),
    sources: uniqBy([...(input.sources || []), source], (value) => value),
    webAudit,
    raw: input.raw || {}
  };
}

export function mergeDuplicateProspects(records) {
  const byGroupKey = new Map();
  const candidateIndex = new Map();

  for (const record of records) {
    const candidates = computeDedupeCandidates(record);
    const groupKey = candidates
      .map((candidate) => candidate.key)
      .find((key) => candidateIndex.has(key));
    const existing = groupKey ? byGroupKey.get(candidateIndex.get(groupKey)) : null;

    if (!existing) {
      const primaryKey = record.dedupeKey || candidates[0]?.key || record.externalKey;
      byGroupKey.set(primaryKey, { ...record });
      for (const candidate of candidates) candidateIndex.set(candidate.key, primaryKey);
      continue;
    }

    mergeInto(existing, record);
    const existingKey = existing.dedupeKey;
    for (const candidate of computeDedupeCandidates(existing)) {
      candidateIndex.set(candidate.key, existingKey);
    }
    for (const candidate of candidates) candidateIndex.set(candidate.key, existingKey);
  }
  return [...byGroupKey.values()]
    .filter((record) => record.name)
    .map(refreshProspectQuality);
}

export function computeDedupeCandidates(record) {
  const name = normalizeKey(record.name);
  const city = normalizeKey(record.city);
  const address = normalizeKey(record.address);
  return [
    record.source && record.sourceId
      ? { type: "sourceId", key: `source:${record.source}:${normalizeKey(record.sourceId)}` }
      : null,
    normalizePhone(record.phone)
      ? { type: "phone", key: `phone:${normalizePhone(record.phone)}` }
      : null,
    normalizeDomain(record.website)
      ? { type: "domain", key: `domain:${normalizeDomain(record.website)}` }
      : null,
    normalizeEmail(record.email)
      ? { type: "email", key: `email:${normalizeEmail(record.email)}` }
      : null,
    name && (city || address)
      ? { type: "nameLocation", key: `name-location:${name}:${city || address}` }
      : null
  ].filter(Boolean);
}

export function normalizePhone(value) {
  const trimmed = compactWhitespace(value);
  if (!trimmed) return "";
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+33")) return `+33${digits.slice(3).replace(/\D/g, "")}`;
  if (digits.startsWith("0033")) return `+33${digits.slice(4).replace(/\D/g, "")}`;
  const numeric = digits.replace(/\D/g, "");
  if (numeric.length === 10 && numeric.startsWith("0")) return `+33${numeric.slice(1)}`;
  return numeric;
}

export function normalizeDomain(value) {
  const url = normalizeUrl(value);
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return normalizeKey(url.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, ""));
  }
}

export function computeConfidence(record) {
  const hasName = Boolean(compactWhitespace(record.name));
  const hasLocation = Boolean(compactWhitespace(record.city) || compactWhitespace(record.address));
  const signalCount = (record.evidence || []).filter(Boolean).length + contactCount(record);
  if (hasName && hasLocation && signalCount >= 2) return "high";
  if (hasName && (record.evidence || []).filter(Boolean).length >= 1) return "medium";
  return "low";
}

export function computeContactability(record) {
  const count = contactCount(record);
  if (count === 0) return "none";
  if (record.phone || record.email || count > 1) return "good";
  return "weak";
}

export function computeQualificationState(record, { score } = {}) {
  const contactability = record.contactability || computeContactability(record);
  const qualified = hasQualificationSignals(record);
  const contactable = qualified && ["weak", "good"].includes(contactability);
  if (contactable && Number(score || 0) >= PRIORITY_SCORE_THRESHOLD) return "priority";
  if (contactable) return "contactable";
  if (qualified) return "qualified";
  return "discovered";
}

function mergeInto(existing, record) {
  existing.sources = uniqBy(
    [...(existing.sources || []), ...(record.sources || [record.source])],
    (value) => value
  );
  existing.website ||= record.website;
  existing.phone ||= record.phone;
  existing.email ||= record.email;
  existing.address ||= record.address;
  existing.city ||= record.city;
  existing.sourceUrl ||= record.sourceUrl;
  existing.collectedAt ||= record.collectedAt;
  existing.lat ??= record.lat;
  existing.lon ??= record.lon;
  existing.social = uniqBy(
    [...(existing.social || []), ...(record.social || [])],
    (value) => value.toLowerCase()
  );
  existing.webAudit = mergeWebAudit(existing.webAudit, record.webAudit);
  existing.evidence = uniqBy(
    [...(existing.evidence || []), ...(record.evidence || [])],
    (value) => value
  );
  existing.sourceRecords = uniqSourceRecords([
    ...(existing.sourceRecords || []),
    ...(record.sourceRecords || [])
  ]);
  existing.raw = {
    ...(existing.raw || {}),
    merged: [...(existing.raw?.merged || []), record.raw || {}]
  };
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

function normalizeWebAudit(value) {
  if (!value || typeof value !== "object") return null;
  return normalizeAudit(value);
}

function mergeWebAudit(existing, incoming) {
  const current = normalizeWebAudit(existing);
  const next = normalizeWebAudit(incoming);
  if (!current) return next;
  if (!next) return current;
  return String(next.checkedAt || "") >= String(current.checkedAt || "") ? next : current;
}

function bestDedupeKey(record) {
  const candidates = computeDedupeCandidates(record).filter(
    (candidate) => candidate.type !== "sourceId"
  );
  return candidates[0]?.key || normalizeKey(record.sourceId || record.website || record.name || "");
}

function normalizeEmail(value) {
  return compactWhitespace(value).toLowerCase();
}

function contactCount(record) {
  return (
    [record.phone, record.email, record.website].filter(Boolean).length +
    (record.social?.length || 0)
  );
}

function hasQualificationSignals(record) {
  return Boolean(
    compactWhitespace(record.name) &&
      (compactWhitespace(record.city) || compactWhitespace(record.address)) &&
      ((record.evidence || []).length || record.confidence === "high")
  );
}

function refreshProspectQuality(record) {
  const confidence = computeConfidence(record);
  const contactability = computeContactability(record);
  const qualificationState = computeQualificationState({
    ...record,
    confidence,
    contactability
  });
  return { ...record, confidence, contactability, qualificationState };
}

function uniqSourceRecords(records) {
  return uniqBy(
    records.filter(Boolean).map((record) => ({
      source: record.source,
      sourceId: record.sourceId || "",
      sourceUrl: record.sourceUrl || "",
      collectedAt: record.collectedAt || "",
      confidence: record.confidence || "low",
      contactability: record.contactability || "none",
      qualificationState: record.qualificationState || "discovered"
    })),
    (record) => [record.source, record.sourceId, record.sourceUrl].join("|")
  );
}
