import type {
  ApplicationProfile,
  DiscoveryContract,
  GoalVerifier,
  TargetNormalizationInput,
} from "../../core/domain/application-profile.js";
import type { Checkpoint, TargetDescriptor } from "@cu/contracts";
import {
  BusinessOutcomeDetectionKind,
  CheckpointType,
  ExtractFrom,
  PrimitiveType,
} from "@cu/contracts";
import { SAUCEDEMO_POLICY_DESCRIPTOR } from "./policy.js";

/**
 * SauceDemo proxy application profile.
 * Isolates ecommerce selectors and demo goal contracts from the generic engine.
 */
export const SauceDemoProfile: ApplicationProfile = {
  id: "saucedemo",

  matches(targetUrl: string): boolean {
    return /saucedemo\.com/i.test(targetUrl);
  },

  policyDescriptor() {
    return SAUCEDEMO_POLICY_DESCRIPTOR;
  },

  resolveInvocationParameters(input) {
    const next = { ...input.parameters };
    if (next.username === undefined) {
      next.username =
        input.getenv("SAUCE_USERNAME") ?? "standard_user";
    }
    if (next.password === undefined) {
      next.password =
        input.getenv("SAUCE_PASSWORD") ?? "secret_sauce";
    }
    return next;
  },

  bindTypeValue(input) {
    // Prefer exact parameter equality (handled by compiler). Profile only
    // maps sensitive password-field typing when value was redacted/placeholder.
    if (
      input.sensitive ||
      input.control.inputType === "password" ||
      input.typedValue === "{{password}}" ||
      input.typedValue === "$PASSWORD" ||
      input.typedValue === "***"
    ) {
      const pwd = input.declaredInputs.find((i) => i.sensitive || i.name === "password");
      return pwd?.name;
    }
    return undefined;
  },

  discoveryContract(input): DiscoveryContract {
    // productName is consumed via parameters / goal by extractOutputs & success templates.

    return {
      capability: {
        id: "cart.add-product",
        name: "Add Product to Cart",
        description: input.goal,
      },
      inputs: [
        {
          name: "productName",
          type: PrimitiveType.String,
          required: true,
          description: "Visible product name",
        },
        {
          name: "username",
          type: PrimitiveType.String,
          required: true,
          description: "Demo login username (session bootstrap)",
        },
        {
          name: "password",
          type: PrimitiveType.String,
          required: true,
          description: "Demo login password (session bootstrap)",
          sensitive: true,
        },
      ],
      outputs: [
        {
          name: "productName",
          type: PrimitiveType.String,
          description: "Product referenced by the capability",
        },
        {
          name: "cartCount",
          type: PrimitiveType.Number,
          description: "Cart badge count",
        },
        {
          name: "inCart",
          type: PrimitiveType.Boolean,
          description: "Whether product text is visible on cart page",
        },
      ],
      extractOutputs: [
        {
          name: "productName",
          from: ExtractFrom.Input,
          inputKey: "productName",
          transform: "string",
        },
        {
          name: "cartCount",
          from: ExtractFrom.Count,
          target: {
            description: "Cart badge",
            primary: { kind: "css", selector: ".shopping_cart_badge" },
            fallbacks: [{ kind: "testId", testId: "shopping-cart-badge" }],
          },
          transform: "number",
        },
        {
          name: "inCart",
          from: ExtractFrom.VisibleTextIncludes,
          inputKey: "productName",
          transform: "boolean",
        },
      ],
      success: {
        type: CheckpointType.Composite,
        op: "and",
        checks: [
          { type: CheckpointType.Url, pattern: "cart\\.html" },
          {
            type: CheckpointType.ElementText,
            target: {
              description: "Product text on page",
              primary: { kind: "text", text: "{{productName}}" },
              fallbacks: [
                { kind: "css", selector: ".inventory_item_name" },
                { kind: "testId", testId: "inventory-item-name" },
              ],
            },
            expected: "{{productName}}",
          },
        ],
      },
      knownOutcomes: [
        {
          code: "PRODUCT_NOT_FOUND",
          message: "No product matched the requested product name.",
          detection: {
            kind: BusinessOutcomeDetectionKind.MissingTarget,
            stepId: "add-product",
          },
        },
      ],
    };
  },

  normalizeClickTarget(input: TargetNormalizationInput): TargetDescriptor | undefined {
    if (!isAddToCartControl(input.control, input.reasoning)) return undefined;
    const product =
      typeof input.parameters.productName === "string"
        ? input.parameters.productName
        : undefined;
    if (!product) return undefined;
    return addToCartTarget(product);
  },

  checkpointAfterClick(input): Checkpoint | undefined {
    if (isAddToCartControl(input.control, input.reasoning)) {
      return {
        type: CheckpointType.ElementVisible,
        target: {
          description: "Cart badge after add",
          primary: { kind: "css", selector: ".shopping_cart_badge" },
          fallbacks: [
            { kind: "testId", testId: "shopping-cart-badge" },
            { kind: "role", role: "button", name: "Remove" },
          ],
        },
      };
    }
    if (/login/i.test(`${input.control.accessibleName ?? ""} ${input.reasoning}`)) {
      return { type: CheckpointType.Url, pattern: "inventory\\.html" };
    }
    if (
      /shopping-cart|cart/i.test(
        `${input.control.accessibleName ?? ""} ${input.reasoning}`,
      )
    ) {
      return { type: CheckpointType.Url, pattern: "cart\\.html" };
    }
    return undefined;
  },

  createGoalVerifier(_contract): GoalVerifier {
    return {
      verify(ctx) {
        const product =
          typeof ctx.parameters?.productName === "string"
            ? ctx.parameters.productName
            : extractProductFromGoal(ctx.goal);
        if (!product) {
          return { ok: false, reason: "unverified: missing productName" };
        }
        const onCart = /cart\.html/i.test(ctx.observation.location);
        if (!onCart) {
          return {
            ok: false,
            reason: "Completion rejected: not on cart review page",
            expected: "url matching cart.html",
            observed: ctx.observation.location,
          };
        }
        const visible = ctx.observation.visibleText.some((t) => t.includes(product));
        if (!visible) {
          return {
            ok: false,
            reason: `Completion rejected: product "${product}" not visible`,
            expected: product,
            observed: ctx.observation.visibleText.slice(0, 10),
          };
        }
        return { ok: true, reason: "Cart page visible and product text present" };
      },
    };
  },
};

export function extractProductFromGoal(goal: string): string | undefined {
  return /Add\s+(.+?)\s+to\s+the\s+cart/i.exec(goal)?.[1]?.trim();
}

function isAddToCartControl(
  control: TargetNormalizationInput["control"],
  reasoning: string,
): boolean {
  const blob = `${control.accessibleName ?? ""} ${control.text ?? ""} ${reasoning}`;
  return /add to cart|add-to-cart/i.test(blob);
}

function addToCartTarget(_productName: string): TargetDescriptor {
  const template = "{{productName}}";
  return {
    description: "Add {{productName}} to cart",
    primary: {
      kind: "relative",
      relationship: "same-container",
      anchor: {
        primary: { kind: "text", text: template, exact: true },
        fallbacks: [],
      },
      target: {
        primary: { kind: "role", role: "button", name: "Add to cart" },
        fallbacks: [{ kind: "text", text: "Add to cart", exact: false }],
      },
    },
    fallbacks: [
      {
        kind: "xpath",
        selector: `//div[contains(@class,'inventory_item')][.//div[contains(@class,'inventory_item_name') and normalize-space()='${template}']]//button[contains(@data-test,'add-to-cart') or contains(.,'Add')]`,
      },
      {
        kind: "css",
        selector: `.inventory_item:has(.inventory_item_name:text-is("${template}")) button[data-test^="add-to-cart"]`,
      },
    ],
  };
}
