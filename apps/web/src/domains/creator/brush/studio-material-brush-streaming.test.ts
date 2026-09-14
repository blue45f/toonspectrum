import { describe, expect, it } from "vitest";
import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";
import { runStudioSvgExportWorker } from "../export/studio-svg-export-worker-client";
import {
  planStudioMaterialBrush, StudioMaterialBrushPlanner, StudioMaterialBrushRenderCache,
  studioMaterialBrushMarksToSvg, studioMaterialBrushToSvg, visitStudioMaterialBrushBatches,
  writeStudioMaterialBrushSvg, StudioMaterialBrushSvgBudgetError,
  STUDIO_MATERIAL_BRUSH_CACHE_MARK_BUDGET, STUDIO_MATERIAL_BRUSH_BATCH_MARKS,
  type StudioMaterialBrushElement,
} from "./studio-material-brush-runtime";

function element(count = 30): StudioMaterialBrushElement {
  const program = createBrushStudioV6Program("oil-hair-mixer");
  const brush = createBrushStudioV6ProductBrush({ ...program, tuning: { ...program.tuning, size: 26, spacing: 0.01, bristleStrands: 128 } });
  return {
    points: Array.from({ length: count }, (_, i) => [100 + Math.cos(i * 0.35 / 65) * 65, 100 + Math.sin(i * 0.35 / 65) * 65]).flat(),
    pressures: Array.from({ length: count }, () => 0.7), stroke: brush.color, strokeWidth: 26,
    opacity: 0.7, brushEnginePrograms: brush.enginePrograms!,
  };
}
function countingContext() {
  let fills = 0;
  return {
    get fills() { return fills; }, globalAlpha: 1,
    save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {}, closePath() {},
    ellipse() {}, rect() {}, roundRect() {}, fillRect() { fills++; }, fill() { fills++; }, stroke() { fills++; },
  } as unknown as CanvasRenderingContext2D & { readonly fills: number };
}

describe("bounded whole-stroke material replay", () => {
  it("streams every contact of a 10k-sample128-strand committed stroke without retaining its mark history", () => {
    const source = element(10_000);
    let delivered = 0;
    let lastX = 0;
    const statistics = visitStudioMaterialBrushBatches(source, (batch) => {
      expect(batch.length).toBeLessThanOrEqual(STUDIO_MATERIAL_BRUSH_BATCH_MARKS);
      delivered += batch.length;
      lastX = batch.at(-1)!.x;
    });
    expect(delivered).toBeGreaterThan(1_000_000);
    expect(statistics.totalMarks).toBe(delivered);
    expect(statistics.maxGeneratedBatchMarks).toBeLessThanOrEqual(8192);
    expect(Math.abs(lastX - source.points.at(-2)!)).toBeLessThan(40);
    const context = countingContext();
    const cache = new StudioMaterialBrushRenderCache();
    const rendered = cache.render(context, source);
    expect(rendered.totalMarks).toBe(delivered);
    expect(context.fills).toBe(delivered);
    expect(cache.statistics()).toEqual({ entries: 0, retainedMarks: 0 });
  });

  it("notifies correction reset before streaming rebuilt batches", () => {
    const source = element();
    const planner = new StudioMaterialBrushPlanner();
    planner.append(source);
    const corrected = { ...source, points: [...source.points] };
    corrected.points[6] = corrected.points[6]! + 10;
    let cleared = false;
    const actual: typeof source.points[] = [];
    const marks: ReturnType<typeof planStudioMaterialBrush>[number][] = [];
    planner.appendBatches(corrected, (batch) => { expect(cleared).toBe(true); marks.push(...batch); actual.push([batch.length]); }, true, () => { cleared = true; });
    expect(actual.length).toBeGreaterThan(0);
    expect(marks).toEqual(planStudioMaterialBrush(corrected));
  });

  it("keeps small cached contacts bounded and detects in-place source/config mutations", () => {
    const source = JSON.parse(JSON.stringify(element(8))) as StudioMaterialBrushElement;
    const cache = new StudioMaterialBrushRenderCache();
    const context = countingContext();
    expect(cache.render(context, source).cacheHit).toBe(false);
    expect(cache.render(context, source).cacheHit).toBe(true);
    (source.points as number[])[0]! += 1;
    expect(cache.render(context, source).cacheHit).toBe(false);
    (source.pressures as number[])[0] = 0.2;
    expect(cache.render(context, source).cacheHit).toBe(false);
    const tuning = source.brushEnginePrograms!.material!.tuning as { flow: number };
    tuning.flow *= 0.5;
    expect(cache.render(context, source).cacheHit).toBe(false);
    for (let i = 0; i < 50; i++) cache.render(context, { ...source, points: [...source.points] });
    expect(cache.statistics().retainedMarks).toBeLessThanOrEqual(STUDIO_MATERIAL_BRUSH_CACHE_MARK_BUDGET);
    expect(cache.statistics().entries).toBeLessThanOrEqual(32);
  });

  it("streams exact SVG contact order and rejects a size overflow before returning partial output", () => {
    const source = { ...element(), symmetry: { type: "radial" as const, radialCount: 4, centerX: 100, centerY: 100 } };
    expect(studioMaterialBrushToSvg(source)).toBe(studioMaterialBrushMarksToSvg(planStudioMaterialBrush(source), source.symmetry));
    let receivedBytes = 0;
    expect(() => writeStudioMaterialBrushSvg(source, (chunk) => { receivedBytes += chunk.length * 2; }, 1000))
      .toThrow(StudioMaterialBrushSvgBudgetError);
    expect(receivedBytes).toBeLessThanOrEqual(1000);
  });

  it("rejects oversized material SVG through the public asynchronous export API", async () => {
    const source = element(80);
    const sparse = { ...source, points: Array.from({ length: 80 }, (_, i) => [i * 5000, 100]).flat(),
      pressures: source.pressures?.slice(), tiltXs: source.tiltXs?.slice(),
      tiltYs: source.tiltYs?.slice(), twists: source.twists?.slice() };
    await expect(runStudioSvgExportWorker({ width: 800, height: 800, bg: "transparent", elements: [{
      ...sparse, id: "large-material-export", type: "draw", kind: "freehand", mode: "pen", brush: "brush",
    }] }, { executionBackend: "direct" })).rejects.toMatchObject({
      name: "StudioMaterialBrushSvgBudgetError", message: expect.stringContaining("PNG"),
    });
  });
});
