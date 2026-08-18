import type { Page } from "playwright-core";
import type {
  LocatorCandidate,
  ObservableControl,
  ObservableDialog,
  SurfaceObservation,
} from "@cu/contracts";
import type { BrowserObservationProvider } from "./observation-provider.js";
import {
  SemanticDomObservationProvider,
  assembleObservation,
  truncate,
} from "./dom-observation-provider.js";

const INTERACTIVE_AX_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "combobox",
  "checkbox",
  "radio",
  "menuitem",
  "tab",
  "switch",
  "slider",
  "spinbutton",
]);

type ParsedAx = {
  role: string;
  name: string;
  states: string;
};

/**
 * Playwright ARIA snapshot (`page.ariaSnapshot`) — role, accessible name, state.
 * Not an OS accessibility-tree / AX API. DOM observation is supplemental.
 */
export class AccessibilityObservationProvider implements BrowserObservationProvider {
  private readonly fallback: SemanticDomObservationProvider;

  constructor(
    private readonly limits: { maxControls?: number; maxTextItems?: number } = {},
  ) {
    this.fallback = new SemanticDomObservationProvider(limits);
  }

  async observe(page: Page): Promise<SurfaceObservation> {
    const maxControls = this.limits.maxControls ?? 40;
    const location = page.url();
    const title = await page.title().catch(() => undefined);

    let snapshot = "";
    try {
      snapshot = await page.ariaSnapshot({ depth: 8 });
    } catch {
      snapshot = "";
    }

    if (!snapshot.trim()) {
      return this.fallback.observe(page);
    }

    const parsed = parseAriaSnapshot(snapshot);
    const controls: ObservableControl[] = parsed
      .filter((n) => INTERACTIVE_AX_ROLES.has(n.role) && n.name)
      .slice(0, maxControls)
      .map((node, index) => controlFromParsed(node, index));

    const dialogs: ObservableDialog[] = parsed
      .filter((n) => n.role === "dialog" || n.role === "alertdialog")
      .slice(0, 8)
      .map((d, index) => ({
        ref: `d${index}`,
        title: truncate(d.name, 80) || undefined,
        text: truncate(d.name, 160) || undefined,
        kind: "modal",
      }));

    if (dialogs.length === 0) {
      dialogs.push(...(await visibleDomDialogs(page)));
    }

    const visibleText = uniqueNames(
      parsed.filter((n) => n.name).map((n) => truncate(n.name, 120)),
    ).slice(0, this.limits.maxTextItems ?? 30);

    const dom = await this.fallback.observe(page);
    return mergeObservations(location, title, controls, dialogs, visibleText, dom);
  }
}

function controlFromParsed(node: ParsedAx, index: number): ObservableControl {
  const candidateLocators: LocatorCandidate[] = [];
  if (node.name) {
    candidateLocators.push({
      strategy: { kind: "role", role: node.role, name: node.name, exact: false },
      confidence: 0.97,
    });
    candidateLocators.push({
      strategy: { kind: "accessibility", role: node.role, name: node.name },
      confidence: 0.9,
    });
  }
  return {
    ref: `c${index}`,
    role: node.role,
    accessibleName: node.name || undefined,
    text: node.name || undefined,
    disabled: /\bdisabled\b/i.test(node.states),
    candidateLocators,
  };
}

/** Parse Playwright ARIA snapshot YAML-ish lines: `- button "Submit" [disabled]`. */
export function parseAriaSnapshot(yaml: string): ParsedAx[] {
  const out: ParsedAx[] = [];
  for (const raw of yaml.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("- ")) continue;
    const body = line.slice(2);
    const match = /^([a-zA-Z0-9_-]+)(?:\s+"([^"]*)")?(?:\s*\[([^\]]*)\])?/.exec(
      body,
    );
    if (!match) continue;
    out.push({
      role: (match[1] ?? "").toLowerCase(),
      name: match[2] ?? "",
      states: match[3] ?? "",
    });
  }
  return out;
}

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

async function visibleDomDialogs(page: Page): Promise<ObservableDialog[]> {
  return page
    .locator('[role="dialog"]:not([hidden]), dialog:not([hidden])')
    .evaluateAll((els) =>
      els
        .filter((el) => {
          const html = el as HTMLElement;
          if (html.getAttribute("aria-hidden") === "true") return false;
          const style = window.getComputedStyle(html);
          return style.display !== "none" && style.visibility !== "hidden";
        })
        .map((el, index) => ({
          ref: `d${index}`,
          title:
            (
              el.querySelector("h1,h2,h3,.title")?.textContent ||
              el.getAttribute("aria-label") ||
              ""
            ).trim() || undefined,
          text: (el.textContent || "").trim().slice(0, 160) || undefined,
          kind: "modal" as const,
        })),
    );
}

function mergeObservations(
  location: string,
  title: string | undefined,
  axControls: ObservableControl[],
  axDialogs: ObservableDialog[],
  axText: string[],
  dom: SurfaceObservation,
): SurfaceObservation {
  const seen = new Set(
    axControls.map((c) => `${c.role}:${c.accessibleName ?? c.text ?? ""}`),
  );
  const merged = [...axControls];
  for (const control of dom.controls) {
    const key = `${control.role}:${control.accessibleName ?? control.text ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(control);
    }
  }
  const dialogs = axDialogs.length > 0 ? axDialogs : dom.dialogs;
  const visibleText = uniqueNames([...axText, ...dom.visibleText]).slice(0, 30);
  return assembleObservation({
    location,
    title,
    controls: merged.slice(0, 40),
    visibleText,
    dialogs,
  });
}
