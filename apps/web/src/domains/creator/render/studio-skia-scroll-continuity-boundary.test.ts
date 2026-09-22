import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const liveSurfacesSource = readFileSync(
  new URL("../canvas/studio-canvas-viewport-live-surfaces.ts", import.meta.url),
  "utf8",
);

describe("Skia scroll continuity boundary", () => {
  it("keeps settled scroll offsets out of exact document revision identity", () => {
    const revisionStart = liveSurfacesSource.indexOf("const velloSceneRevision");
    const ownershipStart = liveSurfacesSource.indexOf(
      "const frameGraphOwnsDocumentPixels",
      revisionStart,
    );
    const revisionBlock = liveSurfacesSource.slice(revisionStart, ownershipStart);

    expect(revisionStart).toBeGreaterThan(-1);
    expect(ownershipStart).toBeGreaterThan(revisionStart);
    expect(revisionBlock).toContain("cameraScaleX: velloSceneDocumentTransform.scaleX");
    expect(revisionBlock).toContain("cameraScaleY: velloSceneDocumentTransform.scaleY");
    expect(revisionBlock).toContain("cameraRotation: velloSceneDocumentTransform.rotation");
    expect(revisionBlock).not.toContain("transform: velloSceneDocumentTransform");
    expect(revisionBlock).not.toContain("offsetX");
    expect(revisionBlock).not.toContain("offsetY");
  });
});
