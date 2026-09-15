// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { planStudioDrawObjectTransform } from "./brush/studio-draw-object-transform";
import { studioKonvaRuntime } from "./render/studio-konva-runtime";
import { beginStudioLiveCanvasGesture } from "./studio-live-canvas-gesture";
import * as drawCompiler from "./studio-live-transform-draw-compiler";
import { createStudioLiveTransformDraftStore } from "./studio-live-transform-draft-store";
import { STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS } from "./studio-live-transform-exact-draft-admission";
import {
  beginStudioKonvaDrawTransformGesture,
  studioKonvaDrawTransformIsBusy,
} from "./studio-live-transform-gesture-konva";
import { attachStudioLiveTransformSurface } from "./studio-live-transform-surface";
import { STUDIO_LIVE_TRANSFORM_WIREFRAME_FALLBACK_NAME } from "./studio-live-transform-wireframe-fallback-konva";
import { STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR } from "./studio-selection-chrome-mirror";

import type { DrawEl } from "./studio-element-model";
import type { StudioLiveTransformPreviewScheduler } from "./studio-live-transform-preview-session";
import type Konva from "konva";

function installCanvasContextStub(): () => void {
  const prototype = globalThis.HTMLCanvasElement.prototype as unknown as { getContext: unknown };
  const original = prototype.getContext;
  prototype.getContext = () =>
    new Proxy(
      {
        canvas: null,
        getImageData: () => ({
          data: new Uint8ClampedArray(4),
          width: 1,
          height: 1,
        }),
      },
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

function manualScheduler() {
  let nextHandle = 1;
  const callbacks = new Map<number, () => void>();
  const scheduler: StudioLiveTransformPreviewScheduler = {
    requestFrame: (callback) => {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle) => {
      callbacks.delete(handle);
    },
  };
  return {
    scheduler,
    flush: () => {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback();
    },
  };
}

const sourceBounds = { x: 10, y: 20, width: 100, height: 50 };
const draftScope = "page:page-1";
const sourceElement = {
  id: "stroke-1",
  type: "draw",
  kind: "freehand",
  points: [10, 20, 110, 70],
  stroke: "#16100c",
  strokeWidth: 4,
} as DrawEl;

interface Scene {
  readonly container: HTMLDivElement;
  readonly stage: Konva.Stage;
  readonly mainLayer: Konva.Layer;
  readonly dragLayer: Konva.Layer;
  readonly draftRoot: Konva.Group;
  readonly wrapper: Konva.Group;
  readonly proxy: Konva.Rect;
  readonly transformer: Konva.Transformer;
}

function createScene(): Scene {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const stage = new studioKonvaRuntime.Stage({ container, width: 720, height: 1020 });
  const mainLayer = new studioKonvaRuntime.Layer();
  const dragLayer = new studioKonvaRuntime.Layer();
  const draftRoot = new studioKonvaRuntime.Group({ listening: false });
  draftRoot.name("studio-live-transform-draft-root");
  dragLayer.add(draftRoot);
  stage.add(mainLayer, dragLayer);

  const wrapper = new studioKonvaRuntime.Group({ draggable: true });
  wrapper.setAttr("studioElementId", sourceElement.id);
  wrapper.add(new studioKonvaRuntime.Line({ points: sourceElement.points, stroke: "#000" }));
  const proxy = new studioKonvaRuntime.Rect(sourceBounds);
  const transformer = new studioKonvaRuntime.Transformer();
  mainLayer.add(wrapper, proxy, transformer);
  transformer.nodes([proxy]);
  return { container, stage, mainLayer, dragLayer, draftRoot, wrapper, proxy, transformer };
}

let restoreCanvas: () => void;
let scene: Scene;

beforeEach(() => {
  restoreCanvas = installCanvasContextStub();
  scene = createScene();
});

afterEach(() => {
  scene.stage.destroy();
  scene.container.remove();
  restoreCanvas();
  vi.restoreAllMocks();
});

/**
 * These adapter tests stage a plain Konva.Line, not StudioDrawNode's causal pen.
 * Certify only that synthetic subtree as affine; production/default-pen tests keep
 * the real compiler and must replan even uniform frames to match pointer-up.
 */
function useRetainedLineFixture(): void {
  const compile = drawCompiler.compileStudioLiveTransformDrawSnapshot;
  vi.spyOn(drawCompiler, "compileStudioLiveTransformDrawSnapshot").mockImplementation((element) => {
    const snapshot = compile(element);
    return {
      ...snapshot,
      renderRoute: { ...snapshot.renderRoute, retainedAffinePolicy: "route-checked" },
    };
  });
}

function createGesture(
  existingStore = createStudioLiveTransformDraftStore(),
  element: DrawEl = sourceElement,
) {
  const clock = manualScheduler();
  const store = existingStore;
  const gesture = beginStudioKonvaDrawTransformGesture({
    preview: {
      scope: draftScope,
      element,
      elements: [element],
      dragLayer: scene.dragLayer,
      draftStore: store,
      scheduler: clock.scheduler,
    },
    sourceBounds,
    stage: scene.stage,
    proxy: scene.proxy,
    transformer: scene.transformer,
  });
  return { gesture, store, clock };
}

function fallbackRoot(): Konva.Node | null {
  return scene.stage.findOne(`.${STUDIO_LIVE_TRANSFORM_WIREFRAME_FALLBACK_NAME}`) ?? null;
}

function beginGesture(
  existingStore = createStudioLiveTransformDraftStore(),
  element: DrawEl = sourceElement,
) {
  const begun = createGesture(existingStore, element);
  expect(begun.gesture).not.toBeNull();
  return { ...begun, gesture: begun.gesture! };
}

describe("beginStudioKonvaDrawTransformGesture · exact model draft", () => {
  it("keeps the common page writer lease until the exact handoff receives authoritative pixels", () => {
    const store = createStudioLiveTransformDraftStore();
    const clock = manualScheduler();
    const commit = vi.fn(() => true);
    const release = vi.fn();
    const cancel = vi.fn();
    const recoveryQueue: Array<() => void> = [];
    const begun = beginStudioLiveCanvasGesture({
      commitPort: {
        acquire: () => true,
        commit,
        release,
        cancel,
      },
      createTransient: () => {
        const renderer = beginStudioKonvaDrawTransformGesture({
          preview: {
            scope: draftScope,
            element: sourceElement,
            elements: [sourceElement],
            dragLayer: scene.dragLayer,
            draftStore: store,
            scheduler: clock.scheduler,
          },
          sourceBounds,
          stage: scene.stage,
          proxy: scene.proxy,
          transformer: scene.transformer,
        });
        expect(renderer).not.toBeNull();
        return renderer!;
      },
      scheduleRecovery: (callback) => recoveryQueue.push(callback),
    });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    const terminalFrame = {
      targetBounds: { x: 25, y: 35, width: 175, height: 80 },
      rotationDeg: 30,
    };
    const expected = planStudioDrawObjectTransform({
      el: sourceElement,
      sourceBounds,
      ...terminalFrame,
    });
    expect(expected).not.toBeNull();

    expect(begun.session.finish(terminalFrame)).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(store.getSnapshot()?.phase).toBe("handoff");
    expect(recoveryQueue).toHaveLength(1);

    // Polling before receipt retains both the draft and the writer exclusion lease.
    recoveryQueue.shift()?.();
    expect(release).not.toHaveBeenCalled();
    expect(store.getSnapshot()?.phase).toBe("handoff");
    expect(recoveryQueue).toHaveLength(1);

    expect(store.acknowledgeAuthoritative(draftScope, [expected!])).toBe(true);
    recoveryQueue.shift()?.();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBeNull();
    expect(recoveryQueue).toHaveLength(0);
  });

  it("bounds hostile arrays and routes stylus-oriented ink to the guide", () => {
    const unboundedPoints = new Proxy(new Array<number>(200_000), {
      get: (target, property, receiver) => {
        if (property !== "length") throw new Error(`sample access: ${String(property)}`);
        return Reflect.get(target, property, receiver);
      },
    });
    const begin = (element: DrawEl) => beginStudioKonvaDrawTransformGesture({
      preview: {
        scope: draftScope,
        element,
        elements: [element],
        dragLayer: scene.dragLayer,
        draftStore: createStudioLiveTransformDraftStore(),
        scheduler: manualScheduler().scheduler,
      },
      sourceBounds,
      stage: scene.stage,
      proxy: scene.proxy,
      transformer: scene.transformer,
    });

    expect(begin({
      ...sourceElement,
      brush: "pen",
      sampleSpacing: 1,
      points: unboundedPoints,
    })).toBeNull();

    const oriented: DrawEl = {
      ...sourceElement,
      brush: "calligraphy",
      sampleSpacing: 1,
      twists: [30, 30],
    };
    const { gesture, store, clock } = createGesture(
      createStudioLiveTransformDraftStore(),
      oriented,
    );
    expect(gesture).not.toBeNull();
    gesture!.offer({
      targetBounds: { x: 30, y: 40, width: 200, height: 75 },
      rotationDeg: 15,
    });
    clock.flush();
    expect(store.getSnapshot()).toBeNull();
    expect(fallbackRoot()?.visible()).toBe(true);
    expect(scene.wrapper.opacity()).toBeLessThan(1);
    gesture!.close({ kind: "cancel", reason: "escape" });
    expect(scene.wrapper.opacity()).toBe(1);
    expect(scene.wrapper.getLayer()).toBe(scene.mainLayer);
  });

  it("transfers construction-time cleanup to host recovery before the adapter can be returned", () => {
    vi.useFakeTimers();
    const store = createStudioLiveTransformDraftStore();
    const failedClaim = vi.spyOn(store, "claim").mockImplementation(() => {
      throw new Error("draft claim failed");
    });
    const readAbsolutePosition = scene.proxy.getAbsolutePosition.bind(scene.proxy);
    let remainingRestoreFailures = 3;
    const failedRestore = vi.spyOn(scene.proxy, "getAbsolutePosition").mockImplementation(() => {
      if (remainingRestoreFailures > 0) {
        remainingRestoreFailures -= 1;
        throw new Error("wrapper position unavailable");
      }
      return readAbsolutePosition();
    });

    try {
      expect(() => beginStudioKonvaDrawTransformGesture({
        preview: {
          scope: draftScope,
          element: sourceElement,
          elements: [sourceElement],
          dragLayer: scene.dragLayer,
          draftStore: store,
          scheduler: manualScheduler().scheduler,
        },
        sourceBounds,
        stage: scene.stage,
        proxy: scene.proxy,
        transformer: scene.transformer,
      })).toThrow("Konva live-transform setup and rollback both failed");
      expect(scene.wrapper.getLayer()).toBe(scene.mainLayer);
      expect(scene.proxy.getLayer()).toBe(scene.dragLayer);
      expect(remainingRestoreFailures).toBe(0);
      // No adapter token can be returned with this setup error. The Layer host's pending lease must
      // therefore remain discoverable and block a second writer until recovery finishes.
      expect(studioKonvaDrawTransformIsBusy(scene.stage, sourceElement.id)).toBe(true);

      vi.advanceTimersByTime(16);
      expect(scene.wrapper.getLayer()).toBe(scene.mainLayer);
      expect(scene.proxy.getLayer()).toBe(scene.mainLayer);
      expect(scene.transformer.getLayer()).toBe(scene.mainLayer);
      expect(
        scene.wrapper.getAttr("studioLiveTransformPreviewActive"),
      ).toBeUndefined();
      expect(studioKonvaDrawTransformIsBusy(scene.stage, sourceElement.id)).toBe(false);
    } finally {
      failedRestore.mockRestore();
      failedClaim.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps a setup-time non-Layer cleanup failure element-busy until host recovery", () => {
    vi.useFakeTimers();
    const store = createStudioLiveTransformDraftStore();
    const failedClaim = vi.spyOn(store, "claim").mockImplementation(() => {
      throw new Error("draft claim failed");
    });
    const setAttr = scene.wrapper.setAttr.bind(scene.wrapper);
    let remainingAttrClearFailures = 1;
    const failedAttrClear = vi.spyOn(scene.wrapper, "setAttr").mockImplementation((
      attribute,
      value,
    ) => {
      if (
        attribute === STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR
        && value === undefined
        && remainingAttrClearFailures > 0
      ) {
        remainingAttrClearFailures -= 1;
        throw new Error("active attr clear failed");
      }
      return setAttr(attribute, value);
    });

    try {
      expect(() => beginStudioKonvaDrawTransformGesture({
        preview: {
          scope: draftScope,
          element: sourceElement,
          elements: [sourceElement],
          dragLayer: scene.dragLayer,
          draftStore: store,
          scheduler: manualScheduler().scheduler,
        },
        sourceBounds,
        stage: scene.stage,
        proxy: scene.proxy,
        transformer: scene.transformer,
      })).toThrow("Konva live-transform setup and rollback both failed");
      expect(scene.wrapper.getLayer()).toBe(scene.mainLayer);
      expect(studioKonvaDrawTransformIsBusy(scene.stage, sourceElement.id)).toBe(true);

      vi.advanceTimersByTime(16);
      expect(
        scene.wrapper.getAttr(STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR),
      ).toBeUndefined();
      expect(studioKonvaDrawTransformIsBusy(scene.stage, sourceElement.id)).toBe(false);
    } finally {
      failedAttrClear.mockRestore();
      failedClaim.mockRestore();
      vi.useRealTimers();
    }
  });

  it("replans non-uniform frames and switches back to the retained affine fast path", () => {
    useRetainedLineFixture();
    const { gesture, store, clock } = beginGesture();
    expect(scene.draftRoot.zIndex()).toBe(0);
    expect(scene.wrapper.getLayer()).toBe(scene.mainLayer);
    expect(scene.proxy.getLayer()).toBe(scene.dragLayer);
    expect(scene.transformer.getLayer()).toBe(scene.dragLayer);
    expect(scene.transformer.zIndex()).toBeGreaterThan(scene.draftRoot.zIndex());

    const nonUniform = {
      targetBounds: { x: 30, y: 40, width: 200, height: 75 },
      rotationDeg: 15,
    };
    gesture.offer(nonUniform);
    clock.flush();
    expect(scene.wrapper.getLayer()).toBe(scene.dragLayer);
    const expected = planStudioDrawObjectTransform({
      el: sourceElement,
      sourceBounds,
      ...nonUniform,
    });
    expect(store.getSnapshot()?.entries[0]?.element).toEqual(expected);
    expect(scene.wrapper.visible()).toBe(false);
    expect(scene.wrapper.scale()).toEqual({ x: 1, y: 1 });

    gesture.offer({
      targetBounds: { x: 30, y: 40, width: 200, height: 100 },
      rotationDeg: 20,
    });
    clock.flush();
    expect(store.getSnapshot()).toBeNull();
    expect(scene.wrapper.visible()).toBe(true);
    expect(scene.wrapper.scale()).toEqual({ x: 2, y: 2 });
    expect(scene.wrapper.rotation()).toBe(20);

    gesture.close({ kind: "cancel", reason: "escape" });
    expect(scene.wrapper.getLayer()).toBe(scene.mainLayer);
    expect(scene.wrapper.visible()).toBe(true);
    expect(scene.wrapper.scale()).toEqual({ x: 1, y: 1 });
    expect(store.getSnapshot()).toBeNull();
  });

  it("renders one isolated SceneCanvas receipt per steady affine frame", () => {
    useRetainedLineFixture();
    const { gesture, store, clock } = beginGesture();
    const dragReceipt = vi.spyOn(scene.dragLayer, "drawScene");

    gesture.offer({
      targetBounds: { x: 30, y: 40, width: 200, height: 100 },
      rotationDeg: 15,
    });
    clock.flush();
    // The first admitted frame has one source-lift receipt and one transformed source receipt.
    expect(dragReceipt).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).toBeNull();

    dragReceipt.mockClear();
    gesture.offer({
      targetBounds: { x: 35, y: 45, width: 150, height: 75 },
      rotationDeg: 20,
    });
    clock.flush();
    expect(dragReceipt).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBeNull();

    gesture.close({ kind: "cancel", reason: "escape" });
  });

  it("uses the bounded guide when the exact Layer backing store exceeds the cap", () => {
    const sceneCanvas = scene.dragLayer.getCanvas();
    const nativeSceneCanvas = scene.dragLayer.getNativeCanvasElement();
    sceneCanvas.setPixelRatio(3);

    expect(720 * 1020).toBeLessThan(STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS);
    expect(nativeSceneCanvas.style.width).toBe("720px");
    expect(nativeSceneCanvas.style.height).toBe("1020px");
    expect(nativeSceneCanvas.width).toBe(720 * 3);
    expect(nativeSceneCanvas.height).toBe(1020 * 3);
    expect(nativeSceneCanvas.width * nativeSceneCanvas.height).toBe(
      720 * 1020 * 3 ** 2,
    );
    expect(nativeSceneCanvas.width * nativeSceneCanvas.height).toBeGreaterThan(
      STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS,
    );
    const { gesture, store, clock } = beginGesture();
    expect(scene.wrapper.getLayer()).toBe(scene.mainLayer);
    expect(scene.proxy.getLayer()).toBe(scene.dragLayer);
    expect(scene.transformer.getLayer()).toBe(scene.dragLayer);
    const sourceDrawScene = vi.spyOn(scene.mainLayer, "drawScene");
    const sourceBatchDraw = vi.spyOn(scene.mainLayer, "batchDraw");

    scene.proxy.setAttrs({ x: 30, y: 40, width: 200, height: 75, rotation: 15 });
    gesture.offer({
      targetBounds: { x: 30, y: 40, width: 200, height: 75 },
      rotationDeg: 15,
    });
    clock.flush();

    expect(store.getSnapshot()).toBeNull();
    expect(scene.wrapper.getLayer()).toBe(scene.mainLayer);
    expect(scene.wrapper.visible()).toBe(true);
    expect(scene.wrapper.opacity()).toBeLessThan(1);
    expect(scene.wrapper.scale()).toEqual({ x: 1, y: 1 });
    expect(fallbackRoot()?.visible()).toBe(true);
    expect(sourceDrawScene).toHaveBeenCalledTimes(1);
    expect(sourceBatchDraw).not.toHaveBeenCalled();
    gesture.close({ kind: "cancel", reason: "escape" });
    expect(scene.wrapper.opacity()).toBe(1);
    expect(scene.proxy.getLayer()).toBe(scene.mainLayer);
    expect(scene.transformer.getLayer()).toBe(scene.mainLayer);
  });

  it("rechecks identical geometry after DPR changes, then keeps rejected frames off the source Layer", () => {
    useRetainedLineFixture();
    const { gesture, clock } = beginGesture();
    gesture.offer({
      targetBounds: { x: 30, y: 40, width: 200, height: 100 },
      rotationDeg: 15,
    });
    clock.flush();
    expect(scene.wrapper.getLayer()).toBe(scene.dragLayer);
    expect(scene.wrapper.scale()).toEqual({ x: 2, y: 2 });

    const sourceDrawScene = vi.spyOn(scene.mainLayer, "drawScene");
    const sourceBatchDraw = vi.spyOn(scene.mainLayer, "batchDraw");
    scene.dragLayer.getCanvas().setPixelRatio(3);

    // The first rejected frame is an authority transition: neutralize and return the source once.
    scene.proxy.setAttrs({ x: 30, y: 40, width: 200, height: 100, rotation: 15 });
    gesture.offer({
      targetBounds: { x: 30, y: 40, width: 200, height: 100 },
      rotationDeg: 15,
    });
    clock.flush();
    expect(scene.wrapper.getLayer()).toBe(scene.mainLayer);
    expect(scene.wrapper.scale()).toEqual({ x: 1, y: 1 });
    expect(sourceDrawScene).toHaveBeenCalled();
    expect(sourceBatchDraw).toHaveBeenCalled();

    sourceDrawScene.mockClear();
    sourceBatchDraw.mockClear();
    // Once degraded, later handle mutations stay on the guide Layer and do not repaint source.
    scene.proxy.setAttrs({ x: 50, y: 60, width: 240, height: 120, rotation: 25 });
    gesture.offer({
      targetBounds: { x: 50, y: 60, width: 240, height: 120 },
      rotationDeg: 25,
    });
    clock.flush();
    expect(scene.wrapper.getLayer()).toBe(scene.mainLayer);
    expect(sourceDrawScene).not.toHaveBeenCalled();
    expect(sourceBatchDraw).not.toHaveBeenCalled();

    gesture.close({ kind: "cancel", reason: "escape" });
  });

  it("crosses the draft publication barrier before transferring source visibility", () => {
    useRetainedLineFixture();
    const store = createStudioLiveTransformDraftStore();
    const drawScene = vi.spyOn(scene.dragLayer, "drawScene");
    const autoDrawEnabled = studioKonvaRuntime.autoDrawEnabled;
    const visibilityAtPublication: boolean[] = [];
    store.subscribe(() => visibilityAtPublication.push(scene.wrapper.visible()));
    const { gesture, clock } = beginGesture(store);

    gesture.offer({
      targetBounds: { x: 30, y: 40, width: 200, height: 75 },
      rotationDeg: 15,
    });
    clock.flush();
    // The exact subtree is committed while the authoritative source is still visible; the source
    // is hidden only after the synchronous renderer barrier returns.
    expect(visibilityAtPublication.at(-1)).toBe(true);
    expect(scene.wrapper.visible()).toBe(false);
    expect(drawScene).toHaveBeenCalled();
    expect(studioKonvaRuntime.autoDrawEnabled).toBe(autoDrawEnabled);

    drawScene.mockClear();
    gesture.offer({
      targetBounds: { x: 30, y: 40, width: 200, height: 100 },
      rotationDeg: 20,
    });
    clock.flush();
    // On the reverse transition the already-transformed source receives pixels first; only then
    // does the exact subtree publish null and clear its canvas. A browser paint can see neither a
    // double-authority frame nor a blank frame.
    expect(visibilityAtPublication.at(-1)).toBe(true);
    expect(scene.wrapper.visible()).toBe(true);
    // Exact→affine needs two receipts only at the authority boundary: source first, then the
    // final source-only canvas after the draft subtree is synchronously removed.
    expect(drawScene).toHaveBeenCalledTimes(2);
    gesture.close({ kind: "cancel", reason: "escape" });
  });

  it("keeps z-order-rejected ink moving without lifting its authored source", () => {
    scene.mainLayer.add(new studioKonvaRuntime.Rect({ width: 10, height: 10, fill: "#fff" }));
    const { gesture, store, clock } = beginGesture();
    expect(scene.wrapper.getLayer()).toBe(scene.mainLayer);
    expect(scene.proxy.getLayer()).toBe(scene.dragLayer);
    expect(scene.transformer.getLayer()).toBe(scene.dragLayer);
    const sourceDrawScene = vi.spyOn(scene.mainLayer, "drawScene");
    const sourceBatchDraw = vi.spyOn(scene.mainLayer, "batchDraw");

    scene.proxy.setAttrs({ x: 30, y: 40, width: 200, height: 75, rotation: 15 });
    gesture.offer({
      targetBounds: { x: 30, y: 40, width: 200, height: 75 },
      rotationDeg: 15,
    });
    clock.flush();

    expect(scene.wrapper.getLayer()).toBe(scene.mainLayer);
    expect(scene.wrapper.scale()).toEqual({ x: 1, y: 1 });
    expect(scene.wrapper.rotation()).toBe(0);
    expect(scene.wrapper.opacity()).toBeLessThan(1);
    expect(store.getSnapshot()).toBeNull();
    expect(fallbackRoot()?.visible()).toBe(true);
    expect(sourceDrawScene).toHaveBeenCalledTimes(1);
    expect(sourceBatchDraw).not.toHaveBeenCalled();

    gesture.close({ kind: "cancel", reason: "escape" });
    expect(scene.wrapper.opacity()).toBe(1);
    expect(scene.proxy.getLayer()).toBe(scene.mainLayer);
    expect(scene.transformer.getLayer()).toBe(scene.mainLayer);
    expect(scene.wrapper.getAttr(STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR)).toBeUndefined();
  });

  it.each(["line", "arrow"] as const)(
    "keeps a z-order-blocked %s moving through the exact vector overlay fallback",
    (kind) => {
      // A painting sibling above the selected vector makes a source Layer lift dishonest: moving
      // the wrapper to the transform Layer would change authored stacking. Office-style vector
      // transforms instead hide the authored copy once and put the exact draft above the page.
      scene.mainLayer.add(new studioKonvaRuntime.Rect({ width: 10, height: 10, fill: "#fff" }));
      const element: DrawEl = { ...sourceElement, kind };
      const { gesture, store, clock } = beginGesture(undefined, element);
      const sourceDrawScene = vi.spyOn(scene.mainLayer, "drawScene");
      const transformDrawScene = vi.spyOn(scene.dragLayer, "drawScene");
      const firstFrame = {
        targetBounds: { x: 30, y: 40, width: 200, height: 75 },
        rotationDeg: 15,
      };

      gesture.offer(firstFrame);
      clock.flush();

      expect(scene.wrapper.getLayer()).toBe(scene.mainLayer);
      expect(scene.wrapper.visible()).toBe(false);
      expect(scene.wrapper.scale()).toEqual({ x: 1, y: 1 });
      expect(store.getSnapshot()?.entries[0]?.element).toEqual(
        planStudioDrawObjectTransform({ el: element, sourceBounds, ...firstFrame }),
      );
      // The first frame removes the authored copy once and paints the exact vector overlay.
      expect(sourceDrawScene).toHaveBeenCalledTimes(1);
      expect(transformDrawScene).toHaveBeenCalledTimes(1);

      sourceDrawScene.mockClear();
      transformDrawScene.mockClear();
      const secondFrame = {
        targetBounds: { x: 45, y: 55, width: 80, height: 130 },
        rotationDeg: -30,
      };
      gesture.offer(secondFrame);
      clock.flush();

      expect(store.getSnapshot()?.entries[0]?.element).toEqual(
        planStudioDrawObjectTransform({ el: element, sourceBounds, ...secondFrame }),
      );
      expect(scene.wrapper.visible()).toBe(false);
      // Steady pointer frames never repaint the full document Layer.
      expect(sourceDrawScene).not.toHaveBeenCalled();
      expect(transformDrawScene).toHaveBeenCalledTimes(1);

      gesture.close({ kind: "cancel", reason: "escape" });
      expect(scene.wrapper.getLayer()).toBe(scene.mainLayer);
      expect(scene.wrapper.visible()).toBe(true);
      expect(store.getSnapshot()).toBeNull();
      expect(scene.proxy.getLayer()).toBe(scene.mainLayer);
      expect(scene.transformer.getLayer()).toBe(scene.mainLayer);
    },
  );

  it("retains a vector overlay through commit handoff and restores authored stacking on receipt", () => {
    scene.mainLayer.add(new studioKonvaRuntime.Rect({ width: 10, height: 10, fill: "#fff" }));
    const element: DrawEl = { ...sourceElement, kind: "line" };
    const { gesture, store } = beginGesture(undefined, element);
    const terminalFrame = {
      targetBounds: { x: 25, y: 35, width: 175, height: 80 },
      rotationDeg: 30,
    };
    const expected = planStudioDrawObjectTransform({
      el: element,
      sourceBounds,
      ...terminalFrame,
    });
    expect(expected).not.toBeNull();

    gesture.close({ kind: "commit", terminalFrame });

    // The exact overlay remains the visual authority until the durable document render acks it.
    expect(scene.wrapper.getLayer()).toBe(scene.mainLayer);
    expect(scene.wrapper.visible()).toBe(false);
    expect(store.getSnapshot()?.entries[0]?.element).toEqual(expected);
    expect(store.getSnapshot()?.phase).toBe("active");
    expect(gesture.settle?.({ kind: "commit", committed: true })).toBe(false);
    expect(store.getSnapshot()?.phase).toBe("handoff");

    expect(store.acknowledgeAuthoritative(draftScope, [expected!])).toBe(true);
    expect(scene.wrapper.visible()).toBe(true);
    expect(store.getSnapshot()).toBeNull();
    expect(gesture.settle?.({ kind: "commit", committed: true })).toBe(true);
    expect(scene.proxy.getLayer()).toBe(scene.mainLayer);
    expect(scene.transformer.getLayer()).toBe(scene.mainLayer);
  });

  it("retains the exact terminal candidate until authoritative receipt, then restores source", () => {
    const { gesture, store } = beginGesture();
    const terminalFrame = {
      targetBounds: { x: 25, y: 35, width: 175, height: 80 },
      rotationDeg: 30,
    };
    const expected = planStudioDrawObjectTransform({
      el: sourceElement,
      sourceBounds,
      ...terminalFrame,
    });
    expect(expected).not.toBeNull();

    gesture.close({ kind: "commit", terminalFrame });
    expect(scene.wrapper.getLayer()).toBe(scene.mainLayer);
    expect(scene.wrapper.visible()).toBe(false);
    expect(store.getSnapshot()?.entries[0]?.element).toEqual(expected);
    expect(store.getSnapshot()?.phase).toBe("active");

    expect(gesture.settle?.({ kind: "commit", committed: true })).toBe(false);
    expect(store.getSnapshot()?.phase).toBe("handoff");
    // A recovery poll before receipt must not force-release the draft or expose the old source.
    expect(gesture.settle?.({ kind: "commit", committed: true })).toBe(false);
    expect(store.getSnapshot()?.phase).toBe("handoff");
    expect(scene.wrapper.visible()).toBe(false);
    expect(store.acknowledgeAuthoritative(draftScope, [expected!])).toBe(true);
    expect(store.getSnapshot()).toBeNull();
    expect(scene.wrapper.visible()).toBe(true);
    expect(gesture.settle?.({ kind: "commit", committed: true })).toBe(true);
  });

  it("retries a requested handoff release after the authoritative source raster receipt fails", () => {
    const { gesture, store } = beginGesture();
    const terminalFrame = {
      targetBounds: { x: 25, y: 35, width: 175, height: 80 },
      rotationDeg: 30,
    };
    const expected = planStudioDrawObjectTransform({
      el: sourceElement,
      sourceBounds,
      ...terminalFrame,
    });
    expect(expected).not.toBeNull();

    gesture.close({ kind: "commit", terminalFrame });
    expect(gesture.settle?.({ kind: "commit", committed: true })).toBe(false);

    const drawScene = scene.mainLayer.drawScene.bind(scene.mainLayer);
    let receiptAttempts = 0;
    const sourceReceipt = vi.spyOn(scene.mainLayer, "drawScene").mockImplementation(() => {
      receiptAttempts += 1;
      if (receiptAttempts === 1) throw new Error("source raster receipt failed");
      return drawScene();
    });
    expect(store.acknowledgeAuthoritative(draftScope, [expected!])).toBe(false);
    expect(store.getSnapshot()?.phase).toBe("handoff");

    // The failed acknowledgement requested release, so the common settlement retry may now retry
    // that same callback. It must not re-run the durable commit or wait for a second CRDT receipt.
    expect(gesture.settle?.({ kind: "commit", committed: true })).toBe(true);
    expect(receiptAttempts).toBe(2);
    expect(store.getSnapshot()).toBeNull();
    expect(scene.wrapper.visible()).toBe(true);
    sourceReceipt.mockRestore();
  });

  it("rolls a retained terminal candidate back when the durable commit rejects", () => {
    const { gesture, store } = beginGesture();
    gesture.close({
      kind: "commit",
      terminalFrame: {
        targetBounds: { x: 25, y: 35, width: 175, height: 80 },
        rotationDeg: 30,
      },
    });
    expect(scene.wrapper.visible()).toBe(false);

    const authorityEvents: string[] = [];
    vi.spyOn(scene.mainLayer, "drawScene").mockImplementation(() => {
      authorityEvents.push("source-pixels");
      return scene.mainLayer;
    });
    vi.spyOn(scene.dragLayer, "drawScene").mockImplementation(() => {
      authorityEvents.push("draft-pixels");
      return scene.dragLayer;
    });
    store.subscribe(() => {
      if (store.getSnapshot() === null) authorityEvents.push("draft-cleared");
    });

    expect(gesture.settle?.({ kind: "commit", committed: false })).toBe(true);
    expect(store.getSnapshot()).toBeNull();
    expect(scene.wrapper.visible()).toBe(true);
    expect(authorityEvents).toEqual([
      "source-pixels",
      "draft-cleared",
      "draft-pixels",
    ]);
  });

  it("keeps a partially restored close retryable until Layer ownership and authority recover", () => {
    const { gesture, store, clock } = beginGesture();
    gesture.offer({
      targetBounds: { x: 30, y: 40, width: 200, height: 75 },
      rotationDeg: 15,
    });
    clock.flush();
    expect(scene.wrapper.visible()).toBe(false);
    expect(store.getSnapshot()?.phase).toBe("active");

    const readAbsolutePosition = scene.wrapper.getAbsolutePosition.bind(scene.wrapper);
    let remainingFailures = 3;
    const brokenPositionRead = vi.spyOn(scene.wrapper, "getAbsolutePosition")
      .mockImplementation(() => {
        if (remainingFailures > 0) {
          remainingFailures -= 1;
          throw new Error("wrapper position unavailable");
        }
        return readAbsolutePosition();
      });

    const outcome = { kind: "cancel", reason: "escape" } as const;
    expect(() => gesture.close(outcome)).toThrow(
      "Failed to completely release a Konva live-transform renderer claim",
    );
    expect(scene.wrapper.getLayer()).toBe(scene.dragLayer);
    expect(scene.wrapper.visible()).toBe(false);
    expect(store.getSnapshot()?.phase).toBe("active");

    expect(() => gesture.close(outcome)).not.toThrow();
    expect(scene.wrapper.getLayer()).toBe(scene.mainLayer);
    expect(scene.wrapper.visible()).toBe(true);
    expect(store.getSnapshot()).toBeNull();
    expect(remainingFailures).toBe(0);
    brokenPositionRead.mockRestore();
  });

  it("propagates a still-owned draft release refusal into retryable renderer close", () => {
    const store = createStudioLiveTransformDraftStore();
    const claim = store.claim.bind(store);
    const claimSpy = vi.spyOn(store, "claim").mockImplementation((scope, elementId) => {
      const owned = claim(scope, elementId);
      return owned
        ? {
            ...owned,
            release: () => false,
            isReleased: () => false,
          }
        : null;
    });
    const { gesture, clock } = beginGesture(store);
    gesture.offer({
      targetBounds: { x: 30, y: 40, width: 200, height: 75 },
      rotationDeg: 15,
    });
    clock.flush();
    expect(store.getSnapshot()?.phase).toBe("active");

    expect(() => gesture.close({ kind: "cancel", reason: "escape" })).toThrow(
      "Failed to completely release a Konva live-transform renderer claim",
    );
    expect(store.getSnapshot()?.phase).toBe("active");
    claimSpy.mockRestore();
  });

  it("refreshes source visibility after a new gesture supersedes an earlier handoff", () => {
    const store = createStudioLiveTransformDraftStore();
    const first = beginGesture(store);
    first.gesture.close({
      kind: "commit",
      terminalFrame: {
        targetBounds: { x: 25, y: 35, width: 175, height: 80 },
        rotationDeg: 30,
      },
    });
    expect(first.gesture.settle?.({ kind: "commit", committed: true })).toBe(false);
    expect(store.getSnapshot()?.phase).toBe("handoff");
    expect(scene.wrapper.visible()).toBe(false);

    const second = beginGesture(store);
    // claim() releases the old handoff synchronously; gesture two must capture this restored value.
    expect(scene.wrapper.visible()).toBe(true);
    second.gesture.offer({
      targetBounds: { x: 30, y: 40, width: 200, height: 75 },
      rotationDeg: 15,
    });
    second.clock.flush();
    expect(scene.wrapper.visible()).toBe(false);

    second.gesture.close({ kind: "cancel", reason: "escape" });
    expect(store.getSnapshot()).toBeNull();
    expect(scene.wrapper.visible()).toBe(true);
  });

  it("keeps a 3,200-sample calligraphy transform live outside the exact lane", () => {
    const points = Array.from({ length: 3_200 }, (_, index) => [
      (index % 100),
      (index % 2) * 40,
    ]).flat();
    const longCalligraphy: DrawEl = {
      ...sourceElement,
      brush: "calligraphy",
      sampleSpacing: 1,
      points,
    };
    const { gesture, store, clock } = createGesture(
      createStudioLiveTransformDraftStore(),
      longCalligraphy,
    );

    expect(gesture).not.toBeNull();
    gesture!.offer({
      targetBounds: { x: 30, y: 40, width: 200, height: 75 },
      rotationDeg: 15,
    });
    clock.flush();
    expect(store.getSnapshot()).toBeNull();
    expect(scene.wrapper.visible()).toBe(true);
    expect(scene.wrapper.opacity()).toBeLessThan(1);
    expect(scene.wrapper.scale()).toEqual({ x: 1, y: 1 });
    expect(fallbackRoot()?.visible()).toBe(true);
    gesture!.close({ kind: "cancel", reason: "escape" });
    expect(scene.wrapper.opacity()).toBe(1);
  });

  it("samples a 100k-point import without entering point or panel scans", () => {
    const points = Array.from({ length: 100_000 }, () => [10, 20]).flat();
    const importedGeneric: DrawEl = {
      ...sourceElement,
      points,
    };
    const compiler = vi.spyOn(drawCompiler, "compileStudioLiveTransformDrawSnapshot");
    const { gesture, store, clock } = createGesture(
      createStudioLiveTransformDraftStore(),
      importedGeneric,
    );

    expect(gesture).not.toBeNull();
    expect(compiler).not.toHaveBeenCalled();
    gesture!.offer({
      targetBounds: { x: 30, y: 40, width: 200, height: 75 },
      rotationDeg: 15,
    });
    clock.flush();
    expect(compiler).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBeNull();
    expect(scene.wrapper.visible()).toBe(true);
    expect(scene.wrapper.opacity()).toBeLessThan(1);
    expect(scene.wrapper.scale()).toEqual({ x: 1, y: 1 });
    expect(fallbackRoot()?.visible()).toBe(true);
    gesture!.close({ kind: "cancel", reason: "escape" });
    expect(scene.wrapper.opacity()).toBe(1);
  });
});

describe("Retina drawing live-transform regression", () => {
  it.each(["legacy-pen", "pen", "gpen", "brush", "line", "arrow"] as const)(
    "%s presents exact moving ink while the document stays full resolution",
    (kind) => {
      const originalDpr = studioKonvaRuntime.pixelRatio;
      studioKonvaRuntime.pixelRatio = 2;
      scene.stage.size({ width: 1800, height: 1200 });
      scene.mainLayer.getCanvas().setPixelRatio(2);
      scene.dragLayer.getCanvas().setPixelRatio(2);
      const detach = attachStudioLiveTransformSurface(scene.dragLayer);
      try {
        const element: DrawEl = kind === "legacy-pen"
          ? { ...sourceElement }
          : kind === "line" || kind === "arrow"
            ? { ...sourceElement, kind, brush: "calligraphy", tiltXs: [30, 30], tiltYs: [15, 15] }
            : { ...sourceElement, brush: kind, sampleSpacing: 2 };
        const originalPoints = [...element.points];
        const { gesture, store, clock } = beginGesture(undefined, element);
        for (const frame of [
          { targetBounds: { x: 20, y: 30, width: 150, height: 75 }, rotationDeg: 25 },
          { targetBounds: { x: 35, y: 45, width: 80, height: 25 }, rotationDeg: -35 },
        ]) {
          gesture.offer(frame);
          clock.flush();
          expect(store.getSnapshot()?.entries[0]?.element).toEqual(
            planStudioDrawObjectTransform({ el: element, sourceBounds, ...frame }),
          );
          expect(scene.wrapper.visible()).toBe(false);
          expect(element.points).toEqual(originalPoints);
        }
        expect(scene.mainLayer.getCanvas().getPixelRatio()).toBe(2);
        expect(scene.dragLayer.getCanvas().getPixelRatio()).toBeLessThan(2);
        const canvas = scene.dragLayer.getNativeCanvasElement();
        expect(canvas.width * canvas.height)
          .toBeLessThanOrEqual(STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS);
        gesture.close({ kind: "cancel", reason: "escape" });
        expect(scene.wrapper.visible()).toBe(true);
        expect(store.getSnapshot()).toBeNull();
      } finally {
        detach();
        studioKonvaRuntime.pixelRatio = originalDpr;
      }
    },
  );
});
