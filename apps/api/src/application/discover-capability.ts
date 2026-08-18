/**
 * Discovery orchestration. Live provider failures never fall back to the
 * scripted model — scripted mode is selected only when `scripted: true`.
 */
import { runDiscovery, type DiscoverResult } from "./discovery/discovery-agent.js";
import type { DiscoveryModel } from "./discovery/discovery-model.js";
import {
  GeminiDiscoveryModel,
  OpenAIDiscoveryModel,
} from "./discovery/discovery-model.js";
import { loadConfig } from "../infrastructure/config.js";
import { AiProvider, DiscoveryMode, EvidenceKind } from "@cu/contracts";
import { HttpError } from "../core/errors.js";
import { resolveApplicationProfile } from "../profiles/registry.js";

export interface DiscoveryResumeContext {
  discoveryMode: DiscoveryMode;
  provider: string;
  modelName: string;
  parameters: Record<string, unknown>;
  goal: string;
  target: string;
}

export interface DiscoverCapabilityCommand {
  goal: string;
  target: string;
  headless?: boolean;
  enableOperator?: boolean;
  /** Generic invocation parameters validated against the discovery contract. */
  parameters?: Record<string, unknown>;
  /** Force scripted/offline model — must be explicit. */
  scripted?: boolean;
  model?: DiscoveryModel;
  maxSteps?: number;
  timeoutSeconds?: number;
  runId?: string;
  reconnectSessionId?: string;
  resume?: DiscoveryResumeContext;
}

function createLiveModel(config: ReturnType<typeof loadConfig>): {
  model: DiscoveryModel;
  provider: string;
  modelName: string;
} {
  if (config.ai.provider === AiProvider.OpenAI) {
    if (!config.openai.apiKey) {
      throw new Error(
        "Discovery configuration error:\n" +
          "AI_PROVIDER=openai requires OPENAI_API_KEY.\n" +
          "Use --scripted (or scripted: true) explicitly for offline demo mode.",
      );
    }
    return {
      model: new OpenAIDiscoveryModel({
        apiKey: config.openai.apiKey,
        model: config.openai.model,
        providerLabel: AiProvider.OpenAI,
      }),
      provider: AiProvider.OpenAI,
      modelName: config.openai.model,
    };
  }

  if (config.ai.provider === AiProvider.Gemini) {
    if (!config.gemini.apiKey) {
      throw new Error(
        "Discovery configuration error:\n" +
          "AI_PROVIDER=gemini requires GEMINI_API_KEY.\n" +
          "Use --scripted (or scripted: true) explicitly for offline demo mode.",
      );
    }
    return {
      model: new GeminiDiscoveryModel({
        apiKey: config.gemini.apiKey,
        model: config.gemini.model,
        baseUrl: config.gemini.baseUrl,
      }),
      provider: AiProvider.Gemini,
      modelName: config.gemini.model,
    };
  }

  if (config.ai.provider === AiProvider.Ollama) {
    return {
      model: new OpenAIDiscoveryModel({
        apiKey: "ollama",
        baseURL: config.ollama.baseUrl,
        model: config.ollama.model,
        providerLabel: AiProvider.Ollama,
      }),
      provider: AiProvider.Ollama,
      modelName: config.ollama.model,
    };
  }

  throw new Error(
    `Discovery configuration error: unsupported AI_PROVIDER=${String(config.ai.provider)}. ` +
      `Use openai, gemini, ollama, or --scripted for offline demo.`,
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

const VERCEL_MAX_DURATION_MS = 300_000;
const VERCEL_CLEANUP_MARGIN_MS = 30_000;

function providerConfigured(
  config: ReturnType<typeof loadConfig>,
  provider: string,
  modelName?: string,
): DiscoveryModel {
  if (provider === "scripted") {
    throw new HttpError(
      409,
      "PROVIDER_NOT_CONFIGURED",
      "Scripted discovery cannot be resumed through the hosted runtime",
    );
  }
  if (provider === AiProvider.OpenAI) {
    if (!config.openai.apiKey || config.openai.model !== modelName) {
      throw new HttpError(
        409,
        "PROVIDER_NOT_CONFIGURED",
        `Discovery provider ${provider}/${modelName ?? "unknown"} is not configured`,
      );
    }
    return new OpenAIDiscoveryModel({
      apiKey: config.openai.apiKey,
      model: config.openai.model,
      providerLabel: AiProvider.OpenAI,
    });
  }
  if (provider === AiProvider.Gemini) {
    if (!config.gemini.apiKey || config.gemini.model !== modelName) {
      throw new HttpError(
        409,
        "PROVIDER_NOT_CONFIGURED",
        `Discovery provider ${provider}/${modelName ?? "unknown"} is not configured`,
      );
    }
    return new GeminiDiscoveryModel({
      apiKey: config.gemini.apiKey,
      model: config.gemini.model,
      baseUrl: config.gemini.baseUrl,
    });
  }
  if (provider === AiProvider.Ollama) {
    if (
      !config.ollama.baseUrl ||
      config.ollama.model !== modelName
    ) {
      throw new HttpError(
        409,
        "PROVIDER_NOT_CONFIGURED",
        `Discovery provider ${provider}/${modelName ?? "unknown"} is not configured`,
      );
    }
    return new OpenAIDiscoveryModel({
      apiKey: "ollama",
      baseURL: config.ollama.baseUrl,
      model: config.ollama.model,
      providerLabel: AiProvider.Ollama,
    });
  }
  throw new HttpError(
    409,
    "PROVIDER_NOT_CONFIGURED",
    `Discovery provider ${provider}/${modelName ?? "unknown"} is not configured`,
  );
}

export async function discoverCapabilityApp(
  command: DiscoverCapabilityCommand,
): Promise<DiscoverResult> {
  const config = loadConfig();

  let model = command.model;
  let discoveryMode: DiscoveryMode =
    command.resume?.discoveryMode ?? DiscoveryMode.Llm;
  let provider = command.resume?.provider ?? "unknown";
  let modelName = command.resume?.modelName ?? "unknown";

  if (!model) {
    if (command.resume) {
      model = providerConfigured(config, provider, modelName);
    } else if (command.scripted === true) {
      const { createOfflineDiscoveryModelForTarget } = await import(
        "../profiles/registry.js"
      );
      model = await createOfflineDiscoveryModelForTarget(command.target);
      discoveryMode = DiscoveryMode.Scripted;
      provider = "scripted";
      modelName = "offline-scripted";
    } else {
      const live = createLiveModel(config);
      model = live.model;
      provider = live.provider;
      modelName = live.modelName;
      discoveryMode = DiscoveryMode.Llm;
    }
  } else if (command.scripted) {
    discoveryMode = DiscoveryMode.Scripted;
    provider = "scripted";
  }

  const maxSteps = clamp(
    command.maxSteps ?? config.automation.maxDiscoverySteps,
    1,
    config.automation.maxAllowedDiscoverySteps ?? 50,
  );
  const timeoutMs = clamp(
    (command.timeoutSeconds
      ? command.timeoutSeconds * 1000
      : config.automation.discoveryTimeoutMs) ?? 240_000,
    5_000,
    config.automation.maxDiscoveryTimeoutMs ?? 600_000,
  );
  const boundedTimeoutMs = process.env.VERCEL
    ? Math.min(timeoutMs, VERCEL_MAX_DURATION_MS - VERCEL_CLEANUP_MARGIN_MS)
    : timeoutMs;

  const profile = resolveApplicationProfile(command.target);
  let parameters: Record<string, unknown> = {
    ...(command.resume?.parameters ?? command.parameters ?? {}),
  };
  if (profile?.resolveInvocationParameters) {
    parameters = profile.resolveInvocationParameters({
      parameters,
      getenv: (key) => process.env[key],
    });
  }

  return runDiscovery({
    goal: command.goal,
    target: command.target,
    headless: command.headless ?? config.automation.headless,
    enableOperator: command.enableOperator,
    parameters,
    model,
    maxSteps,
    timeoutMs: boundedTimeoutMs,
    stuckThreshold: config.automation.stuckFingerprintRepeats,
    discoveryMode,
    modelName,
    provider,
    evidenceKind:
      discoveryMode === DiscoveryMode.Llm
        ? EvidenceKind.Discovery
        : EvidenceKind.OfflineDemo,
    runId: command.runId,
    reconnectSessionId: command.reconnectSessionId,
  });
}
