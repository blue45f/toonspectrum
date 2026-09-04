import { readFileSync, rmSync, writeFileSync } from "node:fs";

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`missing replacement target: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`ambiguous replacement target: ${label}`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

function update(path, transform) {
  const source = readFileSync(path, "utf8");
  const next = transform(source);
  if (next === source) throw new Error(`no changes produced for ${path}`);
  writeFileSync(path, next);
}

update("src/domains/creator/brush/studio-inkwash-fluid.ts", (source) => {
  source = replaceOnce(
    source,
`export interface StudioInkwashFluidStrokeInput {
  readonly tool: "pen" | "water";
  readonly samples: readonly StudioInkwashFluidStrokeSample[];
  readonly radius: number;
  readonly pigmentLoad: number;
  readonly wetnessLoad: number;
  readonly spectralAbsorption?: Readonly<{ r: number; g: number; b: number }>;
  readonly inkColor?: Readonly<{ r: number; g: number; b: number }>;
}
`,
`export interface StudioInkwashFluidStrokeInput {
  readonly tool: "pen" | "water";
  readonly samples: readonly StudioInkwashFluidStrokeSample[];
  readonly radius: number;
  readonly pigmentLoad: number;
  readonly wetnessLoad: number;
  readonly spectralAbsorption?: Readonly<{ r: number; g: number; b: number }>;
  readonly inkColor?: Readonly<{ r: number; g: number; b: number }>;
}

/**
 * Causal, suffix-only preview planner. It emits the same Gaussian/Beer-Lambert material inputs as
 * the committed InkWash deposit without mutating the authoritative shared wash or running Stam.
 * The two explicit scales compensate only for the diffusion/darkening that is deliberately absent
 * from pointer frames; committed pixels and physical constants stay untouched.
 */
export interface StudioInkwashFluidPreviewPlannerOptions {
  readonly tool: "pen" | "water";
  readonly radius: number;
  readonly pigmentLoad: number;
  readonly wetnessLoad: number;
  readonly spectralAbsorption?: Readonly<{ r: number; g: number; b: number }>;
  readonly inkColor?: Readonly<{ r: number; g: number; b: number }>;
  readonly radiusScale?: number;
  readonly pigmentScale?: number;
}

export interface StudioInkwashFluidPreviewPlannerState {
  readonly tool: "pen" | "water";
  readonly baseRadius: number;
  readonly spacing: number;
  readonly pigmentLoad: number;
  readonly wetnessLoad: number;
  readonly absorption: readonly [number, number, number];
  readonly radiusScale: number;
  readonly pigmentScale: number;
  started: boolean;
  previousX: number;
  previousY: number;
  previousPressure: number;
  untilNextStamp: number;
  meanSegmentLength: number;
  segmentCount: number;
}

export interface StudioInkwashFluidPreviewPlan {
  readonly stamps: readonly StudioInkwashFluidStamp[];
  readonly dirtyBounds: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> | null;
}
`,
    "preview planner types",
  );

  source = replaceOnce(
    source,
`/**
 * Chains gaussian stamps along a polyline. Pen: pressure/speed scale radius and density,
 * faint MAX wetness, no motion impulse. Water: MAX wetness, motion impulses, no ink.
 */
export function depositStudioInkwashFluidStroke(
`,
`function positiveFiniteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function createStudioInkwashFluidPreviewPlanner(
  options: StudioInkwashFluidPreviewPlannerOptions,
): StudioInkwashFluidPreviewPlannerState {
  const baseRadius = Math.max(0.75, options.radius);
  const absorption = spectralColor({ ...options, samples: [] });
  return {
    tool: options.tool,
    baseRadius,
    spacing: Math.max(
      0.35,
      baseRadius * STUDIO_INKWASH_STAMP_SPACING_RATIO,
    ),
    pigmentLoad: Math.max(0, options.pigmentLoad),
    wetnessLoad: clamp01(options.wetnessLoad),
    absorption,
    radiusScale: positiveFiniteOr(options.radiusScale, 1),
    pigmentScale: positiveFiniteOr(options.pigmentScale, 1),
    started: false,
    previousX: 0,
    previousY: 0,
    previousPressure: 0.55,
    untilNextStamp: 0,
    meanSegmentLength: 0,
    segmentCount: 0,
  };
}

/**
 * Emits only new stamps for an accepted sample suffix. Chunk boundaries are invisible: persistent
 * arc-length phase, previous pressure and the running local pace all live in the planner state.
 */
export function planStudioInkwashFluidPreviewStamps(
  state: StudioInkwashFluidPreviewPlannerState,
  inputSamples: readonly StudioInkwashFluidStrokeSample[],
): StudioInkwashFluidPreviewPlan {
  const samples = inputSamples.filter(
    (sample) => finite(sample.x) && finite(sample.y),
  );
  if (samples.length === 0) return { stamps: [], dirtyBounds: null };

  const stamps: StudioInkwashFluidStamp[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const isWater = state.tool === "water";

  const emit = (
    x: number,
    y: number,
    pressure: number,
    directionX: number,
    directionY: number,
    speed: number,
  ): void => {
    const normalizedPressure = clamp01(pressure);
    const speedShrink = 1 / (1 + speed * (isWater ? 0.35 : 0.85));
    const pressureGrow = 0.35 + 0.65 * normalizedPressure;
    const radius =
      state.baseRadius
      * pressureGrow
      * speedShrink
      * state.radiusScale;
    const densityScale =
      state.pigmentLoad
      * state.pigmentScale
      * (0.4 + 0.6 * normalizedPressure)
      * speedShrink;
    const impulse = isWater
      ? 0.55 * Math.min(1.8, 0.35 + speed * 8)
      : 0;
    const stamp: StudioInkwashFluidStamp = {
      x,
      y,
      radius,
      pigment: isWater || densityScale <= 0
        ? [0, 0, 0]
        : [
          state.absorption[0] * densityScale,
          state.absorption[1] * densityScale,
          state.absorption[2] * densityScale,
        ],
      wetness: isWater
        ? state.wetnessLoad * (0.55 + 0.45 * normalizedPressure)
        : state.wetnessLoad,
      velocity: isWater
        ? [directionX * impulse, directionY * impulse]
        : [0, 0],
    };
    stamps.push(stamp);
    const reach = radius * 2 + 1;
    minX = Math.min(minX, x - reach);
    minY = Math.min(minY, y - reach);
    maxX = Math.max(maxX, x + reach);
    maxY = Math.max(maxY, y + reach);
  };

  let firstIndex = 0;
  if (!state.started) {
    const first = samples[0]!;
    emit(
      first.x,
      first.y,
      first.pressure,
      0,
      0,
      STUDIO_INKWASH_NOMINAL_PACE,
    );
    state.started = true;
    state.previousX = first.x;
    state.previousY = first.y;
    state.previousPressure = clamp01(first.pressure);
    state.untilNextStamp = state.spacing;
    firstIndex = 1;
  }

  for (let index = firstIndex; index < samples.length; index += 1) {
    const sample = samples[index]!;
    const dx = sample.x - state.previousX;
    const dy = sample.y - state.previousY;
    const span = Math.hypot(dx, dy);
    if (span <= 1e-9) {
      state.previousX = sample.x;
      state.previousY = sample.y;
      state.previousPressure = clamp01(sample.pressure);
      continue;
    }

    const referenceSegment = state.segmentCount === 0
      ? span
      : state.meanSegmentLength;
    const relativePace = referenceSegment > 1e-6
      ? span / referenceSegment
      : 1;
    const speed =
      STUDIO_INKWASH_NOMINAL_PACE * Math.min(4, relativePace);
    const directionX = dx / span;
    const directionY = dy / span;
    const currentPressure = clamp01(sample.pressure);

    for (
      let travelled = state.untilNextStamp;
      travelled <= span + 1e-9;
      travelled += state.spacing
    ) {
      const amount = travelled / span;
      emit(
        state.previousX + dx * amount,
        state.previousY + dy * amount,
        state.previousPressure
          + (currentPressure - state.previousPressure) * amount,
        directionX,
        directionY,
        speed,
      );
      state.untilNextStamp = travelled + state.spacing;
    }
    state.untilNextStamp -= span;
    state.meanSegmentLength = (
      state.meanSegmentLength * state.segmentCount + span
    ) / (state.segmentCount + 1);
    state.segmentCount += 1;
    state.previousX = sample.x;
    state.previousY = sample.y;
    state.previousPressure = currentPressure;
  }

  return {
    stamps,
    dirtyBounds: stamps.length === 0
      ? null
      : {
          x: Math.floor(minX),
          y: Math.floor(minY),
          width: Math.max(1, Math.ceil(maxX) - Math.floor(minX) + 1),
          height: Math.max(1, Math.ceil(maxY) - Math.floor(minY) + 1),
        },
  };
}

/**
 * Convenience reference for tests and non-sparse callers. The product overlay bins the returned
 * stamps into preview tiles so long strokes never require a page-sized transient field.
 */
export function appendStudioInkwashFluidPreviewStroke(
  session: StudioInkwashFluidSession,
  state: StudioInkwashFluidPreviewPlannerState,
  samples: readonly StudioInkwashFluidStrokeSample[],
): StudioInkwashFluidPreviewPlan {
  const plan = planStudioInkwashFluidPreviewStamps(state, samples);
  for (const stamp of plan.stamps) {
    depositStudioInkwashFluidStamp(session, stamp);
  }
  return plan;
}

/**
 * Chains gaussian stamps along a polyline. Pen: pressure/speed scale radius and density,
 * faint MAX wetness, no motion impulse. Water: MAX wetness, motion impulses, no ink.
 */
export function depositStudioInkwashFluidStroke(
`,
    "preview planner implementation",
  );
  return source;
});

update("src/domains/creator/live/studio-live-wet-ink-overlay.ts", (source) => {
  source = replaceOnce(
    source,
`import {
  depositStudioInkwashFluidStroke,
  studioInkwashActiveRegionSteps,
  studioInkwashFluidStepParams,
} from "../brush/studio-inkwash-fluid";
`,
`import {
  createStudioInkwashFluidPreviewPlanner,
  createStudioInkwashFluidSession,
  depositStudioInkwashFluidStamp,
  depositStudioInkwashFluidStroke,
  planStudioInkwashFluidPreviewStamps,
  resolveStudioInkwashFluidDisplay,
  studioInkwashActiveRegionSteps,
  studioInkwashFluidStepParams,
  type StudioInkwashFluidPreviewPlannerState,
  type StudioInkwashFluidSession,
} from "../brush/studio-inkwash-fluid";
`,
    "overlay fluid imports",
  );

  source = replaceOnce(
    source,
`const POINT_EPSILON = 1e-6;
`,
`const POINT_EPSILON = 1e-6;
/**
 * InkWash live preview is intentionally lower resolution than the 4× committed wash. It still
 * uses the real Gaussian deposition and Beer-Lambert optical model, but bins into bounded sparse
 * tiles and never runs Stam on pointer frames.
 */
const INKWASH_PREVIEW_FIELD_SCALE = 2;
const INKWASH_PREVIEW_TILE_SIZE = 128;
const INKWASH_PREVIEW_MAX_TILES = 512;
`,
    "overlay preview constants",
  );

  source = replaceOnce(
    source,
`interface ActiveInkwashStroke {
  readonly recipe: StudioWetInkBrushPhysicalRecipe;
  readonly styleSignature: string;
  readonly pageEpoch: string | number;
  consumedSourcePoints: number;
  previousSourceX: number;
  previousSourceY: number;
  /** Document-space x,y pairs for the live polyline. Physics waits until pointer-up. */
  readonly livePoints: number[];
}
`,
`interface InkwashPreviewTile {
  readonly tileX: number;
  readonly tileY: number;
  readonly session: StudioInkwashFluidSession;
}

interface InkwashPreviewDirtyTile {
  readonly tile: InkwashPreviewTile;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface ActiveInkwashStroke {
  readonly recipe: StudioWetInkBrushPhysicalRecipe;
  readonly styleSignature: string;
  readonly pageEpoch: string | number;
  consumedSourcePoints: number;
  previousSourceX: number;
  previousSourceY: number;
  /** Water keeps the low-cost blue guide; pigment tools use the tiled optical preview below. */
  readonly livePoints: number[];
  readonly previewPlanner: StudioInkwashFluidPreviewPlannerState;
  readonly previewTiles: Map<string, InkwashPreviewTile>;
}
`,
    "overlay active inkwash state",
  );

  source = replaceOnce(
    source,
`      livePoints: [],
    };
`,
`      livePoints: [],
      previewPlanner: createStudioInkwashFluidPreviewPlanner({
        tool: recipe.brushId === "inkwash-water-brush" ? "water" : "pen",
        radius: recipe.baseWidth * INKWASH_PREVIEW_FIELD_SCALE * 0.5,
        pigmentLoad: recipe.material.pigmentLoad,
        wetnessLoad: recipe.material.wetnessLoad,
        spectralAbsorption: recipe.material.spectralAbsorption,
        inkColor: recipe.inkColor,
        // Measured live→commit gap for the deep pen was +16.45% width and +29.53% density.
        // These bounded preview-only factors estimate the missing diffusion/edge darkening while
        // leaving the committed 4× physical field and every stored brush value unchanged.
        radiusScale:
          1
          + recipe.material.bleed * 0.45
          + recipe.material.granulation * 0.1,
        pigmentScale:
          1
          + recipe.material.bleed * 0.55
          + recipe.material.edgeDarkening * 0.12,
      }),
      previewTiles: new Map(),
    };
`,
    "overlay preview state creation",
  );

  source = replaceOnce(
    source,
`      appendedDabs: 1,
`,
`      appendedDabs: painted.appendedDabs,
`,
    "overlay begin receipt",
  );

  source = replaceOnce(
    source,
`    if (this.activeInkwash) {
      const recipe = this.activeInkwash.recipe;
      if (!this.paintInkwashLivePolyline(this.activeInkwash.livePoints, recipe)) {
        this.failActive("surface-render");
        return;
      }
      this.lastFailureReason = null;
      this.setActiveCanvasOpacity(recipe.compositeOpacity);
      return;
    }
`,
`    if (this.activeInkwash) {
      const activeInkwash = this.activeInkwash;
      const recipe = activeInkwash.recipe;
      const painted = recipe.brushId === "inkwash-water-brush"
        ? this.paintInkwashLivePolyline(activeInkwash.livePoints, recipe)
        : this.drawInkwashPreviewTiles(activeInkwash);
      if (!painted) {
        this.failActive("surface-render");
        return;
      }
      this.lastFailureReason = null;
      this.setActiveCanvasOpacity(recipe.compositeOpacity);
      return;
    }
`,
    "overlay replay preview path",
  );

  const oldSuffix = `  private paintInkwashSuffix(
    element: DrawEl,
    fromIndex: number,
  ): StudioLiveWetInkAppendResult {
    const active = this.activeInkwash;
    if (!active) return wetInkOperationFailure("surface-unavailable");
    const total = Math.floor(element.points.length / 2);
    if (total < fromIndex) return this.failActive("source-prefix");
    if (total === fromIndex) {
      return {
        status: "noop",
        consumedSourcePoints: total,
        appendedDabs: 0,
        uploadedTiles: 0,
      };
    }
    const samples: Array<{ x: number; y: number; pressure: number }> = [];
    if (fromIndex > 0) {
      samples.push({
        x: active.previousSourceX,
        y: active.previousSourceY,
        pressure: 0.55,
      });
    }
    for (let index = fromIndex; index < total; index += 1) {
      const x = finiteCoordinate(element.points[index * 2]);
      const y = finiteCoordinate(element.points[index * 2 + 1]);
      if (x === null || y === null) return this.failActive("invalid-sample");
      samples.push({
        x,
        y,
        pressure: mapStudioBrushAliasPressure(
          active.recipe.brushId,
          element.pressures?.[index],
          0.55,
        ),
      });
      active.livePoints.push(x, y);
      active.previousSourceX = x;
      active.previousSourceY = y;
    }
    active.consumedSourcePoints = total;
    // 접미사만 덧그리면 이전 점의 둥근 캡이 두 번 칠해져 시작점과 모든 포인터 프레임 경계에
    // 알파가 두 배인 "구슬"이 남는다(실측: 물붓 라이브 프레임의 시작 원 2901px, 반투명 펜의
    // 마디). 라이브 폴리라인은 매 프레임 지우고 전체를 한 번에 긋는다 — 한 path 의 stroke 는
    // 자기 자신과 겹쳐도 알파를 더하지 않는다.
    this.clearActiveRect();
    if (!this.paintInkwashLivePolyline(active.livePoints, active.recipe)) {
      return this.failActive("surface-render");
    }
    return {
      status: "appended",
      consumedSourcePoints: total,
      appendedDabs: samples.length,
      uploadedTiles: 1,
    };
  }

`;
  const newSuffix = `  private paintInkwashSuffix(
    element: DrawEl,
    fromIndex: number,
  ): StudioLiveWetInkAppendResult {
    const active = this.activeInkwash;
    if (!active) return wetInkOperationFailure("surface-unavailable");
    const total = Math.floor(element.points.length / 2);
    if (total < fromIndex) return this.failActive("source-prefix");
    if (total === fromIndex) {
      return {
        status: "noop",
        consumedSourcePoints: total,
        appendedDabs: 0,
        uploadedTiles: 0,
      };
    }
    const samples: Array<{ x: number; y: number; pressure: number }> = [];
    for (let index = fromIndex; index < total; index += 1) {
      const x = finiteCoordinate(element.points[index * 2]);
      const y = finiteCoordinate(element.points[index * 2 + 1]);
      if (x === null || y === null) return this.failActive("invalid-sample");
      const pressure = mapStudioBrushAliasPressure(
        active.recipe.brushId,
        element.pressures?.[index],
        0.55,
      );
      samples.push({ x, y, pressure });
      active.livePoints.push(x, y);
      active.previousSourceX = x;
      active.previousSourceY = y;
    }
    active.consumedSourcePoints = total;

    if (active.recipe.brushId === "inkwash-water-brush") {
      // Water carries no pigment, so keep the inexpensive directional guide until pointer-up.
      this.clearActiveRect();
      if (!this.paintInkwashLivePolyline(active.livePoints, active.recipe)) {
        return this.failActive("surface-render");
      }
      return {
        status: "appended",
        consumedSourcePoints: total,
        appendedDabs: samples.length,
        uploadedTiles: 1,
      };
    }

    const painted = this.paintInkwashPreviewSamples(active, samples);
    if (!painted) return this.failActive("surface-render");
    return {
      status: painted.stamps === 0 ? "noop" : "appended",
      consumedSourcePoints: total,
      appendedDabs: painted.stamps,
      uploadedTiles: painted.uploadedTiles,
    };
  }

  private paintInkwashPreviewSamples(
    active: ActiveInkwashStroke,
    samples: ReadonlyArray<{ x: number; y: number; pressure: number }>,
  ): { readonly stamps: number; readonly uploadedTiles: number } | null {
    const scale = INKWASH_PREVIEW_FIELD_SCALE;
    const planned = planStudioInkwashFluidPreviewStamps(
      active.previewPlanner,
      samples.map((sample) => ({
        x: sample.x * scale,
        y: sample.y * scale,
        pressure: sample.pressure,
      })),
    );
    if (planned.stamps.length === 0) return { stamps: 0, uploadedTiles: 0 };

    const dirtyTiles = new Map<string, InkwashPreviewDirtyTile>();
    for (const stamp of planned.stamps) {
      const reach = stamp.radius * 2 + 1;
      const firstTileX = Math.floor((stamp.x - reach) / INKWASH_PREVIEW_TILE_SIZE);
      const lastTileX = Math.floor((stamp.x + reach) / INKWASH_PREVIEW_TILE_SIZE);
      const firstTileY = Math.floor((stamp.y - reach) / INKWASH_PREVIEW_TILE_SIZE);
      const lastTileY = Math.floor((stamp.y + reach) / INKWASH_PREVIEW_TILE_SIZE);
      for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
        for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
          const key = tileX + ":" + tileY;
          let tile = active.previewTiles.get(key);
          if (!tile) {
            if (active.previewTiles.size >= INKWASH_PREVIEW_MAX_TILES) return null;
            tile = {
              tileX,
              tileY,
              session: createStudioInkwashFluidSession({
                width: INKWASH_PREVIEW_TILE_SIZE,
                height: INKWASH_PREVIEW_TILE_SIZE,
                coarseBase: 32,
              }),
            };
            active.previewTiles.set(key, tile);
          }
          const originX = tileX * INKWASH_PREVIEW_TILE_SIZE;
          const originY = tileY * INKWASH_PREVIEW_TILE_SIZE;
          depositStudioInkwashFluidStamp(tile.session, {
            ...stamp,
            x: stamp.x - originX,
            y: stamp.y - originY,
          });
          const x0 = Math.max(0, Math.floor(stamp.x - originX - reach));
          const y0 = Math.max(0, Math.floor(stamp.y - originY - reach));
          const x1 = Math.min(
            INKWASH_PREVIEW_TILE_SIZE,
            Math.ceil(stamp.x - originX + reach) + 1,
          );
          const y1 = Math.min(
            INKWASH_PREVIEW_TILE_SIZE,
            Math.ceil(stamp.y - originY + reach) + 1,
          );
          if (x1 <= x0 || y1 <= y0) continue;
          const dirty = dirtyTiles.get(key);
          if (dirty) {
            dirty.x0 = Math.min(dirty.x0, x0);
            dirty.y0 = Math.min(dirty.y0, y0);
            dirty.x1 = Math.max(dirty.x1, x1);
            dirty.y1 = Math.max(dirty.y1, y1);
          } else {
            dirtyTiles.set(key, { tile, x0, y0, x1, y1 });
          }
        }
      }
    }

    const uploads = [...dirtyTiles.values()]
      .sort((left, right) => (
        left.tile.tileY - right.tile.tileY
        || left.tile.tileX - right.tile.tileX
      ))
      .map(({ tile, x0, y0, x1, y1 }) => resolveStudioInkwashFluidDisplay(
        tile.session,
        {
          originX: tile.tileX * INKWASH_PREVIEW_TILE_SIZE,
          originY: tile.tileY * INKWASH_PREVIEW_TILE_SIZE,
          clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
        },
      ));
    if (!this.drawUploadsToActive(uploads, 0, 0, true, scale)) return null;
    return { stamps: planned.stamps.length, uploadedTiles: uploads.length };
  }

  private drawInkwashPreviewTiles(active: ActiveInkwashStroke): boolean {
    const uploads = [...active.previewTiles.values()]
      .sort((left, right) => (
        left.tileY - right.tileY || left.tileX - right.tileX
      ))
      .map((tile) => resolveStudioInkwashFluidDisplay(tile.session, {
        originX: tile.tileX * INKWASH_PREVIEW_TILE_SIZE,
        originY: tile.tileY * INKWASH_PREVIEW_TILE_SIZE,
      }));
    return this.drawUploadsToActive(
      uploads,
      0,
      0,
      false,
      INKWASH_PREVIEW_FIELD_SCALE,
    );
  }

`;
  source = replaceOnce(source, oldSuffix, newSuffix, "overlay preview suffix");

  source = replaceOnce(
    source,
`  private drawUploadsToActive(
    uploads: readonly StudioWetInkTileUpload[],
    originX: number,
    originY: number,
    replaceTiles: boolean,
  ): boolean {
`,
`  private drawUploadsToActive(
    uploads: readonly StudioWetInkTileUpload[],
    originX: number,
    originY: number,
    replaceTiles: boolean,
    fieldScale = STUDIO_WET_INK_BRUSH_FIELD_SCALE,
  ): boolean {
`,
    "overlay upload scale signature",
  );

  const uploadScaleBlock = `        const destinationX =
          originX + item.upload.x / STUDIO_WET_INK_BRUSH_FIELD_SCALE;
        const destinationY =
          originY + item.upload.y / STUDIO_WET_INK_BRUSH_FIELD_SCALE;
        const destinationWidth =
          item.upload.width / STUDIO_WET_INK_BRUSH_FIELD_SCALE;
        const destinationHeight =
          item.upload.height / STUDIO_WET_INK_BRUSH_FIELD_SCALE;
`;
  const uploadScaleReplacement = `        const destinationX = originX + item.upload.x / fieldScale;
        const destinationY = originY + item.upload.y / fieldScale;
        const destinationWidth = item.upload.width / fieldScale;
        const destinationHeight = item.upload.height / fieldScale;
`;
  source = replaceOnce(
    source,
    uploadScaleBlock,
    uploadScaleReplacement,
    "overlay upload scale body",
  );

  source = replaceOnce(
    source,
`  private resetActiveState(): void {
    this.active = null;
    this.activeInkwash = null;
    this.setActiveCanvasOpacity(1);
  }
`,
`  private resetActiveState(): void {
    this.activeInkwash?.previewTiles.clear();
    this.active = null;
    this.activeInkwash = null;
    this.setActiveCanvasOpacity(1);
  }
`,
    "overlay preview cleanup",
  );
  return source;
});

update("src/domains/creator/live/studio-live-wet-ink-integration.test.ts", (source) => {
  return replaceOnce(
    source,
`  it("keeps InkWash pointer frames off grow/deposit/Stam", () => {
    const suffixStart = overlaySource.indexOf("private paintInkwashSuffix(");
    const suffixEnd = overlaySource.indexOf("private paintInkwashLivePolyline(");
    expect(suffixStart).toBeGreaterThan(0);
    expect(suffixEnd).toBeGreaterThan(suffixStart);
    const suffix = overlaySource.slice(suffixStart, suffixEnd);
    expect(suffix).not.toContain("growInkwashWash");
    expect(suffix).not.toContain("depositStudioInkwashFluidStroke");
    expect(suffix).not.toContain("stepStudioInkwashFluid");
    expect(suffix).not.toContain("markStudioInkwashWashDeposited");
    expect(overlaySource).toContain("private settleInkwashStroke(");
  });
`,
`  it("uses a causal tiled Beer-Lambert InkWash preview without running Stam", () => {
    const suffixStart = overlaySource.indexOf("private paintInkwashSuffix(");
    const suffixEnd = overlaySource.indexOf("private paintInkwashLivePolyline(");
    expect(suffixStart).toBeGreaterThan(0);
    expect(suffixEnd).toBeGreaterThan(suffixStart);
    const suffix = overlaySource.slice(suffixStart, suffixEnd);
    expect(suffix).toContain("paintInkwashPreviewSamples");
    expect(suffix).toContain("planStudioInkwashFluidPreviewStamps");
    expect(suffix).toContain("resolveStudioInkwashFluidDisplay");
    expect(suffix).toContain("INKWASH_PREVIEW_TILE_SIZE");
    expect(suffix).not.toContain("growInkwashWash");
    expect(suffix).not.toContain("depositStudioInkwashFluidStroke");
    expect(suffix).not.toContain("stepStudioInkwashFluid");
    expect(suffix).not.toContain("markStudioInkwashWashDeposited");
    expect(overlaySource).toContain("private settleInkwashStroke(");
  });
`,
    "integration preview contract",
  );
});

update("scripts/verify-studio-long-stroke.mts", (source) => {
  source = replaceOnce(
    source,
`const BRUSH_NAME_ENV = process.env.TOONSPECTRUM_LONG_STROKE_BRUSH?.trim() || null;
const DEVICE_SCALE_FACTOR = Number(process.env.TOONSPECTRUM_LONG_STROKE_DPR ?? "1") || 1;
`,
`const BRUSH_NAME_ENV = process.env.TOONSPECTRUM_LONG_STROKE_BRUSH?.trim() || null;
const BRUSH_SEARCH_ENV =
  process.env.TOONSPECTRUM_LONG_STROKE_BRUSH_SEARCH?.trim() || null;
const parsedBrushWidth = Number(process.env.TOONSPECTRUM_LONG_STROKE_BRUSH_WIDTH);
const BRUSH_WIDTH_ENV = Number.isFinite(parsedBrushWidth) && parsedBrushWidth > 0
  ? parsedBrushWidth
  : null;
const DEVICE_SCALE_FACTOR = Number(process.env.TOONSPECTRUM_LONG_STROKE_DPR ?? "1") || 1;
`,
    "long-stroke pinned brush env",
  );

  source = replaceOnce(
    source,
` *   TOONSPECTRUM_LONG_STROKE_DPR             deviceScaleFactor(기본 1)
`,
` *   TOONSPECTRUM_LONG_STROKE_BRUSH_SEARCH    카탈로그 검색어(전체 이름보다 짧은 고유어 권장)
 *   TOONSPECTRUM_LONG_STROKE_BRUSH_WIDTH     브러시 기본 폭; preview에서 /src 조회를 생략
 *   TOONSPECTRUM_LONG_STROKE_DPR             deviceScaleFactor(기본 1)
`,
    "long-stroke env docs",
  );

  source = replaceOnce(
    source,
`interface BrushChoice { readonly name: string | null; readonly width: number; readonly source: string }
`,
`interface BrushChoice {
  readonly name: string | null;
  readonly searchTerm: string | null;
  readonly width: number;
  readonly source: string;
}
`,
    "long-stroke brush choice",
  );

  source = replaceOnce(
    source,
`async function selectBrush(page: Page, name: string): Promise<void> {
`,
`async function selectBrush(
  page: Page,
  name: string,
  searchTerm: string = name,
): Promise<void> {
`,
    "long-stroke select signature",
  );

  source = replaceOnce(
    source,
`  await catalog.getByRole("searchbox").fill(name);
  const option = catalog.getByRole("button", { name: \`${name} 선택\`, exact: true });
`,
`  await catalog.getByRole("searchbox").fill(searchTerm);
  const option = catalog
    .getByRole("button", { name: \`${name} 선택\`, exact: true })
    .first();
`,
    "long-stroke robust catalog query",
  );

  source = replaceOnce(
    source,
`async function resolveBrush(page: Page): Promise<BrushChoice> {
  const catalog = await page.evaluate(async ({ wanted, modulePath }) => {
`,
`async function resolveBrush(page: Page): Promise<BrushChoice> {
  if (BRUSH_NAME_ENV && BRUSH_WIDTH_ENV !== null) {
    return {
      name: BRUSH_NAME_ENV,
      searchTerm: BRUSH_SEARCH_ENV ?? BRUSH_NAME_ENV,
      width: BRUSH_WIDTH_ENV,
      source: "env-pinned",
    };
  }
  const catalog = await page.evaluate(async ({ wanted, modulePath }) => {
`,
    "long-stroke preview-safe resolve start",
  );

  source = replaceOnce(
    source,
`  if (catalog) return { ...catalog, source: BRUSH_NAME_ENV ? "env+catalog" : "catalog-first-paint" };
  if (BRUSH_NAME_ENV) return { name: BRUSH_NAME_ENV, width: 12, source: "env" };
`,
`  if (catalog) {
    return {
      ...catalog,
      searchTerm: BRUSH_SEARCH_ENV ?? catalog.name,
      source: BRUSH_NAME_ENV ? "env+catalog" : "catalog-first-paint",
    };
  }
  if (BRUSH_NAME_ENV) {
    return {
      name: BRUSH_NAME_ENV,
      searchTerm: BRUSH_SEARCH_ENV ?? BRUSH_NAME_ENV,
      width: 12,
      source: "env-unpinned-width",
    };
  }
`,
    "long-stroke resolve returns",
  );

  source = replaceOnce(
    source,
`  return { name: null, width: 12, source: \`active-pill:${label ?? "unknown"}\` };
`,
`  return {
    name: null,
    searchTerm: null,
    width: 12,
    source: \`active-pill:${label ?? "unknown"}\`,
  };
`,
    "long-stroke active return",
  );

  source = replaceOnce(
    source,
`async function readCommittedStroke(page: Page): Promise<CommittedStroke | null> {
  const deadline = Date.now() + COMMIT_READ_TIMEOUT_MS;
`,
`async function readCommittedStroke(page: Page): Promise<CommittedStroke | null> {
  // Production preview has no /src modules. Do not manufacture three console 404s before taking
  // the documented input-delivery fallback; dev-server runs keep the richer SQLite proof.
  if (SPAWN_PREVIEW) return null;
  const deadline = Date.now() + COMMIT_READ_TIMEOUT_MS;
`,
    "long-stroke preview source probe",
  );

  source = replaceOnce(
    source,
`    if (brush.name) await selectBrush(page, brush.name);
`,
`    if (brush.name) {
      await selectBrush(page, brush.name, brush.searchTerm ?? brush.name);
    }
`,
    "long-stroke selection call",
  );
  return source;
});

update("scripts/verify-inkwash-dippen-live-commit-fidelity.mts", (source) => {
  source = replaceOnce(
    source,
`interface FidelityCaseDefinition {
  readonly id: "inkwash-pen" | "glass-pen";
  readonly brushName: string;
  readonly contract: string;
}
`,
`interface FidelityCaseDefinition {
  readonly id: "inkwash-pen" | "glass-pen";
  readonly brushName: string;
  readonly searchTerm: string;
  readonly brushWidth: number;
  readonly contract: string;
}
`,
    "fidelity case definition",
  );

  source = replaceOnce(
    source,
`    brushName: "잉크워시 딥펜(유체 잉크)",
    contract: "fluid wet-ink live overlay → committed document pixels",
`,
`    brushName: "잉크워시 딥펜(유체 잉크)",
    searchTerm: "잉크워시 딥펜",
    brushWidth: 8,
    contract: "fluid wet-ink live overlay → committed document pixels",
`,
    "fidelity inkwash case",
  );

  source = replaceOnce(
    source,
`    brushName: "유리펜(잉크 흐름)",
    contract: "thin-line causal filtering → committed document geometry",
`,
`    brushName: "유리펜(잉크 흐름)",
    searchTerm: "유리펜",
    brushWidth: 3.1,
    contract: "thin-line causal filtering → committed document geometry",
`,
    "fidelity glass case",
  );

  source = replaceOnce(
    source,
`      TOONSPECTRUM_LONG_STROKE_BRUSH: definition.brushName,
      TOONSPECTRUM_LONG_STROKE_SPAWN_PREVIEW: SPAWN_PREVIEW ? "1" : "0",
`,
`      TOONSPECTRUM_LONG_STROKE_BRUSH: definition.brushName,
      TOONSPECTRUM_LONG_STROKE_BRUSH_SEARCH: definition.searchTerm,
      TOONSPECTRUM_LONG_STROKE_BRUSH_WIDTH: String(definition.brushWidth),
      TOONSPECTRUM_LONG_STROKE_SPAWN_PREVIEW: SPAWN_PREVIEW ? "1" : "0",
`,
    "fidelity pinned child env",
  );
  return source;
});

writeFileSync(
  "src/domains/creator/brush/studio-inkwash-fluid-live-preview.test.ts",
`import { describe, expect, it } from "vitest";

import {
  appendStudioInkwashFluidPreviewStroke,
  createStudioInkwashFluidPreviewPlanner,
  createStudioInkwashFluidSession,
  planStudioInkwashFluidPreviewStamps,
  resolveStudioInkwashFluidDisplay,
} from "./studio-inkwash-fluid";

const WIDTH = 1_024;
const HEIGHT = 160;

function samples(count = 97) {
  return Array.from({ length: count }, (_, index) => {
    const amount = index / (count - 1);
    return {
      x: 24 + amount * 960,
      y: 80 + Math.sin(amount * Math.PI * 4) * 18,
      pressure: 0.22 + amount * 0.72,
    };
  });
}

function planner() {
  return createStudioInkwashFluidPreviewPlanner({
    tool: "pen",
    radius: 8,
    pigmentLoad: 1.45,
    wetnessLoad: 0.16,
    inkColor: { r: 28, g: 21, b: 118 },
    spectralAbsorption: { r: 1, g: 0.96, b: 0.88 },
    radiusScale: 1.164,
    pigmentScale: 1.26,
  });
}

function render(chunks: readonly (readonly ReturnType<typeof samples>[number][])[]) {
  const session = createStudioInkwashFluidSession({ width: WIDTH, height: HEIGHT });
  const state = planner();
  for (const chunk of chunks) {
    appendStudioInkwashFluidPreviewStroke(session, state, chunk);
  }
  return {
    pigment: session.fluid.pigment.slice(),
    wet: session.fluid.wet.slice(),
    rgba: resolveStudioInkwashFluidDisplay(session).rgba,
  };
}

describe("causal InkWash live preview", () => {
  it("is byte-identical whether accepted samples arrive together or as pointer suffixes", () => {
    const all = samples();
    const once = render([all]);
    const chunked = render([
      all.slice(0, 1),
      all.slice(1, 7),
      all.slice(7, 31),
      all.slice(31, 64),
      all.slice(64),
    ]);
    expect(chunked.pigment).toEqual(once.pigment);
    expect(chunked.wet).toEqual(once.wet);
    expect(chunked.rgba).toEqual(once.rgba);
  });

  it("keeps the pointer suffix dirty region bounded instead of repainting the full stroke", () => {
    const state = planner();
    const all = samples(9);
    const first = planStudioInkwashFluidPreviewStamps(state, all.slice(0, 5));
    const suffix = planStudioInkwashFluidPreviewStamps(state, all.slice(5));
    expect(first.stamps.length).toBeGreaterThan(0);
    expect(suffix.stamps.length).toBeGreaterThan(0);
    expect(suffix.dirtyBounds).not.toBeNull();
    expect(suffix.dirtyBounds!.width).toBeLessThan(WIDTH * 0.65);
  });

  it("preserves pressure as both width and optical-density information", () => {
    const state = planner();
    const planned = planStudioInkwashFluidPreviewStamps(state, [
      { x: 40, y: 80, pressure: 0.1 },
      { x: 480, y: 80, pressure: 1 },
    ]);
    expect(planned.stamps.length).toBeGreaterThan(20);
    const early = planned.stamps[Math.floor(planned.stamps.length * 0.1)]!;
    const late = planned.stamps[Math.floor(planned.stamps.length * 0.9)]!;
    expect(late.radius).toBeGreaterThan(early.radius * 1.35);
    expect(late.pigment[0]).toBeGreaterThan(early.pigment[0] * 1.2);
  });

  it("produces a soft optical edge wider than the flat nominal pen without touching commit math", () => {
    const result = render([samples(33)]);
    const alpha = result.rgba;
    let occupied = 0;
    let soft = 0;
    for (let index = 3; index < alpha.length; index += 4) {
      const value = alpha[index]!;
      if (value > 8) occupied += 1;
      if (value > 8 && value < 224) soft += 1;
    }
    expect(occupied).toBeGreaterThan(2_500);
    expect(soft / occupied).toBeGreaterThan(0.24);
  });
});
`,
);

writeFileSync(
  ".github/workflows/studio-inkwash-live-preview-quality.yml",
`name: Studio InkWash live preview quality

on:
  push:
    branches:
      - fix/inkwash-live-preview-quality-20260904
    paths:
      - "src/domains/creator/brush/studio-inkwash-fluid.ts"
      - "src/domains/creator/brush/studio-inkwash-fluid-live-preview.test.ts"
      - "src/domains/creator/live/studio-live-wet-ink-overlay.ts"
      - "src/domains/creator/live/studio-live-wet-ink-integration.test.ts"
      - "scripts/verify-studio-long-stroke.mts"
      - "scripts/verify-inkwash-dippen-live-commit-fidelity.mts"
      - ".github/workflows/studio-inkwash-live-preview-quality.yml"
  pull_request:
    branches: [main]
    paths:
      - "src/domains/creator/brush/studio-inkwash-fluid.ts"
      - "src/domains/creator/brush/studio-inkwash-fluid-live-preview.test.ts"
      - "src/domains/creator/live/studio-live-wet-ink-overlay.ts"
      - "src/domains/creator/live/studio-live-wet-ink-integration.test.ts"
      - "scripts/verify-studio-long-stroke.mts"
      - "scripts/verify-inkwash-dippen-live-commit-fidelity.mts"
      - ".github/workflows/studio-inkwash-live-preview-quality.yml"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: studio-inkwash-live-preview-quality-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-24.04
    timeout-minutes: 45
    env:
      NODE_OPTIONS: --max-old-space-size=8192
      TOONSPECTRUM_VERIFY_DIR: ${{ runner.temp }}/studio-inkwash-live-preview-quality
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
        with:
          version: 11.4.0
          run_install: false
      - uses: actions/setup-node@v6
        with:
          node-version: 24.16.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Focused contracts
        run: >-
          pnpm exec vitest run
          src/domains/creator/brush/studio-inkwash-fluid-deposit.test.ts
          src/domains/creator/brush/studio-inkwash-fluid-live-preview.test.ts
          src/domains/creator/live/studio-live-wet-ink-overlay.test.ts
          src/domains/creator/live/studio-live-wet-ink-integration.test.ts
      - name: Lint quality surface
        run: >-
          pnpm exec eslint --max-warnings=0
          src/domains/creator/brush/studio-inkwash-fluid.ts
          src/domains/creator/brush/studio-inkwash-fluid-live-preview.test.ts
          src/domains/creator/live/studio-live-wet-ink-overlay.ts
          src/domains/creator/live/studio-live-wet-ink-integration.test.ts
          scripts/verify-studio-long-stroke.mts
          scripts/verify-inkwash-dippen-live-commit-fidelity.mts
      - name: Typecheck
        run: pnpm exec tsc -p tsconfig.json --noEmit
      - name: Production build
        run: pnpm run build
      - name: Install Chromium
        run: pnpm exec playwright install --with-deps chromium
      - name: Live/commit visual and long-stroke gate
        env:
          TOONSPECTRUM_INK_FIDELITY_SPAWN_PREVIEW: "1"
        run: pnpm exec tsx scripts/verify-inkwash-dippen-live-commit-fidelity.mts
      - name: Upload visual evidence
        if: ${{ always() }}
        uses: actions/upload-artifact@v4
        with:
          name: studio-inkwash-live-preview-quality
          path: ${{ runner.temp }}/studio-inkwash-live-preview-quality
          if-no-files-found: warn
          retention-days: 14
`,
);

rmSync("scripts/apply-inkwash-live-preview-quality-wave.mjs");
rmSync(".github/workflows/apply-inkwash-live-preview-quality-wave.yml");
