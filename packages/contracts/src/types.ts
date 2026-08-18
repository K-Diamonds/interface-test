import type { BackoffStrategy } from "./capability/enums.js";
import type { EvidenceRefKind } from "./common/enums.js";
import type { RecoverableErrorCode } from "./execution/enums.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export interface EvidenceReference {
  kind: EvidenceRefKind;
  path: string;
  label?: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  delayMs: number;
  backoff?: BackoffStrategy;
  retryOn: RecoverableErrorCode[];
}
