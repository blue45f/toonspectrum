import { describe, expect, it } from "vitest";

import { BRUSH_PRESETS } from "./studio-brush";
import {
  STUDIO_BRUSH_ENGINE_LANE_CATALOG_ROWS,
  isStudioBrushEngineLaneId,
  listStudioBrushEngineLaneIds,
  resolveStudioBrushEngineLaneBaseId,
  resolveStudioBrushEngineLaneLabelKo,
  studioBrushEngineLaneRowById,
} from "./studio-brush-engine-lane-catalog";
import {
  resolveStudioBrushRuntimeContract,
  studioBrushRuntimeExecutionSignature,
} from "./studio-brush-runtime-contract";
import { filterStudioBrushLibraryItems } from "./studio-draw-ux";
import {
  describeStudioOssBrushHybridStack,
  resolveStudioBrushTextureKind,
} from "./studio-oss-brush-hybrid-registry";
import { loadStudioPerfectFreehandStroker } from "./studio-perfect-freehand";
import { exportPageToSvg } from "./studio-svg-export";

function exportBrushSvg(brushId: string): string {
  const runtime = resolveStudioBrushRuntimeContract(brushId)!;
  return exportPageToSvg({
    width: 96,
    height: 64,
    bg: "#ffffff",
    transparentBg: true,
    elements: [{
      id: "visual-lane-stroke",
      type: "draw",
      kind: "freehand",
      mode: "pen",
      brush: brushId,
      brushCatalogId: brushId,
      points: [10, 34, 24, 18, 42, 42, 62, 20, 82, 31],
      pressures: [0.35, 0.55, 0.8, 0.6, 0.42],
      stroke: "#1f6feb",
      strokeWidth: 12,
      opacity: 0.72,
      sampleSpacing: 1,
      stampPipeline: runtime.engine === "stamp-dabs" ? "causal-walker-v2" : undefined,
      watercolorPipeline:
        runtime.engine === "watercolor-dabs" ? "causal-walker-v2" : undefined,
    }],
  }).svg;
}

describe("studio brush engine-lane catalog", () => {
  it("ships unique lane ids into BRUSH_PRESETS with runtime contracts", () => {
    const ids = listStudioBrushEngineLaneIds();
    expect(ids.length).toBeGreaterThanOrEqual(30);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(isStudioBrushEngineLaneId(id)).toBe(true);
      expect(BRUSH_PRESETS.some((p) => p.id === id)).toBe(true);
      expect(resolveStudioBrushRuntimeContract(id)).not.toBeNull();
      expect(resolveStudioBrushEngineLaneLabelKo(id)).toBeTruthy();
    }
  });

  it("routes hybrid texture by artistic base and exposes engineLane metadata", () => {
    for (const row of STUDIO_BRUSH_ENGINE_LANE_CATALOG_ROWS) {
      expect(resolveStudioBrushEngineLaneBaseId(row.id)).toBe(row.baseId);
      expect(resolveStudioBrushTextureKind(row.id)).toBe(
        resolveStudioBrushTextureKind(row.baseId),
      );
      const stack = describeStudioOssBrushHybridStack(row.id);
      expect(stack.engineLane?.runtimeEngine).toBe(row.engine);
      expect(stack.crossEngineProductFallbackAllowed).toBe(false);
    }
  });

  it("keeps engine-variant lanes on different execution signatures than their canonical", () => {
    for (const row of STUDIO_BRUSH_ENGINE_LANE_CATALOG_ROWS) {
      if (row.distinctness !== "engine-variant") continue;
      const contract = resolveStudioBrushRuntimeContract(row.id)!;
      const canonical = resolveStudioBrushRuntimeContract(row.canonicalId)!;
      expect(studioBrushRuntimeExecutionSignature(contract)).not.toBe(
        studioBrushRuntimeExecutionSignature(canonical),
      );
    }
  });

  it("filters the engines library tab to engine-lane shelf only", () => {
    const engines = filterStudioBrushLibraryItems({ category: "engines" });
    expect(engines.length).toBe(STUDIO_BRUSH_ENGINE_LANE_CATALOG_ROWS.length);
    expect(engines.every((item) => isStudioBrushEngineLaneId(item.id))).toBe(true);
    expect(engines.some((item) => item.id === "pen")).toBe(false);
  });

  it("pairs same-medium lanes onto different runtime engines", () => {
    expect(resolveStudioBrushRuntimeContract("oil--filbert-ribbon")?.engine).toBe(
      "oil-ribbon",
    );
    expect(resolveStudioBrushRuntimeContract("oil--tube-extrude")?.engine).toBe(
      "dynamic-dabs",
    );
    expect(resolveStudioBrushRuntimeContract("watercolor--granular")?.engine).toBe(
      "watercolor-dabs",
    );
    expect(resolveStudioBrushRuntimeContract("watercolor--edge-stamp")?.engine).toBe(
      "stamp-dabs",
    );
    expect(studioBrushEngineLaneRowById("oil--knife-edge")?.lane).toBe("oil-extrude");
  });
});

describe("engine-lane visual texture discrimination", () => {
  it("renders multi-engine pairs with non-identical SVG marks", async () => {
    await loadStudioPerfectFreehandStroker();
    const pairs: Array<[string, string]> = [
      ["oil", "oil--filbert-ribbon"],
      ["oil", "oil--tube-extrude"],
      ["oil--filbert-ribbon", "oil--flat-ribbon"],
      ["watercolor", "watercolor--granular"],
      ["watercolor--granular", "watercolor--dense-core"],
      ["ink-wash--sumi-core", "ink-wash--bleed-halo"],
      ["wash-brush", "watercolor--edge-stamp"],
      ["ink-brush", "gouache--flat-stamp"],
      ["airbrush", "airbrush--klecks-grit"],
      ["airbrush-fine", "airbrush--stamp-soft"],
      ["charcoal", "charcoal--vine-soft"],
      ["pen", "pen--perfect-taper"],
    ];
    const svgs = new Map<string, string>();
    for (const id of new Set(pairs.flat())) {
      const svg = exportBrushSvg(id);
      expect(svg, `${id}: empty`).toContain("#1f6feb");
      svgs.set(id, svg);
    }
    for (const [a, b] of pairs) {
      expect(svgs.get(a), `${a} vs ${b}`).not.toBe(svgs.get(b));
    }
    expect(svgs.get("oil--filbert-ribbon")).toContain("oil-ribbon-carrier");
    expect(svgs.get("oil--tube-extrude")!.includes("oil-ribbon-carrier")).toBe(false);
  });
});
