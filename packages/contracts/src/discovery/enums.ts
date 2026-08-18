/** Discovery-mode and model-provider identifiers. */

export const DiscoveryMode = {
  Llm: "llm",
  Scripted: "scripted",
} as const;
export type DiscoveryMode = (typeof DiscoveryMode)[keyof typeof DiscoveryMode];

export const AiProvider = {
  OpenAI: "openai",
  Gemini: "gemini",
  Ollama: "ollama",
} as const;
export type AiProvider = (typeof AiProvider)[keyof typeof AiProvider];

export const DiscoveryRunStatus = {
  Completed: "completed",
  InterventionRequired: "intervention_required",
  Failed: "failed",
} as const;
export type DiscoveryRunStatus =
  (typeof DiscoveryRunStatus)[keyof typeof DiscoveryRunStatus];
