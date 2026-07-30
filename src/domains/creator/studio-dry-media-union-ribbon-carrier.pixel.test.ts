import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { BRUSH_PRESETS } from "./studio-brush";
import { planNormalizedStudioDynamicBrushDabs } from "./studio-brush-dynamics";
import { STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID } from "./studio-brush-render-budget";
import { studioCoreBrushCatalogSelection } from "./studio-brush-selection";
import {
  resolveStudioDynamicBrushMaterialIdentity,
} from "./studio-dry-media-dynamic-bridge";
import {
  planStudioDynamicBrushCoverageMarks,
  type StudioDynamicBrushCoverageMark,
} from "./studio-dynamic-brush-coverage-renderer";

function plannedMark(
  brushId: "crayon" | "chalk" | "charcoal" | "pastel" | "oil-pastel",
  points: readonly number[],
): StudioDynamicBrushCoverageMark {
  const preset = BRUSH_PRESETS.find(({ id }) => id === brushId)!;
  const selection = studioCoreBrushCatalogSelection(preset);
  const dynamics = selection.brushDynamics!;
  const dabs = planNormalizedStudioDynamicBrushDabs({
    points,
    pressures: Array.from(
      { length: points.length / 2 },
      (_, index) => 0.48 + (index % 5) * 0.08,
    ),
    baseWidth: selection.defaultWidth,
    baseOpacity: 1,
    seed: dynamics.seed,
    maxDabs: 4_096,
  }, dynamics);
  const materialIdentity = resolveStudioDynamicBrushMaterialIdentity(brushId);
  if (!materialIdentity) throw new Error("missing dry-media identity");
  const plan = planStudioDynamicBrushCoverageMarks({
    dabVariations: [dabs],
    dynamics,
    materialIdentity,
    dynamicSeed: dynamics.seed,
    stroke: "#35241d",
    stampGrid: STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID,
    markBudget: 65_536,
  });
  if (!plan.ok) throw new Error(plan.reason);
  expect(plan.marks).toHaveLength(1);
  expect(plan.marks[0]?.ribbon?.kind).toBe(
    "dry-media-union-ribbon-polygon",
  );
  return plan.marks[0]!;
}

function pathFor(mark: StudioDynamicBrushCoverageMark): string {
  return (mark.ribbon?.polygons ?? []).map((polygon) => {
    const [x, y, ...remaining] = polygon;
    let path = `M${x} ${y}`;
    for (let index = 0; index < remaining.length; index += 2) {
      path += `L${remaining[index]} ${remaining[index + 1]}`;
    }
    return `${path}Z`;
  }).join("");
}

function minimumLuminance(
  pixels: Uint8Array,
  width: number,
  centerX: number,
  centerY: number,
  radius: number,
): number {
  let minimum = 255;
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      const offset = (y * width + x) * 4;
      minimum = Math.min(
        minimum,
        (pixels[offset] ?? 255) * 0.2126
          + (pixels[offset + 1] ?? 255) * 0.7152
          + (pixels[offset + 2] ?? 255) * 0.0722,
      );
    }
  }
  return minimum;
}

describe("dry-media one-fill crossing raster quality", () => {
  it("keeps every core dry medium at one stroke-local crossing alpha", async () => {
    const module = await import("@resvg/resvg-wasm");
    const require = createRequire(import.meta.url);
    await module.initWasm(
      await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")),
    );
    for (const brushId of [
      "crayon",
      "chalk",
      "charcoal",
      "pastel",
      "oil-pastel",
    ] as const) {
      for (const points of [
        [14, 14, 86, 86, 14, 86, 86, 14],
        [12, 50, 88, 50, 12, 50, 88, 50],
      ]) {
        const mark = plannedMark(brushId, points);
        const renderer = new module.Resvg(
          [
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">',
            '<rect width="100" height="100" fill="#fff"/>',
            `<path d="${pathFor(mark)}" fill="${mark.color}" fill-rule="nonzero" opacity=".55"/>`,
            "</svg>",
          ].join(""),
          { shapeRendering: 2, font: { loadSystemFonts: false } },
        );
        const rendered = renderer.render();
        try {
          const crossing = minimumLuminance(
            rendered.pixels,
            rendered.width,
            50,
            50,
            4,
          );
          const arm = minimumLuminance(
            rendered.pixels,
            rendered.width,
            points[0] === 14 ? 31 : 34,
            points[0] === 14 ? 31 : 50,
            4,
          );
          // One path fill can occupy more paper at a crossing, but a covered pixel never receives
          // a second alpha deposit. The darkest covered pixels therefore remain identical.
          expect(Math.abs(crossing - arm), brushId).toBeLessThanOrEqual(2);
          expect(crossing, brushId).toBeLessThan(210);
        } finally {
          rendered.free();
          renderer.free();
        }
      }
    }
  });
});
