import { ActionType, RiskyActionBehavior } from "@cu/contracts";

export interface AutomationPolicy {
  allowedDomains: string[];
  allowedRoutes?: RegExp[];
  allowedActions: ActionType[];
  blockedActions?: ActionType[];
  riskyActions: ActionType[];
  riskyActionBehavior: RiskyActionBehavior;
}

export const BASE_AUTOMATION_ACTIONS: ActionType[] = [
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
];
