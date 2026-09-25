import { describe, expect, it } from "vitest";

import {
  STUDIO_DRAWING_PRACTICE_DEFAULT_OPACITY,
  completeStudioDrawingPracticeDocument,
  createStudioDrawingPracticeDocument,
  fitStudioDrawingPracticeToPage,
  mirrorStudioDrawingPracticeDocument,
  normalizeStudioDrawingPracticeDocument,
  parseStudioDrawingPracticeDocument,
  patchStudioDrawingPracticeDocument,
  relinkStudioDrawingPracticeSource,
  retryStudioDrawingPracticeDocument,
} from "./studio-drawing-practice-document";

const SHA = `sha256:${"a".repeat(64)}` as const;
const viewport = { canvasWidth: 800, canvasHeight: 1_200 };
const source = {
  sha256: SHA,
  assetId: "asset-a",
  name: "연습 원본.png",
  mimeType: "image/png",
  width: 1_000,
  height: 500,
};

describe("studio drawing-practice document", () => {
  it("creates a locked non-output overlay fitted to the page", () => {    const document = createStudioDrawingPracticeDocument({
      attemptId: "attempt-a",
      source,
      viewport,
    });
    expect(document).toMatchObject({
      version: 1,
      attemptId: "attempt-a",
      attemptIndex: 1,
      purpose: "practice",
      status: "active",
      view: {
        mode: "overlay",
        opacity: STUDIO_DRAWING_PRACTICE_DEFAULT_OPACITY,
        visible: true,
        locked: true,
        placement: "above-artwork",
      },
    });
    expect(document.view.centerX).toBe(400);
    expect(document.view.centerY).toBe(600);
    expect(document.view.width).toBeCloseTo(736);
    expect(document.view.height).toBeCloseTo(368);
    expect(parseStudioDrawingPracticeDocument(document)).toEqual(document);
  });

  it("fits portrait and landscape sources without changing aspect ratio", () => {
    expect(fitStudioDrawingPracticeToPage({ width: 400, height: 800 }, viewport)).toEqual({      centerX: 400,
      centerY: 600,
      width: 552,
      height: 1_104,
    });
    const landscape = fitStudioDrawingPracticeToPage({ width: 1_600, height: 900 }, viewport);
    expect(landscape.width / landscape.height).toBeCloseTo(16 / 9);
    expect(landscape.width).toBeCloseTo(736);
  });

  it("normalizes bounded display values while preserving the content hash", () => {
    const normalized = normalizeStudioDrawingPracticeDocument({
      attemptId: "attempt-a",
      attemptIndex: 99_999,
      purpose: "production-assist",
      status: "completed",
      source: { ...source, sha256: SHA.slice("sha256:".length).toUpperCase() },
      view: {
        mode: "reference-window",
        centerX: Number.POSITIVE_INFINITY,
        centerY: -20_000_000,
        width: 0,
        height: Number.NaN,
        rotationDeg: 540,
        opacity: 3,
        visible: false,
        locked: false,
        placement: "below-artwork",
      },
    }, viewport);
    expect(normalized).not.toBeNull();
    expect(normalized?.source.sha256).toBe(SHA);
    expect(normalized?.attemptIndex).toBe(9_999);
    expect(normalized?.view).toMatchObject({
      mode: "reference-window",
      centerX: 400,
      centerY: -10_000_000,
      width: 1,
      rotationDeg: -180,
      opacity: 1,
      visible: false,
      locked: false,
      placement: "below-artwork",
    });
  });

  it("patches, completes, retries, and mirrors without changing source identity", () => {
    const created = createStudioDrawingPracticeDocument({
      attemptId: "attempt-a",
      source,
      viewport,
    });
    const patched = patchStudioDrawingPracticeDocument(created, {
      view: { opacity: 0.55, locked: false, centerX: 123 },
    }, viewport);
    const completed = completeStudioDrawingPracticeDocument(patched);
    const retried = retryStudioDrawingPracticeDocument(completed, "attempt-b", "group-b");
    const mirrored = mirrorStudioDrawingPracticeDocument(retried, 800);
    expect(retried).toMatchObject({
      attemptId: "attempt-b",      attemptIndex: 2,
      status: "active",
      targetGroupId: "group-b",
      source: { sha256: SHA },
      view: { visible: true, locked: true },
    });
    expect(mirrored.view.centerX).toBe(677);
    expect(mirrored.view.flipX).toBe(true);
    expect(mirrored.source.sha256).toBe(SHA);
  });

  it("relinks a missing source without replacing the attempt or result group", () => {
    const created = createStudioDrawingPracticeDocument({
      attemptId: "attempt-a",
      source,
      viewport,
      targetGroupId: "group-a",
    });
    const replacement = {
      ...source,
      sha256: `sha256:${"b".repeat(64)}` as const,
      assetId: "asset-b",
      name: "교체 원본.png",
      width: 400,
      height: 800,
    };
    const relinked = relinkStudioDrawingPracticeSource(created, replacement, viewport);
    expect(relinked).toMatchObject({
      attemptId: "attempt-a",
      attemptIndex: 1,
      targetGroupId: "group-a",
      status: "active",
      source: { sha256: replacement.sha256, assetId: "asset-b" },
      view: { centerX: 400, centerY: 600, width: 552, height: 1_104, locked: true },
    });
  });

  it("rejects unknown fields, unsafe identities, accessors, and non-canonical numbers", () => {
    const canonical = createStudioDrawingPracticeDocument({
      attemptId: "attempt-a",
      source,
      viewport,
    });
    expect(parseStudioDrawingPracticeDocument({ ...canonical, future: true })).toBeNull();
    expect(parseStudioDrawingPracticeDocument({ ...canonical, attemptId: "__proto__" })).toBeNull();
    expect(parseStudioDrawingPracticeDocument({
      ...canonical,
      view: { ...canonical.view, opacity: Number.NaN },
    })).toBeNull();
    const accessor = Object.defineProperty({}, "version", {
      enumerable: true,
      get: () => 1,
    });
    expect(parseStudioDrawingPracticeDocument(accessor)).toBeNull();
  });
});
