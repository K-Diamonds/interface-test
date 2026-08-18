import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useHealth } from "@/features/system/hooks/useHealth";
import { useCapabilities } from "@/features/capabilities/hooks/useCapabilities";
import { useRuns } from "@/features/runs/hooks/useRuns";
import { AlertTone } from "@cu/contracts";
import { useHostedRuntime } from "@/features/system/hooks/useHostedRuntime";

export default function SystemPage() {
  const health = useHealth();
  const caps = useCapabilities();
  const runs = useRuns();
  const { hosted, catalogOnly, execution } = useHostedRuntime();

  if (health.isLoading) return <PageSkeleton />;

  const components = health.data?.components;
  const rows = [
    {
      name: "Control Plane API",
      status: health.error ? "Down" : "Operational",
      detail: health.error
        ? health.error instanceof Error
          ? health.error.message
          : String(health.error)
        : hosted
          ? catalogOnly
            ? "catalog"
            : `bind ${health.data?.bind ?? "hosted"}`
          : `bind ${health.data?.bind ?? "127.0.0.1"}`,
    },
    {
      name: "Capability Catalog",
      status: health.error
        ? "Down"
        : components?.capabilityStore === "operational"
          ? "Operational"
          : (components?.capabilityStore ?? "unknown"),
      detail: caps.error
        ? String(caps.error)
        : `${caps.data?.length ?? 0} capabilities`,
    },
    {
      name: "Evidence Store",
      status: health.error
        ? "Down"
        : components?.evidenceStore === "operational"
          ? "Operational"
          : (components?.evidenceStore ?? "unknown"),
      detail: runs.error ? String(runs.error) : `${runs.data?.length ?? 0} runs indexed`,
    },
    {
      name: "Browser Runtime",
      status:
        execution?.browserRuntime === "unavailable"
          ? "Unavailable"
          : "Operational",
      detail:
        execution?.browserRuntime === "unavailable"
          ? execution.browserRuntimeReason ??
            "Browser runtime is not healthy"
          : health.data?.components.browserProvider === "browserbase"
            ? "Browserbase remote session"
            : "Playwright owned by API process only",
    },
    {
      name: "LLM Discovery Runtime",
      status: execution?.discovery ? "Operational" : "Unavailable",
      detail: execution?.discovery
        ? "Live discovery available"
        : "Not available",
    },
    {
      name: "Human Session Control",
      status: execution?.humanControl ? "Operational" : "Unavailable",
      detail: execution?.humanControl
        ? "Same-session takeover"
        : "Not available",
    },
  ];

  return (
    <div className="p-6 max-w-screen-xl space-y-4">
      <PageHeader title="Activity" subtitle="Catalog and evidence health." />
      {health.error && (
        <Alert
          tone={AlertTone.Error}
          title="API unreachable"
          body="Start the local API on port 8787, then reload."
        />
      )}
      <div className="bg-white border border-slate-200 rounded-md divide-y">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-800">{r.name}</div>
              <div className="text-xs text-slate-500 font-mono">{r.detail}</div>
            </div>
            <span className="text-xs font-semibold font-mono text-slate-700">
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
