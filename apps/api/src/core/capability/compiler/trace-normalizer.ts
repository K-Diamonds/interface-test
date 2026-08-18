import type { DiscoveryTraceStep } from "../discovery-trace.js";
import { ActionType, CheckpointType, type CapabilityStep } from "@cu/contracts";

/** Drop non-actionable discovery turns from the compile graph (kept in evidence). */
export function filterActionableSteps(
  steps: DiscoveryTraceStep[],
): DiscoveryTraceStep[] {
  return steps.filter(
    (s) =>
      s.ok &&
      s.action.actionType !== ActionType.Complete &&
      s.action.actionType !== ActionType.RequestHuman &&
      s.action.actionType !== ActionType.Wait &&
      s.action.actionType !== ActionType.Read &&
      s.action.actionType !== ActionType.Extract,
  );
}

/** Attach URL transition checkpoints from before→after observations when missing. */
export function attachTransitionCheckpoints(
  parameterized: CapabilityStep[],
  noiseFiltered: DiscoveryTraceStep[],
): void {
  for (let i = 0; i < noiseFiltered.length; i++) {
    const trace = noiseFiltered[i]!;
    const step = parameterized[i + 1];
    if (!step || step.checkpoint) continue;
    const after = trace.observationAfter;
    const before = trace.observationBefore;
    if (after && before && after.location !== before.location) {
      try {
        const path = new URL(after.location).pathname.replace(/\./g, "\\.");
        step.checkpoint = {
          type: CheckpointType.Url,
          pattern: path.replace(/^\//, "") || "/",
        };
      } catch {
        // Invalid URL — skip inferred checkpoint rather than failing compile.
      }
    }
  }
}
