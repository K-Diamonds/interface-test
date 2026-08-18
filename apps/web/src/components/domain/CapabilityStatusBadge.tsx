import { Badge } from "../ui/Badge";
import { CapabilityStatus, UiTone } from "@cu/contracts";

export function CapabilityStatusBadge({
  status,
}: {
  status?: CapabilityStatus;
}) {
  const tone =
    status === CapabilityStatus.Approved
      ? UiTone.Green
      : status === CapabilityStatus.Draft ||
          status === CapabilityStatus.Deprecated
        ? UiTone.Slate
        : UiTone.Amber;
  return <Badge tone={tone}>{status ?? "unknown"}</Badge>;
}
