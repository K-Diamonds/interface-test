import { z } from "zod";
import { loadEnv } from "./env.js";
import {
  AiProvider,
  RiskyActionBehavior,
  enumValues,
} from "@cu/contracts";
import { HOSTED_BROWSERBASE_PROJECT_ID } from "./browser/browserbase/hosted-project.js";

const ConfigSchema = z.object({
  ai: z.object({
    provider: z.enum(enumValues(AiProvider)).default(AiProvider.Ollama),
  }),
  openai: z.object({
    apiKey: z.string().optional(),
    model: z.string().default("gpt-4o-mini"),
    timeoutMs: z.number().int().positive().default(60_000),
  }),
  gemini: z.object({
    apiKey: z.string().optional(),
    model: z.string().default("gemini-flash-latest"),
    baseUrl: z
      .string()
      .default("https://generativelanguage.googleapis.com/v1beta/openai/"),
  }),
  ollama: z.object({
    baseUrl: z.string().default("http://127.0.0.1:11434/v1"),
    model: z.string().default("qwen2.5:7b"),
  }),
  automation: z.object({
    headless: z.boolean().default(true),
    maxDiscoverySteps: z.number().int().positive().default(25),
    maxAllowedDiscoverySteps: z.number().int().positive().default(50),
    discoveryTimeoutMs: z.number().int().positive().default(240_000),
    maxDiscoveryTimeoutMs: z.number().int().positive().default(600_000),
    stuckFingerprintRepeats: z.number().int().positive().default(3),
    allowDraftReplay: z.boolean().default(false),
  }),
  safety: z.object({
    riskyActionBehavior: z
      .enum(enumValues(RiskyActionBehavior))
      .default(RiskyActionBehavior.RequireHuman),
  }),
  evidence: z.object({
    rootDir: z.string().default("evidence"),
  }),
  operator: z.object({
    port: z.number().int().positive().default(8787),
  }),
  browser: z.object({
    runtime: z.enum(["local", "browserbase"]).default("local"),
    browserbase: z.object({
      apiKey: z.string().optional(),
      projectId: z.string().min(1),
      sessionTimeoutSeconds: z.number().int().positive().default(900),
    }),
  }),
  persistence: z.object({
    blobToken: z.string().optional(),
  }),
});

export type ApplicationConfig = z.infer<typeof ConfigSchema>;

let cached: ApplicationConfig | null = null;

/**
 * Parse environment once at process start. Fail closed on invalid config.
 * Application code should depend on this object — not scatter process.env reads.
 */
export function loadConfig(options?: { reload?: boolean }): ApplicationConfig {
  if (cached && !options?.reload) return cached;
  loadEnv();

  const providerRaw = (
    process.env.AI_PROVIDER ??
    (process.env.VERCEL ? AiProvider.Gemini : AiProvider.Ollama)
  ).toLowerCase();
  const providerParsed = z.enum(enumValues(AiProvider)).safeParse(providerRaw);
  if (!providerParsed.success) {
    throw new Error(
      `Invalid AI_PROVIDER=${providerRaw}. Use openai, gemini, or ollama.`,
    );
  }
  const provider = providerParsed.data;

  const parsed = ConfigSchema.safeParse({
    ai: { provider },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || undefined,
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000),
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || undefined,
      model: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
      baseUrl:
        process.env.GEMINI_BASE_URL ??
        "https://generativelanguage.googleapis.com/v1beta/openai/",
    },
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
      model: process.env.OLLAMA_MODEL ?? "qwen2.5:7b",
    },
    automation: {
      headless: process.env.HEADED !== "1",
      maxDiscoverySteps: Number(process.env.MAX_DISCOVERY_STEPS ?? 25),
      maxAllowedDiscoverySteps: Number(process.env.MAX_ALLOWED_DISCOVERY_STEPS ?? 50),
      discoveryTimeoutMs: Number(process.env.DISCOVERY_TIMEOUT_MS ?? 240_000),
      maxDiscoveryTimeoutMs: Number(process.env.MAX_DISCOVERY_TIMEOUT_MS ?? 600_000),
      stuckFingerprintRepeats: Number(process.env.STUCK_FINGERPRINT_REPEATS ?? 3),
      allowDraftReplay: process.env.ALLOW_DRAFT_REPLAY === "1",
    },
    safety: {
      riskyActionBehavior:
        process.env.RISKY_ACTION_BEHAVIOR === RiskyActionBehavior.Block
          ? RiskyActionBehavior.Block
          : RiskyActionBehavior.RequireHuman,
    },
    evidence: {
      rootDir: process.env.EVIDENCE_ROOT ?? "evidence",
    },
    operator: {
      port: Number(process.env.OPERATOR_PORT ?? 8787),
    },
    browser: {
      runtime: process.env.VERCEL ? "browserbase" : "local",
      browserbase: {
        apiKey: process.env.BROWSERBASE_API_KEY || undefined,
        projectId: HOSTED_BROWSERBASE_PROJECT_ID,
        sessionTimeoutSeconds: 900,
      },
    },
    persistence: {
      blobToken: process.env.BLOB_READ_WRITE_TOKEN || undefined,
    },
  });

  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid application configuration: ${msg}`);
  }

  cached = parsed.data;
  return cached;
}

export function resetConfigCache(): void {
  cached = null;
}
