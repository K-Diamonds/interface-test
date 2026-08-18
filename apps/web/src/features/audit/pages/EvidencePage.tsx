import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { MonoLink } from "@/components/domain/MonoLink";
import { RunStatusBadge } from "@/components/domain/RunStatusBadge";
import { useRuns } from "@/features/runs/hooks/useRuns";
import { AlertTone } from "@cu/contracts";

export default function EvidencePage() {
  const { data, error, isLoading } = useRuns();
  if (isLoading) return <PageSkeleton />;
  if (error) {
    return (
      <div className="p-6">
        <Alert
          tone={AlertTone.Error}
          title="Failed to load evidence"
          body={error instanceof Error ? error.message : String(error)}
        />
      </div>
    );
  }
  const items = data ?? [];
  return (
    <div className="p-6 max-w-screen-xl">
      <PageHeader
        title="Evidence"
        subtitle="Filesystem catalog of discovery, replay, intervention, and failure artifacts."
      />
      {items.length === 0 ? (
        <EmptyState title="Empty evidence store" body="Generate runs via discovery or replay." />
      ) : (
        <div className="bg-white border border-slate-200 rounded-md divide-y">
          {items.map((r) => (
            <div
              key={`${r.kind}-${r.runId}`}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <MonoLink to={`/runs/${r.runId}`}>{r.runId}</MonoLink>
                <div className="text-xs text-slate-500">{r.path}</div>
              </div>
              <RunStatusBadge status={r.kind} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
