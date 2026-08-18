import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, CodeBlock } from "@/components/ui/Alert";
import { usePolicies } from "@/features/policies/hooks/usePolicies";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { AlertTone } from "@cu/contracts";

export default function PoliciesPage() {
  const { data, error, isLoading } = usePolicies();

  if (isLoading) return <PageSkeleton />;

  const items = (data ?? []) as Array<Record<string, unknown>>;

  return (
    <div className="p-6 max-w-screen-xl space-y-4">
      <PageHeader
        title="Policies"
        subtitle="Declared on capability artifacts and enforced at the execution layer — not by the model."
      />
      <Alert
        tone={AlertTone.Info}
        title="Source of truth"
        body="Policy is read from compiled capabilities on disk (allowed domains, actions, riskyActionPolicy). Runtime also applies fail-closed effect classification."
      />
      {error ? (
        <Alert
          tone={AlertTone.Error}
          title="Failed to load policies"
          body={error instanceof Error ? error.message : String(error)}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No policies yet"
          body="Compile a capability to publish its execution policy."
        />
      ) : (
        <CodeBlock>{JSON.stringify(items, null, 2)}</CodeBlock>
      )}
    </div>
  );
}
