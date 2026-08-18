import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { CapabilityStatusBadge } from "@/components/domain/CapabilityStatusBadge";
import { MonoLink } from "@/components/domain/MonoLink";
import { RunStatusBadge } from "@/components/domain/RunStatusBadge";
import { useCapabilities } from "@/features/capabilities/hooks/useCapabilities";
import { useInterventions } from "@/features/interventions/hooks/useIntervention";
import { useRuns } from "@/features/runs/hooks/useRuns";
import { Link } from "react-router-dom";
import { AlertTone, CatalogRunStatus } from "@cu/contracts";
import { useHostedRuntime } from "@/features/system/hooks/useHostedRuntime";

export default function OverviewPage() {
  const caps = useCapabilities();
  const runs = useRuns();
  const ints = useInterventions();
  const { hosted } = useHostedRuntime();

  if (caps.isLoading || runs.isLoading || ints.isLoading) return <PageSkeleton />;

  const error = caps.error || runs.error || ints.error;
  if (error) {
    return (
      <div className="p-6 max-w-screen-xl">
        <Alert
          tone={AlertTone.Error}
          title={hosted ? "Catalog unreachable" : "Control plane unreachable"}
          body={`${error instanceof Error ? error.message : String(error)}. Start the local API with pnpm --filter api dev (port 8787).`}
        />
      </div>
    );
  }

  const runItems = runs.data ?? [];
  const capItems = caps.data ?? [];
  const live = ints.data?.live ?? [];
  const success = runItems.filter((r) =>
    /success|completed/i.test(r.status ?? ""),
  ).length;
  const failed = runItems.filter((r) =>
    /fail/i.test(r.status ?? ""),
  ).length;
  const successRate =
    runItems.length === 0
      ? null
      : Math.round((success / runItems.length) * 1000) / 10;

  return (
    <div className="p-6 max-w-screen-xl space-y-6">
      <PageHeader
        title="Overview"
        subtitle={
          hosted
            ? "Capabilities and recorded evidence."
            : "Capabilities on disk and evidence runs from the local execution runtime."
        }
      />

      {runItems.length === 0 ? (
        <EmptyState
          title="No runs yet."
          body={
            hosted
              ? "No evidence indexed yet."
              : "Start a discovery run to generate your first capability."
          }
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(hosted
            ? [
                { label: "Capabilities", value: capItems.length, sub: "on disk" },
                { label: "Evidence runs", value: runItems.length, sub: "indexed" },
                {
                  label: "Recorded results",
                  value: successRate === null ? "—" : `${successRate}%`,
                  sub: "by result status",
                },
                {
                  label: "Approved",
                  value: capItems.filter((c) => c.status === "approved").length,
                  sub: "capabilities",
                },
              ]
            : [
                { label: "Capabilities", value: capItems.length, sub: "on disk" },
                { label: "Evidence runs", value: runItems.length, sub: "indexed" },
                {
                  label: "Success rate",
                  value: successRate === null ? "—" : `${successRate}%`,
                  sub: "by result status",
                },
                { label: "Live interventions", value: live.length, sub: "attached" },
              ]
          ).map((m) => (
            <div
              key={m.label}
              className="bg-white border border-slate-200 rounded-md px-4 py-3"
            >
              <div className="text-xs text-slate-500 font-medium">{m.label}</div>
              <div className="text-2xl font-semibold text-slate-900 mt-1">
                {m.value}
              </div>
              <div className="text-xs text-slate-400">{m.sub}</div>
            </div>
          ))}
        </div>
      )}

      {failed > 0 && (
        <Alert
          tone={AlertTone.Warning}
          title={`${failed} run(s) reported failure`}
          body="Open Runs to inspect structured failure evidence."
        />
      )}

      <section>
        <h2 className="text-sm font-semibold text-slate-800 mb-2">
          Recent runs
        </h2>
        {runItems.length === 0 ? null : (
          <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="px-3 py-2">Run</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Capability</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {runItems.slice(0, 8).map((r) => (
                  <tr key={`${r.kind}-${r.runId}`} className="border-b border-slate-100">
                    <td className="px-3 py-2">
                      <MonoLink to={`/runs/${r.runId}`}>
                        {r.runId}
                      </MonoLink>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-600">{r.kind}</td>
                    <td className="px-3 py-2 font-mono text-sm text-slate-700">
                      {r.capabilityId ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <RunStatusBadge
                        status={r.status ?? (r.hasResult ? CatalogRunStatus.Recorded : CatalogRunStatus.Partial)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-800 mb-2">
          Capabilities
        </h2>
        {capItems.length === 0 ? (
          <EmptyState
            title="No capabilities on disk"
            body={
              hosted
                ? "No capability artifacts are indexed in this catalog yet."
                : "Discover a workflow to compile the first artifact under /capabilities."
            }
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">
            {capItems.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <Link
                    to={`/capabilities/${encodeURIComponent(c.id)}/versions/${c.latestVersion}`}
                    className="font-mono text-sm text-blue-600 hover:underline"
                  >
                    {c.id}:v{c.latestVersion}
                  </Link>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {c.name ?? c.description ?? "—"}
                  </div>
                </div>
                <CapabilityStatusBadge status={c.status} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
