// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioLiveParticipant } from "../../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../../live/studio-live-direct-port";
import { SpaceProximityConsent, SpaceProximityVideo } from "./SpaceProximityVideo";
import { SPACE_PROXIMITY_MEDIA_CHANNEL, unwrapSpaceChannelPayload } from "./space-proximity-media";
import { useSpaceProximityMedia } from "./use-space-proximity-media";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const alice: StudioLiveParticipant = { sessionId: "alice", displayName: "Alice", role: "editor" };
const bob: StudioLiveParticipant = { sessionId: "bob", displayName: "Bob", role: "editor" };

function fakePort() {
  const sent: { readonly target: string; readonly payload: string }[] = [];
  let subscriptions = 0;
  const port: StudioLiveDirectPort = {
    getPeers: () => [bob],
    send: (target, payload) => { sent.push({ target, payload }); return true; },
    subscribe: () => { subscriptions += 1; return () => { subscriptions -= 1; }; },
  };
  return { port, sent, subscriptions: () => subscriptions };
}

describe("useSpaceProximityMedia", () => {
  it("켜기 전에는 아무 연결도 만들지 않고, 켜면 근접 범위 팀원에게만 전용 채널로 신호를 보낸다", () => {
    vi.useFakeTimers();
    const { port, sent, subscriptions } = fakePort();
    const { result, rerender } = renderHook((props: { scopeIds: readonly string[] }) => useSpaceProximityMedia({
      participant: alice, port, available: true, scopeIds: props.scopeIds,
    }), { initialProps: { scopeIds: [] as readonly string[] } });
    expect(result.current.phase).toBe("off");
    expect(subscriptions()).toBe(0);
    act(() => result.current.start({ camera: false, mic: false }));
    expect(result.current.phase).toBe("live");
    expect(subscriptions()).toBe(1);
    expect(sent).toHaveLength(0);
    rerender({ scopeIds: ["bob"] });
    act(() => { vi.advanceTimersByTime(3_100); });
    expect(sent.length).toBeGreaterThan(0);
    for (const packet of sent) {
      expect(packet.target).toBe("bob");
      expect(unwrapSpaceChannelPayload(packet.payload, SPACE_PROXIMITY_MEDIA_CHANNEL)).toContain("\"kind\":\"state\"");
    }
    act(() => result.current.stop());
    expect(result.current.phase).toBe("off");
    expect(subscriptions()).toBe(0);
  });

  it("게스트(viewer)나 연결 전에는 켜도 대기 상태로 두고 장치를 요청하지 않는다", () => {
    const { port, subscriptions } = fakePort();
    const { result } = renderHook(() => useSpaceProximityMedia({
      participant: { ...alice, role: "viewer" }, port, available: true, scopeIds: [],
    }));
    act(() => result.current.start({ camera: true, mic: true }));
    expect(result.current.phase).toBe("waiting");
    expect(result.current.viewer).toBe(true);
    expect(subscriptions()).toBe(0);
  });
});

describe("SpaceProximityVideo", () => {
  const noop = () => undefined;
  it("꺼져 있으면 그리지 않고, 대기 중이면 이유를, 켜지면 나와 근처 팀원 버블을 보여 준다", () => {
    const view = render(<SpaceProximityVideo phase="off" snapshot={null} busy={false} scopeNames={[]} selfName="Alice" waitingReason={null}
      onToggleCamera={noop} onToggleMic={noop} onToggleScreen={noop} onStop={noop} />);
    expect(view.container.firstChild).toBeNull();
    view.rerender(<SpaceProximityVideo phase="waiting" snapshot={null} busy={false} scopeNames={[]} selfName="Alice" waitingReason="팀원 연결을 확인하는 중이에요."
      onToggleCamera={noop} onToggleMic={noop} onToggleScreen={noop} onStop={noop} />);
    expect(screen.getByRole("status").textContent).toBe("팀원 연결을 확인하는 중이에요.");
    expect(screen.getByRole("button", { name: "카메라 켜기" }).hasAttribute("disabled")).toBe(true);
    const onStop = vi.fn();
    view.rerender(<SpaceProximityVideo phase="live" snapshot={null} busy={false} scopeNames={[{ id: "bob", name: "Bob" }]} selfName="Alice" waitingReason={null}
      onToggleCamera={noop} onToggleMic={noop} onToggleScreen={noop} onStop={onStop} />);
    expect(screen.getByText("Alice · 나")).toBeTruthy();
    expect(screen.getByText("근접 영상을 켜지 않았어요")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("근처 1명");
    fireEvent.click(screen.getByRole("button", { name: "가까이 가면 영상 끄기" }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("동의 카드는 무엇이 언제 켜지는지 먼저 밝히고 버튼을 누를 때만 장치를 요청한다", () => {
    const onStart = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn() } });
    try {
      render(<SpaceProximityConsent radiusTiles={5} unavailableReason={null} onStart={onStart} onCancel={vi.fn()} />);
      expect(screen.getByText(/버튼을 누를 때 한 번만 직접 켜요/u)).toBeTruthy();
      expect(screen.getByText(/유료 중계 서버는 쓰지 않아요/u)).toBeTruthy();
      expect(onStart).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "카메라만" }));
      expect(onStart).toHaveBeenCalledExactlyOnceWith({ camera: true, mic: false });
    } finally {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });
});
