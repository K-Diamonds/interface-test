/**
 * Agent-facing capability catalog (read-only).
 * No Playwright — safe to register on the hosted control plane.
 */
import type {
  AgentCapabilityDescriptor,
  CapabilityReliability,
} from "@cu/contracts";
import { CapabilityStore } from "../core/capability/capability-store.js";
import { toAgentDescriptor } from "../core/capability/agent-descriptor.js";
import { summarizeCapabilityReliability } from "../core/capability/reliability.js";
import { HttpError } from "../core/errors.js";
import { resolveRepoRoot } from "../infrastructure/paths.js";
import { listCapabilities } from "../infrastructure/persistence/catalog.js";

export async function listAgentCapabilities(
  rootDir = resolveRepoRoot(),
): Promise<AgentCapabilityDescriptor[]> {
  const summaries = await listCapabilities(rootDir);
  const store = new CapabilityStore(rootDir);
  const items: AgentCapabilityDescriptor[] = [];
  for (const summary of summaries) {
    for (const version of summary.versions) {
      try {
        const artifact = await store.get(summary.id, version);
        items.push(toAgentDescriptor(artifact));
      } catch {
        // skip unreadable
      }
    }
  }
  return items;
}

export async function getAgentCapability(input: {
  capabilityId: string;
  version: number;
  rootDir?: string;
}): Promise<AgentCapabilityDescriptor> {
  const rootDir = input.rootDir ?? resolveRepoRoot();
  const store = new CapabilityStore(rootDir);
  try {
    const artifact = await store.get(input.capabilityId, input.version);
    return toAgentDescriptor(artifact);
  } catch {
    throw new HttpError(404, "NOT_FOUND", "Capability version not found");
  }
}

export async function getAgentCapabilityReliability(input: {
  capabilityId: string;
  version: number;
  rootDir?: string;
}): Promise<CapabilityReliability> {
  const rootDir = input.rootDir ?? resolveRepoRoot();
  await getAgentCapability(input);
  return summarizeCapabilityReliability({
    capabilityId: input.capabilityId,
    version: input.version,
    rootDir,
  });
}
