import { Fragment, useEffectEvent, useLayoutEffect, useRef } from "react";
import { Rect, Transformer } from "react-konva/lib/ReactKonvaCore";

import { planStudioLiveTransformPreviewAttrs } from "./studio-live-transform-preview";
import {
  applyStudioLiveTransformPreviewNodeAttrs,
  resetStudioLiveTransformPreviewNodeAttrs,
  studioLiveTransformPreviewEligible,
  studioLiveTransformPreviewHasCachedDuplicate,
} from "./studio-live-transform-preview-konva";
import {
  STUDIO_DRAW_SELECTION_INDICATOR_NAME,
  STUDIO_GROUP_SELECTION_OVERLAY_NAME,
  drainStudioLateParkedChrome,
  STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR,
  findStudioDrawWrapperNode,
  mirrorStudioDrawElementTranslation,
} from "./studio-selection-chrome-mirror";
import {
  beginStudioSingleDrawTransformLayer,
  restoreStudioSingleObjectDragLayer,
} from "./studio-single-object-drag-layer";

import type { StudioGroupUniformResizeBounds } from "./studio-group-uniform-resize";
import type { StudioSingleObjectDragLayerSession } from "./studio-single-object-drag-layer";
import type Konva from "konva";
import type { RefObject } from "react";

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
  /**
   * Draw element whose ink should follow the handles live (PPT-style real-time transform).
   *
   * Each transform frame mirrors the gesture's affine onto the stroke's wrapper node
   * imperatively — zero React commits, no per-frame point baking, no document mutation. The
   * projection is `planStudioLiveTransformPreviewAttrs`, whose math is exactly the commit
   * planner's, so the ink lands where `onCommit` will bake it. The single authoritative commit
   * still happens exactly once at transformend; cancellation restores the neutral projection.
   */
  readonly livePreviewElementId?: string;
  /**
   * Dedicated small Layer the live-preview gesture lifts into (the single-object drag Layer).
   *
   * Without the lift, every anchor frame repaints the whole document Layer (measured ~80-157ms
   * per drawScene on stroke-heavy pages). With it, per-frame invalidation covers only the stroke,
   * the proxy and the Transformer. Optional and fail-closed: when absent or refused (clipped,
   * cached, layer-sensitive composite), the gesture keeps today's whole-layer behavior.
   */
  readonly transformLiftLayerRef?: RefObject<Konva.Layer | null>;
  /**
   * Monotonic counter the page bumps when something outside this proxy cancels the gesture —
   * Escape, stage pointer-cancel, a collaboration lease loss.
   *
   * Without it the page's cancel only cleared ITS session (and released the lease) while the
   * Konva gesture kept running: the handles, and since the live preview landed the ink too, kept
   * following the pointer after the user had been told the resize was cancelled, then snapped
   * back at pointer-up with the commit silently dropped. A number rather than a callback because
   * cancellation must survive a re-render that changes nothing else.
   */
  readonly externalCancelSignal?: number;
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

type ActiveLiveTransformPreview = {
  readonly node: Konva.Node;
  /** Dashed draw indicators hidden for the gesture; restored on commit and on every cancel path. */
  readonly parkedIndicators: readonly Konva.Node[];
  /** Drag-layer lift session, or null when the lift was refused (gesture stays in the big Layer). */
  readonly lift: StudioSingleObjectDragLayerSession | null;
};

type ActiveResizeSession = {
  readonly sourceBounds: StudioGroupUniformResizeBounds;
  readonly livePreview: ActiveLiveTransformPreview | null;
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
  livePreviewElementId,
  transformLiftLayerRef,
  externalCancelSignal,
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

  /**
   * Resolves the live-ink preview target for a starting gesture, or null when the stroke has no
   * scene node or sits under a cached ancestor (whose bitmap our attrs could never repaint).
   *
   * The stroke's dashed indicator is parked for the duration: its translation mirror reads the
   * wrapper's x/y as a drag offset, which the preview repurposes as the absolute target origin.
   * The Transformer frame carries the "selected" affordance for the whole gesture, and un-parking
   * re-converges the box through that same mirror once the wrapper resets to neutral.
   */
  /**
   * Is the live-preview stroke already being dragged by another pointer?
   *
   * A drag and a transform both write the wrapper's transform, and the page-side guard only
   * tracks group drags — so a second touch starting the Transformer while a first is dragging the
   * stroke body left two writers on one node, with a last-writer position surviving depending on
   * event order. Refuse the transform rather than arbitrating: the drag already owns the node,
   * and the user gets the gesture back by lifting that finger.
   */
  function livePreviewStrokeIsAlreadyDragging(): boolean {
    if (!livePreviewElementId) return false;
    const stage = proxyRef.current?.getStage();
    if (!stage) return false;
    const node = findStudioDrawWrapperNode(stage, livePreviewElementId);
    return node?.isDragging() === true;
  }

  function beginLiveTransformPreview(): ActiveLiveTransformPreview | null {
    if (!livePreviewElementId) return null;
    const proxy = proxyRef.current;
    const transformer = transformerRef.current;
    const stage = proxy?.getStage();
    if (!proxy || !transformer || !stage) return null;
    const node = findStudioDrawWrapperNode(stage, livePreviewElementId);
    if (
      !node
      || !studioLiveTransformPreviewEligible(node)
      || studioLiveTransformPreviewHasCachedDuplicate(stage, livePreviewElementId, node)
    ) {
      return null;
    }
    // Both pieces of single-draw chrome are pinned to the pre-gesture bounds: the dashed
    // indicator and the selection overlay carrying the "선화 레이어 · 1개" badge. Left up, they
    // sit at the old box while the ink moves — and once the stroke is lifted, the badge can even
    // be painted over by it. Park both; the Transformer frame carries the affordance.
    const parkedIndicators = [
      ...stage.find(`.${STUDIO_DRAW_SELECTION_INDICATOR_NAME}`),
      ...stage.find(`.${STUDIO_GROUP_SELECTION_OVERLAY_NAME}`),
    ].filter((indicator) => indicator.visible());
    for (const indicator of parkedIndicators) indicator.visible(false);
    // Gate the translation mirrors before the first preview frame: the wrapper's x/y stops being
    // a drag offset for the whole gesture, and (once lifted) a chrome write in the document
    // Layer would re-invalidate it every frame.
    node.setAttr(STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR, true);
    const lift = beginStudioSingleDrawTransformLayer({
      elementId: livePreviewElementId,
      wrapper: node,
      proxy,
      transformer,
      dragLayer: transformLiftLayerRef?.current ?? null,
    });
    return { node, parkedIndicators, lift };
  }

  /** Neutralize the preview projection and un-park the chrome — commit and cancel both end here. */
  function clearLiveTransformPreview(preview: ActiveLiveTransformPreview | null) {
    if (!preview) return;
    // Return the lifted nodes to the document Layer first so the neutral reset below invalidates
    // the authoritative Layer once, and the mirrors re-converge from the same reset.
    restoreStudioSingleObjectDragLayer(preview.lift);
    const stage = preview.node.getStage();
    preview.node.setAttr(STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR, undefined);
    resetStudioLiveTransformPreviewNodeAttrs(preview.node);
    for (const indicator of preview.parkedIndicators) indicator.visible(true);
    // Chrome that mounted DURING the gesture is not in the start snapshot — the lazy overlay chunk
    // resolving mid-transform parks itself instead, and this is where that gets undone. Restoring
    // only the snapshot would leave such an indicator hidden for good.
    drainStudioLateParkedChrome(stage);
    preview.node.getLayer()?.batchDraw();
  }

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
    clearLiveTransformPreview(active.livePreview);
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

  // Mount value is the baseline, never a cancellation. `cancelActiveTransform` calls back into
  // the page's cancel, which bumps this counter again — that pass finds no session on either
  // side and stops, so the round trip cannot loop.
  const lastExternalCancelSignalRef = useRef(externalCancelSignal);
  useLayoutEffect(() => {
    if (externalCancelSignal === lastExternalCancelSignalRef.current) return;
    lastExternalCancelSignalRef.current = externalCancelSignal;
    cancelActiveTransform();
  }, [externalCancelSignal]);

  function handleTransformStart() {
    const sourceBounds = copyBounds(bounds);
    if (
      !enabled
      || !finitePositiveBounds(sourceBounds)
      || livePreviewStrokeIsAlreadyDragging()
    ) {
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
    activeSessionRef.current = {
      sourceBounds,
      livePreview: beginLiveTransformPreview(),
    };
  }

  /**
   * Live ink projection, PPT-style: every transform frame maps the gesture onto the stroke's
   * wrapper node through the same scale-then-rotate decomposition the commit planner bakes at
   * transformend. Purely imperative — no React commit, no document mutation, no history entry —
   * so the hot-path budget and the "exactly one commit per gesture" contract both hold.
   */
  function handleTransform(event: Konva.KonvaEventObject<Event>) {
    const active = activeSessionRef.current;
    const preview = active?.livePreview;
    if (!active || !preview) return;
    const proxy = event.target as Konva.Rect;
    const attrs = planStudioLiveTransformPreviewAttrs({
      sourceBounds: active.sourceBounds,
      targetBounds: {
        x: proxy.x(),
        y: proxy.y(),
        width: proxy.width() * proxy.scaleX(),
        height: proxy.height() * proxy.scaleY(),
      },
      rotationDeg: freeTransform ? proxy.rotation() : 0,
    });
    // A degenerate mid-gesture box keeps the last valid projection; transformend still decides
    // commit vs cancel from its own reading, so a rejected frame can never corrupt the document.
    if (attrs) applyStudioLiveTransformPreviewNodeAttrs(preview.node, attrs);
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
    // Neutralize the ink projection in the same tick as the commit below: React re-renders with
    // the baked points before the next paint, so the stroke never shows a reverted frame — the
    // discipline the drag path already follows ("zero the wrapper before committing new points").
    clearLiveTransformPreview(active.livePreview);

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
    // Only ever restore what this effect hid, so a genuine `visible={false}` from props survives.
    let parkedHere = false;
    const detach = mirrorStudioDrawElementTranslation(stage, mirrorDragElementId, (offset) => {
      if (activeSessionRef.current) return;
      const x = bounds.x + offset.x;
      const y = bounds.y + offset.y;
      if (proxy.x() === x && proxy.y() === y) return;
      // No forceUpdate: moving the proxy fires `absoluteTransformChange`, which the Transformer
      // already listens to and answers by rebuilding its anchors.
      proxy.position({ x, y });

      // Park the handle frame for the duration of the move. Re-rastering nine anchors, the rotate
      // handle and the dashed border on every drag frame doubled the layer's draw time (measured
      // ~80ms -> ~157ms per drawScene), and a resize handle is not actionable mid-drag anyway.
      // The stroke's own dashed selection indicator keeps the "selected" affordance, and it is a
      // single unfilled Rect. Toggled imperatively so parking costs no React commit.
      const dragging = offset.x !== 0 || offset.y !== 0;
      const transformer = transformerRef.current;
      if (!transformer) return;
      if (dragging && transformer.visible()) {
        transformer.visible(false);
        parkedHere = true;
        transformer.getLayer()?.batchDraw();
      } else if (!dragging && parkedHere) {
        transformer.visible(true);
        parkedHere = false;
        transformer.getLayer()?.batchDraw();
      }
    });
    // Captured for cleanup: by teardown the ref may already point at a different Transformer, and
    // only the instance this effect actually hid should be restored.
    const parkedTransformer = transformerRef.current;
    return () => {
      detach();
      // Unparking must not depend on a later React render: `visible` is driven by a prop whose
      // value did not change while we hid the node, so the reconciler would never re-set it and
      // the handles would stay invisible for the rest of the selection.
      if (parkedHere && parkedTransformer) {
        parkedTransformer.visible(true);
        parkedTransformer.getLayer()?.batchDraw();
      }
    };
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
        onTransform={handleTransform}
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
          anchor.shadowColor("#111827");
          anchor.shadowBlur(4 / scale);
          anchor.shadowOpacity(0.32);
          anchor.shadowOffsetY(1 / scale);
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
