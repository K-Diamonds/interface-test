import type { Express } from "express";
import { readFile } from "node:fs/promises";
import { EvidenceKind, JobStatus } from "@cu/contracts";
import {
  findRunById,
  getRunDetail,
  getRunDetailById,
  listRuns,
  resolveEvidenceFile,
} from "../../../infrastructure/persistence/catalog.js";
import { loadRunJob, getRunJob } from "../../../application/run-job-store.js";
import { sendApiError } from "../errors.js";
import type { RouteContext } from "../types.js";

export function registerRunsRoutes(app: Express, ctx: RouteContext): void {
  app.get("/api/runs/:runId/events", async (req, res) => {
    const job = await loadRunJob(req.params.runId!);
    if (job) {
      res.json({ items: job.events });
      return;
    }
    for (const kind of Object.values(EvidenceKind)) {
      const detail = await getRunDetail(kind, req.params.runId!, ctx.rootDir);
      if (detail) {
        res.json({ items: detail.events });
        return;
      }
    }
    sendApiError(res, 404, "NOT_FOUND", "Run events not found");
  });

  app.get("/api/runs/:runId/stream", async (req, res) => {
    const runId = req.params.runId!;
    if (ctx.hosted) {
      const job = await loadRunJob(runId);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.flushHeaders?.();
      if (!job) {
        res.write(
          `data: ${JSON.stringify({ type: "error", message: "unknown run" })}\n\n`,
        );
        res.end();
        return;
      }
      for (const event of job.events) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.write(
        `data: ${JSON.stringify({ type: "job.status", status: job.status })}\n\n`,
      );
      res.end();
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    let cursor = 0;
    const send = () => {
      const job = getRunJob(runId);
      if (!job) {
        res.write(
          `data: ${JSON.stringify({ type: "error", message: "unknown run" })}\n\n`,
        );
        return;
      }
      while (cursor < job.events.length) {
        const event = job.events[cursor++]!;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.write(
        `data: ${JSON.stringify({ type: "job.status", status: job.status })}\n\n`,
      );
      if (job.status === JobStatus.Completed || job.status === JobStatus.Failed) {
        clearInterval(timer);
        res.end();
      }
    };

    send();
    const timer = setInterval(send, 750);
    req.on("close", () => clearInterval(timer));
  });

  app.get("/api/runs", async (req, res) => {
    const kind = req.query.kind as EvidenceKind | undefined;
    if (kind && !Object.values(EvidenceKind).includes(kind)) {
      sendApiError(res, 400, "VALIDATION_ERROR", "Invalid evidence kind");
      return;
    }
    const items = await listRuns(ctx.rootDir, kind);
    res.json({
      items: items.map((r) => ({ ...r, id: r.runId })),
    });
  });

  app.get("/api/runs/:runId/evidence", async (req, res) => {
    const detail = await getRunDetailById(req.params.runId!, ctx.rootDir);
    if (!detail) {
      sendApiError(res, 404, "NOT_FOUND", "Run evidence not found");
      return;
    }
    res.json({
      runId: detail.runId,
      kind: detail.kind,
      files: detail.files,
      result: detail.result,
      intervention: detail.intervention,
      humanActions: detail.humanActions,
    });
  });

  app.get("/api/runs/:runId/files/:fileName", async (req, res) => {
    const summary = await findRunById(req.params.runId!, ctx.rootDir);
    if (!summary) {
      sendApiError(res, 404, "NOT_FOUND", "Run not found");
      return;
    }
    const file = await resolveEvidenceFile(
      summary.kind,
      req.params.runId!,
      req.params.fileName!,
      ctx.rootDir,
    );
    if (!file) {
      sendApiError(res, 404, "NOT_FOUND", "File not found");
      return;
    }
    if (file.endsWith(".png")) {
      res.setHeader("Content-Type", "image/png");
      res.send(await readFile(file));
      return;
    }
    if (file.endsWith(".json") || file.endsWith(".jsonl")) {
      res.setHeader("Content-Type", "application/json");
      res.type(file.endsWith(".jsonl") ? "text/plain" : "application/json");
      res.send(await readFile(file, "utf8"));
      return;
    }
    res.download(file);
  });

  app.get("/api/runs/:runId", async (req, res) => {
    const detail = await getRunDetailById(req.params.runId!, ctx.rootDir);
    if (!detail) {
      sendApiError(res, 404, "NOT_FOUND", "Run not found");
      return;
    }
    res.json({ ...detail, id: detail.runId });
  });
}
