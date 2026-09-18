// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { exportStudioCurrentPageVectorPdf } from "./studio-vector-pdf-product";
import type { DrawEl } from "../studio-element-model";

afterEach(() => vi.restoreAllMocks());

describe("Studio vector PDF product bridge", () => {
  it("emits the rendered page plus freehand strokes through the real PDF writer", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 400;
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
    vi.spyOn(canvas, "toBlob").mockImplementation((callback) => {
      callback(new Blob([jpeg], { type: "image/jpeg" }));
    });
    const stroke: DrawEl = {
      id: "stroke-1",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [0, 0, 100, 100, 200, 200],
      stroke: "#336699",
      strokeWidth: 4,
      opacity: 0.8,
    };

    const result = await exportStudioCurrentPageVectorPdf({
      canvas,
      logicalWidth: 200,
      logicalHeight: 400,
      title: "벡터 원고",
      drawElements: [stroke],
    });

    expect(new TextDecoder("latin1").decode(result.bytes.slice(0, 8))).toContain("%PDF-1.7");
    expect(result.vectorStrokeCount).toBe(1);
    expect(result.skippedStrokeCount).toBe(0);
    expect(result.warnings[0]).toContain("JPEG 배경");
  });
});
