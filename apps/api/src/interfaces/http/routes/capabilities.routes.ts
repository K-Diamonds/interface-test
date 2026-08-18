import type { Express } from "express";
import {
  listCapabilities,
  loadCapabilityArtifact,
} from "../../../infrastructure/persistence/catalog.js";
import { publicContractInputs } from "../../../core/capability/agent-descriptor.js";
import { sendApiError } from "../errors.js";
import type { RouteContext } from "../types.js";

export function registerCapabilitiesRoutes(
  app: Express,
  ctx: RouteContext,
): void {
  app.get("/api/capabilities", async (_req, res) => {
    res.json({ items: await listCapabilities(ctx.rootDir) });
  });

  app.get("/api/capabilities/:id", async (req, res) => {
    const items = await listCapabilities(ctx.rootDir);
    const item = items.find((c) => c.id === req.params.id);
    if (!item) {
      sendApiError(res, 404, "NOT_FOUND", "Capability not found");
      return;
    }
    res.json(item);
  });

  app.get("/api/capabilities/:id/versions/:version", async (req, res) => {
    const version = Number(req.params.version);
    const artifact = await loadCapabilityArtifact(
      req.params.id!,
      version,
      ctx.rootDir,
    );
    if (!artifact) {
      sendApiError(res, 404, "NOT_FOUND", "Capability version not found");
      return;
    }
    if (!ctx.hosted) {
      res.json(artifact);
      return;
    }
    res.json({
      ...artifact,
      contract: {
        ...artifact.contract,
        inputs: publicContractInputs(artifact.contract.inputs),
      },
    });
  });
}
