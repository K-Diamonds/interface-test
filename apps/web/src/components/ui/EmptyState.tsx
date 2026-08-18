import type { ReactNode } from "react";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-md px-6 py-10 text-center">
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      <div className="text-sm text-slate-500 mt-1 max-w-md mx-auto">{body}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
