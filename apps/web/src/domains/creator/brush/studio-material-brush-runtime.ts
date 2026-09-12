import {
  createBrushStudioV6MaterialStroke,
  brushStudioV6MaterialMarksToSvg,
  mapBrushStudioV6Pressure,
  mapBrushStudioV6Tilt,
  renderBrushStudioV6MaterialMarks,
  type BrushStudioV6MaterialConfig,
} from "../brush-lab/brush-studio-v6-material-engine";

import type { StudioBrushEngineProgramSet } from "./studio-brush-engine-program-set";
import { studioBrushSymmetryTransforms, type StudioBrushSymmetrySpec } from "./studio-brush-symmetry";

export interface StudioMaterialBrushElement {
  readonly points: readonly number[];
  readonly pressures?: readonly number[];
  readonly tiltXs?: readonly number[];
  readonly tiltYs?: readonly number[];
  readonly twists?: readonly number[];
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly opacity?: number;
  readonly brushEnginePrograms?: StudioBrushEngineProgramSet;
  readonly symmetry?: StudioBrushSymmetrySpec;
}

export function studioMaterialBrushConfig(element: StudioMaterialBrushElement): BrushStudioV6MaterialConfig | null {
  const material = element.brushEnginePrograms?.material;
  if (!material) return null;
  return {
    ...material,
    tuning: {
      ...material.tuning,
      size: Math.max(0.1, Math.min(240, element.strokeWidth)),
      primaryColor: /^#[\da-f]{6}$/iu.test(element.stroke) ? element.stroke : material.tuning.primaryColor,
      // Apply paint opacity per contact identically on Canvas and SVG.
      opacity: Math.max(0, Math.min(1, element.opacity ?? 1)),
    },
  };
}

type MaterialStroke = ReturnType<typeof createBrushStudioV6MaterialStroke>;
type MaterialSample = Parameters<MaterialStroke["push"]>[0];
export type StudioMaterialBrushMark = ReturnType<MaterialStroke["push"]>[number];

function sampleAt(element: StudioMaterialBrushElement, index: number, config: BrushStudioV6MaterialConfig): MaterialSample {
  return {
    x: element.points[index * 2]!,
    y: element.points[index * 2 + 1]!,
    pressure: mapBrushStudioV6Pressure(element.pressures?.[index] ?? 0.5, config.input),
    tilt: mapBrushStudioV6Tilt(Math.hypot(element.tiltXs?.[index] ?? 0, element.tiltYs?.[index] ?? 0), config.input),
    twist: element.twists?.[index] ?? 0,
  };
}

function sameSample(a: MaterialSample, b: MaterialSample): boolean {
  return a.x === b.x && a.y === b.y && a.pressure === b.pressure
    && a.tilt === b.tilt && a.twist === b.twist;
}

/** O(new samples) append path; authoritative corrections rebuild deterministically. */
export class StudioMaterialBrushPlanner {
  private stroke: MaterialStroke | null = null;
  private config: BrushStudioV6MaterialConfig | null = null;
  private source: BrushStudioV6MaterialConfig | undefined;
  private samples: MaterialSample[] = [];
  private width = 0;
  private color = "";
  private opacity = 1;
  private symmetryKey = "";

  append(element: StudioMaterialBrushElement, verifyPrefix = false): {
    readonly reset: boolean;
    readonly marks: readonly StudioMaterialBrushMark[];
  } {
    const marks: StudioMaterialBrushMark[] = [];
    const result = this.appendBatches(element, (batch) => marks.push(...batch), verifyPrefix);
    return { reset: result.reset, marks };
  }

  appendBatches(
    element: StudioMaterialBrushElement,
    visitor: StudioMaterialBrushBatchVisitor,
    verifyPrefix = false,
    onReset?: () => void,
  ): StudioMaterialBrushBatchStatistics & { readonly reset: boolean } {
    const count = Math.floor(element.points.length / 2);
    const symmetryKey = JSON.stringify(element.symmetry ?? null);
    let reset = !this.stroke || this.source !== element.brushEnginePrograms?.material
      || this.width !== element.strokeWidth || this.color !== element.stroke
      || this.opacity !== (element.opacity ?? 1)
      || this.symmetryKey !== symmetryKey
      || count < this.samples.length;
    if (!reset && this.config && this.samples.length) {
      const start = verifyPrefix || count === this.samples.length ? 0 : this.samples.length - 1;
      for (let i = start; i < this.samples.length; i += 1) {
        if (!sameSample(this.samples[i]!, sampleAt(element, i, this.config))) { reset = true; break; }
      }
    }
    if (reset) {
      onReset?.();
      this.config = studioMaterialBrushConfig(element);
      this.stroke = this.config ? createBrushStudioV6MaterialStroke(this.config) : null;
      this.source = element.brushEnginePrograms?.material;
      this.width = element.strokeWidth;
      this.color = element.stroke;
      this.opacity = element.opacity ?? 1;
      this.symmetryKey = symmetryKey;
      this.samples = [];
    }
    const statistics = emptyBatchStatistics();
    if (!this.config || !this.stroke) return { reset, ...statistics };
    for (let i = this.samples.length; i < count; i += 1) {
      const sample = sampleAt(element, i, this.config);
      if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) break;
      visitMarkChunks(this.stroke.push(sample), visitor, statistics);
      this.samples.push(sample);
    }
    return { reset, ...statistics };
  }
}

export const STUDIO_MATERIAL_BRUSH_BATCH_MARKS = 1024;
export type StudioMaterialBrushBatchVisitor = (marks: readonly StudioMaterialBrushMark[]) => void;
export interface StudioMaterialBrushBatchStatistics {
  readonly totalMarks: number;
  readonly batches: number;
  readonly maxBatchMarks: number;
  /** Largest kernel result before subdivision; independent of whole-stroke contact count. */
  readonly maxGeneratedBatchMarks: number;
}
function emptyBatchStatistics() {
  return { totalMarks: 0, batches: 0, maxBatchMarks: 0, maxGeneratedBatchMarks: 0 };
}
function visitMarkChunks(
  marks: readonly StudioMaterialBrushMark[],
  visitor: StudioMaterialBrushBatchVisitor,
  statistics: ReturnType<typeof emptyBatchStatistics>,
): void {
  statistics.maxGeneratedBatchMarks = Math.max(statistics.maxGeneratedBatchMarks, marks.length);
  for (let offset = 0; offset < marks.length; offset += STUDIO_MATERIAL_BRUSH_BATCH_MARKS) {
    const batch = marks.length <= STUDIO_MATERIAL_BRUSH_BATCH_MARKS
      ? marks : marks.slice(offset, offset + STUDIO_MATERIAL_BRUSH_BATCH_MARKS);
    visitor(batch);
    statistics.totalMarks += batch.length;
    statistics.batches += 1;
    statistics.maxBatchMarks = Math.max(statistics.maxBatchMarks, batch.length);
  }
}

/** Whole-stroke replay owns only one kernel suffix; it never duplicates the input or retains contacts. */
export function visitStudioMaterialBrushBatches(
  element: StudioMaterialBrushElement,
  visitor: StudioMaterialBrushBatchVisitor,
): StudioMaterialBrushBatchStatistics {
  const statistics = emptyBatchStatistics();
  const config = studioMaterialBrushConfig(element);
  if (!config) return statistics;
  const stroke = createBrushStudioV6MaterialStroke(config);
  for (let index = 0; index < Math.floor(element.points.length / 2); index++) {
    const sample = sampleAt(element, index, config);
    if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) break;
    visitMarkChunks(stroke.push(sample), visitor, statistics);
  }
  return statistics;
}

/** Convenience for short previews/tests only. Production replay/export use the bounded visitor. */
export function planStudioMaterialBrush(element: StudioMaterialBrushElement): readonly StudioMaterialBrushMark[] {
  const marks: StudioMaterialBrushMark[] = [];
  visitStudioMaterialBrushBatches(element, (batch) => marks.push(...batch));
  return marks;
}

/** Contact-major order is invariant to pointer batching, including overlaps between copies. */
function* materialSymmetryBatches(marks: readonly StudioMaterialBrushMark[], symmetry?: StudioBrushSymmetrySpec): Generator<readonly StudioMaterialBrushMark[]> {
  const transforms = studioBrushSymmetryTransforms(symmetry);
  if (transforms.length === 1) { yield marks; return; }
  let batch: StudioMaterialBrushMark[] = [];
  for (const mark of marks) for (const [index, transform] of transforms.entries()) {
    if (index === 0) batch.push(mark);
    else {
      const cos = Math.cos(mark.angle);
      const sin = Math.sin(mark.angle);
      batch.push({ ...mark,
        x: transform.a * mark.x + transform.c * mark.y + transform.e,
        y: transform.b * mark.x + transform.d * mark.y + transform.f,
        angle: Math.atan2(transform.b * cos + transform.d * sin, transform.a * cos + transform.c * sin),
      });
    }
    if (batch.length === STUDIO_MATERIAL_BRUSH_BATCH_MARKS) { yield batch; batch = []; }
  }
  if (batch.length) yield batch;
}

/** All local primitives are reflection symmetric; transforming their axis is exact. */
export function renderStudioMaterialBrushMarks(context: CanvasRenderingContext2D, marks: readonly StudioMaterialBrushMark[], symmetry?: StudioBrushSymmetrySpec): void {
  for (const batch of materialSymmetryBatches(marks, symmetry)) renderBrushStudioV6MaterialMarks(context, batch);
}

export function studioMaterialBrushMarksToSvg(marks: readonly StudioMaterialBrushMark[], symmetry?: StudioBrushSymmetrySpec): string {
  const parts: string[] = [];
  for (const batch of materialSymmetryBatches(marks, symmetry)) parts.push(brushStudioV6MaterialMarksToSvg(batch));
  return parts.join("");
}

/** Exact primitive bounds for raster-copy crops; particles and wet spread exceed nib width. */
export function studioMaterialBrushBounds(element: StudioMaterialBrushElement): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const transforms = studioBrushSymmetryTransforms(element.symmetry);
  visitStudioMaterialBrushBatches(element, (marks) => {
    for (const transform of transforms) for (const mark of marks) {
    const x = transform.a * mark.x + transform.c * mark.y + transform.e;
    const y = transform.b * mark.x + transform.d * mark.y + transform.f;
    const cos = Math.cos(mark.angle);
    const sin = Math.sin(mark.angle);
    const axisX = transform.a * cos + transform.c * sin;
    const axisY = transform.b * cos + transform.d * sin;
    const rectangle = mark.shape === "rect" || mark.shape === "capsule";
    const ring = mark.shape === "ring" ? Math.max(0.3, Math.min(mark.radiusX, mark.radiusY) * 0.2) / 2 : 0;
    const extentX = (rectangle ? Math.abs(axisX) * mark.radiusX + Math.abs(axisY) * mark.radiusY : Math.hypot(axisX * mark.radiusX, axisY * mark.radiusY)) + ring;
    const extentY = (rectangle ? Math.abs(axisY) * mark.radiusX + Math.abs(axisX) * mark.radiusY : Math.hypot(axisY * mark.radiusX, axisX * mark.radiusY)) + ring;
    minX = Math.min(minX, x - extentX);
    minY = Math.min(minY, y - extentY);
    maxX = Math.max(maxX, x + extentX);
    maxY = Math.max(maxY, y + extentY);
    }
  });
  return Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
}

export const STUDIO_MATERIAL_BRUSH_CACHE_MARK_BUDGET = 32_768;
const CACHE_STROKE_MARKS = 8192;
const CACHE_STROKE_SAMPLES = 512;
const SAMPLE_ARRAY_KEYS = ["points", "pressures", "tiltXs", "tiltYs", "twists"] as const;
type SampleSnapshot = Pick<StudioMaterialBrushElement, typeof SAMPLE_ARRAY_KEYS[number]>;
interface MaterialCacheEntry {
  readonly key: string;
  readonly samples: SampleSnapshot;
  readonly marks: readonly StudioMaterialBrushMark[];
}
function sampleSnapshotMatches(snapshot: SampleSnapshot, element: StudioMaterialBrushElement): boolean {
  return SAMPLE_ARRAY_KEYS.every((key) => {
    const left = snapshot[key], right = element[key];
    return left === undefined ? right === undefined : right !== undefined
      && left.length === right.length && left.every((value, index) => value === right[index]);
  });
}

/** Small immutable contact plans only; oversized strokes stream without being cached. */
export class StudioMaterialBrushRenderCache {
  private entries = new Map<readonly number[], MaterialCacheEntry>();
  private retainedMarks = 0;

  statistics(): { readonly entries: number; readonly retainedMarks: number } {
    return { entries: this.entries.size, retainedMarks: this.retainedMarks };
  }

  render(context: CanvasRenderingContext2D, element: StudioMaterialBrushElement): StudioMaterialBrushBatchStatistics & { readonly cacheHit: boolean } {
    const key = JSON.stringify([studioMaterialBrushConfig(element), element.symmetry ?? null]);
    const cached = this.entries.get(element.points);
    if (cached && cached.key === key && sampleSnapshotMatches(cached.samples, element)) {
      this.entries.delete(element.points);
      this.entries.set(element.points, cached);
      const statistics = emptyBatchStatistics();
      visitMarkChunks(cached.marks, (batch) => renderStudioMaterialBrushMarks(context, batch, element.symmetry), statistics);
      return { ...statistics, cacheHit: true };
    }
    if (cached) { this.entries.delete(element.points); this.retainedMarks -= cached.marks.length; }
    let candidate: StudioMaterialBrushMark[] | null = element.points.length <= CACHE_STROKE_SAMPLES * 2 ? [] : null;
    const statistics = visitStudioMaterialBrushBatches(element, (marks) => {
      renderStudioMaterialBrushMarks(context, marks, element.symmetry);
      if (candidate && candidate.length + marks.length <= CACHE_STROKE_MARKS) candidate.push(...marks);
      else candidate = null;
    });
    if (candidate) {
      while (this.entries.size >= 32 || this.retainedMarks + candidate.length > STUDIO_MATERIAL_BRUSH_CACHE_MARK_BUDGET) {
        const oldest = this.entries.keys().next().value;
        if (oldest === undefined) break;
        this.retainedMarks -= this.entries.get(oldest)!.marks.length;
        this.entries.delete(oldest);
      }
      const samples: SampleSnapshot = {
        points: [...element.points], pressures: element.pressures?.slice(),
        tiltXs: element.tiltXs?.slice(), tiltYs: element.tiltYs?.slice(), twists: element.twists?.slice(),
      };
      this.entries.set(element.points, { key, samples, marks: candidate });
      this.retainedMarks += candidate.length;
    }
    return { ...statistics, cacheHit: false };
  }
}

const materialRenderCache = new StudioMaterialBrushRenderCache();
export function renderStudioMaterialBrush(context: CanvasRenderingContext2D, element: StudioMaterialBrushElement): StudioMaterialBrushBatchStatistics & { readonly cacheHit: boolean } {
  return materialRenderCache.render(context, element);
}

export const STUDIO_MATERIAL_BRUSH_SVG_UTF16_BYTE_BUDGET = 64 * 1024 * 1024;
export class StudioMaterialBrushSvgBudgetError extends Error {
  constructor(readonly byteBudget: number) {
    super("재료 브러시 SVG가 내보내기 크기 한도를 넘었습니다. 획을 줄이거나 PNG로 내보내 주세요. 원고의 획은 보존됩니다.");
    this.name = "StudioMaterialBrushSvgBudgetError";
  }
}

/** Chunk sinks may write incrementally; the string adapter below always enforces its fixed budget. */
export function writeStudioMaterialBrushSvg(
  element: StudioMaterialBrushElement,
  write: (chunk: string) => void,
  byteBudget = STUDIO_MATERIAL_BRUSH_SVG_UTF16_BYTE_BUDGET,
): StudioMaterialBrushBatchStatistics & { readonly serializedUtf16Bytes: number } {
  let serializedUtf16Bytes = 0;
  const statistics = visitStudioMaterialBrushBatches(element, (marks) => {
    for (const batch of materialSymmetryBatches(marks, element.symmetry)) {
      const chunk = brushStudioV6MaterialMarksToSvg(batch);
      serializedUtf16Bytes += chunk.length * 2;
      if (serializedUtf16Bytes > byteBudget) throw new StudioMaterialBrushSvgBudgetError(byteBudget);
      write(chunk);
    }
  });
  return { ...statistics, serializedUtf16Bytes };
}

export function studioMaterialBrushToSvg(element: StudioMaterialBrushElement): string {
  const chunks: string[] = [];
  writeStudioMaterialBrushSvg(element, (chunk) => chunks.push(chunk));
  return chunks.join("");
}
