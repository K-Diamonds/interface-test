import type { Express, NextFunction, Request, Response } from "express";
import { AgentInvokeRequestSchema } from "@cu/contracts";
import { invokeAgentCapability } from "../../../application/agent-invoke.js";
import { sendApiError } from "../errors.js";

function asyncRoute(
  handler: (req: Request, res: Response) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

/** Same invoke path locally and on hosted Vercel once the browser runtime is ready. */
export function registerAgentInvokeRoutes(app: Express): void {
  app.post(
    "/api/agent/capabilities/:capabilityId/versions/:version/invoke",
    asyncRoute(async (req, res) => {
      const version = Number(req.params.version);
      if (!Number.isInteger(version) || version < 1) {
        sendApiError(
          res,
          400,
          "VALIDATION_ERROR",
          "version must be a positive integer",
        );
        return;
      }
      const parsed = AgentInvokeRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        sendApiError(res, 400, "VALIDATION_ERROR", "Invalid invoke request", {
          issues: parsed.error.issues,
        });
        return;
      }
      const result = await invokeAgentCapability({
        capabilityId: req.params.capabilityId!,
        version,
        arguments: parsed.data.arguments,
      });
      res.json(result);
    }),
  );
}
