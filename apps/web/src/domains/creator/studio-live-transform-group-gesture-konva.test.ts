// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { studioKonvaRuntime } from "./render/studio-konva-runtime";
import { planStudioGroupUniformResizeSelection } from "./studio-group-uniform-resize";
import { createStudioLiveTransformDraftStore } from "./studio-live-transform-draft-store";
import { beginStudioKonvaGroupDrawTransformGesture } from "./studio-live-transform-group-gesture-konva";
import { STUDIO_LIVE_TRANSFORM_WIREFRAME_FALLBACK_NAME } from "./studio-live-transform-wireframe-fallback-konva";
import { STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR } from "./studio-selection-chrome-mirror";

import type { DrawEl, El } from "./studio-element-model";
import type { StudioLiveTransformPreviewScheduler } from "./studio-live-transform-preview-session";
import type Konva from "konva";

function installCanvasContextStub(): () => void {
  const prototype = globalThis.HTMLCanvasElement.prototype as unknown as { getContext: unknown };
  const original = prototype.getContext;
  prototype.getContext = () =>
    new Proxy(
      {
        canvas: null,
        getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
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

const draftScope = "page:page-1";
const sourceBounds = { x: 0, y: 0, width: 200, height: 100 };

function stroke(id: string, points: readonly number[]): DrawEl {
  return {
    id,
    type: "draw",
    kind: "freehand",
    points: [...points],
    stroke: "#16100c",
    strokeWidth: 4,
    // Both are required by the exact-draft eligibility gate: an audited engine and a stored
    // sample spacing. "pen" is causal-ink.
    brush: "pen",
    sampleSpacing: 2,
  } as unknown as DrawEl;
}

const first = stroke("stroke-a", [0, 0, 80, 60]);
const second = stroke("stroke-b", [120, 40, 200, 100]);

interface Scene {
  readonly container: HTMLDivElement;
  readonly stage: Konva.Stage;
  readonly mainLayer: Konva.Layer;
  readonly dragLayer: Konva.Layer;
  readonly wrappers: Map<string, Konva.Group>;
  readonly proxy: Konva.Rect;
  readonly transformer: Konva.Transformer;
}

let restoreCanvas: () => void;
let scene: Scene;

function createScene(elements: readonly DrawEl[]): Scene {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const stage = new studioKonvaRuntime.Stage({ container, width: 720, height: 1020 });
  const mainLayer = new studioKonvaRuntime.Layer();
  const dragLayer = new studioKonvaRuntime.Layer();
  const draftRoot = new studioKonvaRuntime.Group({ listening: false });
  draftRoot.name("studio-live-transform-draft-root");
  dragLayer.add(draftRoot);
  stage.add(mainLayer, dragLayer);

  const wrappers = new Map<string, Konva.Group>();
  for (const element of elements) {
    const wrapper = new studioKonvaRuntime.Group({ draggable: true });
    wrapper.setAttr("studioElementId", element.id);
    wrapper.add(new studioKonvaRuntime.Line({ points: element.points, stroke: "#000" }));
    mainLayer.add(wrapper);
    wrappers.set(element.id, wrapper);
  }
  const proxy = new studioKonvaRuntime.Rect(sourceBounds);
  const transformer = new studioKonvaRuntime.Transformer();
  mainLayer.add(proxy, transformer);
  transformer.nodes([proxy]);
  return { container, stage, mainLayer, dragLayer, wrappers, proxy, transformer };
}

beforeEach(() => {
  restoreCanvas = installCanvasContextStub();
  scene = createScene([first, second]);
});

afterEach(() => {
  scene.stage.destroy();
  scene.container.remove();
  restoreCanvas();
});

function begin(options: {
  selection?: readonly El[];
  elements?: readonly El[];
  store?: ReturnType<typeof createStudioLiveTransformDraftStore>;
  isLocked?: (element: El) => boolean;
} = {}) {
  const clock = manualScheduler();
  const store = options.store ?? createStudioLiveTransformDraftStore();
  const gesture = beginStudioKonvaGroupDrawTransformGesture({
    preview: {
      scope: draftScope,
      selection: options.selection ?? [first, second],
      elements: options.elements ?? [first, second],
      dragLayer: scene.dragLayer,
      draftStore: store,
      scheduler: clock.scheduler,
      isLocked: options.isLocked ?? (() => false),
    },
    sourceBounds,
    stage: scene.stage,
    proxy: scene.proxy,
    transformer: scene.transformer,
  });
  return { gesture, store, clock };
}

const frame = { targetBounds: { x: 20, y: 30, width: 400, height: 200 }, rotationDeg: 0 };

function fallbackRoot(): Konva.Node | null {
  return scene.stage.findOne(`.${STUDIO_LIVE_TRANSFORM_WIREFRAME_FALLBACK_NAME}`) ?? null;
}

describe("beginStudioKonvaGroupDrawTransformGesture", () => {
  it("draws the commit planner's own output for every selected stroke", () => {
    const { gesture, store, clock } = begin();
    expect(gesture).not.toBeNull();
    gesture!.offer(frame);
    clock.flush();

    const expected = planStudioGroupUniformResizeSelection({
      items: [first, second],
      selectedIds: [first.id, second.id],
      sourceBounds,
      targetBounds: frame.targetBounds,
      isLocked: () => false,
    });
    const snapshot = store.getSnapshot();
    expect(snapshot?.scope).toBe(draftScope);
    expect(snapshot?.entries.map((entry) => entry.element)).toEqual(expected);
    // Both authoritative wrappers give up their pixels together; a half-hidden selection would
    // show one stroke following the handles and one standing still.
    expect(scene.wrappers.get(first.id)!.visible()).toBe(false);
    expect(scene.wrappers.get(second.id)!.visible()).toBe(false);
    gesture!.close({ kind: "cancel", reason: "escape" });
    expect(scene.wrappers.get(first.id)!.visible()).toBe(true);
    expect(scene.wrappers.get(second.id)!.visible()).toBe(true);
    expect(store.getSnapshot()).toBeNull();
  });

  it("preserves stroke width, the way the group commit does", () => {
    // This is the whole reason the group lane refuses a retained affine: doubling the box must
    // not thicken the ink, because release will not thicken it either.
    const { gesture, store, clock } = begin();
    gesture!.offer(frame);
    clock.flush();
    for (const entry of store.getSnapshot()?.entries ?? []) {
      expect(entry.element.strokeWidth).toBe(4);
    }
    gesture!.close({ kind: "cancel", reason: "escape" });
  });

  it("degrades unsupported members to one continuous bounded guide", () => {
    const unaudited = { ...stroke("stroke-c", [0, 0, 10, 10]), brush: "dry-media" } as DrawEl;
    scene.stage.destroy();
    scene.container.remove();
    scene = createScene([first, unaudited]);
    const dry = begin({ selection: [first, unaudited], elements: [first, unaudited] });
    expect(dry.gesture).not.toBeNull();
    dry.gesture!.offer(frame);
    dry.clock.flush();
    expect(dry.store.getSnapshot()).toBeNull();
    expect(fallbackRoot()?.visible()).toBe(true);
    expect(scene.wrappers.get(first.id)!.visible()).toBe(true);
    expect(scene.wrappers.get(first.id)!.opacity()).toBeLessThan(1);
    dry.gesture!.close({ kind: "cancel", reason: "escape" });
    expect(scene.wrappers.get(first.id)!.opacity()).toBe(1);

    // Subtractive ink cannot be isolated faithfully, but it still receives a source-over guide
    // instead of leaving the handles to move over motionless artwork.
    const eraser = { ...stroke("stroke-d", [0, 0, 10, 10]), mode: "eraser" } as DrawEl;
    scene.stage.destroy();
    scene.container.remove();
    scene = createScene([first, eraser]);
    const erase = begin({ selection: [first, eraser], elements: [first, eraser] });
    expect(erase.gesture).not.toBeNull();
    erase.gesture!.offer(frame);
    erase.clock.flush();
    expect(erase.store.getSnapshot()).toBeNull();
    expect(fallbackRoot()?.visible()).toBe(true);
    erase.gesture!.close({ kind: "cancel", reason: "escape" });

    // A locked member is a durable-commit restriction, not merely a renderer restriction.
    scene.stage.destroy();
    scene.container.remove();
    scene = createScene([first, second]);
    expect(begin({ isLocked: (element) => element.id === second.id }).gesture).toBeNull();
  });

  it("keeps authored stacking and uses the guide when exact isolation would reorder paint", () => {
    const cover = new studioKonvaRuntime.Rect({ x: 0, y: 0, width: 50, height: 50, fill: "#fff" });
    scene.mainLayer.add(cover);
    cover.moveToTop();
    const blocked = begin();
    expect(blocked.gesture).not.toBeNull();
    blocked.gesture!.offer(frame);
    blocked.clock.flush();
    expect(blocked.store.getSnapshot()).toBeNull();
    expect(fallbackRoot()?.visible()).toBe(true);
    expect(cover.getLayer()).toBe(scene.mainLayer);
    expect(scene.wrappers.get(first.id)!.getLayer()).toBe(scene.mainLayer);
    blocked.gesture!.close({ kind: "cancel", reason: "escape" });

    cover.destroy();
    // With nothing painting above it the same selection keeps the commit-equivalent exact lane.
    const exact = begin();
    exact.gesture!.offer(frame);
    exact.clock.flush();
    expect(exact.store.getSnapshot()?.entries).toHaveLength(2);
    expect(fallbackRoot()?.visible()).toBe(false);
    exact.gesture!.close({ kind: "cancel", reason: "escape" });
  });

  it("previews a rotated frame with what the rotating commit will produce", () => {
    const { gesture, store, clock } = begin();
    gesture!.offer({ targetBounds: frame.targetBounds, rotationDeg: 30 });
    clock.flush();
    const expected = planStudioGroupUniformResizeSelection({
      items: [first, second],
      selectedIds: [first.id, second.id],
      sourceBounds,
      targetBounds: frame.targetBounds,
      rotationDeg: 30,
      isLocked: () => false,
    });
    expect(expected).not.toBeNull();
    expect((store.getSnapshot()?.entries ?? []).map((entry) => entry.element)).toEqual(expected);
    expect(scene.wrappers.get(first.id)!.visible()).toBe(false);
    gesture!.close({ kind: "cancel", reason: "escape" });
  });

  it("marks and clears the preview-active attr on every member", () => {
    const { gesture } = begin();
    for (const wrapper of scene.wrappers.values()) {
      expect(wrapper.getAttr(STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR)).toBe(true);
    }
    gesture!.close({ kind: "cancel", reason: "escape" });
    for (const wrapper of scene.wrappers.values()) {
      expect(wrapper.getAttr(STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR)).toBeUndefined();
    }
  });

  it("holds the writer lease until the authoritative document receipt lands", () => {
    const { gesture, store, clock } = begin();
    gesture!.offer(frame);
    clock.flush();
    const drafted = (store.getSnapshot()?.entries ?? []).map((entry) => entry.element);
    expect(drafted).toHaveLength(2);

    gesture!.close({ kind: "commit", terminalFrame: frame });
    // Registration alone is not settlement: the sources stay hidden and the lease stays held.
    expect(gesture!.settle?.({ kind: "commit", committed: true })).toBe(false);
    expect(store.getSnapshot()?.phase).toBe("handoff");
    expect(scene.wrappers.get(second.id)!.visible()).toBe(false);

    // A partial receipt must not retire the pair.
    expect(store.acknowledgeAuthoritative(draftScope, [drafted[0]!])).toBe(false);
    expect(store.getSnapshot()?.phase).toBe("handoff");

    expect(store.acknowledgeAuthoritative(draftScope, drafted)).toBe(true);
    expect(store.getSnapshot()).toBeNull();
    expect(scene.wrappers.get(first.id)!.visible()).toBe(true);
    expect(scene.wrappers.get(second.id)!.visible()).toBe(true);
    expect(gesture!.settle?.({ kind: "commit", committed: true })).toBe(true);
  });

  it("degrades once at the shared frame budget and never flickers back", () => {
    const line = (id: string, y: number): DrawEl => {
      const points: number[] = [];
      for (let index = 0; index < 100; index += 1) points.push(index * 2, y);
      return stroke(id, points);
    };
    const trio = [line("line-a", 0), line("line-b", 40), line("line-c", 80)];
    scene.stage.destroy();
    scene.container.remove();
    scene = createScene(trio);
    const { gesture, store, clock } = begin({ selection: trio, elements: trio });
    expect(gesture).not.toBeNull();

    // Near identity stays on the exact commit-equivalent lane.
    const small = { targetBounds: { x: 0, y: 0, width: 210, height: 105 }, rotationDeg: 0 };
    gesture!.offer(small);
    clock.flush();
    expect(store.getSnapshot()?.entries).toHaveLength(3);
    expect(trio.every((element) => scene.wrappers.get(element.id)!.visible() === false)).toBe(true);

    // 3.5x exceeds only the aggregate budget. The old code restored stationary sources and
    // removed every moving pixel; the new code atomically switches to the bounded guide.
    const large = { targetBounds: { x: 0, y: 0, width: 700, height: 350 }, rotationDeg: 0 };
    gesture!.offer(large);
    clock.flush();
    expect(store.getSnapshot()).toBeNull();
    expect(fallbackRoot()?.visible()).toBe(true);
    expect(trio.every((element) => scene.wrappers.get(element.id)!.visible())).toBe(true);
    expect(trio.every((element) => scene.wrappers.get(element.id)!.opacity() < 1)).toBe(true);

    // Crossing back under the threshold cannot switch renderer authority again inside the same
    // gesture. That latch removes the previous off/on threshold flicker.
    gesture!.offer(small);
    clock.flush();
    expect(store.getSnapshot()).toBeNull();
    expect(fallbackRoot()?.visible()).toBe(true);
    gesture!.close({ kind: "cancel", reason: "escape" });
    expect(trio.every((element) => scene.wrappers.get(element.id)!.opacity() === 1)).toBe(true);
  });

  it("paints the draft in document order however the selection was made", () => {
    // A layer-navigator range selection arrives front-to-back. Following it would put the lower
    // stroke on top of its neighbour for the whole drag and drop it back at release -- and it
    // would break the exemption the stacking gate grants the selection over itself.
    const { gesture, store, clock } = begin({ selection: [second, first] });
    expect(gesture).not.toBeNull();
    gesture!.offer(frame);
    clock.flush();
    expect((store.getSnapshot()?.entries ?? []).map((entry) => entry.element.id))
      .toEqual([first.id, second.id]);
    gesture!.close({ kind: "cancel", reason: "escape" });
  });

  it("charges each member its own fill, not a copy of the selection box", () => {
    // The area sum must mean "what this frame shades", not "the union counted once per member".
    // Three ordinary brush strokes spread over a wide box are exactly the case that broke when the
    // selection box was charged N times; the same three collapsed into one corner must still pass.
    const brush = (id: string, x: number, y: number): DrawEl => ({
      ...stroke(id, [x, y, x + 60, y + 40, x + 120, y + 20]),
      brush: "brush",
      strokeWidth: 12,
    } as DrawEl);
    const spread = [brush("b-a", 0, 0), brush("b-b", 240, 180), brush("b-c", 480, 360)];
    scene.stage.destroy();
    scene.container.remove();
    scene = createScene(spread);
    const { gesture, store, clock } = begin({ selection: spread, elements: spread });
    expect(gesture).not.toBeNull();
    // A uniform 1.5x of the fixture's source box; the members sit far apart inside it, which is
    // exactly the shape that failed when each was charged the union rather than its own fill.
    gesture!.offer({ targetBounds: { x: 0, y: 0, width: 300, height: 150 }, rotationDeg: 0 });
    clock.flush();
    expect(store.getSnapshot()?.entries).toHaveLength(3);
    gesture!.close({ kind: "cancel", reason: "escape" });
  });

  it("keeps large selections live without entering the unbounded exact compiler", () => {
    const many = Array.from({ length: 65 }, (_, index) =>
      stroke(`bulk-${index}`, [index, 0, index + 5, 5]));
    scene.stage.destroy();
    scene.container.remove();
    scene = createScene(many);
    const selectionBudget = begin({ selection: many, elements: many });
    expect(selectionBudget.gesture).not.toBeNull();
    selectionBudget.gesture!.offer(frame);
    selectionBudget.clock.flush();
    expect(selectionBudget.store.getSnapshot()).toBeNull();
    expect(fallbackRoot()?.visible()).toBe(true);
    selectionBudget.gesture!.close({ kind: "cancel", reason: "escape" });

    // A large page similarly avoids compiling every draw snapshot, while selected sources still
    // receive bounded visual feedback.
    const largeScene = [
      first,
      second,
      ...Array.from({ length: 2_047 }, (_, index) =>
        stroke(`scene-${index}`, [index, 0, index + 5, 5])),
    ];
    scene.stage.destroy();
    scene.container.remove();
    scene = createScene([first, second]);
    const sceneBudget = begin({ selection: [first, second], elements: largeScene });
    expect(sceneBudget.gesture).not.toBeNull();
    sceneBudget.gesture!.offer(frame);
    sceneBudget.clock.flush();
    expect(sceneBudget.store.getSnapshot()).toBeNull();
    expect(fallbackRoot()?.visible()).toBe(true);
    sceneBudget.gesture!.close({ kind: "cancel", reason: "escape" });
  });

  it("stands down when a selected id is not in the document snapshot", () => {
    // Document order is the authority, so an id the snapshot does not carry has no place to go.
    const ghost = stroke("ghost", [0, 0, 5, 5]);
    expect(begin({ selection: [first, ghost], elements: [first, second] }).gesture).toBeNull();
  });

  it("resumes a partially failed restore instead of stranding a member invisible", () => {
    // The one failure this lane must never produce is a stroke left invisible for the rest of the
    // session. A wrapper can be destroyed or detached mid-gesture, so one member throwing must not
    // decide anything for its neighbours, and the next restore has to pick up what is still owed.
    const { gesture, clock } = begin();
    gesture!.offer(frame);
    clock.flush();
    const hiddenA = scene.wrappers.get(first.id)!;
    const hiddenB = scene.wrappers.get(second.id)!;
    expect([hiddenA.visible(), hiddenB.visible()]).toEqual([false, false]);

    const original = hiddenB.visible.bind(hiddenB);
    let throwOnce = true;
    (hiddenB as unknown as { visible: (...args: unknown[]) => unknown }).visible = (
      ...args: unknown[]
    ) => {
      if (throwOnce && args[0] === true) {
        throwOnce = false;
        throw new Error("detached wrapper");
      }
      // Konva's accessor is getter-or-setter by arity, so the stub has to preserve that.
      return args.length === 0
        ? (original as () => boolean)()
        : (original as (value: boolean) => unknown)(args[0] as boolean);
    };

    // First restore: A comes back, B throws and stays owed.
    expect(() => gesture!.close({ kind: "cancel", reason: "escape" })).toThrow();
    expect(hiddenA.visible()).toBe(true);
    expect(hiddenB.visible()).toBe(false);

    // The retry finishes exactly the member still owed rather than short-circuiting on a flag.
    expect(() => gesture!.close({ kind: "cancel", reason: "escape" })).not.toThrow();
    expect(hiddenB.visible()).toBe(true);
  });

  it("needs at least two members; a single stroke belongs to the affine-capable lane", () => {
    expect(begin({ selection: [first] }).gesture).toBeNull();
    expect(begin({ selection: [first, first] }).gesture).toBeNull();
  });

  it("never mutates the document from a frame", () => {
    const items = [first, second];
    const snapshotBefore = JSON.stringify(items);
    const { gesture, clock } = begin({ elements: items });
    gesture!.offer(frame);
    clock.flush();
    gesture!.close({ kind: "cancel", reason: "escape" });
    expect(JSON.stringify(items)).toBe(snapshotBefore);
  });

  it("reports a fatal renderer failure instead of leaving sources hidden", () => {
    const onFatalError = vi.fn();
    const clock = manualScheduler();
    const store = createStudioLiveTransformDraftStore();
    const gesture = beginStudioKonvaGroupDrawTransformGesture({
      preview: {
        scope: draftScope,
        selection: [first, second],
        elements: [first, second],
        dragLayer: scene.dragLayer,
        draftStore: store,
        scheduler: clock.scheduler,
        isLocked: () => false,
      },
      sourceBounds,
      stage: scene.stage,
      proxy: scene.proxy,
      transformer: scene.transformer,
      onFatalError,
    });
    expect(gesture).not.toBeNull();
    gesture!.offer(frame);
    clock.flush();
    expect(onFatalError).not.toHaveBeenCalled();
    gesture!.close({ kind: "cancel", reason: "escape" });
  });
});
