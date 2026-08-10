import { describe, expect, it } from "vitest";

import { brushProgramIRSchema, evaluateDynamicMapping } from "../ir/brush";
import { paintIRSchema } from "../ir/color";
import { validateEffectGraph } from "../ir/effect";
import { pathBounds, pathToSvgData, polylineToPath } from "../ir/path";
import { collectSceneFeatures } from "../ir/scene-features";
import { applyPressureCurve, deviceCalibrationIRSchema } from "../ir/stroke";

import type { SceneIR } from "../ir/scene";

describe("BrushProgramIR", () => {
  it("fills defaults for a minimal preset and round-trips", () => {
    const preset = brushProgramIRSchema.parse({ id: "g-pen", name: "G-Pen" });
    expect(preset.geometry.kind).toBe("perfect-freehand");
    expect(preset.output.target).toBe("vector-path");
    expect(brushProgramIRSchema.parse(preset)).toEqual(preset);
  });

  it("evaluates dynamic mapping LUTs with interpolation", () => {
    const mapping = {
      input: "pressure" as const,
      curve: [0, 0.5, 1],
      min: 2,
      max: 10,
    };
    expect(evaluateDynamicMapping(mapping, 0)).toBe(2);
    expect(evaluateDynamicMapping(mapping, 1)).toBe(10);
    expect(evaluateDynamicMapping(mapping, 0.25)).toBeCloseTo(4);
  });
});

describe("PaintIR sweep-gradient", () => {
  const sweep = {
    kind: "sweep-gradient" as const,
    center: [64, 64] as [number, number],
    startAngleDeg: 45,
    endAngleDeg: 270,
    stops: [
      { offset: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
      { offset: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
    ],
  };

  it("round-trips through the schema unchanged", () => {
    const parsed = paintIRSchema.parse(sweep);
    expect(parsed).toEqual(sweep);
    expect(paintIRSchema.parse(parsed)).toEqual(parsed);
  });

  it("rejects a degenerate angle window (end <= start)", () => {
    expect(() =>
      paintIRSchema.parse({ ...sweep, startAngleDeg: 270, endAngleDeg: 270 }),
    ).toThrow(/endAngleDeg > startAngleDeg/);
    expect(() =>
      paintIRSchema.parse({ ...sweep, startAngleDeg: 270, endAngleDeg: 90 }),
    ).toThrow(/endAngleDeg > startAngleDeg/);
  });

  it("surfaces the sweep capability token in scene features", () => {
    const scene: SceneIR = {
      version: 11,
      width: 128,
      height: 128,
      background: { r: 1, g: 1, b: 1, a: 1 },
      nodes: [
        {
          id: "n1",
          kind: "fill-path",
          opacity: 1,
          blend: "src-over",
          path: { verbs: [] },
          paint: sweep,
          fillRule: "nonzero",
        },
      ],
    };
    expect(collectSceneFeatures(scene)).toEqual([
      "render.vector.fill",
      "render.vector.gradient",
      "render.vector.gradient.sweep",
    ]);
  });
});

describe("DeviceCalibrationIR", () => {
  it("applies dead zone and LUT interpolation", () => {
    const calibration = deviceCalibrationIRSchema.parse({
      deviceId: "wacom-1",
      pressureCurve: [0, 1],
      pressureDeadZone: 0.1,
    });
    expect(applyPressureCurve(calibration, 0.05)).toBe(0);
    expect(applyPressureCurve(calibration, 1)).toBe(1);
    expect(applyPressureCurve(calibration, 0.55)).toBeCloseTo(0.5);
  });
});

describe("EffectGraphIR validation", () => {
  it("accepts a valid chain", () => {
    const issues = validateEffectGraph({
      nodes: [
        { id: "blur", op: "core.gaussian-blur", params: { radius: 4 }, inputs: ["source"], colorSpace: "linear" },
        { id: "grade", op: "core.levels", params: {}, inputs: ["blur"], colorSpace: "linear" },
      ],
      output: "grade",
    });
    expect(issues).toEqual([]);
  });

  it("reports cycles, unknown inputs and unknown output", () => {
    const issues = validateEffectGraph({
      nodes: [
        { id: "a", op: "x", params: {}, inputs: ["b"], colorSpace: "linear" },
        { id: "b", op: "x", params: {}, inputs: ["a", "ghost"], colorSpace: "linear" },
      ],
      output: "missing",
    });
    const messages = issues.map((issue) => issue.message).join("\n");
    expect(messages).toContain("cycle");
    expect(messages).toContain('unknown input "ghost"');
    expect(messages).toContain("unknown output");
  });
});

describe("PathIR helpers", () => {
  it("computes conservative bounds and svg data", () => {
    const path = polylineToPath(
      [
        [0, 0],
        [10, 4],
        [-2, 8],
      ],
      true,
    );
    expect(pathBounds(path)).toEqual({ minX: -2, minY: 0, maxX: 10, maxY: 8 });
    expect(pathToSvgData(path)).toBe("M 0 0 L 10 4 L -2 8 Z");
    expect(pathBounds({ verbs: [] })).toBeNull();
  });
});
