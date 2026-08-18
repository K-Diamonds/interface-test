import type { EvidenceKind } from "@cu/contracts";

export const queryKeys = {
  health: ["health"] as const,
  runs: (kind?: EvidenceKind) =>
    kind ? (["runs", kind] as const) : (["runs"] as const),
  run: (runId: string) => ["runs", runId] as const,
  capabilities: ["capabilities"] as const,
  capability: (id: string) => ["capabilities", id] as const,
  capabilityVersion: (id: string, version: number) =>
    ["capabilities", id, version] as const,
  capabilityReliability: (id: string, version: number) =>
    ["capabilities", id, version, "reliability"] as const,
  agentCapabilities: ["agent", "capabilities"] as const,
  interventions: ["interventions"] as const,
  intervention: (id: string) => ["interventions", id] as const,
  policies: ["policies"] as const,
  evidence: ["evidence"] as const,
  discovery: (runId: string) => ["discovery", runId] as const,
};
