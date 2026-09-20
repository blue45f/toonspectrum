import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { renderStudioBg3dLtLayers } from "./studio-bg3d-lt-render";
import { createStudioBg3dTilePlan } from "./studio-bg3d-tile-plan";
import { StudioBg3dTiledArtifactProcessor } from "./studio-bg3d-tiled-artifact-processor";
import { StudioBg3dStreamingPng } from "./studio-bg3d-streaming-png";
import type { StudioBg3dCapturedRaster } from "./studio-bg3d-capture-adapter";
import type { StudioBg3dRasterWindow } from "./studio-bg3d-tile-plan";
import type { StudioBg3dToneOutputSettings } from "./studio-bg3d-scene-document";

function fixture(width: number, height: number): StudioBg3dCapturedRaster {
  const rgba = new Uint8Array(width * height * 4);
  const depth = new Float32Array(width * height);
  const normalRgba = new Uint8Array(rgba.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const off = p * 4;
      const visible = x > 3 && x < width - 5 && y > 2 && y < height - 3;
      rgba.set(
        [
          x % 2 ? 210 : 50,
          y % 3 ? 220 : 40,
          (x + y) % 2 ? 240 : 0,
          visible ? 255 : 0,
        ],
        off,
      );
      depth[p] = visible ? (x < width / 2 ? 0.35 : 0.4) : 1;
      normalRgba.set(
        visible
          ? x < width / 2
            ? [128, 128, 255, 255]
            : [255, 128, 128, 255]
          : [0, 0, 0, 0],
        off,
      );
    }
  return { width, height, rgba, depth, normalRgba };
}
function cut(
  full: StudioBg3dCapturedRaster,
  rect: StudioBg3dRasterWindow,
): StudioBg3dCapturedRaster {
  const rgba = new Uint8Array(rect.width * rect.height * 4),
    depth = new Float32Array(rect.width * rect.height),
    normalRgba = new Uint8Array(rgba.length);
  for (let y = 0; y < rect.height; y++) {
    const from = (rect.y + y) * full.width + rect.x;
    rgba.set(
      full.rgba.subarray(from * 4, (from + rect.width) * 4),
      y * rect.width * 4,
    );
    depth.set(full.depth!.subarray(from, from + rect.width), y * rect.width);
    normalRgba.set(
      full.normalRgba!.subarray(from * 4, (from + rect.width) * 4),
      y * rect.width * 4,
    );
  }
  return { width: rect.width, height: rect.height, rgba, depth, normalRgba };
}
async function decode(png: Blob) {
  const bytes = Buffer.from(await png.arrayBuffer());
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  const payloads: Buffer[] = [];
  let offset = 8;
  let ended = false;
  while (offset < bytes.length) {
    const size = bytes.readUInt32BE(offset),
      type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT")
      payloads.push(bytes.subarray(offset + 8, offset + 8 + size));
    if (type === "IEND") ended = true;
    offset += size + 12;
  }
  expect(ended).toBe(true);
  expect(offset).toBe(bytes.length);
  const raw = inflateSync(Buffer.concat(payloads));
  expect(raw.length).toBe((width * 4 + 1) * height);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const stride = width * 4;
    expect(raw[y * (stride + 1)]).toBe(1);
    for (let x = 0; x < stride; x++)
      rgba[y * stride + x] =
        (raw[y * (stride + 1) + 1 + x]! +
          (x >= 4 ? rgba[y * stride + x - 4]! : 0)) &
        255;
  }
  return { width, height, rgba };
}
describe("streaming row PNG", () => {
  it("encodes top-down RGBA across independent bands with correct straight alpha", async () => {
    const input = fixture(51, 37);
    const writer = new StudioBg3dStreamingPng(51, 37);
    await writer.appendRows(input.rgba.subarray(0, 51 * 4 * 13), 13);
    await writer.appendRows(input.rgba.subarray(51 * 4 * 13), 24);
    const output = await decode(await writer.finish());
    expect(output.rgba).toEqual(input.rgba);
  });
  it("rejects incomplete, invalid and closed row streams", async () => {
    const writer = new StudioBg3dStreamingPng(17, 19);
    await expect(writer.finish()).rejects.toThrow("incomplete");
    await expect(writer.appendRows(new Uint8Array(5), 1)).rejects.toThrow();
    await writer.abort();
    await expect(writer.appendRows(new Uint8Array(17 * 4), 1)).rejects.toThrow(
      "closed",
    );
  });
  it("fails on compressed output budget instead of returning partial PNG", async () => {
    const writer = new StudioBg3dStreamingPng(97, 83, 128);
    const input = fixture(97, 83);
    try {
      await writer.appendRows(input.rgba, 83);
      await expect(writer.finish()).rejects.toThrow("budget");
    } catch (error) {
      expect(String(error)).toContain("budget");
    } finally {
      await writer.abort();
    }
  });
});
describe("guarded global-coordinate line/tone tiles", () => {
  it.each(["dot", "line", "crosshatch", "noise"] as const)(
    "matches full-frame %s patterns, crease and texture lines across boundaries",
    async (pattern) => {
      const full = fixture(139, 107);
      const doc = createDefaultStudioBg3dSceneDocument();
      const settings = {
        line: {
          ...doc.output.line,
          enabled: true,
          depthEnabled: true,
          depthOutlineOnly: false,
          creaseAngleDegrees: 35,
          widthPx: 8,
          smoothing: 1,
          textureLineEnabled: true,
          textureLineStrength: 1,
          scaleAwareAccuracy: true,
        },
        tone: {
          ...doc.output.tone,
          mode: "screentone" as const,
          type: "pattern" as const,
          pattern,
          opacity: 0.9,
          angleDegrees: 37,
        },
      };
      const reference = renderStudioBg3dLtLayers(full, settings);
      const processor = new StudioBg3dTiledArtifactProcessor({
        width: full.width,
        height: full.height,
        tileWidth: 47,
        bandHeight: 31,
        passes: ["main-line", "texture-line", "tone"],
        settings,
      });
      for (const tile of processor.plan.tiles)
        await processor.append(tile.index, cut(full, tile.capture));
      const results = await processor.finish();
      expect(results.images).toHaveLength(3);
      for (const image of results.images) {
        const decoded = await decode(image.png),
          expected = reference.layers.find(
            (layer) => layer.role === image.pass,
          )!;
        let maximum = 0;
        for (let i = 0; i < decoded.rgba.length; i++)
          maximum = Math.max(
            maximum,
            Math.abs(decoded.rgba[i]! - expected.data[i]!),
          );
        expect(maximum, image.pass).toBeLessThanOrEqual(1);
      }
    },
  );
  it("honors whole-frame scale-aware thresholds even for small processing tiles", () => {
    const full = fixture(331, 103);
    const doc = createDefaultStudioBg3dSceneDocument();
    const settings = {
      line: { ...doc.output.line, enabled: true, scaleAwareAccuracy: true },
      tone: doc.output.tone,
    };
    const reference = renderStudioBg3dLtLayers(full, settings);
    for (const tile of createStudioBg3dTilePlan({
      width: 331,
      height: 103,
      tileWidth: 31,
      bandHeight: 31,
    }).tiles) {
      const local = renderStudioBg3dLtLayers(
        { ...cut(full, tile.capture), window: tile.capture },
        settings,
      );
      for (const layer of local.layers) {
        const expected = reference.layers.find((l) => l.role === layer.role);
        if (!expected) continue;
        for (let y = 0; y < tile.core.height; y++)
          for (let x = 0; x < tile.core.width; x++) {
            const target = ((y + tile.core.y) * 331 + tile.core.x + x) * 4;
            const source =
              ((y + tile.core.y - tile.capture.y) * tile.capture.width +
                tile.core.x -
                tile.capture.x +
                x) *
              4;
            expect(
              Math.abs(layer.data[source + 3]! - expected.data[target + 3]!),
            ).toBeLessThanOrEqual(1);
          }
      }
    }
  });
  it("rejects out-of-order/replayed tiles and refuses early finish", async () => {
    const processor = new StudioBg3dTiledArtifactProcessor({
      width: 51,
      height: 47,
      tileWidth: 31,
      bandHeight: 31,
      passes: ["beauty"],
      settings: {
        line: createDefaultStudioBg3dSceneDocument().output.line,
        tone: createDefaultStudioBg3dSceneDocument().output.tone,
      },
    });
    await expect(processor.finish()).rejects.toThrow("incomplete");
    await expect(processor.append(1, fixture(1, 1))).rejects.toThrow(
      "Unexpected",
    );
    await processor.abort();
    await expect(processor.append(0, fixture(1, 1))).rejects.toThrow();
  });
  it("reports disabled passes without inventing nonempty layers", async () => {
    const doc = createDefaultStudioBg3dSceneDocument();
    const processor = new StudioBg3dTiledArtifactProcessor({
      width: 17,
      height: 17,
      passes: ["beauty", "tone", "main-line"],
      settings: {
        line: { ...doc.output.line, enabled: false },
        tone: {
          ...doc.output.tone,
          mode: "none" as StudioBg3dToneOutputSettings["mode"],
        },
      },
    });
    await processor.append(0, fixture(17, 17));
    const output = await processor.finish();
    expect(output.images.map((x) => x.pass)).toEqual(["beauty"]);
    expect(output.skipped).toEqual([
      { pass: "tone", reason: "disabled" },
      { pass: "main-line", reason: "disabled" },
    ]);
  });
});
