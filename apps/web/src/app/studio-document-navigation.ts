import { isStudioRoutePathname } from "@/domains/creator/studio-workspace-route";

export interface StudioDocumentNavigationIntent {
  readonly currentHref: string;
  readonly targetHref: string;
  readonly button?: number;
  readonly defaultPrevented?: boolean;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly anchorTarget?: string | null;
  readonly download?: boolean;
  readonly disabled?: boolean;
}

interface StudioDocumentNavigationLocation {
  readonly href: string;
  assign(url: string): void;
}

function hasNavigationModifier(intent: StudioDocumentNavigationIntent): boolean {
  return Boolean(intent.altKey || intent.ctrlKey || intent.metaKey || intent.shiftKey);
}

/**
 * Public pages and Studio documents intentionally use different COOP/COEP headers.
 * Crossing that boundary must therefore be a document navigation, not an SPA route
 * update followed by a second reload in the isolation gate.
 */
export function shouldUseStudioDocumentNavigation(
  intent: StudioDocumentNavigationIntent,
): boolean {
  if (
    intent.defaultPrevented
    || (intent.button ?? 0) !== 0
    || hasNavigationModifier(intent)
    || intent.download
    || intent.disabled
  ) {
    return false;
  }

  const anchorTarget = intent.anchorTarget?.trim().toLowerCase() ?? "";
  if (anchorTarget && anchorTarget !== "_self") return false;

  try {
    const current = new URL(intent.currentHref);
    const target = new URL(intent.targetHref, current);
    if (target.origin !== current.origin) return false;
    if (target.protocol !== "http:" && target.protocol !== "https:") return false;
    return isStudioRoutePathname(current.pathname)
      !== isStudioRoutePathname(target.pathname);
  } catch {
    return false;
  }
}

function findAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (typeof Element === "undefined" || !(target instanceof Element)) return null;
  return target.closest<HTMLAnchorElement>("a[href]");
}

/**
 * Handles ordinary same-tab anchor clicks after component/React click handlers have
 * had a chance to validate or cancel the transition. Programmatic navigation remains
 * protected by StudioCrossOriginIsolationGate as a fallback.
 */
export function installStudioDocumentNavigationBridge(
  documentLike: Document = document,
  locationLike: StudioDocumentNavigationLocation = window.location,
): () => void {
  const handleClick = (event: MouseEvent) => {
    const anchor = findAnchor(event.target);
    if (!anchor) return;

    const useDocumentNavigation = shouldUseStudioDocumentNavigation({
      currentHref: locationLike.href,
      targetHref: anchor.href,
      button: event.button,
      defaultPrevented: event.defaultPrevented,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      anchorTarget: anchor.target,
      download: anchor.hasAttribute("download"),
      disabled: anchor.getAttribute("aria-disabled") === "true",
    });
    if (!useDocumentNavigation) return;

    event.preventDefault();
    locationLike.assign(anchor.href);
  };

  // React delegates bubbling click events to the root. A document bubble listener runs
  // afterwards, so component guards can call preventDefault() before we force a reload.
  documentLike.addEventListener("click", handleClick);
  return () => {
    documentLike.removeEventListener("click", handleClick);
  };
}
