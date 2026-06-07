import fs from "node:fs";
import path from "node:path";
import { ensureDir, resolveProjectPath } from "../config.js";

export function exportCampaign(campaign, rows, exportDir) {
  ensureDir(exportDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `${campaign.id}-${stamp}`;
  const csvPath = resolveProjectPath(path.join(exportDir, `${base}.csv`));
  const markdownPath = resolveProjectPath(path.join(exportDir, `${base}.md`));

  fs.writeFileSync(csvPath, toCsv(rows));
  fs.writeFileSync(markdownPath, toMarkdown(campaign, rows));

  return { csvPath, markdownPath };
}

export function toCsv(rows) {
  const headers = [
    "score",
    "besoin_web",
    "potentiel_commercial",
    "actionnabilite",
    "besoin_web_reasons",
    "potentiel_commercial_reasons",
    "actionnabilite_reasons",
    "name",
    "city",
    "address",
    "website",
    "web_audit",
    "web_audit_checked_at",
    "web_presence_kind",
    "web_audit_final_url",
    "site_accessible",
    "https",
    "title",
    "title_present",
    "meta_description",
    "meta_description_present",
    "viewport_mobile_present",
    "visible_contact",
    "visible_social",
    "contact_page_or_form",
    "exploitable_contacts",
    "besoin_web_proofs",
    "actionnabilite_proofs",
    "phone",
    "email",
    "social",
    "sources",
    "source_url",
    "confidence",
    "contactability",
    "qualification_state",
    "last_contact_channel",
    "excluded",
    "exclusion_reason",
    "score_reasons",
    "message"
  ];
  return [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => csvCell(cellValue(row, header)))
        .join(",")
    )
  ].join("\n");
}

export function toMarkdown(campaign, rows) {
  const topRows = rows.slice(0, campaign.targetCount);
  return [
    `# ${campaign.name}`,
    "",
    `Objectif: ${campaign.targetCount} prospects`,
    `Prospects exportes: ${topRows.length}`,
    "",
    "## Top prospects",
    "",
    ...topRows.map((row, index) =>
      [
        `### ${index + 1}. ${row.name} - Score : ${row.score}/100`,
        "",
        `- Besoin web: ${scorePart(row, "webNeed").score}/${scorePart(row, "webNeed").max}`,
        `  - Raisons: ${scoreReasons(row, "webNeed") || "n/a"}`,
        `  - Preuves: ${scoreProofs(row, "webNeed") || "n/a"}`,
        `- Potentiel commercial: ${scorePart(row, "commercialPotential").score}/${scorePart(row, "commercialPotential").max}`,
        `  - Raisons: ${scoreReasons(row, "commercialPotential") || "n/a"}`,
        `- Actionnabilite: ${scorePart(row, "actionability").score}/${scorePart(row, "actionability").max}`,
        `  - Raisons: ${scoreReasons(row, "actionability") || "n/a"}`,
        `  - Preuves: ${scoreProofs(row, "actionability") || "n/a"}`,
        `- Ville: ${row.city || "a confirmer"}`,
        `- Adresse: ${row.address || "a confirmer"}`,
        `- Site: ${row.website || "non identifie"}`,
        `- Audit web: ${formatWebAudit(row.webAudit)}`,
        `- Telephone: ${row.phone || "non identifie"}`,
        `- Email: ${row.email || "non identifie"}`,
        `- Sources: ${(row.sources || []).join(", ") || "n/a"}`,
        `- Source URL: ${row.source_url || row.sourceUrl || "n/a"}`,
        `- Confiance: ${row.confidence || "low"}`,
        `- Contactabilite: ${row.contactability || "none"}`,
        `- Qualification: ${row.qualification_state || row.qualificationState || "discovered"}`,
        `- Exclu: ${row.excluded ? `oui (${row.exclusionReason || row.exclusion_reason || "sans motif"})` : "non"}`,
        `- Raisons: ${(row.scoreReasons || []).join(" ")}`,
        "",
        "Message propose:",
        "",
        "```txt",
        row.message || "",
        "```",
        ""
      ].join("\n")
    )
  ].join("\n");
}

function cellValue(row, header) {
  if (header === "score") return `${row.score}/100`;
  if (header === "besoin_web") {
    const part = scorePart(row, "webNeed");
    return `${part.score}/${part.max}`;
  }
  if (header === "potentiel_commercial") {
    const part = scorePart(row, "commercialPotential");
    return `${part.score}/${part.max}`;
  }
  if (header === "actionnabilite") {
    const part = scorePart(row, "actionability");
    return `${part.score}/${part.max}`;
  }
  if (header === "besoin_web_reasons") return scoreReasons(row, "webNeed");
  if (header === "potentiel_commercial_reasons") {
    return scoreReasons(row, "commercialPotential");
  }
  if (header === "actionnabilite_reasons") return scoreReasons(row, "actionability");
  if (header === "social") return (row.social || []).join(" | ");
  if (header === "sources") return (row.sources || []).join(" | ");
  if (header === "source_url") return row.source_url || row.sourceUrl || "";
  if (header === "web_audit") return formatWebAudit(row.webAudit);
  if (header === "web_audit_checked_at") return row.webAudit?.checkedAt || "";
  if (header === "web_presence_kind") return row.webAudit?.webPresenceKind || "";
  if (header === "web_audit_final_url") return row.webAudit?.finalUrl || row.webAudit?.checkedUrl || "";
  if (header === "site_accessible") return boolCell(row.webAudit?.siteAccessible);
  if (header === "https") return boolCell(row.webAudit?.https);
  if (header === "title") return row.webAudit?.title || "";
  if (header === "title_present") return boolCell(row.webAudit?.titlePresent);
  if (header === "meta_description") return row.webAudit?.metaDescription || "";
  if (header === "meta_description_present") {
    return boolCell(row.webAudit?.metaDescriptionPresent);
  }
  if (header === "viewport_mobile_present") return boolCell(row.webAudit?.viewportPresent);
  if (header === "visible_contact") {
    return boolCell(
      row.webAudit?.visibleContact || row.webAudit?.visibleEmail || row.webAudit?.visiblePhone
    );
  }
  if (header === "contact_page_or_form") {
    return boolCell(row.webAudit?.contactPageOrFormDetected);
  }
  if (header === "visible_social") return boolCell(row.webAudit?.visibleSocial);
  if (header === "exploitable_contacts") return formatContacts(row.webAudit?.exploitableContacts);
  if (header === "besoin_web_proofs") return scoreProofs(row, "webNeed");
  if (header === "actionnabilite_proofs") return scoreProofs(row, "actionability");
  if (header === "qualification_state") {
    return row.qualification_state || row.qualificationState || "";
  }
  if (header === "last_contact_channel") {
    return row.last_contact_channel || row.lastContactChannel || "";
  }
  if (header === "excluded") return row.excluded ? "oui" : "non";
  if (header === "exclusion_reason") return row.exclusionReason || row.exclusion_reason || "";
  if (header === "score_reasons") return (row.scoreReasons || []).join(" | ");
  if (header === "message") return row.message || "";
  return row[header] ?? "";
}

function scorePart(row, key) {
  const defaults = {
    webNeed: { score: 0, max: 35 },
    commercialPotential: { score: 0, max: 25 },
    actionability: { score: 0, max: 25 }
  };
  const part = row.scoreBreakdown?.[key] || defaults[key];
  return {
    score: Math.max(0, Math.min(part.max || defaults[key].max, Number(part.score) || 0)),
    max: part.max || defaults[key].max
  };
}

function scoreReasons(row, key) {
  return (row.scoreBreakdown?.[key]?.reasons || []).join(" | ");
}

function scoreProofs(row, key) {
  return (row.scoreBreakdown?.[key]?.proofs || [])
    .map((proof) =>
      [proof.label, proof.status, proof.evidence, proof.sourceUrl, proof.checkedAt]
        .filter(Boolean)
        .join(" - ")
    )
    .join(" | ");
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function formatWebAudit(audit) {
  if (!audit || !Object.keys(audit).length) return "non verifie";
  if (!audit.sitePresent) {
    return [
      audit.webPresenceKind === "third_party_only" ? "presence tierce seulement" : "site officiel absent",
      audit.finalUrl || audit.checkedUrl || null,
      audit.checkedAt ? `verifie ${audit.checkedAt}` : null
    ]
      .filter(Boolean)
      .join(" | ");
  }
  const parts = [
    audit.webPresenceKind || null,
    audit.siteAccessible ? "accessible" : "inaccessible",
    audit.httpStatus ? `HTTP ${audit.httpStatus}` : null,
    audit.https ? "HTTPS" : "sans HTTPS",
    audit.title ? `title: ${audit.title}` : audit.titlePresent ? "title present" : "title absent",
    audit.metaDescription
      ? `meta: ${audit.metaDescription}`
      : audit.metaDescriptionPresent ? "meta description presente" : "meta description absente",
    audit.viewportPresent ? "viewport mobile present" : "viewport mobile absent",
    audit.visibleContact || audit.visibleEmail || audit.visiblePhone
      ? "contact visible"
      : "contact non visible",
    audit.contactPageOrFormDetected ? "page/formulaire contact detecte" : null,
    audit.socialOrDirectoryOnly ? "reseau social/annuaire seulement" : null,
    audit.checkedAt ? `verifie ${audit.checkedAt}` : null
  ].filter(Boolean);
  return parts.join(" | ");
}

function formatContacts(contacts = []) {
  return contacts.map((contact) => `${contact.type}:${contact.value}`).join(" | ");
}

function boolCell(value) {
  if (value === undefined || value === null) return "";
  return value ? "oui" : "non";
}
