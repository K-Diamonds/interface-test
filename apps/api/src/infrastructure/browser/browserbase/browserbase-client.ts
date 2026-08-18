import Browserbase from "@browserbasehq/sdk";
import { loadConfig } from "../../config.js";
import { redactConnectUrl } from "./browserbase-redact.js";
import {
  BrowserbaseReadinessCode,
  classifyBrowserbaseError,
  logBrowserbaseReadiness,
  type BrowserbaseReadiness,
} from "./browserbase-readiness.js";

export interface BrowserbaseSessionRecord {
  id: string;
  connectUrl?: string;
  status: string;
}

export interface BrowserbaseLiveView {
  debuggerUrl?: string;
  debuggerFullscreenUrl?: string;
}

export interface BrowserbaseGateway {
  createSession(input: {
    projectId: string;
    keepAlive: boolean;
    timeout: number;
    userMetadata?: Record<string, string>;
  }): Promise<BrowserbaseSessionRecord>;
  retrieveSession(id: string): Promise<BrowserbaseSessionRecord>;
  debugSession(id: string): Promise<BrowserbaseLiveView>;
  requestRelease(id: string): Promise<void>;
  ping(): Promise<boolean>;
  diagnose(): Promise<BrowserbaseReadiness>;
}

function client(): Browserbase {
  const cfg = loadConfig();
  const apiKey = cfg.browser.browserbase.apiKey;
  if (!apiKey) {
    throw new Error("BROWSERBASE_API_KEY is not configured");
  }
  // Installed @browserbasehq/sdk@2.18 constructor takes apiKey only.
  // projectId is required on sessions.create(), not SDK init.
  return new Browserbase({ apiKey });
}

let gatewayOverride: BrowserbaseGateway | undefined;

/** Test seam — never used to stub production availability. */
export function setBrowserbaseGatewayForTests(
  gateway: BrowserbaseGateway | undefined,
): void {
  gatewayOverride = gateway;
}

export function createBrowserbaseGateway(): BrowserbaseGateway {
  if (gatewayOverride) return gatewayOverride;
  return {
    async createSession(input) {
      const bb = client();
      const session = await bb.sessions.create({
        projectId: input.projectId,
        keepAlive: input.keepAlive,
        api_timeout: input.timeout,
        userMetadata: input.userMetadata,
      });
      return {
        id: session.id,
        connectUrl: session.connectUrl,
        status: session.status ?? "RUNNING",
      };
    },
    async retrieveSession(id) {
      const bb = client();
      const session = await bb.sessions.retrieve(id);
      return {
        id: session.id,
        connectUrl: session.connectUrl,
        status: session.status ?? "UNKNOWN",
      };
    },
    async debugSession(id) {
      const bb = client();
      const debug = await bb.sessions.debug(id);
      return {
        debuggerUrl: debug.debuggerUrl,
        debuggerFullscreenUrl: debug.debuggerFullscreenUrl,
      };
    },
    async requestRelease(id) {
      const bb = client();
      await bb.sessions.update(id, {
        status: "REQUEST_RELEASE",
        projectId: loadConfig().browser.browserbase.projectId,
      });
    },
    async diagnose() {
      const cfg = loadConfig().browser.browserbase;
      const hasApiKey = Boolean(cfg.apiKey);
      const hasProjectId = Boolean(cfg.projectId);
      if (!hasApiKey) {
        const result: BrowserbaseReadiness = {
          ok: false,
          code: BrowserbaseReadinessCode.ApiKeyMissing,
        };
        logBrowserbaseReadiness({
          hasApiKey,
          hasProjectId,
          result: "failed",
          code: result.code,
        });
        return result;
      }
      if (!hasProjectId) {
        const result: BrowserbaseReadiness = {
          ok: false,
          code: BrowserbaseReadinessCode.ProjectInvalid,
        };
        logBrowserbaseReadiness({
          hasApiKey,
          hasProjectId,
          result: "failed",
          code: result.code,
        });
        return result;
      }
      try {
        const bb = client();
        await bb.projects.retrieve(cfg.projectId);
        logBrowserbaseReadiness({
          hasApiKey,
          hasProjectId,
          result: "ok",
          code: BrowserbaseReadinessCode.Ok,
        });
        return { ok: true, code: BrowserbaseReadinessCode.Ok };
      } catch (err) {
        void redactConnectUrl(err instanceof Error ? err.message : String(err));
        const code = classifyBrowserbaseError(err);
        logBrowserbaseReadiness({
          hasApiKey,
          hasProjectId,
          result: "failed",
          code,
        });
        return { ok: false, code };
      }
    },
    async ping() {
      const result = await this.diagnose();
      return result.ok;
    },
  };
}
