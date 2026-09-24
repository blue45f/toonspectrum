import { describe, expect, it } from "vitest";

import { createStudioDrawingPracticeDocument } from "./studio-drawing-practice-document";
import {
  resolveStudioDrawingPracticeAsset,
  shouldRenderStudioDrawingPracticeGuide,
} from "./studio-drawing-practice-runtime";

const SHA_A = `sha256:${"a".repeat(64)}` as const;
const SHA_B = `sha256:${"b".repeat(64)}` as const;

const document = createStudioDrawingPracticeDocument({
  attemptId: "attempt-a",
  source: {
    sha256: SHA_A,
    assetId: "legacy-id",
    name: "reference.png",
    width: 640,
    height: 480,
  },
  viewport: { canvasWidth: 800, canvasHeight: 1_200 },
});

const assets = [
  {
    id: "legacy-id",
    name: "wrong-id-match.png",
    dataUrl: "data:image/png;base64,wrong",
    contentHash: SHA_B,
    width: 10,
    height: 10,
    createdAt: 1,
  },
  {
    id: "different-id",
    name: "hash-match.png",
    dataUrl: "data:image/png;base64,right",
    contentHash: SHA_A,
    width: 640,
    height: 480,
    createdAt: 2,
  },
];

describe("studio drawing-practice runtime", () => {
  it("resolves source bytes by canonical hash before the legacy asset id", () => {
    expect(resolveStudioDrawingPracticeAsset(document, assets)?.id).toBe("different-id");
  });

  it("uses asset id only when no hash-identical candidate is available", () => {
    expect(resolveStudioDrawingPracticeAsset(document, assets.slice(0, 1))?.id).toBe("legacy-id");
  });

  it("renders only in the live overlay path", () => {
    const base = {
      document,
      sourceDataUrl: "data:image/png;base64,right",
      compareActive: false,
      exporting: false,
      saving: false,
      timelapseCapturing: false,
    };
    expect(shouldRenderStudioDrawingPracticeGuide(base)).toBe(true);
    expect(shouldRenderStudioDrawingPracticeGuide({ ...base, compareActive: true })).toBe(false);
    expect(shouldRenderStudioDrawingPracticeGuide({ ...base, exporting: true })).toBe(false);
    expect(shouldRenderStudioDrawingPracticeGuide({ ...base, saving: true })).toBe(false);
    expect(shouldRenderStudioDrawingPracticeGuide({ ...base, timelapseCapturing: true })).toBe(false);
    expect(shouldRenderStudioDrawingPracticeGuide({
      ...base,
      document: { ...document, view: { ...document.view, mode: "reference-window" } },
    })).toBe(false);
    expect(shouldRenderStudioDrawingPracticeGuide({
      ...base,
      document: { ...document, view: { ...document.view, visible: false } },
    })).toBe(false);
  });
});
