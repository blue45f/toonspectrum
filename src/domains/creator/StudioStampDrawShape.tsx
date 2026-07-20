import { Shape } from "react-konva/lib/ReactKonvaCore";

import {
  processFreehandPoints,
  resampleStrokePressures,
} from "./studio-brush";
import { resolveStudioStampBrushStyle } from "./studio-brush-stamp-engine";
import { drawStudioStampStrokeWithSymmetry } from "./studio-stamp-symmetry-rendering";

import type { StudioStampBrushKind } from "./studio-brush-stamp-engine";
import type { DrawEl } from "./studio-element-model";

interface StudioStampDrawShapeProps {
  readonly composite: GlobalCompositeOperation;
  readonly el: DrawEl;
  readonly opacity: number;
  readonly renderSampleDistance: number;
  readonly stampKind: StudioStampBrushKind;
  readonly stroke: string;
  readonly strokeWidth: number;
}

/**
 * Optional high-fidelity stamp renderer. It is split from the initial Studio graph because only
 * four specialized brush presets use this planner, while ordinary pen/vector editing stays eager.
 */
export function StudioStampDrawShape({
  composite,
  el,
  opacity,
  renderSampleDistance,
  stampKind,
  stroke,
  strokeWidth,
}: StudioStampDrawShapeProps) {
  const stampStyle = resolveStudioStampBrushStyle(
    stampKind,
    { color: stroke, size: Math.max(1, strokeWidth), opacity },
    el.stamp
  );
  // v2 stores the already accepted/stabilized point stream as its rendering contract.
  // Re-smoothing a growing prefix would move or delete dabs that were already visible.
  const causalStamp = el.stampPipeline === "causal-walker-v2";
  const stampPoints = causalStamp
    ? el.points
    : processFreehandPoints(el.points, renderSampleDistance);
  const stampPressures = causalStamp
    ? el.pressures
    : resampleStrokePressures(
        el.pressures ?? [],
        Math.floor(stampPoints.length / 2),
        0.5
      );

  return (
    <Shape
      sceneFunc={(context) => {
        context.save();
        drawStudioStampStrokeWithSymmetry(
          context as unknown as CanvasRenderingContext2D,
          stampStyle,
          stampPoints,
          stampPressures,
          el.symmetry
        );
        context.restore();
      }}
      globalCompositeOperation={composite}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}
