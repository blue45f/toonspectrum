
import {
  UnsupportedSceneFeatureError,
  polylineToPath,
  solidPaint,
} from "@toonspectrum/project-model-v11";
import { providerDescriptorSchema } from "@toonspectrum/provider-catalog-v11";
import { beforeAll, describe, expect, it } from "vitest";

import { velloCpuProviderDescriptor } from "../descriptor";
import { loadVelloNode } from "../node";
import { adapterVersion, renderSceneToPixels } from "../render";

import type { SceneIR } from "@toonspectrum/project-model-v11";

function squareScene(): SceneIR {
  return {
    version: 11,
    width: 32,
    height: 32,
    background: { r: 1, g: 1, b: 1, a: 1 },
    nodes: [
      {
        id: "sq",
        kind: "fill-path",
        path: polylineToPath(
          [
            [8, 8],
            [24, 8],
            [24, 24],
            [8, 24],
          ],
          true,
        ),
        paint: solidPaint(1, 0, 0),
        opacity: 1,
        blend: "src-over",
        fillRule: "nonzero",
      },
    ],
  };
}

function pixelAt(pixels: Uint8Array, width: number, x: number, y: number): number[] {
  const offset = (y * width + x) * 4;
  return [...pixels.slice(offset, offset + 4)];
}

beforeAll(async () => {
  await loadVelloNode();
});

describe("vello-cpu adapter (wasm)", () => {
  it("reports its pinned version", () => {
    expect(adapterVersion()).toContain("vello_cpu 0.2");
  });

  it("renders a solid square onto the background", () => {
    const pixels = renderSceneToPixels(squareScene());
    expect(pixels).toHaveLength(32 * 32 * 4);
    expect(pixelAt(pixels, 32, 16, 16)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(pixels, 32, 2, 2)).toEqual([255, 255, 255, 255]);
  });

  it("is bit-deterministic across renders (descriptor claim)", () => {
    const first = renderSceneToPixels(squareScene());
    const second = renderSceneToPixels(squareScene());
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    expect(velloCpuProviderDescriptor.determinism).toBe("bit-exact");
  });

  it("rejects text scenes with UnsupportedSceneFeatureError (no silent skip)", () => {
    const scene = squareScene();
    scene.nodes.push({
      id: "t",
      kind: "text",
      opacity: 1,
      blend: "src-over",
      x: 2,
      y: 20,
      text: "말풍선",
      fontSizePx: 10,
      color: { r: 0, g: 0, b: 0, a: 1 },
      fontFamily: "sans-serif",
    });
    let caught: unknown;
    try {
      renderSceneToPixels(scene);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnsupportedSceneFeatureError);
    expect((caught as UnsupportedSceneFeatureError).features).toEqual([
      "render.text.paragraph",
    ]);
  });

  it("descriptor passes schema validation and declares the CanvasKit fallback", () => {
    const parsed = providerDescriptorSchema.parse(velloCpuProviderDescriptor);
    expect(parsed.fallbackProviderId).toBe("skia-canvaskit");
    expect(parsed.capabilities).toContain("export.deterministic");
  });
});
