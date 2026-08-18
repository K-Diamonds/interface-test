import type { SurfaceObservation } from "@cu/contracts";

export interface GoalVerificationResult {
  ok: boolean;
  reason: string;
  expected?: unknown;
  observed?: unknown;
}

/**
 * Fail-closed generic verifier — model assertion alone is never enough.
 * Application-specific success lives on ApplicationProfile.createGoalVerifier.
 */
export const ConservativeGoalVerifier = {
  verify(input: {
    goal: string;
    observation: SurfaceObservation;
    proposedOutputs?: Record<string, unknown>;
  }): GoalVerificationResult {
    const urlHint = /https?:\/\/\S+|\/[\w.-]+\.html/i.exec(input.goal)?.[0];
    if (!urlHint) {
      return {
        ok: false,
        reason:
          "Completion rejected: no application goal verifier and goal has no explicit success URL/path — fail closed",
        expected: "goal-specific success criterion",
        observed: input.observation.location,
      };
    }
    const escaped = urlHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(escaped, "i").test(input.observation.location)) {
      return {
        ok: false,
        reason: "Completion rejected: observation URL does not match goal success hint",
        expected: urlHint,
        observed: input.observation.location,
      };
    }
    if (
      input.observation.controls.length === 0 &&
      input.observation.visibleText.length === 0
    ) {
      return {
        ok: false,
        reason: "Completion rejected: empty observation",
        observed: input.observation.location,
      };
    }
    return {
      ok: true,
      reason: "Observation URL matches explicit goal success hint",
    };
  },
};
