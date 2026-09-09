import { createStudioIntentLazyLoader } from "./studio-intent-lazy-loader";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const studioUnifiedAssetToolPopoverContentLoader =
  createStudioIntentLazyLoader(() =>
    Promise.all([
      import("./StudioUnifiedAssetToolPopoverContent"),
      import("./StudioUnifiedAssetToolPopoverContentDirectDrag"),
    ]).then(([, directDragModule]) => directDragModule),
  );

export const LazyStudioUnifiedAssetToolPopoverContent = lazyRetry(
  () =>
    studioUnifiedAssetToolPopoverContentLoader.load().then((module) => ({
      default: module.StudioUnifiedAssetToolPopoverContentDirectDrag,
    })),
  "StudioUnifiedAssetToolPopoverContentDirectDrag",
);

export function preloadStudioUnifiedAssetToolPopoverContent(): void {
  studioUnifiedAssetToolPopoverContentLoader.preload();
}
