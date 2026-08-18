/** Strip CDP connect URLs and tokens from logs and error messages. */
export function redactConnectUrl(value: string): string {
  return value
    .replace(/wss?:\/\/[^\s"']+/gi, "[REDACTED_CONNECT_URL]")
    .replace(/connectUrl["']?\s*[:=]\s*["'][^"']+["']/gi, "connectUrl:[REDACTED]");
}
