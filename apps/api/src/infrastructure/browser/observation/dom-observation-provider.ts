import { createHash } from "node:crypto";
import type { Page } from "playwright-core";
import type {
  LocatorCandidate,
  ObservableControl,
  ObservableDialog,
  SurfaceObservation,
} from "@cu/contracts";
import type { BrowserObservationProvider } from "./observation-provider.js";

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "a[data-test]",
  "a[data-testid]",
  "button",
  "input",
  "select",
  "textarea",
  '[role="button"]',
  '[role="link"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="checkbox"]',
  '[role="menuitem"]',
  "[onclick]",
].join(", ");

export function truncate(value: string, max = 80): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

export function fingerprintObservation(parts: {
  location: string;
  title: string;
  controlSummary: string;
  textSummary: string;
}): string {
  return createHash("sha256")
    .update(
      `${parts.location}|${parts.title}|${parts.controlSummary}|${parts.textSummary}`,
    )
    .digest("hex")
    .slice(0, 16);
}

type RawControl = {
  index: number;
  tag: string;
  role?: string;
  accessibleName: string;
  text: string;
  inputType?: string;
  value?: string;
  id?: string;
  testId?: string;
  nameAttr?: string;
  placeholder?: string;
  disabled: boolean;
};

export function controlsFromRaw(
  raw: RawControl[],
): ObservableControl[] {
  return raw.map((c) => {
    const ref = `c${c.index}`;
    const candidateLocators: LocatorCandidate[] = [];

    if (c.role && c.accessibleName) {
      candidateLocators.push({
        strategy: {
          kind: "role",
          role: c.role,
          name: truncate(c.accessibleName, 120),
          exact: false,
        },
        confidence: 0.95,
      });
    }

    if (c.testId) {
      candidateLocators.push({
        strategy: { kind: "testId", testId: c.testId },
        confidence: 0.9,
      });
    }

    if (c.placeholder) {
      candidateLocators.push({
        strategy: { kind: "placeholder", text: c.placeholder },
        confidence: 0.85,
      });
    }

    if (c.nameAttr) {
      candidateLocators.push({
        strategy: { kind: "label", text: c.nameAttr },
        confidence: 0.7,
      });
    }

    if (c.text && c.text.length > 0 && c.text.length < 80) {
      candidateLocators.push({
        strategy: { kind: "text", text: truncate(c.text), exact: false },
        confidence: 0.65,
      });
    }

    if (c.id) {
      const escapedId = c.id.replace(
        /([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g,
        "\\$1",
      );
      candidateLocators.push({
        strategy: { kind: "css", selector: `#${escapedId}` },
        confidence: 0.55,
      });
    }

    return {
      ref,
      role: c.role || undefined,
      accessibleName: truncate(c.accessibleName || "") || undefined,
      text: truncate(c.text || "") || undefined,
      tag: c.tag,
      inputType: c.inputType,
      value: c.inputType === "password" ? "[REDACTED]" : c.value,
      disabled: c.disabled,
      candidateLocators,
    };
  });
}

export function assembleObservation(input: {
  location: string;
  title?: string;
  controls: ObservableControl[];
  visibleText: string[];
  dialogs: ObservableDialog[];
}): SurfaceObservation {
  const controlSummary = input.controls
    .map((c) => `${c.role ?? c.tag}:${c.accessibleName ?? c.text ?? ""}`)
    .join("|");
  const textSummary = input.visibleText.slice(0, 10).join("|");
  return {
    location: input.location,
    title: input.title,
    controls: input.controls,
    visibleText: input.visibleText,
    dialogs: input.dialogs,
    stateHints: {
      controlCount: input.controls.length,
      dialogCount: input.dialogs.length,
    },
    fingerprint: fingerprintObservation({
      location: input.location,
      title: input.title ?? "",
      controlSummary,
      textSummary,
    }),
  };
}

/**
 * Semantic DOM observation — derives roles/names from elements and ARIA
 * attributes. Used as a supplemental/fallback provider, not as a native
 * accessibility-tree snapshot.
 */
export class SemanticDomObservationProvider implements BrowserObservationProvider {
  constructor(
    private readonly limits: { maxControls?: number; maxTextItems?: number } = {},
  ) {}

  async observe(page: Page): Promise<SurfaceObservation> {
    const maxControls = this.limits.maxControls ?? 40;
    const maxTextItems = this.limits.maxTextItems ?? 30;
    const location = page.url();
    const title = await page.title().catch(() => undefined);

    const raw = await page.evaluate(
      ({ interactiveSelector, maxControls, maxTextItems }) => {
        const elements = Array.from(
          document.querySelectorAll(interactiveSelector),
        );

        const scored = elements.map((el, index) => {
          const html = el as HTMLElement;
          const tag = html.tagName.toLowerCase();
          const role =
            html.getAttribute("role") ||
            (tag === "button"
              ? "button"
              : tag === "a"
                ? "link"
                : tag === "input"
                  ? html.getAttribute("type") === "submit"
                    ? "button"
                    : "textbox"
                  : tag === "select"
                    ? "combobox"
                    : undefined);
          const accessibleName =
            html.getAttribute("aria-label") ||
            html.getAttribute("name") ||
            html.getAttribute("placeholder") ||
            html.getAttribute("title") ||
            (html as HTMLInputElement).labels?.[0]?.innerText ||
            html.innerText ||
            html.textContent ||
            html.getAttribute("data-test") ||
            html.getAttribute("data-testid") ||
            "";
          const text = (html.innerText || html.textContent || "").trim();
          const inputType =
            tag === "input" ? (html as HTMLInputElement).type : undefined;
          const value =
            "value" in html
              ? String((html as HTMLInputElement).value ?? "")
              : undefined;
          const disabled =
            html.hasAttribute("disabled") ||
            html.getAttribute("aria-disabled") === "true";

          let priority = 5;
          const testId =
            html.getAttribute("data-testid") ||
            html.getAttribute("data-test") ||
            undefined;
          if (role === "button" && accessibleName.trim()) priority = 2;
          else if (testId) priority = 3;

          return {
            index,
            tag,
            role,
            accessibleName: accessibleName.trim(),
            text,
            inputType,
            value,
            id: html.id || undefined,
            testId,
            nameAttr: html.getAttribute("name") || undefined,
            placeholder: html.getAttribute("placeholder") || undefined,
            disabled,
            priority,
          };
        });

        scored.sort((a, b) => a.priority - b.priority || a.index - b.index);
        const controls = scored.slice(0, maxControls);

        const textNodes = Array.from(
          document.querySelectorAll(
            "h1,h2,h3,h4,p,label,[data-test],[data-testid],.title,.error,.error-message,[role='alert']",
          ),
        )
          .map((n) => (n.textContent || "").trim())
          .filter(Boolean)
          .slice(0, maxTextItems);

        const dialogs = Array.from(
          document.querySelectorAll(
            '[role="dialog"]:not([hidden]), dialog:not([hidden]), .modal:not([hidden])',
          ),
        )
          .filter((el) => {
            const html = el as HTMLElement;
            if (html.getAttribute("aria-hidden") === "true") return false;
            const style = window.getComputedStyle(html);
            return style.display !== "none" && style.visibility !== "hidden";
          })
          .map((el, index) => ({
            index,
            title: (el.querySelector("h1,h2,h3,.title")?.textContent || "").trim(),
            text: (el.textContent || "").trim().slice(0, 200),
          }));

        return { controls, textNodes, dialogs };
      },
      { interactiveSelector: INTERACTIVE_SELECTOR, maxControls, maxTextItems },
    );

    const dialogs: ObservableDialog[] = raw.dialogs.map((d) => ({
      ref: `d${d.index}`,
      title: d.title || undefined,
      text: truncate(d.text, 160) || undefined,
      kind: "modal" as const,
    }));

    return assembleObservation({
      location,
      title,
      controls: controlsFromRaw(raw.controls),
      visibleText: raw.textNodes.map((t) => truncate(t, 120)),
      dialogs,
    });
  }
}
