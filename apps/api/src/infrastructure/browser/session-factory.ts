import type { ComputerSurface } from "../../core/surface.js";

export interface BrowserSessionCreateContext {
  tracesDir?: string;
  headless?: boolean;
  slowMo?: number;
  runId?: string;
}

export interface BrowserSessionHandle {
  surface: ComputerSurface;
  /** Provider session id (Browserbase). Never a connect URL. */
  externalSessionId?: string;
  disconnect(): Promise<void>;
  terminate(): Promise<void>;
}

export interface BrowserSessionFactory {
  create(context: BrowserSessionCreateContext): Promise<BrowserSessionHandle>;
  reconnect?(sessionId: string): Promise<BrowserSessionHandle>;
}
