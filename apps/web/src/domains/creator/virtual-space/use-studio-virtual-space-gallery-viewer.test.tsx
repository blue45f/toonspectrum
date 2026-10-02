// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StudioGalleryFrame, StudioGalleryStats } from "./studio-virtual-space-gallery";
import {
  useStudioVirtualSpaceGalleryViewer,
  type UseStudioVirtualSpaceGalleryViewerInput,
} from "./use-studio-virtual-space-gallery-viewer";

function frame(overrides: Partial<StudioGalleryFrame> = {}): StudioGalleryFrame {
  return {
    id: "frame-a",
    titleKo: "첫 장면", titleEn: "First scene",
    artistNoteKo: "비가 오는 장면이에요.", artistNoteEn: "A rainy scene.",
    imageUrl: "https://example.com/art/frame-a@2x.png",
    position: { x: 400, y: 300 },
    ...overrides,
  };
}

const FRAMES = [frame(), frame({ id: "frame-b", position: { x: 900, y: 300 } }), frame({ id: "frame-c", position: { x: 1400, y: 300 } })];
const NEAR_A = { x: 410, y: 300 };
const NEAR_B = { x: 910, y: 300 };
const FAR = { x: 0, y: 900 };

function setup(overrides: Partial<UseStudioVirtualSpaceGalleryViewerInput> = {}) {
  const input: UseStudioVirtualSpaceGalleryViewerInput = {
    frames: FRAMES,
    position: NEAR_A,
    userId: "user-1",
    ...overrides,
  };
  return renderHook(
    (props: UseStudioVirtualSpaceGalleryViewerInput) => useStudioVirtualSpaceGalleryViewer(props),
    { initialProps: input },
  );
}

function move(rerender: (props: UseStudioVirtualSpaceGalleryViewerInput) => void, point: { x: number; y: number }, overrides: Partial<UseStudioVirtualSpaceGalleryViewerInput> = {}) {
  act(() => {
    rerender({ frames: FRAMES, position: { ...point }, userId: "user-1", ...overrides });
  });
}

describe("useStudioVirtualSpaceGalleryViewer", () => {
  it("근처 액자를 현재 작품으로 삼고 그 자리에 머물러도 조회수는 한 번만 오른다", () => {
    const { result, rerender } = setup();
    expect(result.current.currentFrame?.id).toBe("frame-a");
    expect(result.current.currentStats.views).toBe(1);
    move(rerender, { x: 420, y: 310 });
    expect(result.current.currentFrame?.id).toBe("frame-a");
    expect(result.current.currentStats.views).toBe(1);
  });

  it("멀어졌다가 다시 다가오면 조회수가 다시 오른다", () => {
    const { result, rerender } = setup();
    expect(result.current.currentStats.views).toBe(1);
    move(rerender, FAR);
    expect(result.current.currentFrame).toBeNull();
    move(rerender, NEAR_A);
    expect(result.current.currentFrame?.id).toBe("frame-a");
    expect(result.current.currentStats.views).toBe(2);
  });

  it("다른 액자로 이동하면 그 액자의 조회수가 오른다", () => {
    const { result, rerender } = setup();
    move(rerender, NEAR_B);
    expect(result.current.currentFrame?.id).toBe("frame-b");
    expect(result.current.currentStats.views).toBe(1);
  });

  it("로그인 사용자는 좋아요를 토글한다", () => {
    const { result } = setup();
    let outcome = "";
    act(() => { outcome = result.current.toggleLike(); });
    expect(outcome).toBe("liked");
    expect(result.current.liked).toBe(true);
    expect(result.current.currentStats.likes).toBe(1);
    act(() => { outcome = result.current.toggleLike(); });
    expect(outcome).toBe("unliked");
    expect(result.current.currentStats.likes).toBe(0);
  });

  it("게스트 좋아요는 login-required이고 콜백이 불린다", () => {
    const onRequireLogin = vi.fn();
    const { result } = setup({ userId: null, onRequireLogin });
    expect(result.current.isGuest).toBe(true);
    let outcome = "";
    act(() => { outcome = result.current.toggleLike(); });
    expect(outcome).toBe("login-required");
    expect(onRequireLogin).toHaveBeenCalledTimes(1);
    expect(result.current.currentStats.likes).toBe(0);
  });

  it("목록에서 고른 액자는 멀리 있어도 고정된다", () => {
    const { result, rerender } = setup();
    move(rerender, FAR);
    act(() => { result.current.selectFrame("frame-c"); });
    expect(result.current.currentFrame?.id).toBe("frame-c");
  });

  it("닫으면 숨겨지고, 다시 고르면 보인다", () => {
    const { result } = setup();
    act(() => { result.current.closeViewer(); });
    expect(result.current.currentFrame).toBeNull();
    act(() => { result.current.selectFrame("frame-a"); });
    expect(result.current.currentFrame?.id).toBe("frame-a");
  });

  it("도슨트 투어가 순서대로 진행되고 끝에 도달하면 종료된다", () => {
    const { result } = setup({ position: FAR });
    act(() => { result.current.startTour(); });
    expect(result.current.docent).toMatchObject({ index: 0, total: 3 });
    expect(result.current.currentFrame?.id).toBe("frame-a");
    act(() => { result.current.nextTourFrame(); });
    expect(result.current.currentFrame?.id).toBe("frame-b");
    expect(result.current.docent?.index).toBe(1);
    act(() => { result.current.nextTourFrame(); });
    act(() => { result.current.nextTourFrame(); });
    expect(result.current.docent).toBeNull();
  });

  it("제어 모드에서는 onStatsChange로 집계가 나간다", () => {
    const onStatsChange = vi.fn();
    const stats: StudioGalleryStats = {};
    setup({ stats, onStatsChange });
    expect(onStatsChange).toHaveBeenCalled();
    const last = onStatsChange.mock.calls.at(-1)?.[0] as StudioGalleryStats;
    expect(last["frame-a"]?.views).toBe(1);
  });
});
