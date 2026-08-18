import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { MonoLink } from "@/components/domain/MonoLink";
import { RunStatusBadge } from "@/components/domain/RunStatusBadge";
import { useRuns } from "@/features/runs/hooks/useRuns";
import { useHostedRuntime } from "@/features/system/hooks/useHostedRuntime";
import { AlertTone, CatalogRunStatus } from "@cu/contracts";

export default function RunsPage() {
  const { data, error, isLoading, refetch, isFetching } = useRuns();
  const { hosted } = useHostedRuntime();

  if (isLoading) return <PageSkeleton />;
  if (error) {
    return (
      <div className="p-6 space-y-3">
        <Alert
          tone={AlertTone.Error}
          title="Failed to load runs"
          body={error instanceof Error ? error.message : String(error)}
        />
        <Button variant="secondary" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const items = data ?? [];

  return (
    <div className="p-6 max-w-screen-xl">
      <PageHeader
        title="Runs"
        subtitle="Evidence catalog from the API — discovery, replay, intervention, and failures."
        action={
          <Button variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
            Refresh
          </Button>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          title="No runs indexed"
          body={
            hosted
              ? "No evidence indexed yet."
              : "Start a discovery or replay run on the local API to index evidence here."
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="px-3 py-2">Run ID</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2">Capability</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr
                  key={`${r.kind}-${r.runId}`}
                  className="border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-3 py-2">
                    <MonoLink to={`/runs/${r.runId}`}>{r.runId}</MonoLink>
                  </td>
                  <td className="px-3 py-2 text-sm">{r.kind}</td>
                  <td className="px-3 py-2 text-sm text-slate-600">
                    {r.mode ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-sm">
                    {r.capabilityId ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <RunStatusBadge
                      status={r.status ?? (r.hasResult ? CatalogRunStatus.Recorded : CatalogRunStatus.Partial)}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">
                    {new Date(r.mtime).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
