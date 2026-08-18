function randomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID().replace(/-/g, "").slice(0, 12);
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

export function createId(prefix: string): string {
  return `${prefix}_${randomId()}`;
}

export function createRunId(): string {
  return createId("run");
}

export function createInterventionId(): string {
  return createId("int");
}

export function createStepId(index: number): string {
  return `step-${index + 1}`;
}
