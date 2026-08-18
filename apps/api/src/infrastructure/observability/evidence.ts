import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { EvidenceKind, EvidenceRefKind } from "@cu/contracts";
import type { EvidenceReference } from "@cu/contracts";
import { loadConfig } from "../config.js";
import { resolveEvidenceRoot, resolveRepoRoot } from "../paths.js";
import { redactValue } from "../../core/policy/redaction.js";
import {
  evidenceObjectKey,
  inferEvidenceKeyFromPath,
  mirrorRepoRelativeFile,
} from "../persistence/remote-mirror.js";

export interface EvidenceStoreOptions {
  /**
   * Absolute directory that will contain `<kind>/<runId>/`.
   * Tests MUST pass an isolated temp path. Production leaves this unset
   * so evidence always lands under `<repo-root>/evidence`.
   */
  evidenceRoot?: string;
  /** Repo root used for relative path serialization. Defaults to resolveRepoRoot(). */
  repoRoot?: string;
}

/**
 * Serialize a filesystem path as a repo-relative POSIX path.
 * Rejects absolute developer-machine paths from committed evidence.
 */
export function toRepoRelativePath(repoRoot: string, absolutePath: string): string {
  const root = path.resolve(repoRoot);
  const file = path.resolve(absolutePath);
  const relative = path.relative(root, file);
  if (
    path.isAbsolute(relative) ||
    relative.startsWith("..") ||
    /^[A-Za-z]:[\\/]/.test(relative) ||
    relative.includes("/Users/") ||
    relative.includes("/home/")
  ) {
    throw new Error(
      `Evidence path must stay inside the repository (got ${absolutePath})`,
    );
  }
  return relative.split(path.sep).join("/");
}

export class EvidenceStore {
  readonly dir: string;
  /** Directory used as the root for relative evidence paths (repo root or test sandbox). */
  private readonly pathBase: string;
  private readonly kind: EvidenceKind;
  private readonly runId: string;
  private refs: EvidenceReference[] = [];

  private constructor(
    dir: string,
    pathBase: string,
    kind: EvidenceKind,
    runId: string,
  ) {
    this.dir = dir;
    this.pathBase = pathBase;
    this.kind = kind;
    this.runId = runId;
  }

  /**
   * Create an evidence directory.
   * Production: always `<repo-root>/evidence/<kind>/<runId>`.
   * Tests: pass `{ evidenceRoot: tempDir }` so writes never touch reviewer evidence.
   */
  static async create(
    kind: EvidenceKind,
    runId: string,
    options: EvidenceStoreOptions = {},
  ): Promise<EvidenceStore> {
    const repoRoot = resolveRepoRoot(options.repoRoot ?? process.cwd());
    const config = loadConfig();
    const defaultRoot = resolveEvidenceRoot(repoRoot, config.evidence.rootDir);
    const evidenceRoot = options.evidenceRoot
      ? path.resolve(options.evidenceRoot)
      : process.env.VERCEL
        ? path.join("/tmp", "evidence")
        : defaultRoot;
    const dir = path.join(evidenceRoot, kind, runId);
    await mkdir(dir, { recursive: true });
    // Relative paths are anchored at the parent of the evidence root
    // (repo root in production; test sandbox parent in isolation).
    const pathBase = process.env.VERCEL ? "/tmp" : path.dirname(evidenceRoot);
    return new EvidenceStore(dir, pathBase, kind, runId);
  }

  private relative(file: string): string {
    return toRepoRelativePath(this.pathBase, file);
  }

  private async mirror(file: string): Promise<void> {
    const key =
      inferEvidenceKeyFromPath(file) ??
      evidenceObjectKey(this.kind, this.runId, path.basename(file));
    await mirrorRepoRelativeFile(file, key).catch(() => undefined);
  }

  async saveScreenshot(name: string, buffer: Buffer): Promise<string> {
    const file = path.join(this.dir, name);
    await writeFile(file, buffer);
    await this.mirror(file);
    const relative = this.relative(file);
    this.refs.push({
      kind: EvidenceRefKind.Screenshot,
      path: relative,
      label: name,
    });
    return relative;
  }

  async saveJson(name: string, data: unknown): Promise<string> {
    const file = path.join(this.dir, name);
    await writeFile(
      file,
      JSON.stringify(redactValue(data), null, 2) + "\n",
      "utf8",
    );
    await this.mirror(file);
    const relative = this.relative(file);
    this.refs.push({ kind: EvidenceRefKind.Json, path: relative, label: name });
    return relative;
  }

  async copyArtifact(
    sourcePath: string,
    destName = "capability.json",
  ): Promise<string> {
    const dest = path.join(this.dir, destName);
    await copyFile(sourcePath, dest);
    await this.mirror(dest);
    const relative = this.relative(dest);
    this.refs.push({
      kind: EvidenceRefKind.Json,
      path: relative,
      label: destName,
    });
    return relative;
  }

  addRef(ref: EvidenceReference): void {
    const normalized = path.isAbsolute(ref.path)
      ? this.relative(ref.path)
      : ref.path.split(path.sep).join("/");
    this.refs.push({ ...ref, path: normalized });
  }

  getReferences(): EvidenceReference[] {
    return [...this.refs];
  }
}
