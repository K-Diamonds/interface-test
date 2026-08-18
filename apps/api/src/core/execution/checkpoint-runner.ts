import type { Checkpoint } from "@cu/contracts";
import type { ComputerSurface } from "../surface.js";
import { CheckpointError } from "../errors.js";
import { evaluateCheckpoint } from "../domain/checkpoint-engine.js";

/**
 * Throw-on-fail adapter. Checkpoint evaluation itself returns a structured result;
 * step/replay call sites treat an unsatisfied checkpoint as a hard failure.
 */
export async function runCheckpoint(
  surface: ComputerSurface,
  checkpoint: Checkpoint,
  inputs: Record<string, unknown> = {},
): Promise<void> {
  const result = await evaluateCheckpoint(surface, checkpoint, inputs);
  if (!result.satisfied) {
    throw new CheckpointError(result.message, result.expected, result.observed);
  }
}
