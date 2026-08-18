import type { CapabilityArtifact, SurfaceObservation } from "@cu/contracts";
import { RecoverableErrorCode } from "@cu/contracts";

export interface ExceptionalState {
  code: RecoverableErrorCode;
  signal: string;
  summary: string;
}

/**
 * Detect known recoverable UI conditions from observation — not LLM inference.
 * Only fires when the artifact declared a matching recovery rule.
 */
export function detectExceptionalState(
  observation: SurfaceObservation,
  artifact: CapabilityArtifact,
): ExceptionalState | null {
  const rules = artifact.recoveryRules ?? [];
  const wantsInterstitial = rules.some(
    (r) => r.when === RecoverableErrorCode.KnownInterstitial,
  );
  const wantsDialog = rules.some(
    (r) => r.when === RecoverableErrorCode.TemporaryDialog,
  );

  const dialog = observation.dialogs[0];
  if (dialog && wantsInterstitial) {
    return {
      code: RecoverableErrorCode.KnownInterstitial,
      signal: "known_interstitial",
      summary: dialog.title ?? dialog.text ?? "known interstitial",
    };
  }
  if (dialog && wantsDialog) {
    return {
      code: RecoverableErrorCode.TemporaryDialog,
      signal: "temporary_dialog",
      summary: dialog.title ?? dialog.text ?? "temporary dialog",
    };
  }
  return null;
}
