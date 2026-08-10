/**
 * Keeps selection chrome pinned to a draw(선화) element while Konva drags it.
 *
 * Coordinate elements carry their position in the document, so a Konva Transformer bound to the
 * node follows it for free. A stroke does not: its geometry lives in `points`, the wrapper node is
 * translated imperatively for the duration of the gesture, and the offset is only baked into
 * `points` at drag end. Every piece of chrome derived from document state therefore stands still
 * while the ink moves.
 *
 * Measured on the shipped build before this existed (`tests/benchmarks/harness/drag-selection-sync.ts`):
 * both the dashed selection indicator and the free-scale handle frame diverged 227px over a 233px
 * drag and were still 227px out after the pointer had been held still — not a late frame, a
 * different position entirely.
 *
 * Mirroring rides Konva's own `xChange`/`yChange`. Those fire synchronously inside `Node._setAttr`,
 * before the drag's `_requestDraw`, so chrome and ink are rasterized in the *same* frame with zero
 * React commits — the imperative discipline `translateGroupPreview` already uses for the
 * multi-select overlay, and what the hot-path de-React contract requires.
 */
import type Konva from "konva";

/** Scoped so `off` can never strip listeners the product installed on the same node. */
export const STUDIO_SELECTION_CHROME_MIRROR_NAMESPACE = "studioSelectionChromeMirror";

function konvaNodeDepth(node: Konva.Node): number {
  let depth = 0;
  let current: Konva.Node | null = node.getParent();
  while (current) {
    depth += 1;
    current = current.getParent();
  }
  return depth;
}

/**
 * Resolves the *draggable wrapper* Konva node authoring `elementId`.
 *
 * Two nodes carry `studioElementId` for a draw element: the outer wrapper that Konva actually
 * drags, and a non-listening inner group inside StudioDrawNode. Only the wrapper's own x/y changes
 * during a drag, so the shallowest match is the one worth mirroring.
 */
export function findStudioDrawWrapperNode(
  stage: Konva.Stage,
  elementId: string
): Konva.Node | null {
  const matches = stage.find(
    (node: Konva.Node) => node.getAttr("studioElementId") === elementId
  );
  let best: Konva.Node | null = null;
  let bestDepth = Number.POSITIVE_INFINITY;
  for (const candidate of matches) {
    const depth = konvaNodeDepth(candidate);
    if (depth < bestDepth) {
      best = candidate;
      bestDepth = depth;
    }
  }
  return best;
}

/**
 * Reports `elementId`'s live drag offset to `apply` — immediately, then on every change.
 *
 * The immediate call matters for chrome that mounts mid-gesture (a lazily loaded overlay, or a
 * selection made during a drag): it must never render one frame behind the ink.
 *
 * At drag end the product zeroes the wrapper *before* committing the new points, and this follows
 * that reset in the same tick, so the chrome tracks the stroke through the handoff too.
 *
 * @returns an unsubscribe; a no-op when the element has no node in the scene.
 */
export function mirrorStudioDrawElementTranslation(
  stage: Konva.Stage,
  elementId: string,
  apply: (offset: { x: number; y: number }) => void
): () => void {
  const wrapper = findStudioDrawWrapperNode(stage, elementId);
  if (!wrapper) return () => undefined;
  const sync = () => {
    apply({ x: wrapper.x(), y: wrapper.y() });
  };
  sync();
  wrapper.on(
    `xChange.${STUDIO_SELECTION_CHROME_MIRROR_NAMESPACE} yChange.${STUDIO_SELECTION_CHROME_MIRROR_NAMESPACE}`,
    sync
  );
  return () => {
    wrapper.off(`.${STUDIO_SELECTION_CHROME_MIRROR_NAMESPACE}`);
  };
}

/**
 * Binds each per-element selection indicator group to its stroke's live transform.
 *
 * @param indicators element id → the indicator group to keep pinned to that element's stroke.
 * @returns an unsubscribe for every listener this call installed.
 */
export function mirrorStudioDrawSelectionIndicators(
  indicators: ReadonlyMap<string, Konva.Group>
): () => void {
  const detachers: Array<() => void> = [];
  for (const [elementId, indicator] of indicators) {
    const stage = indicator.getStage();
    if (!stage) continue;
    detachers.push(
      mirrorStudioDrawElementTranslation(stage, elementId, (offset) => {
        indicator.position(offset);
      })
    );
  }
  return () => {
    for (const detach of detachers) detach();
  };
}
