import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { ControllerBadge } from "@/components/domain/ControllerBadge";
import { useIntervention } from "@/features/interventions/hooks/useIntervention";
import {
  abortIntervention,
  fetchInterventionObservation,
  interventionScreenshotUrl,
  postHumanAction,
  resumeIntervention,
  takeControl,
} from "@/services/api/interventions";
import { useParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import type { InterventionObservation } from "@cu/contracts";
import { AlertTone, Controller, SessionExecutionState } from "@cu/contracts";
import { useHostedRuntime } from "@/features/system/hooks/useHostedRuntime";

export default function InterventionDetailPage() {
  const params = useParams();
  const id = params.interventionId ?? "";
  const { data, error, isLoading, refetch } = useIntervention(id);
  const { hosted, executionAvailable, loading: healthLoading } = useHostedRuntime();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedRef, setSelectedRef] = useState<string>("");
  const [typeValue, setTypeValue] = useState("");
  const [navUrl, setNavUrl] = useState("");
  const [shotKey, setShotKey] = useState(0);
  const [observation, setObservation] = useState<InterventionObservation | null>(
    null,
  );

  const refreshObservation = useCallback(async () => {
    if (!id) return;
    try {
      const obs = await fetchInterventionObservation(id);
      setObservation(obs);
      setNavUrl((prev) => prev || obs.location);
      if (!selectedRef && obs.controls[0]) {
        setSelectedRef(obs.controls[0].ref);
      }
    } catch {
      setObservation(null);
    }
  }, [id, selectedRef]);

  useEffect(() => {
    if (data?.live && !hosted) {
      void refreshObservation();
    }
  }, [data?.live, data?.controller, hosted, refreshObservation]);

  async function run(op: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await op();
      await refetch();
      await refreshObservation();
      setShotKey((k) => k + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || healthLoading) return <PageSkeleton />;
  if (error || !data) {
    if (hosted) {
      return (
        <div className="p-6 space-y-3">
          <PageHeader title="Handoff evidence" subtitle={id} />
          <Alert
            tone={AlertTone.Info}
            title="Recorded handoff"
            body="This catalog lists persisted evidence for this session."
          />
        </div>
      );
    }
    return (
      <div className="p-6 space-y-3">
        <Alert
          tone={AlertTone.Error}
          title="Live intervention not available"
          body={
            error instanceof Error
              ? error.message
              : "Start an operator session so this API can attach the Playwright session."
          }
        />
      </div>
    );
  }

  const intervention = data.intervention as {
    reason?: string;
    stateSummary?: string;
    currentUrl?: string;
  };
  const human = data.controller === Controller.Human;
  const terminal =
    data.state === SessionExecutionState.Completed ||
    data.state === SessionExecutionState.Failed;
  const mutationsDisabled = (!executionAvailable && hosted) || busy || terminal || !data.live;

  return (
    <div className="p-6 max-w-screen-xl space-y-6">
      <PageHeader
        title={executionAvailable ? "Live intervention" : hosted ? "Handoff evidence" : "Live intervention"}
        subtitle={`${data.id} · run ${data.runId}`}
        action={<ControllerBadge controller={data.controller} />}
      />

      {executionAvailable ? (
        <Alert
          tone={AlertTone.Warning}
          title={intervention.reason ?? "Human control required"}
          body={
            (data as { liveViewUrl?: string }).liveViewUrl
              ? "The remote Browserbase session is paused. Use Live View, then resume automation on the same session."
              : intervention.stateSummary ??
                "Same browser session is attached. Take control, act, then resume automation."
          }
        />
      ) : hosted ? null : (
        <Alert
          tone={AlertTone.Warning}
          title={intervention.reason ?? "Human control required"}
          body={
            intervention.stateSummary ??
            "Same Playwright session is attached. Take control, act on observed controls, then resume automation."
          }
        />
      )}

      {actionError && (
        <Alert tone={AlertTone.Error} title="Action failed" body={actionError} />
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-white border border-slate-200 rounded-md p-4 space-y-3">
          <h2 className="text-sm font-semibold">
            {hosted ? "Session record" : "Session controls"}
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-mono text-slate-600">
            <dt>Controller</dt>
            <dd>{data.controller}</dd>
            <dt>State</dt>
            <dd>{data.state}</dd>
            <dt>URL</dt>
            <dd className="truncate">
              {observation?.location ?? intervention.currentUrl ?? "—"}
            </dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            {executionAvailable && (
              <>
            <Button
              disabled={mutationsDisabled || human}
              onClick={() => run(() => takeControl(id))}
            >
              Take control
            </Button>
            <Button
              disabled={mutationsDisabled || !human}
              variant="primary"
              onClick={() => run(() => resumeIntervention(id))}
            >
              Resume automation
            </Button>
            <Button
              disabled={mutationsDisabled}
              variant="danger"
              onClick={() => run(() => abortIntervention(id))}
            >
              Abort
            </Button>
              </>
            )}
            {!hosted && executionAvailable && (
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => {
                void refetch();
                void refreshObservation();
                setShotKey((k) => k + 1);
              }}
            >
              Refresh observation
            </Button>
            )}
          </div>

          {!hosted && executionAvailable && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h3 className="text-xs font-semibold text-slate-700">
              Observed controls
            </h3>
            {!observation ? (
              <p className="text-xs text-slate-500">No observation yet.</p>
            ) : (
              <ul className="max-h-48 overflow-auto border border-slate-200 rounded divide-y divide-slate-100">
                {observation.controls.map((c) => (
                  <li key={c.ref}>
                    <button
                      type="button"
                      className={`w-full text-left px-2 py-1.5 text-xs font-mono hover:bg-slate-50 ${
                        selectedRef === c.ref ? "bg-slate-100" : ""
                      }`}
                      onClick={() => setSelectedRef(c.ref)}
                      disabled={!human || mutationsDisabled}
                    >
                      <span className="text-slate-400">[{c.role ?? "?"}]</span>{" "}
                      {c.accessibleName ?? c.text ?? c.ref}
                      <span className="text-slate-400"> · {c.ref}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={mutationsDisabled || !human || !selectedRef}
                variant="secondary"
                onClick={() =>
                  run(() =>
                    postHumanAction(id, {
                      action: "click",
                      controlRef: selectedRef,
                    }),
                  )
                }
              >
                Click selected
              </Button>
            </div>
            <label className="block text-xs text-slate-500">
              Type into selected control
              <input
                className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                value={typeValue}
                onChange={(e) => setTypeValue(e.target.value)}
                disabled={!human || mutationsDisabled}
              />
            </label>
            <Button
              disabled={
                mutationsDisabled || !human || !selectedRef || !typeValue
              }
              variant="secondary"
              onClick={() =>
                run(() =>
                  postHumanAction(id, {
                    action: "type",
                    controlRef: selectedRef,
                    value: typeValue,
                  }),
                )
              }
            >
              Type
            </Button>
            <label className="block text-xs text-slate-500">
              Navigate (allowlisted domains only)
              <input
                className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm font-mono"
                value={navUrl}
                onChange={(e) => setNavUrl(e.target.value)}
                disabled={!human || mutationsDisabled}
              />
            </label>
            <Button
              disabled={mutationsDisabled || !human || !navUrl}
              variant="secondary"
              onClick={() =>
                run(() =>
                  postHumanAction(id, { action: "navigate", url: navUrl }),
                )
              }
            >
              Navigate
            </Button>
          </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-md p-4 space-y-3">
          <h2 className="text-sm font-semibold">
            {executionAvailable ? "Live session" : hosted ? "Session evidence" : "Live screenshot"}
          </h2>
          {(data as { liveViewUrl?: string }).liveViewUrl && (
            <div className="space-y-2">
              <a
                className="text-sm text-blue-600 hover:underline"
                href={(data as { liveViewUrl?: string }).liveViewUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Browserbase Live View
              </a>
              <iframe
                title="Browserbase Live View"
                src={(data as { liveViewUrl?: string }).liveViewUrl}
                className="w-full h-[480px] border border-slate-200 rounded"
              />
            </div>
          )}
          {executionAvailable && !(data as { liveViewUrl?: string }).liveViewUrl && (
          <img
            key={shotKey}
            src={interventionScreenshotUrl(id)}
            alt="Current intervention browser screenshot"
            className="w-full border border-slate-200 rounded"
          />
          )}
          {!executionAvailable && !hosted && (
          <img
            key={shotKey}
            src={interventionScreenshotUrl(id)}
            alt="Current intervention browser screenshot"
            className="w-full border border-slate-200 rounded"
          />
          )}
          <h2 className="text-sm font-semibold pt-2">Human action timeline</h2>
          <pre className="text-xs font-mono bg-slate-50 border border-slate-200 rounded p-2 overflow-auto max-h-48">
            {JSON.stringify(data.humanActions ?? [], null, 2)}
          </pre>
        </section>
      </div>
    </div>
  );
}
