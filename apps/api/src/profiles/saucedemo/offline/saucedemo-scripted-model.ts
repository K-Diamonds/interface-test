import { ActionType, type AgentAction } from "@cu/contracts";
import type { DiscoveryModel, DiscoveryModelInput } from "../../../application/discovery/discovery-model.js";
import { ScriptedDemoPhase } from "./scripted-phase.js";

/**
 * Deterministic, observation-driven model for offline demos and tests.
 * Not canonical LLM discovery evidence.
 */
export class SauceDemoScriptedModel implements DiscoveryModel {
  private phase: ScriptedDemoPhase = ScriptedDemoPhase.LoginUser;

  async nextAction(input: DiscoveryModelInput): Promise<AgentAction> {
    const product =
      /Add\s+(.+?)\s+to\s+the\s+cart/i.exec(input.goal)?.[1]?.trim() ??
      "Sauce Labs Backpack";

    const findRef = (pred: (line: string) => boolean): string | undefined => {
      const lines = input.observationSummary.split("\n");
      for (const line of lines) {
        if (!line.includes("ref=")) continue;
        if (pred(line)) {
          const m = /ref=(c\d+)/.exec(line);
          if (m) return m[1];
        }
      }
      return undefined;
    };

    // Observation-driven completion — never claim done without cart URL
    if (/cart\.html/.test(input.observationSummary)) {
      return {
        actionType: ActionType.Complete,
        reasoning:
          "[scripted] Cart page observed; product context present in goal.",
        expectedEffect: "Goal complete",
        outputs: {
          productName: product,
          cartCount: 1,
          inCart: true,
        },
      };
    }

    // Recover phase from observation if prior click did not navigate
    if (/inventory\.html/.test(input.observationSummary)) {
      if (this.phase === ScriptedDemoPhase.LoginUser || this.phase === ScriptedDemoPhase.LoginPass || this.phase === ScriptedDemoPhase.LoginClick) {
        this.phase = findRef((l) => /Remove/i.test(l)) ? "cart" : "add";
      }
    }

    if (this.phase === ScriptedDemoPhase.LoginUser) {
      const ref =
        findRef((l) => /Username/i.test(l) && /placeholder|textbox|input/i.test(l)) ??
        findRef((l) => /inputType=text/i.test(l));
      if (!ref) {
        return {
          actionType: ActionType.RequestHuman,
          reason: "Username field not found",
          reasoning: "[scripted] Cannot locate username control",
          expectedEffect: "Human assists",
        };
      }
      this.phase = ScriptedDemoPhase.LoginPass;
      return {
        actionType: ActionType.Type,
        targetRef: ref,
        value: "{{username}}",
        reasoning: "[scripted] Type username into the login form.",
        expectedEffect: "Username field populated",
      };
    }

    if (this.phase === ScriptedDemoPhase.LoginPass) {
      const ref = findRef((l) => /password|inputType=password/i.test(l));
      if (!ref) {
        return {
          actionType: ActionType.RequestHuman,
          reason: "Password field not found",
          reasoning: "[scripted] Cannot locate password control",
          expectedEffect: "Human assists",
        };
      }
      this.phase = ScriptedDemoPhase.LoginClick;
      return {
        actionType: ActionType.Type,
        targetRef: ref,
        value: "{{password}}",
        sensitive: true,
        reasoning: "[scripted] Type password into the login form.",
        expectedEffect: "Password field populated",
      };
    }

    if (this.phase === ScriptedDemoPhase.LoginClick) {
      const ref =
        findRef((l) => /Login/i.test(l) && /button/i.test(l)) ??
        findRef((l) => /name="Login"/i.test(l));
      if (!ref) {
        return {
          actionType: ActionType.RequestHuman,
          reason: "Login button not found",
          reasoning: "[scripted] Cannot locate login control",
          expectedEffect: "Human assists",
        };
      }
      this.phase = ScriptedDemoPhase.Add;
      return {
        actionType: ActionType.Click,
        targetRef: ref,
        reasoning: "[scripted] Activate Login to open inventory.",
        expectedEffect: "Navigate to inventory",
      };
    }

    if (this.phase === ScriptedDemoPhase.Add) {
      const ref =
        findRef(
          (l) =>
            /add-to-cart/i.test(l) &&
            new RegExp(product.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[- ]"), "i").test(l),
        ) ??
        findRef(
          (l) =>
            /Add to cart/i.test(l) &&
            !/Remove/i.test(l) &&
            /button/i.test(l),
        ) ??
        findRef((l) => /testId=add-to-cart/i.test(l));
      if (!ref) {
        return {
          actionType: ActionType.RequestHuman,
          reason: "Add to cart control not found",
          reasoning: "[scripted] Cannot locate add button",
          expectedEffect: "Human assists",
        };
      }
      this.phase = ScriptedDemoPhase.Cart;
      return {
        actionType: ActionType.Click,
        targetRef: ref,
        reasoning: `[scripted] Add product control for ${product}.`,
        expectedEffect: "Product added; cart badge increments",
      };
    }

    // cart phase — stay here until observation shows cart.html
    const ref =
      findRef((l) => /testId=shopping-cart-link/i.test(l)) ??
      findRef((l) => /shopping-cart-link|shopping_cart_link/i.test(l)) ??
      findRef((l) => /name=.*shopping-cart/i.test(l)) ??
      findRef((l) => /role=link/i.test(l) && /cart/i.test(l));
    if (!ref) {
      return {
        actionType: ActionType.RequestHuman,
        reason: "Cart link not found",
        reasoning: "[scripted] Cannot locate cart control",
        expectedEffect: "Human assists",
      };
    }
    this.phase = ScriptedDemoPhase.Cart;
    return {
      actionType: ActionType.Click,
      targetRef: ref,
      reasoning: "[scripted] Open shopping cart link.",
      expectedEffect: "Cart page visible",
    };
  }
}
