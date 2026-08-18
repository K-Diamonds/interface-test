import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { ControllerBadge } from "@/components/domain/ControllerBadge";
import { MonoLink } from "@/components/domain/MonoLink";
import { useInterventions } from "@/features/interventions/hooks/useIntervention";
import { Link } from "react-router-dom";
import { AlertTone } from "@cu/contracts";
import { useHostedRuntime } from "@/features/system/hooks/useHostedRuntime";

export default function InterventionsPage() {
  const { data, error, isLoading, refetch, isFetching } = useInterventions();
  const { hosted } = useHostedRuntime();

  if (isLoading) return <PageSkeleton />;
  if (error) {
    return (
      <div className="p-6 space-y-3">
        <Alert
          tone={AlertTone.Error}
          title="Failed to load interventions"
          body={error instanceof Error ? error.message : String(error)}
        />
        <Button variant="secondary" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const live = data?.live ?? [];
  const persisted = data?.persisted ?? [];

  return (
    <div className="p-6 max-w-screen-xl space-y-6">
      <PageHeader
        title={hosted ? "Handoffs" : "Interventions"}
        subtitle={
          hosted
            ? "Persisted same-session handoff evidence."
            : "Live sessions registered with the control-plane API, plus persisted handoff evidence."
        }
        action={
          <Button
            variant="secondary"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            Refresh
          </Button>
        }
      />

      {!hosted && (
      <section>
        <h2 className="text-sm font-semibold mb-2">Live</h2>
        {live.length === 0 ? (
          <EmptyState
            title="No live interventions"
            body="Run `pnpm operator --target https://www.saucedemo.com` (or discovery with operator enabled). This UI talks to the same loopback API and preserves the attached Playwright session."
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-md divide-y">
            {live.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <Link
                    to={`/interventions/${encodeURIComponent(item.id)}`}
                    className="font-mono text-sm text-blue-600 hover:underline"
                  >
                    {item.id}
                  </Link>
                  <div className="text-xs text-slate-500 mt-0.5">
                    run {item.runId} · {item.state}
                  </div>
                </div>
                <ControllerBadge controller={item.controller} />
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      <section>
        <h2 className="text-sm font-semibold mb-2">Persisted evidence</h2>
        {persisted.length === 0 ? (
          <EmptyState
            title="No persisted interventions"
            body="Handoff evidence appears under evidence/intervention/ after a completed demo."
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-md divide-y">
            {persisted.map((item) => (
              <div key={`${item.runId}-${item.id}`} className="px-4 py-3">
                <MonoLink to={`/runs/${item.runId}`}>{item.runId}</MonoLink>
                <div className="text-xs text-slate-500 mt-0.5">
                  read-only evidence · not live
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
