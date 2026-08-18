import type { Express, NextFunction, Request, Response } from "express";
import {
  getAgentCapability,
  getAgentCapabilityReliability,
  listAgentCapabilities,
} from "../../../application/agent-catalog.js";
import { sendApiError } from "../errors.js";
import type { RouteContext } from "../types.js";

function asyncRoute(
  handler: (req: Request, res: Response) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

function parseVersion(raw: string | undefined): number | undefined {
  const version = Number(raw);
  if (!Number.isInteger(version) || version < 1) return undefined;
  return version;
}

/** Read-only agent catalog. Safe on hosted Vercel (no Playwright). */
export function registerAgentCatalogRoutes(
  app: Express,
  ctx: RouteContext,
): void {
  app.get(
    "/api/agent/capabilities",
    asyncRoute(async (_req, res) => {
      res.json({ items: await listAgentCapabilities(ctx.rootDir) });
    }),
  );

  app.get(
    "/api/agent/capabilities/:capabilityId/versions/:version",
    asyncRoute(async (req, res) => {
      const version = parseVersion(req.params.version);
      if (!version) {
        sendApiError(res, 400, "VALIDATION_ERROR", "version must be a positive integer");
        return;
      }
      const descriptor = await getAgentCapability({
        capabilityId: req.params.capabilityId!,
        version,
        rootDir: ctx.rootDir,
      });
      res.json(descriptor);
    }),
  );

  app.get(
    "/api/agent/capabilities/:capabilityId/versions/:version/reliability",
    asyncRoute(async (req, res) => {
      const version = parseVersion(req.params.version);
      if (!version) {
        sendApiError(res, 400, "VALIDATION_ERROR", "version must be a positive integer");
        return;
      }
      const reliability = await getAgentCapabilityReliability({
        capabilityId: req.params.capabilityId!,
        version,
        rootDir: ctx.rootDir,
      });
      res.json(reliability);
    }),
  );
}
