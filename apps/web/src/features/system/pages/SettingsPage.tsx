import { PageHeader } from "@/components/layout/PageHeader";
import { useHostedRuntime } from "@/features/system/hooks/useHostedRuntime";

export default function SettingsPage() {
  const { hosted } = useHostedRuntime();

  const rows = hosted
    ? [
        { label: "API", value: "catalog" },
        { label: "Auth", value: "none" },
      ]
    : [
        { label: "API bind", value: "127.0.0.1:8787" },
        { label: "Browser runtime", value: "local Playwright" },
        { label: "Auth", value: "none (local demo only)" },
        { label: "Target app", value: "Public SauceDemo proxy" },
        { label: "Client proxy", value: "/api → control plane" },
      ];

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <PageHeader
        title="Settings"
        subtitle="Read-only control-plane configuration."
      />
      <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <span className="text-sm text-slate-700">{row.label}</span>
            <span className="text-sm font-mono text-slate-600 text-right">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
