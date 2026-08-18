import {
  DiscoveryAcceptedSchema,
  type DiscoveryAccepted,
  type DiscoveryRequest,
} from "@cu/contracts";
import { apiPost } from "./client";

export async function startDiscovery(
  body: DiscoveryRequest,
): Promise<DiscoveryAccepted> {
  return apiPost("/api/discovery", DiscoveryAcceptedSchema, body);
}
