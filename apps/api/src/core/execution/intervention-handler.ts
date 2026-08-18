import {
  ExecutionResultStatus,
  FailureCategory,
  ResumeWaitResult,
  type CapabilityArtifact,
} from "@cu/contracts";
import type { ComputerSurface } from "../surface.js";
import { InterventionRequiredError } from "../errors.js";
import type { EvidenceStore } from "../../infrastructure/observability/evidence.js";
import type { Logger } from "../../infrastructure/observability/logger.js";
import type { SessionController } from "../intervention/session-controller.js";
import {
  createInterventionRequest,
  persistIntervention,
} from "../intervention/intervention.js";
import { policyFromArtifact } from "../policy/policy.js";
import type {
  CapabilityExecutionResult,
  OpenOperatorSession,
} from "./types.js";

export type { OpenOperatorSession };

/**
 * Intervention handling never finalizes a successful capability.
 * Resume returns control to replayCapability so outputs, the final
 * checkpoint, and result construction use the single authoritative path.
 */
export type InterventionHandleResult =
  | { kind: "terminal"; result: CapabilityExecutionResult }
  | { kind: "resumed" };

export async function handleIntervention(args: {
  err: InterventionRequiredError;
  session: SessionController;
  surface: ComputerSurface;
  evidence: EvidenceStore;
  logger: Logger;
  artifact: CapabilityArtifact;
  runId: string;
  stepId?: string;
  enableOperator: boolean;
  operatorPort?: number;
  openOperator?: OpenOperatorSession;
}): Promise<InterventionHandleResult> {
  const shot = await args.surface.screenshot().catch(() => null);
  let screenshotPath: string | undefined;
  if (shot) {
    screenshotPath = await args.evidence.saveScreenshot(
      "before-escalation.png",
      shot,
    );
  }
  const currentUrl = await args.surface.getCurrentLocation().catch(() => undefined);
  const observation = await args.surface.observe().catch(() => null);

  const intervention = createInterventionRequest({
    runId: args.runId,
    reason: args.err.reason,
    stepId: args.stepId,
    capabilityId: args.artifact.capability.id,
    screenshotPath,
    currentUrl,
    stateSummary: observation
      ? `url=${observation.location}; controls=${observation.controls.length}; fingerprint=${observation.fingerprint}`
      : "unavailable",
  });

  await args.session.requestIntervention(intervention);
  await persistIntervention(args.evidence.dir, intervention);
  await args.logger.log("intervention.requested", {
    stepId: args.stepId,
    summary: args.err.reason,
    actor: "system",
  });

  if (!args.enableOperator || !args.openOperator) {
    return {
      kind: "terminal",
      result: {
        status: ExecutionResultStatus.InterventionRequired,
        runId: args.runId,
        capabilityId: args.artifact.capability.id,
        interventionId: intervention.id,
        reason: args.err.reason,
        stepId: args.stepId,
        evidence: args.evidence.getReferences(),
      },
    };
  }

  // Keep the SAME browser session alive; operator drives it.
  const server = await args.openOperator({
    port: args.operatorPort,
    session: args.session,
    intervention,
    operatorPolicy: policyFromArtifact(args.artifact.policy),
  });

  await args.logger.log("intervention.operator_open", {
    summary: server.url,
    actor: "system",
  });

  console.log(`\nIntervention required. Operator console: ${server.url}\n`);

  const waitResult = await args.session.waitForResume();
  await server.close();

  if (waitResult === ResumeWaitResult.Aborted) {
    args.session.fail();
    return {
      kind: "terminal",
      result: {
        status: ExecutionResultStatus.Failure,
        runId: args.runId,
        capabilityId: args.artifact.capability.id,
        failure: {
          category: FailureCategory.HardFailure,
          code: "ABORTED",
          message: "Run aborted during human intervention",
          stepId: args.stepId,
          recoverable: false,
          timestamp: new Date().toISOString(),
        },
        evidence: args.evidence.getReferences(),
      },
    };
  }

  await args.logger.log("intervention.resumed", { actor: "human" });
  await args.evidence.saveJson(
    "human-actions.json",
    args.session.getHumanActions(),
  );

  return { kind: "resumed" };
}
