// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_DEFAULT_OFFICE_ZONES } from "./studio-virtual-space-office-zones";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";
import { useStudioVirtualSpacePlaceModes } from "./use-studio-virtual-space-place-modes";

const IN_MEETING = { x: 1000, y: 650 };
const IN_FOCUS = { x: 100, y: 100 };
const OUTSIDE = { x: 10, y: 900 };

function mediaStreamMock() {
  const track = (kind: string) => ({ kind, enabled: true, stop: vi.fn(), addEventListener: vi.fn() });
  const tracks = [track("audio"), track("video")];
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((track) => track.kind === "audio"),
    getVideoTracks: () => tracks.filter((track) => track.kind === "video"),
  } as unknown as MediaStream;
}

describe("useStudioVirtualSpacePlaceModes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * 수동 시계(t) + position 변경으로 펌프를 구동한다.
   * 훅은 position이 바뀌면 즉시 director.update()를 호출하므로,
   * t를 밀고 새 좌표 객체를 넘기면 디바운스가 결정적으로 진행된다.
   */
  function setup(initialPoint: { x: number; y: number } = IN_MEETING) {
    let t = 0;
    const setUserStatus = vi.fn();
    let currentStatus: StudioUserStatus | null = "available";
    const getUserMedia = vi.fn(async () => mediaStreamMock());
    const { result, rerender, unmount } = renderHook(
      ({ point }) => useStudioVirtualSpacePlaceModes({
        zones: STUDIO_DEFAULT_OFFICE_ZONES,
        position: point,
        now: () => t,
        presence: {
          getUserStatus: () => currentStatus,
          setUserStatus: (status) => { currentStatus = status; setUserStatus(status); },
        },
        mediaDependencies: { getUserMedia },
      }),
      { initialProps: { point: initialPoint } },
    );
    return {
      result,
      unmount,
      setUserStatus,
      getUserMedia,
      /** t 시각에 point 위치에서 펌프 한 번. */
      pumpAt: (next: number, point: { x: number; y: number }) => {
        t = next;
        act(() => { rerender({ point: { ...point } }); });
      },
    };
  }

  it("회의실 진입 → 프롬프트 → 참여 확인 → 세션 시작", () => {
    const { result, pumpAt, setUserStatus, getUserMedia } = setup();
    expect(result.current.prompt).toBeNull();
    pumpAt(600, IN_MEETING);
    expect(result.current.prompt).not.toBeNull();
    expect(result.current.prompt!.mode).toBe("conference");

    act(() => { result.current.confirmJoin(); });
    expect(result.current.session?.stage).toBe("engaged");
    expect(result.current.prompt).toBeNull();
    // presence 자동 상태: 회의 중
    expect(setUserStatus).toHaveBeenCalledWith("in-meeting");
    // 미디어 세션 참여
    expect(getUserMedia).toHaveBeenCalled();
  });

  it("이탈하면 세션이 끝나고 이전 상태로 복원된다", () => {
    const { result, pumpAt, setUserStatus } = setup();
    pumpAt(600, IN_MEETING);
    act(() => { result.current.confirmJoin(); });
    setUserStatus.mockClear();

    // 이탈 400ms 시점에는 아직 유지.
    pumpAt(1000, OUTSIDE);
    expect(result.current.session?.stage).toBe("engaged");
    // 이탈 후보 시작(1000)부터 1200ms 경과 → 세션 종료 + 진입 전 상태(available) 복원.
    pumpAt(2200, OUTSIDE);
    expect(result.current.session).toBeNull();
    expect(setUserStatus).toHaveBeenCalledWith("available");
  });

  it("책상은 확인 없이 집중 모드로 자동 진입한다", () => {
    const { result, pumpAt, setUserStatus } = setup(IN_FOCUS);
    pumpAt(600, IN_FOCUS);
    expect(result.current.prompt).toBeNull();
    expect(result.current.session?.mode).toBe("focus-desk");
    expect(result.current.session?.stage).toBe("engaged");
    expect(setUserStatus).toHaveBeenCalledWith("focusing");
  });

  it("프롬프트 거절 시 세션이 열리지 않는다", () => {
    const { result, pumpAt, setUserStatus } = setup();
    pumpAt(600, IN_MEETING);
    act(() => { result.current.declineJoin(); });
    expect(result.current.prompt).toBeNull();
    expect(result.current.session?.stage).toBe("idle");
    expect(setUserStatus).not.toHaveBeenCalled();
  });

  it("배너는 자동으로 닫힌다", () => {
    const { result, pumpAt } = setup(IN_FOCUS);
    pumpAt(600, IN_FOCUS);
    expect(result.current.banner).not.toBeNull();
    act(() => { vi.advanceTimersByTime(4_500); });
    expect(result.current.banner).toBeNull();
  });

  it("발표 중인 피어를 청중 시점용으로 노출한다", () => {
    const peer = {
      participant: { sessionId: "peer-1", displayName: "발표자", role: "editor" as const },
      state: {
        x: 700, y: 650, facing: "down" as const, activity: "available" as const,
        moving: false, avatarIndex: 0, zoneId: "live", userStatus: "presenting" as StudioUserStatus,
      },
      lastSeen: Date.now(), sequence: 1,
    };
    const { result } = renderHook(() => useStudioVirtualSpacePlaceModes({
      zones: STUDIO_DEFAULT_OFFICE_ZONES,
      position: OUTSIDE,
      peers: [peer],
    }));
    expect(result.current.spotlightPeerIds).toEqual(["peer-1"]);
  });
});
