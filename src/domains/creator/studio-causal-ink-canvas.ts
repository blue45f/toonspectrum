import {
  isStudioStrokePaintModel,
  type StudioStrokePaintModel,
} from "./studio-stroke-paint-model";

import type { StudioCausalInkDab } from "./studio-causal-ink";

/** Small structural surface shared by Konva.Context and native CanvasRenderingContext2D. */
export interface StudioCausalInkFillContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
}

/**
 * Paints an already planned causal round-dab sequence without changing its geometry.
 *
 * Legacy strokes intentionally issue one fill per dab, preserving historical source-over alpha.
 * `layered-flow-v1` (currently authored with flow=1) builds one compound circle union and fills it
 * once. A caller-supplied node/stroke opacity is therefore applied once to the completed stroke,
 * and appending a suffix cannot darken pixels that were already covered by the same stroke.
 */
export function fillStudioCausalInkDabs(
  context: StudioCausalInkFillContext,
  dabs: readonly StudioCausalInkDab[],
  color: string,
  paintModel?: StudioStrokePaintModel,
): void {
  if (dabs.length === 0) return;
  context.fillStyle = color;

  if (isStudioStrokePaintModel(paintModel)) {
    context.beginPath();
    for (const dab of dabs) {
      // moveTo begins a separate subpath, avoiding accidental straight connectors between arcs.
      context.moveTo(dab.x + dab.radius, dab.y);
      context.arc(dab.x, dab.y, dab.radius, 0, Math.PI * 2);
    }
    context.fill();
    return;
  }

  for (const dab of dabs) {
    context.beginPath();
    context.arc(dab.x, dab.y, dab.radius, 0, Math.PI * 2);
    context.fill();
  }
}
