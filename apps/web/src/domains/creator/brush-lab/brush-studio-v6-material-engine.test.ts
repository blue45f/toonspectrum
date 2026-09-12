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
    for (const id of ["clean-ink", "velvet-graphite", "oil-hair-mixer", "mineral-bloom", "dendritic-copper", "holographic-stitch"]) {
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

  it("renders bristle relief as wider loaded contact ridges in Canvas and SVG", () => {
    const base = createBrushStudioV6Program("oil-hair-mixer");
    const render = (relief: number) => {
      const stroke = createBrushStudioV6MaterialStroke({ ...base, tuning: { ...base.tuning, relief } });
      return line(12).flatMap((point) => stroke.push(point));
    };
    const flat = render(0);
    const raised = render(1);
    expect(raised.length).toBe(flat.length);
    expect(raised.every((mark, index) => mark.radiusY > flat[index]!.radiusY)).toBe(true);
    expect(raised.every((mark, index) => mark.radiusY <= flat[index]!.radiusY * 1.6)).toBe(true);
    expect(brushStudioV6MaterialMarksToSvg(raised)).not.toBe(brushStudioV6MaterialMarksToSvg(flat));
    const paths = (marks: readonly BrushStudioV6MaterialMark[]) => {
      const roundRect = vi.fn(), ellipse = vi.fn();
      const context = { globalAlpha: 1, save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
        beginPath: vi.fn(), closePath: vi.fn(), roundRect, ellipse, fill: vi.fn() };
      renderBrushStudioV6MaterialMarks(context as unknown as CanvasRenderingContext2D, marks);
      return { ridges: roundRect.mock.calls, taps: ellipse.mock.calls };
    };
    expect(paths(raised)).not.toEqual(paths(flat));
  });

  it.each(["oil-hair-mixer", "mineral-bloom"])("%s defers directional contacts until movement and rotates vertical/diagonal starts exactly", (id) => {
    const base = createBrushStudioV6Program(id);
    const program = { ...base, slots: { ...base.slots, surface: "surface-smooth" },
      input: { ...base.input, tiltEnabled: false } };
    const origin = { x: 100, y: 100, pressure: 0.7, tilt: 0, twist: 0 };
    const paintHeading = (angle: number) => {
      const stroke = createBrushStudioV6MaterialStroke(program);
      const tap = stroke.push(origin);
      const moving = stroke.push({ ...origin, x: origin.x + Math.cos(angle) * 36, y: origin.y + Math.sin(angle) * 36 });
      return { tap, moving };
    };
    const horizontal = paintHeading(0);
    expect(horizontal.tap.length).toBeGreaterThan(0);
    expect(horizontal.tap.every((mark) => mark.shape === "ellipse")).toBe(true);
    const firstRidges = horizontal.moving.filter((mark) => mark.shape === "capsule")
      .slice(0, id === "oil-hair-mixer" ? program.tuning.bristleStrands : 2);
    expect(firstRidges.length).toBeGreaterThan(0);
    // The first moving contacts start locally, with no capsule connecting back to a made-up heading.
    expect(firstRidges.every((mark) => Math.abs(mark.radiusX - mark.radiusY) < 1e-9)).toBe(true);
    for (const angle of [Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
      const rotated = paintHeading(angle);
      expect(rotated.tap).toEqual(horizontal.tap);
      expect(rotated.moving.length).toBe(horizontal.moving.length);
      for (let index = 0; index < rotated.moving.length; index++) {
        const original = horizontal.moving[index]!;
        const actual = rotated.moving[index]!;
        const dx = original.x - origin.x, dy = original.y - origin.y;
        expect(actual.x).toBeCloseTo(origin.x + dx * Math.cos(angle) - dy * Math.sin(angle), 8);
        expect(actual.y).toBeCloseTo(origin.y + dx * Math.sin(angle) + dy * Math.cos(angle), 8);
        expect(actual.radiusX).toBeCloseTo(original.radiusX, 8);
        expect(actual.radiusY).toBeCloseTo(original.radiusY, 8);
        expect(actual.opacity).toBeCloseTo(original.opacity, 8);
      }
      // Tap plus streamed movement has the same SVG paint order as the complete plan.
      expect(brushStudioV6MaterialMarksToSvg(rotated.tap) + brushStudioV6MaterialMarksToSvg(rotated.moving))
        .toBe(brushStudioV6MaterialMarksToSvg([...rotated.tap, ...rotated.moving]));
    }
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

  it("deposits wet edge pigment on longitudinal boundaries without ring crossbars", () => {
    const marks = paint("mineral-bloom", line(30));
    expect(marks.some((mark) => mark.shape === "ring")).toBe(false);
    const edges = marks.filter((mark) => mark.shape === "capsule");
    expect(edges.length).toBeGreaterThan(20);
    expect(edges.every((mark) => Math.abs(mark.y - 30) > 10)).toBe(true);
    const program = createBrushStudioV6Program("mineral-bloom");
    const stroke = createBrushStudioV6MaterialStroke(program);
    const first = line(10).flatMap((point) => stroke.push(point));
    stroke.reset();
    expect(line(10).flatMap((point) => stroke.push(point))).toEqual(first);
  });

  it("anchors halftone centers to document coordinates and confines them to contacts", () => {
    const program = createBrushStudioV6Program("document-halftone");
    const solver = createBrushStudioV6MaterialStroke({ ...program, tuning: { ...program.tuning, patternJitter: 0 } });
    const marks = line(24).flatMap((point) => solver.push(point));
    const scale = 12 * program.tuning.patternScale;
    for (const mark of marks) {
      expect((mark.x / scale - 0.5) % 1).toBeCloseTo(0, 8);
      expect((mark.y / scale - 0.5) % 1).toBeCloseTo(0, 8);
      expect(Math.abs(mark.y - 30)).toBeLessThan(program.tuning.size);
    }
  });

  it.each(["pattern-dot-tone", "pattern-cross-hatch", "pattern-weave", "pattern-brick"])(
    "%s applies density and document-seeded jitter to actual contacts",
    (pattern) => {
      const base = createBrushStudioV6Program("clean-ink");
      const program = { ...base, slots: { ...base.slots, pattern }, tuning: { ...base.tuning, size: 80, patternScale: 1, patternDensity: 0.2, patternJitter: 0 } };
      const render = (density: number, jitter: number) => {
        const solver = createBrushStudioV6MaterialStroke({ ...program, tuning: { ...program.tuning, patternDensity: density, patternJitter: jitter } });
        return solver.push({ x: 45, y: 45, pressure: 1, tilt: 0, twist: 0 });
      };
      const thin = render(0.2, 0);
      expect(thin.length).toBeGreaterThan(0);
      expect(render(0.9, 0).map((mark) => mark.radiusY)).not.toEqual(thin.map((mark) => mark.radiusY));
      const jittered = render(0.2, 0.8);
      expect(jittered.map(({ x, y }) => [x, y])).not.toEqual(thin.map(({ x, y }) => [x, y]));
      expect(render(0.2, 0.8)).toEqual(jittered);
      expect(brushStudioV6MaterialActiveTuningKeys(program).has("patternDensity")).toBe(true);
      expect(brushStudioV6MaterialActiveTuningKeys(program).has("patternJitter")).toBe(true);
    },
  );

  it("does not advertise density/scale controls for stitch rings driven by nib size and spacing", () => {
    const base = createBrushStudioV6Program("clean-ink");
    const keys = brushStudioV6MaterialActiveTuningKeys({ ...base, slots: { ...base.slots, pattern: "pattern-stitch" } });
    expect(keys.has("patternDensity")).toBe(false);
    expect(keys.has("patternScale")).toBe(false);
    expect(keys.has("patternJitter")).toBe(true);
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
