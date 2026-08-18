import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveRepoRoot } from "./paths.js";

/** Minimal .env loader (no dotenv dependency). Prefers monorepo root, then apps/api. */
export function loadEnv(fileName = ".env"): void {
  const candidates = [
    resolve(resolveRepoRoot(), fileName),
    resolve(resolveRepoRoot(), "apps/api", fileName),
    resolve(process.cwd(), fileName),
  ];
  const envPath = candidates.find((p) => existsSync(p));
  if (!envPath) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
