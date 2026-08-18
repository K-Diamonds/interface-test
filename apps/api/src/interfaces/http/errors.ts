import type { Response } from "express";
import type { ApiErrorResponse } from "@cu/contracts";
import { AppError } from "../../core/errors.js";

export function sendApiError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const requestId =
    typeof res.getHeader("X-Request-Id") === "string"
      ? String(res.getHeader("X-Request-Id"))
      : "req_unknown";
  const body: ApiErrorResponse = {
    error: {
      code,
      message,
      requestId,
      ...(details !== undefined ? { details } : {}),
    },
  };
  res.status(status).json(body);
}

export function mapUnknownError(err: unknown): {
  status: number;
  code: string;
  message: string;
  details?: unknown;
} {
  if (err instanceof AppError) {
    if ("status" in err && typeof (err as { status?: unknown }).status === "number") {
      return {
        status: (err as { status: number }).status,
        code: err.code,
        message: err.message,
        details: (err as { details?: unknown }).details,
      };
    }
    const status =
      err.code === "POLICY_VIOLATION"
        ? 403
        : err.code.includes("NOT_FOUND") || err.code.includes("UNRESOLVED")
          ? 404
          : 400;
    return {
      status,
      code: err.code,
      message: err.message,
    };
  }
  if (err instanceof Error) {
    // Never leak raw Playwright / OpenAI stacks to clients.
    const lower = err.message.toLowerCase();
    if (lower.includes("openai") || lower.includes("api key")) {
      return {
        status: 502,
        code: "MODEL_ERROR",
        message: "Model provider request failed",
      };
    }
    if (lower.includes("playwright") || lower.includes("browser")) {
      return {
        status: 502,
        code: "BROWSER_ERROR",
        message: "Browser runtime request failed",
      };
    }
    if (lower.includes("expired") && lower.includes("session")) {
      return {
        status: 410,
        code: "SESSION_EXPIRED",
        message: "Browser session is no longer available",
      };
    }
    return {
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Unhandled server error",
    };
  }
  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Unhandled server error",
  };
}
