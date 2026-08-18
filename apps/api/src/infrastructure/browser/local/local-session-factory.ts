import { chromium } from "playwright";
import { PlaywrightPageSurface } from "../playwright-page-surface.js";
import type {
  BrowserSessionCreateContext,
  BrowserSessionFactory,
  BrowserSessionHandle,
} from "../session-factory.js";

export function createLocalPlaywrightSessionFactory(): BrowserSessionFactory {
  return {
    async create(context: BrowserSessionCreateContext): Promise<BrowserSessionHandle> {
      const browser = await chromium.launch({
        headless: context.headless ?? true,
        slowMo: context.slowMo,
      });
      const browserContext = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      if (context.tracesDir) {
        await browserContext.tracing.start({ screenshots: true, snapshots: true });
      }
      const page = await browserContext.newPage();
      const surface = PlaywrightPageSurface.attach({
        page,
        context: browserContext,
        browser,
        ownsBrowser: true,
      });
      return {
        surface,
        disconnect: () => surface.close(),
        terminate: () => surface.close(),
      };
    },
  };
}
