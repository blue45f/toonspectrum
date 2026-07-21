import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  BRUSH_PRESETS,
  STUDIO_BRUSH_RENDER_FAMILY,
  resolveStudioBrushRenderFamily,
} from "./studio-brush";
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
import { exportPageToSvg } from "./studio-svg-export";
import { LargeBrushPreview } from "./StudioBrushLibrarySheet";

const SUPPORTED_PREVIEW_KINDS = new Set([
  "ribbon",
  "calligraphy",
  "marker",
  "square-marker",
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
]);

describe("35-preset brush catalog contract", () => {
  it("maps every preset exactly once into selectable catalog metadata", () => {
    const catalog = listStudioBrushTrayItems("all");
    const filteredCatalog = filterStudioBrushLibraryItems({ category: "all" });
    const presetIds = BRUSH_PRESETS.map((preset) => preset.id);

    expect(BRUSH_PRESETS).toHaveLength(35);
    expect(new Set(presetIds).size).toBe(35);
    expect(catalog.map((item) => item.id)).toEqual(filteredCatalog.map((item) => item.id));
    expect(new Set(catalog.map((item) => item.id))).toEqual(new Set(presetIds));
    expect(STUDIO_BRUSH_RUNTIME_CONTRACT.map((contract) => contract.id)).toEqual(presetIds);
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
      const dynamicsFamily = family === "airbrush" || family === "dry-media" || family === "ink-particle";
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
            runtime.engineVariant
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

  it("executes and exports a visible deterministic stroke for all 35 presets", () => {
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

    for (const preset of BRUSH_PRESETS) {
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
