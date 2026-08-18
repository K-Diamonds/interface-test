import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { CapabilityStatusBadge } from "@/components/domain/CapabilityStatusBadge";
import { useCapabilities } from "@/features/capabilities/hooks/useCapabilities";
import { Link } from "react-router-dom";
import { AlertTone } from "@cu/contracts";

export default function CapabilitiesPage() {
  const { data, error, isLoading, refetch } = useCapabilities();
  if (isLoading) return <PageSkeleton />;
  if (error) {
    return (
      <div className="p-6">
        <Alert
          tone={AlertTone.Error}
          title="Failed to load capabilities"
          body={error instanceof Error ? error.message : String(error)}
        />
      </div>
    );
  }
  const items = data ?? [];
  return (
    <div className="p-6 max-w-screen-xl">
      <PageHeader
        title="Capabilities"
        subtitle="Versioned artifacts compiled from discovery traces."
      />
      {items.length === 0 ? (
        <EmptyState
          title="No capability artifacts"
          body="Discovery compiles a versioned JSON artifact from a successful trace."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Latest</th>
                <th className="px-3 py-2">Versions</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">
                    <Link
                      to={`/capabilities/${encodeURIComponent(c.id)}/versions/${c.latestVersion}`}
                      className="font-mono text-sm text-blue-600 hover:underline"
                      onClick={() => void refetch()}
                    >
                      {c.id}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-sm">{c.name ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-sm">v{c.latestVersion}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">
                    {c.versions.map((v) => `v${v}`).join(", ")}
                  </td>
                  <td className="px-3 py-2">
                    <CapabilityStatusBadge status={c.status} />
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
