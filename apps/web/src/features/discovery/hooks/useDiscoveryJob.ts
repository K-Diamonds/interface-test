import { DiscoveryMode, JobStatus, enumValues } from "@cu/contracts";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/services/api/query-keys";
import { apiGet } from "@/services/api/client";

const DiscoveryJobSchema = z
  .object({
    runId: z.string(),
    status: z.enum(enumValues(JobStatus)),
    mode: z.enum(enumValues(DiscoveryMode)).optional(),
    events: z.array(z.unknown()).optional(),
    result: z
      .object({
        capabilityPath: z.string().optional(),
        success: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    error: z.string().optional(),
  })
  .passthrough();

export function useDiscoveryJob(runId: string) {
  return useQuery({
    queryKey: queryKeys.discovery(runId),
    queryFn: () =>
      apiGet(
        `/api/discovery/${encodeURIComponent(runId)}`,
        DiscoveryJobSchema,
      ),
    enabled: Boolean(runId),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === JobStatus.Completed || status === JobStatus.Failed ? false : 1000;
    },
  });
}
