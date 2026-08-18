import type { DiscoveryModel } from "../../../application/discovery/discovery-model.js";
import { SauceDemoScriptedModel } from "./saucedemo-scripted-model.js";

/**
 * Factory for the offline scripted DiscoveryModel.
 * Must not be used as a fallback when a live model provider fails.
 */
export function createOfflineDiscoveryModel(): DiscoveryModel {
  return new SauceDemoScriptedModel();
}
