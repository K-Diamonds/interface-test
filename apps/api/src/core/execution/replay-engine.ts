import path from "node:path";
import type { CapabilityArtifact } from "@cu/contracts";
import { RunMode } from "@cu/contracts";
import {
  Actor,
  EvidenceKind,
  EvidenceRefKind,
  LoggerMode,
  SessionExecutionState,
} from "@cu/contracts";
import { createRunId } from "@cu/contracts";
import { validateCapabilityArtifact, validateInputs } from "../capability/validator.js";
import { policyFromArtifact } from "../policy/policy.js";
import { Logger } from "../../infrastructure/observability/logger.js";
import { EvidenceStore } from "../../infrastructure/observability/evidence.js";
import { SessionController } from "../intervention/session-controller.js";
import {
  BusinessOutcomeError,
  InterventionRequiredError,
  RecoverableError,
  ValidationError,
} from "../errors.js";
import { executeStep } from "./step-executor.js";
import { runCheckpoint } from "./checkpoint-runner.js";
import { detectKnownOutcomes, classifyStepFailure } from "./error-detector.js";
import { extractOutputs, validateOutputContract } from "./output-extractor.js";
import { applyRecoveryRules } from "./recovery.js";
import { detectExceptionalState } from "./exceptional-state.js";
import { handleIntervention } from "./intervention-handler.js";
import { resolveCapabilityVariant } from "../domain/capability-variant.js";
import {
  resolveBusinessOutcomeResult,
  resolveFailureResult,
} from "./outcome-resolver.js";
import type { CapabilityExecutionResult, ReplayOptions } from "./types.js";
import { ExecutionResultStatus, RecoveryOutcome } from "@cu/contracts";

export type { CapabilityExecutionResult, ReplayOptions } from "./types.js";

/**
 * Deterministic capability replay — NEVER calls an LLM.
 * Orchestrates step execution, recovery, outcomes, and intervention handoff.
 */
export async function replayCapability(
  rawArtifact: CapabilityArtifact,
  inputs: Record<string, unknown>,
  options: ReplayOptions = {},
): Promise<CapabilityExecutionResult> {
  validateCapabilityArtifact(rawArtifact);
  const artifact = resolveCapabilityVariant({
    capability: rawArtifact,
    appVersion: options.appVersion,
    tenantId: options.tenantId,
  });
  const inputCheck = validateInputs(artifact, inputs);
  if (!inputCheck.ok) {
    throw new ValidationError(inputCheck.errors.join("; "));
  }

  const runId = options.runId ?? createRunId();
  const rootDir = options.rootDir;
  const policy = policyFromArtifact(artifact.policy);

  const evidence = await EvidenceStore.create(EvidenceKind.Replay, runId, {
    repoRoot: rootDir,
    evidenceRoot: options.evidenceRoot,
  });
  const logger = await Logger.create(runId, LoggerMode.Replay, evidence.dir);
  evidence.addRef({
    kind: EvidenceRefKind.Log,
    path: logger.path,
  });

  const session = options.session ?? new SessionController(runId);
  let surface = options.surface;
  let ownsSurface = false;

  if (!surface) {
    if (!options.createSurface) {
      throw new ValidationError(
        "Replay requires a ComputerSurface (pass surface or createSurface)",
      );
    }
    surface = await options.createSurface({ tracesDir: evidence.dir });
    ownsSurface = true;
  }
  session.attachSurface(surface);
  if (session.getState() === SessionExecutionState.Created) {
    session.start();
  }

  await logger.log("run.started", {
    summary: `Replay ${artifact.capability.id}@v${artifact.capability.version}`,
    mode: RunMode.Replay,
    actor: Actor.Automation,
    llmDecisionCount: 0,
    capabilityId: artifact.capability.id,
    capabilityVersion: artifact.capability.version,
    discoveredFromRunId: artifact.metadata.discoveredFromRunId,
  });

  try {
    const startShot = await surface.screenshot();
    await evidence.saveScreenshot("start.png", startShot);
  } catch {
    // Start screenshot is diagnostic; a missing frame must not abort replay.
  }

  const collectedOutputs: Record<string, unknown> = {};
  let currentStepId: string | undefined;
  const recoveryAttempts = new Map<string, number>();

  const finalizeSuccess = async (): Promise<CapabilityExecutionResult> => {
    await runCheckpoint(surface, artifact.successCondition, inputs);

    const outputs = await extractOutputs(
      surface,
      artifact,
      collectedOutputs,
      inputs,
    );

    const validated = validateOutputContract(artifact, outputs);
    if (!validated.ok) {
      throw Object.assign(new Error(validated.message), {
        __failure: {
          category: "validation_error" as const,
          code: "OUTPUT_VALIDATION_FAILED",
          message: validated.message,
          recoverable: false,
        },
      });
    }

    const finalShot = await surface.screenshot();
    await evidence.saveScreenshot("final.png", finalShot);

    if (surface.stopTracing) {
      const tracePath = path.join(evidence.dir, "trace.zip");
      await surface.stopTracing(tracePath);
      evidence.addRef({
        kind: EvidenceRefKind.Trace,
        path: tracePath,
      });
    }

    session.complete();
    await logger.log("run.completed", { actor: Actor.Automation });

    const result: CapabilityExecutionResult = {
      status: ExecutionResultStatus.Success,
      runId,
      capabilityId: artifact.capability.id,
      outputs: validated.outputs,
      evidence: evidence.getReferences(),
    };
    await evidence.saveJson("result.json", result);
    return result;
  };

  const escalateToHuman = async (
    err: InterventionRequiredError,
    stepId?: string,
  ): Promise<CapabilityExecutionResult | "resumed"> => {
    const handled = await handleIntervention({
      err,
      session,
      surface,
      evidence,
      logger,
      artifact,
      runId,
      stepId,
      enableOperator: options.enableOperator ?? false,
      operatorPort: options.operatorPort,
      openOperator: options.openOperator,
    });
    if (handled.kind === "terminal") return handled.result;
    return "resumed";
  };

  try {
    for (const step of artifact.steps) {
      if (
        options.startFromStepId &&
        currentStepId === undefined &&
        step.id !== options.startFromStepId
      ) {
        continue;
      }
      currentStepId = step.id;
      const started = Date.now();
      try {
        const observation = await surface.observe();
        const exceptional = detectExceptionalState(observation, artifact);
        if (exceptional) {
          await logger.log("exceptional_state.detected", {
            stepId: step.id,
            signal: exceptional.signal,
            summary: exceptional.summary,
          });
          try {
            await evidence.saveScreenshot(
              "exceptional.png",
              await surface.screenshot(),
            );
          } catch {
            // Diagnostic frame only.
          }
          const recovered = await applyRecoveryRules({
            artifact,
            error: new RecoverableError(exceptional.summary, exceptional.code),
            surface,
            attemptByRule: recoveryAttempts,
            policy,
            session,
            logger,
          });
          if (recovered === RecoveryOutcome.Escalated) {
            const outcome = await escalateToHuman(
              new InterventionRequiredError(exceptional.summary, step.id),
              step.id,
            );
            if (outcome !== "resumed") return outcome;
          } else if (recovered !== RecoveryOutcome.Retry) {
            throw new RecoverableError(exceptional.summary, exceptional.code);
          } else {
            try {
              await evidence.saveScreenshot(
                "after-recovery.png",
                await surface.screenshot(),
              );
            } catch {
              // Diagnostic frame only.
            }
          }
        }
        await executeStep(step, {
          surface,
          policy,
          session,
          logger,
          inputs,
          outputs: collectedOutputs,
        });
        await detectKnownOutcomes(surface, artifact, { stepId: step.id });
        await logger.log("step.completed", {
          stepId: step.id,
          action: step.type,
          target:
            "target" in step && step.target
              ? step.target.description
              : undefined,
          durationMs: Date.now() - started,
          actor: Actor.Automation,
        });
        if (step.checkpoint || step.type === "checkpoint") {
          await logger.log("checkpoint.satisfied", {
            stepId: step.id,
          });
        }
      } catch (err) {
        if (err instanceof BusinessOutcomeError) {
          throw err;
        }

        const recovery = await applyRecoveryRules({
          artifact,
          error: err,
          surface,
          attemptByRule: recoveryAttempts,
          policy,
          session,
          logger,
        });
        if (recovery === RecoveryOutcome.Retry) {
          await executeStep(step, {
            surface,
            policy,
            session,
            logger,
            inputs,
            outputs: collectedOutputs,
          });
          continue;
        }

        await detectKnownOutcomes(surface, artifact, {
          stepId: step.id,
          lastError: err,
          inputs,
        }).catch((outcomeErr) => {
          if (outcomeErr instanceof BusinessOutcomeError) {
            throw outcomeErr;
          }
        });

        const shouldEscalate =
          recovery === RecoveryOutcome.Escalated ||
          err instanceof InterventionRequiredError ||
          (err instanceof Error && step.onError === "escalate");

        if (shouldEscalate) {
          const outcome = await escalateToHuman(
            err instanceof InterventionRequiredError
              ? err
              : new InterventionRequiredError(
                  err instanceof Error ? err.message : String(err),
                  step.id,
                ),
            step.id,
          );
          if (outcome !== "resumed") return outcome;
          await executeStep(step, {
            surface,
            policy,
            session,
            logger,
            inputs,
            outputs: collectedOutputs,
          });
          await detectKnownOutcomes(surface, artifact, { stepId: step.id });
          if (step.checkpoint) {
            await runCheckpoint(surface, step.checkpoint, inputs);
            await logger.log("checkpoint.satisfied", { stepId: step.id });
          }
          continue;
        }

        if (step.onError === "continue") {
          await logger.log("step.skipped_error", {
            stepId: step.id,
            summary: err instanceof Error ? err.message : String(err),
          });
          continue;
        }

        const classified = classifyStepFailure(err, step);
        throw Object.assign(new Error(classified.message), {
          __failure: classified,
          stepId: step.id,
        });
      }
    }

    return await finalizeSuccess();
  } catch (err) {
    if (err instanceof BusinessOutcomeError) {
      return await resolveBusinessOutcomeResult({
        err,
        surface,
        evidence,
        logger,
        session,
        artifact,
        runId,
      });
    }

    if (err instanceof InterventionRequiredError) {
      const outcome = await escalateToHuman(
        err,
        err.stepId ?? currentStepId,
      );
      if (outcome !== "resumed") return outcome;
      return await finalizeSuccess();
    }

    return await resolveFailureResult({
      err,
      surface,
      evidence,
      logger,
      session,
      artifact,
      runId,
      evidenceRoot: options.evidenceRoot,
      currentStepId,
    });
  } finally {
    if (ownsSurface && options.closeSurface !== false) {
      const state = session.getState();
      if (state === SessionExecutionState.Completed || state === SessionExecutionState.Failed) {
        await surface.close().catch(() => undefined);
      }
    }
  }
}
