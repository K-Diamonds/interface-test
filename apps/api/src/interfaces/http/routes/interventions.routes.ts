import type { Express, Response } from "express";
import { mapUnknownError, sendApiError } from "../errors.js";
import type { RouteContext } from "../types.js";
import {
  abortIntervention,
  executeHumanAction,
  getLiveIntervention,
  interventionLocation,
  listInterventions,
  observeIntervention,
  resumeIntervention,
  screenshotIntervention,
  takeControl,
} from "../../../application/interventions/service.js";
import {
  abortHostedIntervention,
  getHostedIntervention,
  resumeHostedIntervention,
} from "../../../application/interventions/hosted.js";
import { interventionRegistry } from "../../../core/intervention/registry.js";
import { probeHostedExecutionReady } from "../../../infrastructure/runtime.js";

function handleRouteError(res: Response, err: unknown): void {
  const mapped = mapUnknownError(err);
  sendApiError(res, mapped.status, mapped.code, mapped.message, mapped.details);
}

async function hostedLiveViewOnly(
  id: string,
  ctx: RouteContext,
): Promise<boolean> {
  return Boolean(
    ctx.hosted &&
    !interventionRegistry.get(id) &&
    (await probeHostedExecutionReady())
  );
}

export function registerInterventionRoutes(
  app: Express,
  ctx: RouteContext,
): void {
  app.get("/api/interventions", async (_req, res) => {
    try {
      res.json(await listInterventions(ctx.rootDir));
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.get("/api/interventions/:id", async (req, res) => {
    try {
      const id = req.params.id!;
      if (interventionRegistry.get(id)) {
        res.json(getLiveIntervention(id));
        return;
      }
      if (ctx.hosted && (await probeHostedExecutionReady())) {
        res.json(await getHostedIntervention(id));
        return;
      }
      if (ctx.hosted) {
        sendApiError(
          res,
          501,
          "LOCAL_RUNTIME_REQUIRED",
          "Live browser execution is not hosted. Start the local API on port 8787.",
        );
        return;
      }
      res.json(getLiveIntervention(id));
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.get("/api/interventions/:id/observation", async (req, res) => {
    try {
      if (await hostedLiveViewOnly(req.params.id!, ctx)) {
        sendApiError(
          res,
          409,
          "LIVE_VIEW_CONTROL_REQUIRED",
          "Hosted intervention control is only available through Browserbase Live View.",
        );
        return;
      }
      if (ctx.hosted && !interventionRegistry.get(req.params.id!) && !(await probeHostedExecutionReady())) {
        sendApiError(
          res,
          501,
          "LOCAL_RUNTIME_REQUIRED",
          "Live browser execution is not hosted. Start the local API on port 8787.",
        );
        return;
      }
      res.json(await observeIntervention(req.params.id!));
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.get("/api/interventions/:id/screenshot", async (req, res) => {
    try {
      if (await hostedLiveViewOnly(req.params.id!, ctx)) {
        sendApiError(
          res,
          409,
          "LIVE_VIEW_CONTROL_REQUIRED",
          "Hosted intervention control is only available through Browserbase Live View.",
        );
        return;
      }
      const buf = await screenshotIntervention(req.params.id!);
      res.setHeader("Content-Type", "image/png");
      res.send(buf);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.get("/api/interventions/:id/location", async (req, res) => {
    try {
      if (await hostedLiveViewOnly(req.params.id!, ctx)) {
        sendApiError(
          res,
          409,
          "LIVE_VIEW_CONTROL_REQUIRED",
          "Hosted intervention control is only available through Browserbase Live View.",
        );
        return;
      }
      res.json(await interventionLocation(req.params.id!));
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post("/api/interventions/:id/take-control", async (req, res) => {
    try {
      const id = req.params.id!;
      if (interventionRegistry.get(id)) {
        res.json(takeControl(id));
        return;
      }
      if (ctx.hosted && (await probeHostedExecutionReady())) {
        const detail = await getHostedIntervention(id);
        res.json({
          ok: true,
          controller: detail.controller,
          state: detail.state,
          liveViewUrl: detail.liveViewUrl,
        });
        return;
      }
      if (ctx.hosted) {
        sendApiError(
          res,
          501,
          "LOCAL_RUNTIME_REQUIRED",
          "Live browser execution is not hosted. Start the local API on port 8787.",
        );
        return;
      }
      res.json(takeControl(id));
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post("/api/interventions/:id/actions", async (req, res) => {
    try {
      if (await hostedLiveViewOnly(req.params.id!, ctx)) {
        sendApiError(
          res,
          409,
          "LIVE_VIEW_CONTROL_REQUIRED",
          "Hosted intervention control is only available through Browserbase Live View.",
        );
        return;
      }
      res.json(await executeHumanAction(req.params.id!, req.body));
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post("/api/interventions/:id/resume", async (req, res) => {
    try {
      const id = req.params.id!;
      if (interventionRegistry.get(id)) {
        res.json(resumeIntervention(id));
        return;
      }
      if (ctx.hosted && (await probeHostedExecutionReady())) {
        res.json(await resumeHostedIntervention(id));
        return;
      }
      if (ctx.hosted) {
        sendApiError(
          res,
          501,
          "LOCAL_RUNTIME_REQUIRED",
          "Live browser execution is not hosted. Start the local API on port 8787.",
        );
        return;
      }
      res.json(resumeIntervention(id));
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post("/api/interventions/:id/abort", async (req, res) => {
    try {
      const id = req.params.id!;
      if (interventionRegistry.get(id)) {
        res.json(abortIntervention(id));
        return;
      }
      if (ctx.hosted && (await probeHostedExecutionReady())) {
        res.json(await abortHostedIntervention(id));
        return;
      }
      if (ctx.hosted) {
        sendApiError(
          res,
          501,
          "LOCAL_RUNTIME_REQUIRED",
          "Live browser execution is not hosted. Start the local API on port 8787.",
        );
        return;
      }
      res.json(abortIntervention(id));
    } catch (err) {
      handleRouteError(res, err);
    }
  });
}
