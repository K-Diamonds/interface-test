import { config } from "@/app/config";
import type { ZodTypeAny, z } from "zod";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function apiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  const base = config.apiBaseUrl.replace(/\/$/, "");
  return `${base}${path}`;
}

export { apiUrl };

/** Build EventSource URL using the same API base as fetch. */
export function apiEventStreamUrl(path: string): string {
  return apiUrl(path);
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, fallback: string): {
  message: string;
  requestId?: string;
} {
  if (typeof body === "object" && body && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === "string") return { message: err };
    if (typeof err === "object" && err && "message" in err) {
      const e = err as { message: string; requestId?: string };
      return { message: e.message, requestId: e.requestId };
    }
  }
  return { message: fallback };
}

function parseWithSchema<T extends ZodTypeAny>(
  schema: T,
  body: unknown,
  path: string,
): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      `Invalid API response for ${path}: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
      502,
      body,
    );
  }
  return parsed.data;
}

export async function apiGet<T extends ZodTypeAny>(
  path: string,
  schema: T,
): Promise<z.infer<T>> {
  const res = await fetch(apiUrl(path), {
    headers: { Accept: "application/json" },
  });
  const body = await parseJson(res);
  if (!res.ok) {
    const { message, requestId } = errorMessage(
      body,
      `GET ${path} failed (${res.status})`,
    );
    throw new ApiError(message, res.status, body, requestId);
  }
  return parseWithSchema(schema, body, path);
}

export async function apiPost<T extends ZodTypeAny>(
  path: string,
  schema: T,
  payload?: unknown,
): Promise<z.infer<T>> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    const { message, requestId } = errorMessage(
      body,
      `POST ${path} failed (${res.status})`,
    );
    throw new ApiError(message, res.status, body, requestId);
  }
  return parseWithSchema(schema, body, path);
}
