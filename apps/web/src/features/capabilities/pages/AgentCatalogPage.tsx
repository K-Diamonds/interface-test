import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { AgentDescriptorCard } from "@/features/capabilities/components/AgentDescriptorList";
import { useAgentCapabilities } from "@/features/capabilities/hooks/useCapabilities";
import { AlertTone } from "@cu/contracts";

export default function AgentCatalogPage() {
  const { data, error, isLoading } = useAgentCapabilities();

  if (isLoading) return <PageSkeleton />;
  if (error || !data) {
    return (
      <div className="p-6">
        <Alert
          tone={AlertTone.Error}
          title="Agent catalog unreachable"
          body={error instanceof Error ? error.message : "No descriptors returned"}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-screen-xl space-y-6">
      <PageHeader
        title="Agent catalog"
        subtitle="Typed capability contracts for agent callers."
      />
      {data.length === 0 ? (
        <EmptyState
          title="No agent descriptors"
          body="Compile a capability artifact, then refresh this catalog."
        />
      ) : (
        <div className="space-y-4">
          {data.map((item) => (
            <AgentDescriptorCard
              key={`${item.id}@${item.version}`}
              item={item}
            />
          ))}
        </div>
      )}
    </div>
  );
}
