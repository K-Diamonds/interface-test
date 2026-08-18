import type { ApplicationProfile } from "../domain/application-profile.js";
import { RiskyActionBehavior } from "@cu/contracts";
import {
  BASE_AUTOMATION_ACTIONS,
  type AutomationPolicy,
} from "./policy-types.js";

export type { AutomationPolicy } from "./policy-types.js";
export { BASE_AUTOMATION_ACTIONS } from "./policy-types.js";

/**
 * Resolve runtime policy from application profile + live target hostname.
 * Generic orchestration never imports demo domain lists.
 */
export function resolveAutomationPolicy(input: {
  targetUrl: string;
  profile?: ApplicationProfile;
}): AutomationPolicy {
  const host = safeHostname(input.targetUrl);
  const descriptor = input.profile?.policyDescriptor?.();
  const domains = new Set<string>(descriptor?.allowedDomains ?? []);
  if (host) domains.add(host);

  const risky =
    descriptor?.riskyActionBehavior === "block"
      ? RiskyActionBehavior.Block
      : RiskyActionBehavior.RequireHuman;

  return {
    allowedDomains: [...domains],
    allowedRoutes: descriptor?.allowedRoutePatterns?.map((p) => new RegExp(p)),
    allowedActions: [...BASE_AUTOMATION_ACTIONS],
    blockedActions: [],
    riskyActions: [],
    riskyActionBehavior: risky,
  };
}

export function policyFromArtifact(policy: {
  allowedDomains: string[];
  allowedRoutes?: string[];
  allowedActions: import("@cu/contracts").ActionType[];
  riskyActionPolicy: RiskyActionBehavior;
}): AutomationPolicy {
  return {
    allowedDomains: policy.allowedDomains,
    allowedRoutes: policy.allowedRoutes?.map((p) => new RegExp(p)),
    allowedActions: policy.allowedActions,
    blockedActions: [],
    riskyActions: [],
    riskyActionBehavior: policy.riskyActionPolicy,
  };
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
