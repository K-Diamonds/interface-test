import type { ComputerSurface } from "../surface.js";
import type { ActionResult, CapabilityStep } from "@cu/contracts";
import type { AutomationPolicy } from "../policy/policy.js";
import {
  checkAction,
  checkNavigation,
  enforceGuardrail,
} from "../policy/guardrails.js";
import { bindTarget } from "../domain/parameter-binding.js";
import { runCheckpoint } from "./checkpoint-runner.js";
import { DEFAULT_RETRY, withRetry } from "./retry-policy.js";
import { resolveStepValue, runExtractStep } from "./output-extractor.js";
import type { SessionController } from "../intervention/session-controller.js";
import type { Logger } from "../../infrastructure/observability/logger.js";
import { InterventionRequiredError } from "../errors.js";
import { classifyIdempotency } from "../domain/idempotency.js";

export interface StepExecutorDeps {
  surface: ComputerSurface;
  policy: AutomationPolicy;
  session: SessionController;
  logger: Logger;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

export async function executeStep(
  step: CapabilityStep,
  deps: StepExecutorDeps,
): Promise<void> {
  deps.session.assertController("automation");

  const decision = checkAction({
    actionType: step.type === "checkpoint" ? "checkpoint" : step.type,
    policy: deps.policy,
    description: step.description,
    declaredRisk: step.risk,
    declaredEffect: step.effect,
    url: step.type === "navigate" ? bindUrl(step.url, deps.inputs) : undefined,
    targetName:
      "target" in step && step.target ? step.target.description : undefined,
  });
  enforceGuardrail(decision);

  const retry = step.retry ?? DEFAULT_RETRY;
  const idempotency =
    step.idempotency ??
    classifyIdempotency({
      actionType: step.type === "checkpoint" ? "checkpoint" : step.type,
      description: step.description,
      declared: step.idempotency,
    });

  // Non-idempotent / irreversible actions never auto-retry (mayAutoRetry=false).
  // Ambiguous completion after such actions requires intervention or a later
  // deterministic re-run that starts from an observed postcondition — not a
  // blind second click inside withRetry.
  await withRetry(
    retry,
    async (attempt) => {
      await deps.logger.log("step.attempt", {
        stepId: step.id,
        action: step.type,
        attempt,
        summary: step.description,
        idempotency,
        effect: step.effect,
      });

      switch (step.type) {
        case "navigate": {
          const url = bindUrl(step.url, deps.inputs);
          const before = checkNavigation(url, deps.policy);
          enforceGuardrail(before);
          const result = await deps.surface.navigate(url);
          if (result.redirectedTo) {
            const after = checkNavigation(result.redirectedTo, deps.policy);
            enforceGuardrail(after);
          }
          break;
        }
        case "click": {
          const target = bindTarget(step.target, deps.inputs);
          const result = await deps.surface.click(target);
          await logResolution(deps.logger, step.id, result);
          break;
        }
        case "type": {
          const target = bindTarget(step.target, deps.inputs);
          const value = resolveStepValue(step.value, deps.inputs);
          const result = await deps.surface.type(target, value);
          await logResolution(deps.logger, step.id, result);
          break;
        }
        case "select": {
          if (!deps.surface.select) {
            throw new Error("Surface does not support select()");
          }
          const target = bindTarget(step.target, deps.inputs);
          const value = resolveStepValue(step.value, deps.inputs);
          await deps.surface.select(target, value);
          break;
        }
        case "read": {
          const target = bindTarget(step.target, deps.inputs);
          const text = await deps.surface.read(target);
          if (step.outputName) {
            deps.outputs[step.outputName] = text;
          }
          break;
        }
        case "extract": {
          await runExtractStep(deps.surface, step, deps.inputs, deps.outputs);
          break;
        }
        case "wait": {
          const condition =
            step.condition.type === "element"
              ? {
                  ...step.condition,
                  target: bindTarget(step.condition.target, deps.inputs),
                }
              : step.condition.type === "text"
                ? {
                    ...step.condition,
                    text: step.condition.text.replace(
                      /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
                      (_m, n: string) => String(deps.inputs[n] ?? ""),
                    ),
                  }
                : step.condition.type === "url"
                  ? {
                      ...step.condition,
                      pattern: step.condition.pattern.replace(
                        /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
                        (_m, n: string) => String(deps.inputs[n] ?? ""),
                      ),
                    }
                  : step.condition;
          await deps.surface.waitFor(condition);
          break;
        }
        case "checkpoint": {
          await runCheckpoint(deps.surface, step.check, deps.inputs);
          break;
        }
        default: {
          const _exhaustive: never = step;
          throw new Error(`Unsupported step: ${JSON.stringify(_exhaustive)}`);
        }
      }

      if (step.checkpoint) {
        await runCheckpoint(deps.surface, step.checkpoint, deps.inputs);
      }
    },
    async (attempt, error, delayMs) => {
      await deps.logger.log("step.retry", {
        stepId: step.id,
        action: step.type,
        attempt,
        durationMs: delayMs,
        summary: error instanceof Error ? error.message : String(error),
        idempotency,
      });
    },
    idempotency,
  );
}

function bindUrl(url: string, inputs: Record<string, unknown>): string {
  return url.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, name: string) =>
    String(inputs[name] ?? ""),
  );
}

async function logResolution(
  logger: Logger,
  stepId: string,
  result: ActionResult,
): Promise<void> {
  if (!result.usedFallback) return;
  await logger.log("target.fallback_resolved", {
    stepId,
    primaryStrategy: result.primaryStrategy,
    resolvedStrategy: result.resolvedStrategy,
    driftSignals: result.driftSignals,
  });
}

export function escalateIfNeeded(step: CapabilityStep, error: unknown): never {
  if (step.onError === "escalate") {
    throw new InterventionRequiredError(
      error instanceof Error ? error.message : String(error),
      step.id,
    );
  }
  throw error;
}
