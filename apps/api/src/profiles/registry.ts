import type { ApplicationProfile } from "../core/domain/application-profile.js";
import { SauceDemoProfile } from "./saucedemo/profile.js";
import type { DiscoveryModel } from "../application/discovery/discovery-model.js";

const profiles: ApplicationProfile[] = [SauceDemoProfile];

export function resolveApplicationProfile(
  targetUrl: string,
): ApplicationProfile | undefined {
  return profiles.find((p) => p.matches(targetUrl));
}

export function requireApplicationProfile(
  targetUrl: string,
): ApplicationProfile {
  const profile = resolveApplicationProfile(targetUrl);
  if (!profile) {
    throw new Error(
      `No application profile registered for target ${targetUrl}. ` +
        `Add a profile or use a supported demo proxy.`,
    );
  }
  return profile;
}

/** Offline/scripted discovery model for a target — profile-owned. */
export async function createOfflineDiscoveryModelForTarget(
  targetUrl: string,
): Promise<DiscoveryModel> {
  const profile = requireApplicationProfile(targetUrl);
  if (profile.id === "saucedemo") {
    const { createOfflineDiscoveryModel } = await import(
      "./saucedemo/offline/index.js"
    );
    return createOfflineDiscoveryModel();
  }
  throw new Error(
    `No offline/scripted discovery model registered for profile "${profile.id}".`,
  );
}
