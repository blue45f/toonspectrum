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
      this.config = studioMaterialBrushConfig(element);
      this.stroke = this.config ? createBrushStudioV6MaterialStroke(this.config) : null;
      this.source = element.brushEnginePrograms?.material;
      this.width = element.strokeWidth;
      this.color = element.stroke;
      this.opacity = element.opacity ?? 1;
      this.symmetryKey = symmetryKey;
      this.samples = [];
    }
    const marks: StudioMaterialBrushMark[] = [];
    if (!this.config || !this.stroke) return { reset, marks };
    for (let i = this.samples.length; i < count; i += 1) {
      const sample = sampleAt(element, i, this.config);
      if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) break;
      marks.push(...this.stroke.push(sample));
      this.samples.push(sample);
    }
    return { reset, marks };
  }
}

export function planStudioMaterialBrush(element: StudioMaterialBrushElement): readonly StudioMaterialBrushMark[] {
  return new StudioMaterialBrushPlanner().append(element).marks;
}

/** Transform the completed contact, including scatter and nib axis, as one affine copy. */
export function renderStudioMaterialBrushMarks(context: CanvasRenderingContext2D, marks: readonly StudioMaterialBrushMark[], symmetry?: StudioBrushSymmetrySpec): void {
  for (const transform of studioBrushSymmetryTransforms(symmetry)) {
    context.save();
    context.transform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f);
    renderBrushStudioV6MaterialMarks(context, marks);
    context.restore();
  }
}

export function studioMaterialBrushMarksToSvg(marks: readonly StudioMaterialBrushMark[], symmetry?: StudioBrushSymmetrySpec): string {
  const markup = brushStudioV6MaterialMarksToSvg(marks);
  return studioBrushSymmetryTransforms(symmetry).map(({ a, b, c, d, e, f }) => `<g transform="matrix(${a} ${b} ${c} ${d} ${e} ${f})">${markup}</g>`).join("");
}

/** Exact primitive bounds for raster-copy crops; particles and wet spread exceed nib width. */
export function studioMaterialBrushBounds(element: StudioMaterialBrushElement): { x: number; y: number; width: number; height: number } | null {
  const marks = planStudioMaterialBrush(element);
  if (!marks.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const transform of studioBrushSymmetryTransforms(element.symmetry)) for (const mark of marks) {
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
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
