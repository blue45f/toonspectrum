// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultStudioAppSettings } from "../studio-app-settings";
import { bindStudioCuttoonStagePointersDown } from "../studio-cuttoon-editor/studio-cuttoon-stage-pointers-down";
import { bindStudioCuttoonStagePointersDownArmed } from "../studio-cuttoon-editor/studio-cuttoon-stage-pointers-down-armed";
import { bindStudioCuttoonStagePointersFinish } from "../studio-cuttoon-editor/studio-cuttoon-stage-pointers-finish";
import { bindStudioCuttoonStagePointersMove } from "../studio-cuttoon-editor/studio-cuttoon-stage-pointers-move";
import { bindStudioCuttoonStagePointersUp } from "../studio-cuttoon-editor/studio-cuttoon-stage-pointers-up";
import { buildStudioShortcutHandler } from "../studio-page-shortcut-dispatcher";
import { useStudioVectorNodeBubbleEdit } from "./studio-node-bubble-edit-controller";

import type { StudioCuttoonStagePointersApi } from "../studio-cuttoon-editor/studio-cuttoon-stage-pointers-api";
import type { StudioCuttoonStagePointersHost } from "../studio-cuttoon-editor/studio-cuttoon-stage-pointers-types";
import type { DrawEl } from "../studio-element-model";
import type { StudioShortcutHandlerContext } from "../studio-page-shortcut-dispatcher";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function fixture() {
  const selected: DrawEl = {
    id: "shape", type: "draw", kind: "freehand", mode: "pen", brush: "pen",
    points: [10, 20, 80, 20, 100, 40], pressures: [0.2, 0.5, 0.8],
    stroke: "#123456", strokeWidth: 4,
  };
  const hook = renderHook(({ selectedId }) => useStudioVectorNodeBubbleEdit({ selectedId }), {
    initialProps: { selectedId: selected.id },
  });
  const target = document.createElement("canvas");
  const capture = vi.fn(), release = vi.fn();
  target.setPointerCapture = capture;
  target.releasePointerCapture = release;
  const patchEl = vi.fn(() => true);
  const elementById = new Map([[selected.id, selected]]);
  const hostValues: Record<string, unknown> = {
    ...hook.result.current, selected, elementById, elements: [selected], groups: [],
    nodeEditTool: "move", nodeEditArmed: true, effScale: 1,
    nodeEditHandles: [{ pointIndex: 0, x: 10, y: 20 }],
    patchEl, tool: "select", recentColors: [], isExporting: true,
    drawingPointerTransportRef: { current: { getSession: () => null, consumeHandledNativeEnd: () => false } },
    liquifyHandledNativeEndEventsRef: { current: new WeakSet() },
    pixelSelectionHandledNativeEndEventsRef: { current: new WeakSet() },
    handleStudioPointCommentStageDown: () => false,
    stopQuickShapeTracking: vi.fn(),
  };
  // Unrelated tools are idle; execute the real extracted node down/move/up/cancel handlers.
  const host = new Proxy(hostValues, {
    get(values, property: string) {
      if (!(property in values) && property.endsWith("Ref")) values[property] = { current: null };
      return values[property];
    },
  }) as unknown as StudioCuttoonStagePointersHost;
  const api = { hideBrushCursor: vi.fn() } as unknown as StudioCuttoonStagePointersApi;
  bindStudioCuttoonStagePointersDownArmed(host, api);
  bindStudioCuttoonStagePointersDown(host, api);
  bindStudioCuttoonStagePointersMove(host, api);
  bindStudioCuttoonStagePointersUp(host, api);
  bindStudioCuttoonStagePointersFinish(host, api);
  const event = (pointerId: number, x = 10, y = 20) => ({
    evt: { pointerId, pointerType: pointerId === 7 ? "pen" : "touch", target },
    target: { name: () => "", getParent: () => null, getStage: () => ({ getRelativePointerPosition: () => ({ x, y }) }) },
  });
  const begin = () => act(() => api.onStageDown(event(7)));
  const move = () => act(() => api.onStageMove(event(7, 30, 50)));
  return { hook, api, hostValues, event, begin, move, capture, release, patchEl, elementById, selected };
}

describe("node editing pointer ownership at the stage boundary", () => {
  it("keeps an explicit Smart Shape node activation across the same-batch selection change", () => {
    const hook = renderHook(() => {
      const [selectedId, select] = useState<string | null>(null);
      return { ...useStudioVectorNodeBubbleEdit({ selectedId }), select };
    });
    act(() => {
      hook.result.current.select("corrected-shape");
      hook.result.current.setNodeEditTool("move", "corrected-shape");
    });
    expect(hook.result.current.nodeEditTool).toBe("move");
    act(() => hook.result.current.select("unrelated-shape"));
    expect(hook.result.current.nodeEditTool).toBeNull();
    act(() => hook.result.current.select("corrected-shape"));
    expect(hook.result.current.nodeEditTool).toBeNull();
  });

  it("does not activate a different selection when a requested node target loses the selection race", () => {
    const hook = renderHook(() => {
      const [selectedId, select] = useState<string | null>(null);
      return { ...useStudioVectorNodeBubbleEdit({ selectedId }), select };
    });
    act(() => {
      hook.result.current.setNodeEditTool("move", "corrected-shape");
      hook.result.current.select("unrelated-shape");
    });
    expect(hook.result.current.nodeEditTool).toBeNull();
    act(() => hook.result.current.select("corrected-shape"));
    expect(hook.result.current.nodeEditTool).toBeNull();
  });

  it("keeps pen ownership across a second finger's down, move, up and cancel", () => {
    const f = fixture();
    f.begin();
    const owner = f.hook.result.current.nodeEditDragRef.current;
    act(() => f.api.onStageDown(f.event(8)));
    expect(f.hook.result.current.nodeEditDragRef.current).toBe(owner);
    expect(owner?.pointerId).toBe(7);
    expect(f.capture).toHaveBeenCalledWith(7);
    f.move();
    const draft = f.hook.result.current.pendingNodeEditDraftRef.current;
    expect(draft?.points.slice(0, 2)).toEqual([30, 50]);
    act(() => {
      f.api.onStageMove(f.event(8, 500, 700));
      f.api.onStageUp(f.event(8));
      f.api.onStagePointerCancel(f.event(8));
    });
    expect(f.hook.result.current.pendingNodeEditDraftRef.current).toBe(draft);
    expect(f.hook.result.current.nodeEditDragRef.current).toBe(owner);
    expect(f.patchEl).not.toHaveBeenCalled();
    expect(f.release).not.toHaveBeenCalled();
    act(() => f.api.onStageUp(f.event(7)));
    expect(f.patchEl).toHaveBeenCalledExactlyOnceWith("shape", { points: draft!.points, pressures: draft!.pressures });
    expect(f.release).toHaveBeenCalledExactlyOnceWith(7);
    expect(f.hook.result.current.nodeEditDragRef.current).toBeNull();
    expect(f.hook.result.current.pendingNodeEditDraftRef.current).toBeNull();
  });

  it.each(["move", "up"])("does not let a foreign pointer %s replace or publish the pen draft", (phase) => {
    const f = fixture(); f.begin(); f.move();
    const draft = f.hook.result.current.pendingNodeEditDraftRef.current;
    act(() => {
      if (phase === "move") f.api.onStageMove(f.event(8, 500, 700));
      else f.api.onStageUp(f.event(8));
    });
    expect(f.patchEl).not.toHaveBeenCalled();
    expect(f.hook.result.current.pendingNodeEditDraftRef.current).toBe(draft);
    expect(f.hook.result.current.nodeEditDragRef.current).not.toBeNull();
  });

  it("discards an owning stage cancel without committing its draft", () => {
    const f = fixture(); f.begin(); f.move();
    act(() => f.api.onStagePointerCancel(f.event(7)));
    expect(f.patchEl).not.toHaveBeenCalled();
    expect(f.hook.result.current.nodeEditDragRef.current).toBeNull();
    expect(f.hook.result.current.pendingNodeEditDraftRef.current).toBeNull();
    expect(f.release).toHaveBeenCalledWith(7);
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(1);
  });

  it("cancels down → move → Escape → up through the actual shortcut dispatcher", () => {
    const f = fixture();
    act(() => f.hook.result.current.setNodeEditTool("move"));
    f.begin(); f.move();
    act(() => vi.mocked(globalThis.requestAnimationFrame).mock.calls.at(-1)![0](0));
    expect(f.hook.result.current.nodeEditDraft).not.toBeNull();
    f.move(); // Keep a second preview frame pending when Escape arrives.
    const shortcuts = buildStudioShortcutHandler(new Proxy({
      ...f.hostValues,
      ...f.hook.result.current,
      appSettingsRef: { current: defaultStudioAppSettings() },
      cancelStudioRasterPreparation: () => false,
      cancelCanvasGroupDrag: () => false,
      hasActiveDrawingPointerSession: () => false,
    }, {
      get(values, property: string) {
        return Reflect.get(values, property) ?? (property.endsWith("Ref") ? { current: null } : undefined);
      },
    }) as unknown as StudioShortcutHandlerContext);
    // A pointerup in the same event batch must observe cancellation before React renders.
    act(() => {
      shortcuts(new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }));
      f.api.onStageUp(f.event(7));
    });
    expect(f.patchEl).not.toHaveBeenCalled();
    expect(f.hook.result.current.nodeEditTool).toBeNull();
    expect(f.hook.result.current.nodeEditDragRef.current).toBeNull();
    expect(f.hook.result.current.pendingNodeEditDraftRef.current).toBeNull();
    expect(f.hook.result.current.nodeEditDraft).toBeNull();
    expect(f.hook.result.current.nodeEditRafRef.current).toBeNull();
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(f.release).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("discards the previous drag when a functional update selects another node tool", () => {
    const f = fixture();
    act(() => f.hook.result.current.setNodeEditTool("move"));
    f.begin(); f.move();
    act(() => {
      f.hook.result.current.setNodeEditTool((current) => current === "move" ? "width" : current);
      f.api.onStageUp(f.event(7));
    });
    expect(f.hook.result.current.nodeEditTool).toBe("width");
    expect(f.patchEl).not.toHaveBeenCalled();
    expect(f.hook.result.current.nodeEditDragRef.current).toBeNull();
    expect(f.hook.result.current.pendingNodeEditDraftRef.current).toBeNull();
    expect(f.release).toHaveBeenCalledExactlyOnceWith(7);
  });

  it.each(["pointerup", "pointercancel", "lostpointercapture"])("cleans an outside-stage %s only for the owner", (type) => {
    const f = fixture(); f.begin(); f.move();
    const dispatch = (pointerId: number) => {
      const event = new Event(type); Object.defineProperty(event, "pointerId", { value: pointerId });
      act(() => globalThis.dispatchEvent(event));
    };
    dispatch(8);
    expect(f.hook.result.current.nodeEditDragRef.current?.pointerId).toBe(7);
    dispatch(7);
    expect(f.hook.result.current.nodeEditDragRef.current).toBeNull();
    expect(f.hook.result.current.pendingNodeEditDraftRef.current).toBeNull();
    expect(f.patchEl).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledExactlyOnceWith(7);
  });

  it.each(["selection", "unmount"])("releases capture and pending preview on %s", (kind) => {
    const f = fixture(); f.begin(); f.move();
    if (kind === "selection") f.hook.rerender({ selectedId: "other" });
    else f.hook.unmount();
    expect(f.release).toHaveBeenCalledExactlyOnceWith(7);
    expect(f.patchEl).not.toHaveBeenCalled();
    expect(f.hook.result.current.nodeEditDragRef.current).toBeNull();
  });

  it.each(["points", "pressures", "layer-lock", "review-lock"])("rejects a stale or locked %s at pointerup", (change) => {
    const f = fixture(); f.begin(); f.move();
    if (change === "review-lock") f.hostValues.activeSurfaceReviewLocked = true;
    else f.elementById.set("shape", {
      ...f.selected,
      ...(change === "points" ? { points: [99, 88, 80, 20, 100, 40] }
        : change === "pressures" ? { pressures: [0.9, 0.5, 0.8] } : { locked: true }),
    });
    // Host binding snapshots surface flags per render, just as the actual editor does.
    bindStudioCuttoonStagePointersUp(f.hostValues as unknown as StudioCuttoonStagePointersHost, f.api);
    act(() => f.api.onStageUp(f.event(7)));
    expect(f.patchEl).not.toHaveBeenCalled();
    expect(f.hook.result.current.nodeEditDragRef.current).toBeNull();
    expect(f.release).toHaveBeenCalledWith(7);
  });
});
