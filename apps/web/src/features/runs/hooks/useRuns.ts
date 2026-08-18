import { useQuery } from "@tanstack/react-query";
import type { EvidenceKind } from "@cu/contracts";
import { queryKeys } from "@/services/api/query-keys";
import { fetchRun, fetchRuns } from "@/services/api/runs";

export function useRuns(kind?: EvidenceKind) {
  return useQuery({
    queryKey: queryKeys.runs(kind),
    queryFn: () => fetchRuns(kind),
  });
}

export function useRun(runId: string) {
  return useQuery({
    queryKey: queryKeys.run(runId),
    queryFn: () => fetchRun(runId),
    enabled: Boolean(runId),
  });
}
