import type {
  EvidenceReference,
  FailureCategory,
  ExecutionResultStatus as ExecutionResultStatusType,
} from "@cu/contracts";
import {
  ExecutionResultStatus,
} from "@cu/contracts";
import type { ComputerSurface } from "../surface.js";
import type { SessionController } from "../intervention/session-controller.js";
import type { InterventionRequest } from "../intervention/intervention.js";
import type { AutomationPolicy } from "../policy/policy-types.js";

export { ExecutionResultStatus };

export type OpenOperatorSession = (input: {
  port?: number;
  session: SessionController;
  intervention: InterventionRequest;
  operatorPolicy: AutomationPolicy;
}) => Promise<{ url: string; close: () => Promise<void> }>;

export type CapabilityExecutionResult =
  | {
      status: typeof ExecutionResultStatus.Success;
      runId: string;
      capabilityId: string;
      outputs: Record<string, unknown>;
      evidence: EvidenceReference[];
    }
  | {
      status: typeof ExecutionResultStatus.BusinessOutcome;
      runId: string;
      capabilityId: string;
      outcome: {
        code: string;
        message: string;
        data?: Record<string, unknown>;
      };
      evidence: EvidenceReference[];
    }
  | {
      status: typeof ExecutionResultStatus.Failure;
      runId: string;
      capabilityId: string;
      failure: {
        category: FailureCategory;
        code: string;
        message: string;
        stepId?: string;
        expected?: unknown;
        observed?: unknown;
        recoverable: boolean;
        url?: string;
        timestamp: string;
      };
      evidence: EvidenceReference[];
    }
  | {
      status: typeof ExecutionResultStatus.InterventionRequired;
      runId: string;
      capabilityId: string;
      interventionId: string;
      reason: string;
      stepId?: string;
      operatorUrl?: string;
      liveViewUrl?: string;
      evidence: EvidenceReference[];
    };

export interface ReplayOptions {
  runId?: string;
  headless?: boolean;
  /** Monorepo root for resolving production paths. Prefer resolveRepoRoot(). */
  rootDir?: string;
  /**
   * Isolated evidence parent for tests (writes to `<evidenceRoot>/<kind>/<runId>`).
   * Production leaves this unset so evidence stays under repo-root `/evidence`.
   */
  evidenceRoot?: string;
  surface?: ComputerSurface;
  /**
   * Application/infrastructure supplies the browser (or other) adapter.
   * Replay never constructs Playwright itself.
   */
  createSurface?: (input: { tracesDir: string }) => Promise<ComputerSurface>;
  session?: SessionController;
  /** Application-version overlay key (compatibility.versionOverrides). */
  appVersion?: string;
  /** Tenant overlay key (compatibility.tenantOverrides). */
  tenantId?: string;
  enableOperator?: boolean;
  operatorPort?: number;
  openOperator?: OpenOperatorSession;
  startFromStepId?: string;
  /** Reconnect to an existing provider session instead of creating a new one. */
  reconnectSessionId?: string;
  closeSurface?: boolean;
}

export type { ExecutionResultStatusType };
