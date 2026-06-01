import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfiguredCampaigns } from "../campaign/configuredCampaigns.js";
import { runCampaign } from "../campaign/runCampaign.js";
import {
  openDatabase,
  getDashboardState,
  getProspectPage,
  updateCommercialScript,
  updateProspectOutreachStatus,
  updateProspectRejectionReason
} from "../storage/database.js";
import { OUTREACH_STATUSES } from "../outreachStatus.js";
import { REJECTION_REASONS } from "../rejectionReasons.js";
import { loginHandler, logoutHandler, meHandler, requireAuth } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const OUTREACH_STATUS_SET = new Set(OUTREACH_STATUSES);
const REJECTION_REASON_SET = new Set(REJECTION_REASONS.map((reason) => reason.id));

export async function startServer(campaign, runtimeConfig) {
  const app = express();
  const configuredCampaigns = loadConfiguredCampaigns(campaign);
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && runtimeConfig.corsOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, app: "Prospector" });
  });

  app.get("/api/auth/me", meHandler);
  app.post("/api/auth/login", loginHandler);
  app.post("/api/auth/logout", logoutHandler);

  app.get("/api/dashboard", requireAuth, async (_req, res, next) => {
    try {
      const db = await openDatabase(runtimeConfig.dbPath);
      try {
        res.json(getDashboardState(db));
      } finally {
        db.close();
      }
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/prospects", requireAuth, async (req, res, next) => {
    try {
      const db = await openDatabase(runtimeConfig.dbPath);
      try {
        res.json(
          getProspectPage(db, {
            sector: String(req.query.sector || "all"),
            outreachStatus: String(req.query.outreachStatus || "all"),
            sort: String(req.query.sort || "priority"),
            limit: parseIntegerQuery(req.query.limit, 100),
            offset: parseIntegerQuery(req.query.offset, 0)
          })
        );
      } finally {
        db.close();
      }
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/campaign/run", requireAuth, async (_req, res, next) => {
    try {
      const results = [];
      for (const dashboardCampaign of configuredCampaigns) {
        results.push(await runCampaign(dashboardCampaign, runtimeConfig));
      }
      res.json({
        ok: true,
        collected: results.reduce((sum, result) => sum + result.collected, 0),
        qualified: results.reduce((sum, result) => sum + result.qualified, 0),
        collectionErrors: results.flatMap((result, index) =>
          result.collectionErrors.map((error) => ({
            ...error,
            campaign: configuredCampaigns[index].id
          }))
        ),
        campaigns: results.map((result, index) => ({
          id: configuredCampaigns[index].id,
          collected: result.collected,
          qualified: result.qualified
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/prospects/:id/status", requireAuth, async (req, res, next) => {
    const prospectId = Number(req.params.id);
    const outreachStatus = String(req.body?.outreachStatus || "");
    const rejectionReason = req.body?.rejectionReason ? String(req.body.rejectionReason) : "";
    if (!Number.isInteger(prospectId) || prospectId <= 0) {
      return res.status(400).json({ error: "invalid_prospect_id" });
    }
    if (!OUTREACH_STATUS_SET.has(outreachStatus)) {
      return res.status(400).json({ error: "invalid_outreach_status" });
    }
    if (outreachStatus === "Décliné" && !REJECTION_REASON_SET.has(rejectionReason)) {
      return res.status(400).json({ error: "rejection_reason_required" });
    }

    try {
      const db = await openDatabase(runtimeConfig.dbPath);
      try {
        updateProspectOutreachStatus(db, prospectId, outreachStatus, rejectionReason);
        res.json({
          ok: true,
          outreachStatus,
          rejectionReason: outreachStatus === "Décliné" ? rejectionReason : ""
        });
      } finally {
        db.close();
      }
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/prospects/:id/rejection-reason", requireAuth, async (req, res, next) => {
    const prospectId = Number(req.params.id);
    const rejectionReason = String(req.body?.rejectionReason || "");
    if (!Number.isInteger(prospectId) || prospectId <= 0) {
      return res.status(400).json({ error: "invalid_prospect_id" });
    }
    if (rejectionReason && !REJECTION_REASON_SET.has(rejectionReason)) {
      return res.status(400).json({ error: "invalid_rejection_reason" });
    }

    try {
      const db = await openDatabase(runtimeConfig.dbPath);
      try {
        updateProspectRejectionReason(db, prospectId, rejectionReason);
        res.json({ ok: true, rejectionReason });
      } finally {
        db.close();
      }
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/commercial-scripts/:sectorId", requireAuth, async (req, res, next) => {
    try {
      const db = await openDatabase(runtimeConfig.dbPath);
      try {
        const script = updateCommercialScript(db, String(req.params.sectorId || ""), req.body || {});
        res.json({ ok: true, script });
      } finally {
        db.close();
      }
    } catch (error) {
      next(error);
    }
  });

  app.use(express.static(path.join(projectRoot, "dist")));
  app.use((_req, res) => {
    res.sendFile(path.join(projectRoot, "dist", "index.html"));
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: "internal_error" });
  });

  return new Promise((resolve) => {
    const server = app.listen(runtimeConfig.port, runtimeConfig.host, () => {
      console.log(
        `[prospector] API/dashboard http://${runtimeConfig.host}:${runtimeConfig.port}`
      );
      resolve(server);
    });
  });
}

function parseIntegerQuery(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}
