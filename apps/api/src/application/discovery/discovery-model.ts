import OpenAI from "openai";
import { AgentActionSchema, type AgentAction } from "@cu/contracts";
import { DISCOVERY_SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";
import { ProviderError, ValidationError } from "../../core/errors.js";

export interface DiscoveryModelInput {
  goal: string;
  observationSummary: string;
  historySummary: string;
  allowedDomains: string[];
  allowedActions: string[];
  credentialsHint?: string;
  /** Opaque invocation parameters — model may use values, must not invent semantics. */
  parameters?: Record<string, unknown>;
}

export interface DiscoveryModel {
  nextAction(input: DiscoveryModelInput): Promise<AgentAction>;
}

/** Live cloud/local LLM adapters. Scripted/offline models must not extend this. */
export abstract class LiveLlmDiscoveryModel implements DiscoveryModel {
  abstract readonly providerLabel: string;
  abstract nextAction(input: DiscoveryModelInput): Promise<AgentAction>;
}

const ACTION_SCHEMA_HINT = `Return JSON matching one of these action shapes:
{"actionType":"navigate","url":"...","reasoning":"...","expectedEffect":"..."}
{"actionType":"click","targetRef":"cN","reasoning":"...","expectedEffect":"..."}
{"actionType":"type","targetRef":"cN","value":"...","reasoning":"...","expectedEffect":"...","sensitive":false}
{"actionType":"wait","waitMs":500,"reasoning":"...","expectedEffect":"..."}
{"actionType":"complete","reasoning":"...","expectedEffect":"...","outputs":{}}
{"actionType":"request_human","reason":"...","reasoning":"...","expectedEffect":"..."}
{"actionType":"extract","fields":[{"name":"...","from":"text","targetRef":"cN"}],"reasoning":"...","expectedEffect":"..."}
{"actionType":"read","targetRef":"cN","reasoning":"...","expectedEffect":"..."}`;

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function providerFailureStatus(err: unknown): number | undefined {
  if (err instanceof ProviderError && typeof err.status === "number") {
    return err.status;
  }
  if (typeof err === "object" && err && "status" in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

export function isRetryableProviderError(err: unknown): boolean {
  if (err instanceof ValidationError) return false;
  const status = providerFailureStatus(err);
  if (status !== undefined) {
    return (
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/\bHTTP 4\d\d\b/.test(message) && !/\bHTTP 429\b/.test(message)) {
    return false;
  }
  return /premature close|unavailable|ECONNRESET|socket hang up|fetch failed|high demand|UND_ERR|network|timeout|aborted|ETIMEDOUT|EAI_AGAIN|truncated/i.test(
    message,
  );
}

export async function withProviderRetry<T>(
  fn: () => Promise<T>,
  options?: {
    attempts?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const attempts = options?.attempts ?? 5;
  const sleep = options?.sleep ?? delay;
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (attempt === attempts - 1 || !isRetryableProviderError(err)) {
        throw err;
      }
      await sleep(Math.min(8_000, 500 * 2 ** attempt));
    }
  }
  throw last;
}

/** Native Gemini generateContent URL from either a v1beta root or the OpenAI-compat base. */
export function geminiGenerateContentUrl(baseUrl: string, model: string): string {
  const nativeRoot = baseUrl.replace(/\/+$/, "").replace(/\/openai$/i, "");
  return `${nativeRoot}/models/${encodeURIComponent(model)}:generateContent`;
}

export function parseModelJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    // continue
  }
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1]);
  }
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(content.slice(start, end + 1));
  }
  throw new Error("no json object");
}

function parseAgentAction(content: string): AgentAction {
  let parsed: unknown;
  try {
    parsed = parseModelJson(content);
  } catch {
    throw new ValidationError("Model returned non-JSON content");
  }

  const result = AgentActionSchema.safeParse(parsed);
  if (!result.success) {
    throw new ValidationError(
      `Invalid model action: ${result.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  return result.data;
}

function summarizeProviderBody(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; status?: string };
    };
    const msg = parsed.error?.message ?? parsed.error?.status;
    if (msg) return msg.slice(0, 300);
  } catch {
    // ignore
  }
  return raw.replace(/\s+/g, " ").slice(0, 200);
}

export class OpenAIDiscoveryModel extends LiveLlmDiscoveryModel {
  private client: OpenAI;
  private model: string;
  readonly providerLabel: string;

  constructor(options?: {
    apiKey?: string;
    model?: string;
    baseURL?: string;
    providerLabel?: string;
  }) {
    super();
    const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY ?? "ollama";
    this.client = new OpenAI({
      apiKey,
      baseURL: options?.baseURL,
    });
    this.model = options?.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    this.providerLabel = options?.providerLabel ?? "openai";
  }

  async nextAction(input: DiscoveryModelInput): Promise<AgentAction> {
    try {
      return await withProviderRetry(() => this.requestOnce(input));
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ProviderError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new ProviderError(
        `${this.providerLabel} request failed (${this.model}): ${message}`,
        providerFailureStatus(err),
      );
    }
  }

  private async requestOnce(input: DiscoveryModelInput): Promise<AgentAction> {
    let response;
    try {
      response = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0,
        max_tokens: 1024,
        // Ollama ignores unknown fields; OpenAI uses json_object for structured actions.
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: DISCOVERY_SYSTEM_PROMPT },
          { role: "system", content: ACTION_SCHEMA_HINT },
          { role: "user", content: buildUserPrompt(input) },
        ],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ProviderError(
        `${this.providerLabel} request failed (${this.model}): ${message}`,
        providerFailureStatus(err),
      );
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new ValidationError("Model returned empty content");
    }
    return parseAgentAction(content);
  }
}

type GeminiPart = { text?: string };
type GeminiCandidate = {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
};
type GeminiGenerateResponse = {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

export class GeminiDiscoveryModel extends LiveLlmDiscoveryModel {
  readonly providerLabel = "gemini";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryAttempts: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    timeoutMs?: number;
    retryAttempts?: number;
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
  }) {
    super();
    this.apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY ?? "";
    this.model = options?.model ?? process.env.GEMINI_MODEL ?? "gemini-flash-latest";
    this.baseUrl =
      options?.baseUrl ??
      "https://generativelanguage.googleapis.com/v1beta/openai/";
    this.timeoutMs = options?.timeoutMs ?? 60_000;
    this.retryAttempts = options?.retryAttempts ?? 5;
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.sleep = options?.sleep ?? delay;
  }

  async nextAction(input: DiscoveryModelInput): Promise<AgentAction> {
    if (!this.apiKey) {
      throw new ProviderError("AI_PROVIDER=gemini requires GEMINI_API_KEY.");
    }
    try {
      return await withProviderRetry(() => this.requestOnce(input), {
        attempts: this.retryAttempts,
        sleep: this.sleep,
      });
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ProviderError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new ProviderError(
        `gemini request failed (${this.model}): ${message}`,
      );
    }
  }

  private async requestOnce(input: DiscoveryModelInput): Promise<AgentAction> {
    const url = geminiGenerateContentUrl(this.baseUrl, this.model);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: `${DISCOVERY_SYSTEM_PROMPT}\n\n${ACTION_SCHEMA_HINT}` }],
          },
          contents: [
            { role: "user", parts: [{ text: buildUserPrompt(input) }] },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
          },
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ProviderError(
        `gemini request failed (${this.model}): ${message}`,
      );
    } finally {
      clearTimeout(timer);
    }

    const raw = await response.text();
    if (!response.ok) {
      throw new ProviderError(
        `gemini request failed (${this.model}): HTTP ${response.status} ${summarizeProviderBody(raw)}`,
        response.status,
      );
    }

    let payload: GeminiGenerateResponse;
    try {
      payload = JSON.parse(raw) as GeminiGenerateResponse;
    } catch {
      throw new ProviderError(
        `gemini request failed (${this.model}): non-JSON response body`,
      );
    }

    if (payload.promptFeedback?.blockReason) {
      throw new ProviderError(
        `gemini request failed (${this.model}): blocked (${payload.promptFeedback.blockReason})`,
      );
    }

    const candidate = payload.candidates?.[0];
    const text = candidate?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) {
      const finish = candidate?.finishReason ?? "empty";
      if (finish === "MAX_TOKENS" || finish === "OTHER") {
        throw new ProviderError(
          `gemini request failed (${this.model}): truncated (${finish})`,
        );
      }
      throw new ValidationError("Model returned empty content");
    }

    return parseAgentAction(text);
  }
}
