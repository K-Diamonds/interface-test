import { ControllerOwnershipError } from "../errors.js";
import {
  Actor,
  Controller,
  InterventionStatus,
  ResumeWaitResult,
  SessionExecutionState,
} from "@cu/contracts";
import { assertTransition } from "./control-state.js";
import type { InterventionRequest } from "./intervention.js";
import type { ComputerSurface } from "../surface.js";

export interface HumanActionRecord {
  actor: typeof Actor.Human;
  action: string;
  target?: string;
  value?: string;
  controlRef?: string;
  timestamp: string;
}

/**
 * Owns control transfer for a live automation session.
 * The surface/browser must remain open during human intervention.
 */
export class SessionController {
  private state: SessionExecutionState = SessionExecutionState.Created;
  private controller: Controller = Controller.None;
  private intervention: InterventionRequest | null = null;
  private humanActions: HumanActionRecord[] = [];
  private resumeWaiters: Array<() => void> = [];
  private abortWaiters: Array<(reason: string) => void> = [];
  private aborted = false;

  constructor(
    readonly runId: string,
    private surface: ComputerSurface | null = null,
  ) {}

  attachSurface(surface: ComputerSurface): void {
    this.surface = surface;
  }

  getSurface(): ComputerSurface {
    if (!this.surface) {
      throw new Error("No surface attached to session");
    }
    return this.surface;
  }


  getState(): SessionExecutionState {
    return this.state;
  }

  getController(): Controller {
    return this.controller;
  }

  getIntervention(): InterventionRequest | null {
    return this.intervention;
  }

  getHumanActions(): HumanActionRecord[] {
    return [...this.humanActions];
  }

  start(): void {
    assertTransition(this.state, SessionExecutionState.Running);
    this.state = SessionExecutionState.Running;
    this.controller = Controller.Automation;
  }

  assertController(expected: Controller): void {
    if (this.controller !== expected) {
      throw new ControllerOwnershipError(
        `Expected controller "${expected}" but current controller is "${this.controller}" (state=${this.state})`,
      );
    }
  }

  async requestIntervention(intervention: InterventionRequest): Promise<void> {
    if (
      this.state === SessionExecutionState.Running ||
      this.state === SessionExecutionState.Paused
    ) {
      assertTransition(this.state, SessionExecutionState.AwaitingHuman);
      this.state = SessionExecutionState.AwaitingHuman;
    }
    this.intervention = intervention;
    this.controller = Controller.None;

    assertTransition(this.state, SessionExecutionState.HumanControl);
    this.state = SessionExecutionState.HumanControl;
    this.controller = Controller.Human;
  }

  recordHumanAction(action: Omit<HumanActionRecord, "actor" | "timestamp">): void {
    this.assertController(Controller.Human);
    this.humanActions.push({
      actor: Actor.Human,
      timestamp: new Date().toISOString(),
      ...action,
    });
  }

  resume(): void {
    this.assertController(Controller.Human);
    assertTransition(this.state, SessionExecutionState.Resuming);
    this.state = SessionExecutionState.Resuming;
    this.controller = Controller.None;
    if (this.intervention) {
      this.intervention = {
        ...this.intervention,
        status: InterventionStatus.Resolved,
      };
    }
    assertTransition(this.state, SessionExecutionState.Running);
    this.state = SessionExecutionState.Running;
    this.controller = Controller.Automation;
    for (const resolve of this.resumeWaiters) resolve();
    this.resumeWaiters = [];
  }

  abort(reason = "Aborted by operator"): void {
    if (
      this.state !== SessionExecutionState.Failed &&
      this.state !== SessionExecutionState.Completed
    ) {
      try {
        assertTransition(this.state, SessionExecutionState.Failed);
      } catch {
        // Abort is terminal even from states that have no Failed edge.
      }
      this.state = SessionExecutionState.Failed;
    }
    this.controller = Controller.None;
    this.aborted = true;
    if (this.intervention) {
      this.intervention = {
        ...this.intervention,
        status: InterventionStatus.Aborted,
      };
    }
    for (const reject of this.abortWaiters) reject(reason);
    this.abortWaiters = [];
    for (const resolve of this.resumeWaiters) resolve();
    this.resumeWaiters = [];
  }

  complete(): void {
    assertTransition(this.state, SessionExecutionState.Completed);
    this.state = SessionExecutionState.Completed;
    this.controller = Controller.None;
  }

  fail(): void {
    if (
      this.state === SessionExecutionState.Failed ||
      this.state === SessionExecutionState.Completed
    ) {
      return;
    }
    assertTransition(this.state, SessionExecutionState.Failed);
    this.state = SessionExecutionState.Failed;
    this.controller = Controller.None;
  }

  waitForResume(): Promise<ResumeWaitResult> {
    if (this.aborted) return Promise.resolve(ResumeWaitResult.Aborted);
    if (
      this.state === SessionExecutionState.Running &&
      this.controller === Controller.Automation
    ) {
      return Promise.resolve(ResumeWaitResult.Resumed);
    }
    return new Promise((resolve) => {
      this.resumeWaiters.push(() =>
        resolve(this.aborted ? ResumeWaitResult.Aborted : ResumeWaitResult.Resumed),
      );
      this.abortWaiters.push(() => resolve(ResumeWaitResult.Aborted));
    });
  }
}
