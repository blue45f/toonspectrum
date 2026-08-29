/**
 * Konva adapter for panel-clip tracking: which node hosts the clip during a gesture, and how to
 * re-point it without a React commit or a change of parentage.
 *
 * Konva expresses a clip as attrs on a container (`clipX/clipY/clipWidth/clipHeight`), so
 * re-pointing one is four number writes — no reparenting, which is what keeps
 * `restoreStudioSingleDrawTransformLayer`'s "skip nodes an external owner reparented" guard and
 * the parked-chrome bookkeeping untouched.
 *
 * Two hosts, because the two crossings start from different scene graphs:
 *
 *   - A stroke that STARTS unclipped is lifted onto the dedicated drag Layer and is the only ink
 *     there, so clipping that Layer clips exactly this stroke. This is the case the in-place path
 *     cannot serve at all: an unclipped element renders with no clip `Group` around it, so there
 *     is no node to write attrs onto until the lift gives us one.
 *   - A stroke that STARTS clipped refuses the lift (its wrapper's parent is the clip `Group`, not
 *     the main Layer), and previews in place. `StudioCanvasViewportDocumentLayer` renders that
 *     `Group` per element, so rewriting its attrs affects this stroke and nothing else.
 *
 * When neither host exists — an unclipped stroke whose lift was refused for some OTHER reason, a
 * cached ancestor or a composite-sensitive sibling — the clip cannot be re-pointed for that
 * gesture. That case is left alone rather than refused: the preview still tracks position, scale
 * and rotation correctly and only the clip lands at release, which is exactly today's behaviour
 * and strictly better than standing the whole preview down.
 */
import { studioLiveTransformClipChanged } from "./studio-live-transform-clip-tracking";

import type { StudioLiveTransformClipRect } from "./studio-live-transform-clip-tracking";
import type Konva from "konva";

/** Attr marking a container whose clip this module is currently driving, for its own restore. */
export const STUDIO_LIVE_TRANSFORM_CLIP_OWNED_ATTR = "studioLiveTransformClipOwned";

interface ClipContainer extends Konva.Node {
  getClipWidth?: () => number | undefined;
  getClipHeight?: () => number | undefined;
  clipX?: (value?: number) => unknown;
  clipY?: (value?: number) => unknown;
  clipWidth?: (value?: number) => unknown;
  clipHeight?: (value?: number) => unknown;
}

function isClipCapable(node: Konva.Node | null): node is ClipContainer {
  if (!node) return false;
  const candidate = node as ClipContainer;
  return typeof candidate.clipWidth === "function"
    && typeof candidate.clipHeight === "function";
}

/**
 * The container whose clip attrs govern this stroke right now.
 *
 * Prefers the drag Layer when the wrapper has been lifted onto it, because that is the only host
 * that can ADD a clip to a stroke rendered without one. Otherwise the nearest ancestor that
 * already carries a clip — the per-element `Group` the document layer built for a panel member.
 */
export function findStudioLiveTransformClipHost(
  wrapper: Konva.Node | null,
  dragLayer: Konva.Node | null,
): Konva.Node | null {
  if (!wrapper) return null;
  if (dragLayer && wrapper.getLayer() === dragLayer && isClipCapable(dragLayer)) {
    return dragLayer;
  }
  let current: Konva.Node | null = wrapper.getParent();
  while (current) {
    const candidate = current as ClipContainer;
    if (
      isClipCapable(candidate)
      && typeof candidate.getClipWidth === "function"
      && (candidate.getClipWidth() ?? 0) > 0
    ) {
      return current;
    }
    current = current.getParent();
  }
  return null;
}

/** Reads the clip a container currently applies, in the shape the tracker compares. */
export function readStudioLiveTransformClip(
  host: Konva.Node | null,
): StudioLiveTransformClipRect | null {
  if (!isClipCapable(host)) return null;
  const width = host.getClipWidth?.() ?? 0;
  const height = host.getClipHeight?.() ?? 0;
  if (!(width > 0) || !(height > 0)) return null;
  return {
    x: Number(host.getAttr("clipX") ?? 0),
    y: Number(host.getAttr("clipY") ?? 0),
    width,
    height,
  };
}

/**
 * Points `host` at `rect`, or clears its clip when `rect` is null. Returns true when the scene
 * graph actually changed, so callers can skip the redraw on the overwhelming majority of frames
 * where the panel verdict has not moved.
 */
export function applyStudioLiveTransformClip(
  host: Konva.Node | null,
  rect: StudioLiveTransformClipRect | null,
): boolean {
  if (!isClipCapable(host)) return false;
  if (!studioLiveTransformClipChanged(readStudioLiveTransformClip(host), rect)) return false;
  if (rect) {
    host.setAttr("clipX", rect.x);
    host.setAttr("clipY", rect.y);
    host.setAttr("clipWidth", rect.width);
    host.setAttr("clipHeight", rect.height);
  } else {
    // Konva treats a zero/absent clip size as "no clip", so clearing the size is the disable.
    host.setAttr("clipWidth", undefined);
    host.setAttr("clipHeight", undefined);
  }
  host.setAttr(STUDIO_LIVE_TRANSFORM_CLIP_OWNED_ATTR, true);
  return true;
}

/**
 * Restores the clip this module took over, back to `original`.
 *
 * Only touches a host it marked, so a clip the product changed for its own reasons during the
 * gesture is never clobbered — the same rule the parked-chrome restore follows.
 */
export function restoreStudioLiveTransformClip(
  host: Konva.Node | null,
  original: StudioLiveTransformClipRect | null,
): boolean {
  if (!isClipCapable(host)) return false;
  if (host.getAttr(STUDIO_LIVE_TRANSFORM_CLIP_OWNED_ATTR) !== true) return false;
  const changed = applyStudioLiveTransformClip(host, original);
  host.setAttr(STUDIO_LIVE_TRANSFORM_CLIP_OWNED_ATTR, undefined);
  return changed;
}
