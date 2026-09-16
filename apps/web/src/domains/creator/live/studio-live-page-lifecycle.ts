export type StudioLivePageNavigationType =
  | "navigate"
  | "reload"
  | "back_forward"
  | "prerender"
  | "unknown";

interface StudioLiveNavigationEntry {
  readonly type?: unknown;
}

interface StudioLiveNavigationPerformance {
  getEntriesByType(type: "navigation"): readonly StudioLiveNavigationEntry[];
}

const KNOWN_NAVIGATION_TYPES = new Set<StudioLivePageNavigationType>([
  "navigate",
  "reload",
  "back_forward",
  "prerender",
]);

function defaultNavigationPerformance(): StudioLiveNavigationPerformance | null {
  try {
    const source = globalThis.performance;
    return typeof source?.getEntriesByType === "function"
      ? source as StudioLiveNavigationPerformance
      : null;
  } catch {
    return null;
  }
}

/** Distinguishes an actual reload from a new page whose sessionStorage was cloned. */
export function readStudioLivePageNavigationType(
  source: StudioLiveNavigationPerformance | null = defaultNavigationPerformance(),
): StudioLivePageNavigationType {
  try {
    const type = source?.getEntriesByType("navigation")[0]?.type;
    return typeof type === "string" && KNOWN_NAVIGATION_TYPES.has(
      type as StudioLivePageNavigationType,
    )
      ? type as StudioLivePageNavigationType
      : "unknown";
  } catch {
    return "unknown";
  }
}
