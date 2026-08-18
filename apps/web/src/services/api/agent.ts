import {
  AgentCapabilityListResponseSchema,
  AgentInvokeResponseSchema,
  type AgentCapabilityDescriptor,
  type AgentInvokeResponse,
} from "@cu/contracts";
import { apiGet, apiPost } from "./client";

export type { AgentCapabilityDescriptor };

export async function fetchAgentCapabilities(): Promise<
  AgentCapabilityDescriptor[]
> {
  const res = await apiGet(
    "/api/agent/capabilities",
    AgentCapabilityListResponseSchema,
  );
  return res.items;
}

export async function invokeAgentCapability(
  id: string,
  version: number,
  args: Record<string, unknown>,
): Promise<AgentInvokeResponse> {
  return apiPost(
    `/api/agent/capabilities/${encodeURIComponent(id)}/versions/${version}/invoke`,
    AgentInvokeResponseSchema,
    { arguments: args },
  );
}
