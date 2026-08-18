/** Capability artifact vocabulary — steps, locators, checkpoints, effects. */

export const SchemaVersion = {
  V1: "1.0",
} as const;
export type SchemaVersion = (typeof SchemaVersion)[keyof typeof SchemaVersion];

export const CapabilityStatus = {
  Draft: "draft",
  Approved: "approved",
  Deprecated: "deprecated",
} as const;
export type CapabilityStatus =
  (typeof CapabilityStatus)[keyof typeof CapabilityStatus];

export const ActionType = {
  Navigate: "navigate",
  Click: "click",
  Type: "type",
  Select: "select",
  Read: "read",
  Wait: "wait",
  Extract: "extract",
  Checkpoint: "checkpoint",
  Complete: "complete",
  RequestHuman: "request_human",
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];

export const LocatorKind = {
  Role: "role",
  Label: "label",
  Text: "text",
  Placeholder: "placeholder",
  TestId: "testId",
  Relative: "relative",
  Css: "css",
  Xpath: "xpath",
  Accessibility: "accessibility",
  Vision: "vision",
} as const;
export type LocatorKind = (typeof LocatorKind)[keyof typeof LocatorKind];

export const RelativeRelationship = {
  SameContainer: "same-container",
  Descendant: "descendant",
  Ancestor: "ancestor",
  Following: "following",
  Nearest: "nearest",
} as const;
export type RelativeRelationship =
  (typeof RelativeRelationship)[keyof typeof RelativeRelationship];

export const ValueSource = {
  Literal: "literal",
  Input: "input",
  Env: "env",
} as const;
export type ValueSource = (typeof ValueSource)[keyof typeof ValueSource];

export const CheckpointType = {
  ElementVisible: "element-visible",
  ElementText: "element-text",
  Url: "url",
  Value: "value",
  Count: "count",
  Composite: "composite",
} as const;
export type CheckpointType = (typeof CheckpointType)[keyof typeof CheckpointType];

export const CheckpointOp = {
  And: "and",
  Or: "or",
} as const;
export type CheckpointOp = (typeof CheckpointOp)[keyof typeof CheckpointOp];

export const ExtractFrom = {
  Text: "text",
  Url: "url",
  StateHint: "stateHint",
  Count: "count",
  Input: "input",
  VisibleTextIncludes: "visible-text-includes",
  ElementExists: "element-exists",
} as const;
export type ExtractFrom = (typeof ExtractFrom)[keyof typeof ExtractFrom];

export const WaitConditionType = {
  Url: "url",
  Text: "text",
  Element: "element",
  Timeout: "timeout",
} as const;
export type WaitConditionType =
  (typeof WaitConditionType)[keyof typeof WaitConditionType];

export const StepErrorPolicy = {
  Fail: "fail",
  Continue: "continue",
  Escalate: "escalate",
} as const;
export type StepErrorPolicy = (typeof StepErrorPolicy)[keyof typeof StepErrorPolicy];

export const ConfirmationPolicy = {
  None: "none",
  Checkpoint: "checkpoint",
  Human: "human",
} as const;
export type ConfirmationPolicy =
  (typeof ConfirmationPolicy)[keyof typeof ConfirmationPolicy];

export const RecoveryAction = {
  Retry: "retry",
  Wait: "wait",
  DismissDialog: "dismiss-dialog",
  Escalate: "escalate",
} as const;
export type RecoveryAction = (typeof RecoveryAction)[keyof typeof RecoveryAction];

export const ActionEffect = {
  Read: "read",
  Navigation: "navigation",
  DataEntry: "data-entry",
  ReversibleMutation: "reversible-mutation",
  ExternalSideEffect: "external-side-effect",
  Irreversible: "irreversible",
  Unknown: "unknown",
} as const;
export type ActionEffect = (typeof ActionEffect)[keyof typeof ActionEffect];

export const ActionIdempotency = {
  ReadOnly: "read-only",
  Idempotent: "idempotent",
  PotentiallyNonIdempotent: "potentially-non-idempotent",
  Irreversible: "irreversible",
} as const;
export type ActionIdempotency =
  (typeof ActionIdempotency)[keyof typeof ActionIdempotency];

export const RiskLevel = {
  Safe: "safe",
  Risky: "risky",
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const ActionRiskLevel = {
  Low: "low",
  Medium: "medium",
  High: "high",
} as const;
export type ActionRiskLevel = (typeof ActionRiskLevel)[keyof typeof ActionRiskLevel];

/** Artifacts may declare binary (safe/risky) or graded (low/medium/high) risk. */
export const DeclaredRisk = {
  Safe: "safe",
  Risky: "risky",
  Low: "low",
  Medium: "medium",
  High: "high",
} as const;
export type DeclaredRisk = (typeof DeclaredRisk)[keyof typeof DeclaredRisk];

export const BackoffStrategy = {
  Fixed: "fixed",
  Exponential: "exponential",
} as const;
export type BackoffStrategy = (typeof BackoffStrategy)[keyof typeof BackoffStrategy];

export const BusinessOutcomeDetectionKind = {
  TextIncludes: "text-includes",
  UrlPattern: "url-pattern",
  MissingTarget: "missing-target",
  CheckpointFail: "checkpoint-fail",
} as const;
export type BusinessOutcomeDetectionKind =
  (typeof BusinessOutcomeDetectionKind)[keyof typeof BusinessOutcomeDetectionKind];

export const DialogKind = {
  Alert: "alert",
  Confirm: "confirm",
  Modal: "modal",
  Unknown: "unknown",
} as const;
export type DialogKind = (typeof DialogKind)[keyof typeof DialogKind];
