import type { AutomationPolicy } from "../../core/policy/policy.js";
import type { ComputerSurface } from "../../core/surface.js";
import type { Logger } from "./logger.js";
import type { EvidenceStore } from "./evidence.js";
import type { SessionController } from "../../core/intervention/session-controller.js";
import type { RunMode } from "@cu/contracts";

export interface RunContext {
  runId: string;
  mode: RunMode;
  surface: ComputerSurface;
  policy: AutomationPolicy;
  logger: Logger;
  evidence: EvidenceStore;
  session: SessionController;
  headless: boolean;
  startedAt: string;
}
