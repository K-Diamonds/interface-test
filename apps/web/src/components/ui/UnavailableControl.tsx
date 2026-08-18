import type { ReactNode } from "react";

const HOSTED_UNAVAILABLE =
  "Unavailable in hosted mode — local execution runtime required";

export function UnavailableControl({
  title = HOSTED_UNAVAILABLE,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <span title={title} className="inline-flex">
      {children}
    </span>
  );
}
