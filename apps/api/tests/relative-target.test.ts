import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { launchPlaywrightSurface } from "../src/infrastructure/browser/playwright-surface.js";
import { resolveRepoRoot } from "../src/infrastructure/paths.js";
import { LocatorError } from "../src/core/errors.js";

async function serveFixture(file: string): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const html = await readFile(
    path.join(resolveRepoRoot(), "apps/api/fixtures", file),
  );
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });
  const url = await new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("bind failed");
      resolve(`http://127.0.0.1:${addr.port}/`);
    });
  });
  return {
    url,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe("semantic relative targeting on hostile DOM", () => {
  it("resolves the correct Submit via same-container relative target", async () => {
    const host = await serveFixture("hostile-ledger.html");
    const surface = await launchPlaywrightSurface({ headless: true });
    try {
      await surface.navigate(host.url);
      await surface.click({
        description: "Submit invoice 1042",
        primary: {
          kind: "relative",
          relationship: "same-container",
          anchor: {
            primary: { kind: "text", text: "Invoice 1042", exact: true },
            fallbacks: [],
          },
          target: {
            primary: { kind: "role", role: "button", name: "Submit" },
            fallbacks: [],
          },
        },
        fallbacks: [],
      });
      const status = await surface.read({
        description: "chosen",
        primary: { kind: "text", text: "1042", exact: true },
        fallbacks: [],
      });
      expect(status).toContain("1042");
    } finally {
      await surface.close();
      await host.close();
    }
  }, 30_000);

  it("fails closed when identical Submit buttons have no relative anchor", async () => {
    const host = await serveFixture("hostile-ledger.html");
    const surface = await launchPlaywrightSurface({ headless: true });
    try {
      await surface.navigate(host.url);
      await expect(
        surface.click({
          description: "Submit",
          primary: { kind: "role", role: "button", name: "Submit" },
          fallbacks: [],
        }),
      ).rejects.toBeInstanceOf(LocatorError);
    } finally {
      await surface.close();
      await host.close();
    }
  }, 30_000);
});
