import {
  Controller,
  SessionExecutionState,
} from "@cu/contracts";

export { Controller, SessionExecutionState };

const ALLOWED_TRANSITIONS: Record<SessionExecutionState, SessionExecutionState[]> = {
  [SessionExecutionState.Created]: [
    SessionExecutionState.Running,
    SessionExecutionState.Failed,
  ],
  [SessionExecutionState.Running]: [
    SessionExecutionState.Paused,
    SessionExecutionState.AwaitingHuman,
    SessionExecutionState.Completed,
    SessionExecutionState.Failed,
  ],
  [SessionExecutionState.Paused]: [
    SessionExecutionState.Running,
    SessionExecutionState.AwaitingHuman,
    SessionExecutionState.Failed,
  ],
  [SessionExecutionState.AwaitingHuman]: [
    SessionExecutionState.HumanControl,
    SessionExecutionState.Failed,
  ],
  [SessionExecutionState.HumanControl]: [
    SessionExecutionState.Resuming,
    SessionExecutionState.Failed,
    SessionExecutionState.Completed,
  ],
  [SessionExecutionState.Resuming]: [
    SessionExecutionState.Running,
    SessionExecutionState.Failed,
  ],
  [SessionExecutionState.Completed]: [],
  [SessionExecutionState.Failed]: [],
};

export function canTransition(
  from: SessionExecutionState,
  to: SessionExecutionState,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(
  from: SessionExecutionState,
  to: SessionExecutionState,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid session transition: ${from} → ${to}`);
  }
}
