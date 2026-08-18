import type { CapabilityArtifact } from "@cu/contracts";

export type CapabilityId = string;

export type CheckpointEvaluationResult =
  | { satisfied: true }
  | { satisfied: false; expected: unknown; observed: unknown; message: string };

/**
 * Persistence port for compiled capability artifacts.
 * Isolates replay/discovery from filesystem layout and write atomicity.
 */
export interface CapabilityRepository {
  save(artifact: CapabilityArtifact): Promise<string>;
  get(id: CapabilityId, version: number): Promise<CapabilityArtifact>;
  load(relativeOrAbsolutePath: string): Promise<CapabilityArtifact>;
  listVersions(id: CapabilityId): Promise<number[]>;
}
