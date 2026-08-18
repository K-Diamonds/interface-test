import type { Page } from "playwright-core";
import type { SurfaceObservation } from "@cu/contracts";

export interface BrowserObservationProvider {
  observe(page: Page): Promise<SurfaceObservation>;
}
