import type { Express } from "express";
import { ReplayRequestSchema } from "@cu/contracts";
import { JobAcceptanceStatus, RunMode } from "@cu/contracts";
import { getRequestId } from "../middleware/request-context.js";
import { sendApiError } from "../errors.js";
import { startReplayJob } from "../../../application/run-jobs.js";

export function registerReplayRoutes(app: Express): void {
  app.post("/api/replay", (req, res) => {
    const parsed = ReplayRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(res, 400, "VALIDATION_ERROR", "Invalid replay request", {
        issues: parsed.error.issues,
      });
      return;
    }
    if (!parsed.data.version) {
      sendApiError(res, 400, "VALIDATION_ERROR", "version is required");
      return;
    }
    const job = startReplayJob(parsed.data, getRequestId(req));
    res.status(202).json({
      runId: job.runId,
      status: JobAcceptanceStatus.Accepted,
      mode: RunMode.Replay,
    });
  });
}
