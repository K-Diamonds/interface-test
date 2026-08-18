import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CapabilityStatus,
  EvidenceKind,
  RunMode,
  RunStatusSchema,
  type CapabilityArtifact,
  type RunStatus,
} from "@cu/contracts";
import { CapabilityStore } from "../../core/capability/capability-store.js";
import { getObjectStore } from "./object-store.js";

const SAFE_FILE = /^[a-zA-Z0-9._-]+$/;

export interface RunSummary {
  kind: EvidenceKind;
  runId: string;
  path: string;
  mtime: string;
  hasResult: boolean;
  hasEvents: boolean;
  hasIntervention: boolean;
  status?: RunStatus;
  capabilityId?: string;
  mode?: RunMode;
}

export interface CapabilitySummary {
  id: string;
  versions: number[];
  latestVersion: number;
  name?: string;
  status?: CapabilityStatus;
  description?: string;
}

function isSafeSegment(value: string): boolean {
  return SAFE_FILE.test(value) && !value.includes("..");
}

export async function listCapabilities(
  rootDir = process.cwd(),
): Promise<CapabilitySummary[]> {
  const store = new CapabilityStore(rootDir);
  const ids = await store.listIds();
  const out: CapabilitySummary[] = [];
  for (const id of ids) {
    if (!isSafeSegment(id)) continue;
    const versions = await store.listVersions(id);
    if (versions.length === 0) continue;
    const latestVersion = versions[versions.length - 1]!;
    try {
      const artifact = await store.get(id, latestVersion);
      out.push({
        id,
        versions,
        latestVersion,
        name: artifact.capability.name,
        status: artifact.capability.status,
        description: artifact.capability.description,
      });
    } catch {
      // skip unreadable / invalid artifacts
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadCapabilityArtifact(
  id: string,
  version: number,
  rootDir = process.cwd(),
): Promise<CapabilityArtifact | null> {
  if (!isSafeSegment(id) || !Number.isInteger(version) || version < 1) {
    return null;
  }
  try {
    return await new CapabilityStore(rootDir).get(id, version);
  } catch {
    return null;
  }
}

export async function listRuns(
  rootDir = process.cwd(),
  kindFilter?: EvidenceKind,
): Promise<RunSummary[]> {
  const evidenceRoot = path.join(rootDir, "evidence");
  const kinds = kindFilter
    ? [kindFilter]
    : (Object.values(EvidenceKind) as EvidenceKind[]);

  const runs: RunSummary[] = [];
  for (const kind of kinds) {
    const kindDir = path.join(evidenceRoot, kind);
    let runIds: string[] = [];
    try {
      runIds = await readdir(kindDir);
    } catch {
      continue;
    }
    for (const runId of runIds) {
      if (!isSafeSegment(runId) && !runId.startsWith("run_")) {
        // allow canonical folder names like canonical-llm-run, scripted-discovery
        if (!/^[a-zA-Z0-9._-]+$/.test(runId)) continue;
      }
      const dir = path.join(kindDir, runId);
      const st = await stat(dir).catch(() => null);
      if (!st?.isDirectory()) continue;

      const files = await readdir(dir).catch(() => [] as string[]);
      const hasResult = files.includes("result.json");
      const hasEvents = files.includes("events.jsonl");
      const hasIntervention = files.includes("intervention.json");

      let status: RunStatus | undefined;
      let capabilityId: string | undefined;
      let mode: RunMode | undefined;

      if (hasResult) {
        try {
          const result = JSON.parse(
            await readFile(path.join(dir, "result.json"), "utf8"),
          ) as Record<string, unknown>;
          const parsed = RunStatusSchema.safeParse(result.status);
          status = parsed.success ? parsed.data : undefined;
          capabilityId =
            typeof result.capabilityId === "string"
              ? result.capabilityId
              : undefined;
        } catch {
          // result.json may be missing on in-flight or failed-to-finalize runs.
        }
      }

      if (hasEvents) {
        try {
          const first = (
            await readFile(path.join(dir, "events.jsonl"), "utf8")
          )
            .split("\n")
            .find((l) => l.trim());
          if (first) {
            const ev = JSON.parse(first) as Record<string, unknown>;
            mode =
              ev.mode === RunMode.Discovery || ev.mode === RunMode.Replay
                ? ev.mode
                : undefined;
          }
        } catch {
          // Malformed events.jsonl — still list the run folder.
        }
      }

      runs.push({
        kind,
        runId,
        path: path.relative(rootDir, dir),
        mtime: st.mtime.toISOString(),
        hasResult,
        hasEvents,
        hasIntervention,
        status,
        capabilityId,
        mode,
      });
    }
  }

  await mergeRemoteEvidenceRuns(runs, kindFilter);

  return runs.sort((a, b) => b.mtime.localeCompare(a.mtime));
}

/** Resolve a run by opaque id across evidence kinds (newest match wins). */
export async function findRunById(
  runId: string,
  rootDir = process.cwd(),
): Promise<RunSummary | null> {
  if (!/^[a-zA-Z0-9._-]+$/.test(runId)) return null;
  const runs = await listRuns(rootDir);
  return runs.find((r) => r.runId === runId) ?? null;
}

export async function getRunDetailById(
  runId: string,
  rootDir = process.cwd(),
): Promise<Awaited<ReturnType<typeof getRunDetail>>> {
  const summary = await findRunById(runId, rootDir);
  if (!summary) return null;
  return getRunDetail(summary.kind, runId, rootDir);
}

export async function getRunDetail(
  kind: EvidenceKind,
  runId: string,
  rootDir = process.cwd(),
): Promise<{
  kind: EvidenceKind;
  runId: string;
  path: string;
  files: string[];
  result?: unknown;
  intervention?: unknown;
  humanActions?: unknown;
  events: unknown[];
} | null> {
  if (!Object.values(EvidenceKind).includes(kind)) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(runId)) return null;

  const dir = path.join(rootDir, "evidence", kind, runId);
  let files = await readdir(dir).catch(() => null as string[] | null);
  const remoteFiles = await listRemoteEvidenceFiles(kind, runId);
  if (!files && remoteFiles.length === 0) return null;
  files = [...new Set([...(files ?? []), ...remoteFiles])];

  const readJson = async (name: string) => {
    try {
      return JSON.parse(await readFile(path.join(dir, name), "utf8"));
    } catch {
      const remote = await readRemoteEvidenceJson(kind, runId, name);
      return remote;
    }
  };

  let events: unknown[] = [];
  if (files.includes("events.jsonl")) {
    const rawLocal = await readFile(path.join(dir, "events.jsonl"), "utf8").catch(
      () => "",
    );
    const raw =
      rawLocal ||
      ((await readRemoteEvidenceText(kind, runId, "events.jsonl")) ?? "");
    events = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { raw: line };
        }
      });
  }

  return {
    kind,
    runId,
    path: path.relative(rootDir, dir),
    files,
    result: files.includes("result.json")
      ? await readJson("result.json")
      : undefined,
    intervention: files.includes("intervention.json")
      ? await readJson("intervention.json")
      : undefined,
    humanActions: files.includes("human-actions.json")
      ? await readJson("human-actions.json")
      : undefined,
    events,
  };
}

export async function resolveEvidenceFile(
  kind: EvidenceKind,
  runId: string,
  fileName: string,
  rootDir = process.cwd(),
): Promise<string | null> {
  if (!Object.values(EvidenceKind).includes(kind)) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(runId)) return null;
  if (!SAFE_FILE.test(fileName)) return null;
  const file = path.join(rootDir, "evidence", kind, runId, fileName);
  try {
    const st = await stat(file);
    if (!st.isFile()) return null;
    return file;
  } catch {
    const buf = await readRemoteEvidenceBuffer(kind, runId, fileName);
    if (!buf) return null;
    const tmp = path.join("/tmp", "evidence", kind, runId);
    await mkdir(tmp, { recursive: true });
    const dest = path.join(tmp, fileName);
    await writeFile(dest, buf);
    return dest;
  }
}

async function mergeRemoteEvidenceRuns(
  runs: RunSummary[],
  kindFilter?: EvidenceKind,
): Promise<void> {
  const store = getObjectStore();
  if (!store) return;
  const existing = new Set(runs.map((r) => `${r.kind}:${r.runId}`));
  const keys = await store.list("evidence/");
  const grouped = new Map<string, { kind: EvidenceKind; runId: string; files: string[] }>();
  for (const key of keys) {
    const m = /^evidence\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(key);
    if (!m) continue;
    const kind = m[1] as EvidenceKind;
    if (!Object.values(EvidenceKind).includes(kind)) continue;
    if (kindFilter && kind !== kindFilter) continue;
    const runId = m[2]!;
    const file = m[3]!;
    const id = `${kind}:${runId}`;
    const current = grouped.get(id) ?? { kind, runId, files: [] };
    current.files.push(file);
    grouped.set(id, current);
  }
  for (const group of grouped.values()) {
    const id = `${group.kind}:${group.runId}`;
    if (existing.has(id)) continue;
    let status: RunStatus | undefined;
    let capabilityId: string | undefined;
    if (group.files.includes("result.json")) {
      const result = await readRemoteEvidenceJson(
        group.kind,
        group.runId,
        "result.json",
      );
      if (result && typeof result === "object") {
        const rec = result as Record<string, unknown>;
        const parsed = RunStatusSchema.safeParse(rec.status);
        status = parsed.success ? parsed.data : undefined;
        capabilityId =
          typeof rec.capabilityId === "string" ? rec.capabilityId : undefined;
      }
    }
    runs.push({
      kind: group.kind,
      runId: group.runId,
      path: `evidence/${group.kind}/${group.runId}`,
      mtime: new Date().toISOString(),
      hasResult: group.files.includes("result.json"),
      hasEvents: group.files.includes("events.jsonl"),
      hasIntervention: group.files.includes("intervention.json"),
      status,
      capabilityId,
    });
  }
}

async function listRemoteEvidenceFiles(
  kind: EvidenceKind,
  runId: string,
): Promise<string[]> {
  const store = getObjectStore();
  if (!store) return [];
  const keys = await store.list(`evidence/${kind}/${runId}/`);
  return keys
    .map((key) => key.split("/").pop())
    .filter((name): name is string => Boolean(name));
}

async function readRemoteEvidenceBuffer(
  kind: EvidenceKind,
  runId: string,
  fileName: string,
): Promise<Buffer | null> {
  const store = getObjectStore();
  if (!store) return null;
  return store.get(`evidence/${kind}/${runId}/${fileName}`);
}

async function readRemoteEvidenceText(
  kind: EvidenceKind,
  runId: string,
  fileName: string,
): Promise<string | undefined> {
  const buf = await readRemoteEvidenceBuffer(kind, runId, fileName);
  return buf ? buf.toString("utf8") : undefined;
}

async function readRemoteEvidenceJson(
  kind: EvidenceKind,
  runId: string,
  fileName: string,
): Promise<unknown> {
  const text = await readRemoteEvidenceText(kind, runId, fileName);
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
