/**
 * Typed Browserbase readiness codes. Never include secrets or connect URLs.
 */
export const BrowserbaseReadinessCode = {
  Ok: "OK",
  ApiKeyMissing: "BROWSERBASE_API_KEY_MISSING",
  AuthFailed: "BROWSERBASE_AUTH_FAILED",
  ProjectInvalid: "BROWSERBASE_PROJECT_INVALID",
  ApiUnreachable: "BROWSERBASE_API_UNREACHABLE",
  ReadinessFailed: "BROWSERBASE_READINESS_FAILED",
  SdkError: "BROWSERBASE_SDK_ERROR",
} as const;

export type BrowserbaseReadinessCode =
  (typeof BrowserbaseReadinessCode)[keyof typeof BrowserbaseReadinessCode];

export const PersistenceReadinessCode = {
  Ok: "OK",
  NotConfigured: "BLOB_STORAGE_NOT_CONFIGURED",
} as const;

export type PersistenceReadinessCode =
  (typeof PersistenceReadinessCode)[keyof typeof PersistenceReadinessCode];

export interface BrowserbaseReadiness {
  ok: boolean;
  code: BrowserbaseReadinessCode;
}

export function logBrowserbaseReadiness(fields: {
  hasApiKey: boolean;
  hasProjectId: boolean;
  result: "ok" | "failed";
  code: BrowserbaseReadinessCode;
}): void {
  console.log(
    JSON.stringify({
      event: "browserbase.readiness",
      runtime: "browserbase",
      hasApiKey: fields.hasApiKey,
      hasProjectId: fields.hasProjectId,
      result: fields.result,
      code: fields.code,
    }),
  );
}

export function classifyBrowserbaseError(err: unknown): BrowserbaseReadinessCode {
  const status =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status?: unknown }).status)
      : undefined;
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name?: unknown }).name ?? "")
      : "";
  const message = err instanceof Error ? err.message : String(err);

  if (
    /Cannot find module|Cannot find package|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/i.test(
      message,
    )
  ) {
    return BrowserbaseReadinessCode.SdkError;
  }
  if (status === 401 || name === "AuthenticationError") {
    return BrowserbaseReadinessCode.AuthFailed;
  }
  if (status === 403 || name === "PermissionDeniedError") {
    return BrowserbaseReadinessCode.AuthFailed;
  }
  if (status === 404 || name === "NotFoundError") {
    return BrowserbaseReadinessCode.ProjectInvalid;
  }
  if (
    name === "APIConnectionError" ||
    name === "APIConnectionTimeoutError" ||
    /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i.test(message)
  ) {
    return BrowserbaseReadinessCode.ApiUnreachable;
  }
  return BrowserbaseReadinessCode.ReadinessFailed;
}
