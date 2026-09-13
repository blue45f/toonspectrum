import { describe, expect, it } from "vitest";
import { analyzeBrushStudioV6Program, createBrushStudioV6Program, normalizeBrushStudioV6Program, replaceBrushStudioV6Slot } from "./brush-studio-v6-engine";
import { brushStudioV6MaterialMarksToSvg, createBrushStudioV6MaterialStroke, normalizeBrushStudioV6MaterialConfig } from "./brush-studio-v6-material-engine";
import { BRUSH_STUDIO_V6_TOPOLOGIES } from "./brush-studio-v6-topology-catalog";
import { createBrushStudioV6TopologyStroke } from "./brush-studio-v6-topology-engine";
import { createBrushStudioV6ProductBrush } from "./brush-studio-v6-product-bridge";
import { isStudioBrushEngineProgramWireValue } from "@/shared/lib/studio-brush-material-program-contract";
import { planStudioMaterialBrush, StudioMaterialBrushPlanner, studioMaterialBrushBounds } from "../brush/studio-material-brush-runtime";

const ids = BRUSH_STUDIO_V6_TOPOLOGIES.map((entry) => entry.recipeId);
const points = Array.from({ length: 61 }, (_, i) => ({ x: 30 + i * 3, y: 60 + Math.sin(i / 9) * 22, pressure: 0.15 + 0.8 * Math.sin(Math.PI * i / 60), tilt: 0.3, twist: i * 2 }));
function paint(id: string) {
  const stroke = createBrushStudioV6MaterialStroke(createBrushStudioV6Program(id));
  return points.flatMap((point) => stroke.push(point));
}
function element(id: string) {
  const material = normalizeBrushStudioV6MaterialConfig(createBrushStudioV6Program(id))!;
  return { points: points.flatMap((point) => [point.x, point.y]), pressures: points.map((point) => point.pressure),
    stroke: "#243c56", strokeWidth: 38, opacity: 0.8, brushEnginePrograms: { version: 1 as const, material } };
}

describe("versioned stroke topology kernels", () => {
  it.each(ids)("%s runs without GPU, WASM, special input or fictional GPU allocations", (id) => {
    const analysis = analyzeBrushStudioV6Program(createBrushStudioV6Program(id), {
      webgpu: false, wasm: false, webgl2: false, sharedArrayBuffer: false, pointerRawUpdate: false,
      coalescedEvents: false, predictedEvents: false, pressure: false, tilt: false, twist: false, hover: false,
      maxTextureDimension2D: 0, memoryBudgetMb: 64,
    });
    expect(analysis.valid).toBe(true); expect(analysis.estimatedGpuMemoryMb).toBe(0);
    expect(analysis.estimatedSettleMs).toBe(0); expect(analysis.resources).toEqual([]);
    expect(analysis.nodes.every((node) => node.domain === "main" && node.requires.length === 0)).toBe(true);
    expect(analysis.passes.every((pass) => pass.domain === "main")).toBe(true);
  });
  it.each(ids)("%s survives canonical library/wire/JSON round trips", (id) => {
    const program = createBrushStudioV6Program(id), brush = createBrushStudioV6ProductBrush(program);
    expect(isStudioBrushEngineProgramWireValue(brush.enginePrograms)).toBe(true);
    expect(normalizeBrushStudioV6Program(JSON.parse(JSON.stringify(program)))).toEqual(program);
    const restored = createBrushStudioV6MaterialStroke(brush.enginePrograms!.material!);
    expect(points.flatMap((point) => restored.push(point))).toEqual(paint(id));
  });
  it.each(ids)("%s is deterministic across reset and suppresses duplicate/invalid input", (id) => {
    const stroke = createBrushStudioV6MaterialStroke(createBrushStudioV6Program(id));
    const first = points.flatMap((point) => stroke.push(point));
    expect(stroke.push(points.at(-1)!)).toEqual([]);
    expect(stroke.push({ x: NaN, y: 0, pressure: 1 })).toEqual([]);
    stroke.reset();
    expect(stroke.push({ x: 0, y: 0, pressure: 0 })).toEqual([]);
    stroke.reset();
    expect(points.flatMap((point) => stroke.push(point))).toEqual(first);
  });
  it.each(ids)("%s preserves arc-distance output across sparse/coalesced straight input", (id) => {
    const line = (steps: number) => {
      const stroke = createBrushStudioV6MaterialStroke(createBrushStudioV6Program(id));
      return Array.from({ length: steps + 1 }, (_, i) => ({ x: 30 + i * 180 / steps, y: 80, pressure: 0.65 })).flatMap((p) => stroke.push(p));
    };
    const sparse = line(12), dense = line(180);
    expect(sparse.length).toBe(dense.length);
    for (let i = 0; i < sparse.length; i++) {
      for (const key of ["x", "y", "radiusX", "radiusY", "angle", "opacity"] as const) expect(sparse[i]![key]).toBeCloseTo(dense[i]![key], 7);
      expect(sparse[i]!.color).toBe(dense[i]!.color);
    }
  });
  it.each(ids)("%s streams the same product contacts and rebuilds corrected prefixes", (id) => {
    const source = element(id), planner = new StudioMaterialBrushPlanner();
    const streamed = points.flatMap((_, i) => planner.append({ ...source, points: source.points.slice(0, (i + 1) * 2), pressures: source.pressures.slice(0, i + 1) }, true).marks);
    expect(streamed).toEqual(planStudioMaterialBrush(source));
    const corrected = { ...source, pressures: source.pressures.map((p, i) => i === 3 ? 0.02 : p) };
    const next = planner.append(corrected, true);
    expect(next.reset).toBe(true); expect(next.marks).toEqual(planStudioMaterialBrush(corrected));
  });
  it.each(ids)("%s bounds state, sparse-segment work and geometry", (id) => {
    const base = createBrushStudioV6Program(id);
    const program = { ...base, tuning: { ...base.tuning, size: 240, spacing: 0.01, particleCount: 4096, bristleStrands: 128 } };
    const topology = createBrushStudioV6TopologyStroke(program, 2.4)!;
    expect(topology.retainedStateBytes).toBeLessThanOrEqual(1312);
    expect(topology.maxPrimitivesPerDab).toBeLessThanOrEqual(66);
    const stroke = createBrushStudioV6MaterialStroke(program, { maxMarksPerPush: 128 });
    stroke.push({ x: 0, y: 0, pressure: 1 });
    const marks = stroke.push({ x: 1_000_000, y: -1_000_000, pressure: 1 });
    expect(marks.length).toBeGreaterThan(0); expect(marks.length).toBeLessThanOrEqual(128);
    expect(stroke.statistics().clippedDabs).toBeGreaterThan(0);
    expect(marks.every((m) => [m.x, m.y, m.radiusX, m.radiusY, m.angle, m.opacity].every(Number.isFinite))).toBe(true);
    expect(marks.every((m) => m.radiusX < 240 * 7 && m.radiusY > 0)).toBe(true);
    const source = element(id), bounds = studioMaterialBrushBounds(source)!;
    expect(planStudioMaterialBrush(source).every((m) => m.x >= bounds.x && m.x <= bounds.x + bounds.width && m.y >= bounds.y && m.y <= bounds.y + bounds.height)).toBe(true);
  });
  it("does not enable a future or unversioned carrier and clears incompatible nodes only on explicit selection", () => {
    const program = createBrushStudioV6Program("oil-hair-mixer"), original = structuredClone(program);
    expect(createBrushStudioV6TopologyStroke({ ...program, slots: { ...program.slots, carrier: "carrier-cpu-spring-filaments-v2" } }, 1)).toBeNull();
    const next = replaceBrushStudioV6Slot(program, "carrier", BRUSH_STUDIO_V6_TOPOLOGIES[0]!.id);
    expect(next.slots.physics).toEqual([]); expect(next.slots.pickup).toBe("pickup-none");
    expect(next.tuning).toEqual(program.tuning); expect(program).toEqual(original);
  });
  it("has distinct geometries independently of colors", () => {
    const geometry = ids.map((id) => brushStudioV6MaterialMarksToSvg(paint(id).map((m) => ({ ...m, color: "#000000", opacity: 1 }))));
    expect(new Set(geometry).size).toBe(ids.length);
  });
});
