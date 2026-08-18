import type { DiscoveryContract } from "../../domain/application-profile.js";
import type { CapabilityStep, KnownBusinessOutcome } from "@cu/contracts";
import { ActionType, createStepId } from "@cu/contracts";

/** Ensure contract-declared extract outputs exist as a terminal extract step. */
export function ensureExtractStep(
  parameterized: CapabilityStep[],
  contract: DiscoveryContract,
  nextIndex: number,
): number {
  const hasExtract = parameterized.some((s) => s.type === "extract");
  if (!hasExtract && contract.extractOutputs.length > 0) {
    parameterized.push({
      id: createStepId(nextIndex),
      type: ActionType.Extract,
      description: "Extract typed outputs declared by the discovery contract",
      effect: "read",
      risk: "low",
      idempotency: "read-only",
      outputs: contract.extractOutputs.map((o) => ({
        name: o.name,
        from: o.from,
        target: o.target,
        stateHintKey: o.stateHintKey,
        inputKey: o.inputKey,
        transform: o.transform,
      })),
    });
    return nextIndex + 1;
  }
  return nextIndex;
}

/** Remap known-outcome symbolic step ids onto compiled step ids. */
export function remapKnownOutcomes(
  contract: DiscoveryContract,
  symbolicStepIds: Map<string, string>,
): KnownBusinessOutcome[] {
  return (contract.knownOutcomes ?? []).map((outcome) => {
    if (
      outcome.detection.kind === "missing-target" &&
      symbolicStepIds.has(outcome.detection.stepId)
    ) {
      return {
        ...outcome,
        detection: {
          ...outcome.detection,
          stepId: symbolicStepIds.get(outcome.detection.stepId)!,
        },
      };
    }
    return outcome;
  });
}
