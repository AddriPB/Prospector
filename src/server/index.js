import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCampaign } from "../campaign/runCampaign.js";
import {
  openDatabase,
  getDashboardState,
  updateProspectOutreachStatus
} from "../storage/database.js";
import { OUTREACH_STATUSES } from "../outreachStatus.js";
import { loginHandler, logoutHandler, meHandler, requireAuth } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const OUTREACH_STATUS_SET = new Set(OUTREACH_STATUSES);

export async function startServer(campaign, runtimeConfig) {
  const app = express();
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
        res.json(getDashboardState(db, campaign.id));
      } finally {
        db.close();
      }
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/campaign/run", requireAuth, async (_req, res, next) => {
    try {
      const result = await runCampaign(campaign, runtimeConfig);
      res.json({
        ok: true,
        collected: result.collected,
        qualified: result.qualified,
        collectionErrors: result.collectionErrors
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/prospects/:id/status", requireAuth, async (req, res, next) => {
    const prospectId = Number(req.params.id);
    const outreachStatus = String(req.body?.outreachStatus || "");
    if (!Number.isInteger(prospectId) || prospectId <= 0) {
      return res.status(400).json({ error: "invalid_prospect_id" });
    }
    if (!OUTREACH_STATUS_SET.has(outreachStatus)) {
      return res.status(400).json({ error: "invalid_outreach_status" });
    }

    try {
      const db = await openDatabase(runtimeConfig.dbPath);
      try {
        updateProspectOutreachStatus(db, prospectId, outreachStatus);
        res.json({ ok: true, outreachStatus });
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
