import { redactValue } from "../policy/redaction.js";
import type {
  CapabilityArtifact,
  CapabilityStep,
  KnownBusinessOutcome,
} from "@cu/contracts";
import {
  BusinessOutcomeError,
  CheckpointError,
  LocatorError,
} from "../errors.js";
import type { FailureCategory } from "@cu/contracts";
import type { ComputerSurface } from "../surface.js";

/**
 * Evaluate only artifact-declared known outcomes.
 * Does not invent permission/validation business outcomes globally.
 */
export async function detectKnownOutcomes(
  surface: ComputerSurface,
  artifact: CapabilityArtifact,
  context: {
    stepId?: string;
    lastError?: unknown;
    inputs?: Record<string, unknown>;
  },
): Promise<void> {
  for (const outcome of artifact.knownOutcomes) {
    if (await matchesOutcome(surface, outcome, context)) {
      throw new BusinessOutcomeError(
        outcome.code,
        outcome.message,
        bindOutcomeData(outcome, context.inputs ?? {}),
      );
    }
  }
}

function bindOutcomeData(
  outcome: KnownBusinessOutcome,
  inputs: Record<string, unknown>,
): Record<string, unknown> {
  // Prefer input bindings for result data — no hardcoded product fields.
  const data: Record<string, unknown> = { stepId: undefined };
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      data[key] = value;
    }
  }
  void outcome;
  return redactValue(data) as Record<string, unknown>;
}

async function matchesOutcome(
  surface: ComputerSurface,
  outcome: KnownBusinessOutcome,
  context: { stepId?: string; lastError?: unknown },
): Promise<boolean> {
  const detection = outcome.detection;
  switch (detection.kind) {
    case "text-includes": {
      const observation = await surface.observe();
      const haystack = [
        ...observation.visibleText,
        ...observation.controls.map((c) => c.text ?? ""),
        ...observation.dialogs.map((d) => d.text ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(detection.text.toLowerCase());
    }
    case "url-pattern": {
      const url = await surface.getCurrentLocation();
      return new RegExp(detection.pattern).test(url);
    }
    case "missing-target": {
      if (context.stepId !== detection.stepId) return false;
      const err = context.lastError;
      if (err instanceof LocatorError) {
        return err.category === "locator_unresolved";
      }
      if (err instanceof Error) {
        return /locator_unresolved|No matches|Unable to resolve/i.test(
          err.message,
        );
      }
      return false;
    }
    case "checkpoint-fail": {
      if (detection.stepId && context.stepId !== detection.stepId) return false;
      return context.lastError instanceof CheckpointError;
    }
    default:
      return false;
  }
}

export function classifyStepFailure(
  error: unknown,
  step: CapabilityStep,
): {
  category: FailureCategory;
  code: string;
  message: string;
  expected?: unknown;
  observed?: unknown;
  recoverable: boolean;
} {
  if (error instanceof LocatorError) {
    return {
      category: error.category,
      code: error.code,
      message: error.message,
      expected: error.expected,
      observed: error.observed,
      recoverable: false,
    };
  }
  if (error instanceof CheckpointError) {
    return {
      category: "checkpoint_failed",
      code: error.code,
      message: error.message,
      expected: error.expected,
      observed: error.observed,
      recoverable: false,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout/i.test(message)) {
    return {
      category: "timeout",
      code: "TIMEOUT",
      message,
      recoverable: false,
    };
  }
  if (/policy/i.test(message)) {
    return {
      category: "policy_violation",
      code: "POLICY_VIOLATION",
      message,
      recoverable: false,
    };
  }
  return {
    category: "hard_failure",
    code: "HARD_FAILURE",
    message: `${step.id}: ${message}`,
    recoverable: false,
  };
}
