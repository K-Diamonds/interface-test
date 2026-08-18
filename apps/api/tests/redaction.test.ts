import { describe, expect, it } from "vitest";
import { redactSecrets, containsSecrets, redactValue } from "../src/core/policy/redaction.js";

describe("redaction", () => {
  it("redacts bearer tokens", () => {
    expect(redactSecrets("Authorization: Bearer sk-abc123XYZ")).toContain(
      "[REDACTED]",
    );
  });

  it("redacts password assignments", () => {
    expect(redactSecrets('password: "secret_sauce"')).toMatch(/\[REDACTED\]/);
  });

  it("redacts cookies", () => {
    expect(redactSecrets("Cookie: session=abc; other=1")).toContain("[REDACTED]");
  });

  it("redacts SSN-like values", () => {
    expect(redactSecrets("ssn 123-45-6789")).toContain("[REDACTED]");
  });

  it("redacts sensitive object keys", () => {
    const out = redactValue({ password: "x", token: "y", ok: "z" }) as Record<
      string,
      string
    >;
    expect(out.password).toBe("[REDACTED]");
    expect(out.token).toBe("[REDACTED]");
    expect(out.ok).toBe("z");
  });

  it("detects secrets", () => {
    expect(containsSecrets("Bearer sk-abcdefghij")).toBe(true);
    expect(containsSecrets("hello world")).toBe(false);
  });

  it("redacts Browserbase and blob secrets", () => {
    expect(redactSecrets("key=bb_live_abc123XYZ")).toContain("[REDACTED]");
    expect(redactSecrets("BLOB_READ_WRITE_TOKEN=vercel_blob_rw_abc")).toContain(
      "[REDACTED]",
    );
    expect(containsSecrets("bb_live_abc")).toBe(true);
    expect(containsSecrets("vercel_blob_rw_abc")).toBe(true);
  });
});
