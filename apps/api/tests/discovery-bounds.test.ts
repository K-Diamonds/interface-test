import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("discovery request bounds", () => {
  it("discover-capability clamps maxSteps and timeoutSeconds from request", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/application/discover-capability.ts"),
      "utf8",
    );
    expect(src).toMatch(/command\.maxSteps/);
    expect(src).toMatch(/command\.timeoutSeconds/);
    expect(src).toMatch(/clamp\(/);
    expect(src).toMatch(/maxAllowedDiscoverySteps/);
  });

  it("run-jobs forwards maxSteps and timeoutSeconds to discovery", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/application/run-jobs.ts"),
      "utf8",
    );
    expect(src).toMatch(/maxSteps: body\.maxSteps/);
    expect(src).toMatch(/timeoutSeconds: body\.timeoutSeconds/);
  });
});
