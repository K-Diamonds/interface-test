/**
 * Sensitive-data redaction for logs, evidence, and capability artifacts.
 * Never persist passwords, tokens, cookies, or full PII.
 */

const PATTERNS: Array<{ name: string; regex: RegExp }> = [
  {
    name: "bearer",
    regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  },
  {
    name: "api_key",
    regex:
      /(?:api[_-]?key|apikey|openai_api_key|sk-(?:proj-)?|xox[baprs]-)[A-Za-z0-9\-._]*/gi,
  },
  {
    name: "password_assignment",
    regex: /((?:password|passwd|pwd)\s*[:=]\s*)([^\s"',}]+)/gi,
  },
  {
    name: "cookie_header",
    regex: /(Cookie:\s*)([^\r\n]+)/gi,
  },
  {
    name: "auth_header",
    regex: /(Authorization:\s*)([^\r\n]+)/gi,
  },
  {
    name: "ssn",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    name: "email",
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  {
    name: "account_number",
    regex: /\b(?:acct|account)[#:\s-]*\d{8,17}\b/gi,
  },
  {
    name: "secret_sauce_password",
    // Public demo password — still redact from durable logs/artifacts
    regex: /\bsecret_sauce\b/gi,
  },
  {
    name: "browserbase_api_key",
    regex: /\bbb_(?:live|test)_[A-Za-z0-9]+/gi,
  },
  {
    name: "vercel_blob_token",
    regex: /\bvercel_blob_rw_[A-Za-z0-9_]+/gi,
  },
];

const SECRET_HINTS = [
  /sk-[A-Za-z0-9]{10,}/,
  /Bearer\s+[A-Za-z0-9\-._~+/]{8,}/i,
  /password["']?\s*:\s*["'][^"']+["']/i,
  /Cookie:\s*\w+=/i,
  /\bsecret_sauce\b/i,
  /\bbb_(?:live|test)_/i,
  /\bvercel_blob_rw_/i,
];

export function redactSecrets(input: string): string {
  let result = input;
  for (const pattern of PATTERNS) {
    if (
      pattern.name === "password_assignment" ||
      pattern.name === "cookie_header" ||
      pattern.name === "auth_header"
    ) {
      result = result.replace(pattern.regex, (_match, prefix: string) => {
        return `${prefix}[REDACTED]`;
      });
    } else if (pattern.name === "bearer") {
      result = result.replace(pattern.regex, "Bearer [REDACTED]");
    } else {
      result = result.replace(pattern.regex, "[REDACTED]");
    }
  }
  return result;
}

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSecrets(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (/password|token|secret|cookie|authorization|api[_-]?key/i.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactValue(v);
      }
    }
    return out;
  }
  return value;
}

export function containsSecrets(input: string): boolean {
  return SECRET_HINTS.some((re) => re.test(input));
}
