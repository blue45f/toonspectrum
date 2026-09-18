import { describe, expect, it } from "vitest";

import {
  BRUSH_STUDIO_V6_FULL_CAPABILITIES,
  analyzeBrushStudioV6Program,
  createBrushStudioV6Program,
} from "./brush-studio-v6-engine";
import {
  brushStudioV6MaterialNodeExecution,
  createBrushStudioV6MaterialStroke,
  type BrushStudioV6MaterialMark,
  type BrushStudioV6MaterialPoint,
} from "./brush-studio-v6-material-engine";
import { BRUSH_STUDIO_V7_ADVANCED_RECIPE_SEEDS } from "./brush-studio-v6-recipe-catalog-material-v7-advanced";
import {
  sampleBrushStudioV7BackrunLobes,
  sampleBrushStudioV7BristleBundle,
  sampleBrushStudioV7Sediment,
  sampleBrushStudioV7VectorField,
  shadeBrushStudioV7ReliefColor,
} from "./brush-studio-v7-advanced-physics";

const ADVANCED_NODE_IDS = [
  "physics-backrun-capillary", "physics-pigment-sedimentation", "physics-bristle-split-merge",
  "pattern-vector-flow", "pattern-vector-vortex", "pattern-vector-contour",
  "pattern-textile-satin", "pattern-textile-twill", "finish-directional-relief",
] as const;function line(steps: number, length = 240): BrushStudioV6MaterialPoint[] {
  return Array.from({ length: steps + 1 }, (_, index) => ({
    x: index * length / steps,
    y: 40 + Math.sin(index / steps * Math.PI * 2) * 14,
    pressure: 0.72,
    tilt: 0.3,
    twist: 18,
  }));
}

function straightLine(steps: number, length = 240): BrushStudioV6MaterialPoint[] {
  return Array.from({ length: steps + 1 }, (_, index) => ({
    x: index * length / steps, y: 40, pressure: 0.72, tilt: 0.3, twist: 18,
  }));
}

function render(id: string, points = line(36)): readonly BrushStudioV6MaterialMark[] {
  const stroke = createBrushStudioV6MaterialStroke(createBrushStudioV6Program(id));
  return points.flatMap((point) => stroke.push(point));
}

function withoutPhysics(id: string, physicsId: string): readonly BrushStudioV6MaterialMark[] {
  const base = createBrushStudioV6Program(id);
  const program = {
    ...base,
    slots: { ...base.slots, physics: base.slots.physics.filter((entry) => entry !== physicsId) },
  };
  const stroke = createBrushStudioV6MaterialStroke(program);
  return line(36).flatMap((point) => stroke.push(point));
}

function signature(marks: readonly BrushStudioV6MaterialMark[]): string[] {
  return marks.map((mark) => [mark.kind, mark.shape, mark.x.toFixed(6), mark.y.toFixed(6),
    mark.radiusX.toFixed(6), mark.radiusY.toFixed(6), mark.angle.toFixed(6),
    mark.opacity.toFixed(7), mark.color].join(":"));
}describe("Brush Studio V7.1 advanced media physics", () => {
  it("registers twenty-four advanced signatures and executes every new node natively", () => {
    expect(BRUSH_STUDIO_V7_ADVANCED_RECIPE_SEEDS).toHaveLength(24);
    expect(new Set(BRUSH_STUDIO_V7_ADVANCED_RECIPE_SEEDS.map((entry) => entry.id)).size).toBe(24);
    expect(ADVANCED_NODE_IDS.every((id) => brushStudioV6MaterialNodeExecution(id) === "native")).toBe(true);
    for (const seed of BRUSH_STUDIO_V7_ADVANCED_RECIPE_SEEDS) {
      const analysis = analyzeBrushStudioV6Program(createBrushStudioV6Program(seed.id), BRUSH_STUDIO_V6_FULL_CAPABILITIES);
      expect(analysis.valid, `${seed.id}: ${analysis.issues.map((issue) => issue.id).join(", ")}`).toBe(true);
    }
  });

  it("keeps backrun, sediment and bristle bundle helpers deterministic and bounded", () => {
    const backrunInput = { x: 20, y: 30, radius: 18, direction: 0.4, index: 6, seed: 73,
      wetness: 0.9, diffusion: 0.8, absorbency: 0.7, evaporation: 0.8, advection: 0.6,
      fiberAngle: 0.7, anisotropy: 0.8, tooth: 0.6 };
    const lobes = sampleBrushStudioV7BackrunLobes(backrunInput);
    expect(lobes).toEqual(sampleBrushStudioV7BackrunLobes(backrunInput));
    expect(lobes.length).toBeGreaterThanOrEqual(2);
    expect(lobes.every((entry) => entry.opacity >= 0 && entry.opacity <= 1 && entry.radiusX > 0 && entry.radiusY > 0)).toBe(true);
    const sedimentInput = { x: 20, y: 30, radius: 18, index: 8, seed: 91,
      granulation: 0.95, absorbency: 0.72, tooth: 0.84, fiberAngle: 0.3, anisotropy: 0.7 };
    const sediment = sampleBrushStudioV7Sediment(sedimentInput);
    expect(sediment).toEqual(sampleBrushStudioV7Sediment(sedimentInput));
    expect(sediment.length).toBeGreaterThanOrEqual(2);
    const bundle = sampleBrushStudioV7BristleBundle({ lane: 7, laneCount: 48, pathLength: 83,
      size: 52, seed: 101, pressure: 0.54, friction: 0.9, viscosity: 0.5 });
    expect(bundle).toEqual(sampleBrushStudioV7BristleBundle({ lane: 7, laneCount: 48, pathLength: 83,
      size: 52, seed: 101, pressure: 0.54, friction: 0.9, viscosity: 0.5 }));
    expect([bundle.split, bundle.merge, bundle.branchOpacity].every((value) => value >= 0 && value <= 1)).toBe(true);
  });  it("emits visible cauliflower backrun lobes and valley sediment through the real solver", () => {
    const backrun = render("v7-backrun-cauliflower");
    const backrunBase = withoutPhysics("v7-backrun-cauliflower", "physics-backrun-capillary");
    expect(backrun.length).toBeGreaterThan(backrunBase.length);
    expect(backrun.some((mark) => mark.kind === "wet" && mark.shape === "ring")).toBe(true);

    const sediment = render("v7-sediment-cobalt-granulation");
    const sedimentBase = withoutPhysics("v7-sediment-cobalt-granulation", "physics-pigment-sedimentation");
    expect(sediment.length).toBeGreaterThan(sedimentBase.length);
    expect(sediment.some((mark) => mark.kind === "grain")).toBe(true);
  });

  it("splits bristle bundles into additional deterministic contact branches", () => {
    const split = render("v7-split-fan-oil");
    const base = withoutPhysics("v7-split-fan-oil", "physics-bristle-split-merge");
    expect(split.length).toBeGreaterThan(base.length);
    expect(split.filter((mark) => mark.kind === "bristle").length)
      .toBeGreaterThan(base.filter((mark) => mark.kind === "bristle").length);
    expect(render("v7-split-fan-oil")).toEqual(split);
  });

  it("turns height into directional color response without changing zero-height color", () => {
    expect(shadeBrushStudioV7ReliefColor("#7a5638", 0, 0, 0.8)).toBe("#7a5638");
    const lit = shadeBrushStudioV7ReliefColor("#7a5638", -Math.PI * 0.28, 0.9, 0.8);
    const shadow = shadeBrushStudioV7ReliefColor("#7a5638", Math.PI * 0.72, 0.9, 0.8);
    expect(lit).not.toBe("#7a5638");
    expect(shadow).not.toBe("#7a5638");
    expect(lit).not.toBe(shadow);
    const marks = render("v7-raking-light-impasto");
    expect(new Set(marks.filter((mark) => mark.height > 0).map((mark) => mark.color)).size).toBeGreaterThan(1);
  });  it("anchors vector and textile directions to document coordinates", () => {
    const ids = ["pattern-vector-flow", "pattern-vector-vortex", "pattern-vector-contour",
      "pattern-textile-satin", "pattern-textile-twill"] as const;
    for (const id of ids) {
      const samples = Array.from({ length: 18 }, (_, index) =>
        sampleBrushStudioV7VectorField(id, index * 7.3, (index % 5) * 11.2, 517, 1.2, 0.6));
      expect(samples).toEqual(Array.from({ length: 18 }, (_, index) =>
        sampleBrushStudioV7VectorField(id, index * 7.3, (index % 5) * 11.2, 517, 1.2, 0.6)));
      expect(samples.every(Number.isFinite)).toBe(true);
      expect(new Set(samples.map((value) => value.toFixed(5))).size).toBeGreaterThan(2);
    }
    const vectorMarks = render("v7-vector-vortex-ink").filter((mark) => mark.kind === "pattern");
    expect(vectorMarks.length).toBeGreaterThan(20);
    expect(new Set(vectorMarks.map((mark) => mark.angle.toFixed(3))).size).toBeGreaterThan(6);
    const textile = render("v7-textile-twill-denim").filter((mark) => mark.kind === "pattern");
    expect(textile.some((mark) => mark.height > 0)).toBe(true);
  });

  it("fails advanced physics closed when their required source fields are absent", () => {
    const clean = createBrushStudioV6Program("clean-ink");
    const wetWithoutField = { ...clean, slots: { ...clean.slots, physics: ["physics-backrun-capillary"] } };
    const wetAnalysis = analyzeBrushStudioV6Program(wetWithoutField, BRUSH_STUDIO_V6_FULL_CAPABILITIES);
    expect(wetAnalysis.valid).toBe(false);
    expect(wetAnalysis.issues.some((issue) => issue.id === "advanced-wet-without-inkwash")).toBe(true);

    const splitWithoutBristle = { ...clean, slots: { ...clean.slots, physics: ["physics-bristle-split-merge"] } };
    const splitAnalysis = analyzeBrushStudioV6Program(splitWithoutBristle, BRUSH_STUDIO_V6_FULL_CAPABILITIES);
    expect(splitAnalysis.valid).toBe(false);
    expect(splitAnalysis.issues.some((issue) => issue.id === "split-without-bristle")).toBe(true);

    const litWithoutHeight = { ...clean, slots: { ...clean.slots, finish: ["finish-directional-relief"] } };
    const lightAnalysis = analyzeBrushStudioV6Program(litWithoutHeight, BRUSH_STUDIO_V6_FULL_CAPABILITIES);
    expect(lightAnalysis.valid).toBe(false);
    expect(lightAnalysis.issues.some((issue) => issue.id === "relief-without-height")).toBe(true);
  });

  it("keeps every V7.1 signature inside the normal streaming mark budget", () => {
    for (const seed of BRUSH_STUDIO_V7_ADVANCED_RECIPE_SEEDS) {
      const stroke = createBrushStudioV6MaterialStroke(createBrushStudioV6Program(seed.id), { maxMarksPerPush: 2048 });
      let maximum = 0;
      for (let index = 0; index <= 80; index++) {
        const marks = stroke.push({
          x: index * 4,
          y: 52 + Math.sin(index / 9) * 18,
          pressure: 0.58 + Math.sin(index / 17) * 0.24,
          tilt: 0.34,
          twist: index * 1.7,
        });
        maximum = Math.max(maximum, marks.length);
      }
      expect(stroke.statistics().clippedDabs, seed.id).toBe(0);
      expect(maximum, seed.id).toBeLessThan(512);
    }
  });

  it.each(["v7-backrun-cauliflower", "v7-split-fan-oil"])(
    "%s preserves resampled output across sparse and dense input rates",
    (id) => {
      const sparse = render(id, straightLine(18));
      const dense = render(id, straightLine(180));
      expect(signature(dense), id).toEqual(signature(sparse));
    },
  );
});