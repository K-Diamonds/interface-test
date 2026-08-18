import type { Express } from "express";
import { listRuns } from "../../../infrastructure/persistence/catalog.js";
import type { RouteContext } from "../types.js";

export function registerEvidenceRoutes(app: Express, ctx: RouteContext): void {
  app.get("/api/evidence", async (_req, res) => {
    res.json({ items: await listRuns(ctx.rootDir) });
  });
}
