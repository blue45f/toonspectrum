import { describe, expect, it, vi } from "vitest";
import { BRUSH_STUDIO_V6_RECIPES, createBrushStudioV6Program, patchBrushStudioV6Tuning } from "./brush-studio-v6-engine";
import { brushStudioV6MaterialActiveTuningKeys, brushStudioV6MaterialMarksToSvg, createBrushStudioV6MaterialStroke, mapBrushStudioV6Pressure, mixBrushStudioV6MaterialColors, normalizeBrushStudioV6MaterialConfig, renderBrushStudioV6MaterialMarks, sampleBrushStudioV6PaperContact, type BrushStudioV6MaterialMark, type BrushStudioV6MaterialPoint } from "./brush-studio-v6-material-engine";

const line = (steps: number, length = 180): BrushStudioV6MaterialPoint[] => Array.from({ length: steps + 1 }, (_, index) => ({ x: index * length / steps, y: 30, pressure: 0.65, tilt: 0.3, twist: 20 }));
function paint(id: string, points: readonly BrushStudioV6MaterialPoint[]): readonly BrushStudioV6MaterialMark[] {
  const stroke = createBrushStudioV6MaterialStroke(createBrushStudioV6Program(id));
  return points.flatMap((point) => stroke.push(point));
}

describe("portable V6 material contacts", () => {
  it("normalizes every signature and survives a JSON receipt without loading provider code", () => {
    for (const recipe of BRUSH_STUDIO_V6_RECIPES) {
      const config = normalizeBrushStudioV6MaterialConfig(recipe.create());
      expect(config, recipe.id).not.toBeNull();
      expect(config?.version).toBe(1);
      expect(normalizeBrushStudioV6MaterialConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
      expect(Object.isFrozen(config?.tuning)).toBe(true);
    }
  });

  it("rejects malformed, future-version and unsafe color receipts", () => {
    const config = normalizeBrushStudioV6MaterialConfig(createBrushStudioV6Program())!;
    expect(normalizeBrushStudioV6MaterialConfig({ ...config, version: 2 })).toBeNull();
    expect(normalizeBrushStudioV6MaterialConfig({ ...config, tuning: { ...config.tuning, flow: NaN } })).toBeNull();
    expect(normalizeBrushStudioV6MaterialConfig({ ...config, tuning: { ...config.tuning, primaryColor: '<script>' } })).toBeNull();
    expect(normalizeBrushStudioV6MaterialConfig({ ...config, slots: { ...config.slots, physics: [null] } })).toBeNull();
  });

  it("preserves calibrated pressure and pigment endpoints", () => {
    const input = createBrushStudioV6Program().input;
    expect(mapBrushStudioV6Pressure(input.pressureOnset, input)).toBe(0);
    expect(mapBrushStudioV6Pressure(input.pressureSaturation, input)).toBe(1);
    expect(mapBrushStudioV6Pressure(NaN, input)).toBe(0);
    expect(mixBrushStudioV6MaterialColors("#0102fe", "#fa0804", 0)).toBe("#0102fe");
    expect(mixBrushStudioV6MaterialColors("#0102fe", "#fa0804", 1)).toBe("#fa0804");
    expect(mixBrushStudioV6MaterialColors("#ffe000", "#0050dc", 0.5, true)).not.toBe(mixBrushStudioV6MaterialColors("#ffe000", "#0050dc", 0.5, false));
  });

  it("produces the same straight stroke at sparse and coalesced input rates", () => {
    for (const id of ["clean-ink", "velvet-graphite", "oil-hair-mixer", "dendritic-copper", "holographic-stitch"]) {
      const sparse = paint(id, line(12));
      const dense = paint(id, line(180));
      expect(sparse.length, id).toBe(dense.length);
      for (let index = 0; index < sparse.length; index++) {
        const a = sparse[index]!;
        const b = dense[index]!;
        expect(a.x, `${id} x ${index}`).toBeCloseTo(b.x, 8);
        expect(a.y, `${id} y ${index}`).toBeCloseTo(b.y, 8);
        expect(a.opacity, `${id} alpha ${index}`).toBeCloseTo(b.opacity, 8);
        expect(a.color).toBe(b.color);
      }
    }
  });

  it("does not deposit extra pigment for duplicate input or zero-pressure taps", () => {
    const stroke = createBrushStudioV6MaterialStroke(createBrushStudioV6Program());
    expect(stroke.push({ x: 12, y: 10, pressure: 0 })).toEqual([]);
    expect(stroke.push({ x: 12, y: 10, pressure: 0.7 })).toEqual([]);
    stroke.push({ x: 50, y: 10, pressure: 0.7 });
    const count = stroke.statistics().emittedMarks;
    expect(stroke.push({ x: 50, y: 10, pressure: 0.7 })).toEqual([]);
    expect(stroke.statistics().emittedMarks).toBe(count);
    expect(stroke.push({ x: NaN, y: 10, pressure: 1 })).toEqual([]);
  });

  it("depletes individual bristles with distance and preserves deterministic reset", () => {
    const program = patchBrushStudioV6Tuning(createBrushStudioV6Program("oil-hair-mixer"), { pickup: 0, reservoir: 0.4 });
    const stroke = createBrushStudioV6MaterialStroke(program);
    const points = line(100, 1000);
    const first = stroke.push(points[0]!);
    let last: readonly BrushStudioV6MaterialMark[] = [];
    for (const point of points.slice(1)) last = stroke.push(point);
    const mean = (marks: readonly BrushStudioV6MaterialMark[]) => marks.reduce((sum, mark) => sum + mark.opacity, 0) / marks.length;
    expect(mean(last)).toBeLessThan(mean(first) * 0.5);
    stroke.reset();
    expect(stroke.push(points[0]!)).toEqual(first);
  });

  it("keeps particle reaction, bristles and dry contact mechanically distinct", () => {
    const copper = paint("dendritic-copper", line(20));
    expect(copper.some((mark) => mark.kind === "particle" && mark.shape === "rect")).toBe(true);
    expect(copper.some((mark) => mark.kind === "grain")).toBe(false);
    expect(paint("velvet-graphite", line(20)).every((mark) => mark.kind === "grain")).toBe(true);
    const swarm = paint("kaleido-swarm", line(20));
    expect(swarm.some((mark) => mark.kind === "particle")).toBe(true);
    expect(swarm.some((mark) => mark.kind === "pattern")).toBe(true);
    expect(brushStudioV6MaterialActiveTuningKeys(createBrushStudioV6Program("dendritic-copper")).has("reactionRate")).toBe(true);
  });

  it("anchors halftone centers to document coordinates and confines them to contacts", () => {
    const program = createBrushStudioV6Program("document-halftone");
    const marks = paint("document-halftone", line(24));
    const scale = 12 * program.tuning.patternScale;
    for (const mark of marks) {
      expect((mark.x / scale - 0.5) % 1).toBeCloseTo(0, 8);
      expect((mark.y / scale - 0.5) % 1).toBeCloseTo(0, 8);
      expect(Math.abs(mark.y - 30)).toBeLessThan(program.tuning.size);
    }
  });

  it("changes physical contact when paper is changed and keeps paper anchored across strokes", () => {
    const surfaces = ["surface-smooth", "surface-kent", "surface-coldpress", "surface-linen", "surface-porous", "surface-printmaking"];
    const samples = surfaces.map((surface) => Array.from({ length: 24 }, (_, index) => sampleBrushStudioV6PaperContact(surface, index * 1.7, index * 0.83, 123)));
    expect(new Set(samples.map((sample) => JSON.stringify(sample))).size).toBe(surfaces.length);
    expect(samples[0]?.every((sample) => sample === 0.08)).toBe(true);
    for (const sample of samples.flat()) { expect(sample).toBeGreaterThanOrEqual(0); expect(sample).toBeLessThanOrEqual(1); }
    const program = createBrushStudioV6Program("velvet-graphite");
    const outputs = surfaces.map((surface) => {
      const material = createBrushStudioV6MaterialStroke({ ...program, slots: { ...program.slots, surface } });
      return line(20).flatMap((point) => material.push(point)).reduce((sum, mark) => sum + mark.opacity, 0);
    });
    expect(new Set(outputs.map((value) => value.toFixed(6))).size).toBe(surfaces.length);
  });

  it("bounds exceptional sparse segments and still covers the tail", () => {
    const stroke = createBrushStudioV6MaterialStroke(createBrushStudioV6Program(), { maxMarksPerPush: 512 });
    stroke.push({ x: 0, y: 0, pressure: 0.7 });
    const marks = stroke.push({ x: 100000, y: 0, pressure: 0.7 });
    expect(marks.length).toBeLessThanOrEqual(512);
    expect(marks.at(-1)?.x).toBeGreaterThan(99990);
    expect(stroke.statistics().clippedDabs).toBeGreaterThan(0);
    const next = stroke.push({ x: 100006, y: 0, pressure: 0.7 });
    expect(next.length).toBeGreaterThan(0);
    expect(next[0]?.x).toBeGreaterThanOrEqual(100000);
  });

  it("serializes the same colored contacts and multiplies inherited opacity", () => {
    const mark = paint("clean-ink", line(2))[0]!;
    const observed: number[] = [];
    const context = { globalAlpha: 0.4, save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(), ellipse: vi.fn(), fill: () => { observed.push(context.globalAlpha); } };
    renderBrushStudioV6MaterialMarks(context as unknown as CanvasRenderingContext2D, [mark]);
    expect(observed[0]).toBeCloseTo(mark.opacity * 0.4, 10);
    expect(brushStudioV6MaterialMarksToSvg([mark])).toContain(`fill="${mark.color}"`);
    expect(brushStudioV6MaterialMarksToSvg([mark])).toContain('<ellipse');
  });
});
