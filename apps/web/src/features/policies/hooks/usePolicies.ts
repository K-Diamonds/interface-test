import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/services/api/query-keys";
import { apiGet } from "@/services/api/client";

const PolicyListSchema = z.object({
  items: z.array(
    z.object({
      capabilityId: z.string(),
      version: z.number().int().positive(),
      allowedDomains: z.array(z.string()),
      maxSteps: z.number().int().positive().optional(),
      riskyActionBehavior: z.string().optional(),
    }),
  ),
});

export function usePolicies() {
  return useQuery({
    queryKey: queryKeys.policies,
    queryFn: async () => {
      const res = await apiGet("/api/policies", PolicyListSchema);
      return res.items;
    },
  });
}
