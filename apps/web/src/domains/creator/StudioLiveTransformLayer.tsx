import { useLayoutEffect } from "react";
import { Layer } from "react-konva/lib/ReactKonvaCore";

import { attachStudioLiveTransformSurface } from "./studio-live-transform-surface";

import type Konva from "konva";
import type { ReactNode, RefObject } from "react";

/** Scene-only resolution adaptation; the document and the drag handle hit surface stay native. */
export function StudioLiveTransformLayer({
  layerRef,
  children,
}: {
  readonly layerRef: RefObject<Konva.Layer | null>;
  readonly children: ReactNode;
}) {
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (layer) return attachStudioLiveTransformSurface(layer);
  }, [layerRef]);

  return (
    <Layer ref={layerRef} name="studio-single-object-drag-layer">
      {children}
    </Layer>
  );
}
