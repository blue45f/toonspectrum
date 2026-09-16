import { createStudioIntentLazyLoader } from "./studio-intent-lazy-loader";

import { lazyRetry } from "@/shared/lib/lazy-retry";

function warmStudioToolPopoverChunk(importer: () => Promise<unknown>): void {
  void importer().catch(() => undefined);
}

const studioAssetToolPopoverBodyLoader = createStudioIntentLazyLoader(() => {
  // The canonical entry now opens the unified visual workspace. Warm its catalog and direct-drag
  // leaves beside the lightweight shell so click-only entry has no shell -> workspace waterfall.
  warmStudioToolPopoverChunk(() => import("./StudioUnifiedAssetToolPopoverContent"));
  warmStudioToolPopoverChunk(() => import("./StudioUnifiedAssetToolPopoverContentDirectDrag"));
  return import("./StudioAssetToolPopoverWorkspace");
});
const studioSceneToolPopoverBodyLoader = createStudioIntentLazyLoader(() => {
  // bgFill is the initial scene tab. Start its leaves alongside the body so the
  // second Suspense boundary does not create a body -> panel network waterfall.
  warmStudioToolPopoverChunk(() => import("./StudioBackgroundPanel"));
  warmStudioToolPopoverChunk(() => import("./canvas/StudioCanvasResizer"));
  return import("./StudioSceneToolPopoverBody");
});
const studioStyleToolPopoverBodyLoader = createStudioIntentLazyLoader(() =>
  // The initial style surface is the lightweight color workbench. The heavier saved-palette
  // library remains lazy until its explicit tab is selected.
  import("./StudioStyleToolPopoverBody")
);
const studioAiToolPopoverBodyLoader = createStudioIntentLazyLoader(() => {
  // The AI hub opens on the background tool by default. Warm both leaves in
  // parallel with the body while retaining their independent lazy chunks.
  warmStudioToolPopoverChunk(() => import("./ai/StudioAiAssistHub"));
  warmStudioToolPopoverChunk(() => import("./ai/StudioAiBackgroundPanel"));
  return import("./ai/StudioAiToolPopoverBody");
});
const studioBubbleToolPopoverBodyLoader = createStudioIntentLazyLoader(() =>
  import("./lettering/StudioBubbleToolPopoverBody")
);

export const LazyStudioAssetToolPopoverBody = lazyRetry(
  () => studioAssetToolPopoverBodyLoader.load().then((mod) => ({
    default: mod.StudioAssetToolPopoverWorkspace,
  })),
  "StudioAssetToolPopoverWorkspace"
);
export const LazyStudioSceneToolPopoverBody = lazyRetry(
  () => studioSceneToolPopoverBodyLoader.load().then((mod) => ({
    default: mod.StudioSceneToolPopoverBody,
  })),
  "StudioSceneToolPopoverBody"
);
export const LazyStudioStyleToolPopoverBody = lazyRetry(
  () => studioStyleToolPopoverBodyLoader.load().then((mod) => ({
    default: mod.StudioStyleToolPopoverBody,
  })),
  "StudioStyleToolPopoverBody"
);
export const LazyStudioAiToolPopoverBody = lazyRetry(
  () => studioAiToolPopoverBodyLoader.load().then((mod) => ({
    default: mod.StudioAiToolPopoverBody,
  })),
  "StudioAiToolPopoverBody"
);
export const LazyStudioBubbleToolPopoverBody = lazyRetry(
  () => studioBubbleToolPopoverBodyLoader.load().then((mod) => ({
    default: mod.StudioBubbleToolPopoverBody,
  })),
  "StudioBubbleToolPopoverBody"
);

export function preloadStudioAssetToolPopoverBody(): void {
  studioAssetToolPopoverBodyLoader.preload();
}

export function preloadStudioSceneToolPopoverBody(): void {
  studioSceneToolPopoverBodyLoader.preload();
}

export function preloadStudioStyleToolPopoverBody(): void {
  studioStyleToolPopoverBodyLoader.preload();
}

export function preloadStudioAiToolPopoverBody(): void {
  studioAiToolPopoverBodyLoader.preload();
}

export function preloadStudioBubbleToolPopoverBody(): void {
  studioBubbleToolPopoverBodyLoader.preload();
}
