import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import {
  BRUSH_PRESETS,
  STUDIO_BRUSH_RENDER_FAMILY,
  resolveStudioBrushRenderFamily,
} from "./studio-brush";
import {
  filterStudioBrushCatalogItems,
  listStudioCoreBrushCatalogItems,
  listStudioQuickBrushCatalogItems,
  STUDIO_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_BRUSH_CATALOG_COUNTS,
  STUDIO_ERASER_BRUSH_CATALOG_ITEMS,
  STUDIO_PAINT_BRUSH_CATALOG_ITEMS,
  studioBrushCatalogItemById,
  studioBrushCatalogKindLabel,
} from "./studio-brush-catalog";
import {
  resolveStudioBrushDynamicsPresetId,
  studioBrushDynamicsSettingsForBrushId,
} from "./studio-brush-dynamics";
import {
  STUDIO_BRUSH_RUNTIME_CONTRACT,
  resolveStudioBrushRuntimeContract,
  resolveStudioBrushSinglePointRoute,
  studioBrushRuntimeExecutionSignature,
} from "./studio-brush-runtime-contract";
import { resolveStudioStampBrushKind } from "./studio-brush-stamp-engine";
import { listStudioBrushTrayItems } from "./studio-creative-ux";
import { filterStudioBrushLibraryItems } from "./studio-draw-ux";
import { loadStudioPerfectFreehandStroker } from "./studio-perfect-freehand";
import { exportPageToSvg } from "./studio-svg-export";
import { LargeBrushPreview } from "./StudioBrushLibrarySheet";

const SUPPORTED_PREVIEW_KINDS = new Set([
  "ribbon",
  "calligraphy",
  "marker",
  "square-marker",
  "wash-marker",
  "pencil",
  "texture",
  "soft-air",
  "soft-wash",
  "soft-pigment",
  "oil",
  "neon",
  "glow",
  "particle",
  "tone",
  "eraser",
]);

const CORE_BRUSH_CATALOG_ITEMS = listStudioBrushTrayItems("all");
const CORE_BRUSH_CATALOG_COUNT = CORE_BRUSH_CATALOG_ITEMS.length;

describe(`${CORE_BRUSH_CATALOG_COUNT}-preset brush catalog contract`, () => {
  // perfect-outline 엔진은 다이내믹 청크(perfect-freehand)를 쓴다 — 동기 SVG export가
  // 실제 아웃라인 경로(폴백 아님)를 감사하도록 스트로커를 선로드한다.
  beforeAll(async () => {
    await loadStudioPerfectFreehandStroker();
  });

  it("maps every preset exactly once into selectable catalog metadata", () => {
    const catalog = CORE_BRUSH_CATALOG_ITEMS;
    const filteredCatalog = filterStudioBrushLibraryItems({ category: "all" });
    const presetIds = BRUSH_PRESETS.map((preset) => preset.id);

    expect(BRUSH_PRESETS).toHaveLength(CORE_BRUSH_CATALOG_COUNT);
    expect(new Set(presetIds).size).toBe(CORE_BRUSH_CATALOG_COUNT);
    expect(catalog.map((item) => item.id)).toEqual(filteredCatalog.map((item) => item.id));
    expect(new Set(catalog.map((item) => item.id))).toEqual(new Set(presetIds));
    expect(STUDIO_BRUSH_RUNTIME_CONTRACT.map((contract) => contract.id)).toEqual(presetIds);
  });

  it("keeps all 231 identities behind one searchable quick/full catalogue source", () => {
    expect(STUDIO_BRUSH_CATALOG_COUNTS).toEqual({ core: 71, pro: 160, total: 231 });
    expect(STUDIO_ALL_BRUSH_CATALOG_ITEMS).toHaveLength(231);
    expect(new Set(STUDIO_ALL_BRUSH_CATALOG_ITEMS.map((item) => item.id))).toHaveProperty(
      "size",
      231
    );

    for (const item of STUDIO_ALL_BRUSH_CATALOG_ITEMS) {
      expect(studioBrushCatalogItemById(item.id), `${item.id}: lookup drift`).toBe(item);
      expect(studioBrushCatalogKindLabel(item), `${item.id}: missing kind label`).toMatch(
        /^(선화|마커|채색|효과|질감|지우개)$/u
      );
      expect(
        filterStudioBrushCatalogItems({
          // Exact-id search must be global even while the UI still has another category selected.
          category: "beginner",
          query: item.id,
        }).some((candidate) => candidate.id === item.id),
        `${item.id}: hidden behind category during search`
      ).toBe(true);
    }
    expect(studioBrushCatalogKindLabel(
      STUDIO_ERASER_BRUSH_CATALOG_ITEMS[0]!,
    )).toBe("지우개");

    const quick = listStudioQuickBrushCatalogItems({
      favoriteIds: ["heart-stamp"],
      recentIds: ["hair-fiber", "pen"],
      limit: 3,
    });
    expect(quick.map(({ id, quickSource }) => [id, quickSource])).toEqual([
      ["heart-stamp", "favorite"],
      ["hair-fiber", "recent"],
      ["pen", "recent"],
    ]);
  });

  it("keeps paint and eraser catalogues disjoint on the operation axis", () => {
    expect(STUDIO_ALL_BRUSH_CATALOG_ITEMS.every(
      (item) => item.operation === "paint" || item.operation === "erase"
    )).toBe(true);
    expect(STUDIO_PAINT_BRUSH_CATALOG_ITEMS).toHaveLength(229);
    expect(STUDIO_ERASER_BRUSH_CATALOG_ITEMS.map((item) => item.id)).toEqual([
      "standard-eraser",
      "kneaded-eraser",
    ]);
    expect(listStudioCoreBrushCatalogItems("erase").map((item) => item.id)).toEqual([
      "standard-eraser",
      "kneaded-eraser",
    ]);
    expect(filterStudioBrushCatalogItems({ operation: "erase" }).map((item) => item.id)).toEqual([
      "standard-eraser",
      "kneaded-eraser",
    ]);
    expect(filterStudioBrushCatalogItems({ operation: "paint" }).some(
      (item) => item.id === "standard-eraser" || item.id === "kneaded-eraser"
    )).toBe(false);
    expect(filterStudioBrushCatalogItems({
      operation: "paint",
      query: "eraser",
    })).toEqual([]);
    expect(STUDIO_ALL_BRUSH_CATALOG_ITEMS.filter((item) => item.source === "pro").every(
      (item) => item.operation === "paint"
    )).toBe(true);
  });

  it("gives every preset an explicit renderer, engine route, preview, and exact-id search result", () => {
    const catalog = new Map(listStudioBrushTrayItems("all").map((item) => [item.id, item]));

    for (const preset of BRUSH_PRESETS) {
      const item = catalog.get(preset.id);
      expect(item, `${preset.id}: missing catalog item`).toBeDefined();
      expect(
        Object.prototype.hasOwnProperty.call(STUDIO_BRUSH_RENDER_FAMILY, preset.id),
        `${preset.id}: relies on unknown-brush fallback`
      ).toBe(true);

      const family = resolveStudioBrushRenderFamily(preset.id);
      const runtime = resolveStudioBrushRuntimeContract(preset.id);
      const stampKind = resolveStudioStampBrushKind(preset.id);
      const dynamicsId = resolveStudioBrushDynamicsPresetId(preset.id);
      const dynamicsFamily = runtime?.engine === "dynamic-dabs";
      const previewHtml = renderToStaticMarkup(
        createElement(LargeBrushPreview, { item: item!, active: false })
      );
      const previewKind = /data-studio-brush-preview-kind="([^"]+)"/.exec(previewHtml)?.[1];

      expect(stampKind !== null, `${preset.id}: stamp route mismatch`).toBe(family === "stamp");
      expect(dynamicsId !== null, `${preset.id}: dynamics route mismatch`).toBe(dynamicsFamily);
      expect(runtime, `${preset.id}: missing runtime contract`).toBeDefined();
      expect(runtime?.family, `${preset.id}: family contract drift`).toBe(family);
      expect(runtime?.preview, `${preset.id}: preview contract drift`).toBe(item?.previewStyle);
      if (runtime?.engine === "stamp-dabs") {
        expect(stampKind, `${preset.id}: stamp variant drift`).toBe(runtime.engineVariant);
      } else {
        expect(stampKind, `${preset.id}: undeclared stamp route`).toBeNull();
      }
      if (runtime?.engine === "dynamic-dabs") {
        expect(
          studioBrushDynamicsSettingsForBrushId(preset.id),
          `${preset.id}: missing exact dynamics profile`
        ).not.toBeNull();
        if (runtime.distinctness === "unique") {
          expect(dynamicsId, `${preset.id}: canonical dynamics variant drift`).toBe(
            resolveStudioBrushDynamicsPresetId(runtime.engineVariant)
          );
        }
      } else {
        expect(dynamicsId, `${preset.id}: undeclared dynamics route`).toBeNull();
      }
      expect(
        previewKind !== undefined && SUPPORTED_PREVIEW_KINDS.has(previewKind),
        `${preset.id}: unsupported catalog preview`
      ).toBe(true);
      expect(
        filterStudioBrushLibraryItems({ category: "all", query: preset.id }).some(
          (result) => result.id === preset.id
        ),
        `${preset.id}: not selectable through exact-id catalog search`
      ).toBe(true);
    }
  });

  it("declares every renderer alias as a canonical profile or engine variant", () => {
    const contracts = new Map(
      STUDIO_BRUSH_RUNTIME_CONTRACT.map((contract) => [contract.id, contract])
    );
    const canonicalBySignature = new Map<string, string>();

    for (const contract of STUDIO_BRUSH_RUNTIME_CONTRACT) {
      const canonical = contracts.get(contract.canonicalId);
      expect(canonical, `${contract.id}: unknown canonicalId ${contract.canonicalId}`).toBeDefined();
      const signature = studioBrushRuntimeExecutionSignature(contract);
      const declaredCanonical = canonicalBySignature.get(signature);
      if (declaredCanonical) {
        expect(
          contract.canonicalId,
          `${contract.id}: duplicate renderer ${signature} must declare canonical ${declaredCanonical}`
        ).toBe(declaredCanonical);
      } else {
        canonicalBySignature.set(signature, contract.canonicalId);
      }

      if (contract.distinctness === "unique") {
        expect(contract.canonicalId).toBe(contract.id);
      } else if (contract.distinctness === "profile-variant") {
        expect(contract.canonicalId).not.toBe(contract.id);
        expect(studioBrushRuntimeExecutionSignature(canonical!)).toBe(signature);
      } else {
        expect(contract.canonicalId).not.toBe(contract.id);
        expect(canonical?.engine).toBe(contract.engine);
        expect(studioBrushRuntimeExecutionSignature(canonical!)).not.toBe(signature);
      }
    }
  });

  it("routes every manga nib through the continuous pressure-outline engine", () => {
    for (const brushId of ["gpen", "mapping-pen", "kaburapen", "liner"] as const) {
      expect(resolveStudioBrushRuntimeContract(brushId)).toMatchObject({
        family: "gpen",
        engine: "perfect-outline",
        engineVariant: "gpen-taper",
        dynamics: "outline-pressure",
      });
      expect(resolveStudioBrushSinglePointRoute({ brushId })).toBe("generic-dot");
    }
  });

  it(`executes and exports a visible deterministic stroke for all ${CORE_BRUSH_CATALOG_COUNT} presets`, () => {
    for (const preset of BRUSH_PRESETS) {
      const runtime = resolveStudioBrushRuntimeContract(preset.id)!;
      const input = {
        width: 96,
        height: 64,
        bg: "#ffffff",
        transparentBg: true,
        elements: [{
          id: `contract-${preset.id}`,
          type: "draw" as const,
          kind: "freehand" as const,
          mode: "pen" as const,
          brush: preset.id,
          points: [10, 34, 24, 18, 42, 42, 62, 20, 82, 31],
          pressures: [0.35, 0.55, 0.8, 0.6, 0.42],
          stroke: "#1f6feb",
          strokeWidth: preset.defaultWidth,
          opacity: preset.defaultOpacity,
          sampleSpacing: 1,
          stampPipeline: runtime.engine === "stamp-dabs" ? "causal-walker-v2" as const : undefined,
          watercolorPipeline: runtime.engine === "watercolor-dabs" ? "causal-walker-v2" as const : undefined,
        }],
      };
      const first = exportPageToSvg(input);
      const second = exportPageToSvg(input);

      expect(first.elementCount, `${preset.id}: element was not exported`).toBe(1);
      expect(first.skipped, `${preset.id}: export reported a skipped feature`).toEqual([]);
      expect(first.svg, `${preset.id}: renderer produced no coloured mark`).toContain("#1f6feb");
      expect(first.svg, `${preset.id}: export is not deterministic`).toBe(second.svg);
    }
  });

  it("catches byte-identical normalized renderers that omit a canonical alias declaration", () => {
    const canonicalBySvg = new Map<string, string>();
    const svgById = new Map<string, string>();

    // Erase identities share renderer carriers but differ by compositing operation, so a forced
    // paint-mode SVG cannot audit their canonical relation. Operation parity is covered above.
    for (const preset of BRUSH_PRESETS.filter(({ operation }) => operation === "paint")) {
      const runtime = resolveStudioBrushRuntimeContract(preset.id)!;
      const { svg } = exportPageToSvg({
        width: 96,
        height: 64,
        bg: "#ffffff",
        transparentBg: true,
        elements: [{
          // Deliberately identical id/controls: only the preset route is allowed to affect bytes.
          id: "duplicate-audit-stroke",
          type: "draw",
          kind: "freehand",
          mode: "pen",
          brush: preset.id,
          points: [10, 34, 24, 18, 42, 42, 62, 20, 82, 31],
          pressures: [0.35, 0.55, 0.8, 0.6, 0.42],
          stroke: "#1f6feb",
          strokeWidth: 12,
          opacity: 0.72,
          sampleSpacing: 1,
          stampPipeline: runtime.engine === "stamp-dabs" ? "causal-walker-v2" : undefined,
          watercolorPipeline: runtime.engine === "watercolor-dabs" ? "causal-walker-v2" : undefined,
        }],
      });
      svgById.set(preset.id, svg);

      const firstCanonical = canonicalBySvg.get(svg);
      if (firstCanonical) {
        expect(
          runtime.canonicalId,
          `${preset.id}: byte-identical output must declare canonical ${firstCanonical}`
        ).toBe(firstCanonical);
      } else {
        canonicalBySvg.set(svg, runtime.canonicalId);
      }
    }

    for (const runtime of STUDIO_BRUSH_RUNTIME_CONTRACT) {
      if (runtime.distinctness === "profile-variant") {
        expect(svgById.get(runtime.id), `${runtime.id}: exact-id profile collapsed`).not.toBe(
          svgById.get(runtime.canonicalId)
        );
      } else if (runtime.distinctness === "engine-variant") {
        expect(svgById.get(runtime.id), `${runtime.id}: advertised engine variant collapsed`).not.toBe(
          svgById.get(runtime.canonicalId)
        );
      }
    }
  });

  it("routes legacy one-point stamp strokes through the stamp exporter", () => {
    for (const brush of ["ink-brush", "airbrush-fine", "pencil-grain", "wash-brush"] as const) {
      const kind = resolveStudioStampBrushKind(brush)!;
      expect(
        resolveStudioBrushSinglePointRoute({ brushId: brush, mode: "pen" }),
        `${brush}: generic-dot must never intercept a stamp tap`
      ).toBe("stamp-dabs");
      const result = exportPageToSvg({
        width: 64,
        height: 64,
        bg: "#ffffff",
        transparentBg: true,
        elements: [{
          id: `legacy-tap-${brush}`,
          type: "draw",
          kind: "freehand",
          mode: "pen",
          brush,
          points: [32, 32],
          pressures: [0.6],
          stroke: "#1f6feb",
          strokeWidth: 12,
        }],
      });
      expect(result.svg).toContain(`data-stamp-brush="${kind}"`);
    }
  });

  it("makes the one-point fallback decision explicit for causal ink, FX, and erasers", () => {
    expect(resolveStudioBrushSinglePointRoute({ brushId: "pen" })).toBe("generic-dot");
    expect(resolveStudioBrushSinglePointRoute({
      brushId: "pen",
      causalInkEnabled: true,
    })).toBe("causal-ink");
    expect(resolveStudioBrushSinglePointRoute({ brushId: "neon" })).toBe("neon-halo");
    expect(resolveStudioBrushSinglePointRoute({ brushId: "glitter" })).toBe("particle-scatter");
    expect(resolveStudioBrushSinglePointRoute({
      brushId: "wash-brush",
      mode: "eraser",
    })).toBe("generic-dot");
  });
});
