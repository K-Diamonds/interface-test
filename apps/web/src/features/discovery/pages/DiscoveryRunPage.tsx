import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useDiscoveryJob } from "@/features/discovery/hooks/useDiscoveryJob";
import { useRunEventStream } from "@/features/runs/hooks/useRunEventStream";
import { AlertTone } from "@cu/contracts";
import { useHostedRuntime } from "@/features/system/hooks/useHostedRuntime";

export default function DiscoveryRunPage() {
  const { runId = "" } = useParams();
  const { catalogOnly, loading } = useHostedRuntime();
  const job = useDiscoveryJob(catalogOnly || loading ? "" : runId);
  const stream = useRunEventStream(catalogOnly || loading ? undefined : runId);

  if (loading) return <PageSkeleton />;

  if (catalogOnly) {
    return (
      <div className="p-6 max-w-screen-xl space-y-4">
        <PageHeader
          title={`Discovery ${runId}`}
          subtitle="Historical evidence"
        />
        <Alert
          tone={AlertTone.Info}
          title="Unavailable in hosted mode"
          body="Live discovery is unavailable while the hosted browser runtime is unhealthy. Open the recorded run in the evidence catalog."
        />
        <Link to={`/runs/${encodeURIComponent(runId)}`} className="text-sm text-blue-600 hover:underline">
          View historical evidence →
        </Link>
      </div>
    );
  }

  if (job.isLoading) return <PageSkeleton />;
  if (job.error || !job.data) {
    return (
      <div className="p-6">
        <Alert
          tone={AlertTone.Error}
          title="Discovery run not found"
          body={job.error instanceof Error ? job.error.message : "Missing job"}
        />
      </div>
    );
  }

  const data = job.data;

  return (
    <div className="p-6 max-w-screen-xl space-y-6">
      <PageHeader
        title={`Discovery ${runId}`}
        subtitle="Live job status from the API (SSE + polling)."
      />
      <div className="flex gap-3 text-sm">
        <span className="font-mono bg-slate-100 px-2 py-1 rounded">
          status: {data.status}
        </span>
        <span className="font-mono bg-slate-100 px-2 py-1 rounded">
          stream: {stream.status}
        </span>
      </div>
      {data.error && (
        <Alert tone={AlertTone.Error} title="Discovery failed" body={data.error} />
      )}
      {data.result?.capabilityPath && (
        <Alert
          tone={AlertTone.Info}
          title="Capability compiled"
          body={data.result.capabilityPath}
        />
      )}
      <section>
        <h2 className="text-sm font-semibold mb-2">Timeline</h2>
        <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100 font-mono text-xs">
          {(stream.events.length ? stream.events : data.events ?? []).map((e, i) => (
            <div key={i} className="px-3 py-2">
              {JSON.stringify(e)}
            </div>
          ))}
        </div>
      </section>
      <Link to="/capabilities" className="text-sm text-blue-600 hover:underline">
        View capabilities →
      </Link>
    </div>
  );
}
