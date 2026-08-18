import { DialogKind, LocatorKind, WaitConditionType } from "../capability/enums.js";
import type { TargetDescriptor } from "../capability/schema.js";
import type { DriftSignal } from "../execution/enums.js";

export type {
  LocatorStrategy,
  TargetDescriptor,
  ElementFingerprint,
} from "../capability/schema.js";


export interface LocatorCandidate {
  strategy: import("../capability/schema.js").LocatorStrategy;
  confidence: number;
}

export interface ObservableControl {
  ref: string;
  role?: string;
  accessibleName?: string;
  text?: string;
  tag?: string;
  inputType?: string;
  value?: string;
  disabled?: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
  candidateLocators: LocatorCandidate[];
}

export interface ObservableDialog {
  ref: string;
  title?: string;
  text?: string;
  kind?: DialogKind;
}

/** Generic computer-use observation — no application business concepts. */
export interface SurfaceObservation {
  location: string;
  title?: string;
  controls: ObservableControl[];
  visibleText: string[];
  dialogs: ObservableDialog[];
  /** Generic signals only (e.g. numericBadge). Application profiles may interpret. */
  signals?: Array<{ kind: string; value: unknown; label?: string }>;
  stateHints: Record<string, unknown>;
  screenshotPath?: string;
  fingerprint: string;
}

export type SurfaceCondition =
  | { type: typeof WaitConditionType.Url; pattern: string }
  | { type: typeof WaitConditionType.Text; text: string }
  | { type: typeof WaitConditionType.Element; target: TargetDescriptor }
  | { type: typeof WaitConditionType.Timeout; ms: number };

export interface ActionResult {
  ok: boolean;
  message?: string;
  durationMs: number;
  redirectedTo?: string;
  primaryStrategy?: LocatorKind;
  resolvedStrategy?: LocatorKind;
  usedFallback?: boolean;
  driftSignals?: DriftSignal[];
}
