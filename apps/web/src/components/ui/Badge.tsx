import type { ReactNode } from "react";
import { UiTone } from "@cu/contracts";

export function Badge({
  children,
  tone = UiTone.Slate,
}: {
  children: ReactNode;
  tone?: UiTone;
}) {
  const styles: Record<UiTone, string> = {
    [UiTone.Slate]: "bg-slate-100 text-slate-600 border-slate-200",
    [UiTone.Blue]: "bg-blue-50 text-blue-700 border-blue-200",
    [UiTone.Green]: "bg-green-50 text-green-700 border-green-200",
    [UiTone.Amber]: "bg-amber-50 text-amber-700 border-amber-200",
    [UiTone.Red]: "bg-red-50 text-red-700 border-red-200",
    [UiTone.Violet]: "bg-violet-50 text-violet-700 border-violet-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium border rounded ${styles[tone]}`}
    >
      {children}
    </span>
  );
}
