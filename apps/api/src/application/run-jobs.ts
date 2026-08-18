import { createRunId, EvidenceKind, JobStatus, ReplayExecutionContext, RunMode } from "@cu/contracts";
import { discoverCapabilityApp } from "./discover-capability.js";
import { replayCapabilityApp } from "./replay-capability.js";
import { resolveRepoRoot } from "../infrastructure/paths.js";
import type { DiscoveryRequest, ReplayRequest } from "@cu/contracts";
import { continueAfterResponse } from "../infrastructure/serverless.js";
import {
  appendJobEvent,
  getRunJob,
  loadRunJob,
  putJob,
  touch,
  type RunJob,
} from "./run-job-store.js";

export type { RunJob };
export { appendJobEvent, getRunJob, loadRunJob };

function hostedRequest(): boolean {
  return Boolean(process.env.VERCEL);
}

function jobStatusForDiscovery(status: string): JobStatus {
  if (status === "failed") return JobStatus.Failed;
  if (status === "intervention_required") return JobStatus.AwaitingHuman;
  return JobStatus.Completed;
}

function jobStatusForReplay(status: string): JobStatus {
  if (status === "failure") return JobStatus.Failed;
  if (status === "intervention_required") return JobStatus.AwaitingHuman;
  return JobStatus.Completed;
}

export function startDiscoveryJob(
  body: DiscoveryRequest,
  requestId?: string,
): RunJob {
  const runId = createRunId();
  const job: RunJob = {
    runId,
    mode: RunMode.Discovery,
    status: JobStatus.Queued,
    requestId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    evidenceKind: EvidenceKind.Discovery,
    events: [{ type: "run.started", mode: RunMode.Discovery, requestId }],
  };
  putJob(job);

  continueAfterResponse(
    (async () => {
      job.status = "running";
      touch(job);
      appendJobEvent(runId, { type: "discovery.accepted", requestId });
      try {
        const result = await discoverCapabilityApp({
          goal: body.goal,
          target: body.target,
          scripted: body.scripted,
          headless: body.headless ?? true,
          enableOperator: !hostedRequest(),
          parameters: (body.parameters ?? {}) as Record<string, unknown>,
          maxSteps: body.maxSteps,
          timeoutSeconds: body.timeoutSeconds,
          runId,
        });
        job.status = jobStatusForDiscovery(result.status);
        job.result = {
          runId: result.runId,
          capabilityPath: result.capabilityPath,
          status: result.status,
        };
        appendJobEvent(runId, {
          type:
            result.status === "failed"
              ? "run.failed"
              : result.status === "intervention_required"
                ? "run.awaiting_human"
                : "run.completed",
          status: result.status,
        });
        touch(job);
      } catch (err) {
        job.status = JobStatus.Failed;
        job.error = err instanceof Error ? err.message : String(err);
        appendJobEvent(runId, { type: "run.failed", message: job.error });
        touch(job);
      }
    })(),
  );

  return job;
}

export function startReplayJob(
  body: ReplayRequest,
  requestId?: string,
): RunJob {
  const runId = createRunId();
  const job: RunJob = {
    runId,
    mode: RunMode.Replay,
    status: JobStatus.Queued,
    requestId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    evidenceKind: EvidenceKind.Replay,
    events: [{ type: "run.started", mode: RunMode.Replay, requestId }],
  };
  putJob(job);

  continueAfterResponse(
    (async () => {
      job.status = "running";
      touch(job);
      appendJobEvent(runId, {
        type: "replay.accepted",
        capabilityId: body.capabilityId,
        requestId,
      });
      try {
        const storeRoot = resolveRepoRoot();
        const result = await replayCapabilityApp({
          capabilityId: body.capabilityId,
          version: body.version,
          inputs: body.inputs ?? {},
          executionContext: ReplayExecutionContext.Development,
          options: {
            runId,
            headless: body.headless ?? true,
            enableOperator: hostedRequest() ? false : body.forceIntervention,
            rootDir: storeRoot,
          },
        });
        job.status = jobStatusForReplay(result.status);
        job.result = result;
        appendJobEvent(runId, {
          type:
            result.status === "failure"
              ? "run.failed"
              : result.status === "intervention_required"
                ? "run.awaiting_human"
                : "run.completed",
          runId: result.runId,
          status: result.status,
        });
        touch(job);
      } catch (err) {
        job.status = JobStatus.Failed;
        job.error = err instanceof Error ? err.message : String(err);
        appendJobEvent(runId, { type: "run.failed", message: job.error });
        touch(job);
      }
    })(),
  );

  return job;
}
