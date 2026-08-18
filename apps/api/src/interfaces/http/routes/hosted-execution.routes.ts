import type { Express, Request, Response } from "express";
import { sendApiError } from "../errors.js";
import { HttpError } from "../../../core/errors.js";
import { probeHostedExecutionReady } from "../../../infrastructure/runtime.js";
import { registerDiscoveryRoutes } from "./discovery.routes.js";
import { registerReplayRoutes } from "./replay.routes.js";
import { registerAgentInvokeRoutes } from "./agent-invoke.routes.js";

const DETAILS = {
  hint: "Hosted execution needs BROWSERBASE_API_KEY and BLOB_READ_WRITE_TOKEN, or run pnpm --filter api dev locally.",
};

export function registerHostedExecutionRoutes(app: Express): void {
  async function unlessReady(
    req: Request,
    res: Response,
    next: () => void,
  ): Promise<void> {
    const ready = await probeHostedExecutionReady();
    if (ready) {
      next();
      return;
    }
    sendApiError(
      res,
      501,
      "LOCAL_RUNTIME_REQUIRED",
      "Live browser execution is not hosted. Start the local API on port 8787, or configure Browserbase.",
      DETAILS,
    );
  }

  app.post("/api/discovery", (req, res, next) => {
    void unlessReady(req, res, () => next());
  });
  app.get("/api/discovery/:runId", (req, res, next) => {
    void unlessReady(req, res, () => next());
  });
  app.post("/api/replay", (req, res, next) => {
    void unlessReady(req, res, () => next());
  });
  app.post(
    "/api/agent/capabilities/:capabilityId/versions/:version/invoke",
    (req, res, next) => {
      void unlessReady(req, res, () => next());
    },
  );

  app.get("/api/readiness/browser/session", async (_req, res) => {
    try {
      const { runHostedBrowserSessionProbe } = await import(
        "../../../application/browser-session-probe.js"
      );
      res.json(await runHostedBrowserSessionProbe());
    } catch (err) {
      if (err instanceof HttpError) {
        sendApiError(res, err.status, err.code, err.message, err.details);
        return;
      }
      sendApiError(
        res,
        500,
        "BROWSERBASE_READINESS_FAILED",
        "Browser session probe failed",
      );
    }
  });

  registerDiscoveryRoutes(app);
  registerReplayRoutes(app);
  registerAgentInvokeRoutes(app);
}
