import { readFile } from "node:fs/promises";
import path from "node:path";
import { getObjectStore } from "./object-store.js";

/** Mirror a local evidence/artifact file into hosted object storage. */
export async function mirrorRepoRelativeFile(
  absolutePath: string,
  key: string,
): Promise<void> {
  const store = getObjectStore();
  if (!store) return;
  const body = await readFile(absolutePath);
  await store.put(key, body);
}

export function evidenceObjectKey(
  kind: string,
  runId: string,
  fileName: string,
): string {
  return `evidence/${kind}/${runId}/${fileName}`;
}

export function capabilityObjectKey(id: string, version: number): string {
  return `artifacts/capabilities/${id}/v${version}.json`;
}

export function jobObjectKey(runId: string): string {
  return `hosted/jobs/${runId}.json`;
}

export function inferEvidenceKeyFromPath(absolutePath: string): string | undefined {
  const posix = absolutePath.split(path.sep).join("/");
  const match = /(?:^|\/)evidence\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(posix);
  if (!match) return undefined;
  return evidenceObjectKey(match[1]!, match[2]!, match[3]!);
}
