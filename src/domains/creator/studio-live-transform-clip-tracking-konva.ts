/**
 * Konva adapter for panel-clip tracking: which node hosts the clip during a gesture, and how to
 * re-point it without a React commit or a change of parentage.
 *
 * No reparenting, in either host: `restoreStudioSingleDrawTransformLayer` restores only nodes
 * still sitting where the lift put them (anything moved elsewhere is treated as claimed by another
 * owner and left behind), and the parked-chrome bookkeeping keys off the wrapper's parent. Both
 * stay untouched because a clip here is only ever attrs or a `clipFunc` written on an existing
 * node.
 *
 * Two hosts, because the two crossings start from different scene graphs:
 *
 *   - A stroke that STARTS clipped refuses the lift (its wrapper's parent is the clip `Group`, not
 *     the main Layer) and previews in place. `StudioCanvasViewportDocumentLayer` renders that
 *     `Group` per element, so rewriting its `clipX/clipY/clipWidth/clipHeight` affects this stroke
 *     and nothing else. That is the `attrs` host.
 *   - A stroke that STARTS unclipped renders with no clip `Group` at all, so nothing exists to
 *     rewrite; the lift is what gives us a node to drive. The drag `Layer` is the wrong one to
 *     drive, though: `beginStudioSingleDrawTransformLayer` moves the wrapper, the proxy AND the
 *     Transformer into it, so a Layer clip would swallow the resize outline and any handle that
 *     falls outside the panel — chrome that is actively steering the gesture. The clip therefore
 *     goes on the WRAPPER, the only container holding this stroke's ink and nothing else. That is
 *     the `func` host.
 *
 * A wrapper's local space is not document space — the preview writes position, rotation, scale and
 * offset onto it every frame — so the panel rect cannot be expressed there as four axis-aligned
 * numbers, and under rotation it is not an axis-aligned rect at all. `clipFunc` takes an arbitrary
 * path instead, and evaluating it at DRAW time against the node's current transform means the clip
 * is derived from whatever pose the frame settled on, with nothing to keep in sync.
 *
 * When neither host exists — a stroke whose lift was refused for some OTHER reason, a cached
 * ancestor or a composite-sensitive sibling — the clip cannot be re-pointed for that gesture. That
 * case is left alone rather than refused: the preview still tracks position, scale and rotation
 * correctly and only the clip lands at release, which is exactly today's behaviour and strictly
 * better than standing the whole preview down.
 */
import { studioLiveTransformClipChanged } from "./studio-live-transform-clip-tracking";

import type { StudioLiveTransformClipRect } from "./studio-live-transform-clip-tracking";
import type Konva from "konva";

/**
 * Attr recording the clip THIS module last wrote to a container, for its own restore.
 *
 * It holds the rect (or `null` for "cleared"), not just a flag, so cleanup can tell its own write
 * from a newer one. A collaborator resizing the containing frame mid-gesture re-renders the clip
 * `Group` with new props without changing the stroke's identity, so the gesture continues while
 * React installs a newer rect; blindly restoring the pre-gesture rect would overwrite it, and a
 * later render with unchanged props would not repair an imperative mutation.
 */
export const STUDIO_LIVE_TRANSFORM_CLIP_OWNED_ATTR = "studioLiveTransformClipOwned";

interface ClipContainer extends Konva.Node {
  getClipWidth?: () => number | undefined;
  getClipHeight?: () => number | undefined;
  clipFunc?: (value?: unknown) => unknown;
}

/** How a host expresses its clip: rect attrs in document space, or a path in the node's own. */
export type StudioLiveTransformClipHostMode = "attrs" | "func";

export interface StudioLiveTransformClipHost {
  readonly node: Konva.Node;
  readonly mode: StudioLiveTransformClipHostMode;
}

function asContainer(node: Konva.Node | null | undefined): ClipContainer | null {
  if (!node) return null;
  const candidate = node as ClipContainer;
  return typeof candidate.clipFunc === "function" ? candidate : null;
}

function ownedRect(node: Konva.Node): StudioLiveTransformClipRect | null | undefined {
  const owned = node.getAttr(STUDIO_LIVE_TRANSFORM_CLIP_OWNED_ATTR) as
    | { readonly rect: StudioLiveTransformClipRect | null }
    | undefined;
  return owned ? owned.rect : undefined;
}

/**
 * The container whose clip this stroke's ink should be driven through, or `null` for none.
 *
 * Prefers the lifted wrapper, because a lifted stroke is one the document layer rendered without
 * any clip `Group`, so the wrapper is the only node that can ADD a clip to it. Otherwise the
 * nearest ancestor already carrying one — the per-element `Group` built for a panel member.
 */
export function findStudioLiveTransformClipHost(
  wrapper: Konva.Node | null,
  dragLayer: Konva.Node | null,
): StudioLiveTransformClipHost | null {
  if (!wrapper) return null;
  if (dragLayer && wrapper.getLayer() === dragLayer && asContainer(wrapper)) {
    return { node: wrapper, mode: "func" };
  }
  let current: Konva.Node | null = wrapper.getParent();
  while (current) {
    const candidate = asContainer(current);
    if (
      candidate
      && typeof candidate.getClipWidth === "function"
      && (candidate.getClipWidth() ?? 0) > 0
    ) {
      return { node: current, mode: "attrs" };
    }
    current = current.getParent();
  }
  return null;
}

/** Reads the clip a host currently applies, in the shape the tracker compares. */
export function readStudioLiveTransformClip(
  host: StudioLiveTransformClipHost | null,
): StudioLiveTransformClipRect | null {
  if (!host) return null;
  if (host.mode === "func") {
    // A `clipFunc` is a closure, not readable geometry, so what this module wrote is the only
    // honest answer — and nothing else writes `clipFunc` on a stroke wrapper.
    return ownedRect(host.node) ?? null;
  }
  const node = asContainer(host.node);
  if (!node) return null;
  const width = node.getClipWidth?.() ?? 0;
  const height = node.getClipHeight?.() ?? 0;
  if (!(width > 0) || !(height > 0)) return null;
  return {
    x: Number(node.getAttr("clipX") ?? 0),
    y: Number(node.getAttr("clipY") ?? 0),
    width,
    height,
  };
}

/**
 * A `clipFunc` that paths `rect` — given in the host's PARENT space, which for a lifted wrapper is
 * the drag Layer's, i.e. document space — through the node's own transform at draw time.
 */
function documentRectClipFunc(
  node: Konva.Node,
  rect: StudioLiveTransformClipRect,
): (ctx: { beginPath: () => void; moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void; closePath: () => void }) => void {
  return (ctx) => {
    const inverse = node.getTransform().copy().invert();
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ].map((point) => inverse.point(point));
    ctx.beginPath();
    corners.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
  };
}

/**
 * Points `host` at `rect`, or clears its clip when `rect` is null. Returns true when the scene
 * graph actually changed, so callers can skip the redraw on the overwhelming majority of frames
 * where the panel verdict has not moved.
 */
export function applyStudioLiveTransformClip(
  host: StudioLiveTransformClipHost | null,
  rect: StudioLiveTransformClipRect | null,
): boolean {
  if (!host) return false;
  const node = asContainer(host.node);
  if (!node) return false;
  if (!studioLiveTransformClipChanged(readStudioLiveTransformClip(host), rect)) return false;
  if (host.mode === "func") {
    node.clipFunc?.(rect ? documentRectClipFunc(node, rect) : undefined);
  } else if (rect) {
    node.setAttr("clipX", rect.x);
    node.setAttr("clipY", rect.y);
    node.setAttr("clipWidth", rect.width);
    node.setAttr("clipHeight", rect.height);
  } else {
    // Konva treats a zero/absent clip size as "no clip", so clearing the size is the disable.
    node.setAttr("clipWidth", undefined);
    node.setAttr("clipHeight", undefined);
  }
  node.setAttr(STUDIO_LIVE_TRANSFORM_CLIP_OWNED_ATTR, { rect });
  return true;
}

/**
 * Restores the clip this module took over, back to `original`.
 *
 * Only touches a host it marked AND still holding exactly what it last wrote, so a clip the
 * product changed for its own reasons mid-gesture — a collaborator resizing the frame, say — is
 * left as the newer value rather than reverted to a rect that is no longer true.
 */
export function restoreStudioLiveTransformClip(
  host: StudioLiveTransformClipHost | null,
  original: StudioLiveTransformClipRect | null,
): boolean {
  if (!host) return false;
  const node = asContainer(host.node);
  if (!node) return false;
  const lastWritten = ownedRect(node);
  if (lastWritten === undefined) return false;
  if (studioLiveTransformClipChanged(readStudioLiveTransformClip(host), lastWritten)) {
    // Someone else owns this clip now. Drop our claim without touching their value.
    node.setAttr(STUDIO_LIVE_TRANSFORM_CLIP_OWNED_ATTR, undefined);
    return false;
  }
  const changed = applyStudioLiveTransformClip(host, original);
  node.setAttr(STUDIO_LIVE_TRANSFORM_CLIP_OWNED_ATTR, undefined);
  return changed;
}
