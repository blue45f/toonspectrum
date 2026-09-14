// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyAnimationTimelineDoc } from "./studio-anim-tracks";
import { useStudioPageClipboard } from "./studio-page-clipboard-controller";

import type { El } from "./studio-element-model";
import type { PageState } from "./studio-page-state";

const source = {
  id: "text-source",
  type: "text",
  text: "대사",
  x: 100,
  y: 200,
  width: 220,
  fontSize: 40,
  fill: "#111111",
  rotation: 0,
} as unknown as El;

function renderClipboard(
  elements: El[] = [source],
  selectedId: string | null = source.id,
  marqueeIds: string[] = [],
) {
  const commit = vi.fn((_nextElements: El[]) => true);
  const setSelectedId = vi.fn();
  const setMarqueeIds = vi.fn();
  const setTool = vi.fn();
  const announceDrawingShortcut = vi.fn();
  const activePage = { id: "page-1", elements } as unknown as PageState;
  const currentPageIdRef = { current: activePage.id };
  const masterEditModeRef = { current: false };

  const hook = renderHook(() => useStudioPageClipboard({
    activePage,
    pages: [activePage],
    masterEditMode: false,
    activeSurfaceReviewLocked: false,
    activeSurfaceReviewLockedRef: { current: false },
    collaborationDocumentLocked: false,
    collaborationLockMessage: () => "locked",
    elements,
    selectedId,
    marqueeIds,
    groups: [],
    animTimeline: createEmptyAnimationTimelineDoc(),
    canvasH: 1080,
    editing: null,
    timelapseCapturing: false,
    studioAuthUserId: "artist",
    workId: "work-1",
    currentPageIdRef,
    masterEditModeRef,
    captureStudioMutationTicket: () => ({}) as never,
    canApplyStudioMutation: () => true,
    deleteLayerElements: () => true,
    commit,
    commitPages: () => true,
    nextAssetInsertionPlacement: () => ({ x: 0, y: 0 }) as never,
    addRenderedImage: () => true,
    setMarqueeIds,
    setSelectedId,
    setTool,
    announceDrawingShortcut,
    setError: vi.fn(),
  }));

  return {
    ...hook,
    announceDrawingShortcut,
    commit,
    setMarqueeIds,
    setSelectedId,
    setTool,
  };
}

afterEach(cleanup);

describe("Studio duplicate placement", () => {
  it("commits Option/Alt-drag as one in-place clone carrying the terminal drag patch", () => {
    const hook = renderClipboard();
    let duplicated = false;
    act(() => {
      duplicated = hook.result.current.duplicateSelected({
        placement: "in-place",
        patch: { x: 360, y: 480 },
        announcement: "복제하여 이동",
      });
    });

    expect(duplicated).toBe(true);
    expect(hook.commit).toHaveBeenCalledTimes(1);
    const [nextElements] = hook.commit.mock.calls[0]!;
    expect(nextElements).toHaveLength(2);
    expect(nextElements[0]).toBe(source);
    expect(nextElements[0]).toMatchObject({ id: source.id, x: 100, y: 200 });
    expect(nextElements[1]).toMatchObject({ type: "text", x: 360, y: 480 });
    expect(nextElements[1].id).not.toBe(source.id);
    expect(hook.setSelectedId).toHaveBeenCalledWith(nextElements[1].id);
    expect(hook.setMarqueeIds).toHaveBeenCalledWith([]);
    expect(hook.setTool).toHaveBeenCalledWith("select");
    expect(hook.announceDrawingShortcut).toHaveBeenCalledWith("복제하여 이동");
  });


  it("translates a mixed multi-selection as one duplicate transaction", () => {
    const draw = {
      id: "draw-source",
      type: "draw",
      kind: "freehand",
      points: [10, 20, 30, 40],
      stroke: "#111111",
      strokeWidth: 4,
    } as unknown as El;
    const hook = renderClipboard([source, draw], null, [source.id, draw.id]);

    act(() => {
      hook.result.current.duplicateSelected({
        placement: "in-place",
        translation: { deltaX: 30, deltaY: -20 },
        announcement: "선택 항목을 복제하여 이동",
      });
    });

    expect(hook.commit).toHaveBeenCalledTimes(1);
    const [nextElements] = hook.commit.mock.calls[0]!;
    expect(nextElements).toHaveLength(4);
    expect(nextElements.slice(0, 2)).toEqual([source, draw]);
    expect(nextElements[2]).toMatchObject({ type: "text", x: 130, y: 180 });
    expect(nextElements[3]).toMatchObject({
      type: "draw",
      points: [40, 0, 60, 20],
    });
    expect(nextElements[2].id).not.toBe(source.id);
    expect(nextElements[3].id).not.toBe(draw.id);
    expect(hook.setMarqueeIds).toHaveBeenCalledWith([
      nextElements[2].id,
      nextElements[3].id,
    ]);
    expect(hook.setSelectedId).toHaveBeenCalledWith(null);
  });

  it("does not let a gesture patch overwrite the planner's fresh identity", () => {
    const hook = renderClipboard();
    act(() => {
      hook.result.current.duplicateSelected({
        placement: "in-place",
        patch: { id: source.id, x: 240, y: 260 } as Partial<El>,
      });
    });

    const [nextElements] = hook.commit.mock.calls[0]!;
    expect(nextElements[1].id).not.toBe(source.id);
    expect(nextElements[1]).toMatchObject({ x: 240, y: 260 });
  });
});
