import { Badge } from "@/components/ui/Badge";
import {
  CatalogRunStatus,
  DiscoveryRunStatus,
  EvidenceKind,
  ExecutionResultStatus,
  HealthStatus,
  JobStatus,
  UiTone,
  type RunStatus,
} from "@cu/contracts";

type BadgeStatus = RunStatus | EvidenceKind;

function toneForStatus(status?: BadgeStatus): UiTone {
  switch (status) {
    case ExecutionResultStatus.Success:
    case JobStatus.Completed:
    case DiscoveryRunStatus.Completed:
    case HealthStatus.Ok:
    case CatalogRunStatus.Recorded:
      return UiTone.Green;
    case ExecutionResultStatus.Failure:
    case JobStatus.Failed:
    case DiscoveryRunStatus.Failed:
    case HealthStatus.Error:
      return UiTone.Red;
    case ExecutionResultStatus.BusinessOutcome:
    case ExecutionResultStatus.InterventionRequired:
    case JobStatus.AwaitingHuman:
    case DiscoveryRunStatus.InterventionRequired:
    case CatalogRunStatus.Partial:
      return UiTone.Amber;
    case JobStatus.Running:
    case JobStatus.Queued:
      return UiTone.Blue;
    case EvidenceKind.Discovery:
      return UiTone.Violet;
    default:
      return UiTone.Slate;
  }
}

export function RunStatusBadge({ status }: { status?: BadgeStatus }) {
  return <Badge tone={toneForStatus(status)}>{status ?? "unknown"}</Badge>;
}
