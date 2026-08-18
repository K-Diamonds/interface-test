import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { REPLAY_REQUIRES_DISCOVERY_MODEL } from "../src/application/replay-capability.js";
import { evaluateCheckpoint } from "../src/core/domain/checkpoint-engine.js";
import {
  classifyIdempotency,
  mayAutoRetry,
} from "../src/core/domain/idempotency.js";
import { shouldRetry, DEFAULT_RETRY } from "../src/core/execution/retry-policy.js";
import { RecoverableError } from "../src/core/errors.js";
import { CapabilityStore } from "../src/core/capability/capability-store.js";
import { redactValue } from "../src/core/policy/redaction.js";
import type { ComputerSurface } from "../src/core/surface.js";
import type { SurfaceObservation } from "@cu/contracts";

describe("architecture invariants", () => {
  it("replay application service declares zero LLM dependency", () => {
    expect(REPLAY_REQUIRES_DISCOVERY_MODEL).toBe(false);
  });

  it("replay-engine source does not import openai, discovery model, or Playwright", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/core/execution/replay-engine.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/openai/i);
    expect(src).not.toMatch(/DiscoveryModel/);
    expect(src).not.toMatch(/OpenAI/);
    expect(src).not.toMatch(/PlaywrightSurface/);
    expect(src).not.toMatch(/from ["']playwright["']/);
  });

  it("generic compiler and replay have no SauceDemo product semantics", () => {
    const files = [
      "src/core/capability/compiler/capability-compiler.ts",
      "src/core/capability/compiler/target-compiler.ts",
      "src/core/capability/compiler/binding-compiler.ts",
      "src/core/capability/validator.ts",
      "src/core/execution/replay-engine.ts",
      "src/core/execution/output-extractor.ts",
      "src/infrastructure/browser/playwright-surface.ts",
      "src/infrastructure/browser/playwright-page-surface.ts",
      "src/infrastructure/browser/locators.ts",
      "src/core/execution/recovery.ts",
      "src/core/domain/capability-variant.ts",
    ];
    for (const file of files) {
      const src = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(src).not.toMatch(/SauceDemoProfile/);
      expect(src).not.toMatch(/PRODUCT_NOT_FOUND/);
      expect(src).not.toMatch(/shopping_cart/);
      expect(src).not.toMatch(/cartCount/);
      expect(src).not.toMatch(/\bproductName\b/);
    }
  });

  it("discover orchestration does not hardcode SauceDemo credentials", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/application/discover-capability.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/config\.sauce/);
    expect(src).toMatch(/resolveInvocationParameters/);
  });

  it("generic compiler does not use recursive string replace parameterization", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/core/capability/compiler/binding-compiler.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\.split\(concrete\)\.join/);
    expect(src).toMatch(/applyTypedParameterBindings/);
    expect(src).toMatch(/resolveTypeInputBinding/);
  });

  it("failed discovery traces are not compiled into capabilities", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/application/discovery/discovery-agent.ts"),
      "utf8",
    );
    expect(src).not.toMatch(
      /status === ["']failed["'] && loopResult\.steps\.every/,
    );
    expect(src).toMatch(/DiscoveryRunStatus\.Failed/);
    expect(src).toMatch(/capability\.compilation_started/);
  });

  it("gemini live discovery uses native generateContent, not OpenAI-compat chat", () => {
    const discover = readFileSync(
      path.join(process.cwd(), "src/application/discover-capability.ts"),
      "utf8",
    );
    const model = readFileSync(
      path.join(process.cwd(), "src/application/discovery/discovery-model.ts"),
      "utf8",
    );
    const agent = readFileSync(
      path.join(process.cwd(), "src/application/discovery/discovery-agent.ts"),
      "utf8",
    );
    expect(discover).toMatch(/GeminiDiscoveryModel/);
    expect(model).toMatch(/generateContent/);
    expect(model).toMatch(/responseMimeType/);
    expect(agent).toMatch(/LiveLlmDiscoveryModel/);
    const loop = readFileSync(
      path.join(process.cwd(), "src/application/discovery/agent-loop.ts"),
      "utf8",
    );
    expect(loop).toMatch(/discoveryLenient:\s*true/);
  });

  it("discovery does not silently fall back to scripted when LLM misconfigured", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/application/discover-capability.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/falling back to scripted/i);
    expect(src).toMatch(/Use --scripted/);
    expect(src).toMatch(/command\.scripted === true/);
  });

  it("domain ComputerSurface port is used by replay (not Playwright Page)", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/core/execution/replay-engine.ts"),
      "utf8",
    );
    expect(src).toMatch(/ComputerSurface/);
    expect(src).not.toMatch(/from ["']playwright["']/);
    expect(src).not.toMatch(/PlaywrightSurface/);
  });

  it("API core domain source does not import express, react, playwright, or openai", () => {
    const domainRoot = path.resolve(process.cwd(), "src/core/domain");
    const files = [
      "ports.ts",
      "checkpoint-engine.ts",
      "idempotency.ts",
      "parameter-binding.ts",
      "application-profile.ts",
    ];
    for (const file of files) {
      const src = readFileSync(path.join(domainRoot, file), "utf8");
      expect(src).not.toMatch(/from ["']express["']/);
      expect(src).not.toMatch(/from ["']react["']/);
      expect(src).not.toMatch(/from ["']playwright["']/);
      expect(src).not.toMatch(/from ["']openai["']/);
    }
  });

  it("packages/ only contains shared contracts (no API-only domain package)", () => {
    const packagesRoot = path.resolve(process.cwd(), "../../packages");
    const names = readdirSync(packagesRoot);
    expect(names).toEqual(["contracts"]);
  });

  it("exactly one committed evidence directory at repo root", () => {
    const repo = path.resolve(process.cwd(), "../..");
    const skip = new Set(["node_modules", "dist", ".git", "test-results", ".vite", ".vercel"]);
    const namedEvidence: string[] = [];
    const walk = (dir: string): void => {
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (skip.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.name === "evidence") namedEvidence.push(full);
        walk(full);
      }
    };
    walk(repo);
    expect(namedEvidence).toEqual([path.join(repo, "evidence")]);
  });

  it("exactly one committed capability artifact root", () => {
    const repo = path.resolve(process.cwd(), "../..");
    const skip = new Set(["node_modules", "dist", ".git", "test-results", ".vite", ".vercel"]);
    const caps: string[] = [];
    const walk = (dir: string): void => {
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (skip.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (
          entry.name === "capabilities" &&
          path.basename(path.dirname(full)) === "artifacts"
        ) {
          caps.push(full);
        }
        walk(full);
      }
    };
    walk(repo);
    expect(caps).toEqual([path.join(repo, "artifacts", "capabilities")]);
    expect(readdirSync(repo)).not.toContain("capabilities");
  });

  it("contracts package has no runtime platform deps", () => {
    const contractsSrc = path.resolve(process.cwd(), "../../packages/contracts/src");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.name.endsWith(".ts")) out.push(full);
      }
      return out;
    };
    for (const file of walk(contractsSrc)) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/from ["']express["']/);
      expect(src).not.toMatch(/from ["']react["']/);
      expect(src).not.toMatch(/from ["']playwright["']/);
      expect(src).not.toMatch(/from ["']openai["']/);
      expect(src).not.toMatch(/from ["']node:fs["']/);
      expect(src).not.toMatch(/class \w+Error extends Error/);
    }
  });

  it("artifacts live under artifacts/capabilities; evidence only at repo root", () => {
    const repo = path.resolve(process.cwd(), "../..");
    expect(readdirSync(path.join(repo, "artifacts"))).toContain("capabilities");
    expect(readdirSync(repo)).toContain("evidence");
    expect(readdirSync(repo)).not.toContain("capabilities");
    expect(readdirSync(path.join(repo, "apps/api"))).not.toContain("evidence");
    expect(readdirSync(path.join(process.cwd(), "src"))).not.toContain("api");
  });

  it("core does not import application, interfaces, Playwright, or browser observation adapters", () => {
    const coreRoot = path.resolve(process.cwd(), "src/core");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.name.endsWith(".ts")) out.push(full);
      }
      return out;
    };
    for (const file of walk(coreRoot)) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/from ["'].*\/application\//);
      expect(src).not.toMatch(/from ["'].*\/interfaces\//);
      expect(src).not.toMatch(/PlaywrightSurface/);
      expect(src).not.toMatch(/from ["']playwright["']/);
      expect(src).not.toMatch(/from ["']openai["']/);
      expect(src).not.toMatch(/from ["']express["']/);
      expect(src).not.toMatch(/AccessibilityObservationProvider/);
      expect(src).not.toMatch(/SemanticDomObservationProvider/);
      expect(src).not.toMatch(/observation-provider/);
    }
  });

  it("canonical evidence CLI orchestrates application services, not a second engine", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/interfaces/cli/evidence-canonical.ts"),
      "utf8",
    );
    expect(src).toMatch(/discoverCapabilityApp/);
    expect(src).toMatch(/replayCapabilityApp/);
    expect(src).not.toMatch(/replay-engine/);
    expect(src).not.toMatch(/PlaywrightSurface/);
    expect(src).not.toMatch(/OpenAIDiscoveryModel/);
    expect(src).not.toMatch(/runAgentLoop/);
  });

  it("generic replay and operator CLIs do not default to SauceDemo artifacts or URLs", () => {
    const replay = readFileSync(
      path.join(process.cwd(), "src/interfaces/cli/replay.ts"),
      "utf8",
    );
    const operator = readFileSync(
      path.join(process.cwd(), "src/interfaces/cli/operator.ts"),
      "utf8",
    );
    expect(replay).not.toMatch(/cart\.add-product/);
    expect(operator).not.toMatch(/saucedemo/i);
    expect(replay).toMatch(/usage/i);
    expect(operator).toMatch(/--target/);
  });

  it("web does not alias or import @cu/domain", () => {
    const vite = readFileSync(
      path.resolve(process.cwd(), "../web/vite.config.ts"),
      "utf8",
    );
    expect(vite).not.toMatch(/@cu\/domain/);
    const pkg = readFileSync(
      path.resolve(process.cwd(), "../web/package.json"),
      "utf8",
    );
    expect(pkg).not.toMatch(/@cu\/domain/);
  });

  it("git does not track env files or OpenAI secret material", () => {
    const repo = path.resolve(process.cwd(), "../..");
    const files = execSync("git ls-files", { cwd: repo, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    expect(files.filter((f) => /(^|\/)\.env$/.test(f))).toEqual([]);
    expect(files.some((f) => f.endsWith(".env.example"))).toBe(true);
    expect(files).not.toContain("api/[...path].js");
    const skipBinary = /\.(png|jpe?g|webp|gif|zip|woff2?)$/i;
    for (const file of files) {
      if (skipBinary.test(file)) continue;
      const full = path.join(repo, file);
      if (!existsSync(full)) continue;
      const src = readFileSync(full, "utf8");
      expect(src).not.toMatch(/sk-proj-[A-Za-z0-9_-]{16,}/);
      expect(src).not.toMatch(/sk-live-[A-Za-z0-9_-]{16,}/);
      expect(src).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
      expect(src).not.toMatch(/bb_live_[A-Za-z0-9_-]{16,}/);
      expect(src).not.toMatch(/vercel_blob_rw_[A-Za-z0-9_-]{16,}/);
    }
  });

  it("web package does not import api implementation paths", () => {
    const webSrc = path.resolve(process.cwd(), "../web/src");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
      }
      return out;
    };
    for (const file of walk(webSrc)) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/from ["']@?\/?apps\/api/);
      expect(src).not.toMatch(/from ["'].*\/api\/src\//);
    }
  });
});

describe("checkpoint evaluation results", () => {
  it("returns structured unsatisfied result without throwing", async () => {
    const surface: ComputerSurface = {
      observe: async () =>
        ({
          location: "https://www.saucedemo.com/inventory.html",
          controls: [],
          visibleText: [],
          dialogs: [],
          stateHints: {},
          fingerprint: "x",
        }) satisfies SurfaceObservation,
      navigate: async () => ({ ok: true, durationMs: 1 }),
      click: async () => ({ ok: true, durationMs: 1 }),
      type: async () => ({ ok: true, durationMs: 1 }),
      read: async () => "",
      waitFor: async () => undefined,
      screenshot: async () => Buffer.from(""),
      getCurrentLocation: async () =>
        "https://www.saucedemo.com/inventory.html",
      count: async () => 0,
      close: async () => undefined,
    };

    const result = await evaluateCheckpoint(
      surface,
      { type: "url", pattern: "cart\\.html" },
      {},
    );
    expect(result.satisfied).toBe(false);
    if (!result.satisfied) {
      expect(result.observed).toContain("inventory");
      expect(result.expected).toBe("cart\\.html");
    }
  });
});

describe("idempotency-aware retries", () => {
  it("does not auto-retry irreversible actions", () => {
    expect(classifyIdempotency({ actionType: "click", description: "Checkout" })).toBe(
      "irreversible",
    );
    expect(mayAutoRetry("irreversible")).toBe(false);
    expect(
      shouldRetry(
        DEFAULT_RETRY,
        1,
        new RecoverableError("timeout", "transient_timeout"),
        "irreversible",
      ),
    ).toBe(false);
  });

  it("allows retry for idempotent recoverable errors", () => {
    expect(
      shouldRetry(
        DEFAULT_RETRY,
        1,
        new RecoverableError("detached", "element_detached"),
        "idempotent",
      ),
    ).toBe(true);
  });
});

describe("hosted catalog isolation", () => {
  it("thin hosted adapters do not embed Playwright or discovery orchestration", () => {
    const files = [
      "src/interfaces/http/create-app.ts",
      "src/interfaces/http/vercel-entry.ts",
    ];
    for (const file of files) {
      const src = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(src).not.toMatch(/from ["']playwright["']/);
      expect(src).not.toMatch(/PlaywrightSurface/);
      expect(src).not.toMatch(/discover-capability/);
      expect(src).not.toMatch(/from ["'].*run-jobs["']/);
      expect(src).not.toMatch(/agent-invoke/);
    }
  });

  it("hosted app registers execution via session-factory routes, not PlaywrightSurface", () => {
    const hosted = readFileSync(
      path.join(process.cwd(), "src/interfaces/http/hosted-app.ts"),
      "utf8",
    );
    expect(hosted).not.toMatch(/PlaywrightSurface/);
    expect(hosted).not.toMatch(/from ["']playwright["']/);
    expect(hosted).toMatch(/registerHostedExecutionRoutes/);
  });
});

describe("Vercel deployment adapter", () => {
  it("root /api is a thin adapter with no business logic", () => {
    const adapter = readFileSync(
      path.resolve(process.cwd(), "../../api/adapter.ts"),
      "utf8",
    );
    expect(adapter).toMatch(/vercel-entry/);
    expect(adapter).toMatch(/Vercel deployment adapter only/);
    expect(adapter).not.toMatch(/PlaywrightSurface/);
    expect(adapter).not.toMatch(/discover-capability/);
    expect(adapter).not.toMatch(/replay-engine/);
    expect(adapter).not.toMatch(/OpenAIDiscovery|GeminiDiscovery/);
    expect(adapter).not.toMatch(/capability-compiler/);
    expect(adapter).not.toMatch(/guardrails/);
    expect(adapter).not.toMatch(/from ["']playwright["']/);
    const readme = readFileSync(
      path.resolve(process.cwd(), "../../api/README.md"),
      "utf8",
    );
    expect(readme).toMatch(/apps\/api/);
  });

  it("does not commit a fake 503 Vercel placeholder", () => {
    const repo = path.resolve(process.cwd(), "../..");
    const files = execSync("git ls-files", { cwd: repo, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    expect(files).toContain("api/adapter.ts");
    const adapter = readFileSync(
      path.resolve(process.cwd(), "../../api/adapter.ts"),
      "utf8",
    );
    expect(adapter).not.toMatch(/Service Unavailable|503/);
  });

  it("canonical SauceDemo artifact allowlist is least-privilege", () => {
    const artifact = readFileSync(
      path.resolve(
        process.cwd(),
        "../../artifacts/capabilities/cart.add-product/v2.json",
      ),
      "utf8",
    );
    expect(artifact).toMatch(/www\.saucedemo\.com/);
    expect(artifact).not.toMatch(/localhost/);
    expect(artifact).not.toMatch(/127\.0\.0\.1/);
  });

  it("intervention handler does not invent empty success outputs", () => {
    const src = readFileSync(
      path.resolve(
        process.cwd(),
        "src/core/execution/intervention-handler.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/outputs:\s*\{\}/);
    expect(src).not.toMatch(/finalizeSuccess|extractOutputs/);
    expect(src).toMatch(/kind: "resumed"/);
  });
});

describe("capability persistence safety", () => {
  it("rejects path-traversal capability ids", async () => {
    const store = new CapabilityStore();
    await expect(store.listVersions("../etc")).rejects.toThrow(/Unsafe|traversal/i);
  });
});

describe("nested redaction", () => {
  it("redacts nested sensitive objects recursively", () => {
    const out = redactValue({
      outer: {
        password: "secret",
        nested: { authorization: "Bearer abc", ok: "fine" },
      },
    }) as {
      outer: { password: string; nested: { authorization: string; ok: string } };
    };
    expect(out.outer.password).toBe("[REDACTED]");
    expect(out.outer.nested.authorization).toBe("[REDACTED]");
    expect(out.outer.nested.ok).toBe("fine");
  });
});
