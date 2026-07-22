import { describe, expect, it } from "vitest";

import {
  buildStudioOpenRasterBlob,
  buildStudioOpenRasterBytes,
  importStudioOpenRaster,
  STUDIO_OPENRASTER_LIMITS,
  STUDIO_OPENRASTER_MIME,
  StudioOpenRasterError,
  type StudioOpenRasterErrorCode,
} from "./studio-openraster-interchange";
import { buildStudioPackageArchiveBytes } from "./studio-package-archive";
import { readStudioZipArchive } from "./studio-zip-reader";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function png(seed: number, width = 1, height = 1): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  bytes[24] = 8;
  bytes[25] = 6;
  bytes[32] = seed;
  return bytes;
}

async function expectOraError(
  promise: Promise<unknown>,
  code: StudioOpenRasterErrorCode,
  path?: string
): Promise<StudioOpenRasterError> {
  let caught: unknown;
  try {
    await promise;
  } catch (cause) {
    caught = cause;
  }
  expect(caught).toBeInstanceOf(StudioOpenRasterError);
  const error = caught as StudioOpenRasterError;
  expect(error.code).toBe(code);
  if (path !== undefined) expect(error.path).toBe(path);
  return error;
}

async function customOra(stackXml: string, overrides?: {
  firstPath?: string;
  includeMerged?: boolean;
  includeThumbnail?: boolean;
  layer?: Uint8Array;
  merged?: Uint8Array;
  thumbnail?: Uint8Array;
}): Promise<Uint8Array> {
  return buildStudioPackageArchiveBytes([
    {
      path: overrides?.firstPath ?? "mimetype",
      data: encoder.encode(STUDIO_OPENRASTER_MIME),
    },
    { path: "stack.xml", data: encoder.encode(stackXml) },
    ...(overrides?.includeMerged === false
      ? []
      : [{ path: "mergedimage.png", data: overrides?.merged ?? png(1) }]),
    ...(overrides?.includeThumbnail === false
      ? []
      : [{ path: "Thumbnails/thumbnail.png", data: overrides?.thumbnail ?? png(2) }]),
    { path: "data/layer.png", data: overrides?.layer ?? png(3) },
  ]);
}

describe("OpenRaster interchange", () => {
  it("exports deterministic ORA entry order and round-trips layer semantics", async () => {
    const input = {
      width: 800,
      height: 1_200,
      name: "Episode & <One>",
      mergedImage: png(10),
      thumbnail: png(11),
      layers: [
        {
          name: "Back & base",
          png: png(12),
          x: -20,
          y: 5,
          opacity: 0.75,
          visible: false,
          blendMode: "multiply" as const,
        },
        {
          name: 'Front "ink"',
          png: png(13),
          x: 12,
          y: -7,
          opacity: 1,
          visible: true,
          blendMode: "normal" as const,
        },
      ],
    };

    const first = await buildStudioOpenRasterBytes(input);
    const second = await buildStudioOpenRasterBytes(input);
    expect(first.warnings).toEqual([]);
    expect([...first.bytes]).toEqual([...second.bytes]);

    const zip = await readStudioZipArchive(first.bytes);
    expect(zip.entries.map((entry) => entry.path)).toEqual([
      "mimetype",
      "stack.xml",
      "mergedimage.png",
      "Thumbnails/thumbnail.png",
      "data/layer0000.png",
      "data/layer0001.png",
    ]);
    expect(zip.entries[0]?.compressionMethod).toBe(0);
    expect(decoder.decode(await zip.readEntry("mimetype"))).toBe(STUDIO_OPENRASTER_MIME);
    const xml = decoder.decode(await zip.readEntry("stack.xml"));
    expect(xml.indexOf("Front &quot;ink&quot;")).toBeLessThan(xml.indexOf("Back &amp; base"));
    expect(xml).toContain('name="Episode &amp; &lt;One&gt;"');

    const imported = await importStudioOpenRaster(first.bytes);
    expect(imported).toMatchObject({ width: 800, height: 1_200, name: "Episode & <One>" });
    expect(imported.layers.map(({ z, name, x, y, opacity, visible, blendMode }) => ({
      z,
      name,
      x,
      y,
      opacity,
      visible,
      blendMode,
    }))).toEqual([
      {
        z: 0,
        name: "Back & base",
        x: -20,
        y: 5,
        opacity: 0.75,
        visible: false,
        blendMode: "multiply",
      },
      {
        z: 1,
        name: 'Front "ink"',
        x: 12,
        y: -7,
        opacity: 1,
        visible: true,
        blendMode: "normal",
      },
    ]);
    expect(imported.layers[0]?.png.type).toBe("image/png");
    expect([...new Uint8Array(await imported.layers[0]!.png.arrayBuffer())]).toEqual([...png(12)]);
    expect(imported.mergedImage.type).toBe("image/png");
    expect(imported.thumbnail.type).toBe("image/png");
  });

  it("builds an image/openraster Blob through the shared ZIP writer", async () => {
    const result = await buildStudioOpenRasterBlob({
      width: 10,
      height: 20,
      layers: [{ name: "Layer", png: png(1) }],
      mergedImage: png(2),
      thumbnail: png(3),
    });

    expect(result.blob.type).toBe(STUDIO_OPENRASTER_MIME);
    const imported = await importStudioOpenRaster(result.blob);
    expect(imported.layers).toHaveLength(1);
  });

  it("warns and safely falls back for unsupported exported blend modes", async () => {
    const result = await buildStudioOpenRasterBytes({
      width: 10,
      height: 10,
      layers: [{ name: "Layer", png: png(1), blendMode: "linear-burn" }],
      mergedImage: png(2),
      thumbnail: png(3),
    });

    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "UNSUPPORTED_BLEND_MODE", layerIndex: 0 }),
    ]);
    const imported = await importStudioOpenRaster(result.bytes);
    expect(imported.layers[0]?.blendMode).toBe("normal");
  });

  it("flattens groups and reports masks, unknown blend modes, and XML elements", async () => {
    const archive = await customOra(`<?xml version="1.0"?>
<image w="10" h="20" name="Grouped">
  <stack>
    <stack name="Characters" opacity="0.8">
      <layer name="Hero" src="data/layer.png" x="2" y="3" opacity="0.5" visibility="visible" composite-op="krita:linear-burn"/>
      <mask src="data/mask.png"/>
      <metadata value="ignored"/>
    </stack>
  </stack>
</image>`);

    const imported = await importStudioOpenRaster(archive);
    expect(imported.layers[0]).toMatchObject({
      name: "Hero",
      x: 2,
      y: 3,
      opacity: 0.5,
      blendMode: "normal",
      sourceCompositeOp: "krita:linear-burn",
    });
    expect(imported.warnings.map((warning) => warning.code)).toEqual([
      "GROUPS_FLATTENED",
      "UNSUPPORTED_BLEND_MODE",
      "MASKS_IGNORED",
      "UNSUPPORTED_XML_ELEMENT",
    ]);
  });

  it("requires first-and-stored mimetype plus all canonical preview entries", async () => {
    const stack = '<image w="10" h="10"><stack><layer src="data/layer.png"/></stack></image>';
    await expectOraError(
      importStudioOpenRaster(await customOra(stack, { firstPath: "not-mimetype" })),
      "MIMETYPE_INVALID"
    );
    await expectOraError(
      importStudioOpenRaster(await customOra(stack, { includeMerged: false })),
      "REQUIRED_ENTRY_MISSING"
    );
    await expectOraError(
      importStudioOpenRaster(await customOra(stack, { includeThumbnail: false })),
      "REQUIRED_ENTRY_MISSING"
    );
  });

  it("rejects malformed XML, DTD/entity declarations, bad PNGs, and missing layer sources", async () => {
    await expectOraError(
      importStudioOpenRaster(
        await customOra('<!DOCTYPE image [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><image w="1" h="1"><stack><layer src="data/layer.png"/></stack></image>')
      ),
      "STACK_XML_INVALID"
    );
    await expectOraError(
      importStudioOpenRaster(
        await customOra('<image w="1" h="1"><stack><layer src="data/layer.png"></stack></image>')
      ),
      "STACK_XML_INVALID"
    );
    await expectOraError(
      importStudioOpenRaster(
        await customOra('<image w="1" h="1"><stack><layer src="data/layer.png"/></stack></image><extra/>')
      ),
      "STACK_XML_INVALID"
    );
    await expectOraError(
      importStudioOpenRaster(
        await customOra('<image w="1" h="1"><stack><layer src="data/layer.png"/></stack></image>', {
          layer: encoder.encode("not png"),
        })
      ),
      "IMAGE_INVALID",
      "data/layer.png"
    );
    await expectOraError(
      importStudioOpenRaster(
        await customOra('<image w="1" h="1"><stack><layer src="data/missing.png"/></stack></image>')
      ),
      "REQUIRED_ENTRY_MISSING"
    );
  });

  it("validates a complete PNG IHDR instead of accepting signature-only image entries", async () => {
    const stack = '<image w="1" h="1"><stack><layer src="data/layer.png"/></stack></image>';
    const signatureOnly = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const incompleteError = await expectOraError(
      importStudioOpenRaster(await customOra(stack, { layer: signatureOnly })),
      "IMAGE_INVALID",
      "data/layer.png"
    );
    expect(incompleteError.message).toContain("IHDR");

    const zeroWidth = png(4);
    new DataView(zeroWidth.buffer).setUint32(16, 0, false);
    const dimensionError = await expectOraError(
      importStudioOpenRaster(await customOra(stack, { merged: zeroWidth })),
      "IMAGE_INVALID",
      "mergedimage.png"
    );
    expect(dimensionError.message).toContain("너비와 높이");

    const wrongFirstChunk = png(5);
    wrongFirstChunk.set([73, 68, 65, 84], 12);
    const chunkError = await expectOraError(
      importStudioOpenRaster(await customOra(stack, { thumbnail: wrongFirstChunk })),
      "IMAGE_INVALID",
      "Thumbnails/thumbnail.png"
    );
    expect(chunkError.message).toContain("첫 chunk");
  });

  it("enforces conservative per-image pixels and cumulative decoded RGBA memory", async () => {
    expect(STUDIO_OPENRASTER_LIMITS.maxDecodedPixelsPerImage).toBe(16_777_216);
    expect(STUDIO_OPENRASTER_LIMITS.maxTotalDecodedRgbaBytes).toBe(128 * 1024 * 1024);

    const stack = '<image w="1" h="1"><stack><layer src="data/layer.png"/></stack></image>';
    const perImageError = await expectOraError(
      importStudioOpenRaster(
        await customOra(stack, { layer: png(1, 4_097, 4_096) })
      ),
      "SIZE_LIMIT",
      "data/layer.png"
    );
    expect(perImageError.message).toContain("16,777,216px");

    const cumulativeError = await expectOraError(
      importStudioOpenRaster(
        await customOra(stack, {
          merged: png(2, 4_096, 4_096),
          thumbnail: png(3, 4_096, 4_096),
          layer: png(4, 4_096, 4_096),
        })
      ),
      "SIZE_LIMIT",
      "data/layer.png"
    );
    expect(cumulativeError.message).toContain("디코딩 RGBA 메모리");
    expect(cumulativeError.message).toContain("134,217,728바이트");
  });

  it("applies decoded image budgets to export inputs before ZIP creation", async () => {
    const input = {
      width: 5,
      height: 5,
      layers: [{ name: "Layer", png: png(1, 5, 5) }],
      mergedImage: png(2, 5, 5),
      thumbnail: png(3, 5, 5),
    };
    await expectOraError(
      buildStudioOpenRasterBytes(input, { limits: { maxDecodedPixelsPerImage: 24 } }),
      "SIZE_LIMIT",
      "data/layer0000.png"
    );
    await expectOraError(
      buildStudioOpenRasterBytes(input, { limits: { maxTotalDecodedRgbaBytes: 299 } }),
      "SIZE_LIMIT",
      "Thumbnails/thumbnail.png"
    );
  });

  it("enforces dimensions, layer count, names, offsets, image bytes, and aborts", async () => {
    const base = {
      width: 10,
      height: 10,
      layers: [{ name: "Layer", png: png(1) }],
      mergedImage: png(2),
      thumbnail: png(3),
    };
    await expectOraError(
      buildStudioOpenRasterBytes({ ...base, width: 0 }),
      "DIMENSION_INVALID"
    );
    await expectOraError(
      buildStudioOpenRasterBytes({ ...base, layers: [] }),
      "LAYER_COUNT_LIMIT"
    );
    await expectOraError(
      buildStudioOpenRasterBytes({
        ...base,
        layers: [{ name: "", png: png(1) }],
      }),
      "LAYER_INVALID"
    );
    await expectOraError(
      buildStudioOpenRasterBytes({
        ...base,
        layers: [{ name: "Layer", png: png(1), x: 2_000_000 }],
      }),
      "LAYER_INVALID"
    );
    await expectOraError(
      buildStudioOpenRasterBytes(base, { limits: { maxLayerBytes: 8 } }),
      "SIZE_LIMIT"
    );

    const controller = new AbortController();
    controller.abort();
    await expectOraError(
      buildStudioOpenRasterBytes(base, { signal: controller.signal }),
      "ABORTED"
    );
  });
});
