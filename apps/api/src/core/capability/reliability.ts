import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  EvidenceKind,
  ExecutionResultStatus,
  type CapabilityReliability,
} from "@cu/contracts";

const MIN_SAMPLE = 2;

/**
 * Replay-only reliability from committed evidence. Not a scoring platform.
 * Business outcomes are not treated as infrastructure failures.
 */
export async function summarizeCapabilityReliability(input: {
  capabilityId: string;
  version: number;
  rootDir: string;
}): Promise<CapabilityReliability> {
  const dir = path.join(input.rootDir, "evidence", EvidenceKind.Replay);
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    names = [];
  }

  let successfulRuns = 0;
  let businessOutcomes = 0;
  let hardFailures = 0;
  let interventions = 0;

  for (const name of names) {
    const resultPath = path.join(dir, name, "result.json");
    const st = await stat(resultPath).catch(() => null);
    if (!st?.isFile()) continue;
    try {
      const raw = JSON.parse(await readFile(resultPath, "utf8")) as {
        status?: string;
        capabilityId?: string;
        capabilityVersion?: number;
      };
      if (raw.capabilityId !== input.capabilityId) continue;
      if (raw.capabilityVersion !== input.version) continue;
      if (raw.status === ExecutionResultStatus.Success) successfulRuns += 1;
      else if (raw.status === ExecutionResultStatus.BusinessOutcome) {
        businessOutcomes += 1;
      } else if (raw.status === ExecutionResultStatus.InterventionRequired) {
        interventions += 1;
      } else if (raw.status === ExecutionResultStatus.Failure) {
        hardFailures += 1;
      }
    } catch {
      // skip malformed
    }
  }

  const sampleSize =
    successfulRuns + businessOutcomes + hardFailures + interventions;
  const expectedToComplete = successfulRuns + hardFailures;
  const executionReliability =
    expectedToComplete > 0 ? successfulRuns / expectedToComplete : undefined;

  let approvalReadiness: CapabilityReliability["approvalReadiness"] =
    "insufficient_data";
  if (sampleSize >= MIN_SAMPLE && hardFailures > 0) {
    approvalReadiness = "degraded";
  } else if (sampleSize >= MIN_SAMPLE && successfulRuns >= 1 && hardFailures === 0) {
    approvalReadiness = "candidate";
  }

  return {
    capabilityId: input.capabilityId,
    version: input.version,
    sampleSize,
    successfulRuns,
    businessOutcomes,
    hardFailures,
    interventions,
    executionReliability,
    status: sampleSize < MIN_SAMPLE ? "insufficient_data" : "ok",
    approvalReadiness,
  };
}
