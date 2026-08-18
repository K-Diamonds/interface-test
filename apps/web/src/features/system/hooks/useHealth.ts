import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/services/api/query-keys";
import { fetchHealth } from "@/services/api/health";

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: fetchHealth,
    refetchInterval: 10_000,
  });
}
