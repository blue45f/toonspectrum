import { describe, expect, it } from "vitest";

import {
  createStudioScene3dDocument,
  isStudioScene3dDocument,
} from "./studio-scene3d-document";

function withOutput(width: unknown, height: unknown) {
  const document = createStudioScene3dDocument("scene:output-contract", "2026-09-10T00:00:00.000Z");
  return {
    ...document,
    output: {
      ...document.output,
      width,
      height,
    },
  };
}

describe("Scene3D output contract", () => {
  it("accepts safe integer dimensions across the supported boundary", () => {
    expect(isStudioScene3dDocument(withOutput(64, 64))).toBe(true);
    expect(isStudioScene3dDocument(withOutput(16384, 16384))).toBe(true);
    expect(isStudioScene3dDocument(withOutput(2048, 4096))).toBe(true);
  });

  it("rejects non-numeric, non-integer and unsafe dimensions", () => {
    for (const [width, height] of [
      ["2048", 2048],
      [2048, "2048"],
      [2048.5, 2048],
      [2048, 2048.5],
      [Number.NaN, 2048],
      [Number.MAX_SAFE_INTEGER + 1, 2048],
    ] as const) {
      expect(isStudioScene3dDocument(withOutput(width, height)), `${String(width)} × ${String(height)}`).toBe(false);
    }
  });

  it("rejects dimensions outside the output budget", () => {
    expect(isStudioScene3dDocument(withOutput(63, 1024))).toBe(false);
    expect(isStudioScene3dDocument(withOutput(1024, 63))).toBe(false);
    expect(isStudioScene3dDocument(withOutput(16385, 1024))).toBe(false);
    expect(isStudioScene3dDocument(withOutput(1024, 16385))).toBe(false);
  });
});
