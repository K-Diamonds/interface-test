import { apiGet, apiUrl } from "./client";
import {
  RunDetailSchema,
  RunListResponseSchema,
  type EvidenceKind,
  type RunDetail,
  type RunSummary,
} from "@cu/contracts";

export type { RunDetail, RunSummary };

export async function fetchRuns(kind?: EvidenceKind): Promise<RunSummary[]> {
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  const res = await apiGet(`/api/runs${q}`, RunListResponseSchema);
  return res.items;
}

export async function fetchRun(runId: string): Promise<RunDetail> {
  return apiGet(`/api/runs/${encodeURIComponent(runId)}`, RunDetailSchema);
}

export function evidenceFileUrl(runId: string, fileName: string): string {
  return apiUrl(
    `/api/runs/${encodeURIComponent(runId)}/files/${encodeURIComponent(fileName)}`,
  );
}
