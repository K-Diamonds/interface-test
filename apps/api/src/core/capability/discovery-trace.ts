import type { AgentAction, ObservableControl, SurfaceObservation } from "@cu/contracts";

/** One discovery turn — owned by core so the compiler never imports application. */
export interface DiscoveryTraceStep {
  index: number;
  action: AgentAction;
  observationBefore: SurfaceObservation;
  observationAfter?: SurfaceObservation;
  ok: boolean;
  error?: string;
  resolvedControl?: ObservableControl;
}
