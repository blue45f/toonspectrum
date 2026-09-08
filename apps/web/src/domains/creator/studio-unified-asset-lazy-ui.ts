import { createStudioIntentLazyLoader } from "./studio-intent-lazy-loader";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const studioUnifiedAssetToolPopoverContentLoader =
  createStudioIntentLazyLoader(() =>
    import("./StudioUnifiedAssetToolPopoverContent"),
  );

export const LazyStudioUnifiedAssetToolPopoverContent = lazyRetry(
  () =>
    studioUnifiedAssetToolPopoverContentLoader.load().then((module) => ({
      default: module.StudioUnifiedAssetToolPopoverContent,
    })),
  "StudioUnifiedAssetToolPopoverContent",
);

export function preloadStudioUnifiedAssetToolPopoverContent(): void {
  studioUnifiedAssetToolPopoverContentLoader.preload();
}
