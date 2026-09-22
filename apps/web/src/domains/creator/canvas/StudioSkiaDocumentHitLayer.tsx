import { Shape } from "react-konva/lib/ReactKonvaCore";

import { elBounds } from "../studio-element-geometry";

import type { El } from "../studio-element-model";
import type Konva from "konva";

export interface StudioSkiaDocumentHitLayerProps {
  readonly elements: readonly El[];
  readonly effectiveScale: number;
  readonly onSelect: (
    id: string,
    event?: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void;
}

function rotationOf(element: El): number {
  return "rotation" in element && typeof element.rotation === "number"
    ? element.rotation
    : 0;
}

function hitRect(
  context: Konva.Context,
  element: El,
): void {
  const bounds = elBounds(element);
  const angle = rotationOf(element) * Math.PI / 180;
  if (!angle) {
    context.rect(bounds.x, bounds.y, Math.max(0.1, bounds.w), Math.max(0.1, bounds.h));
    return;
  }
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [
    [0, 0],
    [bounds.w, 0],
    [bounds.w, bounds.h],
    [0, bounds.h],
  ] as const;
  corners.forEach(([x, y], index) => {
    const px = bounds.x + x * cos - y * sin;
    const py = bounds.y + x * sin + y * cos;
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  });
  context.closePath();
}

function hitDraw(
  context: Konva.Context,
  element: Extract<El, { type: "draw" }>,
): void {
  const points = element.points;
  if (points.length < 2) return;
  const kind = element.kind ?? "freehand";
  if (kind !== "freehand" && kind !== "line" && kind !== "arrow") {
    hitRect(context, element);
    context.closePath();
    return;
  }
  context.moveTo(points[0]!, points[1]!);
  for (let index = 2; index + 1 < points.length; index += 2) {
    context.lineTo(points[index]!, points[index + 1]!);
  }
}

export function StudioSkiaDocumentHitLayer({
  elements,
  effectiveScale,
  onSelect,
}: StudioSkiaDocumentHitLayerProps) {
  const hitWidth = 16 / Math.max(effectiveScale, 0.001);
  return (
    <>
      {elements.map((element) => {
        if (element.hidden || (element.opacity ?? 1) <= 0) return null;
        return (
          <Shape
            key={element.id}
            name="skia-document-hit-proxy"
            studioElementId={element.id}
            sceneFunc={() => undefined}
            hitFunc={(context, shape) => {
              context.beginPath();
              if (element.type === "draw") hitDraw(context, element);
              else hitRect(context, element);
              context.fillStrokeShape(shape);
            }}
            fill="#000"
            stroke="#000"
            strokeWidth={element.type === "draw"
              ? Math.max(element.strokeWidth ?? 1, hitWidth)
              : hitWidth}
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
            onMouseDown={(event) => onSelect(element.id, event)}
            onTap={(event) => onSelect(element.id, event)}
          />
        );
      })}
    </>
  );
}
