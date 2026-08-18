import express, { type Express } from "express";
import path from "node:path";
import { resolveWebDist } from "../../../infrastructure/paths.js";
import { sendApiError } from "../errors.js";
import type { RouteContext } from "../types.js";

export function registerSpaRoutes(app: Express, ctx: RouteContext): void {
  const serveWeb = process.env.SERVE_WEB === "1";
  if (serveWeb) {
    const webDist = resolveWebDist(ctx.rootDir);
    app.use(express.static(webDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(webDist, "index.html"), (err) => {
        if (err) {
          sendApiError(
            res,
            404,
            "UI_NOT_BUILT",
            "SERVE_WEB=1 but apps/web/dist is missing",
            {
              hint: "pnpm --filter web build && SERVE_WEB=1 pnpm --filter api serve",
            },
          );
        }
      });
    });
  } else {
    app.get("/", (_req, res) => {
      res.json({
        service: "control-plane-api",
        ui: "http://127.0.0.1:5173",
        hint: "Open the React UI on :5173 only. This port is the API. Set SERVE_WEB=1 to serve a built SPA from this port instead.",
      });
    });
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      sendApiError(
        res,
        404,
        "NOT_FOUND",
        "API-only process — use the web UI on http://127.0.0.1:5173",
      );
    });
  }
}
