#!/usr/bin/env node
import { discoverCapabilityApp } from "../../application/discover-capability.js";
import { loadEnv, parseArgs } from "./args.js";
import { loadConfig } from "../../infrastructure/config.js";
import { AiProvider } from "@cu/contracts";

async function main(): Promise<void> {
  loadEnv();
  const config = loadConfig({ reload: true });
  const args = parseArgs(process.argv.slice(2));

  const goal = args.goal as string | undefined;
  const target = args.target as string | undefined;
  if (!goal || !target) {
    console.error(
      "Usage: pnpm discover --goal \"...\" --target https://... [--params '{...}'] [--scripted] [--max-steps N] [--timeout-seconds N]",
    );
    console.error(
      'Example: pnpm discover --goal "Add the requested product to the cart" --target https://www.saucedemo.com --params \'{"productName":"Sauce Labs Backpack"}\'',
    );
    process.exit(2);
  }

  const headless = args.headed ? false : config.automation.headless;
  const scripted = Boolean(args.scripted);

  let parameters: Record<string, unknown> = {};
  const paramsRaw = (args.params as string) || (args.inputs as string);
  if (paramsRaw) {
    try {
      parameters = JSON.parse(paramsRaw) as Record<string, unknown>;
    } catch {
      console.error("--params / --inputs must be valid JSON object");
      process.exit(2);
    }
  }
  // Demo convenience only — prefer --params JSON on the generic CLI.
  if (args["product-name"] && parameters.productName === undefined) {
    console.warn(
      "Note: --product-name is a SauceDemo demo convenience; prefer --params '{\"productName\":\"...\"}'.",
    );
    parameters.productName = String(args["product-name"]);
  }

  if (scripted) {
    console.log(
      "Using offline scripted model (--scripted). This does NOT satisfy LLM discovery evidence.\n",
    );
  } else if (config.ai.provider === AiProvider.Ollama) {
    console.log(
      `Using Ollama at ${config.ollama.baseUrl} (model=${config.ollama.model}).`,
    );
    console.log("Ensure `ollama serve` is running and the model is pulled.\n");
  } else if (config.ai.provider === AiProvider.Gemini) {
    if (!config.gemini.apiKey) {
      console.error(
        "Discovery configuration error:\n" +
          "AI_PROVIDER=gemini requires GEMINI_API_KEY.\n" +
          "Use --scripted explicitly for offline demo mode.",
      );
      process.exit(2);
    }
  } else if (config.ai.provider === AiProvider.OpenAI && !config.openai.apiKey) {
    console.error(
      "Discovery configuration error:\n" +
        "AI_PROVIDER=openai requires OPENAI_API_KEY.\n" +
        "Use --scripted explicitly for offline demo mode.",
    );
    process.exit(2);
  }

  console.log("Starting discovery…");
  console.log(`Goal: ${goal}`);
  console.log(`Target: ${target}`);
  console.log(
    `Model: ${
      scripted
        ? "scripted (offline)"
        : `${config.ai.provider}/${
            config.ai.provider === AiProvider.Ollama
              ? config.ollama.model
              : config.ai.provider === AiProvider.Gemini
                ? config.gemini.model
                : config.openai.model
          }`
    }`,
  );

  const result = await discoverCapabilityApp({
    goal,
    target,
    headless,
    enableOperator: Boolean(args.operator),
    parameters,
    scripted,
    maxSteps: args["max-steps"] ? Number(args["max-steps"]) : undefined,
    timeoutSeconds: args["timeout-seconds"]
      ? Number(args["timeout-seconds"])
      : undefined,
  });

  if (result.status === "completed") {
    console.log("\nDiscovery completed.");
    console.log(`Run: ${result.runId}`);
    console.log(`Capability written:\n${result.capabilityPath}`);
    console.log("\nOutputs:");
    console.log(JSON.stringify(result.outputs, null, 2));
    process.exit(0);
  }

  console.error(`\nDiscovery ${result.status}.`);
  console.error(`Run: ${result.runId}`);
  if (result.reason) console.error(`Reason: ${result.reason}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
