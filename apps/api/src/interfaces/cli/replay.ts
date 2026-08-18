#!/usr/bin/env node
import { replayCapabilityApp } from "../../application/replay-capability.js";
import { loadEnv, parseArgs, parseInputArgs } from "./args.js";
import { ReplayExecutionContext } from "@cu/contracts";

function usage(): never {
  console.error(
    "Usage: pnpm replay --capability-id <id> --version <n> --inputs '{...}'\n" +
      "   or: pnpm replay --capability <path-to-artifact.json> --inputs '{...}'",
  );
  process.exit(2);
}

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));

  const capabilityPath =
    typeof args.capability === "string" && args.capability.includes("/")
      ? (args.capability as string)
      : undefined;
  const capabilityId =
    typeof args.capability === "string" && !args.capability.includes("/")
      ? (args.capability as string)
      : typeof args["capability-id"] === "string"
        ? (args["capability-id"] as string)
        : undefined;
  const version = args.version ? Number(args.version) : undefined;

  if (capabilityPath) {
    // path form — version is encoded in the file
  } else if (!capabilityId || !version) {
    usage();
  }

  const inputs = parseInputArgs(args);

  console.log("Starting deterministic replay (no LLM)…");
  if (capabilityPath) {
    console.log(`Capability path: ${capabilityPath}`);
  } else {
    console.log(`Capability: ${capabilityId}@v${version}`);
  }
  console.log(
    `Inputs: ${JSON.stringify({ ...inputs, password: inputs.password ? "[REDACTED]" : undefined })}`,
  );

  const result = await replayCapabilityApp({
    capabilityPath,
    capabilityId,
    version,
    inputs,
    executionContext: ReplayExecutionContext.Development,
    options: {
      headless: args.headed ? false : true,
      enableOperator: Boolean(args.operator),
    },
  });

  console.log("\nReplay result:");
  console.log(JSON.stringify(result, null, 2));

  if (result.status === "success") process.exit(0);
  if (result.status === "business_outcome") process.exit(2);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
