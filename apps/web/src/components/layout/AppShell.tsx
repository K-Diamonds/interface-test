import type { ReactNode } from "react";

export function AppShell({
  sidebar,
  header,
  banner,
  children,
}: {
  sidebar: ReactNode;
  header: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      {sidebar}
      <div className="flex flex-col flex-1 min-w-0">
        {header}
        {banner}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
