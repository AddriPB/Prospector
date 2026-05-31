import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCampaign } from "../campaign/runCampaign.js";
import { openDatabase, getDashboardState } from "../storage/database.js";
import { loginHandler, logoutHandler, meHandler, requireAuth } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

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
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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
        qualified: result.qualified
      });
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
