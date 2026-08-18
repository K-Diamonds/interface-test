import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";

const localGroups = [
  {
    label: "OPERATIONS",
    items: [
      { to: "/", label: "Overview", end: true },
      { to: "/runs", label: "Runs" },
      { to: "/interventions", label: "Interventions" },
    ],
  },
  {
    label: "AUTOMATION",
    items: [
      { to: "/capabilities", label: "Capabilities" },
      { to: "/agent", label: "Agent catalog" },
      { to: "/discovery", label: "Discovery" },
    ],
  },
  {
    label: "GOVERNANCE",
    items: [
      { to: "/policies", label: "Policies" },
      { to: "/evidence", label: "Evidence" },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { to: "/system", label: "Activity" },
      { to: "/settings", label: "Settings" },
    ],
  },
];

const hostedGroups = [
  {
    label: "CATALOG",
    items: [
      { to: "/", label: "Overview", end: true },
      { to: "/runs", label: "Runs" },
      { to: "/capabilities", label: "Capabilities" },
      { to: "/agent", label: "Agent catalog" },
      { to: "/discovery", label: "Discovery evidence" },
      { to: "/interventions", label: "Handoffs" },
    ],
  },
  {
    label: "GOVERNANCE",
    items: [
      { to: "/policies", label: "Policies" },
      { to: "/evidence", label: "Evidence" },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { to: "/system", label: "Activity" },
      { to: "/settings", label: "Settings" },
    ],
  },
];

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[0.625rem] font-semibold uppercase tracking-widest text-slate-400 mb-1 px-2">
      {children}
    </div>
  );
}

export function Sidebar({
  liveCount = 0,
  hosted = false,
}: {
  liveCount?: number;
  hosted?: boolean;
}) {
  const groups = hosted ? hostedGroups : localGroups;
  return (
    <aside className="w-52 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
      <div className="px-4 py-4 border-b border-slate-200">
        <div className="text-[0.9375rem] font-bold text-slate-900 tracking-tight">
          Computer Use
        </div>
        <div className="text-[0.6875rem] text-slate-400 mt-0.5 font-medium tracking-wide">
          {hosted ? "Catalog" : "Local runtime"}
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {groups.map((group) => (
          <div key={group.label}>
            <SectionLabel>{group.label}</SectionLabel>
            <div className="space-y-0.5 mt-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={"end" in item ? item.end : false}
                  className={({ isActive }) =>
                    `w-full flex items-center justify-between px-2 py-1.5 text-sm rounded transition-colors ${
                      isActive
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`
                  }
                >
                  <span>{item.label}</span>
                  {!hosted && item.to === "/interventions" && liveCount > 0 && (
                    <span className="text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      {liveCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-slate-200">
        <div className="text-[0.625rem] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
          Environment
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              hosted ? "bg-amber-500" : "bg-green-500"
            }`}
          />
          <span className="text-xs font-mono font-medium text-slate-700">
            {hosted ? "Catalog" : "Development"}
          </span>
        </div>
      </div>
    </aside>
  );
}
