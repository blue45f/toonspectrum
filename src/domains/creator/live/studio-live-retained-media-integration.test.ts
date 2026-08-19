import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Studio live retained-media overlay integration", () => {
  it("seals oil/pencil on the overlay and waits for the committed-draw receipt", () => {
    const page = source("../StudioPage.tsx");
    const clear = page.slice(
      page.indexOf("const clearDraftPreview ="),
      page.indexOf("const DEFERRED_STROKE_COMMIT_IDLE_MS"),
    );
    const retainedStart = clear.indexOf("if (wasRetainedMediaDirect)");
    const retained = clear.slice(
      retainedStart,
      clear.indexOf("if (wasWetInkDirect)", retainedStart),
    );
    const seal = retained.indexOf("renderer.end(finalRetainedMediaStroke)");
    expect(seal).toBeGreaterThan(-1);
    expect(retained).not.toContain("renderer.releaseSettledPrefix(1)");
    expect(retained).not.toContain("draftPreviewStoreRef.current.settle(finalRetainedMediaStroke)");

    const queue = page.slice(
      page.indexOf("function queueCommittedStrokeSurfaceHandoff"),
      page.indexOf("function queueDeferredStrokeCommit"),
    );
    expect(queue).toContain("liveRetainedMediaOverlayRendererRef.current.settledStrokeCount");

    const release = page.slice(
      page.indexOf("function releaseCommittedInkSurfaceCounts("),
      page.indexOf("function scheduleCommittedInkSurfaceHandoffRetry"),
    );
    expect(release).toContain("retainedMediaOverlayRenderer.releaseSettledPrefix(retainedOverlayBudget)");
    expect(release).toContain("dynamicBrushOverlayRenderer.releaseSettledPrefix(dynamicOverlayBudget)");
  });
});
