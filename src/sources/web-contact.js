import { normalizeSourceRecord } from "../normalize/prospect.js";
import { uniqBy } from "../utils/text.js";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:(?:\+33|0)\s?[1-9](?:[\s.-]?\d{2}){4})/g;
const SOCIAL_RE =
  /https?:\/\/(?:www\.)?(?:facebook|instagram|linkedin)\.com\/[^\s"'<>]+/gi;

export async function enrichWithWebsiteContacts(records, { timeoutMs = 8000 } = {}) {
  const enriched = [];
  for (const record of records) {
    if (!record.website) {
      enriched.push(record);
      continue;
    }
    try {
      const extracted = await extractPublicContacts(record.website, timeoutMs);
      enriched.push(
        normalizeSourceRecord({
          ...record,
          email: record.email || extracted.emails[0],
          phone: record.phone || extracted.phones[0],
          social: [...(record.social || []), ...extracted.social],
          evidence: [
            ...(record.evidence || []),
            ...extracted.contactUrls.map((url) => `Page contact publique: ${url}`),
            extracted.emails.length ? "Email public detecte sur le site" : null,
            extracted.phones.length ? "Telephone public detecte sur le site" : null
          ].filter(Boolean)
        })
      );
    } catch (error) {
      enriched.push({
        ...record,
        evidence: [
          ...(record.evidence || []),
          `Site declare mais non verifie: ${error.message}`
        ]
      });
    }
  }
  return enriched;
}

async function extractPublicContacts(website, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(website, {
      signal: controller.signal,
      headers: { "user-agent": "Prospector/0.1 local contact audit" }
    });
    const html = await response.text();
    const emails = uniqBy(html.match(EMAIL_RE) || [], (value) => value.toLowerCase());
    const phones = uniqBy(html.match(PHONE_RE) || [], (value) => value.replace(/\D/g, ""));
    const social = uniqBy(html.match(SOCIAL_RE) || [], (value) => value.toLowerCase());
    const contactUrls = extractContactUrls(website, html);
    return { emails, phones, social, contactUrls };
  } finally {
    clearTimeout(timer);
  }
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
  return uniqBy(urls, (url) => url);
}
