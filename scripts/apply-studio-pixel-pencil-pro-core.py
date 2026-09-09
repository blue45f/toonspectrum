from __future__ import annotations

from pathlib import Path
from textwrap import dedent

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def write(relative: str, content: str) -> None:
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def replace_once(relative: str, old: str, new: str) -> None:
    source = read(relative)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{relative}: expected one match, found {count}: {old[:120]!r}")
    write(relative, source.replace(old, new, 1))


PIXEL = "apps/web/src/domains/creator/studio-pixel-pencil.ts"
PIXEL_TEST = "apps/web/src/domains/creator/studio-pixel-pencil.test.ts"
POINTER = "apps/web/src/domains/creator/brush/studio-draw-pointer-start-plan.ts"
POINTER_TEST = "apps/web/src/domains/creator/brush/studio-draw-pointer-start-plan.test.ts"
FREEHAND = (
    "apps/web/src/domains/creator/studio-cuttoon-editor/"
    "studio-cuttoon-stage-pointers-freehand.ts"
)
WIDTH = "apps/web/src/domains/creator/brush/studio-brush-mode-width.ts"
WIDTH_TEST = "apps/web/src/domains/creator/brush/studio-brush-mode-width.test.ts"
DOC = "docs/studio-pixel-pencil-pro-benchmark-2026-09-09.md"

replace_once(
    PIXEL,
    "export const STUDIO_PIXEL_PENCIL_HARD_MAX_CELL_VISITS = 4_000_000;\n",
    "export const STUDIO_PIXEL_PENCIL_HARD_MAX_CELL_VISITS = 4_000_000;\n"
    "export const STUDIO_PIXEL_PENCIL_MIN_STROKE_WIDTH = 1;\n"
    "export const STUDIO_PIXEL_PENCIL_MAX_STROKE_WIDTH = 64;\n",
)
replace_once(
    PIXEL,
    '  | "invalid-points"\n  | "invalid-coordinate"',
    '  | "invalid-points"\n  | "invalid-stroke-width"\n  | "invalid-coordinate"',
)
replace_once(
    PIXEL,
    "  readonly strokeWidth?: number;\n",
    "  readonly strokeWidth?: unknown;\n",
)
replace_once(
    PIXEL,
    dedent(
        '''\
        /**
         * Pixel input is accepted when it crosses a cell boundary, even if the physical move is shorter
         * than one document unit. A distance-only filter would lose short edge crossings at pointer-up.
         */
        export function shouldAppendStudioPixelPencilSample(input: {
          readonly lastX: unknown;
          readonly lastY: unknown;
          readonly nextX: unknown;
          readonly nextY: unknown;
        }): boolean {
          const previous = studioPixelPencilCellAt(input.lastX, input.lastY);
          const next = studioPixelPencilCellAt(input.nextX, input.nextY);
          return previous !== null
            && next !== null
            && (previous.x !== next.x || previous.y !== next.y);
        }
        '''
    ),
    dedent(
        '''\
        export type StudioPixelPencilSampleUpdate = "ignore" | "append" | "replace-tail";

        export interface StudioPixelPencilSampleUpdateInput {
          /** Flat point pairs already recorded for the active stroke. */
          readonly points: unknown;
          readonly nextX: unknown;
          readonly nextY: unknown;
          readonly strokeWidth?: unknown;
          /** Aseprite-style one-pixel corner cleanup. Defaults to enabled. */
          readonly pixelPerfect?: boolean;
        }

        /**
         * Normalizes a pixel tip to an integer document-cell diameter. The hard upper bound protects every
         * renderer from accidental quadratic stamp work and makes malformed persisted widths fail closed.
         */
        export function normalizeStudioPixelPencilStrokeWidth(value: unknown): number | null {
          if (value === undefined) return STUDIO_PIXEL_PENCIL_MIN_STROKE_WIDTH;
          if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
          const rounded = Math.round(value);
          if (!Number.isSafeInteger(rounded) || rounded < STUDIO_PIXEL_PENCIL_MIN_STROKE_WIDTH) {
            return null;
          }
          return Math.min(rounded, STUDIO_PIXEL_PENCIL_MAX_STROKE_WIDTH);
        }

        function samePixelCell(
          left: StudioPixelPencilCell,
          right: StudioPixelPencilCell
        ): boolean {
          return left.x === right.x && left.y === right.y;
        }

        /**
         * Plans one active-stroke update without mutating the source point array.
         *
         * For a 1px tip, A→B→C where AB and BC are cardinal steps and AC is a diagonal replaces B with
         * C. This removes the doubled stair-step corner while preserving sparse moves, larger tips, and the
         * versioned replay result of every already-persisted stroke.
         */
        export function planStudioPixelPencilSampleUpdate(
          input: StudioPixelPencilSampleUpdateInput
        ): StudioPixelPencilSampleUpdate {
          const source = normalizePointSource(input.points);
          const width = normalizeStudioPixelPencilStrokeWidth(input.strokeWidth);
          const next = studioPixelPencilCellAt(input.nextX, input.nextY);
          if (!source || source.length % 2 !== 0 || width === null || next === null) return "ignore";

          let current: StudioPixelPencilCell | null = null;
          let previous: StudioPixelPencilCell | null = null;
          for (let index = source.length - 2; index >= 0; index -= 2) {
            const cell = studioPixelPencilCellAt(source.at(index), source.at(index + 1));
            if (!cell) return "ignore";
            if (!current) {
              current = cell;
            } else if (!samePixelCell(current, cell)) {
              previous = cell;
              break;
            }
          }

          if (!current) return "append";
          if (samePixelCell(current, next)) return "ignore";
          if (input.pixelPerfect === false || width !== 1 || !previous) return "append";

          const previousToCurrent =
            Math.abs(previous.x - current.x) + Math.abs(previous.y - current.y);
          const currentToNext = Math.abs(current.x - next.x) + Math.abs(current.y - next.y);
          const previousToNextX = Math.abs(previous.x - next.x);
          const previousToNextY = Math.abs(previous.y - next.y);
          return previousToCurrent === 1
            && currentToNext === 1
            && previousToNextX === 1
            && previousToNextY === 1
            ? "replace-tail"
            : "append";
        }

        /**
         * Pixel input is accepted when it crosses a cell boundary, even if the physical move is shorter
         * than one document unit. A distance-only filter would lose short edge crossings at pointer-up.
         */
        export function shouldAppendStudioPixelPencilSample(input: {
          readonly lastX: unknown;
          readonly lastY: unknown;
          readonly nextX: unknown;
          readonly nextY: unknown;
        }): boolean {
          return planStudioPixelPencilSampleUpdate({
            points: [input.lastX, input.lastY],
            nextX: input.nextX,
            nextY: input.nextY,
            pixelPerfect: false,
          }) === "append";
        }
        '''
    ),
)
replace_once(
    PIXEL,
    dedent(
        '''\
          const limits = normalizeLimits(input);
          if (!limits) return emptyPlan("invalid-limits");

          const source = normalizePointSource(input.points);
        '''
    ),
    dedent(
        '''\
          const limits = normalizeLimits(input);
          if (!limits) return emptyPlan("invalid-limits");
          const width = normalizeStudioPixelPencilStrokeWidth(input.strokeWidth);
          if (width === null) return emptyPlan("invalid-stroke-width");
          const radius = Math.floor(width / 2);
          const isEven = width % 2 === 0;
          const minimumTipOffset = -radius;
          const maximumTipOffset = isEven ? radius - 1 : radius;

          const source = normalizePointSource(input.points);
        '''
    ),
)
replace_once(
    PIXEL,
    dedent(
        '''\
            if ("reason" in x) return emptyPlan(x.reason, sourcePointPairs);
            if ("reason" in y) return emptyPlan(y.reason, sourcePointPairs);
            const previous = vertices[vertices.length - 1];
        '''
    ),
    dedent(
        '''\
            if ("reason" in x) return emptyPlan(x.reason, sourcePointPairs);
            if ("reason" in y) return emptyPlan(y.reason, sourcePointPairs);
            if (
              x.cell + minimumTipOffset < -STUDIO_PIXEL_PENCIL_MAX_ABS_CELL
              || x.cell + maximumTipOffset > STUDIO_PIXEL_PENCIL_MAX_ABS_CELL
              || y.cell + minimumTipOffset < -STUDIO_PIXEL_PENCIL_MAX_ABS_CELL
              || y.cell + maximumTipOffset > STUDIO_PIXEL_PENCIL_MAX_ABS_CELL
            ) {
              return emptyPlan("coordinate-out-of-range", sourcePointPairs);
            }
            const previous = vertices[vertices.length - 1];
        '''
    ),
)
replace_once(
    PIXEL,
    dedent(
        '''\
          const width = Math.max(1, Math.round(input.strokeWidth ?? 1));
          const radius = Math.floor(width / 2);
          const isEven = width % 2 === 0;

          const visitStampedCell = (center: StudioPixelPencilCell): boolean => {
            if (width <= 1) return visit(center);
            const radiusSq = (width / 2) * (width / 2);
            for (let dy = -radius; dy <= (isEven ? radius - 1 : radius); dy++) {
              for (let dx = -radius; dx <= (isEven ? radius - 1 : radius); dx++) {
        '''
    ),
    dedent(
        '''\
          const visitStampedCell = (center: StudioPixelPencilCell): boolean => {
            if (width <= 1) return visit(center);
            const radiusSq = (width / 2) * (width / 2);
            for (let dy = minimumTipOffset; dy <= maximumTipOffset; dy++) {
              for (let dx = minimumTipOffset; dx <= maximumTipOffset; dx++) {
        '''
    ),
)

replace_once(
    PIXEL_TEST,
    dedent(
        '''\
          packStudioPixelPencilCells,
          planStudioPixelPencilCells,
          shouldAppendStudioPixelPencilSample,
          studioPixelPencilCellAt,
          STUDIO_PIXEL_PENCIL_MAX_ABS_CELL,
          STUDIO_PIXEL_PENCIL_RENDER_MODE,
        '''
    ),
    dedent(
        '''\
          normalizeStudioPixelPencilStrokeWidth,
          packStudioPixelPencilCells,
          planStudioPixelPencilCells,
          planStudioPixelPencilSampleUpdate,
          shouldAppendStudioPixelPencilSample,
          studioPixelPencilCellAt,
          STUDIO_PIXEL_PENCIL_MAX_ABS_CELL,
          STUDIO_PIXEL_PENCIL_MAX_STROKE_WIDTH,
          STUDIO_PIXEL_PENCIL_RENDER_MODE,
        '''
    ),
)
replace_once(
    PIXEL_TEST,
    dedent(
        '''\
          it("fills horizontal and vertical gaps between sparse pointer samples", () => {
        '''
    ),
    dedent(
        '''\
          it("plans Aseprite-style pixel-perfect corner cleanup without mutating samples", () => {
            const points = [0.2, 0.2, 1.2, 0.2];
            const before = [...points];

            expect(planStudioPixelPencilSampleUpdate({
              points,
              nextX: 1.2,
              nextY: 1.2,
              strokeWidth: 1,
            })).toBe("replace-tail");
            expect(planStudioPixelPencilSampleUpdate({
              points,
              nextX: 2.2,
              nextY: 0.2,
              strokeWidth: 1,
            })).toBe("append");
            expect(planStudioPixelPencilSampleUpdate({
              points,
              nextX: 1.2,
              nextY: 0.8,
              strokeWidth: 1,
            })).toBe("ignore");
            expect(planStudioPixelPencilSampleUpdate({
              points,
              nextX: 1.2,
              nextY: 1.2,
              strokeWidth: 2,
            })).toBe("append");
            expect(planStudioPixelPencilSampleUpdate({
              points,
              nextX: 1.2,
              nextY: 1.2,
              strokeWidth: 1,
              pixelPerfect: false,
            })).toBe("append");
            expect(points).toEqual(before);
          });

          it("fills horizontal and vertical gaps between sparse pointer samples", () => {
        '''
    ),
)
replace_once(
    PIXEL_TEST,
    dedent(
        '''\
          it("rejects malformed limits instead of silently accepting an unbounded job", () => {
        '''
    ),
    dedent(
        '''\
          it("normalizes integer tip sizes and rejects unsafe widths before cell planning", () => {
            expect(normalizeStudioPixelPencilStrokeWidth(undefined)).toBe(1);
            expect(normalizeStudioPixelPencilStrokeWidth(3.6)).toBe(4);
            expect(normalizeStudioPixelPencilStrokeWidth(500)).toBe(
              STUDIO_PIXEL_PENCIL_MAX_STROKE_WIDTH
            );
            expect(normalizeStudioPixelPencilStrokeWidth(0)).toBeNull();
            expect(normalizeStudioPixelPencilStrokeWidth(Number.POSITIVE_INFINITY)).toBeNull();
            expect(planStudioPixelPencilCells({
              points: [0, 0],
              strokeWidth: Number.POSITIVE_INFINITY,
            })).toMatchObject({ complete: false, reason: "invalid-stroke-width", cells: [] });
            expect(planStudioPixelPencilCells({
              points: [-STUDIO_PIXEL_PENCIL_MAX_ABS_CELL, 0],
              strokeWidth: 2,
            })).toMatchObject({ complete: false, reason: "coordinate-out-of-range", cells: [] });
          });

          it("rejects malformed limits instead of silently accepting an unbounded job", () => {
        '''
    ),
)

replace_once(
    POINTER,
    'import { STUDIO_PIXEL_PENCIL_RENDER_MODE } from "../studio-pixel-pencil";\n',
    dedent(
        '''\
        import {
          normalizeStudioPixelPencilStrokeWidth,
          STUDIO_PIXEL_PENCIL_MIN_STROKE_WIDTH,
          STUDIO_PIXEL_PENCIL_RENDER_MODE,
        } from "../studio-pixel-pencil";
        '''
    ),
)
replace_once(
    POINTER,
    '  const brushFamily = resolveStudioBrushRenderFamily(brush);\n',
    dedent(
        '''\
          const brushFamily = resolveStudioBrushRenderFamily(brush);
          const resolvedStrokeWidth = drawMode === "pixel"
            ? normalizeStudioPixelPencilStrokeWidth(strokeWidth)
              ?? STUDIO_PIXEL_PENCIL_MIN_STROKE_WIDTH
            : strokeWidth;
        '''
    ),
)
replace_once(
    POINTER,
    "    stroke: color,\n    strokeWidth,\n    opacity: brushOpacity,\n",
    "    stroke: color,\n    strokeWidth: resolvedStrokeWidth,\n    opacity: brushOpacity,\n",
)
replace_once(
    POINTER,
    '    symmetry: drawMode === "pixel" ? undefined : resolveStudioStrokeSymmetry(symmetry, brush),\n',
    dedent(
        '''\
            symmetry: resolveStudioStrokeSymmetry(
              symmetry,
              drawMode === "pixel" ? STUDIO_PIXEL_PENCIL_RENDER_MODE : brush
            ),
        '''
    ),
)
replace_once(
    POINTER,
    '        strokeWidth: drawMode === "pixel" ? 1 : strokeWidth,\n',
    "        strokeWidth: resolvedStrokeWidth,\n",
)

replace_once(
    POINTER_TEST,
    dedent(
        '''\
            {
              mode: "pixel" as const,
              expectedMode: "pen" as const,
              expectedWidth: 1,
              expectedPressure: 1,
        '''
    ),
    dedent(
        '''\
            {
              mode: "pixel" as const,
              expectedMode: "pen" as const,
              expectedWidth: 8,
              expectedPressure: 1,
        '''
    ),
)
replace_once(
    POINTER_TEST,
    dedent(
        '''\
          it("stores pixel pencil as a versioned hard-grid stroke without pen dynamics or symmetry", () => {
            const plan = planStudioDrawPointerStart(input({
              drawMode: "pixel",
              brush: "airbrush",
              brushOpacity: 0.65,
              symmetry: { type: "radial", centerX: 10, centerY: 20, radialCount: 12 },
            }));

            expect(plan.causalInputPlan.mode).toBe("legacy");
            expect(plan.capturePointerDynamics).toBe(false);
            expect(plan.element).toMatchObject({
              brush: STUDIO_PIXEL_PENCIL_RENDER_MODE,
              strokeWidth: 1,
              pressures: [1],
              opacity: 0.65,
              sampleSpacing: 1,
            });
            expect(plan.element.pressureModel).toBeUndefined();
            expect(plan.element.brushDynamics).toBeUndefined();
            expect(plan.element.symmetry).toBeUndefined();
          });
        '''
    ),
    dedent(
        '''\
          it("stores integer pixel tips and user symmetry without inheriting pen dynamics", () => {
            const plan = planStudioDrawPointerStart(input({
              drawMode: "pixel",
              brush: "airbrush",
              brushOpacity: 0.65,
              strokeWidth: 7.6,
              symmetry: { type: "radial", centerX: 10, centerY: 20, radialCount: 12 },
            }));

            expect(plan.causalInputPlan.mode).toBe("legacy");
            expect(plan.capturePointerDynamics).toBe(false);
            expect(plan.element).toMatchObject({
              brush: STUDIO_PIXEL_PENCIL_RENDER_MODE,
              strokeWidth: 8,
              pressures: [1],
              opacity: 0.65,
              sampleSpacing: 1,
              symmetry: { type: "radial", centerX: 10, centerY: 20, radialCount: 12 },
            });
            expect(plan.element.pressureModel).toBeUndefined();
            expect(plan.element.brushDynamics).toBeUndefined();
          });

          it("caps malformed and oversized pixel tip requests at a safe persisted width", () => {
            expect(planStudioDrawPointerStart(input({
              drawMode: "pixel",
              strokeWidth: 500,
            })).element.strokeWidth).toBe(64);
            expect(planStudioDrawPointerStart(input({
              drawMode: "pixel",
              strokeWidth: Number.POSITIVE_INFINITY,
            })).element.strokeWidth).toBe(1);
          });
        '''
    ),
)

replace_once(
    FREEHAND,
    dedent(
        '''\
        import {
          isStudioPixelPencilRenderMode,
          shouldAppendStudioPixelPencilSample,
        } from "../studio-pixel-pencil";
        '''
    ),
    dedent(
        '''\
        import {
          isStudioPixelPencilRenderMode,
          planStudioPixelPencilSampleUpdate,
        } from "../studio-pixel-pencil";
        '''
    ),
)
replace_once(
    FREEHAND,
    dedent(
        '''\
            const shouldAppend = isStudioPixelPencilRenderMode(current.brush)
              ? shouldAppendStudioPixelPencilSample({
                  lastX,
                  lastY,
                  nextX: targetX,
                  nextY: targetY,
                })
              : shouldAppendStudioCausalInkSample({
                  lastX,
                  lastY,
                  lastPressure,
                  nextX: targetX,
                  nextY: targetY,
                  nextPressure: pressure,
                  minDistance: current.sampleSpacing
                    ?? strokeSampleDistanceForScale(inputSettings?.coordinateScale ?? effScale),
                  pressureModel: current.pressureModel,
                });
            if (!shouldAppend) return;
        '''
    ),
    dedent(
        '''\
            const pixelSampleUpdate = isStudioPixelPencilRenderMode(current.brush)
              ? planStudioPixelPencilSampleUpdate({
                  points: current.points,
                  nextX: targetX,
                  nextY: targetY,
                  strokeWidth: current.strokeWidth,
                })
              : null;
            const shouldAppend = pixelSampleUpdate !== null
              ? pixelSampleUpdate !== "ignore"
              : shouldAppendStudioCausalInkSample({
                  lastX,
                  lastY,
                  lastPressure,
                  nextX: targetX,
                  nextY: targetY,
                  nextPressure: pressure,
                  minDistance: current.sampleSpacing
                    ?? strokeSampleDistanceForScale(inputSettings?.coordinateScale ?? effScale),
                  pressureModel: current.pressureModel,
                });
            if (!shouldAppend) return;
            if (pixelSampleUpdate === "replace-tail") {
              const points = current.points.slice();
              points[points.length - 2] = targetX;
              points[points.length - 1] = targetY;
              const pressures = current.pressures?.slice() ?? [1];
              pressures[pressures.length - 1] = 1;
              const nextPixelPerfect: DrawEl = { ...current, points, pressures };
              // Direct retained surfaces can append but cannot erase B from A→B→C. Hand the one
              // corrected corner back to the replaceable draft layer, exactly like Shift-line replacement.
              if (
                (liveDraftDirectRef.current || liveStampDraftDirectRef.current)
                && !drawingPredictionPreviewRef.current
              ) exitDirectLiveDraft();
              drawingRef.current = nextPixelPerfect;
              if (!drawingPredictionPreviewRef.current) scheduleDraft(nextPixelPerfect);
              return;
            }
        '''
    ),
)

write(
    WIDTH,
    dedent(
        '''\
        import type { DrawMode } from "../studio-editor-tool-model";
        import {
          normalizeStudioPixelPencilStrokeWidth,
          STUDIO_PIXEL_PENCIL_MIN_STROKE_WIDTH,
        } from "../studio-pixel-pencil";

        export interface StudioBrushModeWidthState {
          readonly drawMode: DrawMode;
          readonly strokeWidth: number;
          readonly lastNonPixelStrokeWidth: number;
        }

        function pixelWidth(requested: number, fallback: number): number {
          return normalizeStudioPixelPencilStrokeWidth(requested)
            ?? normalizeStudioPixelPencilStrokeWidth(fallback)
            ?? STUDIO_PIXEL_PENCIL_MIN_STROKE_WIDTH;
        }

        export function planStudioStrokeWidthChange(
          state: StudioBrushModeWidthState,
          requestedWidth: number,
        ): StudioBrushModeWidthState {
          if (state.drawMode === "pixel") {
            return {
              ...state,
              strokeWidth: pixelWidth(requestedWidth, state.strokeWidth),
            };
          }
          return {
            ...state,
            strokeWidth: requestedWidth,
            lastNonPixelStrokeWidth: requestedWidth,
          };
        }

        export function planStudioDrawModeChange(
          state: StudioBrushModeWidthState,
          nextMode: DrawMode,
        ): StudioBrushModeWidthState {
          if (nextMode === state.drawMode) {
            return state.drawMode === "pixel"
              ? { ...state, strokeWidth: pixelWidth(state.strokeWidth, 1) }
              : state;
          }
          if (nextMode === "pixel") {
            return {
              drawMode: nextMode,
              strokeWidth: pixelWidth(state.strokeWidth, 1),
              lastNonPixelStrokeWidth:
                state.drawMode === "pixel"
                  ? state.lastNonPixelStrokeWidth
                  : state.strokeWidth,
            };
          }
          return {
            drawMode: nextMode,
            strokeWidth:
              state.drawMode === "pixel"
                ? state.lastNonPixelStrokeWidth
                : state.strokeWidth,
            lastNonPixelStrokeWidth:
              state.drawMode === "pixel"
                ? state.lastNonPixelStrokeWidth
                : state.strokeWidth,
          };
        }
        '''
    ),
)
write(
    WIDTH_TEST,
    dedent(
        '''\
        import { describe, expect, it } from "vitest";

        import {
          planStudioDrawModeChange,
          planStudioStrokeWidthChange,
          type StudioBrushModeWidthState,
        } from "./studio-brush-mode-width";

        const PEN_STATE: StudioBrushModeWidthState = {
          drawMode: "pen",
          strokeWidth: 7,
          lastNonPixelStrokeWidth: 7,
        };

        describe("Studio pixel-pencil width isolation", () => {
          it("keeps an integer pixel tip while restoring the non-pixel width on exit", () => {
            const pixel = planStudioDrawModeChange(PEN_STATE, "pixel");
            expect(pixel).toEqual({
              drawMode: "pixel",
              strokeWidth: 7,
              lastNonPixelStrokeWidth: 7,
            });

            expect(planStudioDrawModeChange(pixel, "pen")).toEqual(PEN_STATE);
          });

          it("edits the active pixel tip without overwriting the remembered brush width", () => {
            const pixel = planStudioDrawModeChange(PEN_STATE, "pixel");
            expect(planStudioStrokeWidthChange(pixel, 47.6)).toEqual({
              drawMode: "pixel",
              strokeWidth: 48,
              lastNonPixelStrokeWidth: 7,
            });
          });

          it("clamps unsafe pixel widths and preserves later non-pixel edits", () => {
            const pixel = planStudioDrawModeChange(
              { ...PEN_STATE, strokeWidth: 500 },
              "pixel",
            );
            expect(pixel.strokeWidth).toBe(64);
            expect(planStudioStrokeWidthChange(pixel, Number.POSITIVE_INFINITY).strokeWidth).toBe(64);

            const marker = planStudioDrawModeChange(PEN_STATE, "eraser");
            const resized = planStudioStrokeWidthChange(marker, 18);
            const resizedPixel = planStudioDrawModeChange(resized, "pixel");
            expect(planStudioDrawModeChange(resizedPixel, "shape")).toMatchObject({
              drawMode: "shape",
              strokeWidth: 18,
              lastNonPixelStrokeWidth: 18,
            });
          });
        });
        '''
    ),
)

write(
    DOC,
    dedent(
        '''\
        # Studio Pixel Pencil Pro benchmark and implementation note

        Date: 2026-09-09

        ## Benchmark signals

        - **Aseprite** exposes integer brush size, a Pixel-perfect switch, multiple brush-tip families,
          symmetry axes, and tiled editing. The important interaction lesson is that pixel intent is visible
          in the primary context bar rather than hidden behind a generic brush engine.
        - **Krita** combines pixel-grid alignment and hard/sharp tips with mirror, multibrush, and wrap-around
          workflows. The reusable lesson is to share symmetry/document transforms while keeping pixel input
          free from stabilizer and pressure dynamics.
        - **Piskel** keeps sprite preview/export close to editing. Animation preview is valuable, but belongs
          to the frame/timeline product boundary rather than the pixel-pencil stroke contract.
        - **Lospec** makes palette and dithering constraints explicit. Palette lock and dither matrices should
          be implemented as document/color policies, not as hidden mutations inside one pen.

        ## Implemented in this change

        1. Integer hard tips from 1px through 64px, persisted per new stroke.
        2. Aseprite-style pixel-perfect cleanup for 1px A→B→C cardinal corners.
        3. User-selected vertical, horizontal, radial, kaleidoscope, and silk symmetry persisted on pixel
           strokes through the existing renderer-neutral transform contract.
        4. Strict width normalization and coordinate expansion validation before any stamp loop starts.
        5. Existing `pixel-grid-v1` replay remains untouched: cleanup happens only while recording new input.
        6. Direct live-preview ownership safely falls back to a replaceable draft for the rare corrected corner.

        ## Deliberately staged follow-ups

        - Palette lock, indexed-color conversion, and reusable project palettes.
        - Ordered/Bayer and pattern dithering with foreground/background color pairs.
        - Seamless tile/wrap-around preview and sprite animation playback.
        - Custom bitmap tips and tip rotation.

        These need explicit document and color-model migrations. Shipping them as pen-local flags would create
        export/replay inconsistencies, so this MR establishes the safe stroke/input foundation first.
        '''
    ),
)

print("Applied studio pixel-pencil professional core patch")
