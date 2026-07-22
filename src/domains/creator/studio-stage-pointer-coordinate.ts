import type Konva from "konva";

export interface StudioClientPointerCoordinate {
  readonly clientX: number;
  readonly clientY: number;
}

export interface StudioStagePointerBatchMapper {
  /** Maps one browser client sample without another layout read or transform inversion. */
  pointFor(sample: StudioClientPointerCoordinate): { x: number; y: number } | null;
}

type StudioStageCoordinateSource = Pick<Konva.Stage, "getAbsoluteTransform" | "getContent">;

function positiveFiniteScale(renderedSize: number, layoutSize: number): number {
  if (!(renderedSize > 0) || !(layoutSize > 0)) return 1;
  const scale = renderedSize / layoutSize;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/**
 * Konva's public `setPointersPositions` + `getRelativePointerPosition` pair is correct for a
 * dispatched event, but each call reads `getBoundingClientRect` and copies/inverts the Stage
 * transform. A pen event can contain many coalesced and predicted hardware samples, all delivered
 * against the same layout snapshot. Capture that snapshot once, then map the whole browser batch.
 */
export function snapshotStudioStagePointerBatchMapper(
  stage: StudioStageCoordinateSource
): StudioStagePointerBatchMapper {
  const content = stage.getContent();
  const rect = content?.getBoundingClientRect?.();
  const left = Number.isFinite(rect?.left) ? rect.left : 0;
  const top = Number.isFinite(rect?.top) ? rect.top : 0;
  const scaleX = positiveFiniteScale(rect?.width ?? 0, content?.clientWidth ?? 0);
  const scaleY = positiveFiniteScale(rect?.height ?? 0, content?.clientHeight ?? 0);
  const inverse = stage.getAbsoluteTransform().copy().invert();

  return {
    pointFor(sample) {
      if (!Number.isFinite(sample.clientX) || !Number.isFinite(sample.clientY)) return null;
      const mapped = inverse.point({
        x: (sample.clientX - left) / scaleX,
        y: (sample.clientY - top) / scaleY,
      });
      return Number.isFinite(mapped.x) && Number.isFinite(mapped.y) ? mapped : null;
    },
  };
}
