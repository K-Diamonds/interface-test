import { chromium } from "playwright-core";
import { HttpError } from "../../../core/errors.js";
import { loadConfig } from "../../config.js";
import { PlaywrightPageSurface } from "../playwright-page-surface.js";
import type {
  BrowserSessionCreateContext,
  BrowserSessionFactory,
  BrowserSessionHandle,
} from "../session-factory.js";
import {
  createBrowserbaseGateway,
  type BrowserbaseGateway,
} from "./browserbase-client.js";
import { redactConnectUrl } from "./browserbase-redact.js";

function connectError(err: unknown): HttpError {
  const message = err instanceof Error ? err.message : String(err);
  if (/expired|not found|410|404|TIMED_OUT|COMPLETED/i.test(message)) {
    return new HttpError(
      410,
      "SESSION_EXPIRED",
      "Browserbase session is no longer available",
    );
  }
  return new HttpError(502, "BROWSER_RUNTIME_ERROR", redactConnectUrl(message));
}

async function connectHandle(
  gateway: BrowserbaseGateway,
  sessionId: string,
  connectUrl: string,
  tracesDir?: string,
): Promise<BrowserSessionHandle> {
  try {
    const browser = await chromium.connectOverCDP(connectUrl);
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error("Browserbase session has no default context");
    }
    const page = context.pages()[0] ?? (await context.newPage());
    if (tracesDir) {
      await context.tracing
        .start({ screenshots: true, snapshots: true })
        .catch(() => undefined);
    }
    const surface = PlaywrightPageSurface.attach({
      page,
      context,
      browser,
      ownsBrowser: false,
      onClose: async () => {
        await browser.close().catch(() => undefined);
      },
    });
    return {
      surface,
      externalSessionId: sessionId,
      disconnect: async () => {
        await surface.close();
      },
      terminate: async () => {
        await surface.close();
        await gateway.requestRelease(sessionId).catch(() => undefined);
      },
    };
  } catch (err) {
    throw connectError(err);
  }
}

export function createBrowserbaseSessionFactory(
  gateway: BrowserbaseGateway = createBrowserbaseGateway(),
): BrowserSessionFactory {
  return {
    async create(context: BrowserSessionCreateContext): Promise<BrowserSessionHandle> {
      const cfg = loadConfig();
      const session = await gateway.createSession({
        projectId: cfg.browser.browserbase.projectId,
        keepAlive: true,
        timeout: cfg.browser.browserbase.sessionTimeoutSeconds,
        userMetadata: context.runId ? { runId: context.runId } : undefined,
      });
      if (!session.connectUrl) {
        throw new HttpError(502, "BROWSER_RUNTIME_ERROR", "Browserbase session did not return a connection");
      }
      return connectHandle(gateway, session.id, session.connectUrl, context.tracesDir);
    },

    async reconnect(sessionId: string): Promise<BrowserSessionHandle> {
      const session = await gateway.retrieveSession(sessionId);
      if (!session.connectUrl || /expired|complete|error/i.test(session.status)) {
        throw new HttpError(410, "SESSION_EXPIRED", "Browserbase session is no longer available");
      }
      return connectHandle(gateway, session.id, session.connectUrl);
    },
  };
}
