import { describe, expect, it } from "vitest";

import { normalizeStudioBrushDynamicsSettings } from "./studio-brush-dynamics";
import {
  planStudioDynamicBrushCoverageAndLegacyMarks,
  planStudioDynamicBrushCoverageMarks,
  renderStudioDynamicBrushCoverage,
  renderStudioDynamicBrushLegacyMarks,
  STUDIO_DYNAMIC_COVERAGE_ACTIVE_BYTE_BUDGET,
  type StudioCoverageSurface,
  type StudioCoverageSurfaceContext,
  type StudioDynamicBrushCoverageMark,
} from "./studio-dynamic-brush-coverage-renderer";

import type { StudioDynamicBrushDab } from "./studio-brush-dynamics";

class RecordingSurfaceContext {
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = "source-over";
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  readonly fills: Array<{
    alpha: number;
    color: string;
    ellipse: readonly number[];
  }> = [];
  private ellipseValue: readonly number[] = [];

  setTransform(): void {}
  clearRect(): void {}
  beginPath(): void {
    this.ellipseValue = [];
  }
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
  ): void {
    this.ellipseValue = [x, y, radiusX, radiusY, rotation];
  }
  fill(): void {
    this.fills.push({
      alpha: this.globalAlpha,
      color: String(this.fillStyle),
      ellipse: this.ellipseValue,
    });
  }
}

class RecordingSurface {
  readonly context = new RecordingSurfaceContext();

  constructor(
    public width: number,
    public height: number,
  ) {}

  getContext(): StudioCoverageSurfaceContext {
    return this.context as unknown as StudioCoverageSurfaceContext;
  }
}

class RecordingDestination {
  globalAlpha = 0.8;
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  readonly draws: Array<{ alpha: number; args: readonly number[] }> = [];
  readonly legacyFills: Array<{ alpha: number; color: string }> = [];
  private alphaStack: number[] = [];
  _context = {
    getTransform: () => ({
      a: 2,
      b: 0,
      c: 0,
      d: 2,
      e: 0,
      f: 0,
    }) as DOMMatrix,
  };

  save(): void {
    this.alphaStack.push(this.globalAlpha);
  }
  restore(): void {
    this.globalAlpha = this.alphaStack.pop() ?? this.globalAlpha;
  }
  drawImage(
    _surface: CanvasImageSource,
    ...args: [number, number, number, number, number, number, number, number]
  ): void {
    this.draws.push({ alpha: this.globalAlpha, args });
  }
  beginPath(): void {}
  arc(): void {}
  fill(): void {
    this.legacyFills.push({ alpha: this.globalAlpha, color: String(this.fillStyle) });
  }
  translate(): void {}
  rotate(): void {}
  scale(): void {}
}

function surfaceFactory(surfaces: RecordingSurface[]) {
  return (width: number, height: number): StudioCoverageSurface => {
    const surface = new RecordingSurface(width, height);
    surfaces.push(surface);
    return surface as unknown as StudioCoverageSurface;
  };
}

function mark(overrides: Partial<StudioDynamicBrushCoverageMark> = {}) {
  return {
    x: 10,
    y: 20,
    radiusX: 8,
    radiusY: 4,
    angleRadians: 0.25,
    alpha: 0.5,
    color: "#336699",
    ...overrides,
  } satisfies StudioDynamicBrushCoverageMark;
}

function dab(overrides: Partial<StudioDynamicBrushDab> = {}): StudioDynamicBrushDab {
  return {
    index: 0,
    progress: 0,
    sourceX: 10,
    sourceY: 20,
    x: 10,
    y: 20,
    size: 16,
    opacity: 0.5,
    flow: 0.4,
    spacing: 4,
    scatter: 0,
    angle: 0,
    roundness: 1,
    ...overrides,
  };
}

describe("studio dynamic brush bounded coverage renderer", () => {
  it("deposits flow locally and applies inherited × stroke opacity once at tile composite", () => {
    const destination = new RecordingDestination();
    const surfaces: RecordingSurface[] = [];
    const marks = [
      mark(),
      mark({ x: 12, alpha: 0.25 }),
    ];
    const result = renderStudioDynamicBrushCoverage(destination, marks, {
      activeDraft: false,
      opacity: 0.4,
      surfaceFactory: surfaceFactory(surfaces),
    });

    expect(result).toMatchObject({ status: "rendered", scale: 2, tileCount: 1 });
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]!.context.fills.map(({ alpha }) => alpha)).toEqual([0.5, 0.25]);
    expect(destination.draws).toHaveLength(1);
    expect(destination.draws[0]!.alpha).toBeCloseTo(0.8 * 0.4, 12);
    expect(destination.globalAlpha).toBe(0.8);
  });

  it("uses identical 2x live and committed surface scale at the handoff", () => {
    const marks = [mark()];
    const activeDestination = new RecordingDestination();
    const committedDestination = new RecordingDestination();
    const active = renderStudioDynamicBrushCoverage(activeDestination, marks, {
      activeDraft: true,
      opacity: 0.6,
      surfaceFactory: surfaceFactory([]),
    });
    const committed = renderStudioDynamicBrushCoverage(committedDestination, marks, {
      activeDraft: false,
      opacity: 0.6,
      surfaceFactory: surfaceFactory([]),
    });

    expect(active).toMatchObject({ status: "rendered", scale: 2, tileCount: 1 });
    expect(committed).toMatchObject({ status: "rendered", scale: 2, tileCount: 1 });
    expect(activeDestination.draws[0]?.args).toEqual(committedDestination.draws[0]?.args);
  });

  it("retains exact 4x physical quality for both live and committed coverage", () => {
    const makeDestination = () => {
      const destination = new RecordingDestination();
      destination._context.getTransform = () => ({
        a: 4,
        b: 0,
        c: 0,
        d: 4,
        e: 0,
        f: 0,
      }) as DOMMatrix;
      return destination;
    };
    const active = renderStudioDynamicBrushCoverage(makeDestination(), [mark()], {
      activeDraft: true,
      opacity: 0.6,
      surfaceFactory: surfaceFactory([]),
    });
    const committed = renderStudioDynamicBrushCoverage(makeDestination(), [mark()], {
      activeDraft: false,
      opacity: 0.6,
      surfaceFactory: surfaceFactory([]),
    });

    expect(active).toMatchObject({ status: "rendered", scale: 4 });
    expect(committed).toMatchObject({ status: "rendered", scale: 4 });
  });

  it("falls back exactly instead of raster-downscaling a transform above 4x", () => {
    const destination = new RecordingDestination();
    destination._context.getTransform = () => ({
      a: 4.01,
      b: 0,
      c: 0,
      d: 4.01,
      e: 0,
      f: 0,
    }) as DOMMatrix;
    const result = renderStudioDynamicBrushCoverage(destination, [mark()], {
      activeDraft: false,
      opacity: 0.6,
      surfaceFactory: surfaceFactory([]),
    });

    expect(result).toEqual({
      status: "fallback",
      reason: "physical-scale-unsupported",
    });
    expect(destination.draws).toHaveLength(0);
  });

  it("oversamples a sub-0.75x view without changing destination-space geometry", () => {
    const destination = new RecordingDestination();
    destination._context.getTransform = () => ({
      a: 0.5,
      b: 0,
      c: 0,
      d: 0.5,
      e: 0,
      f: 0,
    }) as DOMMatrix;
    const result = renderStudioDynamicBrushCoverage(destination, [mark()], {
      activeDraft: false,
      opacity: 1,
      surfaceFactory: surfaceFactory([]),
    });

    expect(result).toMatchObject({ status: "rendered", scale: 0.75 });
    expect(destination.draws[0]?.args.slice(-2)).toEqual([
      256 / 0.75,
      256 / 0.75,
    ]);
  });

  it("allocates only dab-intersecting sparse tiles instead of the marks' bounding rectangle", () => {
    const destination = new RecordingDestination();
    destination._context.getTransform = () => ({
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
    }) as DOMMatrix;
    const result = renderStudioDynamicBrushCoverage(
      destination,
      [mark({ x: 4, y: 4 }), mark({ x: 2_052, y: 2_052 })],
      {
        activeDraft: false,
        opacity: 1,
        surfaceFactory: surfaceFactory([]),
      },
    );

    // Each edge-adjacent dab touches four tiles because antialias bleed crosses the world origin;
    // the empty 8×8 diagonal rectangle between them is still never allocated.
    expect(result).toMatchObject({ status: "rendered", scale: 1, tileCount: 8 });
    if (result.status !== "rendered") throw new Error("expected coverage");
    expect(result.allocatedBytes).toBeLessThanOrEqual(
      STUDIO_DYNAMIC_COVERAGE_ACTIVE_BYTE_BUDGET,
    );
    expect(destination.draws).toHaveLength(8);
  });

  it("fails before destination mutation when a mark exceeds the surface/reference budget", () => {
    const destination = new RecordingDestination();
    const result = renderStudioDynamicBrushCoverage(
      destination,
      [mark({ radiusX: 1_000_000, radiusY: 1_000_000 })],
      {
        activeDraft: true,
        opacity: 0.5,
        surfaceFactory: surfaceFactory([]),
      },
    );

    expect(result).toMatchObject({ status: "fallback" });
    expect(destination.draws).toHaveLength(0);
    // Budget pressure never silently lowers coverage resolution. The exact source mark remains
    // available to the frozen direct compositor.
    renderStudioDynamicBrushLegacyMarks(
      destination,
      [mark({ radiusX: 1_000_000, radiusY: 1_000_000 })],
      0.5,
    );
    expect(destination.legacyFills).toEqual([
      { alpha: 0.8 * 0.5 * 0.5, color: "#336699" },
    ]);
  });

  it("keeps a complete visible legacy plan when coverage mark preflight exhausts its budget", () => {
    const dynamics = normalizeStudioBrushDynamicsSettings({
      tip: { shape: "round", softness: 0 },
      grain: { amount: 0 },
      taper: { enabled: false },
    });
    const input = {
      dabVariations: [[dab(), dab({ index: 1, x: 30, sourceX: 30 })]],
      dynamics,
      dynamicSeed: 42,
      stroke: "#123456",
      stampGrid: 7 as const,
      markBudget: 1,
    };
    const plan = planStudioDynamicBrushCoverageAndLegacyMarks(input);

    expect(plan.coveragePlan).toEqual({ ok: false, reason: "mark-budget" });
    expect(plan.legacyMarks).toHaveLength(2);
    const destination = new RecordingDestination();
    renderStudioDynamicBrushLegacyMarks(destination, plan.legacyMarks, 0.5);
    expect(destination.legacyFills).toHaveLength(2);
  });

  it("keeps explicit full-stroke origins stable for suffix-only stroke-fixed grain plans", () => {
    const dynamics = normalizeStudioBrushDynamicsSettings({
      tip: { shape: "hard", softness: 0 },
      grain: {
        space: "stroke-fixed",
        amount: 0.8,
        scale: 7,
        contrast: 0.7,
        seed: 33,
      },
      taper: { enabled: false },
    });
    const fullDabs = [
      dab({ x: 10, sourceX: 10 }),
      dab({ index: 1, x: 30, sourceX: 30 }),
    ];
    const full = planStudioDynamicBrushCoverageMarks({
      dabVariations: [fullDabs],
      dynamics,
      dynamicSeed: 91,
      stroke: "#123456",
      stampGrid: 7,
      markBudget: 100,
    });
    const suffix = planStudioDynamicBrushCoverageMarks({
      dabVariations: [[fullDabs[1]!]],
      strokeOrigins: [{ x: 10, y: 20 }],
      dynamics,
      dynamicSeed: 91,
      stroke: "#123456",
      stampGrid: 7,
      markBudget: 100,
    });

    expect(full.ok).toBe(true);
    expect(suffix.ok).toBe(true);
    if (!full.ok || !suffix.ok) throw new Error("expected marks");
    expect(suffix.marks.map(({ alpha }) => alpha)).toEqual(
      full.marks.slice(-suffix.marks.length).map(({ alpha }) => alpha),
    );
  });

  it("preserves tip layers, grain, dual texture, colour dynamics and symmetry in v2 marks", () => {
    const richInput = {
      tip: { shape: "round" as const, softness: 0.2 },
      dualBrush: {
        enabled: true,
        tip: { shape: "star" as const, softness: 0.1 },
        blendMode: "screen" as const,
        sizeRatio: 0.7,
      },
      tipLayers: [
        {
          tip: { shape: "hard" as const, softness: 0.1 },
          scale: 0.55,
          opacity: 0.7,
          offsetY: -0.4,
        },
      ],
      grain: {
        space: "canvas-fixed" as const,
        amount: 0.75,
        scale: 5,
        contrast: 0.8,
        seed: 77,
      },
      colorDynamics: {
        backgroundColor: "#ff8844",
        foregroundBackgroundMix: 0.65,
        hueJitter: 35,
        saturationJitter: 0.2,
      },
      taper: { enabled: false },
    };
    const richDynamics = normalizeStudioBrushDynamicsSettings(richInput);
    const noLayersDynamics = normalizeStudioBrushDynamicsSettings({
      ...richInput,
      tipLayers: [],
    });
    const noDualDynamics = normalizeStudioBrushDynamicsSettings({
      ...richInput,
      dualBrush: { enabled: false },
    });
    const variations = [
      [dab({ index: 4, x: 12, y: 18, sourceX: 10, sourceY: 20 })],
      [dab({ index: 4, x: 88, y: 18, sourceX: 90, sourceY: 20, angle: 180 })],
    ];
    const plan = (dynamics: typeof richDynamics) => planStudioDynamicBrushCoverageMarks({
      dabVariations: variations,
      dynamics,
      dynamicSeed: 1234,
      stroke: "#2468ac",
      stampGrid: 3,
      markBudget: 1_000,
    });
    const rich = plan(richDynamics);
    const noLayers = plan(noLayersDynamics);
    const noDual = plan(noDualDynamics);

    expect(rich.ok).toBe(true);
    expect(noLayers.ok).toBe(true);
    expect(noDual.ok).toBe(true);
    if (!rich.ok || !noLayers.ok || !noDual.ok) throw new Error("expected rich marks");
    expect(rich.marks.length).toBeGreaterThan(noLayers.marks.length);
    expect(rich.marks.map(({ alpha }) => alpha)).not.toEqual(
      noDual.marks.map(({ alpha }) => alpha),
    );
    expect(new Set(rich.marks.map(({ alpha }) => alpha.toFixed(6))).size).toBeGreaterThanOrEqual(4);
    expect(new Set(rich.marks.map(({ color }) => color))).not.toEqual(new Set(["#2468ac"]));
    expect(rich.marks.some(({ x }) => x < 50)).toBe(true);
    expect(rich.marks.some(({ x }) => x > 50)).toBe(true);
  });
});
