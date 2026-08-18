import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import OverviewPage from "@/features/overview/pages/OverviewPage";
import RunsPage from "@/features/runs/pages/RunsPage";
import RunDetailPage from "@/features/runs/pages/RunDetailPage";
import CapabilitiesPage from "@/features/capabilities/pages/CapabilitiesPage";
import CapabilityDetailPage from "@/features/capabilities/pages/CapabilityDetailPage";
import AgentCatalogPage from "@/features/capabilities/pages/AgentCatalogPage";
import DiscoveryPage from "@/features/discovery/pages/DiscoveryPage";
import DiscoveryRunPage from "@/features/discovery/pages/DiscoveryRunPage";
import InterventionsPage from "@/features/interventions/pages/InterventionsPage";
import InterventionDetailPage from "@/features/interventions/pages/InterventionDetailPage";
import PoliciesPage from "@/features/policies/pages/PoliciesPage";
import EvidencePage from "@/features/audit/pages/EvidencePage";
import SystemPage from "@/features/system/pages/SystemPage";
import SettingsPage from "@/features/system/pages/SettingsPage";
import { AppShell } from "@/components/layout/AppShell";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { useHostedRuntime } from "@/features/system/hooks/useHostedRuntime";
import { useInterventions } from "@/features/interventions/hooks/useIntervention";

function crumbsFor(
  pathname: string,
  hosted: boolean,
): Array<{ label: string; to?: string }> {
  const parts = pathname.split("/").filter(Boolean);
  const root = hosted ? "Catalog" : "Operations";
  const artifacts = hosted ? "Catalog" : "Automation";
  if (parts.length === 0) return [{ label: root }, { label: "Overview" }];
  const crumbs: Array<{ label: string; to?: string }> = [];
  if (parts[0] === "runs") {
    crumbs.push({ label: root, to: "/" }, { label: "Runs", to: "/runs" });
    if (parts[1]) crumbs.push({ label: parts[1] });
  } else if (parts[0] === "capabilities") {
    crumbs.push(
      { label: artifacts, to: "/capabilities" },
      { label: "Capabilities", to: "/capabilities" },
    );
    if (parts[1]) crumbs.push({ label: parts[1] });
    if (parts[2] === "versions" && parts[3]) crumbs.push({ label: `v${parts[3]}` });
  } else if (parts[0] === "agent") {
    crumbs.push(
      { label: artifacts, to: "/agent" },
      { label: "Agent catalog", to: "/agent" },
    );
  } else if (parts[0] === "discovery") {
    crumbs.push(
      { label: artifacts, to: "/discovery" },
      { label: hosted ? "Discovery evidence" : "Discovery", to: "/discovery" },
    );
    if (parts[1]) crumbs.push({ label: parts[1] });
  } else if (parts[0] === "interventions") {
    crumbs.push(
      { label: root, to: "/" },
      { label: hosted ? "Handoffs" : "Interventions", to: "/interventions" },
    );
    if (parts[1]) crumbs.push({ label: parts[1] });
  } else if (parts[0] === "policies") {
    crumbs.push({ label: "Governance" }, { label: "Policies" });
  } else if (parts[0] === "evidence") {
    crumbs.push({ label: "Governance" }, { label: "Evidence" });
  } else if (parts[0] === "system") {
    crumbs.push({ label: "System" }, { label: "Activity" });
  } else if (parts[0] === "settings") {
    crumbs.push({ label: "System" }, { label: "Settings" });
  }
  return crumbs;
}

export function AppRouter() {
  const location = useLocation();
  const { hosted, loading, health } = useHostedRuntime();
  const ints = useInterventions(hosted ? false : 5_000);

  useEffect(() => {
    document.title = "Computer Use";
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-sm text-slate-500">
        Loading catalog…
      </div>
    );
  }

  return (
    <AppShell
      sidebar={
        <Sidebar liveCount={ints.data?.live.length ?? 0} hosted={hosted} />
      }
      header={
        <Header
          crumbs={crumbsFor(location.pathname, hosted)}
          healthOk={!health.error}
          hosted={hosted}
        />
      }
    >
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/runs" element={<RunsPage />} />
        <Route path="/runs/:runId" element={<RunDetailPage />} />
        <Route path="/capabilities" element={<CapabilitiesPage />} />
        <Route path="/agent" element={<AgentCatalogPage />} />
        <Route
          path="/capabilities/:capabilityId/versions/:version"
          element={<CapabilityDetailPage />}
        />
        <Route path="/discovery" element={<DiscoveryPage />} />
        <Route path="/discovery/:runId" element={<DiscoveryRunPage />} />
        <Route path="/interventions" element={<InterventionsPage />} />
        <Route
          path="/interventions/:interventionId"
          element={<InterventionDetailPage />}
        />
        <Route path="/policies" element={<PoliciesPage />} />
        <Route path="/evidence" element={<EvidencePage />} />
        <Route path="/system" element={<SystemPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
