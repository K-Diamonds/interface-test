import { HealthResponseSchema, type HealthResponse } from "@cu/contracts";
import { apiGet } from "./client";

export type { HealthResponse };

export async function fetchHealth(): Promise<HealthResponse> {
  return apiGet("/api/health", HealthResponseSchema);
}
