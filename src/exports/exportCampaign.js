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
    "name",
    "city",
    "address",
    "website",
    "phone",
    "email",
    "social",
    "sources",
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
        `### ${index + 1}. ${row.name} - ${row.score}/100`,
        "",
        `- Ville: ${row.city || "a confirmer"}`,
        `- Adresse: ${row.address || "a confirmer"}`,
        `- Site: ${row.website || "non identifie"}`,
        `- Telephone: ${row.phone || "non identifie"}`,
        `- Email: ${row.email || "non identifie"}`,
        `- Sources: ${(row.sources || []).join(", ") || "n/a"}`,
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
  if (header === "social") return (row.social || []).join(" | ");
  if (header === "sources") return (row.sources || []).join(" | ");
  if (header === "score_reasons") return (row.scoreReasons || []).join(" | ");
  if (header === "message") return row.message || "";
  return row[header] ?? "";
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
