import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

/**
 * Resolve monorepo root (contains apps/, artifacts/, evidence/, packages/).
 * Works whether cwd is repo root or apps/api.
 */
export function resolveRepoRoot(start = process.cwd()): string {
  if (
    process.env.VERCEL &&
    existsSync(path.join(process.cwd(), "artifacts", "capabilities")) &&
    existsSync(path.join(process.cwd(), "evidence"))
  ) {
    return process.cwd();
  }
  let dir = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    if (
      existsSync(path.join(dir, "pnpm-workspace.yaml")) &&
      existsSync(path.join(dir, "artifacts", "capabilities")) &&
      existsSync(path.join(dir, "evidence"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: apps/api/src/infrastructure → ../../.. (import.meta is empty in the CJS Vercel bundle)
  let here = process.cwd();
  try {
    if (import.meta.url) {
      here = path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    /* bundled CJS */
  }
  return path.resolve(here, "../../..");
}

/** Generated capability artifacts (not source code). */
export function resolveArtifactsRoot(repoRoot = resolveRepoRoot()): string {
  return path.join(repoRoot, "artifacts", "capabilities");
}

/** Runtime evidence directory (repo root unless a test sandbox overrides it). */
export function resolveEvidenceRoot(
  repoRoot = resolveRepoRoot(),
  evidenceDir = "evidence",
): string {
  return path.isAbsolute(evidenceDir)
    ? evidenceDir
    : path.join(repoRoot, evidenceDir);
}

export function resolveWebDist(repoRoot = resolveRepoRoot()): string {
  return path.join(repoRoot, "apps/web/dist");
}
