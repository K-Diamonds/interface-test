import type { ReactNode } from "react";
import { AlertTone } from "@cu/contracts";

export function Alert({
  title,
  body,
  tone = AlertTone.Info,
}: {
  title: string;
  body: string;
  tone?: AlertTone;
}) {
  const styles: Record<AlertTone, string> = {
    [AlertTone.Info]: "bg-blue-50 border-blue-200 text-blue-800",
    [AlertTone.Warning]: "bg-amber-50 border-amber-200 text-amber-900",
    [AlertTone.Error]: "bg-red-50 border-red-200 text-red-800",
  };
  return (
    <div className={`border rounded-md px-4 py-3 ${styles[tone]}`}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-sm opacity-90 mt-0.5">{body}</div>
    </div>
  );
}

export function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="font-mono text-xs bg-slate-950 text-slate-100 rounded-md p-3 overflow-auto">
      {children}
    </pre>
  );
}
