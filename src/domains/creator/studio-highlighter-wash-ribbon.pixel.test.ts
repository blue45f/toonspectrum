import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { planStudioFxBrushPressurePath } from "./studio-fx-brush";
import {
  planStudioHighlighterWashRibbon,
  studioHighlighterWashPlanPathData,
} from "./studio-highlighter-wash-ribbon";
import { STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1 } from "./studio-material-pressure-model";

describe("Studio highlighter one-wash raster coverage", () => {
  it("fills crossings, exact retraces and U-turns once without winding cancellation", async () => {
    const module = await import("@resvg/resvg-wasm");
    const require = createRequire(import.meta.url);
    await module.initWasm(
      await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")),
    );

    const render = (points: readonly number[]) => {
      const pressurePath = planStudioFxBrushPressurePath({
        brushId: "highlighter",
        points,
        pressures: Array.from(
          { length: Math.floor(points.length / 2) },
          () => 0.5,
        ),
        pressureModel: STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1,
        tension: 0,
      });
      const wash = planStudioHighlighterWashRibbon({
        brushId: "highlighter",
        pressurePath,
        baseWidth: 10,
      });
      const renderer = new module.Resvg(
        [
          '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="64">',
          `<path d="${studioHighlighterWashPlanPathData(wash)}" fill="#000" fill-rule="nonzero" opacity="0.5"/>`,
          "</svg>",
        ].join(""),
        {
          shapeRendering: 2,
          font: { loadSystemFonts: false },
        },
      );
      const rendered = renderer.render();
      return {
        alphaAt: (x: number, y: number) => (
          rendered.pixels[(y * rendered.width + x) * 4 + 3] ?? 0
        ),
        free: () => {
          rendered.free();
          renderer.free();
        },
      };
    };

    const cases = [
      {
        label: "figure-eight crossing",
        points: [10, 10, 50, 50, 10, 50, 50, 10],
        samples: [[20, 20], [30, 30]] as const,
      },
      {
        // Production P1: the old self-intersecting outline produced alpha=0 around x=40.
        label: "exact out-back retrace",
        points: [20, 30, 50, 30, 20, 30],
        samples: [[30, 30], [40, 30], [49, 30]] as const,
      },
      {
        label: "tight U-turn",
        points: [15, 22, 50, 22, 50, 30, 15, 30],
        samples: [[30, 22], [48, 26], [30, 30]] as const,
      },
      {
        label: "repeated reversal",
        points: [15, 44, 52, 44, 15, 44, 52, 44, 15, 44],
        samples: [[25, 44], [38, 44], [50, 44]] as const,
      },
    ];

    for (const testCase of cases) {
      const rendered = render(testCase.points);
      try {
        const alphas = testCase.samples.map(([x, y]) => rendered.alphaAt(x, y));
        expect(
          Math.min(...alphas),
          `${testCase.label} must not contain a winding hole`,
        ).toBeGreaterThanOrEqual(120);
        expect(
          Math.max(...alphas) - Math.min(...alphas),
          `${testCase.label} must receive one same-stroke wash`,
        ).toBeLessThanOrEqual(2);
        expect(
          Math.max(...alphas),
          `${testCase.label} must not alpha-stack compound subpaths`,
        ).toBeLessThanOrEqual(130);
      } finally {
        rendered.free();
      }
    }
  });
});
