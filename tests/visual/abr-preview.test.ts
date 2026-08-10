import { encodeRgbaToPng } from "@toonspectrum/studio-engine-skia";
import { loadCanvasKitNode } from "@toonspectrum/studio-engine-skia/node";
import { beforeAll, describe, expect, it } from "vitest";

import {
  decodeAbrPreviewBrushes,
  renderAbrStrokePreview,
} from "../../packages/studio-format-gateway/src/abr-preview";
import {
  buildComputedAbr,
  buildSampledAbr,
  radialTipAlpha,
} from "../corpus/brushes/abr/synthetic-abr";

import type { AbrStrokePreviewResult } from "../../packages/studio-format-gateway/src/abr-preview";
import type { CanvasKit } from "canvaskit-wasm";

/**
 * ABR preview lane real-render gate: stroke previews stamped from synthetic
 * v1/v2 fixtures must survive the verified engine's PNG codec — non-empty
 * ink, a valid PNG signature, and deterministic bytes end to end.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Pixels whose RGB differs from the white background by more than 8/255. */
function inkCoverage(pixels: Uint8Array): number {
  let ink = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (
      Math.abs((pixels[index] ?? 255) - 255) > 8 ||
      Math.abs((pixels[index + 1] ?? 255) - 255) > 8 ||
      Math.abs((pixels[index + 2] ?? 255) - 255) > 8
    ) {
      ink += 1;
    }
  }
  return ink;
}

function renderOnlyBrush(bytes: Uint8Array): AbrStrokePreviewResult {
  const decoded = decodeAbrPreviewBrushes(bytes);
  const brush = decoded.brushes[0];
  if (brush === undefined) {
    throw new Error("ABR preview fixture decoded to no brushes");
  }
  return renderAbrStrokePreview(brush, { inheritedWarnings: decoded.warnings });
}

let ck: CanvasKit;

beforeAll(async () => {
  ck = await loadCanvasKitNode();
});

describe("ABR stroke preview PNG lane (CanvasKit codec)", () => {
  const workloads: Array<{ name: string; bytes: Uint8Array }> = [
    {
      name: "v2-computed-oval",
      bytes: buildComputedAbr({
        version: 2,
        name: "Preview Oval",
        spacingPct: 25,
        angleDeg: 30,
        roundness: 60,
        diameterPx: 28,
      }),
    },
    {
      name: "v1-sampled-radial",
      bytes: buildSampledAbr({
        version: 1,
        compress: 1,
        width: 16,
        height: 12,
        alpha: radialTipAlpha(16, 12),
      }),
    },
  ];

  it("encodes non-empty preview pixels into signed PNG bytes", () => {
    for (const { name, bytes } of workloads) {
      const preview = renderOnlyBrush(bytes);
      expect(preview.warnings, `${name}: fixture should map cleanly`).toEqual([]);
      expect(
        inkCoverage(preview.pixels),
        `${name}: stroke preview deposited no ink`,
      ).toBeGreaterThan(0);
      const png = encodeRgbaToPng(ck, preview.pixels, preview.width, preview.height);
      expect(
        [...png.slice(0, PNG_SIGNATURE.length)],
        `${name}: PNG signature mismatch`,
      ).toEqual(PNG_SIGNATURE);
      expect(png.byteLength, `${name}: implausibly small PNG`).toBeGreaterThan(100);
    }
  });

  it("is deterministic through the codec: two encodes are byte-equal", () => {
    for (const { name, bytes } of workloads) {
      const first = renderOnlyBrush(bytes);
      const second = renderOnlyBrush(bytes);
      const firstPng = encodeRgbaToPng(ck, first.pixels, first.width, first.height);
      const secondPng = encodeRgbaToPng(ck, second.pixels, second.width, second.height);
      expect(
        Buffer.from(firstPng).equals(Buffer.from(secondPng)),
        `${name}: PNG bytes drifted between runs`,
      ).toBe(true);
    }
  });
});
