import type { Express } from "express";
import { DiscoveryRequestSchema } from "@cu/contracts";
import { JobAcceptanceStatus } from "@cu/contracts";
import { getRequestId } from "../middleware/request-context.js";
import { sendApiError } from "../errors.js";
import { loadRunJob, startDiscoveryJob } from "../../../application/run-jobs.js";

export function registerDiscoveryRoutes(app: Express): void {
  app.post("/api/discovery", (req, res) => {
    const parsed = DiscoveryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(res, 400, "VALIDATION_ERROR", "Invalid discovery request", {
        issues: parsed.error.issues,
      });
      return;
    }
    const job = startDiscoveryJob(parsed.data, getRequestId(req));
    res.status(202).json({ runId: job.runId, status: JobAcceptanceStatus.Accepted });
  });

  app.get("/api/discovery/:runId", async (req, res) => {
    const job = await loadRunJob(req.params.runId!);
    if (!job || job.mode !== "discovery") {
      sendApiError(res, 404, "NOT_FOUND", "Discovery run not found");
      return;
    }
    res.json(job);
  });
}
