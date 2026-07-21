import { createStudioIntentLazyLoader } from "./studio-intent-lazy-loader";

import { lazyRetry } from "@/lib/lazy-retry";

const studioInspectorAsideLoader = createStudioIntentLazyLoader(() =>
  import("./StudioInspectorAside")
);

/**
 * The inspector is a large professional surface and is not required to paint the canvas itself.
 * Keeping it behind a retryable boundary lets mobile open the drawing surface first and splits its
 * parse/compile work from the latency-sensitive ink engine on desktop.
 */
export const LazyStudioInspectorAside = lazyRetry(
  () => studioInspectorAsideLoader.load().then((module) => ({
    default: module.StudioInspectorAside,
  })),
  "StudioInspectorAside"
);

/** Best-effort warm-up for a collapsed desktop rail or an unopened mobile properties sheet. */
export function preloadStudioInspectorAside(): void {
  studioInspectorAsideLoader.preload();
}
