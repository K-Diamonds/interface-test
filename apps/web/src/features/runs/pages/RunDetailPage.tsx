import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, CodeBlock } from "@/components/ui/Alert";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { RunStatusBadge } from "@/components/domain/RunStatusBadge";
import { useRun } from "@/features/runs/hooks/useRuns";
import { evidenceFileUrl } from "@/services/api/runs";
import { useRunEventStream } from "@/features/runs/hooks/useRunEventStream";
import { useParams } from "react-router-dom";
import {
  AlertTone,
  CatalogRunStatus,
  EvidenceKind,
  RunStatusSchema,
  StreamConnectionState,
} from "@cu/contracts";
import { useHostedRuntime } from "@/features/system/hooks/useHostedRuntime";

export default function RunDetailPage() {
  const { runId = "" } = useParams();
  const { data, error, isLoading, refetch } = useRun(runId);
  const { hosted } = useHostedRuntime();
  const stream = useRunEventStream(
    !hosted &&
      data &&
      (data.kind === EvidenceKind.Discovery || data.kind === EvidenceKind.Replay)
      ? runId
      : undefined,
  );

  if (isLoading) return <PageSkeleton />;
  if (error || !data) {
    return (
      <div className="p-6 space-y-3">
        <Alert
          tone={AlertTone.Error}
          title="Run not found"
          body={error instanceof Error ? error.message : "Missing run detail"}
        />
        <Button variant="secondary" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const parsedStatus = RunStatusSchema.safeParse(data.result?.status);
  const status = parsedStatus.success
    ? parsedStatus.data
    : CatalogRunStatus.Recorded;
  const isReplay = data.kind === EvidenceKind.Replay;

  return (
    <div className="p-6 max-w-screen-xl space-y-6">
      <PageHeader
        title={data.runId}
        subtitle={hosted ? "Historical evidence" : `${data.kind} · ${data.path}`}
        action={<RunStatusBadge status={status} />}
      />

      {isReplay && (
        <Alert
          tone={AlertTone.Info}
          title="Deterministic Replay"
          body="0 LLM decisions. This run executes the capability artifact only."
        />
      )}

      {!hosted && stream.status !== StreamConnectionState.Connecting && (
        <div className="text-xs font-mono text-slate-500">
          live stream: {stream.status}
        </div>
      )}

      {data.files.some((f) => f.endsWith(".png")) && (
        <section>
          <h2 className="text-sm font-semibold mb-2">Screenshots</h2>
          <div className="flex flex-wrap gap-3">
            {data.files
              .filter((f) => f.endsWith(".png"))
              .map((f) => (
                <figure key={f} className="bg-white border border-slate-200 rounded-md p-2">
                  <img
                    src={evidenceFileUrl(data.runId, f)}
                    alt={f}
                    className="max-h-48 rounded"
                  />
                  <figcaption className="text-xs font-mono text-slate-500 mt-1">
                    {f}
                  </figcaption>
                </figure>
              ))}
          </div>
        </section>
      )}

      {data.result && (
        <section>
          <h2 className="text-sm font-semibold mb-2">Result</h2>
          <CodeBlock>{JSON.stringify(data.result, null, 2)}</CodeBlock>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold mb-2">
          Events ({data.events.length})
        </h2>
        <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100 max-h-96 overflow-auto">
          {data.events.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500">No events.jsonl</div>
          ) : (
            data.events.map((ev, i) => (
              <div key={i} className="px-3 py-2 font-mono text-xs">
                {JSON.stringify(ev)}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
