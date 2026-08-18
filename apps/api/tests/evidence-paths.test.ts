import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EvidenceKind } from "@cu/contracts";
import {
  EvidenceStore,
  toRepoRelativePath,
} from "../src/infrastructure/observability/evidence.js";
import { resolveRepoRoot } from "../src/infrastructure/paths.js";

describe("evidence path serialization", () => {
  it("rejects absolute developer-machine paths", () => {
    const root = resolveRepoRoot();
    expect(() =>
      toRepoRelativePath(root, "/Users/someone/Desktop/secret.png"),
    ).toThrow(/inside the repository/);
  });

  it("stores repo-relative paths from production evidence root", async () => {
    const repo = resolveRepoRoot();
    const runId = `path_test_${Date.now()}`;
    const store = await EvidenceStore.create(EvidenceKind.Failures, runId);
    const rel = await store.saveJson("meta.json", { ok: true });
    expect(rel).toBe(`evidence/failures/${runId}/meta.json`);
    expect(rel).not.toMatch(/Users|Desktop|repos/);
    expect(store.getReferences()[0]?.path).toBe(rel);
    await rm(store.dir, { recursive: true, force: true });
    void repo;
  });

  it("redacts sensitive keys when persisting JSON evidence", async () => {
    const evidenceRoot = await mkdtemp(path.join(tmpdir(), "cu-evidence-redact-"));
    const store = await EvidenceStore.create(EvidenceKind.Replay, "run_redact", {
      evidenceRoot,
    });
    await store.saveJson("result.json", {
      password: "should-not-persist",
      productName: "ok",
    });
    const written = JSON.parse(
      await readFile(path.join(store.dir, "result.json"), "utf8"),
    ) as { password: string; productName: string };
    expect(written.password).toBe("[REDACTED]");
    expect(written.productName).toBe("ok");
    await rm(evidenceRoot, { recursive: true, force: true });
  });

  it("isolates test evidence under an explicit evidenceRoot", async () => {
    const sandbox = await mkdtemp(path.join(tmpdir(), "cus-ev-"));
    const evidenceRoot = path.join(sandbox, "evidence");
    const store = await EvidenceStore.create(EvidenceKind.Replay, "run_tmp", {
      evidenceRoot,
    });
    const rel = await store.saveJson("result.json", { status: "success" });
    expect(rel).toBe("evidence/replay/run_tmp/result.json");
    expect(rel).not.toMatch(/Users|Desktop|tmpdir|var\/folders/);
    await rm(sandbox, { recursive: true, force: true });
  });

  it("normalizes absolute addRef paths", async () => {
    const sandbox = await mkdtemp(path.join(tmpdir(), "cus-ev2-"));
    const evidenceRoot = path.join(sandbox, "evidence");
    const store = await EvidenceStore.create(EvidenceKind.Replay, "run_abs", {
      evidenceRoot,
    });
    const abs = path.join(store.dir, "trace.zip");
    await writeFile(abs, "x");
    store.addRef({ kind: "trace", path: abs });
    expect(store.getReferences()[0]?.path).toBe(
      "evidence/replay/run_abs/trace.zip",
    );
    await rm(sandbox, { recursive: true, force: true });
  });
});
