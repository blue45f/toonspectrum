import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { EngineCapabilityRegistry } from "@toonspectrum/studio-engine-registry";
import {
  UnknownAssetCapabilityError,
  collectSceneFeatures,
  computeAssetContentDigest,
  computeAssetStructuredDigest,
} from "@toonspectrum/studio-project-model";
import { beforeAll, describe, expect, it } from "vitest";

import { parseKppPreset } from "../../../packages/studio-format-gateway/src/kpp";
import { importMybBrush } from "../../../packages/studio-format-gateway/src/myb";
import { parseSvgToScene } from "../../../packages/studio-format-gateway/src/svg";

import {
  STUDIO_ASSET_METADATA_CATALOG_KEY,
  STUDIO_ASSET_METADATA_KV_NAMESPACE,
  STUDIO_KNOWN_ENGINE_DESCRIPTORS,
  StudioAssetMetadataRegistry,
  StudioAssetMetadataRegistryError,
  deriveAssetMetadata,
  judgeAssetRenderability,
  studioAssetCapabilityVocabulary,
} from "./studio-asset-metadata-registry";
import { openStudioLocalDatabase } from "./studio-local-database";

import type {
  StudioLocalDatabase,
  StudioSqliteApiHandle,
} from "./studio-local-database";
import type { AssetMetadataIR } from "@toonspectrum/studio-project-model";

// ---------------------------------------------------------------------------
// Real fixtures — actual gateway parsers over the committed corpus files.
// ---------------------------------------------------------------------------

function corpusBytes(relative: string): Uint8Array {
  return new Uint8Array(
    readFileSync(
      fileURLToPath(new URL(`../../../tests/corpus/${relative}`, import.meta.url)),
    ),
  );
}

const FIXED_NOW = 1_754_600_000_000;
const CORPUS_LICENSE = { spdx: "CC0-1.0", attribution: "ToonSpectrum corpus" };

const SVG_FIXTURE = `
  <svg width="120" height="80">
    <defs>
      <linearGradient id="tone" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000"/>
        <stop offset="1" stop-color="#fff"/>
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="60" height="40" fill="url(#tone)"/>
    <circle cx="90" cy="40" r="20" fill="none" stroke="#123456" stroke-width="3"/>
  </svg>`;

function deriveMybCard(): AssetMetadataIR {
  const bytes = corpusBytes("brushes/myb/ink-crisp.myb");
  const result = importMybBrush(bytes, "brush-ink-crisp", "잉크 크리스프");
  return deriveAssetMetadata(
    { format: "myb", bytes, result },
    {
      id: "asset-myb-ink-crisp",
      license: CORPUS_LICENSE,
      sourceFileName: "ink-crisp.myb",
      now: () => FIXED_NOW,
    },
  );
}

function deriveKppCard(): AssetMetadataIR {
  const bytes = corpusBytes("brushes/kpp/paintbrush-ink-basic.kpp");
  const result = parseKppPreset(bytes);
  return deriveAssetMetadata(
    { format: "kpp", bytes, result },
    {
      id: "asset-kpp-ink-basic",
      license: CORPUS_LICENSE,
      sourceFileName: "paintbrush-ink-basic.kpp",
      now: () => FIXED_NOW,
    },
  );
}

function deriveSvgCard(): AssetMetadataIR {
  const result = parseSvgToScene(SVG_FIXTURE);
  return deriveAssetMetadata(
    { format: "svg", svgText: SVG_FIXTURE, result },
    {
      id: "asset-svg-tone-panel",
      name: "톤 패널 장식",
      license: CORPUS_LICENSE,
      now: () => FIXED_NOW,
    },
  );
}

function engineSet(descriptorIds: readonly string[]): EngineCapabilityRegistry {
  const engines = EngineCapabilityRegistry.forTestFixtures();
  for (const id of descriptorIds) {
    const descriptor = STUDIO_KNOWN_ENGINE_DESCRIPTORS.find((d) => d.id === id);
    if (!descriptor) throw new Error(`unknown test descriptor id: ${id}`);
    engines.registerTestFixture(descriptor);
  }
  return engines;
}

const BASELINE_NO_WEBGPU = [
  "skia-canvaskit",
  "vello-cpu",
  "perfect-freehand",
  "hokusai-natural-media",
];

// ---------------------------------------------------------------------------
// Derivation (real wiring proof over the three gateway formats)
// ---------------------------------------------------------------------------

describe("deriveAssetMetadata", () => {
  it("derives a .myb brush card with natural-media requirements and loud-loss ledger", () => {
    const bytes = corpusBytes("brushes/myb/ink-crisp.myb");
    const result = importMybBrush(bytes, "brush-ink-crisp", "잉크 크리스프");
    const card = deriveMybCard();
    expect(card.kind).toBe("brush-program");
    expect(card.sourceFormat).toBe("myb");
    expect(card.name).toBe("잉크 크리스프");
    expect(card.engineRequirements).toEqual([
      "brush.natural-media.dynamics",
      "brush.natural-media.myb",
      "stroke.geometry.pressure-outline",
    ]);
    expect(card.contentDigest).toBe(computeAssetContentDigest(bytes));
    expect(card.originalBlobRef).toEqual({
      digest: card.contentDigest,
      byteLength: bytes.byteLength,
      mediaType: "application/json",
      locator: null,
    });
    expect(card.normalizedIrRef).toEqual({
      digest: computeAssetStructuredDigest(result.preset),
      schema: "toonspectrum.brush-program-ir",
      schemaVersion: 11,
      mediaType: "application/vnd.toonspectrum.brush-program+json",
      locator: null,
    });
    expect(card.providerRequirements).toEqual([
      {
        capability: "brush.natural-media.dynamics",
        providerIds: ["hokusai-natural-media"],
        versionRange: null,
        optional: false,
        reason: "Normalized IR requires brush.natural-media.dynamics.",
      },
      {
        capability: "brush.natural-media.myb",
        providerIds: ["hokusai-natural-media"],
        versionRange: null,
        optional: false,
        reason: "Normalized IR requires brush.natural-media.myb.",
      },
      {
        capability: "stroke.geometry.pressure-outline",
        providerIds: ["perfect-freehand"],
        versionRange: null,
        optional: false,
        reason: "Normalized IR requires stroke.geometry.pressure-outline.",
      },
    ]);
    expect(card.rendererVariants.map(({ id, qualityStatus }) => ({ id, qualityStatus }))).toEqual([
      { id: "stable-hokusai", qualityStatus: "unmeasured" },
      { id: "stable-perfect-freehand-fallback", qualityStatus: "unmeasured" },
    ]);
    expect(card.realStrokePreviews).toEqual([]);
    expect(card.deviceProfiles).toEqual([]);
    expect(card.visualEquivalenceReport).toBeNull();
    expect(card.previewVariants.stable).toMatchObject({
      status: "not-generated",
      artifactRef: null,
      rendererVariantId: "stable-hokusai",
    });
    expect(card.previewVariants.studioMax).toMatchObject({
      status: "not-generated",
      artifactRef: null,
      rendererVariantId: null,
    });
    expect(card.fallback).toMatchObject({
      strategy: "renderer-variant",
      rendererVariantId: "stable-perfect-freehand-fallback",
      providerId: "perfect-freehand",
      preservesNormalizedIr: true,
    });
    expect(card.replacementCondition?.requiredEvidence).toContain("real-device-stroke");
    expect(card.marketplace).toMatchObject({
      status: "not-listed",
      listingId: null,
      publisherId: null,
      commercialUseAllowed: null,
    });
    expect(card.provenance.importer).toBe("studio-format-gateway/importMybBrush");
    // Every unmapped .myb setting survives into provenance — zero silent loss.
    expect(card.provenance.unmapped).toEqual(result.unmappedSettings);
    expect(card.provenance.unmapped).toContain("hardness");
    expect(card.createdAt).toBe(FIXED_NOW);
  });

  it("derives a .kpp paintbrush card preserving importer warnings and unmapped params", () => {
    const bytes = corpusBytes("brushes/kpp/paintbrush-ink-basic.kpp");
    const result = parseKppPreset(bytes);
    const card = deriveKppCard();
    expect(card.kind).toBe("brush-program");
    expect(card.sourceFormat).toBe("kpp");
    expect(card.name).toBe(result.presetName);
    // Krita paintbrush lane prefers hokusai → natural-media dynamics required.
    expect(card.engineRequirements).toEqual([
      "brush.natural-media.dynamics",
      "stroke.geometry.pressure-outline",
    ]);
    expect(card.contentDigest).toBe(computeAssetContentDigest(bytes));
    expect(card.originalBlobRef).toMatchObject({
      digest: card.contentDigest,
      byteLength: bytes.byteLength,
      mediaType: "image/png",
      locator: null,
    });
    expect(card.normalizedIrRef?.digest).toBe(
      computeAssetStructuredDigest(result.program),
    );
    expect(card.rendererVariants.every((variant) => variant.qualityStatus === "unmeasured")).toBe(
      true,
    );
    expect(card.previewVariants.stable?.status).toBe("not-generated");
    expect(card.previewVariants.studioMax?.status).toBe("not-generated");
    expect(card.visualEquivalenceReport).toBeNull();
    expect(card.fallback?.limitations).toContain(
      "Fallback does not claim Krita or CSP stroke equivalence.",
    );
    expect(card.marketplace?.status).toBe("not-listed");
    expect(card.provenance.warnings).toEqual(result.warnings);
    expect(card.provenance.unmapped).toEqual(result.unmapped);
  });

  it("derives an SVG decoration card whose requirements are exactly the scene features", () => {
    const result = parseSvgToScene(SVG_FIXTURE);
    const card = deriveSvgCard();
    expect(card.kind).toBe("svg-decoration");
    expect(card.sourceFormat).toBe("svg");
    expect(card.engineRequirements).toEqual(collectSceneFeatures(result.scene));
    expect(card.engineRequirements).toEqual([
      "render.vector.fill",
      "render.vector.gradient",
      "render.vector.stroke",
    ]);
    expect(card.contentDigest).toBe(computeAssetContentDigest(SVG_FIXTURE));
    expect(card.originalBlobRef).toEqual({
      digest: card.contentDigest,
      byteLength: new TextEncoder().encode(SVG_FIXTURE).byteLength,
      mediaType: "image/svg+xml",
      locator: null,
    });
    expect(card.normalizedIrRef).toEqual({
      digest: computeAssetStructuredDigest(result.scene),
      schema: "toonspectrum.scene-ir",
      schemaVersion: 11,
      mediaType: "application/vnd.toonspectrum.scene+json",
      locator: null,
    });
    expect(card.rendererVariants.map(({ id, tier, qualityStatus }) => ({
      id,
      tier,
      qualityStatus,
    }))).toEqual([
      { id: "stable-canvaskit", tier: "stable", qualityStatus: "unmeasured" },
      {
        id: "studio-max-vello-gpu",
        tier: "studio-max",
        qualityStatus: "unmeasured",
      },
    ]);
    expect(card.previewVariants.stable).toMatchObject({
      status: "not-generated",
      artifactRef: null,
      rendererVariantId: "stable-canvaskit",
    });
    expect(card.previewVariants.studioMax).toMatchObject({
      status: "not-generated",
      artifactRef: null,
      rendererVariantId: "studio-max-vello-gpu",
    });
    expect(card.visualEquivalenceReport).toBeNull();
    expect(card.fallback).toMatchObject({
      rendererVariantId: "stable-canvaskit",
      providerId: "skia-canvaskit",
      preservesNormalizedIr: true,
    });
    expect(card.marketplace).toMatchObject({
      status: "not-listed",
      tags: ["svg"],
    });
    expect(card.provenance.importer).toBe("studio-format-gateway/parseSvgToScene");
  });

  it("only names providers that actually declare each derived capability", () => {
    for (const card of [deriveMybCard(), deriveKppCard(), deriveSvgCard()]) {
      expect(card.providerRequirements.map((requirement) => requirement.capability)).toEqual(
        card.engineRequirements,
      );
      for (const requirement of card.providerRequirements) {
        expect(requirement.providerIds.length).toBeGreaterThan(0);
        for (const providerId of requirement.providerIds) {
          const descriptor = STUDIO_KNOWN_ENGINE_DESCRIPTORS.find(
            (candidate) => candidate.id === providerId,
          );
          expect(descriptor?.capabilities).toContain(requirement.capability);
        }
      }
      expect(card.rendererVariants.every((variant) => variant.qualityStatus === "unmeasured")).toBe(
        true,
      );
      expect(card.realStrokePreviews).toEqual([]);
      expect(card.deviceProfiles).toEqual([]);
      expect(card.visualEquivalenceReport).toBeNull();
    }
  });

  it("is deterministic: same payload + clock produces an identical card, changed bytes change the digest", () => {
    expect(deriveMybCard()).toEqual(deriveMybCard());
    const bytes = corpusBytes("brushes/myb/ink-crisp.myb");
    const tampered = new Uint8Array(bytes);
    // Flip a byte inside the JSON comment (stays parseable, different content).
    const offset = new TextDecoder().decode(bytes).indexOf("Crisp");
    tampered[offset] = 0x58; // "X"
    const result = importMybBrush(tampered, "brush-ink-crisp", "잉크 크리스프");
    const card = deriveAssetMetadata(
      { format: "myb", bytes: tampered, result },
      {
        id: "asset-myb-ink-crisp",
        license: CORPUS_LICENSE,
        sourceFileName: "ink-crisp.myb",
        now: () => FIXED_NOW,
      },
    );
    expect(card.contentDigest).not.toBe(deriveMybCard().contentDigest);
  });
});

// ---------------------------------------------------------------------------
// Registry: register / lookup / vocabulary gate
// ---------------------------------------------------------------------------

describe("StudioAssetMetadataRegistry", () => {
  it("registers derived cards and lists them by kind in stable id order", () => {
    const registry = new StudioAssetMetadataRegistry();
    registry.register(deriveSvgCard());
    registry.register(deriveMybCard());
    registry.register(deriveKppCard());
    expect(registry.get("asset-myb-ink-crisp")?.sourceFormat).toBe("myb");
    expect(registry.get("no-such-asset")).toBeNull();
    expect(registry.list().map((a) => a.id)).toEqual([
      "asset-kpp-ink-basic",
      "asset-myb-ink-crisp",
      "asset-svg-tone-panel",
    ]);
    expect(registry.list("brush-program").map((a) => a.id)).toEqual([
      "asset-kpp-ink-basic",
      "asset-myb-ink-crisp",
    ]);
    expect(registry.list("svg-decoration").map((a) => a.id)).toEqual([
      "asset-svg-tone-panel",
    ]);
  });

  it("rejects duplicate ids loudly", () => {
    const registry = new StudioAssetMetadataRegistry();
    registry.register(deriveMybCard());
    expect(() => registry.register(deriveMybCard())).toThrow(
      StudioAssetMetadataRegistryError,
    );
  });

  it("rejects capability tokens outside the engine vocabulary", () => {
    const registry = new StudioAssetMetadataRegistry();
    const rogue = {
      ...deriveSvgCard(),
      id: "asset-rogue",
      engineRequirements: ["render.hologram.field"],
      // Exercise the legacy capability view: the schema lifts this single
      // token into providerRequirements before the registry vocabulary gate.
      providerRequirements: undefined,
    };
    expect(() => registry.register(rogue)).toThrow(UnknownAssetCapabilityError);
    // A rejected card must not be queryable (no partial registration).
    expect(registry.get("asset-rogue")).toBeNull();
  });

  it("builds its vocabulary from shipped descriptors plus scene features", () => {
    const vocabulary = studioAssetCapabilityVocabulary();
    for (const token of [
      "render.vector.fill",
      "render.gpu.webgpu",
      "render.lottie.frame",
      "render.svg.vello-native",
      "format.svg.strict-audit",
      "brush.natural-media.myb",
      "stroke.geometry.pressure-outline",
      "filter.op.gaussian-blur",
      "render.blend.multiply",
    ]) {
      expect(vocabulary.has(token)).toBe(true);
    }
    expect(vocabulary.has("render.hologram.field")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Renderability against the current engine set
// ---------------------------------------------------------------------------

describe("renderability judgment", () => {
  it("marks a vello-gpu-browser material unfulfilled on a WebGPU-absent engine set", () => {
    const registry = new StudioAssetMetadataRegistry();
    registry.register({
      id: "asset-velato-sparkle",
      kind: "lottie-effect",
      name: "벨라토 스파클",
      version: "1.0.0",
      engineRequirements: ["render.gpu.webgpu", "render.lottie.frame"],
      sourceFormat: "lottie",
      license: { spdx: "MIT" },
      contentDigest: computeAssetContentDigest("velato-fixture"),
      createdAt: FIXED_NOW,
      provenance: { importer: "marketplace/pack-import", importedAt: FIXED_NOW },
    });

    const withoutWebGpu = registry.judgeRenderability(
      "asset-velato-sparkle",
      engineSet(BASELINE_NO_WEBGPU),
    );
    expect(withoutWebGpu.renderable).toBe(false);
    expect(withoutWebGpu.missingCapabilities).toEqual([
      "render.gpu.webgpu",
      "render.lottie.frame",
    ]);
    expect(withoutWebGpu.capabilityProviders["render.gpu.webgpu"]).toEqual([]);

    const withWebGpu = registry.judgeRenderability(
      "asset-velato-sparkle",
      engineSet([...BASELINE_NO_WEBGPU, "vello-gpu-browser"]),
    );
    expect(withWebGpu.renderable).toBe(true);
    expect(withWebGpu.missingCapabilities).toEqual([]);
    expect(withWebGpu.capabilityProviders["render.gpu.webgpu"]).toEqual([
      "vello-gpu-browser",
    ]);
  });

  it("judges derived cards: svg renders on the vector baseline, myb needs the hokusai lane", () => {
    const svgReport = judgeAssetRenderability(
      deriveSvgCard(),
      engineSet(["skia-canvaskit", "vello-cpu"]),
    );
    expect(svgReport.renderable).toBe(true);
    expect(svgReport.capabilityProviders["render.vector.gradient"]).toEqual([
      "skia-canvaskit",
      "vello-cpu",
    ]);

    const mybWithoutHokusai = judgeAssetRenderability(
      deriveMybCard(),
      engineSet(["skia-canvaskit", "vello-cpu", "perfect-freehand"]),
    );
    expect(mybWithoutHokusai.renderable).toBe(false);
    expect(mybWithoutHokusai.missingCapabilities).toEqual([
      "brush.natural-media.dynamics",
      "brush.natural-media.myb",
    ]);

    const mybFull = judgeAssetRenderability(
      deriveMybCard(),
      engineSet(BASELINE_NO_WEBGPU),
    );
    expect(mybFull.renderable).toBe(true);
  });

  it("refuses to judge an unregistered asset id", () => {
    const registry = new StudioAssetMetadataRegistry();
    expect(() =>
      registry.judgeRenderability("ghost", engineSet(BASELINE_NO_WEBGPU)),
    ).toThrow(StudioAssetMetadataRegistryError);
  });
});

// ---------------------------------------------------------------------------
// SQLite kv persistence (real sqlite-wasm :memory: DB — no stub semantics)
// ---------------------------------------------------------------------------

describe("SQLite kv persistence", () => {
  let sqlite3: StudioSqliteApiHandle;

  beforeAll(async () => {
    const module = await import("@sqlite.org/sqlite-wasm");
    sqlite3 = (await module.default()) as unknown as StudioSqliteApiHandle;
  });

  async function openMemoryDatabase(): Promise<StudioLocalDatabase> {
    return openStudioLocalDatabase({
      vfs: "memory",
      loadSqlite: () => Promise.resolve(sqlite3),
    });
  }

  it("round-trips the catalog through the asset-metadata kv namespace", async () => {
    const database = await openMemoryDatabase();
    try {
      const store = database.asAsyncKeyValueStore(STUDIO_ASSET_METADATA_KV_NAMESPACE);
      const registry = new StudioAssetMetadataRegistry();
      registry.register(deriveMybCard());
      registry.register(deriveKppCard());
      registry.register(deriveSvgCard());
      await registry.saveTo(store);

      // The snapshot lives in the shared kv table under the dedicated
      // namespace — no new tables, no migration.
      const raw = await database.kvGet(
        STUDIO_ASSET_METADATA_KV_NAMESPACE,
        STUDIO_ASSET_METADATA_CATALOG_KEY,
      );
      expect(raw).not.toBeNull();

      const loaded = await StudioAssetMetadataRegistry.loadFrom(store);
      expect(loaded.list()).toEqual(registry.list());

      // Saving the loaded registry again is byte-identical (canonical JSON).
      await loaded.saveTo(store);
      expect(
        await database.kvGet(
          STUDIO_ASSET_METADATA_KV_NAMESPACE,
          STUDIO_ASSET_METADATA_CATALOG_KEY,
        ),
      ).toBe(raw);
    } finally {
      await database.close();
    }
  });

  it("loads an empty registry when no snapshot exists, and fails loudly on corruption", async () => {
    const database = await openMemoryDatabase();
    try {
      const store = database.asAsyncKeyValueStore(STUDIO_ASSET_METADATA_KV_NAMESPACE);
      const empty = await StudioAssetMetadataRegistry.loadFrom(store);
      expect(empty.list()).toEqual([]);

      await store.set(STUDIO_ASSET_METADATA_CATALOG_KEY, "{not json");
      await expect(StudioAssetMetadataRegistry.loadFrom(store)).rejects.toThrow(
        /not valid JSON/,
      );

      await store.set(
        STUDIO_ASSET_METADATA_CATALOG_KEY,
        JSON.stringify({ revision: 999, assets: [] }),
      );
      await expect(StudioAssetMetadataRegistry.loadFrom(store)).rejects.toThrow(
        StudioAssetMetadataRegistryError,
      );

      // A snapshot with an invalid entry refuses to load partially.
      await store.set(
        STUDIO_ASSET_METADATA_CATALOG_KEY,
        JSON.stringify({ revision: 1, assets: [{ id: "broken" }] }),
      );
      await expect(StudioAssetMetadataRegistry.loadFrom(store)).rejects.toThrow();
    } finally {
      await database.close();
    }
  });
});
