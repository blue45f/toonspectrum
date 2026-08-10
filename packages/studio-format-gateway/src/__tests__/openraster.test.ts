import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  buildFormatZipFixture,
  inflateFixtureRaw,
  type ZipFixtureEntry,
} from "../../../../tests/corpus/formats/krita-bundle-fixtures";
import {
  exportPreservedOpenRaster,
  importOpenRaster,
  OpenRasterError,
  openRasterSha256Hex,
  type OpenRasterImportResult,
} from "../openraster";

const encoder = new TextEncoder();

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(...parts: readonly Uint8Array[]): number {
  let value = 0xffff_ffff;
  for (const bytes of parts) {
    for (const byte of bytes) {
      value = (CRC32_TABLE[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
    }
  }
  return (value ^ 0xffff_ffff) >>> 0;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function pngChunk(type: string, data: Uint8Array, corruptCrc = false): Uint8Array {
  const typeBytes = encoder.encode(type);
  const output = new Uint8Array(12 + data.byteLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.byteLength, false);
  output.set(typeBytes, 4);
  output.set(data, 8);
  view.setUint32(8 + data.byteLength, corruptCrc ? 0 : crc32(typeBytes, data), false);
  return output;
}

function authoredPng(
  width: number,
  height: number,
  options: {
    corruptHeaderCrc?: boolean;
    includeIccProfile?: boolean;
    interlace?: 0 | 1;
  } = {},
): Uint8Array {
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width, false);
  headerView.setUint32(4, height, false);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = options.interlace ?? 0;
  const scanlineBytes = width * 4 + 1;
  const pixels = new Uint8Array(scanlineBytes * height);
  for (let row = 0; row < height; row += 1) {
    pixels[row * scanlineBytes] = 0;
    for (let offset = row * scanlineBytes + 1; offset < (row + 1) * scanlineBytes; offset += 4) {
      pixels[offset] = 0x22;
      pixels[offset + 1] = 0x66;
      pixels[offset + 2] = 0xaa;
      pixels[offset + 3] = 0xff;
    }
  }
  const chunks = [
    pngChunk("IHDR", header, options.corruptHeaderCrc),
    ...(options.includeIccProfile
      ? [pngChunk("iCCP", concat([encoder.encode("Authored profile"), Uint8Array.from([0, 0, 1, 2, 3])]))]
      : []),
    pngChunk("IDAT", new Uint8Array(deflateSync(pixels))),
    pngChunk("IEND", new Uint8Array()),
  ];
  return concat([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}

const nestedStackXml = `<?xml version="1.0" encoding="UTF-8"?>
<image version="0.0.6" w="32" h="24" xres="300" yres="240">
  <stack>
    <layer name="Top &amp; Ink" src="data/top.png" x="-7" y="12" opacity="0.625" visibility="hidden" composite-op="svg:multiply" selected="true"/>
    <stack name="Colours" opacity="0.8" visibility="visible" composite-op="svg:screen" isolation="auto">
      <layer name="Fill" src="data/fill.png"/>
    </stack>
    <layer name="Bottom" src="data/bottom.png"/>
  </stack>
</image>`;

interface OraFixtureOptions {
  stackXml?: string;
  includeMimetype?: boolean;
  includeStack?: boolean;
  includeMerged?: boolean;
  includeThumbnail?: boolean;
  mimetypeData?: Uint8Array;
  mimetypeMethod?: 0 | 8;
  mimetypeFirst?: boolean;
  layers?: readonly ZipFixtureEntry[];
  extras?: readonly ZipFixtureEntry[];
}

function buildOra(options: OraFixtureOptions = {}): Uint8Array {
  const mimetype: ZipFixtureEntry = {
    path: "mimetype",
    data: options.mimetypeData ?? encoder.encode("image/openraster"),
    method: options.mimetypeMethod ?? 0,
  };
  const stack: ZipFixtureEntry = {
    path: "stack.xml",
    data: encoder.encode(options.stackXml ?? nestedStackXml),
    method: 8,
  };
  const entries: ZipFixtureEntry[] = [];
  if (options.mimetypeFirst === false && options.includeStack !== false) entries.push(stack);
  if (options.includeMimetype !== false) entries.push(mimetype);
  if (options.mimetypeFirst !== false && options.includeStack !== false) entries.push(stack);
  if (options.includeMerged !== false) {
    entries.push({ path: "mergedimage.png", data: authoredPng(32, 24), method: 8 });
  }
  if (options.includeThumbnail !== false) {
    entries.push({ path: "Thumbnails/thumbnail.png", data: authoredPng(16, 12) });
  }
  entries.push(
    ...(options.layers ?? [
      { path: "data/top.png", data: authoredPng(8, 6), method: 8 },
      { path: "data/fill.png", data: authoredPng(12, 9) },
      { path: "data/bottom.png", data: authoredPng(32, 24), method: 8 },
    ]),
    ...(options.extras ?? []),
  );
  return buildFormatZipFixture(entries);
}

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected promise to reject");
  } catch (error) {
    return error;
  }
}

function issueCodes(result: OpenRasterImportResult): string[] {
  return [...result.warnings, ...result.unsupported].map((entry) => entry.code);
}

describe("OpenRaster preserve-first importer", () => {
  it("preserves hierarchy, top-to-bottom order, layer attributes, and raw PNG identities", async () => {
    const bytes = buildOra();
    const result = await importOpenRaster(bytes, { inflateRaw: inflateFixtureRaw });

    expect(result.format).toBe("openraster");
    expect(result.image).toMatchObject({
      version: "0.0.6",
      width: 32,
      height: 24,
      xResolutionPpi: 300,
      yResolutionPpi: 240,
    });
    expect(result.image.root.children.map((node) => [node.kind, node.name, node.order])).toEqual([
      ["layer", "Top & Ink", 0],
      ["stack", "Colours", 1],
      ["layer", "Bottom", 2],
    ]);
    const top = result.image.root.children[0];
    expect(top).toMatchObject({
      kind: "layer",
      id: "0.0",
      x: -7,
      y: 12,
      opacity: 0.625,
      visibility: "hidden",
      compositeOp: "svg:multiply",
      compositeOpSupported: true,
      selected: true,
      resourceStatus: "available",
    });
    const group = result.image.root.children[1];
    expect(group).toMatchObject({ kind: "stack", isolation: "auto", compositeOp: "svg:screen" });
    if (group?.kind !== "stack") throw new Error("expected group");
    expect(group.children).toHaveLength(1);
    expect(group.children[0]).toMatchObject({ kind: "layer", name: "Fill", id: "0.1.0" });

    const layerBytes = authoredPng(8, 6);
    const topPng = result.pngResources.find((resource) => resource.path === "data/top.png");
    expect(topPng).toMatchObject({
      role: "layer",
      decoded: false,
      validation: "png-container-structure-only",
      structurallyValid: true,
      dimensions: { width: 8, height: 6 },
      bitDepth: 8,
      colorType: 6,
    });
    expect(Buffer.from(topPng?.base64 ?? "", "base64")).toEqual(Buffer.from(layerBytes));
    expect(topPng?.sha256).toBe(createHash("sha256").update(layerBytes).digest("hex"));
    expect(result.warnings).toEqual([]);
    expect(result.unsupported).toEqual([]);
  });

  it("is deterministic and exports the authenticated original archive byte-for-byte", async () => {
    const bytes = buildOra();
    const first = await importOpenRaster(bytes, { inflateRaw: inflateFixtureRaw });
    const second = await importOpenRaster(bytes, { inflateRaw: inflateFixtureRaw });
    expect(second).toEqual(first);
    expect(first.preservation).toMatchObject({
      schemaVersion: 1,
      contract: "source-archive-byte-for-byte",
      canSerializeSemanticEdits: false,
      exportBehavior: "returns-authenticated-original-archive",
    });
    expect(first.sourceArchive.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(exportPreservedOpenRaster(first)).toEqual(bytes);

    // Parsed-object edits are intentionally not claimed as serialized in P0.
    const semanticallyEdited: OpenRasterImportResult = {
      ...first,
      image: {
        ...first.image,
        attributes: { ...first.image.attributes, future: "semantic edit" },
      },
    };
    expect(exportPreservedOpenRaster(semanticallyEdited)).toEqual(bytes);
  });

  it("authenticates preservation receipts before exporting", async () => {
    const imported = await importOpenRaster(buildOra(), { inflateRaw: inflateFixtureRaw });
    const tampered: OpenRasterImportResult = {
      ...imported,
      sourceArchive: { ...imported.sourceArchive, base64: "AAAA" },
    };
    expect(() => exportPreservedOpenRaster(tampered)).toThrowError(
      expect.objectContaining({ code: "preservation-invalid" }),
    );
  });

  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["message digest", "f7846f55cf23e14eebeab5b4e1550cad5b509e3348fbc4efa3a1413d393cb650"],
  ])("matches the SHA-256 reference vector for %j", (text, expected) => {
    expect(openRasterSha256Hex(encoder.encode(text))).toBe(expected);
  });

  it("surfaces absent viewing-baseline images without claiming a complete import", async () => {
    const result = await importOpenRaster(
      buildOra({ includeMerged: false, includeThumbnail: false }),
      { inflateRaw: inflateFixtureRaw },
    );
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining(["merged-image-missing", "thumbnail-missing"]),
    );
  });

  it("requires mimetype and stack.xml", async () => {
    const missingMime = await capture(
      importOpenRaster(buildOra({ includeMimetype: false }), { inflateRaw: inflateFixtureRaw }),
    );
    expect(missingMime).toMatchObject({ code: "mimetype-missing" });
    const missingStack = await capture(
      importOpenRaster(buildOra({ includeStack: false }), { inflateRaw: inflateFixtureRaw }),
    );
    expect(missingStack).toMatchObject({ code: "stack-missing" });
  });

  it.each([
    ["wrong payload", { mimetypeData: encoder.encode("image/png") }],
    ["not first", { mimetypeFirst: false }],
    ["compressed", { mimetypeMethod: 8 as const }],
  ])("rejects a mimetype that is %s", async (_label, fixtureOptions) => {
    const error = await capture(
      importOpenRaster(buildOra(fixtureOptions), { inflateRaw: inflateFixtureRaw }),
    );
    expect(error).toBeInstanceOf(OpenRasterError);
    expect(error).toMatchObject({ code: "mimetype-invalid" });
  });

  it.each([
    ["malformed", '<image version="0.0.6" w="1" h="1"><stack><layer></stack></image>'],
    [
      "DOCTYPE/entity",
      '<!DOCTYPE image [<!ENTITY x "boom">]><image version="0.0.6" w="1" h="1"><stack><layer name="&x;" src="data/a.png"/></stack></image>',
    ],
  ])("rejects %s stack XML", async (_label, stackXml) => {
    const error = await capture(
      importOpenRaster(buildOra({ stackXml }), { inflateRaw: inflateFixtureRaw }),
    );
    expect(error).toMatchObject({ code: "stack-invalid" });
  });

  it("surfaces missing and unsafe layer src references without dereferencing them", async () => {
    const stackXml = `<image version="0.0.6" w="32" h="24"><stack>
      <layer name="Missing" src="data/not-there.png"/>
      <layer name="Traversal" src="../escape.png"/>
    </stack></image>`;
    const result = await importOpenRaster(buildOra({ stackXml, layers: [] }), {
      inflateRaw: inflateFixtureRaw,
    });
    expect(result.image.root.children).toEqual([
      expect.objectContaining({ name: "Missing", resourceStatus: "missing" }),
      expect.objectContaining({ name: "Traversal", resourceStatus: "invalid-reference" }),
    ]);
    expect(issueCodes(result)).toEqual(expect.arrayContaining(["layer-src-missing", "layer-src-invalid"]));
  });

  it("inventories unsupported blend, mask, text, profile, animation, and unknown entries", async () => {
    const profilePng = authoredPng(8, 6, { includeIccProfile: true });
    const stackXml = `<image version="0.0.6" w="32" h="24" color-profile="DisplayP3"><stack>
      <text name="Caption">Hello</text>
      <mask src="data/mask.png"/>
      <animation fps="24"/>
      <layer name="Paint" src="data/top.png" composite-op="krita:grain-merge" mask-id="m1"/>
    </stack></image>`;
    const result = await importOpenRaster(
      buildOra({
        stackXml,
        layers: [{ path: "data/top.png", data: profilePng }],
        extras: [
          { path: "data/mask.png", data: authoredPng(8, 6) },
          { path: "animation/timeline.json", data: encoder.encode("{}") },
          { path: "profiles/document.icc", data: Uint8Array.from([1, 2, 3]) },
          { path: "future.bin", data: Uint8Array.from([9]) },
        ],
      }),
      { inflateRaw: inflateFixtureRaw },
    );
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining([
        "color-profile-attribute-unsupported",
        "text-element-unsupported",
        "mask-element-unsupported",
        "animation-element-unsupported",
        "composite-op-unsupported",
        "mask-attribute-unsupported",
        "png-color-profile-preserved",
        "mask-entry-unsupported",
        "animation-entry-unsupported",
        "color-profile-entry-unsupported",
        "unknown-entry-preserved",
      ]),
    );
    expect(result.image.root.children).toHaveLength(1);
    expect(result.image.root.children[0]).toMatchObject({
      kind: "layer",
      compositeOp: "krita:grain-merge",
      compositeOpSupported: false,
    });
  });

  it("preserves damaged PNG bytes and dimensions while refusing to mark the layer available", async () => {
    const damaged = authoredPng(8, 6, { corruptHeaderCrc: true });
    const result = await importOpenRaster(
      buildOra({
        stackXml: '<image version="0.0.6" w="32" h="24"><stack><layer src="data/damaged.png"/></stack></image>',
        layers: [{ path: "data/damaged.png", data: damaged }],
      }),
      { inflateRaw: inflateFixtureRaw },
    );
    const resource = result.pngResources.find((candidate) => candidate.path === "data/damaged.png");
    expect(resource).toMatchObject({
      structurallyValid: false,
      dimensions: { width: 8, height: 6 },
      decoded: false,
    });
    expect(resource?.errors).toContain("PNG chunk IHDR CRC mismatch");
    expect(Buffer.from(resource?.base64 ?? "", "base64")).toEqual(Buffer.from(damaged));
    expect(result.image.root.children[0]).toMatchObject({ resourceStatus: "damaged" });
    expect(issueCodes(result)).toEqual(
      expect.arrayContaining(["layer-png-damaged", "png-structurally-invalid"]),
    );
  });

  it("fails closed on archive path traversal and duplicate paths", async () => {
    const traversal = buildFormatZipFixture([
      { path: "../escape", data: Uint8Array.from([1]) },
    ]);
    expect(await capture(importOpenRaster(traversal))).toMatchObject({ code: "archive-invalid" });

    const duplicate = buildFormatZipFixture([
      { path: "mimetype", data: encoder.encode("image/openraster") },
      { path: "stack.xml", data: encoder.encode(nestedStackXml) },
      { path: "stack.xml", data: encoder.encode(nestedStackXml) },
    ]);
    expect(await capture(importOpenRaster(duplicate))).toMatchObject({ code: "archive-invalid" });
  });

  it("fails closed on decompression bombs and CRC mismatches", async () => {
    const bomb = buildFormatZipFixture([
      { path: "mimetype", data: encoder.encode("image/openraster") },
      {
        path: "stack.xml",
        data: encoder.encode("<image/>"),
        method: 8,
        declaredUncompressedBytes: 10_000_000,
      },
    ]);
    expect(await capture(importOpenRaster(bomb, { inflateRaw: inflateFixtureRaw }))).toMatchObject({
      code: "archive-invalid",
    });

    const badCrc = buildOra({
      layers: [{ path: "data/top.png", data: authoredPng(8, 6), declaredCrc32: 0 }],
    });
    expect(await capture(importOpenRaster(badCrc, { inflateRaw: inflateFixtureRaw }))).toMatchObject({
      code: "archive-invalid",
    });
  });

  it("rejects truncation at local, central-directory, and EOCD boundaries", async () => {
    const valid = buildOra();
    for (const cut of [0, 1, 8, 30, Math.floor(valid.byteLength / 2), valid.byteLength - 1]) {
      const error = await capture(
        importOpenRaster(valid.slice(0, cut), { inflateRaw: inflateFixtureRaw }),
      );
      expect(error, `cut ${cut}`).toMatchObject({ code: "archive-invalid" });
    }
  });

  it("enforces lowered archive, entry-count, and stack.xml size limits", async () => {
    const valid = buildOra();
    expect(
      await capture(
        importOpenRaster(valid, {
          inflateRaw: inflateFixtureRaw,
          limits: { maxArchiveBytes: valid.byteLength - 1 },
        }),
      ),
    ).toMatchObject({ code: "source-too-large" });
    expect(
      await capture(
        importOpenRaster(valid, { inflateRaw: inflateFixtureRaw, limits: { maxEntries: 2 } }),
      ),
    ).toMatchObject({ code: "archive-invalid" });
    expect(
      await capture(
        importOpenRaster(valid, { inflateRaw: inflateFixtureRaw, limits: { maxStackXmlBytes: 8 } }),
      ),
    ).toMatchObject({ code: "stack-invalid" });
  });
});
