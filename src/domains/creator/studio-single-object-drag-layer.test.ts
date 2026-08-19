// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import studioCanvasViewportSource from "./canvas/StudioCanvasViewport.tsx?raw";
import { studioKonvaRuntime } from "./render/studio-konva-runtime";
import {
  beginStudioSingleObjectDragLayer,
  restoreStudioSingleObjectDragLayer,
} from "./studio-single-object-drag-layer";

import type Konva from "konva";

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
