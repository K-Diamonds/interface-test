import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, CodeBlock } from "@/components/ui/Alert";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { CapabilityStatusBadge } from "@/components/domain/CapabilityStatusBadge";
import {
  useCapabilityReliability,
  useCapabilityVersion,
} from "@/features/capabilities/hooks/useCapabilities";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTone, CapabilityStatusSchema } from "@cu/contracts";
import { Button } from "@/components/ui/Button";
import { useHostedRuntime } from "@/features/system/hooks/useHostedRuntime";
import { startReplay } from "@/services/api/replay";
import { useState } from "react";

function formatReliability(input: {
  status: string;
  executionReliability?: number;
}): string {
  if (input.status === "insufficient_data" || input.executionReliability === undefined) {
    return "insufficient data";
  }
  return `${Math.round(input.executionReliability * 100)}%`;
}

function publicInputs(inputs: unknown[]): unknown[] {
  return inputs.filter((item) => {
    if (!item || typeof item !== "object") return true;
    const rec = item as { name?: unknown; sensitive?: unknown };
    if (rec.sensitive === true) return false;
    const name = typeof rec.name === "string" ? rec.name : "";
    return !/password|passwd|pwd|secret|token|credential|^username$/i.test(name);
  });
}

export default function CapabilityDetailPage() {
  const params = useParams();
  const id = params.capabilityId ?? params.id ?? "";
  const version = params.version ?? "1";
  const ver = Number(version);
  const { data, error, isLoading } = useCapabilityVersion(id, ver);
  const reliability = useCapabilityReliability(id, ver);
  const { executionAvailable } = useHostedRuntime();
  const navigate = useNavigate();
  const [replayBusy, setReplayBusy] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);

  if (isLoading) return <PageSkeleton />;
  if (error || !data) {
    return (
      <div className="p-6">
        <Alert
          tone={AlertTone.Error}
          title="Capability not found"
          body={error instanceof Error ? error.message : ""}
        />
      </div>
    );
  }

  const cap = data.capability as Record<string, unknown> | undefined;
  const contract = data.contract as
    | { inputs?: unknown[]; outputs?: unknown[] }
    | undefined;
  const steps = (data.steps as unknown[]) ?? [];
  const statusParsed = CapabilityStatusSchema.safeParse(cap?.status);
  const capabilityStatus = statusParsed.success ? statusParsed.data : undefined;
  const rel = reliability.data;

  return (
    <div className="p-6 max-w-screen-xl space-y-6">
      <PageHeader
        title={String(cap?.name ?? id)}
        subtitle={`${id} · v${ver}`}
        action={
          <div className="flex items-center gap-2">
            <CapabilityStatusBadge status={capabilityStatus} />
            {executionAvailable && (
              <Button
                disabled={replayBusy}
                onClick={() => {
                  setReplayBusy(true);
                  setReplayError(null);
                  void startReplay({
                    capabilityId: id,
                    version: ver,
                    inputs: { productName: "Sauce Labs Backpack" },
                  })
                    .then((res) => navigate(`/runs/${res.runId}`))
                    .catch((err) =>
                      setReplayError(
                        err instanceof Error ? err.message : String(err),
                      ),
                    )
                    .finally(() => setReplayBusy(false));
                }}
              >
                {replayBusy ? "Starting…" : "Start replay"}
              </Button>
            )}
          </div>
        }
      />
      {replayError && (
        <Alert
          tone={AlertTone.Error}
          title="Replay rejected"
          body={replayError}
        />
      )}
      <Alert
        tone={AlertTone.Info}
        title="Proxy demo target"
        body="The architecture targets financial back-office systems. The demonstration intentionally uses a safe public proxy application rather than a real banking system."
      />
      <div className="text-sm text-slate-600">
        <Link to="/capabilities" className="text-blue-600 hover:underline">
          ← All capabilities
        </Link>
      </div>
      <section className="bg-white border border-slate-200 rounded-md p-4 space-y-2">
        <h2 className="text-sm font-semibold">Approval & replay evidence</h2>
        <p className="text-xs text-slate-500">
          Status is governance metadata. The execution definition for this
          id+version is immutable and is not rewritten on approval.
        </p>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase text-slate-500">Status</dt>
            <dd className="mt-0.5">
              <CapabilityStatusBadge status={capabilityStatus} />
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Replay evidence</dt>
            <dd className="mt-0.5 font-mono">
              {rel ? `${rel.sampleSize} deterministic runs` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Successful</dt>
            <dd className="mt-0.5 font-mono">{rel?.successfulRuns ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Business outcomes</dt>
            <dd className="mt-0.5 font-mono">{rel?.businessOutcomes ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Hard failures</dt>
            <dd className="mt-0.5 font-mono">{rel?.hardFailures ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Reliability</dt>
            <dd className="mt-0.5 font-mono">
              {rel ? formatReliability(rel) : "—"}
            </dd>
          </div>
        </dl>
        {rel && (
          <p className="text-xs text-slate-500">
            Execution reliability is successful deterministic runs / runs
            expected to complete (success + hard failure). Business outcomes
            are not infrastructure failures. Approval readiness (
            {rel.approvalReadiness}) is advisory and does not auto-approve.
          </p>
        )}
      </section>
      <section>
        <h2 className="text-sm font-semibold mb-2">Contract</h2>
        <CodeBlock>
          {JSON.stringify(
            { inputs: publicInputs(contract?.inputs ?? []), outputs: contract?.outputs ?? [] },
            null,
            2,
          )}
        </CodeBlock>
      </section>
      <section>
        <h2 className="text-sm font-semibold mb-2">Steps ({steps.length})</h2>
        <CodeBlock>{JSON.stringify(steps, null, 2)}</CodeBlock>
      </section>
    </div>
  );
}
