import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { Controller, InterventionStatus } from "@cu/contracts";
import { createInterventionId } from "@cu/contracts";

export interface InterventionRequest {
  id: string;
  runId: string;
  capabilityId?: string;
  goal?: string;
  stepId?: string;
  reason: string;
  controller: typeof Controller.Human;
  createdAt: string;
  screenshotPath?: string;
  currentUrl?: string;
  stateSummary: string;
  status: InterventionStatus;
}

export function createInterventionRequest(input: {
  runId: string;
  reason: string;
  stateSummary: string;
  capabilityId?: string;
  goal?: string;
  stepId?: string;
  screenshotPath?: string;
  currentUrl?: string;
}): InterventionRequest {
  return {
    id: createInterventionId(),
    runId: input.runId,
    capabilityId: input.capabilityId,
    goal: input.goal,
    stepId: input.stepId,
    reason: input.reason,
    controller: Controller.Human,
    createdAt: new Date().toISOString(),
    screenshotPath: input.screenshotPath,
    currentUrl: input.currentUrl,
    stateSummary: input.stateSummary,
    status: InterventionStatus.Open,
  };
}

export async function persistIntervention(
  evidenceDir: string,
  intervention: InterventionRequest,
): Promise<string> {
  await mkdir(evidenceDir, { recursive: true });
  const file = path.join(evidenceDir, "intervention.json");
  await writeFile(file, JSON.stringify(intervention, null, 2) + "\n", "utf8");
  return file;
}
