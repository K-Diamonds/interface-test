import type { Express } from "express";
import {
  listCapabilities,
  loadCapabilityArtifact,
} from "../../../infrastructure/persistence/catalog.js";
import type { RouteContext } from "../types.js";

export function registerPoliciesRoutes(app: Express, ctx: RouteContext): void {
  app.get("/api/policies", async (_req, res) => {
    const caps = await listCapabilities(ctx.rootDir);
    const items = [];
    for (const c of caps) {
      const artifact = await loadCapabilityArtifact(
        c.id,
        c.latestVersion,
        ctx.rootDir,
      );
      if (!artifact) continue;
      const policy = artifact.policy as {
        allowedDomains?: string[];
        maxSteps?: number;
        riskyActionBehavior?: string;
      };
      items.push({
        capabilityId: c.id,
        version: c.latestVersion,
        allowedDomains: policy.allowedDomains ?? [],
        maxSteps: policy.maxSteps,
        riskyActionBehavior: policy.riskyActionBehavior,
      });
    }
    res.json({ items });
  });
}
