// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildStudioCompanionPing,
  isStudioCompanionSessionId,
  studioCompanionChannelName,
  type StudioCompanionMessage,
} from "./studio-tools-companion";
import { StudioToolsCompanionPage } from "./StudioToolsCompanionPage";

class FakeBroadcastChannel {
  static readonly instances: FakeBroadcastChannel[] = [];

  readonly postMessage = vi.fn();
  readonly close = vi.fn(() => {
    this.closed = true;
    this.onmessage = null;
  });
  onmessage: ((event: MessageEvent) => void) | null = null;
  closed = false;

  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  emit(data: unknown) {
    if (this.closed) return;
    this.onmessage?.({ data } as MessageEvent);
  }
}

const sessionId = "primary-a-1234";
const sessionIdB = "primary-b-5678";
const primaryInstanceA = "primary-instance-a-1234";
const primaryInstanceB = "primary-instance-b-5678";

function renderCompanion(entry = `/studio/tools-companion?session=${sessionId}`) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <StudioToolsCompanionPage />
    </MemoryRouter>
  );
}

function companionInstanceId(channel: FakeBroadcastChannel): string {
  const hello = channel.postMessage.mock.calls
    .map(([message]) => message as StudioCompanionMessage)
    .find((message) => message.type === "hello" && message.role === "companion");
  if (!hello || hello.role !== "companion") throw new Error("companion hello missing");
  return hello.companionInstanceId;
}

function SessionSwitchHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button
        type="button"
        onClick={() => navigate(`/studio/tools-companion?session=${sessionIdB}`)}
      >
        세션 전환
      </button>
      <StudioToolsCompanionPage />
    </>
  );
}

beforeEach(() => {
  FakeBroadcastChannel.instances.length = 0;
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  window.history.replaceState(null, "", `/studio/tools-companion?session=${sessionId}`);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("StudioToolsCompanionPage", () => {
  it("refuses a missing or malformed session instead of joining a global channel", () => {
    renderCompanion("/studio/tools-companion");

    expect(screen.getByRole("alert").textContent).toContain("유효한 분리 세션이 없습니다");
    expect(FakeBroadcastChannel.instances).toHaveLength(0);
  });

  it("binds to its primary session and sends commands only after a primary responds", () => {
    renderCompanion();
    const channel = FakeBroadcastChannel.instances[0];
    expect(channel?.name).toBe(studioCompanionChannelName(sessionId));
    expect((screen.getByRole("button", { name: "말풍선" }) as HTMLButtonElement).disabled).toBe(true);
    const companionInstance = companionInstanceId(channel!);
    expect(isStudioCompanionSessionId(companionInstance)).toBe(true);

    act(() => {
      channel?.emit({
        v: 1,
        type: "hello",
        role: "primary",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: null,
        at: Date.now(),
      });
      channel?.emit({
        v: 1,
        type: "primary-state",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: companionInstance,
        tool: "pen",
        density: "focus",
        canvasOnly: true,
        title: "에피소드 A",
        at: Date.now(),
      });
      channel?.emit({
        v: 1,
        type: "hello",
        role: "primary",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: companionInstance,
        at: Date.now(),
      });
      channel?.emit({
        v: 1,
        type: "hello",
        role: "primary",
        primaryInstanceId: primaryInstanceB,
        targetCompanionInstanceId: companionInstance,
        at: Date.now(),
      });
      channel?.emit({
        v: 1,
        type: "primary-state",
        primaryInstanceId: primaryInstanceB,
        targetCompanionInstanceId: companionInstance,
        tool: "eraser",
        density: "simple",
        canvasOnly: false,
        title: "오염되면 안 되는 B",
        at: Date.now(),
      });
    });

    expect(screen.getByText(/연결됨 · 에피소드 A/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "펜" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/밀도 focus/u)).toBeTruthy();
    expect(channel?.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "hello",
      role: "companion",
      companionInstanceId: companionInstance,
      targetPrimaryInstanceId: primaryInstanceA,
    }));
    const targetedHelloCount = channel?.postMessage.mock.calls
      .map(([message]) => message as StudioCompanionMessage)
      .filter((message) => (
        message.type === "hello"
        && message.role === "companion"
        && message.targetPrimaryInstanceId === primaryInstanceA
      )).length;
    expect(targetedHelloCount).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "말풍선" }));
    expect(channel?.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        v: 1,
        type: "companion-command",
        command: "bubble",
        companionInstanceId: companionInstance,
        targetPrimaryInstanceId: primaryInstanceA,
        sequence: 1,
      })
    );
  });

  it("never treats another companion ping as primary activity", () => {
    renderCompanion();
    const channel = FakeBroadcastChannel.instances[0]!;

    act(() => {
      channel.emit(buildStudioCompanionPing({
        companionInstanceId: "companion-b-5678",
        targetPrimaryInstanceId: primaryInstanceA,
        nonce: "ping-nonce-1234",
      }));
    });

    expect(screen.getByText(/연결 대기/u)).toBeTruthy();
    expect((screen.getByRole("button", { name: "펜" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps a losing companion candidate disabled until targeted state confirms the handshake", () => {
    renderCompanion();
    const channel = FakeBroadcastChannel.instances[0]!;
    act(() => {
      channel.emit({
        v: 1,
        type: "hello",
        role: "primary",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: null,
        at: Date.now(),
      });
    });

    expect(screen.getByText(/연결 대기/u)).toBeTruthy();
    expect((screen.getByRole("button", { name: "펜" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("expires a closed primary and offers a same-session reattach link", () => {
    vi.useFakeTimers();
    renderCompanion();
    const channel = FakeBroadcastChannel.instances[0];
    const companionInstance = companionInstanceId(channel!);

    act(() => {
      channel?.emit({
        v: 1,
        type: "hello",
        role: "primary",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: companionInstance,
        at: Date.now(),
      });
      channel?.emit({
        v: 1,
        type: "primary-state",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: companionInstance,
        tool: "select",
        density: "full",
        canvasOnly: false,
        title: "에피소드 A",
        at: Date.now(),
      });
    });
    expect(screen.getByText(/연결됨/u)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(16_001);
    });

    expect(screen.getByText(/연결 대기/u)).toBeTruthy();
    const discoveryHellos = channel?.postMessage.mock.calls
      .map(([message]) => message as StudioCompanionMessage)
      .filter((message) => (
        message.type === "hello"
        && message.role === "companion"
        && message.targetPrimaryInstanceId === null
      ));
    expect(discoveryHellos?.length).toBeGreaterThanOrEqual(2);
    const reconnect = screen.getByRole("link", { name: "스튜디오 다시 연결" });
    expect(reconnect.getAttribute("href")).toBe(`http://localhost:3000/studio?session=${sessionId}`);
    expect(reconnect.getAttribute("target")).toBe("_blank");

    act(() => {
      channel?.emit({
        v: 1,
        type: "hello",
        role: "primary",
        primaryInstanceId: primaryInstanceB,
        targetCompanionInstanceId: null,
        at: Date.now(),
      });
      channel?.emit({
        v: 1,
        type: "primary-state",
        primaryInstanceId: primaryInstanceB,
        targetCompanionInstanceId: companionInstance,
        tool: "select",
        density: "full",
        canvasOnly: false,
        title: "에피소드 B",
        at: Date.now(),
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "펜" }));
    expect(channel?.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "companion-command",
      targetPrimaryInstanceId: primaryInstanceB,
    }));
    expect(channel?.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "hello",
      role: "companion",
      targetPrimaryInstanceId: primaryInstanceB,
    }));
  });

  it("does not refresh primary liveness for a pong with the wrong nonce", () => {
    vi.useFakeTimers();
    renderCompanion();
    const channel = FakeBroadcastChannel.instances[0]!;
    const companionInstance = companionInstanceId(channel);
    act(() => {
      channel.emit({
        v: 1,
        type: "hello",
        role: "primary",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: companionInstance,
        at: Date.now(),
      });
      channel.emit({
        v: 1,
        type: "primary-state",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: companionInstance,
        tool: "select",
        density: "full",
        canvasOnly: false,
        title: "에피소드 A",
        at: Date.now(),
      });
      vi.advanceTimersByTime(8_000);
      channel.emit({
        v: 1,
        type: "pong",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: companionInstance,
        nonce: "wrong-nonce-1234",
        at: Date.now(),
      });
      vi.advanceTimersByTime(8_001);
    });

    expect(screen.getByText(/연결 대기/u)).toBeTruthy();
    expect((screen.getByRole("button", { name: "펜" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps command sequence monotonic across stale and same-primary re-handshake", () => {
    vi.useFakeTimers();
    renderCompanion();
    const channel = FakeBroadcastChannel.instances[0]!;
    const companionInstance = companionInstanceId(channel);
    act(() => {
      channel.emit({
        v: 1,
        type: "hello",
        role: "primary",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: companionInstance,
        at: Date.now(),
      });
      channel.emit({
        v: 1,
        type: "primary-state",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: companionInstance,
        tool: "select",
        density: "full",
        canvasOnly: false,
        title: "에피소드 A",
        at: Date.now(),
      });
    });
    for (let index = 0; index < 10; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: index % 2 === 0 ? "펜" : "선택" }));
    }
    act(() => {
      vi.advanceTimersByTime(16_001);
      channel.emit({
        v: 1,
        type: "hello",
        role: "primary",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: companionInstance,
        at: Date.now(),
      });
      channel.emit({
        v: 1,
        type: "primary-state",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: companionInstance,
        tool: "select",
        density: "full",
        canvasOnly: false,
        title: "에피소드 A",
        at: Date.now(),
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "펜" }));

    expect(channel.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "companion-command",
      companionInstanceId: companionInstance,
      targetPrimaryInstanceId: primaryInstanceA,
      sequence: 11,
    }));
  });

  it("fully resets peer, title, tool, density and errors when the router session changes", () => {
    render(
      <MemoryRouter initialEntries={[`/studio/tools-companion?session=${sessionId}`]}>
        <SessionSwitchHarness />
      </MemoryRouter>
    );
    const first = FakeBroadcastChannel.instances[0]!;
    const firstCompanion = companionInstanceId(first);
    act(() => {
      first.emit({
        v: 1,
        type: "hello",
        role: "primary",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: firstCompanion,
        at: Date.now(),
      });
      first.emit({
        v: 1,
        type: "primary-state",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: firstCompanion,
        tool: "pen",
        density: "focus",
        canvasOnly: true,
        title: "이전 문서",
        at: Date.now(),
      });
    });
    expect(screen.getByText(/연결됨 · 이전 문서/u)).toBeTruthy();
    first.postMessage.mockImplementationOnce(() => {
      throw new Error("send failed");
    });
    fireEvent.click(screen.getByRole("button", { name: "펜" }));
    expect(screen.getByRole("alert").textContent).toContain("채널 전송에 실패");

    fireEvent.click(screen.getByRole("button", { name: "세션 전환" }));

    expect(first.close).toHaveBeenCalledOnce();
    expect(FakeBroadcastChannel.instances).toHaveLength(2);
    const second = FakeBroadcastChannel.instances[1]!;
    expect(second.name).toBe(studioCompanionChannelName(sessionIdB));
    expect(screen.getByText(/연결 대기/u)).toBeTruthy();
    expect(screen.queryByText(/이전 문서/u)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/밀도 full/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "선택" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("button", { name: "펜" }) as HTMLButtonElement).disabled).toBe(true);
    expect(companionInstanceId(second)).not.toBe(firstCompanion);
  });

  it("keeps status live, touch actions at least 44px, and safe-area padding on small screens", () => {
    renderCompanion(`/studio/tools-companion?session=${sessionId}&remix=source-456`);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("button", { name: "기본 탭 앞으로" }).className).toContain("min-h-11");
    expect(screen.getByTestId("studio-tools-companion-root").className).toContain("safe-area-inset");
    expect(screen.getByRole("link", { name: "스튜디오 다시 연결" }).getAttribute("href")).toBe(
      `http://localhost:3000/studio?session=${sessionId}&remix=source-456`
    );
  });

  it("closes its channel when the detached window unmounts", () => {
    document.title = "이전 제목";
    const view = renderCompanion();
    const channel = FakeBroadcastChannel.instances[0];
    expect(document.title).toBe("도구 창 · ToonSpectrum Studio");
    view.unmount();
    expect(channel?.close).toHaveBeenCalledOnce();
    expect(document.title).toBe("이전 제목");
  });
});
