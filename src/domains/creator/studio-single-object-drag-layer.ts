import type Konva from "konva";

interface LiftedNodeRecord {
  readonly node: Konva.Node;
  readonly parent: Konva.Container;
  readonly zIndex: number;
}

export interface StudioSingleObjectDragLayerSession {
  readonly elementId: string;
  readonly mainLayer: Konva.Layer;
  readonly dragLayer: Konva.Layer;
  readonly target: Konva.Node;
  readonly transformer: Konva.Transformer | null;
  readonly lifted: readonly LiftedNodeRecord[];
  restored: boolean;
}

export interface BeginStudioSingleObjectDragLayerOptions {
  readonly target: Konva.Node;
  readonly selectedElementId: string | null;
  readonly selectionSize: number;
  readonly mainLayer: Konva.Layer | null;
  readonly dragLayer: Konva.Layer | null;
  readonly transformer?: Konva.Transformer | null;
  /**
   * The selected element is a draw(선화). Draw strokes used to be excluded wholesale because their
   * point-backed wrapper and selection chrome have a separate live contract, but that contract
   * (chrome mirroring via `xChange`/`yChange`, points baked at drag end) is layer-independent, so a
   * plain stroke now gets the same tiny invalidation surface as every other object. Only strokes
   * whose ink is erased against the document backdrop stay behind — see
   * {@link selectedDrawIsDestinationOut}.
   */
  readonly selectedIsDraw: boolean;
  /**
   * A draw(선화) whose paint composites with `destination-out` (eraser strokes). Lifting one onto
   * the drag layer would punch holes in the drag layer instead of the artwork below, so those
   * gestures keep repainting the document Layer.
   */
  readonly selectedDrawIsDestinationOut?: boolean;
  readonly hasMaskOrClip: boolean;
  /** destination-out, clip-below and authored blend modes need the document layer as a backdrop. */
  readonly layerSensitiveComposite?: boolean;
}

function directChildOfLayer(
  node: Konva.Node,
  layer: Konva.Layer,
): Konva.Node | null {
  let current: Konva.Node | null = node;
  while (current) {
    const parent = current.getParent();
    if (parent === layer) return current;
    if (!parent) return null;
    current = parent;
  }
  return null;
}

function authoredCompositeOperationIsLayerSensitive(
  target: Konva.Node,
  root: Konva.Node,
): boolean {
  let current: Konva.Node | null = target;
  while (current) {
    const operation = current.getAttr("globalCompositeOperation");
    if (
      typeof operation === "string"
      && operation.length > 0
      && operation !== "source-over"
    ) {
      return true;
    }
    if (current === root) break;
    current = current.getParent();
  }
  return false;
}

/**
 * Lift one already-selected draggable object into a small, otherwise-empty Layer.
 *
 * Konva redraws the whole owning Layer whenever a draggable node changes position. The Studio
 * document Layer can contain hundreds of pressure strokes, cached masks and images, so one pointer
 * frame can otherwise repaint the entire page. The lift keeps the React-owned scene graph intact
 * logically, but gives Konva a tiny raster invalidation surface for the duration of the gesture.
 *
 * Deliberate exclusions:
 * - multi/group selections (their peers and atomic preview still live in the document Layer),
 * - Transformer anchors (the target is not an authored element node),
 * - destination-out draw(선화) strokes (`selectedDrawIsDestinationOut` — erasing needs the document
 *   Layer as backdrop; plain source-over ink lifts like any other object),
 * - clipped/cached/masked or non-source-over roots (a separate canvas cannot reproduce backdrop
 *   blending or a parent clip exactly).
 */
export function beginStudioSingleObjectDragLayer(
  options: BeginStudioSingleObjectDragLayerOptions,
): StudioSingleObjectDragLayerSession | null {
  const {
    target,
    selectedElementId,
    selectionSize,
    mainLayer,
    dragLayer,
    transformer = null,
    selectedIsDraw,
    selectedDrawIsDestinationOut = false,
    hasMaskOrClip,
    layerSensitiveComposite = false,
  } = options;

  if (
    !selectedElementId
    || selectionSize !== 1
    || !mainLayer
    || !dragLayer
    || mainLayer === dragLayer
    || mainLayer.getStage() === null
    || mainLayer.getStage() !== dragLayer.getStage()
    || target.getLayer() !== mainLayer
    || target.getAttr("studioElementId") !== selectedElementId
    || target.draggable() !== true
    // Only destination-out strokes need the document backdrop; plain source-over ink renders
    // identically on either Layer, and the docstring exclusions below still catch clipped or
    // blend-isolated roots before anything is moved.
    || (selectedIsDraw && selectedDrawIsDestinationOut)
    || hasMaskOrClip
    || layerSensitiveComposite
  ) {
    return null;
  }

  const movingRoot = directChildOfLayer(target, mainLayer);
  if (
    !movingRoot
    || movingRoot !== target
    || movingRoot.isCached()
    || authoredCompositeOperationIsLayerSensitive(target, movingRoot)
  ) {
    return null;
  }

  const roots: Konva.Node[] = [movingRoot];
  let liftedTransformer: Konva.Transformer | null = null;
  if (
    transformer
    && transformer.getLayer() === mainLayer
    && transformer.nodes().includes(target)
  ) {
    roots.push(transformer);
    liftedTransformer = transformer;
  }

  // Capture every index before moving the first node; removals compact the remaining indices.
  const lifted: LiftedNodeRecord[] = roots.map((node) => ({
    node,
    parent: mainLayer,
    zIndex: node.zIndex(),
  }));
  for (const record of lifted) record.node.moveTo(dragLayer);
  liftedTransformer?.forceUpdate();

  // One full document repaint removes the lifted object. Subsequent pointer frames invalidate only
  // dragLayer; its sibling Layer shares the Stage transform, so local and absolute geometry agree.
  mainLayer.batchDraw();
  dragLayer.batchDraw();

  return {
    elementId: selectedElementId,
    mainLayer,
    dragLayer,
    target,
    transformer: liftedTransformer,
    lifted,
    restored: false,
  };
}

/** Restore the imperative lift without changing the object's live drag position or transform. */
export function restoreStudioSingleObjectDragLayer(
  session: StudioSingleObjectDragLayerSession | null,
): boolean {
  if (!session || session.restored) return false;
  session.restored = true;

  const positions = session.lifted.map((record) => ({
    record,
    absolutePosition: record.node.getAbsolutePosition(),
  }));
  positions.sort((a, b) => a.record.zIndex - b.record.zIndex);

  for (const { record, absolutePosition } of positions) {
    try {
      if (record.node.getParent() !== record.parent) record.node.moveTo(record.parent);
      // Defensive even though both Studio Layers are direct Stage children today: this preserves
      // the visual position if a future viewport gives either Layer its own transform.
      record.node.absolutePosition(absolutePosition);
      const lastIndex = Math.max(0, record.parent.getChildren().length - 1);
      record.node.zIndex(Math.min(record.zIndex, lastIndex));
    } catch {
      // A route/page teardown may destroy React-owned nodes before its effect cleanup runs.
      // Restoration is best-effort in that case; there is no live Stage left to corrupt.
    }
  }
  session.transformer?.forceUpdate();

  session.mainLayer.batchDraw();
  session.dragLayer.batchDraw();
  return true;
}
