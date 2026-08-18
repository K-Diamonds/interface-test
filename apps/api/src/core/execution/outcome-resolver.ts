import type { CapabilityArtifact, FailureCategory } from "@cu/contracts";
import { EvidenceKind, FailureCategory as FC } from "@cu/contracts";
import {
  BusinessOutcomeError,
  PolicyViolationError,
} from "../errors.js";
import type { EvidenceStore } from "../../infrastructure/observability/evidence.js";
import { EvidenceStore as EvidenceStoreClass } from "../../infrastructure/observability/evidence.js";
import type { Logger } from "../../infrastructure/observability/logger.js";
import type { SessionController } from "../intervention/session-controller.js";
import type { ComputerSurface } from "../surface.js";
import type { CapabilityExecutionResult } from "./types.js";
import { ExecutionResultStatus } from "@cu/contracts";

export async function resolveBusinessOutcomeResult(input: {
  err: BusinessOutcomeError;
  surface: ComputerSurface;
  evidence: EvidenceStore;
  logger: Logger;
  session: SessionController;
  artifact: CapabilityArtifact;
  runId: string;
}): Promise<CapabilityExecutionResult> {
  const shot = await input.surface.screenshot().catch(() => null);
  if (shot) await input.evidence.saveScreenshot("outcome.png", shot);
  const result: CapabilityExecutionResult = {
    status: ExecutionResultStatus.BusinessOutcome,
    runId: input.runId,
    capabilityId: input.artifact.capability.id,
    outcome: {
      code: input.err.outcomeCode,
      message: input.err.message,
      data: input.err.data,
    },
    evidence: input.evidence.getReferences(),
  };
  await input.evidence.saveJson("result.json", result);
  await input.logger.log("run.business_outcome", {
    summary: input.err.message,
    code: input.err.outcomeCode,
  });
  input.session.complete();
  return result;
}

export async function resolveFailureResult(input: {
  err: unknown;
  surface: ComputerSurface;
  evidence: EvidenceStore;
  logger: Logger;
  session: SessionController;
  artifact: CapabilityArtifact;
  runId: string;
  evidenceRoot?: string;
  currentStepId?: string;
}): Promise<CapabilityExecutionResult> {
  const failureMeta =
    input.err && typeof input.err === "object" && "__failure" in input.err
      ? (
          input.err as {
            __failure: {
              category: FailureCategory;
              code: string;
              message: string;
              expected?: unknown;
              observed?: unknown;
              recoverable: boolean;
            };
            stepId?: string;
          }
        ).__failure
      : null;

  const url = await input.surface.getCurrentLocation().catch(() => undefined);
  const shot = await input.surface.screenshot().catch(() => null);

  const failureEvidence = await EvidenceStoreClass.create(
    EvidenceKind.Failures,
    input.runId,
    { evidenceRoot: input.evidenceRoot },
  );
  if (shot) {
    await failureEvidence.saveScreenshot("failure.png", shot);
    await input.evidence.saveScreenshot("failure.png", shot);
  }

  const failure = {
    category:
      failureMeta?.category ??
      (input.err instanceof PolicyViolationError
        ? FC.PolicyViolation
        : FC.HardFailure),
    code: failureMeta?.code ?? "HARD_FAILURE",
    message:
      failureMeta?.message ??
      (input.err instanceof Error ? input.err.message : String(input.err)),
    stepId:
      (input.err as { stepId?: string }).stepId ?? input.currentStepId,
    expected: failureMeta?.expected,
    observed: failureMeta?.observed,
    recoverable: failureMeta?.recoverable ?? false,
    url,
    timestamp: new Date().toISOString(),
  };

  const result: CapabilityExecutionResult = {
    status: ExecutionResultStatus.Failure,
    runId: input.runId,
    capabilityId: input.artifact.capability.id,
    failure,
    evidence: [
      ...input.evidence.getReferences(),
      ...failureEvidence.getReferences(),
    ],
  };
  await input.evidence.saveJson("result.json", result);
  await failureEvidence.saveJson("result.json", result);
  await input.logger.log("run.failed", {
    stepId: failure.stepId,
    summary: failure.message,
  });
  input.session.fail();
  return result;
}
