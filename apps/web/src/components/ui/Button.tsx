import type { ButtonHTMLAttributes, ReactNode } from "react";

const variants = {
  primary: "bg-blue-600 text-white border-blue-600 hover:bg-blue-700",
  secondary: "bg-white text-slate-700 border-slate-300 hover:bg-slate-50",
  danger: "bg-red-600 text-white border-red-600 hover:bg-red-700",
  ghost: "bg-transparent text-slate-600 border-transparent hover:bg-slate-100",
} as const;

type Variant = keyof typeof variants;

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded border cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
