import type {
  ActionResult,
  SurfaceCondition,
  SurfaceObservation,
  TargetDescriptor,
} from "@cu/contracts";

/**
 * Technology-agnostic computer surface.
 * Capability artifacts and the replay engine depend on this interface,
 * not on Playwright Page / DOM specifics.
 */
export interface ComputerSurface {
  observe(): Promise<SurfaceObservation>;

  navigate(url: string): Promise<ActionResult>;

  click(target: TargetDescriptor): Promise<ActionResult>;

  type(target: TargetDescriptor, value: string): Promise<ActionResult>;

  select?(target: TargetDescriptor, value: string): Promise<ActionResult>;

  read(target: TargetDescriptor): Promise<string>;

  /** Count matching elements for a target (generic; no domain semantics). */
  count(target: TargetDescriptor): Promise<number>;

  waitFor(condition: SurfaceCondition): Promise<void>;

  screenshot(): Promise<Buffer>;

  getCurrentLocation(): Promise<string>;

  close(): Promise<void>;

  /** Optional adapter hook — Playwright records a trace zip; other surfaces omit this. */
  stopTracing?(path: string): Promise<void>;
}
