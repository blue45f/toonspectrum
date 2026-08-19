// @vitest-environment jsdom

/**
 * Drag/selection-chrome synchronisation contract for draw(선화) elements.
 *
 * The shipped build was measured dragging a selected stroke
 * (`tests/benchmarks/harness/drag-selection-sync.ts`): the dashed selection box stayed at the
 * pre-drag position for the entire gesture — 227px of divergence across a 233px drag, still 227px
 * after the pointer had been held still for 280ms. It was not a late frame, it was a box wired to
 * `el.points` (document state, frozen until drag end) while the ink followed the Konva wrapper's
 * imperative transform.
 *
 * These tests pin the fix against a *real* Konva scene graph rather than a mock: the wrapper is
 * moved exactly the way Konva's drag loop moves it (`node.x()` / `node.position()`), and the
 * indicator must land on the same offset within the same synchronous tick, with no React involved.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { studioKonvaRuntime } from "./studio-konva-runtime";
import {
  findStudioDrawWrapperNode,
  mirrorStudioDrawElementTranslation,
  mirrorStudioDrawSelectionIndicators,
} from "./studio-selection-chrome-mirror";

import type Konva from "konva";

/**
 * jsdom has no 2D context, and Konva builds one while constructing a Stage. Every method is a
 * no-op because nothing here asserts pixels — only scene-graph coordinates, which Konva computes
 * without touching the context.
 */
function installCanvasContextStub(): () => void {
  const prototype = globalThis.HTMLCanvasElement.prototype as unknown as {
    getContext: unknown;
  };
  const original = prototype.getContext;
  prototype.getContext = () =>
    new Proxy(
      { canvas: null },
      {
        get: (target: Record<string, unknown>, property: string) =>
          property in target ? target[property] : () => undefined,
        set: () => true,
      }
    );
  return () => {
    prototype.getContext = original;
  };
}

interface Scene {
  readonly stage: Konva.Stage;
  readonly layer: Konva.Layer;
  readonly container: HTMLDivElement;
}

function createScene(): Scene {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const stage = new studioKonvaRuntime.Stage({ container, width: 720, height: 1020 });
  const layer = new studioKonvaRuntime.Layer();
  stage.add(layer);
  return { stage, layer, container };
}

/**
 * Rebuilds the shipped node shape for one draw element: the draggable wrapper that Konva moves,
 * plus the non-listening inner group StudioDrawNode renders with the *same* `studioElementId`.
 */
function addDrawElement(layer: Konva.Layer, elementId: string): Konva.Group {
  const wrapper = new studioKonvaRuntime.Group({ x: 0, y: 0, draggable: true });
  wrapper.setAttr("studioElementId", elementId);
  const inner = new studioKonvaRuntime.Group({ x: 0, y: 0, listening: false });
  inner.setAttr("studioElementId", elementId);
  wrapper.add(inner);
  layer.add(wrapper);
  return wrapper;
}

function addIndicator(layer: Konva.Layer): Konva.Group {
  const indicator = new studioKonvaRuntime.Group({ x: 0, y: 0, listening: false });
  layer.add(indicator);
  return indicator;
}

/** Distance between the indicator's offset and the wrapper's offset, in document px. */
function driftPx(indicator: Konva.Group, wrapper: Konva.Group): number {
  return Math.hypot(indicator.x() - wrapper.x(), indicator.y() - wrapper.y());
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

describe("findStudioDrawWrapperNode", () => {
  it("resolves the draggable wrapper, not the inner StudioDrawNode group that shares the id", () => {
    const wrapper = addDrawElement(scene.layer, "draw-1");

    const found = findStudioDrawWrapperNode(scene.stage, "draw-1");

    expect(found).toBe(wrapper);
    expect(found?.draggable()).toBe(true);
  });

  it("returns null for an element that has no node in the scene", () => {
    addDrawElement(scene.layer, "draw-1");

    expect(findStudioDrawWrapperNode(scene.stage, "draw-missing")).toBeNull();
  });
});

describe("draw selection indicator follows its stroke during a drag", () => {
  it("keeps zero drift across every step of a drag, not just at the end", () => {
    const wrapper = addDrawElement(scene.layer, "draw-1");
    const indicator = addIndicator(scene.layer);

    const detach = mirrorStudioDrawSelectionIndicators(new Map([["draw-1", indicator]]));

    // Konva's drag loop assigns an absolute position per pointer frame; replay 40 of them on the
    // same 200x120 route the browser harness drives.
    const drifts: number[] = [];
    for (let frame = 1; frame <= 40; frame += 1) {
      const t = frame / 40;
      wrapper.position({ x: 200 * t, y: 120 * t });
      drifts.push(driftPx(indicator, wrapper));
    }

    expect(Math.max(...drifts)).toBe(0);
    expect(indicator.position()).toEqual({ x: 200, y: 120 });
    detach();
  });

  it("mirrors a single-axis move synchronously, before any draw is flushed", () => {
    const wrapper = addDrawElement(scene.layer, "draw-1");
    const indicator = addIndicator(scene.layer);
    const detach = mirrorStudioDrawSelectionIndicators(new Map([["draw-1", indicator]]));

    wrapper.x(37);
    // Same tick — no rAF, no React commit, no batchDraw in between.
    expect(indicator.x()).toBe(37);

    wrapper.y(-11);
    expect(indicator.y()).toBe(-11);
    detach();
  });

  it("tracks the wrapper reset that drag end performs before points are committed", () => {
    const wrapper = addDrawElement(scene.layer, "draw-1");
    const indicator = addIndicator(scene.layer);
    const detach = mirrorStudioDrawSelectionIndicators(new Map([["draw-1", indicator]]));

    wrapper.position({ x: 90, y: 45 });
    expect(driftPx(indicator, wrapper)).toBe(0);

    // StudioCanvasViewport's draw onDragEnd zeroes the wrapper and then patches points.
    wrapper.position({ x: 0, y: 0 });
    expect(indicator.position()).toEqual({ x: 0, y: 0 });
    detach();
  });

  it("mirrors every member of a marquee multi-selection, including ones moved by group preview", () => {
    const first = addDrawElement(scene.layer, "draw-1");
    const second = addDrawElement(scene.layer, "draw-2");
    const firstIndicator = addIndicator(scene.layer);
    const secondIndicator = addIndicator(scene.layer);

    const detach = mirrorStudioDrawSelectionIndicators(
      new Map([
        ["draw-1", firstIndicator],
        ["draw-2", secondIndicator],
      ])
    );

    // The dragged anchor moves through Konva's drag loop...
    first.position({ x: 60, y: 20 });
    // ...and StudioPage's translateGroupPreview shifts the other members imperatively.
    second.x(second.x() + 60);
    second.y(second.y() + 20);

    expect(driftPx(firstIndicator, first)).toBe(0);
    expect(driftPx(secondIndicator, second)).toBe(0);
    detach();
  });

  it("stops mirroring after cleanup so a stale indicator can never be moved", () => {
    const wrapper = addDrawElement(scene.layer, "draw-1");
    const indicator = addIndicator(scene.layer);

    const detach = mirrorStudioDrawSelectionIndicators(new Map([["draw-1", indicator]]));
    wrapper.position({ x: 25, y: 25 });
    detach();

    wrapper.position({ x: 400, y: 400 });

    expect(indicator.position()).toEqual({ x: 25, y: 25 });
  });

  it("leaves unrelated listeners on the wrapper untouched when it detaches", () => {
    const wrapper = addDrawElement(scene.layer, "draw-1");
    const indicator = addIndicator(scene.layer);
    let productListenerCalls = 0;
    wrapper.on("xChange", () => {
      productListenerCalls += 1;
    });

    const detach = mirrorStudioDrawSelectionIndicators(new Map([["draw-1", indicator]]));
    detach();
    wrapper.x(12);

    expect(productListenerCalls).toBe(1);
    expect(indicator.x()).toBe(0);
  });

  it("skips elements with no node in the scene instead of throwing", () => {
    const indicator = addIndicator(scene.layer);

    const detach = mirrorStudioDrawSelectionIndicators(new Map([["draw-missing", indicator]]));

    expect(indicator.position()).toEqual({ x: 0, y: 0 });
    expect(detach).not.toThrow();
  });
});

/**
 * The free-scale handle frame is a *second*, independent piece of chrome on a selected stroke: a
 * Transformer bound to an invisible proxy Rect rather than to the object, so Konva's own drag
 * proxying never reaches it. It was measured 227px out of sync for the whole gesture, exactly like
 * the dashed indicator, and needs the same mirror.
 */
describe("free-scale handle frame follows its stroke during a drag", () => {
  it("offsets the proxy box by the wrapper's live translation", () => {
    const wrapper = addDrawElement(scene.layer, "draw-1");
    const bounds = { x: 12, y: 34 };
    const applied: Array<{ x: number; y: number }> = [];

    const detach = mirrorStudioDrawElementTranslation(scene.stage, "draw-1", (offset) => {
      applied.push({ x: bounds.x + offset.x, y: bounds.y + offset.y });
    });

    wrapper.position({ x: 100, y: 50 });

    // First entry is the immediate sync at subscribe time, so chrome mounted mid-gesture is
    // never a frame behind; the last is the live drag position.
    expect(applied[0]).toEqual({ x: 12, y: 34 });
    expect(applied.at(-1)).toEqual({ x: 112, y: 84 });
    detach();
  });

  it("reports every intermediate drag frame, not just the final position", () => {
    const wrapper = addDrawElement(scene.layer, "draw-1");
    const offsets: Array<{ x: number; y: number }> = [];
    const detach = mirrorStudioDrawElementTranslation(scene.stage, "draw-1", (offset) => {
      offsets.push(offset);
    });

    for (let frame = 1; frame <= 5; frame += 1) {
      wrapper.position({ x: frame * 10, y: frame * 4 });
    }

    // One immediate sync plus x/y changes per frame; the sequence must end on the true position.
    expect(offsets.at(-1)).toEqual({ x: 50, y: 20 });
    expect(offsets.length).toBeGreaterThanOrEqual(6);
    detach();
  });

  it("returns a no-op unsubscribe when the element is not in the scene", () => {
    const applied: Array<{ x: number; y: number }> = [];

    const detach = mirrorStudioDrawElementTranslation(scene.stage, "draw-missing", (offset) =>
      applied.push(offset),
    );

    expect(applied).toEqual([]);
    expect(detach).not.toThrow();
  });
});
