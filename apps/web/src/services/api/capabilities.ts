import {
  CapabilityArtifactSchema,
  CapabilityListResponseSchema,
  CapabilityReliabilitySchema,
  CapabilitySummarySchema,
  type CapabilitySummary,
} from "@cu/contracts";
import { apiGet } from "./client";

export type { CapabilitySummary };

export async function fetchCapabilities(): Promise<CapabilitySummary[]> {
  const res = await apiGet("/api/capabilities", CapabilityListResponseSchema);
  return res.items;
}

export async function fetchCapability(
  id: string,
): Promise<CapabilitySummary> {
  return apiGet(
    `/api/capabilities/${encodeURIComponent(id)}`,
    CapabilitySummarySchema,
  );
}

export async function fetchCapabilityVersion(id: string, version: number) {
  return apiGet(
    `/api/capabilities/${encodeURIComponent(id)}/versions/${version}`,
    CapabilityArtifactSchema,
  );
}

export async function fetchCapabilityReliability(id: string, version: number) {
  return apiGet(
    `/api/agent/capabilities/${encodeURIComponent(id)}/versions/${version}/reliability`,
    CapabilityReliabilitySchema,
  );
}
