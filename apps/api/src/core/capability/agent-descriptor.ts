import type { CapabilityArtifact } from "@cu/contracts";
import { CapabilityStatus, PrimitiveType } from "@cu/contracts";
import type { AgentCapabilityDescriptor } from "@cu/contracts";

const SECRET_INPUT = /password|passwd|pwd|secret|token|cookie|authorization|api[_-]?key|credential/i;

/** Session bootstrap and secrets stay off the public agent contract. */
export function isSecretContractInput(input: {
  name: string;
  sensitive?: boolean;
}): boolean {
  if (input.sensitive) return true;
  if (SECRET_INPUT.test(input.name)) return true;
  return /^username$/i.test(input.name);
}

export function publicContractInputs<T extends { name: string; sensitive?: boolean }>(
  inputs: T[],
): T[] {
  return inputs.filter((input) => !isSecretContractInput(input));
}

/**
 * Agent-facing catalog view — typed contract only, no locators/Playwright.
 */
export function toAgentDescriptor(
  artifact: CapabilityArtifact,
): AgentCapabilityDescriptor {
  return {
    id: artifact.capability.id,
    version: artifact.capability.version,
    name: artifact.capability.name,
    description: artifact.capability.description,
    status: artifact.capability.status,
    invocable: artifact.capability.status === CapabilityStatus.Approved,
    inputs: publicContractInputs(artifact.contract.inputs).map((i) => ({
      name: i.name,
      type: i.type,
      required: i.required,
      description: i.description,
    })),
    outputs: artifact.contract.outputs.map((o) => ({
      name: o.name,
      type: o.type,
      description: o.description,
    })),
  };
}

/**
 * Optional later mapper — not an OpenAI/Gemini integration.
 */
export function toOpenAITool(descriptor: AgentCapabilityDescriptor): {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description?: string }>;
      required: string[];
    };
  };
} {
  const properties: Record<string, { type: string; description?: string }> = {};
  const required: string[] = [];
  for (const input of descriptor.inputs) {
    properties[input.name] = {
      type:
        input.type === PrimitiveType.Number
          ? "number"
          : input.type === PrimitiveType.Boolean
            ? "boolean"
            : "string",
      description: input.description,
    };
    if (input.required) required.push(input.name);
  }
  return {
    type: "function",
    function: {
      name: `${descriptor.id.replace(/[^a-zA-Z0-9_]/g, "_")}_v${descriptor.version}`,
      description: descriptor.description,
      parameters: { type: "object", properties, required },
    },
  };
}
