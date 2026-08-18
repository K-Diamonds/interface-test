/** Runtime execution results, recovery, and policy decisions. */

export const FailureCategory = {
  LocatorUnresolved: "locator_unresolved",
  LocatorAmbiguous: "locator_ambiguous",
  CheckpointFailed: "checkpoint_failed",
  PolicyViolation: "policy_violation",
  PermissionDenied: "permission_denied",
  UnexpectedState: "unexpected_state",
  SessionLost: "session_lost",
  Timeout: "timeout",
  ValidationError: "validation_error",
  NavigationBlocked: "navigation_blocked",
  HardFailure: "hard_failure",
} as const;
export type FailureCategory = (typeof FailureCategory)[keyof typeof FailureCategory];

export const RecoverableErrorCode = {
  ElementDetached: "element_detached",
  LoadingDelay: "loading_delay",
  TemporaryDialog: "temporary_dialog",
  KnownInterstitial: "known_interstitial",
  StaleElement: "stale_element",
  TransientTimeout: "transient_timeout",
} as const;
export type RecoverableErrorCode =
  (typeof RecoverableErrorCode)[keyof typeof RecoverableErrorCode];

export const ExecutionResultStatus = {
  Success: "success",
  BusinessOutcome: "business_outcome",
  Failure: "failure",
  InterventionRequired: "intervention_required",
} as const;
export type ExecutionResultStatus =
  (typeof ExecutionResultStatus)[keyof typeof ExecutionResultStatus];

export const GuardrailDecisionKind = {
  Allow: "allow",
  Block: "block",
  RequireHuman: "require-human",
} as const;
export type GuardrailDecisionKind =
  (typeof GuardrailDecisionKind)[keyof typeof GuardrailDecisionKind];

export const RiskyActionBehavior = {
  Block: "block",
  RequireHuman: "require-human",
} as const;
export type RiskyActionBehavior =
  (typeof RiskyActionBehavior)[keyof typeof RiskyActionBehavior];

export const TargetResolutionStatus = {
  Resolved: "resolved",
  NotFound: "not_found",
  Ambiguous: "ambiguous",
} as const;
export type TargetResolutionStatus =
  (typeof TargetResolutionStatus)[keyof typeof TargetResolutionStatus];

export const SurfaceAction = {
  Click: "click",
  Read: "read",
  Type: "type",
} as const;
export type SurfaceAction = (typeof SurfaceAction)[keyof typeof SurfaceAction];

export const RecoveryOutcome = {
  Retry: "retry",
  Escalated: "escalated",
  Unhandled: "unhandled",
} as const;
export type RecoveryOutcome =
  (typeof RecoveryOutcome)[keyof typeof RecoveryOutcome];

/** Telemetry for capability reliability — not a management platform. */
export const DriftSignal = {
  ApplicationFingerprintMismatch: "application-fingerprint-mismatch",
  PrimaryLocatorFailure: "primary-locator-failure",
  FallbackLocatorUsed: "fallback-locator-used",
  CheckpointDegradation: "checkpoint-degradation",
  ReplayFailure: "replay-failure",
} as const;
export type DriftSignal = (typeof DriftSignal)[keyof typeof DriftSignal];

/** Who is executing a capability — not an authorization platform. */
export const ReplayExecutionContext = {
  Development: "development",
  Review: "review",
  Unattended: "unattended",
} as const;
export type ReplayExecutionContext =
  (typeof ReplayExecutionContext)[keyof typeof ReplayExecutionContext];
