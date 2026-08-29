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
  readonly selectedIsDraw: boolean;
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

function nodeCompositeIsLayerSensitive(node: Konva.Node): boolean {
  const operation = node.getAttr("globalCompositeOperation");
  return (
    typeof operation === "string"
    && operation.length > 0
    && operation !== "source-over"
  );
}

function authoredCompositeOperationIsLayerSensitive(
  target: Konva.Node,
  root: Konva.Node,
): boolean {
  let current: Konva.Node | null = target;
  while (current) {
    if (nodeCompositeIsLayerSensitive(current)) return true;
    if (current === root) break;
    current = current.getParent();
  }
  return false;
}

/**
 * Layer-sensitive composite anywhere in `node`'s subtree, itself included.
 *
 * The ancestor walk above answers the drag lift's question ("does anything between the dragged
 * node and the Layer blend against the backdrop?"), and that sufficed there because draw elements
 * were excluded outright. A stroke's own paint nodes live BELOW its wrapper — StudioDrawNode
 * hangs `globalCompositeOperation` on the shapes it emits (highlighter/wash multiply passes among
 * them) — so the transform lift, whose whole subject is a stroke, has to look down instead.
 */
/**
 * Does anything painted ABOVE `node` in its Layer depend on `node` staying below it?
 *
 * The drag Layer is drawn after the whole document Layer, so a lifted node paints above every
 * later sibling for the gesture's duration. For an opaque overlap that is the usual "manipulated
 * object rides on top" convention, but a later `destination-out` eraser stroke — a first-class
 * element in this editor — stops erasing the lifted stroke entirely: the erased pixels reappear
 * for the whole gesture and vanish again at commit. Refuse the lift there rather than previewing
 * artwork the commit will not produce.
 */
function laterSiblingDependsOnStackingBelow(node: Konva.Node): boolean {
  const parent = node.getParent();
  if (!parent) return false;
  const index = node.zIndex();
  return parent
    .getChildren()
    .some((sibling) => sibling.zIndex() > index && subtreeCompositeIsLayerSensitive(sibling));
}

function subtreeCompositeIsLayerSensitive(node: Konva.Node): boolean {
  if (nodeCompositeIsLayerSensitive(node)) return true;
  const children = (node as Konva.Container).getChildren?.();
  if (!children) return false;
  for (const child of children) {
    if (subtreeCompositeIsLayerSensitive(child)) return true;
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
 * - draw elements (their point-backed wrapper and selection chrome have a separate live contract),
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
    || selectedIsDraw
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

export interface BeginStudioSingleDrawTransformLayerOptions {
  readonly elementId: string;
  /** The stroke's draggable wrapper — the node the live transform preview projects onto. */
  readonly wrapper: Konva.Node;
  /** The invisible gesture Rect the group-resize Transformer manipulates. */
  readonly proxy: Konva.Node;
  readonly transformer: Konva.Transformer;
  readonly dragLayer: Konva.Layer | null;
}

/**
 * Lift a single draw stroke plus its transform gesture chrome for a scale/rotate gesture.
 *
 * The drag lift above deliberately excludes draw elements because their selection chrome mirrors
 * live in the document Layer — chrome writes would re-invalidate the big Layer every frame and
 * void the lift. A transform gesture is different: the live preview parks that chrome and gates
 * its mirrors (`STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR`), so for the gesture's duration the
 * only per-frame invalidations are the stroke, the proxy and the Transformer — exactly the nodes
 * moved here. On a stroke-heavy page this turns "repaint the whole document per anchor frame"
 * (measured ~80-157ms per drawScene) into repainting one stroke plus handles.
 *
 * Same fail-closed exclusions as the drag lift: a clipped wrapper (not a direct Layer child), a
 * cached root, or a layer-sensitive composite refuses the lift and the gesture keeps today's
 * whole-layer behavior. Composite is checked over the whole SUBTREE, not just the wrapper: the
 * eraser's destination-out rides the wrapper, but a highlighter's multiply passes are emitted by
 * StudioDrawNode as descendant shapes, and lifting those onto an empty Layer would blend them
 * against transparency instead of the artwork — a visible appearance change for the gesture.
 */
export function beginStudioSingleDrawTransformLayer(
  options: BeginStudioSingleDrawTransformLayerOptions,
): StudioSingleObjectDragLayerSession | null {
  const { elementId, wrapper, proxy, transformer, dragLayer } = options;
  const mainLayer = wrapper.getLayer();
  if (
    !mainLayer
    || !dragLayer
    || mainLayer === dragLayer
    || mainLayer.getStage() === null
    || mainLayer.getStage() !== dragLayer.getStage()
    || wrapper.getAttr("studioElementId") !== elementId
    || wrapper.getParent() !== mainLayer
    || wrapper.isCached()
    || subtreeCompositeIsLayerSensitive(wrapper)
    || laterSiblingDependsOnStackingBelow(wrapper)
    || proxy.getLayer() !== mainLayer
    || transformer.getLayer() !== mainLayer
  ) {
    return null;
  }

  const roots: Konva.Node[] = [wrapper, proxy, transformer];
  const lifted: LiftedNodeRecord[] = roots.map((node) => ({
    node,
    parent: mainLayer,
    zIndex: node.zIndex(),
  }));
  for (const record of lifted) record.node.moveTo(dragLayer);
  transformer.forceUpdate();

  mainLayer.batchDraw();
  dragLayer.batchDraw();

  return {
    elementId,
    mainLayer,
    dragLayer,
    target: wrapper,
    transformer,
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
      // A node React destroyed or re-parented mid-gesture is no longer ours to place. `moveTo`
      // has no destroyed-node guard, so re-adding one leaves an invisible zombie in the document
      // Layer still carrying `studioElementId` — which `findStudioDrawWrapperNode` could later
      // resolve instead of the live node. Restore only what is still parented somewhere.
      const currentParent = record.node.getParent();
      if (!currentParent) continue;
      if (currentParent !== record.parent) record.node.moveTo(record.parent);
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
