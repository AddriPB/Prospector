import fs from "node:fs";
import path from "node:path";
import { ensureDir, resolveProjectPath } from "../config.js";
import { stableHash } from "../utils/hash.js";
import { uniqBy } from "../utils/text.js";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:(?:\+33|0)\s?[1-9](?:[\s.-]?\d{2}){4})/g;
const SOCIAL_RE =
  /https?:\/\/(?:www\.)?(?:facebook|instagram|linkedin)\.com\/[^\s"'<>]+/gi;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const META_RE = /<meta\b[^>]*>/gi;
const VIEWPORT_RE = /<meta[^>]+name=["']viewport["'][^>]*>/i;
const FORM_RE = /<form\b/i;
const THIRD_PARTY_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "pagesjaunes.fr",
  "google.com",
  "google.fr",
  "maps.google.",
  "g.page",
  "goo.gl",
  "tripadvisor.",
  "thefork.",
  "ubereats.",
  "deliveroo.",
  "just-eat.",
  "mappy.",
  "yelp.",
  "allo-voisins.",
  "starofservice.",
  "meilleursartisans."
];

export async function auditWebsite(website, options = {}) {
  const checkedUrl = normalizeUrl(website);
  if (!checkedUrl) return { audit: buildMissingWebsiteAudit(), cacheHit: false };

  if (isSocialOrDirectoryUrl(checkedUrl)) {
    return {
      audit: buildThirdPartyOnlyAudit(checkedUrl),
      cacheHit: false
    };
  }

  const cachePath = webAuditCachePath(checkedUrl, options.cacheDir);
  if (cachePath && !options.force && fs.existsSync(cachePath)) {
    return {
      audit: normalizeAudit(JSON.parse(fs.readFileSync(cachePath, "utf8"))),
      cacheHit: true
    };
  }

  let audit;
  try {
    audit = await fetchWebsiteAudit(checkedUrl, options.timeoutMs || 3000);
  } catch (error) {
    audit = buildFailedWebsiteAudit(checkedUrl, error.message);
  }

  if (cachePath) {
    ensureDir(path.dirname(cachePath));
    fs.writeFileSync(cachePath, JSON.stringify(audit, null, 2));
  }
  return { audit, cacheHit: false };
}

export async function extractPublicContacts(website, options = {}) {
  const { audit, cacheHit } = await auditWebsite(website, options);
  return {
    emails: audit.exploitableContacts?.filter((contact) => contact.type === "email").map((contact) => contact.value) || [],
    phones: audit.exploitableContacts?.filter((contact) => contact.type === "phone").map((contact) => contact.value) || [],
    social: audit.exploitableContacts?.filter((contact) => contact.type === "social").map((contact) => contact.value) || [],
    contactUrls:
      audit.exploitableContacts
        ?.filter((contact) => contact.type === "form")
        .map((contact) => contact.value) || [],
    audit,
    cacheHit
  };
}

export function buildMissingWebsiteAudit() {
  return normalizeAudit({
    checkedAt: new Date().toISOString(),
    sitePresent: false,
    siteAccessible: false,
    webPresenceKind: "missing_official_site",
    https: false,
    titlePresent: false,
    metaDescriptionPresent: false,
    viewportPresent: false,
    visibleEmail: false,
    visiblePhone: false,
    visibleContact: false,
    visibleSocial: false,
    contactPageOrFormDetected: false,
    exploitableContacts: [],
    socialOrDirectoryOnly: false,
    status: "missing"
  });
}

export function webAuditEvidence(audit) {
  const normalized = normalizeAudit(audit);
  if (!normalized.sitePresent) {
    if (normalized.webPresenceKind === "third_party_only") {
      return [
        `Presence web limitee a une plateforme tierce: ${normalized.checkedUrl || normalized.finalUrl || "source tierce"}.`,
        "Aucun site officiel identifie."
      ];
    }
    return ["Aucun site web officiel identifie."];
  }
  return [
    normalized.siteAccessible
      ? `Site officiel accessible (${normalized.httpStatus || "HTTP verifie"}).`
      : `Site officiel casse ou inaccessible${normalized.httpStatus ? ` (HTTP ${normalized.httpStatus})` : ""}.`,
    normalized.https ? "HTTPS detecte." : "Site sans HTTPS.",
    normalized.title ? `Title HTML: ${normalized.title}` : "Title HTML absent.",
    normalized.metaDescription
      ? `Meta description: ${normalized.metaDescription}`
      : "Meta description absente.",
    normalized.viewportPresent ? "Viewport mobile present." : "Site non mobile ou viewport absent.",
    normalized.visibleContact ? "Contact visible sur le site." : "Email/telephone/contact non visible sur le site.",
    normalized.contactPageOrFormDetected ? "Page contact ou formulaire detecte." : null
  ].filter(Boolean);
}

export function normalizeAudit(value) {
  if (!value || typeof value !== "object") return buildMissingWebsiteAudit();
  const exploitableContacts = Array.isArray(value.exploitableContacts)
    ? value.exploitableContacts.filter((contact) => contact?.type && contact?.value)
    : [];
  const title = compactText(value.title || "");
  const metaDescription = compactText(value.metaDescription || "");
  const socialOrDirectoryOnly = Boolean(value.socialOrDirectoryOnly);
  const siteAccessible = Boolean(value.siteAccessible);
  const sitePresent =
    value.sitePresent === undefined
      ? Boolean(!socialOrDirectoryOnly && value.status !== "missing" && value.webPresenceKind !== "third_party_only")
      : Boolean(value.sitePresent);
  const webPresenceKind =
    value.webPresenceKind ||
    (socialOrDirectoryOnly
      ? "third_party_only"
      : sitePresent && siteAccessible
        ? "official_site"
        : sitePresent
          ? "inaccessible"
          : "missing_official_site");
  const visibleEmail = Boolean(value.visibleEmail || exploitableContacts.some((contact) => contact.type === "email"));
  const visiblePhone = Boolean(value.visiblePhone || exploitableContacts.some((contact) => contact.type === "phone"));
  const visibleSocial = Boolean(value.visibleSocial || exploitableContacts.some((contact) => contact.type === "social"));
  const contactPageOrFormDetected = Boolean(
    value.contactPageOrFormDetected || exploitableContacts.some((contact) => contact.type === "form")
  );

  return {
    ...value,
    checkedAt: value.checkedAt || new Date().toISOString(),
    checkedUrl: value.checkedUrl || "",
    finalUrl: value.finalUrl || value.checkedUrl || "",
    sitePresent: webPresenceKind === "third_party_only" ? false : sitePresent,
    siteAccessible,
    httpStatus: value.httpStatus == null ? null : Number(value.httpStatus),
    webPresenceKind,
    https: Boolean(value.https),
    title,
    metaDescription,
    titlePresent: Boolean(value.titlePresent || title),
    metaDescriptionPresent: Boolean(value.metaDescriptionPresent || metaDescription),
    viewportPresent: Boolean(value.viewportPresent),
    visibleEmail,
    visiblePhone,
    visibleContact: Boolean(value.visibleContact || visibleEmail || visiblePhone),
    visibleSocial,
    contactPageOrFormDetected,
    exploitableContacts,
    socialOrDirectoryOnly,
    status: value.status || (siteAccessible ? "accessible" : "inaccessible")
  };
}

export function isSocialOrDirectoryUrl(url) {
  const normalized = String(url || "").toLowerCase();
  return THIRD_PARTY_DOMAINS.some((domain) => normalized.includes(domain));
}

async function fetchWebsiteAudit(checkedUrl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(checkedUrl, {
      signal: controller.signal,
      headers: { "user-agent": "Prospector/0.1 local web audit" },
      redirect: "follow"
    });
    const html = await response.text();
    return buildWebsiteAudit(checkedUrl, response, html, extractHtmlSignals(response.url || checkedUrl, html));
  } finally {
    clearTimeout(timer);
  }
}

function buildWebsiteAudit(checkedUrl, response, html, extracted) {
  const finalUrl = response.url || checkedUrl;
  const siteAccessible = response.ok;
  return normalizeAudit({
    checkedAt: new Date().toISOString(),
    checkedUrl,
    finalUrl,
    sitePresent: true,
    siteAccessible,
    httpStatus: response.status,
    webPresenceKind: siteAccessible ? "official_site" : "inaccessible",
    https: /^https:\/\//i.test(finalUrl),
    title: extracted.title,
    metaDescription: extracted.metaDescription,
    titlePresent: Boolean(extracted.title),
    metaDescriptionPresent: Boolean(extracted.metaDescription),
    viewportPresent: VIEWPORT_RE.test(html),
    visibleEmail: extracted.emails.length > 0,
    visiblePhone: extracted.phones.length > 0,
    visibleContact: extracted.emails.length > 0 || extracted.phones.length > 0,
    visibleSocial: extracted.social.length > 0,
    contactPageOrFormDetected: Boolean(extracted.contactUrls.length || FORM_RE.test(html)),
    exploitableContacts: [
      ...extracted.emails.map((value) => ({ type: "email", value })),
      ...extracted.phones.map((value) => ({ type: "phone", value })),
      ...extracted.social.map((value) => ({ type: "social", value })),
      ...extracted.contactUrls.map((value) => ({ type: "form", value }))
    ],
    socialOrDirectoryOnly: false,
    status: siteAccessible ? "accessible" : "inaccessible"
  });
}

function buildFailedWebsiteAudit(checkedUrl, errorMessage) {
  return normalizeAudit({
    checkedAt: new Date().toISOString(),
    checkedUrl,
    finalUrl: checkedUrl,
    sitePresent: true,
    siteAccessible: false,
    webPresenceKind: "inaccessible",
    https: /^https:\/\//i.test(checkedUrl),
    titlePresent: false,
    metaDescriptionPresent: false,
    viewportPresent: false,
    visibleEmail: false,
    visiblePhone: false,
    visibleContact: false,
    visibleSocial: false,
    contactPageOrFormDetected: false,
    exploitableContacts: [],
    socialOrDirectoryOnly: false,
    status: "inaccessible",
    error: String(errorMessage || "").slice(0, 160)
  });
}

function buildThirdPartyOnlyAudit(checkedUrl) {
  return normalizeAudit({
    checkedAt: new Date().toISOString(),
    checkedUrl,
    finalUrl: checkedUrl,
    sitePresent: false,
    siteAccessible: true,
    webPresenceKind: "third_party_only",
    https: /^https:\/\//i.test(checkedUrl),
    visibleSocial: true,
    exploitableContacts: [{ type: "social", value: checkedUrl }],
    socialOrDirectoryOnly: true,
    status: "third_party_only"
  });
}

function extractHtmlSignals(baseUrl, html) {
  return {
    title: compactText(TITLE_RE.exec(html)?.[1] || "").slice(0, 180),
    metaDescription: extractMetaDescription(html).slice(0, 260),
    emails: uniqBy(html.match(EMAIL_RE) || [], (value) => value.toLowerCase()),
    phones: uniqBy(html.match(PHONE_RE) || [], (value) => value.replace(/\D/g, "")),
    social: uniqBy(html.match(SOCIAL_RE) || [], (value) => value.toLowerCase()),
    contactUrls: extractContactUrls(baseUrl, html)
  };
}

function extractMetaDescription(html) {
  for (const [tag] of html.matchAll(META_RE)) {
    const name = attrValue(tag, "name").toLowerCase();
    const property = attrValue(tag, "property").toLowerCase();
    if (name !== "description" && property !== "og:description") continue;
    return compactText(attrValue(tag, "content"));
  }
  return "";
}

function extractContactUrls(baseUrl, html) {
  const urls = [];
  const linkRe = /href=["']([^"']*(?:contact|devis|rendez-vous|rdv)[^"']*)["']/gi;
  for (const match of html.matchAll(linkRe)) {
    try {
      urls.push(new URL(match[1], baseUrl).toString());
    } catch {
      // Ignore malformed public links.
    }
  }
  return uniqBy(urls, (url) => url).slice(0, 10);
}

function attrValue(tag, attrName) {
  const re = new RegExp(`${attrName}=["']([^"']*)["']`, "i");
  return re.exec(tag)?.[1] || "";
}

function webAuditCachePath(checkedUrl, cacheDir) {
  if (!cacheDir) return null;
  return resolveProjectPath(path.join(cacheDir, "web-audit", `${stableHash(checkedUrl)}.json`));
}

function normalizeUrl(value) {
  const trimmed = compactText(value);
  if (!trimmed) return "";
  try {
    return new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return trimmed;
  }
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
