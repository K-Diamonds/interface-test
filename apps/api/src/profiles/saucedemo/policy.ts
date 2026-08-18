import type { AutomationPolicy } from "../../core/policy/policy-types.js";
import { ActionType, RiskyActionBehavior } from "@cu/contracts";

/**
 * SauceDemo demo allowlist — lives with the application profile, not generic policy.
 */
export const SAUCEDEMO_AUTOMATION_POLICY: AutomationPolicy = {
  allowedDomains: ["www.saucedemo.com", "saucedemo.com"],
  allowedRoutes: [
    /^\/$/,
    /^\/index\.html$/,
    /^\/inventory\.html$/,
    /^\/cart\.html$/,
    /^\/inventory-item\.html/,
    /^\/checkout-step-one\.html$/,
    /^\/checkout-step-two\.html$/,
    /^\/checkout-complete\.html$/,
  ],
  allowedActions: [
    ActionType.Navigate,
    ActionType.Click,
    ActionType.Type,
    ActionType.Select,
    ActionType.Read,
    ActionType.Wait,
    ActionType.Extract,
    ActionType.Checkpoint,
    ActionType.Complete,
    ActionType.RequestHuman,
  ],
  blockedActions: [],
  riskyActions: [],
  riskyActionBehavior: RiskyActionBehavior.RequireHuman,
};

export const SAUCEDEMO_POLICY_DESCRIPTOR = {
  allowedDomains: ["www.saucedemo.com", "saucedemo.com"],
  allowedRoutePatterns: [
    "^/$",
    "^/index\\.html$",
    "^/inventory\\.html$",
    "^/cart\\.html$",
    "^/inventory-item\\.html",
    "^/checkout-step-one\\.html$",
    "^/checkout-step-two\\.html$",
    "^/checkout-complete\\.html$",
  ],
  riskyActionBehavior: "require-human" as const,
};
