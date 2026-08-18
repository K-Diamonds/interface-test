/** Same-session human control and operator actions. */

export const Controller = {
  Automation: "automation",
  Human: "human",
  None: "none",
} as const;
export type Controller = (typeof Controller)[keyof typeof Controller];

export const SessionExecutionState = {
  Created: "created",
  Running: "running",
  Paused: "paused",
  AwaitingHuman: "awaiting_human",
  HumanControl: "human_control",
  Resuming: "resuming",
  Completed: "completed",
  Failed: "failed",
} as const;
export type SessionExecutionState =
  (typeof SessionExecutionState)[keyof typeof SessionExecutionState];

export const InterventionReason = {
  TargetAmbiguous: "TARGET_AMBIGUOUS",
  TargetNotFound: "TARGET_NOT_FOUND",
  UnexpectedState: "UNEXPECTED_STATE",
  PolicyConfirmationRequired: "POLICY_CONFIRMATION_REQUIRED",
  RiskyAction: "RISKY_ACTION",
  DiscoveryStuck: "DISCOVERY_STUCK",
  RecoveryExhausted: "RECOVERY_EXHAUSTED",
  ModelRequested: "MODEL_REQUESTED",
  OperatorDemo: "OPERATOR_DEMO",
} as const;
export type InterventionReason =
  (typeof InterventionReason)[keyof typeof InterventionReason];

export const InterventionStatus = {
  Open: "open",
  Resolved: "resolved",
  Aborted: "aborted",
} as const;
export type InterventionStatus =
  (typeof InterventionStatus)[keyof typeof InterventionStatus];

export const OperatorAction = {
  Click: "click",
  Type: "type",
  Navigate: "navigate",
  Wait: "wait",
} as const;
export type OperatorAction = (typeof OperatorAction)[keyof typeof OperatorAction];

export const ResumeWaitResult = {
  Resumed: "resumed",
  Aborted: "aborted",
} as const;
export type ResumeWaitResult =
  (typeof ResumeWaitResult)[keyof typeof ResumeWaitResult];
