import { describe, expect, it } from "vitest";

import { createStudioManualChunks } from "./vite-manual-chunks";

const manualChunk = createStudioManualChunks({
  isInitialIconModule: () => false,
  isStudioCoreIconModule: () => false,
  isStudioWorkspaceIconModule: () => false,
});

function creatorModule(path: string): string {
  return `/repo/apps/web/src/domains/creator/${path}`;
}

describe("createStudioManualChunks", () => {
  it("keeps dependency-free Studio contracts in the shared micro-contract chunk", () => {
    expect(manualChunk(creatorModule("studio-story-beats.ts")))
      .toBe("studio-core-micro-contracts");
    expect(manualChunk(creatorModule("studio-element-model.ts")))
      .toBe("studio-core-micro-contracts");
  });

  it("does not color connected brush runtime graphs into the app entry closure", () => {
    expect(manualChunk(creatorModule("brush/studio-brush-pack-id.ts")))
      .toBeUndefined();
    expect(manualChunk(creatorModule("brush/studio-brush-selection.ts")))
      .toBeUndefined();
    expect(manualChunk(creatorModule("brush/studio-brush-engine-program-set.ts")))
      .toBeUndefined();
  });
});
