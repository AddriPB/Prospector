import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const token = String(process.env.GITHUB_PAGES_TOKEN || "").trim();
const repository = String(
  process.env.GITHUB_REPOSITORY || "AddriPB/Prospector"
).trim();
const workflow = String(
  process.env.GITHUB_PAGES_WORKFLOW || "deploy-pages.yml"
).trim();
const tunnelLog = path.resolve(
  process.env.CLOUDFLARED_LOG_PATH ||
    "/home/adri/.pm2/logs/prospector-tunnel-error.log"
);

if (!token) throw new Error("GITHUB_PAGES_TOKEN is required");
if (!/^[^/]+\/[^/]+$/.test(repository)) {
  throw new Error("GITHUB_REPOSITORY must use owner/repository format");
}

const publicUrl = latestTunnelUrl(fs.readFileSync(tunnelLog, "utf8"));
if (!publicUrl) {
  throw new Error(`No trycloudflare.com URL found in ${tunnelLog}`);
}

await assertTunnelHealthy(publicUrl);

const variable = await github(
  `/repos/${repository}/actions/variables/VITE_PUBLIC_API_BASE`,
  { allowNotFound: true }
);

if (variable?.value === publicUrl) {
  process.exit(0);
}

if (variable) {
  await github(`/repos/${repository}/actions/variables/VITE_PUBLIC_API_BASE`, {
    method: "PATCH",
    body: { name: "VITE_PUBLIC_API_BASE", value: publicUrl }
  });
} else {
  await github(`/repos/${repository}/actions/variables`, {
    method: "POST",
    body: { name: "VITE_PUBLIC_API_BASE", value: publicUrl }
  });
}

await github(
  `/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
  {
    method: "POST",
    body: { ref: "main" }
  }
);

console.log("Public tunnel synchronized and GitHub Pages deployment requested.");

function latestTunnelUrl(log) {
  const matches =
    log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi) || [];
  return matches.at(-1) || "";
}

async function assertTunnelHealthy(publicUrl) {
  const response = await fetch(`${publicUrl}/api/health`, {
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) {
    throw new Error(`Tunnel healthcheck returned HTTP ${response.status}`);
  }
  const body = await response.json();
  if (body?.ok !== true) {
    throw new Error("Tunnel healthcheck did not return ok=true");
  }
}

async function github(
  endpoint,
  { method = "GET", body, allowNotFound = false } = {}
) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Prospector-Pi",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000)
  });

  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `GitHub API ${method} ${endpoint} returned HTTP ${response.status}: ${detail.slice(0, 300)}`
    );
  }
  if (response.status === 204) return null;
  return response.json();
}
