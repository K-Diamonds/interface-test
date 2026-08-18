import { PolicyViolationError, InterventionRequiredError } from "../errors.js";
import {
  ActionEffect,
  ActionType,
  DeclaredRisk,
  GuardrailDecisionKind,
  RiskyActionBehavior,
} from "@cu/contracts";
import { classifyActionRisk } from "./action-risk.js";
import type { AutomationPolicy } from "./policy.js";

export type GuardrailDecision =
  | { decision: typeof GuardrailDecisionKind.Allow }
  | { decision: typeof GuardrailDecisionKind.Block; reason: string }
  | { decision: typeof GuardrailDecisionKind.RequireHuman; reason: string };

function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function domainAllowed(hostname: string, allowed: string[]): boolean {
  return allowed.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

export function checkNavigation(
  url: string,
  policy: AutomationPolicy,
): GuardrailDecision {
  const hostname = extractHostname(url);
  if (!hostname) {
    return {
      decision: GuardrailDecisionKind.Block,
      reason: `Invalid URL: ${url}`,
    };
  }
  if (!domainAllowed(hostname, policy.allowedDomains)) {
    return {
      decision: GuardrailDecisionKind.Block,
      reason: `Navigation blocked: domain "${hostname}" is not allowlisted`,
    };
  }
  if (policy.allowedRoutes && policy.allowedRoutes.length > 0) {
    try {
      const pathname = new URL(url).pathname;
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        policy.allowedRoutes.some((r) => r.test(pathname))
      ) {
        return { decision: GuardrailDecisionKind.Allow };
      }
      return {
        decision: GuardrailDecisionKind.Block,
        reason: `Navigation blocked: route "${pathname}" is not allowlisted`,
      };
    } catch {
      return {
        decision: GuardrailDecisionKind.Block,
        reason: `Invalid URL: ${url}`,
      };
    }
  }
  return { decision: GuardrailDecisionKind.Allow };
}

export function checkAction(input: {
  actionType: ActionType;
  policy: AutomationPolicy;
  description?: string;
  targetName?: string;
  declaredRisk?: DeclaredRisk;
  declaredEffect?: ActionEffect;
  url?: string;
  discoveryLenient?: boolean;
}): GuardrailDecision {
  const { actionType, policy } = input;

  if (policy.blockedActions?.includes(actionType)) {
    return {
      decision: GuardrailDecisionKind.Block,
      reason: `Action "${actionType}" is blocked by policy`,
    };
  }

  if (!policy.allowedActions.includes(actionType)) {
    return {
      decision: GuardrailDecisionKind.Block,
      reason: `Action "${actionType}" is not in the allowlist`,
    };
  }

  if (actionType === ActionType.Navigate && input.url) {
    const nav = checkNavigation(input.url, policy);
    if (nav.decision !== GuardrailDecisionKind.Allow) return nav;
  }

  const classified = classifyActionRisk({
    actionType,
    description: input.description,
    targetName: input.targetName,
    declaredRisk: input.declaredRisk,
    declaredEffect: input.declaredEffect,
  });

  if (classified.requireHuman) {
    // Discovery must be able to explore unlabeled UI. Unknown in-domain clicks
    // are allowed here; replay stays fail-closed. External/irreversible/declared
    // high-risk actions still escalate.
    if (
      input.discoveryLenient &&
      classified.effect === ActionEffect.Unknown &&
      actionType === ActionType.Click &&
      input.declaredRisk !== DeclaredRisk.Risky &&
      input.declaredRisk !== DeclaredRisk.High
    ) {
      return { decision: GuardrailDecisionKind.Allow };
    }
    if (policy.riskyActionBehavior === RiskyActionBehavior.Block) {
      return {
        decision: GuardrailDecisionKind.Block,
        reason: `${classified.effect} action blocked by policy`,
      };
    }
    return {
      decision: GuardrailDecisionKind.RequireHuman,
      reason: `${classified.effect} / ${classified.risk} risk requires human confirmation`,
    };
  }

  return { decision: GuardrailDecisionKind.Allow };
}

export function enforceGuardrail(decision: GuardrailDecision): void {
  if (decision.decision === GuardrailDecisionKind.Block) {
    throw new PolicyViolationError(decision.reason);
  }
  if (decision.decision === GuardrailDecisionKind.RequireHuman) {
    throw new InterventionRequiredError(decision.reason);
  }
}
