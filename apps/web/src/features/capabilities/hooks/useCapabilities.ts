import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/services/api/query-keys";
import {
  fetchCapabilities,
  fetchCapabilityReliability,
  fetchCapabilityVersion,
} from "@/services/api/capabilities";
import { fetchAgentCapabilities } from "@/services/api/agent";

export function useCapabilities() {
  return useQuery({
    queryKey: queryKeys.capabilities,
    queryFn: fetchCapabilities,
  });
}

export function useCapabilityVersion(id: string, version: number) {
  return useQuery({
    queryKey: queryKeys.capabilityVersion(id, version),
    queryFn: () => fetchCapabilityVersion(id, version),
    enabled: Boolean(id && version),
  });
}

export function useCapabilityReliability(id: string, version: number) {
  return useQuery({
    queryKey: queryKeys.capabilityReliability(id, version),
    queryFn: () => fetchCapabilityReliability(id, version),
    enabled: Boolean(id && version),
  });
}

export function useAgentCapabilities() {
  return useQuery({
    queryKey: queryKeys.agentCapabilities,
    queryFn: fetchAgentCapabilities,
  });
}
