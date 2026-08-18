export { loadEnv } from "../../infrastructure/env.js";

export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

/** Parse --input key=value and --inputs JSON */
export function parseInputArgs(
  args: Record<string, string | boolean>,
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  if (typeof args.inputs === "string") {
    Object.assign(inputs, JSON.parse(args.inputs) as Record<string, unknown>);
  }
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input" && argv[i + 1]) {
      const raw = argv[i + 1]!;
      const eq = raw.indexOf("=");
      if (eq !== -1) {
        inputs[raw.slice(0, eq)] = raw.slice(eq + 1);
      }
      i += 1;
    }
  }
  return inputs;
}
