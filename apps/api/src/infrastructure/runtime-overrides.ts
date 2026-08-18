import type { BrowserSessionFactory } from "./browser/session-factory.js";
import type { ObjectStore } from "./persistence/object-store.js";

/**
 * Test-only seams. Production never sets these.
 * Keeps Browserbase SDK and Vercel Blob out of ordinary CI.
 */
let sessionFactoryOverride: BrowserSessionFactory | undefined;
let objectStoreOverride: ObjectStore | undefined;
let runtimeProbeOverride: (() => Promise<boolean>) | undefined;
let runtimeKindOverride: "local" | "browserbase" | undefined;

export function setSessionFactoryForTests(
  factory: BrowserSessionFactory | undefined,
): void {
  sessionFactoryOverride = factory;
}

export function getSessionFactoryOverride(): BrowserSessionFactory | undefined {
  return sessionFactoryOverride;
}

export function setObjectStoreForTests(store: ObjectStore | undefined): void {
  objectStoreOverride = store;
}

export function getObjectStoreOverride(): ObjectStore | undefined {
  return objectStoreOverride;
}

export function setRuntimeProbeForTests(
  probe: (() => Promise<boolean>) | undefined,
): void {
  runtimeProbeOverride = probe;
}

export function getRuntimeProbeOverride(): (() => Promise<boolean>) | undefined {
  return runtimeProbeOverride;
}

export function setBrowserRuntimeKindForTests(
  kind: "local" | "browserbase" | undefined,
): void {
  runtimeKindOverride = kind;
}

export function getBrowserRuntimeKindOverride():
  | "local"
  | "browserbase"
  | undefined {
  return runtimeKindOverride;
}

export function resetRuntimeOverridesForTests(): void {
  sessionFactoryOverride = undefined;
  objectStoreOverride = undefined;
  runtimeProbeOverride = undefined;
  runtimeKindOverride = undefined;
}
