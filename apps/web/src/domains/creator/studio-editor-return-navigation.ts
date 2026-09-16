import { STUDIO_HOME_PATHNAME } from "./studio-workspace-route";

export type StudioEditorReturnStrategy = "history" | "studio-home";

export interface StudioEditorReturnContext {
  readonly currentHref: string;
  readonly referrer: string;
  readonly historyLength: number;
  readonly historyState: unknown;
}

export interface StudioEditorReturnActions extends StudioEditorReturnContext {
  readonly back: () => void;
  readonly openStudioHome: () => void;
}

function ownValue(value: unknown, key: PropertyKey): unknown {
  if (!value || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function hasRouterHistoryEntry(historyState: unknown): boolean {
  const index = ownValue(historyState, "idx");
  return typeof index === "number" && Number.isSafeInteger(index) && index > 0;
}

function hasSameOriginReferrer(context: StudioEditorReturnContext): boolean {
  if (context.historyLength <= 1 || !context.referrer.trim()) return false;
  try {
    const current = new URL(context.currentHref);
    const referrer = new URL(context.referrer);
    if (current.origin !== referrer.origin) return false;
    if (!["http:", "https:"].includes(referrer.protocol)) return false;
    return `${current.pathname}${current.search}` !== `${referrer.pathname}${referrer.search}`;
  } catch {
    return false;
  }
}

/**
 * Prefer the browser's real previous entry when React Router or a same-origin document referrer
 * proves that one exists. Direct links, restored tabs and installed-app launches instead return to
 * the Studio front door so the back control can never become a silent no-op.
 */
export function resolveStudioEditorReturnStrategy(
  context: StudioEditorReturnContext,
): StudioEditorReturnStrategy {
  return (
    context.historyLength > 1 && hasRouterHistoryEntry(context.historyState)
  ) || hasSameOriginReferrer(context)
    ? "history"
    : "studio-home";
}

export function runStudioEditorReturnNavigation(
  actions: StudioEditorReturnActions,
): StudioEditorReturnStrategy {
  const strategy = resolveStudioEditorReturnStrategy(actions);
  if (strategy === "history") actions.back();
  else actions.openStudioHome();
  return strategy;
}

/** Execute the editor exit with native history/document navigation so pending-save guards still run. */
export function returnFromStudioEditorInBrowser(): StudioEditorReturnStrategy {
  return runStudioEditorReturnNavigation({
    currentHref: window.location.href,
    referrer: document.referrer,
    historyLength: window.history.length,
    historyState: window.history.state,
    back: () => window.history.back(),
    openStudioHome: () => {
      window.location.replace(new URL(STUDIO_HOME_PATHNAME, window.location.href).href);
    },
  });
}
