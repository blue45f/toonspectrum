import { describe, expect, it } from "vitest";

import {
  UnknownAssetCapabilityError,
  assertAssetCapabilitiesKnown,
  assetMetadataIRSchema,
  computeAssetContentDigest,
  computeAssetStructuredDigest,
  parseAssetMetadata,
  sceneFeatureCapabilityVocabulary,
} from "../ir/asset-metadata";
import { canonicalJson } from "../ir/digest";
import { sceneIRSchema } from "../ir/scene";
import { collectSceneFeatures } from "../ir/scene-features";

import type { AssetMetadataIR } from "../ir/asset-metadata";

function validMetadata(overrides: Partial<AssetMetadataIR> = {}): AssetMetadataIR {
  return assetMetadataIRSchema.parse({
    id: "asset-ink-01",
    kind: "brush-program",
    name: "잉크 크리스프",
    version: "1.2.0",
    engineRequirements: ["brush.natural-media.myb", "stroke.geometry.pressure-outline"],
    sourceFormat: "myb",
    license: { spdx: "CC0-1.0", attribution: "ToonSpectrum corpus" },
    contentDigest: computeAssetContentDigest("payload"),
    createdAt: 1_754_000_000_000,
    provenance: {
      importer: "studio-format-gateway/importMybBrush",
      sourceFileName: "ink-crisp.myb",
      importedAt: 1_754_000_000_000,
      warnings: [],
      unmapped: ["hardness"],
    },
    ...overrides,
  });
}

describe("assetMetadataIRSchema", () => {
  it("round-trips a full card and stays canonical-JSON stable", () => {
    const metadata = validMetadata();
    const reparsed = assetMetadataIRSchema.parse(
      JSON.parse(canonicalJson(metadata)),
    );
    expect(reparsed).toEqual(metadata);
    expect(canonicalJson(reparsed)).toBe(canonicalJson(metadata));
  });

  it("fills provenance defaults without inventing data", () => {
    const metadata = assetMetadataIRSchema.parse({
      ...validMetadata(),
      engineRequirements: undefined,
      provenance: {
        importer: "studio-format-gateway/parseSvgToScene",
        importedAt: 0,
      },
    });
    expect(metadata.engineRequirements).toEqual([]);
    expect(metadata.provenance.sourceFileName).toBeNull();
    expect(metadata.provenance.warnings).toEqual([]);
    expect(metadata.provenance.unmapped).toEqual([]);
  });

  it("rejects non-namespaced capability tokens at the schema layer", () => {
    for (const bad of ["RenderVectorFill", "render", "render.", ".vector"]) {
      expect(() =>
        assetMetadataIRSchema.parse({ ...validMetadata(), engineRequirements: [bad] }),
      ).toThrow(/capability must be namespaced/);
    }
  });

  it("rejects malformed content digests and non-semver versions", () => {
    expect(() =>
      assetMetadataIRSchema.parse({ ...validMetadata(), contentDigest: "abc123" }),
    ).toThrow(/fnv1a64/);
    expect(() =>
      assetMetadataIRSchema.parse({
        ...validMetadata(),
        contentDigest: "fnv1a64:XYZ",
      }),
    ).toThrow(/fnv1a64/);
    expect(() =>
      assetMetadataIRSchema.parse({ ...validMetadata(), version: "v1" }),
    ).toThrow(/semver/);
    expect(assetMetadataIRSchema.parse({ ...validMetadata(), version: "2.0.0-rc.1" }).version).toBe(
      "2.0.0-rc.1",
    );
  });
});

describe("capability vocabulary gate", () => {
  const vocabulary = new Set([
    "brush.natural-media.myb",
    "stroke.geometry.pressure-outline",
  ]);

  it("accepts metadata whose tokens are all known", () => {
    expect(() => assertAssetCapabilitiesKnown(validMetadata(), vocabulary)).not.toThrow();
    expect(parseAssetMetadata(validMetadata(), vocabulary).id).toBe("asset-ink-01");
  });

  it("rejects unknown tokens loudly, naming every offender once", () => {
    const metadata = validMetadata({
      engineRequirements: [
        "brush.natural-media.myb",
        "render.hologram.field",
        "render.hologram.field",
        "audio.stem.split",
      ],
    });
    let caught: unknown;
    try {
      assertAssetCapabilitiesKnown(metadata, vocabulary);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnknownAssetCapabilityError);
    const error = caught as UnknownAssetCapabilityError;
    expect(error.assetId).toBe("asset-ink-01");
    expect(error.unknownTokens).toEqual(["audio.stem.split", "render.hologram.field"]);
    expect(error.message).toContain("render.hologram.field");
  });
});

describe("computeAssetContentDigest", () => {
  it("is deterministic and byte-sensitive", () => {
    const bytes = new TextEncoder().encode('{"version":3}');
    const digest = computeAssetContentDigest(bytes);
    expect(digest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(computeAssetContentDigest(bytes)).toBe(digest);
    // Same content as a string digests identically to its UTF-8 bytes.
    expect(computeAssetContentDigest('{"version":3}')).toBe(digest);
    const flipped = new Uint8Array(bytes);
    flipped[0] ^= 0xff;
    expect(computeAssetContentDigest(flipped)).not.toBe(digest);
  });

  it("digests structured values independent of key order", () => {
    const a = computeAssetStructuredDigest({ b: 1, a: [2, 3] });
    const b = computeAssetStructuredDigest({ a: [2, 3], b: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(computeAssetStructuredDigest({ a: [2, 3], b: 2 })).not.toBe(a);
  });
});

describe("sceneFeatureCapabilityVocabulary", () => {
  it("covers every token collectSceneFeatures can emit for a rich scene", () => {
    const scene = sceneIRSchema.parse({
      version: 11,
      width: 64,
      height: 64,
      background: { r: 0, g: 0, b: 0, a: 0 },
      nodes: [
        {
          kind: "group",
          id: "g",
          opacity: 0.5,
          blend: "multiply",
          clip: { verbs: [{ v: "M", x: 0, y: 0 }, { v: "L", x: 1, y: 0 }, { v: "Z" }] },
          children: [
            {
              kind: "fill-path",
              id: "f",
              blend: "screen",
              path: { verbs: [{ v: "M", x: 0, y: 0 }, { v: "L", x: 1, y: 1 }, { v: "Z" }] },
              paint: {
                kind: "sweep-gradient",
                center: [0, 0],
                startAngleDeg: 0,
                endAngleDeg: 360,
                stops: [
                  { offset: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
                  { offset: 1, color: { r: 1, g: 1, b: 1, a: 1 } },
                ],
              },
            },
            {
              kind: "text",
              id: "t",
              x: 0,
              y: 0,
              text: "톤",
              fontSizePx: 12,
              color: { r: 0, g: 0, b: 0, a: 1 },
            },
          ],
        },
      ],
    });
    const vocabulary = new Set(sceneFeatureCapabilityVocabulary());
    for (const feature of collectSceneFeatures(scene)) {
      expect(vocabulary.has(feature)).toBe(true);
    }
    // Blend tokens track the blend enum (src-over is the identity, excluded).
    expect(vocabulary.has("render.blend.multiply")).toBe(true);
    expect(vocabulary.has("render.blend.src-over")).toBe(false);
  });
});
