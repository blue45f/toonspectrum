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
  it("round-trips a legacy card and stays canonical-JSON stable", () => {
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
      providerRequirements: undefined,
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

  it("lifts a legacy card into the complete V12 contract without inventing evidence", () => {
    const metadata = validMetadata();
    expect(metadata.providerRequirements).toEqual([
      {
        capability: "brush.natural-media.myb",
        providerIds: [],
        versionRange: null,
        optional: false,
        reason: null,
      },
      {
        capability: "stroke.geometry.pressure-outline",
        providerIds: [],
        versionRange: null,
        optional: false,
        reason: null,
      },
    ]);
    expect(metadata.originalBlobRef).toBeNull();
    expect(metadata.normalizedIrRef).toBeNull();
    expect(metadata.rendererVariants).toEqual([]);
    expect(metadata.realStrokePreviews).toEqual([]);
    expect(metadata.deviceProfiles).toEqual([]);
    expect(metadata.visualEquivalenceReport).toBeNull();
    expect(metadata.dependencies).toEqual([]);
    expect(metadata.previewVariants).toEqual({ stable: null, studioMax: null });
    expect(metadata.fallback).toBeNull();
    expect(metadata.replacementCondition).toBeNull();
    expect(metadata.marketplace).toBeNull();
  });

  it("round-trips every V12 AssetPackage field, normalizes order and deep-freezes output", () => {
    const originalDigest = computeAssetContentDigest("payload");
    const normalizedDigest = computeAssetStructuredDigest({ kind: "brush", value: 1 });
    const previewDigest = computeAssetContentDigest("preview");
    const evidenceDigest = computeAssetContentDigest("evidence");
    const normalizedIrRef = {
      digest: normalizedDigest,
      schema: "toonspectrum.brush-program-ir",
      schemaVersion: 11,
      mediaType: "application/vnd.toonspectrum.brush-program+json",
      locator: "opfs://assets/normalized/brush.json",
    };
    const metadata = assetMetadataIRSchema.parse({
      id: "asset-complete",
      kind: "brush-program",
      name: "Complete brush",
      version: "2.1.0",
      engineRequirements: [
        "stroke.geometry.pressure-outline",
        "brush.natural-media.myb",
      ],
      providerRequirements: [
        {
          capability: "stroke.geometry.pressure-outline",
          providerIds: ["perfect-freehand"],
          versionRange: "^1.2.3",
          optional: false,
          reason: "Editable pressure outline.",
        },
        {
          capability: "brush.natural-media.myb",
          providerIds: ["hokusai-natural-media"],
          versionRange: null,
          optional: false,
          reason: "MYB dynamics.",
        },
      ],
      sourceFormat: "myb",
      originalBlobRef: {
        digest: originalDigest,
        byteLength: 7,
        mediaType: "application/json",
        locator: "opfs://assets/original/source.myb",
      },
      normalizedIrRef,
      rendererVariants: [
        {
          id: "studio-max-vello",
          tier: "studio-max",
          providerId: "vello-gpu-browser",
          providerVersion: "0.9.0",
          normalizedIrRef,
          requiredCapabilities: ["stroke.geometry.pressure-outline"],
          qualityStatus: "candidate",
          determinism: "tolerance",
          limitations: ["WebGPU required."],
        },
        {
          id: "stable-hokusai",
          tier: "stable",
          providerId: "hokusai-natural-media",
          providerVersion: "0.3.0",
          normalizedIrRef,
          requiredCapabilities: ["brush.natural-media.myb"],
          qualityStatus: "verified",
          determinism: "bit-exact",
          limitations: [],
        },
      ],
      deviceProfiles: [
        {
          id: "wacom-pro-24",
          name: "Wacom Cintiq Pro 24",
          deviceClass: "pen-display",
          operatingSystem: "macOS 15",
          browser: "Chromium 140",
          inputDevice: "Wacom Pro Pen 2",
          pressureLevels: 8192,
          supportsTilt: true,
          supportsAzimuth: true,
          gpuBackend: "Metal 3",
          devicePixelRatio: 2,
          notes: [],
        },
      ],
      realStrokePreviews: [
        {
          id: "real-stroke-01",
          artifactRef: {
            digest: previewDigest,
            byteLength: 7,
            mediaType: "image/png",
            locator: "opfs://assets/previews/real-stroke-01.png",
          },
          rendererVariantId: "stable-hokusai",
          deviceProfileId: "wacom-pro-24",
          strokeCorpusId: "pressure-zigzag-v1",
          capturedAt: 1_754_000_000_100,
          pressureSampleCount: 128,
          widthPx: 512,
          heightPx: 256,
          notes: [],
        },
      ],
      visualEquivalenceReport: {
        verdict: "equivalent",
        referenceRendererVariantId: "stable-hokusai",
        candidateRendererVariantId: "studio-max-vello",
        corpusId: "brush-golden-v1",
        sampleCount: 128,
        metric: "fuzzy-mismatch-pct",
        threshold: 0.5,
        observed: 0.12,
        measuredAt: 1_754_000_000_200,
        evidenceRef: {
          digest: evidenceDigest,
          byteLength: 8,
          mediaType: "application/json",
          locator: "opfs://assets/evidence/visual.json",
        },
        notes: [],
      },
      license: { spdx: "CC0-1.0", attribution: "ToonSpectrum corpus" },
      contentDigest: originalDigest,
      createdAt: 1_754_000_000_000,
      provenance: {
        importer: "studio-format-gateway/importMybBrush",
        sourceFileName: "complete.myb",
        importedAt: 1_754_000_000_000,
        warnings: [],
        unmapped: [],
      },
      dependencies: [
        {
          id: "tip-library",
          versionRange: "^2.0.0",
          optional: false,
          dependencies: [],
        },
        {
          id: "color-library",
          versionRange: ">=1.0.0 <2.0.0",
          optional: false,
          dependencies: ["tip-library"],
        },
      ],
      previewVariants: {
        stable: {
          status: "available",
          artifactRef: {
            digest: previewDigest,
            byteLength: 7,
            mediaType: "image/png",
            locator: "opfs://assets/previews/stable.png",
          },
          rendererVariantId: "stable-hokusai",
          realStrokePreviewIds: ["real-stroke-01"],
          reason: null,
        },
        studioMax: {
          status: "not-generated",
          artifactRef: null,
          rendererVariantId: "studio-max-vello",
          realStrokePreviewIds: [],
          reason: "Studio Max evidence has not been captured on this device.",
        },
      },
      fallback: {
        strategy: "renderer-variant",
        rendererVariantId: "stable-hokusai",
        providerId: "hokusai-natural-media",
        preservesNormalizedIr: true,
        reason: "Return to the verified stable lane.",
        limitations: [],
      },
      replacementCondition: {
        summary: "Replace only after equal visual and pressure quality.",
        requiredEvidence: [
          "visual-equivalence",
          "pressure-fidelity",
          "real-device-stroke",
        ],
      },
      marketplace: {
        status: "published",
        listingId: "listing-complete",
        publisherId: "publisher-toonspectrum",
        access: "free",
        category: "inking",
        tags: ["myb", "ink"],
        commercialUseAllowed: true,
        attributionRequired: false,
        updatedAt: 1_754_000_000_300,
      },
    });

    const reparsed = assetMetadataIRSchema.parse(JSON.parse(canonicalJson(metadata)));
    expect(reparsed).toEqual(metadata);
    expect(metadata.engineRequirements).toEqual([
      "brush.natural-media.myb",
      "stroke.geometry.pressure-outline",
    ]);
    expect(metadata.rendererVariants.map((variant) => variant.id)).toEqual([
      "stable-hokusai",
      "studio-max-vello",
    ]);
    expect(metadata.dependencies.map((dependency) => dependency.id)).toEqual([
      "color-library",
      "tip-library",
    ]);
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(Object.isFrozen(metadata.rendererVariants)).toBe(true);
    expect(Object.isFrozen(metadata.rendererVariants[0])).toBe(true);
    expect(Object.isFrozen(metadata.previewVariants.stable)).toBe(true);
  });

  it("rejects unknown object fields instead of silently stripping them", () => {
    expect(() =>
      assetMetadataIRSchema.parse({ ...validMetadata(), futureField: true }),
    ).toThrow(/unrecognized/i);
    expect(() =>
      assetMetadataIRSchema.parse({
        ...validMetadata(),
        license: { spdx: "MIT", secretPolicy: "drop-me" },
      }),
    ).toThrow(/unrecognized/i);
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

  it("rejects digest disagreement and malformed provider capability contracts", () => {
    expect(() =>
      assetMetadataIRSchema.parse({
        ...validMetadata(),
        originalBlobRef: {
          digest: computeAssetContentDigest("different"),
          byteLength: 7,
          mediaType: "application/json",
          locator: null,
        },
      }),
    ).toThrow(/must equal contentDigest/);
    expect(() =>
      assetMetadataIRSchema.parse({
        ...validMetadata(),
        providerRequirements: [
          {
            capability: "render.vector.fill",
            providerIds: [],
            versionRange: null,
            optional: false,
            reason: null,
          },
        ],
      }),
    ).toThrow(/disagree/);
    expect(() =>
      assetMetadataIRSchema.parse({
        ...validMetadata(),
        providerRequirements: [
          {
            capability: "not-namespaced",
            providerIds: [],
            versionRange: null,
            optional: false,
            reason: null,
          },
        ],
      }),
    ).toThrow(/capability must be namespaced/);
  });

  it("rejects duplicate dependency ids, dangling edges and cycles", () => {
    const dependency = {
      id: "shared-tip",
      versionRange: "^1.0.0",
      optional: false,
      dependencies: [],
    };
    expect(() =>
      assetMetadataIRSchema.parse({
        ...validMetadata(),
        dependencies: [dependency, dependency],
      }),
    ).toThrow(/duplicate dependencies id/);
    expect(() =>
      assetMetadataIRSchema.parse({
        ...validMetadata(),
        dependencies: [
          { ...dependency, dependencies: ["missing-node"] },
        ],
      }),
    ).toThrow(/undeclared id/);
    expect(() =>
      assetMetadataIRSchema.parse({
        ...validMetadata(),
        dependencies: [
          { ...dependency, id: "dep-a", dependencies: ["dep-b"] },
          { ...dependency, id: "dep-b", dependencies: ["dep-a"] },
        ],
      }),
    ).toThrow(/contains a cycle/);
    expect(() =>
      assetMetadataIRSchema.parse({
        ...validMetadata(),
        dependencies: [
          { ...dependency, dependencies: ["asset-ink-01"] },
        ],
      }),
    ).toThrow(/contains a cycle/);
  });

  it("rejects fake measured reports and broken renderer/device references", () => {
    expect(() =>
      assetMetadataIRSchema.parse({
        ...validMetadata(),
        visualEquivalenceReport: {
          verdict: "equivalent",
          sampleCount: 0,
        },
      }),
    ).toThrow(/requires/);
    expect(() =>
      assetMetadataIRSchema.parse({
        ...validMetadata(),
        previewVariants: {
          stable: {
            status: "available",
            artifactRef: null,
            rendererVariantId: "missing-renderer",
            realStrokePreviewIds: [],
            reason: null,
          },
          studioMax: null,
        },
      }),
    ).toThrow(/requires an artifactRef/);
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
