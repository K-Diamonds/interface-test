import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/services/api/query-keys";
import {
  fetchIntervention,
  fetchInterventions,
} from "@/services/api/interventions";

export function useInterventions(refetchInterval?: number | false) {
  return useQuery({
    queryKey: queryKeys.interventions,
    queryFn: fetchInterventions,
    refetchInterval,
  });
}

export function useIntervention(id: string) {
  return useQuery({
    queryKey: queryKeys.intervention(id),
    queryFn: () => fetchIntervention(id),
    enabled: Boolean(id),
    refetchInterval: 2_000,
  });
}
