import express, { type Express } from "express";
import cors from "cors";
import { resolveRepoRoot } from "../../infrastructure/paths.js";
import { requestContextMiddleware } from "./middleware/request-context.js";
import { errorHandler } from "./middleware/error-handler.js";
import type { ControlPlaneOptions, RouteContext } from "./types.js";
import { registerHealthRoutes } from "./routes/health.routes.js";
import { registerEvidenceRoutes } from "./routes/evidence.routes.js";
import { registerPoliciesRoutes } from "./routes/policies.routes.js";
import { registerCapabilitiesRoutes } from "./routes/capabilities.routes.js";
import { registerAgentCatalogRoutes } from "./routes/agent.routes.js";
import { registerRunsRoutes } from "./routes/runs.routes.js";
import { registerInterventionRoutes } from "./routes/interventions.routes.js";
import { registerSpaRoutes } from "./routes/spa.routes.js";

function corsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  if (!origin) {
    callback(null, true);
    return;
  }
  const allowed =
    origin === "http://127.0.0.1:5173" ||
    origin === "http://localhost:5173" ||
    origin.endsWith(".vercel.app");
  callback(null, allowed);
}

/**
 * Catalog control-plane app. Does not import Playwright or start jobs.
 */
export function createControlPlaneApp(
  options: ControlPlaneOptions = {},
  registerExecution?: (app: Express) => void,
): Express {
  const rootDir = options.rootDir ?? resolveRepoRoot();
  const ctx: RouteContext = { rootDir, hosted: options.hosted };
  const app = express();

  app.use(requestContextMiddleware);
  app.use(cors({ origin: corsOrigin, credentials: false }));
  app.use(express.json({ limit: "1mb" }));

  registerHealthRoutes(app, ctx);
  registerEvidenceRoutes(app, ctx);
  registerPoliciesRoutes(app, ctx);
  registerCapabilitiesRoutes(app, ctx);
  registerAgentCatalogRoutes(app, ctx);
  registerRunsRoutes(app, ctx);
  registerInterventionRoutes(app, ctx);
  registerExecution?.(app);
  registerSpaRoutes(app, ctx);

  app.use(errorHandler);
  return app;
}
