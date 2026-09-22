import { useEffect, useMemo, useRef } from "react";
import { Shape } from "react-konva/lib/ReactKonvaCore";

import { createStudioSkiaDocumentHitIndex } from "./studio-skia-document-hit-index";

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

function localPointer(
  event: Konva.KonvaEventObject<Event>,
): { x: number; y: number } | null {
  const stage = event.target.getStage();
  const pointer = stage?.getPointerPosition();
  if (!stage || !pointer) return null;
  return event.target.getAbsoluteTransform().copy().invert().point(pointer);
}

/** One Konva hit node regardless of document size; Skia remains the only paint owner. */
export function StudioSkiaDocumentHitLayer({
  elements,
  effectiveScale,
  onSelect,
}: StudioSkiaDocumentHitLayerProps) {
  const runtimeRef = useRef<
    ReturnType<typeof createStudioSkiaDocumentHitIndex> | null
  >(null);
  if (!runtimeRef.current) {
    runtimeRef.current = createStudioSkiaDocumentHitIndex();
  }
  const runtime = runtimeRef.current;
  const regions = useMemo(
    () => runtime.sync(elements),
    [elements, runtime],
  );

  useEffect(() => () => runtime.dispose(), [runtime]);

  const resolveEvent = (
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent | PointerEvent>,
    select: boolean,
  ) => {
    const point = localPointer(event as Konva.KonvaEventObject<Event>);
    const element = point ? runtime.resolve(point, effectiveScale) : null;
    const target = event.target as Konva.Node;
    target.setAttr("studioElementId", element?.id);
    // The existing Stage background path owns empty-click deselection and marquee start.
    target.setAttr(
      "name",
      element ? "skia-document-hit-proxy" : "bg",
    );
    if (element && select) onSelect(element.id, event);
  };

  return (
    <Shape
      name="skia-document-hit-proxy"
      sceneFunc={() => undefined}
      hitFunc={(context, shape) => {
        context.beginPath();
        for (const region of regions) {
          context.rect(region.x, region.y, region.w, region.h);
        }
        context.fillStrokeShape(shape);
      }}
      fill="#000"
      strokeEnabled={false}
      perfectDrawEnabled={false}
      shadowForStrokeEnabled={false}
      onPointerDown={(event) => resolveEvent(event, true)}
      onPointerUp={(event) => resolveEvent(event, false)}
      onContextMenu={(event) => resolveEvent(event, false)}
    />
  );
}
