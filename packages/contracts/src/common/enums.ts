/** Shared identifiers used across API, evidence, jobs, and UI. */

export function enumValues<T extends Record<string, string>>(
  e: T,
): [T[keyof T], ...T[keyof T][]] {
  const values = Object.values(e) as T[keyof T][];
  return values as [T[keyof T], ...T[keyof T][]];
}

export const EvidenceKind = {
  Discovery: "discovery",
  Replay: "replay",
  Failures: "failures",
  OfflineDemo: "offline-demo",
  Intervention: "intervention",
  Handoff: "handoff",
} as const;
export type EvidenceKind = (typeof EvidenceKind)[keyof typeof EvidenceKind];

export const EvidenceRefKind = {
  Screenshot: "screenshot",
  Trace: "trace",
  Log: "log",
  Json: "json",
} as const;
export type EvidenceRefKind = (typeof EvidenceRefKind)[keyof typeof EvidenceRefKind];

export const RunMode = {
  Discovery: "discovery",
  Replay: "replay",
} as const;
export type RunMode = (typeof RunMode)[keyof typeof RunMode];

export const LoggerMode = {
  Discovery: "discovery",
  Replay: "replay",
  Demo: "demo",
  Operator: "operator",
} as const;
export type LoggerMode = (typeof LoggerMode)[keyof typeof LoggerMode];

export const Actor = {
  Automation: "automation",
  Human: "human",
  System: "system",
} as const;
export type Actor = (typeof Actor)[keyof typeof Actor];

export const DataClassification = {
  Public: "public",
  Internal: "internal",
  Sensitive: "sensitive",
  Secret: "secret",
} as const;
export type DataClassification =
  (typeof DataClassification)[keyof typeof DataClassification];

export const PrimitiveType = {
  String: "string",
  Number: "number",
  Boolean: "boolean",
} as const;
export type PrimitiveType = (typeof PrimitiveType)[keyof typeof PrimitiveType];

export const JobStatus = {
  Queued: "queued",
  Running: "running",
  AwaitingHuman: "awaiting_human",
  Completed: "completed",
  Failed: "failed",
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const JobAcceptanceStatus = {
  Accepted: "accepted",
} as const;
export type JobAcceptanceStatus =
  (typeof JobAcceptanceStatus)[keyof typeof JobAcceptanceStatus];

export const HealthStatus = {
  Ok: "ok",
  Degraded: "degraded",
  Error: "error",
} as const;
export type HealthStatus = (typeof HealthStatus)[keyof typeof HealthStatus];

export const ComponentHealth = {
  Operational: "operational",
  Degraded: "degraded",
  Configured: "configured",
  NotConfigured: "not_configured",
  Unreachable: "unreachable",
} as const;
export type ComponentHealth =
  (typeof ComponentHealth)[keyof typeof ComponentHealth];

export const HealthProviderId = {
  OpenAI: "openai",
  Gemini: "gemini",
  Ollama: "ollama",
  None: "none",
} as const;
export type HealthProviderId =
  (typeof HealthProviderId)[keyof typeof HealthProviderId];

export const StreamConnectionState = {
  Connecting: "connecting",
  Connected: "connected",
  Reconnecting: "reconnecting",
  Disconnected: "disconnected",
  Ended: "ended",
} as const;
export type StreamConnectionState =
  (typeof StreamConnectionState)[keyof typeof StreamConnectionState];

export const UiTone = {
  Slate: "slate",
  Blue: "blue",
  Green: "green",
  Amber: "amber",
  Red: "red",
  Violet: "violet",
} as const;
export type UiTone = (typeof UiTone)[keyof typeof UiTone];

export const AlertTone = {
  Info: "info",
  Warning: "warning",
  Error: "error",
} as const;
export type AlertTone = (typeof AlertTone)[keyof typeof AlertTone];

export const BindingNodeType = {
  Literal: "literal",
  Input: "input",
  Template: "template",
  Text: "text",
} as const;
export type BindingNodeType =
  (typeof BindingNodeType)[keyof typeof BindingNodeType];

/** Catalog / UI fallback when a run has no typed result status yet. */
export const CatalogRunStatus = {
  Recorded: "recorded",
  Partial: "partial",
} as const;
export type CatalogRunStatus =
  (typeof CatalogRunStatus)[keyof typeof CatalogRunStatus];
