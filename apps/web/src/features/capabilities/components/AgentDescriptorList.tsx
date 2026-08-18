import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import type { AgentCapabilityDescriptor } from "@cu/contracts";
import { CapabilityStatusBadge } from "@/components/domain/CapabilityStatusBadge";
import { Button } from "@/components/ui/Button";
import { CodeBlock } from "@/components/ui/Alert";
import { useHostedRuntime } from "@/features/system/hooks/useHostedRuntime";
import { invokeAgentCapability } from "@/services/api/agent";
import { ApiError } from "@/services/api/client";

export function AgentDescriptorCard({
  item,
  defaultOpen = false,
}: {
  item: AgentCapabilityDescriptor;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { executionAvailable } = useHostedRuntime();
  const navigate = useNavigate();
  const invocable = executionAvailable && item.invocable;

  return (
    <section className="bg-white border border-slate-200 rounded-md p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{item.name}</h2>
          <p className="font-mono text-xs text-slate-500 mt-0.5">
            {item.id}@v{item.version}
          </p>
        </div>
        <CapabilityStatusBadge status={item.status} />
      </div>
      <p className="text-sm text-slate-600">{item.description}</p>
      {invocable ? (
        <p className="text-xs font-medium text-green-700">Invocable</p>
      ) : (
        <p className="text-xs text-slate-500">Catalog only</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide contract" : "Show contract"}
        </Button>
        {invocable && (
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void invokeAgentCapability(item.id, item.version, {
                productName: "Sauce Labs Backpack",
              })
                .then((result) => {
                  if (result.runId) {
                    void navigate(`/runs/${result.runId}`);
                  }
                })
                .catch((err) => {
                  setError(
                    err instanceof ApiError ? err.message : String(err),
                  );
                })
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Invoking…" : "Invoke"}
          </Button>
        )}
        <Link
          to={`/capabilities/${encodeURIComponent(item.id)}/versions/${item.version}`}
          className="inline-flex items-center text-sm text-blue-600 hover:underline"
        >
          Artifact
        </Link>
      </div>
      {open && (
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <h3 className="text-xs font-semibold uppercase text-slate-500 mb-1">
              Inputs
            </h3>
            <CodeBlock>{JSON.stringify(item.inputs, null, 2)}</CodeBlock>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase text-slate-500 mb-1">
              Outputs
            </h3>
            <CodeBlock>{JSON.stringify(item.outputs, null, 2)}</CodeBlock>
          </div>
        </div>
      )}
    </section>
  );
}
