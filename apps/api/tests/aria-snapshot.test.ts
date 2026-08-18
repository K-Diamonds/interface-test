import { describe, expect, it } from "vitest";
import { parseAriaSnapshot } from "../src/infrastructure/browser/observation/accessibility-observation-provider.js";

describe("ARIA snapshot parsing", () => {
  it("extracts roles, names, and dialogs without keeping the raw tree", () => {
    const parsed = parseAriaSnapshot(`
- heading "Back-office batch" [level=1]
- button "Complete task"
- dialog "Scheduled maintenance":
  - heading "Scheduled maintenance" [level=2]
  - button "Continue to application"
`);
    expect(parsed.some((n) => n.role === "dialog" && n.name === "Scheduled maintenance")).toBe(
      true,
    );
    expect(parsed.some((n) => n.role === "button" && n.name === "Complete task")).toBe(true);
    expect(parsed.some((n) => n.role === "button" && n.name === "Continue to application")).toBe(
      true,
    );
  });
});
