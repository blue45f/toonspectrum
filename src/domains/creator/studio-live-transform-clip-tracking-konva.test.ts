// @vitest-environment jsdom

/**
 * Panel-clip tracking against a REAL Konva scene graph, because the whole mechanism is a claim
 * about Konva's own clip semantics: that a clip is attrs on a container rather than a parent, so
 * re-pointing one needs no reparenting. A fake node would assert my belief about Konva instead.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { studioKonvaRuntime } from "./render/studio-konva-runtime";
import { studioLiveTransformCommittedClip } from "./studio-live-transform-clip-tracking";
import {
  applyStudioLiveTransformClip,
  findStudioLiveTransformClipHost,
  readStudioLiveTransformClip,
  restoreStudioLiveTransformClip,
  STUDIO_LIVE_TRANSFORM_CLIP_OWNED_ATTR,
} from "./studio-live-transform-clip-tracking-konva";

import type { El } from "./studio-element-model";
import type Konva from "konva";

function installCanvasContextStub(): () => void {
  const prototype = globalThis.HTMLCanvasElement.prototype as unknown as { getContext: unknown };
  const original = prototype.getContext;
  prototype.getContext = () =>
    new Proxy(
      { canvas: null },
      {
        get: (target: Record<string, unknown>, property: string) =>
          property in target ? target[property] : () => undefined,
        set: () => true,
      },
    );
  return () => {
    prototype.getContext = original;
  };
}

const PANEL = {
  id: "frame-1",
  type: "frame",
  x: 0,
  y: 0,
  width: 200,
  height: 200,
} as unknown as El;

describe("live transform panel-clip tracking (Konva)", () => {
  let stage: Konva.Stage;
  let mainLayer: Konva.Layer;
  let dragLayer: Konva.Layer;
  let container: HTMLDivElement;
  let restoreCanvas: () => void;

  beforeEach(() => {
    restoreCanvas = installCanvasContextStub();
    container = document.createElement("div");
    document.body.appendChild(container);
    stage = new studioKonvaRuntime.Stage({ container, width: 720, height: 1020 });
    mainLayer = new studioKonvaRuntime.Layer();
    dragLayer = new studioKonvaRuntime.Layer();
    stage.add(mainLayer);
    stage.add(dragLayer);
  });

  afterEach(() => {
    stage.destroy();
    container.remove();
    restoreCanvas();
  });

  /** A panel member: wrapper inside the per-element clip Group the document layer renders. */
  function addClippedStroke(): { wrapper: Konva.Group; clipGroup: Konva.Group } {
    const clipGroup = new studioKonvaRuntime.Group({
      clipX: 0,
      clipY: 0,
      clipWidth: 200,
      clipHeight: 200,
    });
    const wrapper = new studioKonvaRuntime.Group({ x: 0, y: 0, draggable: true });
    wrapper.setAttr("studioElementId", "draw-1");
    clipGroup.add(wrapper);
    mainLayer.add(clipGroup);
    return { wrapper, clipGroup };
  }

  /** A free stroke: wrapper straight on the main Layer, with no clip Group anywhere. */
  function addUnclippedStroke(): Konva.Group {
    const wrapper = new studioKonvaRuntime.Group({ x: 0, y: 0, draggable: true });
    wrapper.setAttr("studioElementId", "draw-1");
    mainLayer.add(wrapper);
    return wrapper;
  }

  it("hosts the clip on the per-element Group for a stroke that starts INSIDE a panel", () => {
    const { wrapper, clipGroup } = addClippedStroke();

    expect(findStudioLiveTransformClipHost(wrapper, dragLayer)).toBe(clipGroup);
    expect(readStudioLiveTransformClip(clipGroup)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 200,
    });
  });

  it("drops the clip when the gesture carries the stroke OUT of its panel", () => {
    const { wrapper, clipGroup } = addClippedStroke();
    const host = findStudioLiveTransformClipHost(wrapper, dragLayer);
    const original = readStudioLiveTransformClip(host);

    // Target box well outside the 200x200 panel — the commit will not clip this.
    const verdict = studioLiveTransformCommittedClip({
      targetBounds: { x: 400, y: 400, width: 40, height: 40 },
      rotationDeg: 0,
      elements: [PANEL],
    });
    expect(verdict).toBeNull();
    expect(applyStudioLiveTransformClip(host, verdict)).toBe(true);
    expect(readStudioLiveTransformClip(clipGroup)).toBeNull();

    // …and the gesture ending puts the document back exactly as it was.
    expect(restoreStudioLiveTransformClip(host, original)).toBe(true);
    expect(readStudioLiveTransformClip(clipGroup)).toEqual(original);
    expect(clipGroup.getAttr(STUDIO_LIVE_TRANSFORM_CLIP_OWNED_ATTR)).toBeUndefined();
  });

  it("adds the clip on the drag Layer when the gesture carries a free stroke INTO a panel", () => {
    // The case the in-place path cannot serve: an unclipped stroke renders with no clip Group at
    // all, so the lift's dedicated Layer is the only node available to host a clip.
    const wrapper = addUnclippedStroke();
    wrapper.moveTo(dragLayer);

    const host = findStudioLiveTransformClipHost(wrapper, dragLayer);
    expect(host).toBe(dragLayer);
    expect(readStudioLiveTransformClip(host)).toBeNull();

    const verdict = studioLiveTransformCommittedClip({
      targetBounds: { x: 80, y: 80, width: 20, height: 20 },
      rotationDeg: 0,
      elements: [PANEL],
    });
    expect(applyStudioLiveTransformClip(host, verdict)).toBe(true);
    expect(readStudioLiveTransformClip(dragLayer)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 200,
    });

    // Restoring must clear it: the drag Layer is shared, and a clip left behind would silently
    // clip whatever the NEXT gesture lifts onto it.
    expect(restoreStudioLiveTransformClip(host, null)).toBe(true);
    expect(readStudioLiveTransformClip(dragLayer)).toBeNull();
  });

  it("writes nothing on the frames where the verdict has not moved", () => {
    // The hot path: this runs per gesture frame, and the panel verdict changes at most once or
    // twice in a whole gesture.
    const { wrapper } = addClippedStroke();
    const host = findStudioLiveTransformClipHost(wrapper, dragLayer);
    const same = { x: 0, y: 0, width: 200, height: 200 };

    expect(applyStudioLiveTransformClip(host, same)).toBe(false);
    expect(applyStudioLiveTransformClip(host, { ...same, width: 199 })).toBe(true);
  });

  it("answers no host for a free stroke whose lift was refused", () => {
    // Neither host exists — no clip Group ancestor, and the wrapper never reached the drag Layer.
    // The gesture keeps today's behaviour rather than standing the whole preview down.
    const wrapper = addUnclippedStroke();

    expect(findStudioLiveTransformClipHost(wrapper, dragLayer)).toBeNull();
    expect(applyStudioLiveTransformClip(null, { x: 0, y: 0, width: 1, height: 1 })).toBe(false);
  });

  it("never restores a host it did not take over", () => {
    // Same rule the parked-chrome restore follows: a clip the product changed for its own reasons
    // during the gesture must not be clobbered on the way out.
    const { wrapper, clipGroup } = addClippedStroke();
    const host = findStudioLiveTransformClipHost(wrapper, dragLayer);

    expect(restoreStudioLiveTransformClip(host, null)).toBe(false);
    expect(readStudioLiveTransformClip(clipGroup)).not.toBeNull();
  });
});
