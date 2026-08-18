import { EvidenceKind, JobStatus, RunMode } from "@cu/contracts";
import { getObjectStore } from "../infrastructure/persistence/object-store.js";
import { jobObjectKey } from "../infrastructure/persistence/remote-mirror.js";

export interface RunJob {
  runId: string;
  mode: RunMode;
  status: JobStatus;
  requestId?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
  result?: unknown;
  evidenceKind?: EvidenceKind;
  events: Array<Record<string, unknown>>;
}

const jobs = new Map<string, RunJob>();
const STALE_RUNNING_JOB_MS = 6 * 60 * 1000;

function persist(job: RunJob): void {
  const store = getObjectStore();
  if (!store) return;
  void store
    .put(jobObjectKey(job.runId), JSON.stringify(job))
    .catch(() => undefined);
}

export function touch(job: RunJob): void {
  job.updatedAt = new Date().toISOString();
  jobs.set(job.runId, job);
  persist(job);
}

export function putJob(job: RunJob): void {
  jobs.set(job.runId, job);
  persist(job);
}

export function getRunJob(runId: string): RunJob | undefined {
  return jobs.get(runId);
}

export async function loadRunJob(runId: string): Promise<RunJob | undefined> {
  const local = jobs.get(runId);
  if (local) return expireIfStale(local);
  const store = getObjectStore();
  if (!store) return undefined;
  const buf = await store.get(jobObjectKey(runId));
  if (!buf) return undefined;
  const job = JSON.parse(buf.toString("utf8")) as RunJob;
  const current = expireIfStale(job);
  jobs.set(runId, current);
  return current;
}

export function appendJobEvent(
  runId: string,
  event: Record<string, unknown>,
): void {
  const job = jobs.get(runId);
  if (!job) return;
  job.events.push({ at: new Date().toISOString(), ...event });
  touch(job);
}

function expireIfStale(job: RunJob): RunJob {
  if (
    (job.status === JobStatus.Running || job.status === JobStatus.Queued) &&
    Date.now() - Date.parse(job.updatedAt) > STALE_RUNNING_JOB_MS
  ) {
    job.status = JobStatus.Failed;
    job.error = "Background run expired before completion";
    job.events.push({
      at: new Date().toISOString(),
      type: "run.expired",
      status: job.status,
      message: job.error,
    });
    touch(job);
  }
  return job;
}
