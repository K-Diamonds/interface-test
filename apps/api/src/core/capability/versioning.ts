export const GENERATOR_VERSION = "1.0.0";

export function nextCapabilityVersion(existingVersions: number[]): number {
  if (existingVersions.length === 0) return 1;
  return Math.max(...existingVersions) + 1;
}

export function capabilityPath(capabilityId: string, version: number): string {
  return `artifacts/capabilities/${capabilityId}/v${version}.json`;
}
