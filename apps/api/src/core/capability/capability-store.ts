import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CapabilityArtifact } from "@cu/contracts";
import { CapabilityArtifactSchema } from "@cu/contracts";
import { validateCapabilityArtifact } from "./validator.js";
import { capabilityPath, nextCapabilityVersion } from "./versioning.js";
import { ValidationError } from "../errors.js";
import type { CapabilityRepository } from "../domain/ports.js";
import {
  resolveArtifactsRoot,
  resolveRepoRoot,
} from "../../infrastructure/paths.js";
import { getObjectStore } from "../../infrastructure/persistence/object-store.js";
import { capabilityObjectKey } from "../../infrastructure/persistence/remote-mirror.js";

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

function assertSafeCapabilityId(id: string): void {
  if (!SAFE_ID.test(id)) {
    throw new ValidationError(
      `Unsafe capability id "${id}" — use opaque alphanumeric ids only`,
    );
  }
  if (id.includes("..") || id.includes("/") || id.includes("\\")) {
    throw new ValidationError(`Path traversal rejected in capability id: ${id}`);
  }
}

function assertSafeRelativePath(filePath: string, rootDir: string): string {
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.join(rootDir, filePath);
  const resolved = path.resolve(absolute);
  const root = path.resolve(rootDir);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    // Allow absolute paths under repo artifacts/ or explicit capability files
    const cwd = path.resolve(process.cwd());
    if (!resolved.startsWith(cwd + path.sep)) {
      throw new ValidationError(`Path escapes workspace: ${filePath}`);
    }
  }
  return resolved;
}

/**
 * Filesystem capability repository with atomic writes and path safety.
 * Capability versions are immutable — never silently overwrite.
 */
export class CapabilityStore implements CapabilityRepository {
  private readonly artifactsRoot: string;

  constructor(private readonly rootDir: string = resolveRepoRoot()) {
    this.artifactsRoot = resolveArtifactsRoot(this.rootDir);
  }

  async listVersions(capabilityId: string): Promise<number[]> {
    assertSafeCapabilityId(capabilityId);
    const dir = path.join(this.artifactsRoot, capabilityId);
    const versions = new Set<number>();
    try {
      const entries = await readdir(dir);
      for (const e of entries) {
        const m = /^v(\d+)\.json$/.exec(e);
        if (m) versions.add(Number(m[1]));
      }
    } catch {
      // local directory may be absent on hosted runtimes
    }
    const store = getObjectStore();
    if (store) {
      const keys = await store.list(`artifacts/capabilities/${capabilityId}/`);
      for (const key of keys) {
        const m = /\/v(\d+)\.json$/.exec(key);
        if (m) versions.add(Number(m[1]));
      }
    }
    return [...versions].sort((a, b) => a - b);
  }

  async listIds(): Promise<string[]> {
    const ids = new Set<string>();
    try {
      const entries = await readdir(this.artifactsRoot);
      for (const id of entries) {
        if (SAFE_ID.test(id)) ids.add(id);
      }
    } catch {
      // hosted may have no local artifacts dir besides includeFiles
    }
    const store = getObjectStore();
    if (store) {
      const keys = await store.list("artifacts/capabilities/");
      for (const key of keys) {
        const m = /^artifacts\/capabilities\/([^/]+)\//.exec(key);
        if (m && SAFE_ID.test(m[1]!)) ids.add(m[1]!);
      }
    }
    return [...ids].sort();
  }

  async load(filePath: string): Promise<CapabilityArtifact> {
    const absolute = assertSafeRelativePath(filePath, this.rootDir);
    try {
      const raw = await readFile(absolute, "utf8");
      const json = JSON.parse(raw) as unknown;
      validateCapabilityArtifact(json);
      return CapabilityArtifactSchema.parse(json);
    } catch (err) {
      const remote = await this.loadRemote(filePath);
      if (remote) return remote;
      throw err;
    }
  }

  async get(id: string, version: number): Promise<CapabilityArtifact> {
    assertSafeCapabilityId(id);
    if (!Number.isInteger(version) || version < 1) {
      throw new ValidationError(`Invalid capability version: ${version}`);
    }
    return this.load(capabilityPath(id, version));
  }

  async save(
    artifact: CapabilityArtifact,
    options?: { overwrite?: boolean },
  ): Promise<string> {
    validateCapabilityArtifact(artifact);
    assertSafeCapabilityId(artifact.capability.id);

    const versions = await this.listVersions(artifact.capability.id);
    if (!options?.overwrite && versions.includes(artifact.capability.version)) {
      throw new ValidationError(
        `Capability ${artifact.capability.id} v${artifact.capability.version} already exists. Bump version instead of overwriting.`,
      );
    }

    const relative = capabilityPath(
      artifact.capability.id,
      artifact.capability.version,
    );
    const absolute = path.join(this.rootDir, relative);
    try {
      await mkdir(path.dirname(absolute), { recursive: true });
    } catch {
      // Hosted function disk may be read-only.
    }

    // Atomic write: temp file → rename to avoid half-written artifacts
    const tmp = `${absolute}.${process.pid}.${Date.now()}.tmp`;
    const payload = JSON.stringify(artifact, null, 2) + "\n";
    try {
      await writeFile(tmp, payload, "utf8");
      await rename(tmp, absolute);
    } catch {
      // Vercel function disk is ephemeral / often read-only outside /tmp.
    }
    const store = getObjectStore();
    if (store) {
      await store.put(
        capabilityObjectKey(artifact.capability.id, artifact.capability.version),
        payload,
        "application/json",
      );
    }
    return relative;
  }

  async saveNewVersion(
    artifact: Omit<CapabilityArtifact, "capability"> & {
      capability: Omit<CapabilityArtifact["capability"], "version"> & {
        version?: number;
      };
    },
  ): Promise<{ path: string; artifact: CapabilityArtifact }> {
    const versions = await this.listVersions(artifact.capability.id);
    const version =
      artifact.capability.version ?? nextCapabilityVersion(versions);
    const full: CapabilityArtifact = {
      ...artifact,
      capability: {
        ...artifact.capability,
        version,
      },
    };
    const savedPath = await this.save(full);
    return { path: savedPath, artifact: full };
  }

  private async loadRemote(filePath: string): Promise<CapabilityArtifact | null> {
    const store = getObjectStore();
    if (!store) return null;
    const posix = filePath.split(path.sep).join("/");
    const m = /artifacts\/capabilities\/([^/]+)\/v(\d+)\.json$/.exec(posix);
    const key = m
      ? capabilityObjectKey(m[1]!, Number(m[2]))
      : posix.replace(/^\/+/, "");
    const buf = await store.get(key);
    if (!buf) return null;
    const json = JSON.parse(buf.toString("utf8")) as unknown;
    validateCapabilityArtifact(json);
    return CapabilityArtifactSchema.parse(json);
  }
}
