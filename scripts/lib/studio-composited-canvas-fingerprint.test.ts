import { describe, expect, it } from "vitest";

import { fingerprintStudioCompositedPixels } from "./studio-composited-canvas-fingerprint";

function rgba(...pixels: readonly [number, number, number, number][]): Uint8Array {
  return Uint8Array.from(pixels.flat());
}

describe("studio composited canvas fingerprint", () => {
  it("counts visible authored ink and changes the presentation hash", () => {
    const blank = fingerprintStudioCompositedPixels({
      data: rgba([255, 255, 255, 255], [255, 255, 255, 255]),
      width: 2,
      height: 1,
      channels: 4,
      bitDepth: 8,
    });
    const authored = fingerprintStudioCompositedPixels({
      data: rgba([255, 255, 255, 255], [124, 92, 252, 255]),
      width: 2,
      height: 1,
      channels: 4,
      bitDepth: 8,
    });

    expect(blank).toMatchObject({
      source: "composited-document-screenshot",
      nonBlankSamples: 0,
      sampledPixels: 2,
    });
    expect(authored.nonBlankSamples).toBe(1);
    expect(authored.hash).not.toBe(blank.hash);
  });

  it("does not treat hidden RGB values in transparent renderer buffers as visible ink", () => {
    const transparent = fingerprintStudioCompositedPixels({
      data: rgba([124, 92, 252, 0]),
      width: 1,
      height: 1,
      channels: 4,
      bitDepth: 8,
    });

    expect(transparent.nonBlankSamples).toBe(0);
  });

  it("rejects unsupported or truncated screenshot buffers", () => {
    expect(() => fingerprintStudioCompositedPixels({
      data: Uint8Array.of(0, 0),
      width: 1,
      height: 1,
      channels: 2,
      bitDepth: 8,
    })).toThrow("unsupported composited document channel count");
    expect(() => fingerprintStudioCompositedPixels({
      data: Uint8Array.of(0, 0, 0),
      width: 2,
      height: 1,
      channels: 3,
      bitDepth: 8,
    })).toThrow("composited document pixel buffer is truncated");
  });
});
