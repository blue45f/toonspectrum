import { Fragment, useEffectEvent, useLayoutEffect, useRef } from "react";
import { Rect, Transformer } from "react-konva/lib/ReactKonvaCore";

import { mirrorStudioDrawElementTranslation } from "./studio-selection-chrome-mirror";

import type { StudioGroupUniformResizeBounds } from "./studio-group-uniform-resize";
import type Konva from "konva";

const MINIMUM_VISUAL_SIZE_PX = 24;
const DESKTOP_ANCHOR_VISUAL_SIZE_PX = 13;
const COARSE_ANCHOR_VISUAL_SIZE_PX = 14;
const DESKTOP_ANCHOR_HIT_SIZE_PX = 22;
const COARSE_ANCHOR_HIT_SIZE_PX = 44;
const GROUP_SELECTION_ACCENT = "#c2410c";

function safeScale(effScale: number): number {
  return Number.isFinite(effScale) && effScale > 0 ? effScale : 1;
}

function finitePositiveBounds(bounds: StudioGroupUniformResizeBounds): boolean {
  return (
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}

function copyBounds(
  bounds: StudioGroupUniformResizeBounds
): StudioGroupUniformResizeBounds {
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

export interface StudioGroupUniformResizeProxyProps {
  readonly bounds: StudioGroupUniformResizeBounds;
  readonly effScale: number;
  /** Mobile layout or any coarse-pointer surface. */
  readonly mobile?: boolean;
  readonly coarse?: boolean;
  readonly enabled: boolean;
  /**
   * Opt in to a free transform: rotation handle plus independent width/height.
   *
   * Off by default because a mixed multi-selection is only safe under the uniform, axis-aligned
   * planner. A single draw(선화) element turns it on — one point array can absorb a full affine
   * exactly, so the extra degrees of freedom cost it nothing.
   */
  readonly freeTransform?: boolean;
  /**
   * Draw element whose live drag translation this proxy should follow.
   *
   * The proxy's Transformer is bound to an invisible Rect, not to the object, so Konva's own
   * drag proxying never reaches it: dragging a selected stroke left the handle frame standing at
   * the pre-drag position for the whole gesture (measured: 227px across a 233px drag). A
   * multi-selection does not need this — StudioPage's `translateGroupPreview` already shifts the
   * proxy imperatively for group drags.
   */
  readonly mirrorDragElementId?: string;
  /** Return false when effective locks or collaboration leases reject the gesture. */
  readonly onBegin: (sourceBounds: StudioGroupUniformResizeBounds) => boolean;
  /**
   * Receives the post-gesture box. `rotationDeg` is the clockwise rotation about that box's
   * origin, and is always 0 unless `freeTransform` is on.
   */
  readonly onCommit: (
    targetBounds: StudioGroupUniformResizeBounds,
    rotationDeg: number
  ) => void;
  readonly onCancel: () => void;
}

type ActiveResizeSession = {
  readonly sourceBounds: StudioGroupUniformResizeBounds;
};

/**
 * A selection-only Konva proxy for atomic group resize.
 *
 * The proxy owns a dedicated Transformer and never attaches it to authored child nodes. This keeps
 * per-element transform-end handlers, history entries, and CRDT publications out of the preview.
 * The parent receives one finite positive target box after the proxy has already been restored.
 */
export function StudioGroupUniformResizeProxy({
  bounds,
  effScale,
  mobile = false,
  coarse = false,
  enabled,
  freeTransform = false,
  mirrorDragElementId,
  onBegin,
  onCommit,
  onCancel,
}: StudioGroupUniformResizeProxyProps) {
  const proxyRef = useRef<Konva.Rect>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const activeSessionRef = useRef<ActiveResizeSession | null>(null);
  const onCancelRef = useRef(onCancel);
  const coarsePointer = mobile || coarse;
  const scale = safeScale(effScale);
  const validBounds = finitePositiveBounds(bounds);
  const anchorVisualSize =
    (coarsePointer
      ? COARSE_ANCHOR_VISUAL_SIZE_PX
      : DESKTOP_ANCHOR_VISUAL_SIZE_PX) / scale;
  const anchorHitSize =
    (coarsePointer
      ? COARSE_ANCHOR_HIT_SIZE_PX
      : DESKTOP_ANCHOR_HIT_SIZE_PX) / scale;

  useLayoutEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  function restoreProxy(source: StudioGroupUniformResizeBounds) {
    const proxy = proxyRef.current;
    if (!proxy) return;
    proxy.position({ x: source.x, y: source.y });
    proxy.width(source.width);
    proxy.height(source.height);
    proxy.scaleX(1);
    proxy.scaleY(1);
    proxy.rotation(0);
    transformerRef.current?.forceUpdate();
    proxy.getLayer()?.batchDraw();
  }

  const cancelActiveTransform = useEffectEvent((): boolean => {
    const active = activeSessionRef.current;
    if (!active) return false;
    // Clear first: Konva may synchronously emit transformend from stopTransform(). That event must
    // observe an inactive session and therefore cannot commit or report a second cancellation.
    activeSessionRef.current = null;
    transformerRef.current?.stopTransform();
    // Restore after stopTransform as well: a synchronous transformend may have projected newer
    // props onto the proxy, but cancellation must finish at the gesture's captured source box.
    restoreProxy(active.sourceBounds);
    onCancelRef.current();
    return true;
  });

  useLayoutEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const cancelForWindowBlur = () => {
      cancelActiveTransform();
    };
    const cancelForHiddenDocument = () => {
      if (document.visibilityState === "hidden") cancelActiveTransform();
    };
    window.addEventListener("blur", cancelForWindowBlur);
    document.addEventListener("visibilitychange", cancelForHiddenDocument);
    return () => {
      window.removeEventListener("blur", cancelForWindowBlur);
      document.removeEventListener("visibilitychange", cancelForHiddenDocument);
    };
  }, []);

  function handleTransformStart() {
    const sourceBounds = copyBounds(bounds);
    if (!enabled || !finitePositiveBounds(sourceBounds)) {
      transformerRef.current?.stopTransform();
      if (finitePositiveBounds(sourceBounds)) restoreProxy(sourceBounds);
      return;
    }

    let accepted: boolean;
    try {
      accepted = onBegin(sourceBounds);
    } catch {
      accepted = false;
    }
    if (!accepted) {
      transformerRef.current?.stopTransform();
      restoreProxy(sourceBounds);
      return;
    }
    activeSessionRef.current = { sourceBounds };
  }

  function handleTransformEnd(event: Konva.KonvaEventObject<Event>) {
    const active = activeSessionRef.current;
    if (!active) {
      if (validBounds) restoreProxy(bounds);
      return;
    }
    activeSessionRef.current = null;

    const proxy = event.target as Konva.Rect;
    const targetBounds: StudioGroupUniformResizeBounds = {
      x: proxy.x(),
      y: proxy.y(),
      width: proxy.width() * proxy.scaleX(),
      height: proxy.height() * proxy.scaleY(),
    };
    // Konva reports the box unrotated and carries the angle separately, which is exactly the
    // scale-then-rotate decomposition the draw planner consumes.
    const rotationDeg = freeTransform ? proxy.rotation() : 0;
    restoreProxy(active.sourceBounds);

    if (!finitePositiveBounds(targetBounds) || !Number.isFinite(rotationDeg)) {
      onCancelRef.current();
      return;
    }
    onCommit(targetBounds, rotationDeg);
  }

  useLayoutEffect(() => {
    const proxy = proxyRef.current;
    const transformer = transformerRef.current;
    if (!proxy || !transformer) return;
    if (enabled && validBounds) {
      transformer.nodes([proxy]);
      transformer.forceUpdate();
    } else {
      if (!cancelActiveTransform()) transformer.stopTransform();
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
    }
    return () => {
      if (transformer.nodes().includes(proxy)) {
        transformer.nodes([]);
        transformer.getLayer()?.batchDraw();
      }
    };
  }, [enabled, validBounds]);

  useLayoutEffect(() => {
    if (activeSessionRef.current || !validBounds) return;
    const proxy = proxyRef.current;
    if (!proxy) return;
    proxy.position({ x: bounds.x, y: bounds.y });
    proxy.width(bounds.width);
    proxy.height(bounds.height);
    proxy.scaleX(1);
    proxy.scaleY(1);
    proxy.rotation(0);
    transformerRef.current?.forceUpdate();
    proxy.getLayer()?.batchDraw();
  }, [bounds.x, bounds.y, bounds.width, bounds.height, validBounds]);

  useLayoutEffect(
    () => () => {
      cancelActiveTransform();
    },
    []
  );

  // Follow the stroke's imperative drag translation so the handle frame is rasterized in the same
  // frame as the ink. Skipped during an active resize, where the proxy is the thing being moved.
  useLayoutEffect(() => {
    const proxy = proxyRef.current;
    if (!proxy || !mirrorDragElementId || !validBounds) return;
    const stage = proxy.getStage();
    if (!stage) return;
    return mirrorStudioDrawElementTranslation(stage, mirrorDragElementId, (offset) => {
      if (activeSessionRef.current) return;
      const x = bounds.x + offset.x;
      const y = bounds.y + offset.y;
      if (proxy.x() === x && proxy.y() === y) return;
      // No forceUpdate: moving the proxy fires `absoluteTransformChange`, which the Transformer
      // already listens to and answers by rebuilding its anchors. Calling it again here doubled
      // that rebuild on every axis event, and the anchors are the expensive part of the frame.
      proxy.position({ x, y });
    });
  }, [mirrorDragElementId, bounds.x, bounds.y, validBounds]);

  const minimumSize = MINIMUM_VISUAL_SIZE_PX / scale;

  return (
    <Fragment>
      <Rect
        ref={proxyRef}
        name="studio-group-uniform-resize-proxy"
        x={bounds.x}
        y={bounds.y}
        width={Math.max(0, bounds.width)}
        height={Math.max(0, bounds.height)}
        fill="rgba(0, 0, 0, 0.001)"
        opacity={0}
        listening={false}
        strokeEnabled={false}
        perfectDrawEnabled={false}
        onTransformStart={handleTransformStart}
        onTransformEnd={handleTransformEnd}
      />
      <Transformer
        ref={transformerRef}
        name="studio-group-uniform-resize-transformer"
        visible={enabled && validBounds}
        resizeEnabled={enabled && validBounds}
        rotateEnabled={freeTransform && enabled && validBounds}
        rotationSnaps={freeTransform ? [0, 45, 90, 135, 180, 225, 270, 315] : []}
        rotationSnapTolerance={6}
        flipEnabled={false}
        keepRatio={!freeTransform}
        centeredScaling={false}
        shouldOverdrawWholeArea={false}
        enabledAnchors={
          freeTransform
            ? [
                "top-left",
                "top-right",
                "bottom-left",
                "bottom-right",
                "middle-left",
                "middle-right",
                "top-center",
                "bottom-center",
              ]
            : ["top-left", "top-right", "bottom-left", "bottom-right"]
        }
        anchorSize={anchorVisualSize}
        anchorCornerRadius={anchorVisualSize / 2}
        anchorStroke={GROUP_SELECTION_ACCENT}
        anchorStrokeWidth={1.5 / scale}
        anchorFill="#fffaf5"
        borderStroke={GROUP_SELECTION_ACCENT}
        borderStrokeWidth={1.35 / scale}
        borderDash={[2 / scale, 3 / scale]}
        anchorStyleFunc={(anchor) => {
          anchor.hitStrokeWidth(anchorHitSize);
          // No drop shadow. A blurred shadow is one of the most expensive things canvas 2D can
          // draw, and these anchors are re-rastered on every frame of a drag: measured at roughly
          // 15ms per shadowed anchor per layer draw, which is what pushed a stroke drag from
          // ~160ms to ~250ms per pointer move once the free-transform handle set grew to nine.
          // The persimmon stroke on a near-white fill already separates them from any artwork.
          anchor.shadowEnabled(false);
        }}
        boundBoxFunc={(oldBox, newBox) =>
          !Number.isFinite(newBox.x) ||
          !Number.isFinite(newBox.y) ||
          !Number.isFinite(newBox.width) ||
          !Number.isFinite(newBox.height) ||
          newBox.width < minimumSize ||
          newBox.height < minimumSize
            ? oldBox
            : newBox
        }
      />
    </Fragment>
  );
}
