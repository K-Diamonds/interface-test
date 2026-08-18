import { ActionType, LocatorKind, type SurfaceObservation } from "@cu/contracts";
import { redactSecrets } from "../../core/policy/redaction.js";

export function buildObservationSummary(
  observation: SurfaceObservation,
  options?: { maxControls?: number },
): string {
  const maxControls = options?.maxControls ?? 40;
  const controls = observation.controls.slice(0, maxControls).map((c) => {
    const testId = c.candidateLocators.find(
      (l) => l.strategy.kind === LocatorKind.TestId,
    );
    const parts = [
      `ref=${c.ref}`,
      c.role ? `role=${c.role}` : null,
      c.accessibleName ? `name=${JSON.stringify(c.accessibleName)}` : null,
      c.text && c.text !== c.accessibleName
        ? `text=${JSON.stringify(c.text)}`
        : null,
      c.tag ? `tag=${c.tag}` : null,
      c.inputType ? `inputType=${c.inputType}` : null,
      testId && testId.strategy.kind === LocatorKind.TestId
        ? `testId=${testId.strategy.testId}`
        : null,
      c.disabled ? "disabled" : null,
    ].filter(Boolean);
    return `- ${parts.join(" ")}`;
  });

  const dialogs =
    observation.dialogs.length === 0
      ? "none"
      : observation.dialogs
          .map((d) => `${d.ref}:${d.title ?? ""} ${d.text ?? ""}`)
          .join("; ");

  const text = observation.visibleText.slice(0, 20).join(" | ");

  return redactSecrets(
    [
      `location: ${observation.location}`,
      `title: ${observation.title ?? ""}`,
      `fingerprint: ${observation.fingerprint}`,
      `stateHints: ${JSON.stringify(observation.stateHints)}`,
      `dialogs: ${dialogs}`,
      `visibleText: ${text}`,
      `controls:`,
      ...controls,
    ].join("\n"),
  );
}

export function summarizeHistory(
  history: Array<{ actionType: ActionType; reasoning: string; ok: boolean }>,
): string {
  if (history.length === 0) return "(none)";
  return history
    .slice(-8)
    .map(
      (h, i) =>
        `${i + 1}. ${h.actionType} (${h.ok ? "ok" : "fail"}): ${h.reasoning}`,
    )
    .join("\n");
}
