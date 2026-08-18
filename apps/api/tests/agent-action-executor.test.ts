import { describe, expect, it } from "vitest";
import { ActionType } from "@cu/contracts";
import type { ObservableControl } from "@cu/contracts";
import { resolveTypedValue } from "../src/application/discovery/agent-action-executor.js";

function control(inputType?: string): ObservableControl {
  return {
    ref: "c1",
    role: "textbox",
    accessibleName: "Password",
    text: "",
    tag: "input",
    inputType,
    candidateLocators: [],
  };
}

describe("discovery type-value binding", () => {
  it("uses invocation password for password fields without trusting model prose", () => {
    const value = resolveTypedValue(
      {
        actionType: ActionType.Type,
        targetRef: "c1",
        value: "hunter2",
        reasoning: "type the password",
        expectedEffect: "data-entry",
      },
      control("password"),
      { password: "secret_sauce" },
    );
    expect(value).toBe("secret_sauce");
  });

  it("substitutes {{username}} from parameters", () => {
    const value = resolveTypedValue(
      {
        actionType: ActionType.Type,
        targetRef: "c1",
        value: "{{username}}",
        reasoning: "login",
        expectedEffect: "data-entry",
      },
      control("text"),
      { username: "standard_user" },
    );
    expect(value).toBe("standard_user");
  });
});
