export type RouteContentState = "pending" | "ready" | "degraded" | "blocked" | "error" | "empty";
export type RouteContentSource = "explicit" | "legacy" | "none";

export interface RouteContentInspection {
  readonly state: RouteContentState;
  readonly source: RouteContentSource;
}

/** Route classes get enough time to report an explicit usable, degraded, blocked or error state. */
export function routeStageTimeoutMs(pathname: string): number {
  if (/^\/studio\/(?:bg3d|lift3d|poser|3d)(?:\/|$)/u.test(pathname)) return 20_000;
  if (pathname === "/studio" || pathname.startsWith("/studio/")) return 15_000;
  if (pathname === "/production" || pathname.startsWith("/production/")) return 10_000;
  return 8_000;
}

const EXPLICIT_STATE_SELECTORS = [
  ["error", "[data-route-error]"],
  ["blocked", "[data-route-blocked]"],
  ["degraded", "[data-route-degraded]"],
  ["ready", "[data-route-ready]"],
  ["pending", "[data-route-pending]"],
] as const satisfies readonly (readonly [Exclude<RouteContentState, "empty">, string])[];

const MEANINGFUL_SELECTOR = [
  "h1:not([data-route-semantic-heading])", "h2", "h3", "a[href]", "button", "input",
  "select", "textarea", "canvas", "img", "picture", "video", "iframe",
].join(",");

const IGNORED_ROUTE_CHROME =
  "[data-route-semantic-heading], [data-route-recovery], [data-route-loading-fallback], [data-route-pending]";

function hasLegacyMeaningfulRouteContent(root: HTMLElement): boolean {
  for (const candidate of root.querySelectorAll(MEANINGFUL_SELECTOR)) {
    if (!candidate.closest(IGNORED_ROUTE_CHROME)) return true;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textLength = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest(IGNORED_ROUTE_CHROME)) continue;
    textLength += node.textContent?.trim().length ?? 0;
    if (textLength >= 32) return true;
  }
  return false;
}

/** Prefer an explicit domain readiness marker; legacy DOM heuristics remain a migration fallback. */
export function inspectRouteContent(root: HTMLElement): RouteContentInspection {
  for (const [state, selector] of EXPLICIT_STATE_SELECTORS) {
    if (root.querySelector(selector)) return { state, source: "explicit" };
  }
  if (hasLegacyMeaningfulRouteContent(root)) return { state: "ready", source: "legacy" };
  return { state: "empty", source: "none" };
}

export function hasMeaningfulRouteContent(root: HTMLElement): boolean {
  const { state } = inspectRouteContent(root);
  return state === "ready" || state === "degraded" || state === "blocked" || state === "error";
}
