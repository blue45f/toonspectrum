// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readStudioCanvasViewportStack } from "./canvas/read-studio-canvas-viewport-stack";
import { studioKonvaRuntime } from "./render/studio-konva-runtime";
import {
  mirrorStudioDrawElementTranslation,
  STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR,
} from "./studio-selection-chrome-mirror";
import {
  beginStudioSingleDrawTransformLayer,
  beginStudioSingleObjectDragLayer,
  restoreStudioSingleObjectDragLayer,
} from "./studio-single-object-drag-layer";

import type Konva from "konva";


const studioCanvasViewportSource = readStudioCanvasViewportStack(import.meta.url, "./canvas/");

function installCanvasContextStub(): () => void {
  const prototype = globalThis.HTMLCanvasElement.prototype as unknown as {
    getContext: unknown;
  };
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

interface Scene {
  readonly stage: Konva.Stage;
  readonly mainLayer: Konva.Layer;
  readonly dragLayer: Konva.Layer;
  readonly container: HTMLDivElement;
}

function createScene(): Scene {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const stage = new studioKonvaRuntime.Stage({ container, width: 720, height: 1020 });
  const mainLayer = new studioKonvaRuntime.Layer();
  const dragLayer = new studioKonvaRuntime.Layer();
  stage.add(mainLayer, dragLayer);
  return { stage, mainLayer, dragLayer, container };
}

function addSelectedNode(
  layer: Konva.Layer,
  id = "object-1",
): Konva.Group {
  const target = new studioKonvaRuntime.Group({ x: 20, y: 30, draggable: true });
  target.setAttr("studioElementId", id);
  target.add(new studioKonvaRuntime.Rect({ width: 40, height: 25 }));
  layer.add(target);
  return target;
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
});

describe("single-object drag Layer", () => {
  it("lifts only the selected visual island and its attached Transformer", () => {
    const unrelated = new studioKonvaRuntime.Group();
    scene.mainLayer.add(unrelated);
    const target = addSelectedNode(scene.mainLayer);
    const transformer = new studioKonvaRuntime.Transformer();
    scene.mainLayer.add(transformer);
    transformer.nodes([target]);
    const forceUpdate = vi.spyOn(transformer, "forceUpdate");
    const originalOrder = [...scene.mainLayer.getChildren()];

    const session = beginStudioSingleObjectDragLayer({
      target,
      selectedElementId: "object-1",
      selectionSize: 1,
      mainLayer: scene.mainLayer,
      dragLayer: scene.dragLayer,
      transformer,
      selectedIsDraw: false,
      hasMaskOrClip: false,
    });

    expect(session).not.toBeNull();
    expect(target.getLayer()).toBe(scene.dragLayer);
    expect(transformer.getLayer()).toBe(scene.dragLayer);
    expect(forceUpdate).toHaveBeenCalledTimes(1);
    expect(unrelated.getLayer()).toBe(scene.mainLayer);

    target.absolutePosition({ x: 245, y: 180 });
    const movedPosition = target.getAbsolutePosition();
    expect(restoreStudioSingleObjectDragLayer(session)).toBe(true);
    expect(target.getLayer()).toBe(scene.mainLayer);
    expect(transformer.getLayer()).toBe(scene.mainLayer);
    expect(forceUpdate).toHaveBeenCalledTimes(2);
    expect(target.getAbsolutePosition()).toEqual(movedPosition);
    expect([...scene.mainLayer.getChildren()]).toEqual(originalOrder);
    expect(restoreStudioSingleObjectDragLayer(session)).toBe(false);
  });

  it("keeps grouped and backdrop-sensitive movement on the authoritative main Layer", () => {
    const target = addSelectedNode(scene.mainLayer);

    expect(beginStudioSingleObjectDragLayer({
      target,
      selectedElementId: "object-1",
      selectionSize: 2,
      mainLayer: scene.mainLayer,
      dragLayer: scene.dragLayer,
      selectedIsDraw: false,
      hasMaskOrClip: false,
    })).toBeNull();
    expect(beginStudioSingleObjectDragLayer({
      target,
      selectedElementId: "object-1",
      selectionSize: 1,
      mainLayer: scene.mainLayer,
      dragLayer: scene.dragLayer,
      layerSensitiveComposite: true,
      selectedIsDraw: false,
      hasMaskOrClip: false,
    })).toBeNull();
    expect(target.getLayer()).toBe(scene.mainLayer);
  });

  it("does not lift an unselected node or a Transformer anchor descendant", () => {
    const target = addSelectedNode(scene.mainLayer);
    const transformer = new studioKonvaRuntime.Transformer();
    scene.mainLayer.add(transformer);
    transformer.nodes([target]);
    const anchor = transformer.findOne(".top-left");

    expect(beginStudioSingleObjectDragLayer({
      target,
      selectedElementId: "another-object",
      selectionSize: 1,
      mainLayer: scene.mainLayer,
      dragLayer: scene.dragLayer,
      selectedIsDraw: false,
      hasMaskOrClip: false,
    })).toBeNull();
    if (anchor) {
      expect(beginStudioSingleObjectDragLayer({
        target: anchor,
        selectedElementId: "object-1",
        selectionSize: 1,
        mainLayer: scene.mainLayer,
        dragLayer: scene.dragLayer,
        selectedIsDraw: false,
        hasMaskOrClip: false,
      })).toBeNull();
    }
  });

  it("leaves draw and parent-clipped nodes on the main Layer", () => {
    const draw = addSelectedNode(scene.mainLayer, "draw-1");
    expect(beginStudioSingleObjectDragLayer({
      target: draw,
      selectedElementId: "draw-1",
      selectionSize: 1,
      mainLayer: scene.mainLayer,
      dragLayer: scene.dragLayer,
      selectedIsDraw: true,
      hasMaskOrClip: false,
    })).toBeNull();

    const wrapper = new studioKonvaRuntime.Group();
    const clipped = new studioKonvaRuntime.Group({ draggable: true });
    clipped.setAttr("studioElementId", "clipped-1");
    wrapper.add(clipped);
    scene.mainLayer.add(wrapper);
    expect(beginStudioSingleObjectDragLayer({
      target: clipped,
      selectedElementId: "clipped-1",
      selectionSize: 1,
      mainLayer: scene.mainLayer,
      dragLayer: scene.dragLayer,
      selectedIsDraw: false,
      hasMaskOrClip: false,
    })).toBeNull();
    expect(clipped.getLayer()).toBe(scene.mainLayer);
  });

  it("keeps document-local bounds stable under Stage pan and zoom", () => {
    scene.stage.position({ x: 93, y: -41 });
    scene.stage.scale({ x: 1.75, y: 1.75 });
    const target = addSelectedNode(scene.mainLayer);
    const peer = new studioKonvaRuntime.Rect({ x: 180, y: 145, width: 70, height: 55 });
    scene.mainLayer.add(peer);

    const session = beginStudioSingleObjectDragLayer({
      target,
      selectedElementId: "object-1",
      selectionSize: 1,
      mainLayer: scene.mainLayer,
      dragLayer: scene.dragLayer,
      selectedIsDraw: false,
      hasMaskOrClip: false,
    });

    expect(session).not.toBeNull();
    expect(target.getClientRect({ relativeTo: target.getLayer()! })).toMatchObject({
      x: 20,
      y: 30,
      width: 40,
      height: 25,
    });
    expect(peer.getClientRect({ relativeTo: peer.getLayer()! })).toMatchObject({
      x: 180,
      y: 145,
      width: 70,
      height: 55,
    });

    const beforeRestore = target.getAbsolutePosition();
    restoreStudioSingleObjectDragLayer(session);
    expect(target.getAbsolutePosition()).toEqual(beforeRestore);
    expect(target.getClientRect({ relativeTo: scene.mainLayer })).toMatchObject({
      x: 20,
      y: 30,
      width: 40,
      height: 25,
    });
  });

  it("restores before the element commit and keeps Stage fallbacks wired", () => {
    const patchWrapperStart = studioCanvasViewportSource.indexOf(
      "function patchElementAfterDragRestore(id: string, patch: Partial<El>)",
    );
    const patchWrapperEnd = studioCanvasViewportSource.indexOf(
      "function beginSingleObjectDragLayer",
      patchWrapperStart,
    );
    const patchWrapper = studioCanvasViewportSource.slice(
      patchWrapperStart,
      patchWrapperEnd,
    );

    expect(patchWrapperStart).toBeGreaterThan(-1);
    expect(patchWrapper.indexOf("restoreSingleObjectDragLayer();")).toBeLessThan(
      patchWrapper.indexOf("patchEl(id, patch);")
    );
    expect(studioCanvasViewportSource).toContain(
      "onDragStart={beginSingleObjectDragLayer}",
    );
    expect(studioCanvasViewportSource).toContain(
      "onDragEnd={finishSingleObjectDragLayer}",
    );
    expect(studioCanvasViewportSource).toContain(
      "onPointerCancel={cancelSingleObjectDragLayer}",
    );
    expect(studioCanvasViewportSource).toContain(
      'name="studio-single-object-drag-layer"',
    );
    expect(studioCanvasViewportSource).not.toContain(
      'name="studio-single-object-drag-layer" listening={false}',
    );
  });
});

describe("single-draw transform gesture Layer lift", () => {
  function addTransformScene() {
    const wrapper = addSelectedNode(scene.mainLayer, "stroke-1");
    const proxy = new studioKonvaRuntime.Rect({ x: 10, y: 20, width: 100, height: 50 });
    scene.mainLayer.add(proxy);
    const transformer = new studioKonvaRuntime.Transformer();
    scene.mainLayer.add(transformer);
    transformer.nodes([proxy]);
    return { wrapper, proxy, transformer };
  }

  it("lifts stroke, proxy and Transformer together and restores order and position", () => {
    const unrelated = new studioKonvaRuntime.Group();
    scene.mainLayer.add(unrelated);
    const { wrapper, proxy, transformer } = addTransformScene();
    const originalOrder = [...scene.mainLayer.getChildren()];

    const session = beginStudioSingleDrawTransformLayer({
      elementId: "stroke-1",
      wrapper,
      proxy,
      transformer,
      dragLayer: scene.dragLayer,
    });

    expect(session).not.toBeNull();
    expect(wrapper.getLayer()).toBe(scene.dragLayer);
    expect(proxy.getLayer()).toBe(scene.dragLayer);
    expect(transformer.getLayer()).toBe(scene.dragLayer);
    expect(unrelated.getLayer()).toBe(scene.mainLayer);

    expect(restoreStudioSingleObjectDragLayer(session)).toBe(true);
    expect(wrapper.getLayer()).toBe(scene.mainLayer);
    expect(proxy.getLayer()).toBe(scene.mainLayer);
    expect(transformer.getLayer()).toBe(scene.mainLayer);
    expect([...scene.mainLayer.getChildren()]).toEqual(originalOrder);
  });

  it("refuses a stroke whose backdrop-sensitive composite lives on a DESCENDANT shape", () => {
    // StudioDrawNode hangs globalCompositeOperation on the shapes it emits — a highlighter's
    // multiply passes are children of the wrapper, not the wrapper itself. Lifting those onto an
    // empty Layer would blend them against transparency instead of the artwork underneath.
    const { wrapper, proxy, transformer } = addTransformScene();
    const paint = new studioKonvaRuntime.Group();
    const multiplyPass = new studioKonvaRuntime.Rect({ width: 10, height: 10 });
    multiplyPass.setAttr("globalCompositeOperation", "multiply");
    paint.add(multiplyPass);
    wrapper.add(paint);

    expect(
      beginStudioSingleDrawTransformLayer({
        elementId: "stroke-1",
        wrapper,
        proxy,
        transformer,
        dragLayer: scene.dragLayer,
      }),
    ).toBeNull();
    expect(wrapper.getLayer()).toBe(scene.mainLayer);

    // A plain source-over descendant must still lift — the guard rejects blending, not depth.
    multiplyPass.setAttr("globalCompositeOperation", "source-over");
    expect(
      beginStudioSingleDrawTransformLayer({
        elementId: "stroke-1",
        wrapper,
        proxy,
        transformer,
        dragLayer: scene.dragLayer,
      }),
    ).not.toBeNull();
  });

  it("never re-adds a node React destroyed or re-parented mid-gesture", () => {
    const { wrapper, proxy, transformer } = addTransformScene();
    const session = beginStudioSingleDrawTransformLayer({
      elementId: "stroke-1",
      wrapper,
      proxy,
      transformer,
      dragLayer: scene.dragLayer,
    });
    expect(session).not.toBeNull();

    // What react-konva's removeChild does when a collaborator deletes the stroke mid-gesture.
    wrapper.destroy();
    expect(restoreStudioSingleObjectDragLayer(session)).toBe(true);

    // The zombie must not come back as a main-Layer child carrying studioElementId.
    const strokeChildren = scene.mainLayer
      .getChildren()
      .filter((node) => (node as Konva.Node).getAttr("studioElementId") === "stroke-1");
    expect(strokeChildren).toEqual([]);
    // Its gesture chrome still returns home.
    expect(proxy.getLayer()).toBe(scene.mainLayer);
    expect(transformer.getLayer()).toBe(scene.mainLayer);
  });

  it("refuses without a drag Layer, for clipped wrappers, and for backdrop-sensitive strokes", () => {
    const { wrapper, proxy, transformer } = addTransformScene();

    expect(
      beginStudioSingleDrawTransformLayer({
        elementId: "stroke-1",
        wrapper,
        proxy,
        transformer,
        dragLayer: null,
      }),
    ).toBeNull();

    // 지우개(destination-out)는 문서 backdrop이 필요하므로 리프트 금지 — 오늘의 동작 유지.
    wrapper.setAttr("globalCompositeOperation", "destination-out");
    expect(
      beginStudioSingleDrawTransformLayer({
        elementId: "stroke-1",
        wrapper,
        proxy,
        transformer,
        dragLayer: scene.dragLayer,
      }),
    ).toBeNull();
    wrapper.setAttr("globalCompositeOperation", undefined);

    // 패널 클립 래퍼(레이어 직계가 아님)도 리프트 금지.
    const clipGroup = new studioKonvaRuntime.Group({ clipX: 0, clipY: 0, clipWidth: 10, clipHeight: 10 });
    scene.mainLayer.add(clipGroup);
    wrapper.moveTo(clipGroup);
    expect(
      beginStudioSingleDrawTransformLayer({
        elementId: "stroke-1",
        wrapper,
        proxy,
        transformer,
        dragLayer: scene.dragLayer,
      }),
    ).toBeNull();
    expect(wrapper.getLayer()).toBe(scene.mainLayer);
  });

  it("refuses a concurrent wrapper drag while the preview owns the node, in both drag phases", () => {
    // The wrapper's drag-end bakes `event.target.x()/y()` into `points` as a DELTA, but a live
    // preview parks the gesture's ABSOLUTE target origin there. A second finger dragging the
    // stroke body while the first holds an anchor would otherwise commit that projection as a
    // document translation. Source-scanned: the guard lives in the document layer's JSX.
    const drawWrapperStart = studioCanvasViewportSource.indexOf(
      "onDragStart={(event) => {",
    );
    const drawWrapperEnd = studioCanvasViewportSource.indexOf(
      "<StudioDrawNode",
      drawWrapperStart,
    );
    expect(drawWrapperStart).toBeGreaterThan(-1);
    expect(drawWrapperEnd).toBeGreaterThan(drawWrapperStart);
    const dragHandlers = studioCanvasViewportSource.slice(drawWrapperStart, drawWrapperEnd);

    // Both phases guard, and the bake stays behind the guard.
    expect(
      dragHandlers.split("STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR").length - 1,
    ).toBe(2);
    expect(
      dragHandlers.lastIndexOf("STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR"),
    ).toBeLessThan(dragHandlers.indexOf("patchEl(el.id, {"));
    expect(dragHandlers).toContain("event.target.stopDrag();");
  });

  it("gates translation mirrors while the preview-active attr is set and resumes after", () => {
    const { wrapper } = addTransformScene();
    const applied: Array<{ x: number; y: number }> = [];
    const detach = mirrorStudioDrawElementTranslation(scene.stage, "stroke-1", (offset) => {
      applied.push(offset);
    });
    expect(applied).toHaveLength(1); // immediate sync on subscribe

    wrapper.setAttr(STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR, true);
    wrapper.position({ x: 140, y: 90 });
    expect(applied).toHaveLength(1); // preview frames are not drag offsets

    wrapper.setAttr(STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR, undefined);
    wrapper.position({ x: 0, y: 0 });
    expect(applied.length).toBeGreaterThan(1);
    expect(applied.at(-1)).toEqual({ x: 0, y: 0 });
    detach();
  });
});
