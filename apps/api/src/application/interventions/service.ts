/**
 * Application services for live human intervention.
 * HTTP routes validate and delegate here — they do not drive the browser.
 */
import {
  Controller,
  HumanActionRequestSchema,
  LocatorKind,
  OperatorAction,
  type HumanActionRequest,
  type EvidenceKind,
} from "@cu/contracts";
import { checkNavigation } from "../../core/policy/guardrails.js";
import { resolveAutomationPolicy } from "../../core/policy/policy.js";
import { resolveApplicationProfile } from "../../profiles/registry.js";
import {
  interventionRegistry,
  type LiveSessionRegistration,
} from "../../core/intervention/registry.js";
import {
  getRunDetail,
  listRuns,
} from "../../infrastructure/persistence/catalog.js";
import { HttpError } from "../../core/errors.js";

export function requireLiveIntervention(id: string): LiveSessionRegistration {
  const entry = interventionRegistry.get(id);
  if (!entry) {
    throw new HttpError(404, "NOT_FOUND", "Live intervention not found", {
      hint: "Persisted interventions are read-only; start an operator session to attach a live Playwright session.",
    });
  }
  return entry;
}

export async function listInterventions(rootDir: string) {
  const live = interventionRegistry.list().map((e) => ({
    id: e.interventionId,
    runId: e.runId,
    live: true as const,
    state: e.session.getState(),
    controller: e.session.getController(),
    intervention: e.session.getIntervention() ?? e.intervention,
    humanActions: e.session.getHumanActions(),
    registeredAt: e.registeredAt,
  }));

  const runs = await listRuns(rootDir);
  const persisted = [];
  for (const run of runs.filter((r) => r.hasIntervention)) {
    if (live.some((l) => l.runId === run.runId)) continue;
    const detail = await getRunDetail(run.kind, run.runId, rootDir);
    if (!detail?.intervention) continue;
    persisted.push({
      id: (detail.intervention as { id?: string }).id ?? run.runId,
      runId: run.runId,
      live: false as const,
      kind: run.kind as EvidenceKind,
      intervention: detail.intervention,
      humanActions: detail.humanActions ?? [],
    });
  }
  return { live, persisted };
}

export function getLiveIntervention(id: string) {
  const entry = requireLiveIntervention(id);
  return {
    id: entry.interventionId,
    runId: entry.runId,
    live: true as const,
    state: entry.session.getState(),
    controller: entry.session.getController(),
    intervention: entry.session.getIntervention() ?? entry.intervention,
    humanActions: entry.session.getHumanActions(),
  };
}

export async function observeIntervention(id: string) {
  const entry = requireLiveIntervention(id);
  const obs = await entry.session.getSurface().observe();
  return {
    location: obs.location,
    title: obs.title,
    fingerprint: obs.fingerprint,
    dialogs: obs.dialogs.map((d) => ({
      kind: d.kind,
      title: d.title,
      text: d.text,
    })),
    controls: obs.controls.map((c) => ({
      ref: c.ref,
      role: c.role,
      accessibleName: c.accessibleName,
      text: c.text,
      disabled: c.disabled,
    })),
  };
}

export async function screenshotIntervention(id: string): Promise<Buffer> {
  const entry = requireLiveIntervention(id);
  return entry.session.getSurface().screenshot();
}

export async function interventionLocation(
  id: string,
): Promise<{ url: string }> {
  const entry = requireLiveIntervention(id);
  return { url: await entry.session.getSurface().getCurrentLocation() };
}

export function takeControl(id: string) {
  const entry = requireLiveIntervention(id);
  const current = entry.session.getController();
  if (current !== Controller.Human) {
    throw new HttpError(
      409,
      "CONTROLLER_CONFLICT",
      `Cannot take control: controller is "${current}"`,
      { state: entry.session.getState() },
    );
  }
  return {
    ok: true as const,
    controller: entry.session.getController(),
    state: entry.session.getState(),
  };
}

export async function executeHumanAction(id: string, rawBody: unknown) {
  const entry = requireLiveIntervention(id);
  const parsed = HumanActionRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid human action", {
      issues: parsed.error.issues,
    });
  }
  entry.session.assertController(Controller.Human);
  const body = parsed.data;

  if (body.action === OperatorAction.Navigate) {
    await executeNavigate(entry, body);
  } else if (
    body.action === OperatorAction.Click ||
    body.action === OperatorAction.Type
  ) {
    await executeControlRefAction(entry, body);
  } else if (body.action === OperatorAction.Wait) {
    await new Promise((r) => setTimeout(r, body.waitMs));
    entry.session.recordHumanAction({ action: OperatorAction.Wait });
  }

  return { ok: true as const, humanActions: entry.session.getHumanActions() };
}

async function executeNavigate(
  entry: LiveSessionRegistration,
  body: Extract<
    HumanActionRequest,
    { action: typeof OperatorAction.Navigate }
  >,
) {
  const humanPolicy =
    entry.operatorPolicy ??
    resolveAutomationPolicy({
      targetUrl: body.url,
      profile: resolveApplicationProfile(body.url),
    });
  const nav = checkNavigation(body.url, humanPolicy);
  if (nav.decision !== "allow") {
    throw new HttpError(
      403,
      "POLICY_VIOLATION",
      "reason" in nav ? nav.reason : "Navigation blocked",
      { policy: "operator" },
    );
  }
  await entry.session.getSurface().navigate(body.url);
  entry.session.recordHumanAction({
    action: OperatorAction.Navigate,
    target: body.url,
  });
}

async function executeControlRefAction(
  entry: LiveSessionRegistration,
  body: Extract<
    HumanActionRequest,
    { action: typeof OperatorAction.Click | typeof OperatorAction.Type }
  >,
) {
  const surface = entry.session.getSurface();
  const obs = await surface.observe();
  const control = obs.controls.find((c) => c.ref === body.controlRef);
  if (!control) {
    throw new HttpError(
      409,
      "STALE_OBSERVATION",
      `Control ref ${body.controlRef} is not in the current observation`,
      { fingerprint: obs.fingerprint },
    );
  }
  const primary =
    control.candidateLocators[0]?.strategy ?? {
      kind: LocatorKind.Text,
      text: control.accessibleName ?? control.text ?? control.ref,
    };
  const target = {
    description: control.accessibleName ?? control.text ?? control.ref,
    primary,
    fallbacks: control.candidateLocators
      .slice(1)
      .map((c) => c.strategy)
      .slice(0, 4),
  };
  if (body.action === OperatorAction.Click) {
    await surface.click(target);
    entry.session.recordHumanAction({
      action: OperatorAction.Click,
      target: target.description,
      controlRef: body.controlRef,
    });
    return;
  }
  const sensitive =
    Boolean(body.sensitive) ||
    control.inputType === "password" ||
    /password|secret/i.test(control.accessibleName ?? "");
  await surface.type(target, body.value);
  entry.session.recordHumanAction({
    action: OperatorAction.Type,
    target: target.description,
    controlRef: body.controlRef,
    value: sensitive ? "[REDACTED]" : body.value,
  });
}

export function resumeIntervention(id: string) {
  const entry = requireLiveIntervention(id);
  entry.session.resume();
  return {
    ok: true as const,
    state: entry.session.getState(),
    controller: entry.session.getController(),
  };
}

export function abortIntervention(id: string) {
  const entry = requireLiveIntervention(id);
  entry.session.abort("Aborted by operator via control plane");
  interventionRegistry.unregister(entry.interventionId);
  return { ok: true as const, state: entry.session.getState() };
}
