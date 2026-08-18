import type { CapabilityArtifact, TargetDescriptor } from "@cu/contracts";
import {
  ActionType,
  Controller,
  GuardrailDecisionKind,
  RecoverableErrorCode,
  RecoveryAction,
  RecoveryOutcome,
  WaitConditionType,
} from "@cu/contracts";
import type { ComputerSurface } from "../surface.js";
import { RecoverableError, ValidationError } from "../errors.js";
import { bindTarget } from "../domain/parameter-binding.js";
import type { AutomationPolicy } from "../policy/policy.js";
import { checkAction } from "../policy/guardrails.js";
import type { SessionController } from "../intervention/session-controller.js";

/**
 * Apply artifact-level recoveryRules before rethrowing.
 * Dialog dismissal requires a declared target — no guessing Accept/OK.
 * Interactive recovery actions are policy-checked.
 */
export async function applyRecoveryRules(input: {
  artifact: CapabilityArtifact;
  error: unknown;
  surface: ComputerSurface;
  attemptByRule: Map<string, number>;
  policy?: AutomationPolicy;
  session?: SessionController;
  logger?: {
    log: (type: string, data: Record<string, unknown>) => Promise<void>;
  };
}): Promise<RecoveryOutcome> {
  const rules = input.artifact.recoveryRules ?? [];
  if (rules.length === 0) return RecoveryOutcome.Unhandled;

  const code =
    input.error instanceof RecoverableError
      ? input.error.recoverableCode
      : inferRecoverableCode(input.error);

  if (!code) return RecoveryOutcome.Unhandled;

  const rule = rules.find((r) => r.when === code);
  if (!rule) return RecoveryOutcome.Unhandled;

  const used = input.attemptByRule.get(rule.id) ?? 0;
  if (used >= rule.maxAttempts) {
    await input.logger?.log("recovery.exhausted", {
      ruleId: rule.id,
      maxAttempts: rule.maxAttempts,
    });
    return RecoveryOutcome.Unhandled;
  }
  input.attemptByRule.set(rule.id, used + 1);
  input.session?.assertController(Controller.Automation);

  await input.logger?.log("recovery.started", {
    ruleId: rule.id,
    when: rule.when,
    action: rule.action,
    attempt: used + 1,
  });

  switch (rule.action) {
    case RecoveryAction.Wait: {
      const delayMs = rule.delayMs;
      if (delayMs === undefined) {
        throw new ValidationError(
          `Recovery rule ${rule.id}: wait requires delayMs in the artifact`,
        );
      }
      await input.surface.waitFor({
        type: WaitConditionType.Timeout,
        ms: delayMs,
      });
      await input.logger?.log("recovery.completed", {
        ruleId: rule.id,
        action: "wait",
      });
      return RecoveryOutcome.Retry;
    }
    case RecoveryAction.DismissDialog: {
      if (!rule.target) {
        await input.logger?.log("recovery.completed", {
          ruleId: rule.id,
          action: "dismiss-dialog",
          result: "escalate",
          reason: "no declared target",
        });
        return RecoveryOutcome.Escalated;
      }
      if (input.policy) {
        const decision = checkAction({
          policy: input.policy,
          actionType: ActionType.Click,
          description: rule.target.description,
          targetName: rule.target.description,
          declaredEffect: rule.effect,
          declaredRisk: rule.risk,
        });
        await input.logger?.log("recovery.action", {
          ruleId: rule.id,
          policy: decision.decision,
          reason:
            decision.decision === GuardrailDecisionKind.Allow
              ? undefined
              : "reason" in decision
                ? decision.reason
                : undefined,
        });
        if (decision.decision !== GuardrailDecisionKind.Allow) {
          return RecoveryOutcome.Escalated;
        }
        await input.logger?.log("policy.allowed", {
          ruleId: rule.id,
          action: ActionType.Click,
        });
      }
      const target = bindTarget(rule.target as TargetDescriptor, {});
      await input.surface.click(target);
      await input.logger?.log("recovery.action_executed", {
        ruleId: rule.id,
        action: "click",
        target: rule.target.description,
      });
      await input.logger?.log("recovery.completed", {
        ruleId: rule.id,
        action: "dismiss-dialog",
      });
      return RecoveryOutcome.Retry;
    }
    case RecoveryAction.Escalate:
      await input.logger?.log("recovery.completed", {
        ruleId: rule.id,
        action: RecoveryOutcome.Escalated,
      });
      return RecoveryOutcome.Escalated;
    case RecoveryAction.Retry:
      await input.logger?.log("recovery.completed", {
        ruleId: rule.id,
        action: RecoveryOutcome.Retry,
      });
      return RecoveryOutcome.Retry;
    default:
      return RecoveryOutcome.Unhandled;
  }
}

function inferRecoverableCode(error: unknown): RecoverableErrorCode | null {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout/i.test(message)) return RecoverableErrorCode.TransientTimeout;
  if (/detached|stale/i.test(message)) return RecoverableErrorCode.ElementDetached;
  if (/interstitial|session notice|maintenance/i.test(message)) {
    return RecoverableErrorCode.KnownInterstitial;
  }
  if (/dialog|modal/i.test(message)) return RecoverableErrorCode.TemporaryDialog;
  return null;
}
