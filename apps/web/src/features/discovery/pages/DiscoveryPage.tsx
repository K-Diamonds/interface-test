import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTone, CatalogRunStatus, DiscoveryRequestSchema, EvidenceKind, type DiscoveryRequest } from "@cu/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { MonoLink } from "@/components/domain/MonoLink";
import { RunStatusBadge } from "@/components/domain/RunStatusBadge";
import { useRuns } from "@/features/runs/hooks/useRuns";
import { startDiscovery } from "@/services/api/discovery";
import { queryKeys } from "@/services/api/query-keys";
import { ApiError } from "@/services/api/client";
import { useHostedRuntime } from "@/features/system/hooks/useHostedRuntime";
import { hostedCopy } from "@/features/system/hosted-copy";

type FormValues = DiscoveryRequest;

export default function DiscoveryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const discoveries = useRuns(EvidenceKind.Discovery);
  const offline = useRuns(EvidenceKind.OfflineDemo);
  const { executionAvailable, loading: healthLoading } = useHostedRuntime();

  const [scripted, setScripted] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(DiscoveryRequestSchema as never) as Resolver<FormValues>,
    defaultValues: {
      goal: "Add Sauce Labs Backpack to the cart and reach the cart page",
      target: "https://www.saucedemo.com",
      parameters: { productName: "Sauce Labs Backpack" },
      maxSteps: 25,
      timeoutSeconds: 240,
      policy: { allowedDomains: ["www.saucedemo.com", "saucedemo.com"] },
      scripted: false,
      headless: true,
    },
  });

  const mutation = useMutation({
    mutationFn: startDiscovery,
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.runs() });
      void navigate(`/discovery/${res.runId}`);
    },
  });

  const items = [...(discoveries.data ?? []), ...(offline.data ?? [])];
  const loading = discoveries.isLoading || offline.isLoading;
  const error = discoveries.error || offline.error || mutation.error;

  return (
    <div className="p-6 max-w-screen-xl space-y-6">
      <PageHeader
        title={executionAvailable ? "Discovery" : "Discovery evidence"}
        subtitle={
          executionAvailable
            ? "Start a real discovery run through the API. Artifacts compile from the successful trace."
            : hostedCopy.recordedDiscovery
        }
      />

      {healthLoading ? (
        <PageSkeleton />
      ) : executionAvailable ? (
      <section className="bg-white border border-slate-200 rounded-md p-4 space-y-3 max-w-2xl">
        <h2 className="text-sm font-semibold">Start discovery</h2>
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit((values) => {
            mutation.mutate(values);
          })}
        >
          <label className="block text-xs text-slate-500">
            Goal
            <textarea
              className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
              rows={3}
              {...form.register("goal")}
            />
          </label>
          <label className="block text-xs text-slate-500">
            Target URL
            <input
              className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm font-mono"
              {...form.register("target")}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-slate-500">
              Timeout (seconds)
              <input
                type="number"
                className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm font-mono"
                {...form.register("timeoutSeconds", { valueAsNumber: true })}
              />
            </label>
            <label className="block text-xs text-slate-500">
              Max steps
              <input
                type="number"
                className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm font-mono"
                {...form.register("maxSteps", { valueAsNumber: true })}
              />
            </label>
          </div>
          <fieldset className="space-y-2 border border-slate-200 rounded-md p-3">
            <legend className="text-xs font-semibold text-slate-700 px-1">
              Mode
            </legend>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="discoveryMode"
                checked={!scripted}
                onChange={() => {
                  setScripted(false);
                  form.setValue("scripted", false);
                }}
              />
              LLM Discovery (default)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="discoveryMode"
                checked={scripted}
                onChange={() => {
                  setScripted(true);
                  form.setValue("scripted", true);
                }}
              />
              Offline Scripted Demo
            </label>
            <p className="text-xs text-slate-500">
              Offline scripted mode exercises the architecture without a model. It
              does not satisfy required LLM discovery evidence.
            </p>
          </fieldset>
          {form.formState.errors.target && (
            <Alert
              tone={AlertTone.Error}
              title="Invalid target"
              body={form.formState.errors.target.message ?? "Check URL"}
            />
          )}
          {mutation.error && (
            <Alert
              tone={AlertTone.Error}
              title="Discovery rejected"
              body={
                mutation.error instanceof ApiError
                  ? mutation.error.message
                  : String(mutation.error)
              }
            />
          )}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Starting…" : "Start discovery"}
          </Button>
        </form>
      </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold mb-2">Indexed runs</h2>
        {loading ? (
          <PageSkeleton />
        ) : error && !mutation.error ? (
          <Alert
            tone={AlertTone.Error}
            title="Load failed"
            body={error instanceof Error ? error.message : String(error)}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="No discovery runs yet"
            body={
              executionAvailable
                ? "Start a discovery run above to generate the first capability."
                : "No discovery evidence is indexed in this catalog yet."
            }
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">
            {items.map((r) => (
              <div
                key={`${r.kind}-${r.runId}`}
                className="flex items-center justify-between px-4 py-3"
              >
                <MonoLink to={`/runs/${r.runId}`}>{r.runId}</MonoLink>
                <RunStatusBadge status={r.status ?? CatalogRunStatus.Recorded} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
