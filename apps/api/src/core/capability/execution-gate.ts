import { CapabilityStatus, ReplayExecutionContext } from "@cu/contracts";
import { HttpError } from "../errors.js";

/**
 * Governance gate. Status lives on the artifact as approval metadata;
 * id+version execution steps stay immutable.
 */
export function assertInvocable(input: {
  status: CapabilityStatus;
  capabilityId: string;
  version: number;
  executionContext: ReplayExecutionContext;
  allowDraft: boolean;
}): void {
  const label = `${input.capabilityId}@v${input.version}`;
  if (input.status === CapabilityStatus.Deprecated) {
    throw new HttpError(
      409,
      "CAPABILITY_DEPRECATED",
      `Capability ${label} is deprecated`,
    );
  }
  if (input.status === CapabilityStatus.Approved) return;

  const unattended = input.executionContext === ReplayExecutionContext.Unattended;
  if (unattended) {
    throw new HttpError(
      403,
      "CAPABILITY_NOT_APPROVED",
      `Capability ${label} is ${input.status}; unattended invocation requires approved`,
    );
  }
  if (!input.allowDraft) {
    throw new HttpError(
      403,
      "CAPABILITY_NOT_APPROVED",
      `Capability ${label} is ${input.status}; draft replay requires ALLOW_DRAFT_REPLAY=1 or explicit allowDraft`,
    );
  }
}
