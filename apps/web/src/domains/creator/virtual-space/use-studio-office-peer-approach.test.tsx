// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { studioVirtualSpaceState } from "./studio-virtual-space-model";
import { findStudioWorldPath } from "./studio-virtual-space-world-pathfinding";
import { useStudioOfficePeerApproach } from "./use-studio-office-peer-approach";

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import type { StudioOfficePeerApproachInput } from "./use-studio-office-peer-approach";

const manifest: StudioVirtualSpaceWorldManifest = {
  id: "office-approach", version: 1, width: 800, height: 400,
  backgroundAssetKey: "office", backgroundUrl: "/office.webp",
  rooms: [{ id: "office", x: 0, y: 0, width: 800, height: 400, labelKo: "작업실", labelEn: "Office" }],
  spawns: [{ id: "main", point: { x: 100, y: 200 } }],
  colliders: [], interactions: [], portals: [], props: [], npcs: [],
};

function fixture(patch: Partial<StudioOfficePeerApproachInput> = {}): StudioOfficePeerApproachInput {
  return {
    manifest, scope: "project-a:world-one", enabled: true, blockedPeerIds: [],
    self: { x: 100, y: 200 }, moving: false,
    peers: [{ participant: { sessionId: "peer-1", displayName: "동료", role: "editor" },
      state: studioVirtualSpaceState({ x: 500, y: 200 }), lastSeen: Date.now(), sequence: 1 }],
    onMove: vi.fn(), onStop: vi.fn(), onArrive: vi.fn(), ...patch,
  };
}

beforeEach(() => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("동료에게 다가가는 일회성 이동", () => {
  it("안전한 인접 위치로만 이동하고 실제 도착 전에는 도착 알림을 보내지 않는다", () => {
    const points: StudioVirtualSpacePoint[] = [];
    const props = fixture({ onMove: vi.fn((point) => { points.push(point); }) });
    const hook = renderHook(useStudioOfficePeerApproach, { initialProps: props });
    act(() => { expect(hook.result.current.start("peer-1")).toBe(true); });
    expect(hook.result.current).toMatchObject({ approachingPeerId: "peer-1", peerName: "동료", status: "walking" });
    expect(props.onArrive).not.toHaveBeenCalled();
    expect(points).toEqual([{ x: 420, y: 200 }]);
    const destination = points[0];
    if (!destination) throw new Error("접근 목적지가 필요하다");
    expect(findStudioWorldPath(manifest, props.self, destination).at(-1)).toEqual(destination);
    hook.rerender({ ...props, self: { x: 420, y: 200 } });
    expect(hook.result.current).toMatchObject({ approachingPeerId: null, status: "arrived" });
    expect(props.onStop).toHaveBeenCalledOnce();
    expect(props.onArrive).toHaveBeenCalledExactlyOnceWith("peer-1");
    hook.rerender({ ...props, self: { x: 421, y: 200 } });
    expect(props.onArrive).toHaveBeenCalledOnce();
  });

  it.each(["scope", "offline", "peer-left", "blocked"])("%s 경계에서 중지하고 다시 활성화되어도 자동 재개하지 않는다", (reason) => {
    const props = fixture();
    const hook = renderHook(useStudioOfficePeerApproach, { initialProps: props });
    act(() => { hook.result.current.start("peer-1"); });
    const changed = {
      ...props,
      ...(reason === "scope" ? { scope: "project-b:world-one" } : {}),
      ...(reason === "offline" ? { enabled: false } : {}),
      ...(reason === "peer-left" ? { peers: [] } : {}),
      ...(reason === "blocked" ? { blockedPeerIds: ["peer-1"] } : {}),
    };
    hook.rerender(changed);
    expect(hook.result.current).toMatchObject({ approachingPeerId: null, status: "cancelled" });
    expect(props.onStop).toHaveBeenCalledOnce();
    hook.rerender(props);
    expect(props.onMove).toHaveBeenCalledOnce();
    expect(props.onArrive).not.toHaveBeenCalled();
  });

  it.each(["blur", "offline", "hidden"])("%s 이벤트는 렌더를 기다리지 않고 이동 의도를 취소한다", (reason) => {
    const props = fixture();
    const hook = renderHook(useStudioOfficePeerApproach, { initialProps: props });
    act(() => { hook.result.current.start("peer-1"); });
    act(() => {
      if (reason === "hidden") {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      } else window.dispatchEvent(new Event(reason));
      expect(props.onStop).toHaveBeenCalledOnce();
    });
    expect(hook.result.current.status).toBe("cancelled");
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(props.onMove).toHaveBeenCalledOnce();
    expect(props.onArrive).not.toHaveBeenCalled();
  });

  it("수동 취소 후 도착 좌표가 도착해도 알림을 다시 보내지 않는다", () => {
    const props = fixture();
    const hook = renderHook(useStudioOfficePeerApproach, { initialProps: props });
    act(() => { hook.result.current.start("peer-1"); hook.result.current.cancel(); hook.result.current.cancel(); });
    hook.rerender({ ...props, self: { x: 420, y: 200 } });
    expect(props.onStop).toHaveBeenCalledOnce();
    expect(props.onArrive).not.toHaveBeenCalled();
    expect(hook.result.current.status).toBe("cancelled");
  });

  it.each(["focused", "away"] as const)("동료가 %s 상태이면 접근을 시작하지 않고 이동 중 전환도 즉시 취소한다", (activity) => {
    const props = fixture();
    const peer = props.peers[0];
    if (!peer) throw new Error("동료 fixture가 필요하다");
    const unavailable: StudioOfficePeerApproachInput = { ...props, peers: [{ ...peer, state: { ...peer.state, activity } }] };
    const hook = renderHook(useStudioOfficePeerApproach, { initialProps: unavailable });
    act(() => { expect(hook.result.current.start("peer-1")).toBe(false); });
    expect(props.onMove).not.toHaveBeenCalled();
    hook.rerender(props);
    act(() => { expect(hook.result.current.start("peer-1")).toBe(true); });
    hook.rerender({ ...unavailable, self: { x: 420, y: 200 } });
    expect(hook.result.current.status).toBe("cancelled");
    expect(props.onStop).toHaveBeenCalledOnce();
    expect(props.onArrive).not.toHaveBeenCalled();
    hook.rerender(props);
    expect(props.onMove).toHaveBeenCalledOnce();
  });

  it("상대가 이동하면 이전 좌표에서 도착하지 않고 안전한 새 접근점으로 경로를 갱신한다", () => {
    const props = fixture();
    const hook = renderHook(useStudioOfficePeerApproach, { initialProps: props });
    act(() => { hook.result.current.start("peer-1"); });
    const peer = props.peers[0];
    if (!peer) throw new Error("동료 fixture가 필요하다");
    hook.rerender({ ...props, self: { x: 420, y: 200 },
      peers: [{ ...peer, state: { ...peer.state, x: 650 } }] });
    expect(props.onMove).toHaveBeenLastCalledWith({ x: 570, y: 200 });
    expect(props.onArrive).not.toHaveBeenCalled();
    expect(hook.result.current.status).toBe("walking");
  });

  it("가구로 막힌 경로는 도착이나 이동을 보고하지 않는다", () => {
    const props = fixture({ manifest: { ...manifest, colliders: [{ x: 290, y: 0, width: 20, height: 400 }] } });
    const hook = renderHook(useStudioOfficePeerApproach, { initialProps: props });
    act(() => { expect(hook.result.current.start("peer-1")).toBe(false); });
    expect(hook.result.current.status).toBe("unreachable");
    expect(props.onMove).not.toHaveBeenCalled();
    expect(props.onArrive).not.toHaveBeenCalled();
    act(() => { hook.result.current.cancel(); });
    expect(hook.result.current).toMatchObject({ status: "idle", approachingPeerId: null, peerName: null });
    expect(props.onStop).not.toHaveBeenCalled();
  });

  it("새 가구가 두 사람 사이를 막으면 거리만 가까워도 도착으로 판정하지 않는다", () => {
    const props = fixture();
    const hook = renderHook(useStudioOfficePeerApproach, { initialProps: props });
    act(() => { hook.result.current.start("peer-1"); });
    hook.rerender({ ...props, self: { x: 420, y: 200 },
      manifest: { ...manifest, colliders: [{ x: 450, y: 0, width: 20, height: 400 }] } });
    expect(hook.result.current.status).toBe("unreachable");
    expect(props.onArrive).not.toHaveBeenCalled();
    expect(props.onStop).toHaveBeenCalledOnce();
  });

  it("겹친 몸의 위치에서는 먼저 간격을 확보하고 도착 처리는 최신 콜백에 한 번 전달한다", () => {
    const props = fixture({ self: { x: 500, y: 200 } });
    const hook = renderHook(useStudioOfficePeerApproach, { initialProps: props });
    act(() => { hook.result.current.start("peer-1"); });
    expect(props.onArrive).not.toHaveBeenCalled();
    const latestArrive = vi.fn();
    hook.rerender({ ...props, self: { x: 580, y: 200 }, onArrive: latestArrive });
    expect(latestArrive).toHaveBeenCalledExactlyOnceWith("peer-1");
    expect(props.onArrive).not.toHaveBeenCalled();
  });

  it.each(["disabled", "blocked", "missing", "background", "offline"])("%s 상태에서는 새 접근을 시작하지 않는다", (reason) => {
    if (reason === "background") vi.spyOn(document, "hasFocus").mockReturnValue(false);
    if (reason === "offline") vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const props = fixture({ enabled: reason !== "disabled", blockedPeerIds: reason === "blocked" ? ["peer-1"] : [] });
    const hook = renderHook(useStudioOfficePeerApproach, { initialProps: props });
    act(() => { expect(hook.result.current.start(reason === "missing" ? "missing" : "peer-1")).toBe(false); });
    expect(props.onMove).not.toHaveBeenCalled();
    expect(props.onArrive).not.toHaveBeenCalled();
  });

  it("이동이 끝나지 않으면 30초 후 중지하며 다시 초점을 받아도 재개하지 않는다", () => {
    vi.useFakeTimers();
    const props = fixture();
    const hook = renderHook(useStudioOfficePeerApproach, { initialProps: props });
    act(() => { hook.result.current.start("peer-1"); });
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(hook.result.current.status).toBe("unreachable");
    expect(props.onStop).toHaveBeenCalledOnce();
    expect(props.onArrive).not.toHaveBeenCalled();
  });

  it("같은 동료를 다시 선택하면 이전 기한을 취소하고 새 이동 기한을 적용한다", () => {
    vi.useFakeTimers();
    const props = fixture();
    const hook = renderHook(useStudioOfficePeerApproach, { initialProps: props });
    act(() => { hook.result.current.start("peer-1"); });
    act(() => { vi.advanceTimersByTime(20_000); hook.result.current.start("peer-1"); });
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(hook.result.current.status).toBe("walking");
    expect(props.onStop).toHaveBeenCalledOnce();
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(hook.result.current.status).toBe("unreachable");
    expect(props.onStop).toHaveBeenCalledTimes(2);
    expect(props.onArrive).not.toHaveBeenCalled();
  });

  it("언마운트는 자신이 시작한 이동만 한 번 중지한다", () => {
    const props = fixture();
    const hook = renderHook(useStudioOfficePeerApproach, { initialProps: props });
    act(() => { hook.result.current.start("peer-1"); });
    hook.unmount();
    expect(props.onStop).toHaveBeenCalledOnce();
    expect(props.onArrive).not.toHaveBeenCalled();
  });
});
