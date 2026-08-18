import type { Express } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../../../infrastructure/config.js";
import {
  AiProvider,
  ComponentHealth,
  HealthProviderId,
  HealthStatus,
} from "@cu/contracts";
import { interventionRegistry } from "../../../core/intervention/registry.js";
import type { RouteContext } from "../types.js";
import { resolveExecutionHealth, probeBrowserbaseReadiness } from "../../../infrastructure/runtime.js";
import { hostedPersistenceConfigured } from "../../../infrastructure/persistence/object-store.js";

export function registerHealthRoutes(app: Express, ctx: RouteContext): void {
  app.get("/api/readiness/browser", async (_req, res) => {
    const probe = await probeBrowserbaseReadiness();
    res.status(probe.ok ? 200 : 503).json({
      ok: probe.ok,
      provider: "browserbase",
      code: probe.code,
    });
  });

  app.get("/api/health", async (_req, res) => {
    const cfg = loadConfig();
    const openaiConfigured = Boolean(cfg.openai.apiKey);
    const geminiConfigured = Boolean(cfg.gemini.apiKey);
    const ollamaConfigured = Boolean(cfg.ollama.baseUrl);
    const providerId =
      cfg.ai.provider === AiProvider.OpenAI
        ? HealthProviderId.OpenAI
        : cfg.ai.provider === AiProvider.Gemini
          ? HealthProviderId.Gemini
          : cfg.ai.provider === AiProvider.Ollama
            ? HealthProviderId.Ollama
            : HealthProviderId.None;
    const modelConfigured =
      providerId === HealthProviderId.OpenAI
        ? openaiConfigured
        : providerId === HealthProviderId.Gemini
          ? geminiConfigured
          : providerId === HealthProviderId.Ollama
            ? ollamaConfigured
            : false;
    const executionHealth = await resolveExecutionHealth(Boolean(ctx.hosted));
    const persistenceOk = ctx.hosted ? hostedPersistenceConfigured() : true;
    res.json({
      status: HealthStatus.Ok,
      bind: ctx.hosted ? "hosted" : "127.0.0.1",
      liveInterventions: interventionRegistry.list().length,
      ...(ctx.hosted
        ? {
            provider: {
              id: providerId,
              model:
                providerId === HealthProviderId.OpenAI
                  ? cfg.openai.model
                  : providerId === HealthProviderId.Gemini
                    ? cfg.gemini.model
                    : providerId === HealthProviderId.Ollama
                      ? cfg.ollama.model
                      : undefined,
              configured: modelConfigured,
            },
          }
        : {
            provider: {
              id: providerId,
              model:
                providerId === HealthProviderId.OpenAI
                  ? cfg.openai.model
                  : providerId === HealthProviderId.Gemini
                    ? cfg.gemini.model
                    : providerId === HealthProviderId.Ollama
                      ? cfg.ollama.model
                      : undefined,
              configured: modelConfigured,
            },
          }),
      execution: {
        browserRuntime: executionHealth.browserRuntime,
        discovery: executionHealth.discovery,
        replay: executionHealth.replay,
        humanControl: executionHealth.humanControl,
        browserRuntimeProvider: executionHealth.browserProvider,
        ...(executionHealth.browserRuntimeReason
          ? { browserRuntimeReason: executionHealth.browserRuntimeReason }
          : {}),
        readiness: {
          browserReady: executionHealth.browserReady,
          persistenceReady: executionHealth.persistenceReady,
          modelReady: executionHealth.modelReady,
        },
      },
      components: {
        capabilityStore: existsSync(
          path.join(ctx.rootDir, "artifacts", "capabilities"),
        )
          ? ComponentHealth.Operational
          : persistenceOk
            ? ComponentHealth.Operational
            : ComponentHealth.Degraded,
        evidenceStore: existsSync(path.join(ctx.rootDir, "evidence"))
          ? ComponentHealth.Operational
          : persistenceOk
            ? ComponentHealth.Operational
            : ComponentHealth.Degraded,
        browserRuntime:
          executionHealth.component,
        ...(executionHealth.browserProvider
          ? { browserProvider: executionHealth.browserProvider }
          : {}),
        ...(executionHealth.browserRuntimeReason
          ? { browserRuntimeReason: executionHealth.browserRuntimeReason }
          : {}),
        model: ctx.hosted
          ? executionHealth.modelComponent
          : modelConfigured
            ? ComponentHealth.Configured
            : ComponentHealth.NotConfigured,
      },
    });
  });
}
