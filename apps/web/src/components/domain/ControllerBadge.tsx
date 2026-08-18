import { Badge } from "../ui/Badge";
import { Controller, UiTone } from "@cu/contracts";

export function ControllerBadge({ controller }: { controller?: Controller }) {
  const tone =
    controller === Controller.Human
      ? UiTone.Amber
      : controller === Controller.Automation
        ? UiTone.Blue
        : UiTone.Slate;
  return <Badge tone={tone}>{controller ?? Controller.None}</Badge>;
}
