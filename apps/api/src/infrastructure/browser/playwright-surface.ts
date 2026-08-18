/**
 * Compatibility adapter: tests and CLIs that still call PlaywrightSurface.launch
 * go through LocalPlaywrightSessionFactory + PlaywrightPageSurface.
 */
import { PlaywrightPageSurface } from "./playwright-page-surface.js";
import { createLocalPlaywrightSessionFactory } from "./local/local-session-factory.js";

export { PlaywrightPageSurface };
export { PlaywrightPageSurface as PlaywrightSurface };

export interface PlaywrightSurfaceOptions {
  headless?: boolean;
  slowMo?: number;
  tracesDir?: string;
}

export async function launchPlaywrightSurface(
  options: PlaywrightSurfaceOptions = {},
): Promise<PlaywrightPageSurface> {
  const handle = await createLocalPlaywrightSessionFactory().create({
    headless: options.headless,
    slowMo: options.slowMo,
    tracesDir: options.tracesDir,
  });
  return handle.surface as PlaywrightPageSurface;
}

type Launchable = typeof PlaywrightPageSurface & {
  launch: typeof launchPlaywrightSurface;
};

(PlaywrightPageSurface as Launchable).launch = launchPlaywrightSurface;
