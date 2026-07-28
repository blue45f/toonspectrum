import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { normalizeStudioBrushDynamicsSettings } from "./studio-brush-dynamics";
import { materializeStudioBrushPackDynamics } from "./studio-brush-pack-runtime";
import { encodeStudioBrushTipAlphaMapBase64 } from "./studio-brush-tip-stamp";
import {
  clearStudioDynamicCoverageCommittedCache,
  disposeStudioDynamicCoverageCommittedCache,
  planStudioDynamicBrushCoverageAndLegacyMarks,
  planStudioDynamicBrushCoverageMarks,
  renderStudioDynamicBrushCoverage,
  renderStudioDynamicBrushLegacyMarks,
  resolveStudioDynamicCoverageCommittedCacheByteBudget,
  studioDynamicCoverageCommittedCacheStats,
  STUDIO_DYNAMIC_COVERAGE_ACTIVE_BYTE_BUDGET,
  STUDIO_DYNAMIC_COVERAGE_COMMITTED_CACHE_BYTE_BUDGET,
  STUDIO_DYNAMIC_COVERAGE_COMMITTED_CACHE_MOBILE_BYTE_BUDGET,
  type StudioCoverageSurface,
  type StudioCoverageSurfaceContext,
  type StudioDynamicBrushCoverageMark,
} from "./studio-dynamic-brush-coverage-renderer";

import type { StudioDynamicBrushDab } from "./studio-brush-dynamics";

interface RecordedGradient {
  readonly args: readonly number[];
  readonly stops: Array<Readonly<{ offset: number; color: string }>>;
}

function recordingGradient(
  args: readonly number[],
  gradients: RecordedGradient[],
): CanvasGradient {
  const record: RecordedGradient = { args, stops: [] };
  gradients.push(record);
  return {
    addColorStop(offset: number, color: string) {
      record.stops.push({ offset, color });
    },
  } as CanvasGradient;
}

class RecordingSurfaceContext {
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = "source-over";
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  readonly gradients: RecordedGradient[] = [];
  readonly fills: Array<{
    alpha: number;
    color: string;
    ellipse: readonly number[];
  }> = [];
  private ellipseValue: readonly number[] = [];

  setTransform(): void {}
  clearRect(): void {}
  save(): void {}
  restore(): void {}
  translate(): void {}
  rotate(): void {}
  scale(): void {}
  beginPath(): void {
    this.ellipseValue = [];
  }
  createRadialGradient(...args: readonly number[]): CanvasGradient {
    return recordingGradient(args, this.gradients);
  }
  arc(
    x: number,
    y: number,
    radius: number,
  ): void {
    this.ellipseValue = [x, y, radius, radius, 0];
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
  readonly gradients: RecordedGradient[] = [];
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
  ellipse(): void {}
  createRadialGradient(...args: readonly number[]): CanvasGradient {
    return recordingGradient(args, this.gradients);
  }
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
  it("keeps airbrush-grand-soft as one analytic elliptical mark across committed and legacy rendering", () => {
    const dynamics = materializeStudioBrushPackDynamics("airbrush-grand-soft");
    if (!dynamics) throw new Error("missing airbrush-grand-soft dynamics");
    const plan = planStudioDynamicBrushCoverageMarks({
      dabVariations: [[dab({ size: 48, roundness: 0.55, angle: 32 })]],
      dynamics,
      dynamicSeed: 42,
      stroke: "#336699",
      stampGrid: 7,
      markBudget: 1,
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error("expected analytic soft-tip mark");
    expect(plan.marks).toHaveLength(1);
    expect(plan.marks[0]).toMatchObject({
      radiusX: 24,
      angleRadians: 32 * Math.PI / 180,
      falloff: {
        kind: "analytic-radial",
        exponent: 1.4 + 0.82 * 2.2,
      },
    });
    expect(plan.marks[0]!.radiusY).toBeCloseTo(13.2, 12);

    const surfaces: RecordingSurface[] = [];
    const committed = renderStudioDynamicBrushCoverage(
      new RecordingDestination(),
      plan.marks,
      {
        activeDraft: false,
        opacity: 0.6,
        surfaceFactory: surfaceFactory(surfaces),
      },
    );
    expect(committed).toMatchObject({ status: "rendered" });
    expect(surfaces[0]!.context.fills).toHaveLength(1);
    expect(surfaces[0]!.context.gradients).toHaveLength(1);
    const committedStops = surfaces[0]!.context.gradients[0]!.stops;
    expect(committedStops).toHaveLength(9);
    expect(committedStops[0]!.offset).toBe(0);
    expect(committedStops[0]!.color).toMatch(/^rgba\(\d+, \d+, \d+, 1\)$/);
    expect(committedStops.at(-1)).toEqual({
      offset: 1,
      color: committedStops[0]!.color.replace(/, 1\)$/, ", 0)"),
    });
    expect(committedStops.map(({ offset }) => offset)).toEqual(
      [...committedStops].map(({ offset }) => offset).sort((left, right) => left - right),
    );

    const legacy = new RecordingDestination();
    renderStudioDynamicBrushLegacyMarks(legacy, plan.marks, 0.6);
    expect(legacy.legacyFills).toHaveLength(1);
    expect(legacy.gradients[0]!.stops).toEqual(committedStops);
    expect(legacy.legacyFills[0]!.alpha).toBeCloseTo(
      0.8 * 0.6 * plan.marks[0]!.alpha,
      12,
    );
  });

  it.each([
    {
      name: "custom alpha",
      settings: {
        tip: {
          shape: "soft" as const,
          softness: 0.82,
          alphaMapSize: 8,
          alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(
            new Uint8Array(8 * 8).fill(255),
          ),
        },
        grain: { amount: 0 },
      },
    },
    {
      name: "dual tip",
      settings: {
        tip: { shape: "soft" as const, softness: 0.82 },
        grain: { amount: 0 },
        dualBrush: {
          enabled: true,
          tip: { shape: "hard" as const, softness: 0.1 },
          blendMode: "multiply" as const,
          sizeRatio: 0.8,
        },
      },
    },
  ])("preserves the sampled stamp path for $name", ({ settings }) => {
    const dynamics = normalizeStudioBrushDynamicsSettings({
      ...settings,
      taper: { enabled: false },
    });
    const plan = planStudioDynamicBrushCoverageMarks({
      dabVariations: [[dab({ size: 48 })]],
      dynamics,
      dynamicSeed: 42,
      stroke: "#336699",
      stampGrid: 7,
      markBudget: 1_000,
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error("expected sampled marks");
    expect(plan.marks.length).toBeGreaterThan(1);
    expect(plan.marks.every((candidate) => candidate.falloff === undefined)).toBe(true);
  });

  it("keeps a grained soft medium continuous while sampling world grain once per dense dab", () => {
    const dynamics = normalizeStudioBrushDynamicsSettings({
      tip: { shape: "soft", softness: 0.82 },
      grain: {
        amount: 0.55,
        scale: 5.5,
        contrast: 0.4,
        seed: 303,
        space: "canvas-fixed",
      },
      taper: { enabled: false },
    });
    const plan = planStudioDynamicBrushCoverageMarks({
      dabVariations: [[
        dab({ index: 0, x: 10, y: 20, sourceX: 10, sourceY: 20, size: 48 }),
        dab({ index: 1, x: 27, y: 33, sourceX: 27, sourceY: 33, size: 48 }),
      ]],
      dynamics,
      dynamicSeed: 42,
      stroke: "#336699",
      stampGrid: 7,
      markBudget: 2,
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error("expected analytic grained soft-tip marks");
    expect(plan.marks).toHaveLength(2);
    expect(plan.marks.every((candidate) =>
      candidate.falloff?.kind === "analytic-radial"
    )).toBe(true);
    expect(plan.marks[0]!.alpha).not.toBe(plan.marks[1]!.alpha);
  });

  it("decomposes a screen dual wet wash into a continuous carrier plus sponge texture", () => {
    const dynamics = materializeStudioBrushPackDynamics("watercolor-wet-wash");
    if (!dynamics) throw new Error("missing watercolor-wet-wash dynamics");
    const plan = planStudioDynamicBrushCoverageMarks({
      dabVariations: [[dab({ size: 56, roundness: 0.78, angle: 18 })]],
      dynamics,
      dynamicSeed: 73,
      stroke: "#336699",
      stampGrid: 7,
      markBudget: 1_000,
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error("expected decomposed wet-wash marks");
    expect(plan.marks.length).toBeGreaterThan(1);
    expect(plan.marks[0]).toMatchObject({
      radiusX: 28,
      radiusY: 28 * 0.78,
      falloff: {
        kind: "analytic-radial",
        exponent: 1.4 + dynamics.tip.softness * 2.2,
      },
    });
    expect(plan.marks.slice(1).some((candidate) =>
      candidate.falloff === undefined
    )).toBe(true);
  });

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

  it("uses a lower committed-cache ceiling for coarse-pointer and low-memory devices", () => {
    expect(resolveStudioDynamicCoverageCommittedCacheByteBudget({
      coarsePointer: false,
      deviceMemoryGb: 8,
    })).toBe(STUDIO_DYNAMIC_COVERAGE_COMMITTED_CACHE_BYTE_BUDGET);
    expect(resolveStudioDynamicCoverageCommittedCacheByteBudget({
      coarsePointer: true,
      deviceMemoryGb: 8,
    })).toBe(STUDIO_DYNAMIC_COVERAGE_COMMITTED_CACHE_MOBILE_BYTE_BUDGET);
    expect(resolveStudioDynamicCoverageCommittedCacheByteBudget({
      coarsePointer: false,
      deviceMemoryGb: 4,
    })).toBe(STUDIO_DYNAMIC_COVERAGE_COMMITTED_CACHE_MOBILE_BYTE_BUDGET);
    expect(resolveStudioDynamicCoverageCommittedCacheByteBudget({
      coarsePointer: false,
      deviceMemoryGb: null,
    })).toBe(STUDIO_DYNAMIC_COVERAGE_COMMITTED_CACHE_BYTE_BUDGET);
  });

  it("reuses immutable committed coverage tiles across retained layer redraws", () => {
    clearStudioDynamicCoverageCommittedCache();
    const cacheKey = "draw-stroke-1";
    const marks = [
      mark(),
      mark({ x: 12, alpha: 0.25 }),
    ];
    const surfaces: RecordingSurface[] = [];
    const factory = surfaceFactory(surfaces);
    const firstDestination = new RecordingDestination();
    const secondDestination = new RecordingDestination();

    const first = renderStudioDynamicBrushCoverage(firstDestination, marks, {
      activeDraft: false,
      opacity: 0.4,
      surfaceFactory: factory,
      committedCacheKey: cacheKey,
    });
    const second = renderStudioDynamicBrushCoverage(
      secondDestination,
      marks.map((candidate) => ({
        ...candidate,
        ...(candidate.falloff ? { falloff: { ...candidate.falloff } } : {}),
      })),
      {
        activeDraft: false,
        opacity: 0.4,
        surfaceFactory: factory,
        committedCacheKey: cacheKey,
      },
    );

    expect(first).toMatchObject({ status: "rendered", scale: 2, tileCount: 1 });
    expect(second).toEqual(first);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]!.context.fills).toHaveLength(2);
    expect(firstDestination.draws).toHaveLength(1);
    expect(secondDestination.draws).toHaveLength(1);
    expect(studioDynamicCoverageCommittedCacheStats()).toEqual({
      bytes: 260 * 260 * 4,
      entries: 1,
      tiles: 1,
    });

    clearStudioDynamicCoverageCommittedCache();
    expect(studioDynamicCoverageCommittedCacheStats()).toEqual({
      bytes: 0,
      entries: 0,
      tiles: 0,
    });
    expect(surfaces[0]).toMatchObject({ width: 1, height: 1 });
  });

  it("disposes every document-owned backing surface at the Studio lifecycle boundary", () => {
    clearStudioDynamicCoverageCommittedCache();
    const surfaces: RecordingSurface[] = [];
    const factory = surfaceFactory(surfaces);
    for (const committedCacheKey of ["document-a:stroke-1", "document-a:stroke-2"]) {
      expect(renderStudioDynamicBrushCoverage(
        new RecordingDestination(),
        [mark({ x: committedCacheKey.endsWith("1") ? 10 : 300 })],
        {
          activeDraft: false,
          opacity: 1,
          surfaceFactory: factory,
          committedCacheKey,
        },
      ).status).toBe("rendered");
    }

    expect(studioDynamicCoverageCommittedCacheStats()).toMatchObject({
      entries: 2,
      tiles: 2,
    });
    expect(surfaces.every((surface) => surface.width > 1 && surface.height > 1)).toBe(true);

    disposeStudioDynamicCoverageCommittedCache();

    expect(studioDynamicCoverageCommittedCacheStats()).toEqual({
      bytes: 0,
      entries: 0,
      tiles: 0,
    });
    expect(surfaces).toHaveLength(2);
    expect(surfaces.every((surface) => surface.width === 1 && surface.height === 1)).toBe(true);
  });

  it("binds cache disposal to the keyed editor work/auth lifecycle", () => {
    const studioPageSource = readFileSync(
      new URL("./StudioPage.tsx", import.meta.url),
      "utf8",
    );

    expect(studioPageSource).toContain(
      "<StudioCuttoonEditor key={editorScopeKey} />",
    );
    expect(studioPageSource).toContain(
      "disposeStudioDynamicCoverageCommittedCache();",
    );
    expect(studioPageSource.indexOf("disposeStudioDynamicCoverageCommittedCache();"))
      .toBeGreaterThan(studioPageSource.indexOf("useLayoutEffect(() => () => {"));
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
