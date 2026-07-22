// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioCompanionReviewProjection } from "./studio-companion-review-projection";
import {
  buildStudioCompanionNavigatorFrame,
  buildStudioCompanionPing,
  buildStudioCompanionReviewState,
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
const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

function installObjectUrlSpies() {
  const createObjectURL = vi.fn((blob: Blob) => `blob:frame-${blob.size}-${createObjectURL.mock.calls.length}`);
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: revokeObjectURL,
  });
  return { createObjectURL, revokeObjectURL };
}

function restoreObjectUrlStatics() {
  if (originalCreateObjectUrl) Object.defineProperty(URL, "createObjectURL", originalCreateObjectUrl);
  else Reflect.deleteProperty(URL, "createObjectURL");
  if (originalRevokeObjectUrl) Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectUrl);
  else Reflect.deleteProperty(URL, "revokeObjectURL");
}

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

function projectedReview(input: {
  revision?: number;
  documentRevision?: number;
  captureAllowed?: boolean;
} = {}) {
  return createStudioCompanionReviewProjection({
    revision: input.revision ?? 1,
    documentRevision: input.documentRevision ?? 5,
    pageLabel: "1화",
    selectionLabel: "선화",
    canUndo: true,
    canRedo: true,
    captureAllowed: input.captureAllowed ?? true,
    viewport: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 },
    layers: [{ id: "layer-1", label: "주인공 선화", type: "draw", selected: true }],
    historyLength: 3,
    historyIndex: 2,
    comments: [{ id: "thread-1", author: "편집자", body: "표정 확인", unread: true }],
    brush: {
      id: "pen",
      label: "펜",
      size: 6,
      opacity: 1,
      color: "#112233",
      choices: [{ id: "pencil", label: "연필" }],
    },
  });
}

function connectPrimary(input: {
  channel: FakeBroadcastChannel;
  companionInstance: string;
  primaryInstance?: string;
  generation?: number;
  projection?: ReturnType<typeof projectedReview>;
}) {
  const primaryInstance = input.primaryInstance ?? primaryInstanceA;
  const projection = input.projection ?? projectedReview();
  act(() => {
    input.channel.emit({
      v: 1,
      type: "hello",
      role: "primary",
      primaryInstanceId: primaryInstance,
      targetCompanionInstanceId: input.companionInstance,
      at: Date.now(),
    });
    input.channel.emit({
      v: 1,
      type: "primary-state",
      primaryInstanceId: primaryInstance,
      targetCompanionInstanceId: input.companionInstance,
      tool: "pen",
      density: "full",
      canvasOnly: false,
      title: "1화",
      at: Date.now(),
    });
    input.channel.emit(buildStudioCompanionReviewState({
      primaryInstanceId: primaryInstance,
      targetCompanionInstanceId: input.companionInstance,
      generation: input.generation ?? 1,
      projection,
    }));
  });
  return { primaryInstance, projection };
}

function navigatorFrame(input: {
  primaryInstance?: string;
  companionInstance: string;
  generation?: number;
  revision?: number;
  sequence?: number;
  marker?: string;
}) {
  return buildStudioCompanionNavigatorFrame({
    primaryInstanceId: input.primaryInstance ?? primaryInstanceA,
    targetCompanionInstanceId: input.companionInstance,
    frame: {
      generation: input.generation ?? 1,
      revision: input.revision ?? 5,
      sequence: input.sequence ?? 1,
      width: 640,
      height: 960,
      blob: new Blob([input.marker ?? "frame"], { type: "image/webp" }),
    },
  });
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
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "getScreenDetails");
  restoreObjectUrlStatics();
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

    const drawPreset = screen.getByRole("button", { name: /작화 집중/u });
    expect(drawPreset.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /전체 탐색/u }));
    expect(channel?.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "companion-command",
      command: "enter-canvas-only",
      companionInstanceId: companionInstance,
      targetPrimaryInstanceId: primaryInstanceA,
    }));
    expect(screen.getByRole("tab", { name: "Navigator" }).getAttribute("aria-selected"))
      .toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "도구" }));
    fireEvent.click(screen.getByRole("button", { name: /기본 배치.*검수/u }));
    expect(channel?.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "companion-command",
      command: "exit-canvas-only",
      companionInstanceId: companionInstance,
      targetPrimaryInstanceId: primaryInstanceA,
    }));
    expect(screen.getByRole("tab", { name: "검수" }).getAttribute("aria-selected"))
      .toBe("true");
  });

  it("removes the primary document title from the entire DOM in presentation-safe mode", () => {
    const view = renderCompanion();
    const channel = FakeBroadcastChannel.instances[0]!;
    const companionInstance = companionInstanceId(channel);
    connectPrimary({ channel, companionInstance });
    const secretTitle = "미공개 계약작 7화";
    act(() => {
      channel.emit({
        v: 1,
        type: "primary-state",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: companionInstance,
        tool: "pen",
        density: "full",
        canvasOnly: false,
        title: secretTitle,
        at: Date.now(),
      });
    });
    expect(view.container.textContent).toContain(secretTitle);

    fireEvent.click(screen.getByRole("tab", { name: "검수" }));
    fireEvent.click(screen.getByRole("button", { name: "발표 안전 켜기" }));

    expect(view.container.textContent).not.toContain(secretTitle);
    expect(view.container.querySelector("header [role='status']")?.textContent)
      .toContain("연결됨 · 발표 안전");
    expect(screen.getByText("스튜디오")).toBeTruthy();
  });

  it("demands navigator frames only while the Navigator tab is active", () => {
    renderCompanion();
    const channel = FakeBroadcastChannel.instances[0]!;
    const companionInstance = companionInstanceId(channel);
    connectPrimary({ channel, companionInstance });
    const demandMessages = () => channel.postMessage.mock.calls
      .map(([message]) => message as StudioCompanionMessage)
      .filter((message) => (
        message.type === "companion-control"
        && message.control.kind === "navigator-demand"
      ));

    expect(demandMessages()).toHaveLength(0);
    fireEvent.click(screen.getByRole("tab", { name: "Navigator" }));
    expect(demandMessages()).toHaveLength(1);
    expect(demandMessages()[0]).toMatchObject({
      control: { kind: "navigator-demand", active: true },
      generation: 1,
    });

    fireEvent.click(screen.getByRole("tab", { name: "도구" }));
    expect(demandMessages()).toHaveLength(2);
    expect(demandMessages()[1]).toMatchObject({
      control: { kind: "navigator-demand", active: false },
      generation: 1,
    });
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

  it("closes matching same-origin dedicated windows when the workspace session changes", () => {
    const popups: Array<{ close: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn>; location: { href: string } }> = [];
    vi.spyOn(window, "open").mockImplementation((url) => {
      const popup = {
        closed: false,
        close: vi.fn(),
        focus: vi.fn(),
        location: { href: String(url) },
      };
      popups.push(popup);
      return popup as unknown as Window;
    });
    render(
      <MemoryRouter initialEntries={[`/studio/tools-companion?session=${sessionId}`]}>
        <SessionSwitchHarness />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", {
      name: "Navigator 전용 창 열기 또는 앞으로 가져오기",
    }));
    fireEvent.click(screen.getByRole("button", {
      name: "검수 전용 창 열기 또는 앞으로 가져오기",
    }));
    expect(popups).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "세션 전환" }));

    expect(popups[0]?.close).toHaveBeenCalledOnce();
    expect(popups[1]?.close).toHaveBeenCalledOnce();
  });

  it("never closes dedicated handles that the user navigated away before a session change", () => {
    const popups: Array<{ close: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn>; location: { href: string } }> = [];
    vi.spyOn(window, "open").mockImplementation((url) => {
      const popup = {
        closed: false,
        close: vi.fn(),
        focus: vi.fn(),
        location: { href: String(url) },
      };
      popups.push(popup);
      return popup as unknown as Window;
    });
    render(
      <MemoryRouter initialEntries={[`/studio/tools-companion?session=${sessionId}`]}>
        <SessionSwitchHarness />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", {
      name: "Navigator 전용 창 열기 또는 앞으로 가져오기",
    }));
    fireEvent.click(screen.getByRole("button", {
      name: "검수 전용 창 열기 또는 앞으로 가져오기",
    }));
    popups[0]!.location.href = "https://example.com/user-document";
    popups[1]!.location.href = "http://localhost:3000/unrelated-page";

    fireEvent.click(screen.getByRole("button", { name: "세션 전환" }));

    expect(popups[0]?.close).not.toHaveBeenCalled();
    expect(popups[1]?.close).not.toHaveBeenCalled();
  });

  it("does not close a matching dedicated window on an ordinary workspace unmount", () => {
    const popup = {
      closed: false,
      close: vi.fn(),
      focus: vi.fn(),
      location: { href: `http://localhost:3000/studio/tools-companion?session=${sessionId}&view=navigator` },
    };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const view = renderCompanion();
    fireEvent.click(screen.getByRole("button", {
      name: "Navigator 전용 창 열기 또는 앞으로 가져오기",
    }));

    view.unmount();

    expect(popup.close).not.toHaveBeenCalled();
  });

  it("keeps status live, touch actions at least 44px, and safe-area padding on small screens", () => {
    renderCompanion(`/studio/tools-companion?session=${sessionId}&remix=source-456`);
    const status = document.querySelector<HTMLElement>("header [role='status']");
    if (!status) throw new Error("companion connection status is missing");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("button", { name: "기본 탭 앞으로" }).className).toContain("min-h-11");
    const companionRoot = screen.getByTestId("studio-tools-companion-root");
    expect(companionRoot.className).toContain("safe-area-inset");
    expect(companionRoot.className).toContain("h-dvh");
    expect(companionRoot.className).toContain("overflow-y-auto");
    expect(screen.getByRole("button", { name: "현재 위치 저장" }).hasAttribute("disabled"))
      .toBe(true);
    expect(screen.getByRole("link", { name: "스튜디오 다시 연결" }).getAttribute("href")).toBe(
      `http://localhost:3000/studio?session=${sessionId}&remix=source-456`
    );
    const toolsTab = screen.getByRole("tab", { name: "도구" });
    fireEvent.keyDown(toolsTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Navigator" }).getAttribute("aria-selected")).toBe("true");
    expect(document.getElementById("companion-mode-panel-tools")?.hidden).toBe(true);
    expect(document.getElementById("companion-mode-panel-navigator")?.hidden).toBe(false);
  });

  it("rejects an invalid or duplicated surface without opening a channel", () => {
    renderCompanion(`/studio/tools-companion?session=${sessionId}&view=navigator&view=review`);

    expect(screen.getByRole("alert").textContent).toContain("유효한 컴패니언 보기 모드가 없습니다");
    expect(FakeBroadcastChannel.instances).toHaveLength(0);
  });

  it("locks a dedicated Navigator surface, omits workspace tabs, and demands frames immediately", () => {
    renderCompanion(`/studio/tools-companion?session=${sessionId}&view=navigator`);
    const channel = FakeBroadcastChannel.instances[0]!;
    const companionInstance = companionInstanceId(channel);

    expect(screen.queryByRole("tablist", { name: "컴패니언 모드" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "캔버스 내비게이터" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "펜" })).toBeNull();
    expect(channel.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "hello",
      role: "companion",
      view: "navigator",
    }));

    connectPrimary({ channel, companionInstance });
    const demands = channel.postMessage.mock.calls
      .map(([message]) => message as StudioCompanionMessage)
      .filter((message) => message.type === "companion-control" && message.control.kind === "navigator-demand");
    expect(demands).toEqual([
      expect.objectContaining({ control: { kind: "navigator-demand", active: true } }),
    ]);
    expect(screen.getByRole("button", { name: "전체 캔버스 미리보기에서 보이는 위치 이동" }).className)
      .toContain("100dvh");
  });

  it("locks a dedicated review surface without requesting Navigator frames", () => {
    renderCompanion(`/studio/tools-companion?session=${sessionId}&view=review`);
    const channel = FakeBroadcastChannel.instances[0]!;
    const companionInstance = companionInstanceId(channel);

    connectPrimary({ channel, companionInstance });

    expect(screen.queryByRole("tablist", { name: "컴패니언 모드" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "검수 콘솔" })).toBeTruthy();
    expect(document.getElementById("companion-mode-panel-review")?.className).toContain("flex-1");
    expect(channel.postMessage.mock.calls
      .map(([message]) => message as StudioCompanionMessage)
      .some((message) => message.type === "companion-control" && message.control.kind === "navigator-demand"))
      .toBe(false);
  });

  it("opens each dedicated surface synchronously from an explicit 44px workspace action", () => {
    const popup = {
      closed: false,
      focus: vi.fn(),
      location: { href: "about:blank" },
    } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(popup);
    renderCompanion();

    const navigatorLaunch = screen.getByRole("button", {
      name: "Navigator 전용 창 열기 또는 앞으로 가져오기",
    });
    expect(navigatorLaunch.className).toContain("min-h-14");
    fireEvent.click(navigatorLaunch);

    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0]?.[0]).toContain(`view=navigator`);
    expect(screen.getByText(/Navigator 창을 열거나 앞으로/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", {
      name: "검수 전용 창 열기 또는 앞으로 가져오기",
    }));
    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[1]?.[0]).toContain(`view=review`);
  });

  it("shows an actionable error when a dedicated popup is blocked", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    renderCompanion();

    fireEvent.click(screen.getByRole("button", {
      name: "Navigator 전용 창 열기 또는 앞으로 가져오기",
    }));

    expect(screen.getByRole("alert").textContent).toContain("팝업이 차단됐습니다");
  });

  it("initializes and synchronizes presentation-safe state without exposing the document title", () => {
    const key = `toonspectrum.studio.companion.presentation-safe.${sessionId}`;
    window.localStorage.setItem(key, "1");
    const view = renderCompanion();
    const channel = FakeBroadcastChannel.instances[0]!;
    const companionInstance = companionInstanceId(channel);
    connectPrimary({ channel, companionInstance });
    act(() => {
      channel.emit({
        v: 1,
        type: "primary-state",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: companionInstance,
        tool: "pen",
        density: "full",
        canvasOnly: false,
        title: "공개 전 비밀 작품",
        at: Date.now(),
      });
    });

    expect(view.container.textContent).not.toContain("공개 전 비밀 작품");
    expect(screen.getByRole("button", { name: "발표 안전 끄기" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "발표 안전 끄기" }));
    expect(window.localStorage.getItem(key)).toBe("0");
    expect(view.container.textContent).toContain("공개 전 비밀 작품");

    window.localStorage.setItem(key, "1");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: "1" }));
    });
    expect(view.container.textContent).not.toContain("공개 전 비밀 작품");
  });

  it("keeps presentation-safe usable when hardened storage throws on read and write", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const view = renderCompanion();
    const channel = FakeBroadcastChannel.instances[0]!;
    const companionInstance = companionInstanceId(channel);
    connectPrimary({ channel, companionInstance });
    act(() => {
      channel.emit({
        v: 1,
        type: "primary-state",
        primaryInstanceId: primaryInstanceA,
        targetCompanionInstanceId: companionInstance,
        tool: "pen",
        density: "full",
        canvasOnly: false,
        title: "저장소 차단 비밀 작품",
        at: Date.now(),
      });
    });
    expect(view.container.textContent).toContain("저장소 차단 비밀 작품");

    fireEvent.click(screen.getByRole("button", { name: "발표 안전 켜기" }));

    expect(screen.getByRole("button", { name: "발표 안전 끄기" }).getAttribute("aria-pressed")).toBe("true");
    expect(view.container.textContent).not.toContain("저장소 차단 비밀 작품");
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

  it("releases dedicated Navigator demand before closing its channel on unmount", () => {
    const view = renderCompanion(`/studio/tools-companion?session=${sessionId}&view=navigator`);
    const channel = FakeBroadcastChannel.instances[0]!;
    const companionInstance = companionInstanceId(channel);
    connectPrimary({ channel, companionInstance });

    view.unmount();

    const demands = channel.postMessage.mock.calls
      .map(([message]) => message as StudioCompanionMessage)
      .filter((message) => message.type === "companion-control" && message.control.kind === "navigator-demand");
    expect(demands).toEqual([
      expect.objectContaining({ control: { kind: "navigator-demand", active: true } }),
      expect.objectContaining({ control: { kind: "navigator-demand", active: false } }),
    ]);
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it("fences navigator frames by target, generation, document revision and sequence", () => {
    const { createObjectURL, revokeObjectURL } = installObjectUrlSpies();
    renderCompanion();
    const channel = FakeBroadcastChannel.instances[0]!;
    const companionInstance = companionInstanceId(channel);
    connectPrimary({ channel, companionInstance });

    act(() => channel.emit(navigatorFrame({ companionInstance, marker: "first" })));
    fireEvent.click(screen.getByRole("tab", { name: "Navigator" }));
    expect(screen.getByAltText("현재 페이지 전체 캔버스").getAttribute("src")).toContain("blob:frame");
    expect(createObjectURL).toHaveBeenCalledOnce();

    act(() => {
      channel.emit(navigatorFrame({ companionInstance: "other-companion-5678", sequence: 2 }));
      channel.emit(navigatorFrame({ companionInstance, generation: 2, sequence: 2 }));
      channel.emit(navigatorFrame({ companionInstance, sequence: 1 }));
    });
    expect(createObjectURL).toHaveBeenCalledOnce();

    act(() => channel.emit(navigatorFrame({ companionInstance, sequence: 2, marker: "second" })));
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);

    const nextProjection = projectedReview({ revision: 2, documentRevision: 6 });
    act(() => channel.emit(buildStudioCompanionReviewState({
      primaryInstanceId: primaryInstanceA,
      targetCompanionInstanceId: companionInstance,
      generation: 1,
      projection: nextProjection,
    })));
    expect(screen.queryByAltText("현재 페이지 전체 캔버스")).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);

    act(() => channel.emit(navigatorFrame({ companionInstance, revision: 5, sequence: 3 })));
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    act(() => channel.emit(navigatorFrame({ companionInstance, revision: 6, sequence: 4 })));
    expect(createObjectURL).toHaveBeenCalledTimes(3);

    act(() => channel.emit(buildStudioCompanionReviewState({
      primaryInstanceId: primaryInstanceA,
      targetCompanionInstanceId: companionInstance,
      generation: 2,
      projection: projectedReview({ revision: 1, documentRevision: 0 }),
    })));
    expect(screen.queryByAltText("현재 페이지 전체 캔버스")).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledTimes(3);
  });

  it("shares command/control sequence and coalesces brush and navigator streams", () => {
    vi.useFakeTimers();
    installObjectUrlSpies();
    renderCompanion();
    const channel = FakeBroadcastChannel.instances[0]!;
    const companionInstance = companionInstanceId(channel);
    connectPrimary({ channel, companionInstance });

    fireEvent.click(screen.getByRole("button", { name: "펜" }));
    fireEvent.click(screen.getByRole("tab", { name: "검수" }));
    const size = screen.getByRole("slider", { name: "원격 브러시 크기" });
    fireEvent.change(size, { target: { value: "10" } });
    fireEvent.change(size, { target: { value: "16" } });
    fireEvent.change(size, { target: { value: "24" } });
    const controls = () => channel.postMessage.mock.calls
      .map(([message]) => message as StudioCompanionMessage)
      .filter((message) => (
        message.type === "companion-control"
        && message.control.kind !== "navigator-demand"
      ));
    expect(controls()).toHaveLength(0);
    act(() => vi.advanceTimersByTime(63));
    expect(controls()).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1));
    expect(controls()).toEqual([
      expect.objectContaining({
        type: "companion-control",
        sequence: 2,
        control: { kind: "brush", patch: { size: 24 } },
      }),
    ]);

    act(() => channel.emit(navigatorFrame({ companionInstance })));
    fireEvent.click(screen.getByRole("tab", { name: "Navigator" }));
    const navigator = screen.getByRole("button", {
      name: "전체 캔버스 미리보기에서 보이는 위치 이동",
    });
    Object.defineProperty(navigator, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400 }),
    });
    fireEvent.pointerDown(navigator, { pointerId: 7, clientX: 20, clientY: 40 });
    fireEvent.pointerMove(navigator, { pointerId: 7, clientX: 100, clientY: 200 });
    fireEvent.pointerMove(navigator, { pointerId: 7, clientX: 180, clientY: 360 });
    act(() => vi.advanceTimersByTime(31));
    expect(controls()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(controls()).toHaveLength(2);
    expect(controls()[1]).toEqual(expect.objectContaining({
      type: "companion-control",
      sequence: 4,
      control: { kind: "navigate", point: { x: 0.9, y: 1 } },
    }));
    fireEvent(navigator, new Event("lostpointercapture", { bubbles: true }));
  });

  it("revokes navigator URLs on expiry, session switch and unmount", () => {
    vi.useFakeTimers();
    const { revokeObjectURL } = installObjectUrlSpies();
    const view = render(
      <MemoryRouter initialEntries={[`/studio/tools-companion?session=${sessionId}`]}>
        <SessionSwitchHarness />
      </MemoryRouter>
    );
    const first = FakeBroadcastChannel.instances[0]!;
    const firstCompanion = companionInstanceId(first);
    connectPrimary({ channel: first, companionInstance: firstCompanion });
    act(() => first.emit(navigatorFrame({ companionInstance: firstCompanion })));

    act(() => vi.advanceTimersByTime(12_001));
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);

    connectPrimary({ channel: first, companionInstance: firstCompanion, generation: 2 });
    act(() => first.emit(navigatorFrame({
      companionInstance: firstCompanion,
      generation: 2,
      sequence: 2,
    })));
    fireEvent.click(screen.getByRole("button", { name: "세션 전환" }));
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);

    const second = FakeBroadcastChannel.instances[1]!;
    const secondCompanion = companionInstanceId(second);
    connectPrimary({ channel: second, companionInstance: secondCompanion });
    act(() => second.emit(navigatorFrame({ companionInstance: secondCompanion })));
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(3);
  });

  it("requests Window Management only from the explicit placement button", async () => {
    const getScreenDetails = vi.fn(async () => ({
      currentScreen: { availLeft: 0, availTop: 0, availWidth: 1_920, availHeight: 1_080 },
      screens: [
        { availLeft: 0, availTop: 0, availWidth: 1_920, availHeight: 1_080, isPrimary: true },
        { availLeft: 1_920, availTop: 0, availWidth: 1_280, availHeight: 900, label: "보조 화면" },
      ],
    }));
    const moveTo = vi.spyOn(window, "moveTo").mockImplementation(() => undefined);
    const resizeTo = vi.spyOn(window, "resizeTo").mockImplementation(() => undefined);
    vi.spyOn(window, "focus").mockImplementation(() => undefined);
    Object.defineProperty(window, "getScreenDetails", { configurable: true, value: getScreenDetails });
    renderCompanion();
    expect(getScreenDetails).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "다른 화면으로 창 이동" }));
      await Promise.resolve();
    });
    expect(getScreenDetails).toHaveBeenCalledOnce();
    expect(moveTo).toHaveBeenCalledWith(expect.any(Number), expect.any(Number));
    expect(resizeTo).toHaveBeenCalledWith(520, 820);
    expect(screen.getByText(/다른 화면으로 이동을 요청했습니다/u).getAttribute("role")).toBe("status");
    Reflect.deleteProperty(window, "getScreenDetails");
  });

  it("announces requesting placement politely and placement failures as alerts", async () => {
    let resolveDetails: ((value: {
      currentScreen: unknown;
      screens: unknown[];
    }) => void) | null = null;
    const getScreenDetails = vi.fn(() => new Promise<{
      currentScreen: unknown;
      screens: unknown[];
    }>((resolve) => {
      resolveDetails = resolve;
    }));
    Object.defineProperty(window, "getScreenDetails", { configurable: true, value: getScreenDetails });
    renderCompanion();

    fireEvent.click(screen.getByRole("button", { name: "다른 화면으로 창 이동" }));
    expect(screen.getByText("연결된 화면을 확인하고 있습니다…").getAttribute("role")).toBe("status");

    await act(async () => {
      resolveDetails?.({
        currentScreen: { availLeft: 0, availTop: 0, availWidth: 1_000, availHeight: 800 },
        screens: [{ availLeft: 0, availTop: 0, availWidth: 1_000, availHeight: 800 }],
      });
      await Promise.resolve();
    });
    expect(screen.getByRole("alert").textContent).toContain("사용 가능한 다른 화면을 찾지 못했습니다");
  });

  it("announces unsupported automatic placement as an alert", () => {
    Reflect.deleteProperty(window, "getScreenDetails");
    renderCompanion();

    fireEvent.click(screen.getByRole("button", { name: "다른 화면으로 창 이동" }));

    expect(screen.getByRole("alert").textContent).toContain("자동 창 배치를 지원하지 않습니다");
  });

  it("drops a late screen permission result after an invalid-session page unmounts", async () => {
    let resolveDetails: ((value: {
      currentScreen: unknown;
      screens: unknown[];
    }) => void) | null = null;
    const getScreenDetails = vi.fn(() => new Promise<{
      currentScreen: unknown;
      screens: unknown[];
    }>((resolve) => {
      resolveDetails = resolve;
    }));
    const moveTo = vi.spyOn(window, "moveTo").mockImplementation(() => undefined);
    vi.spyOn(window, "resizeTo").mockImplementation(() => undefined);
    Object.defineProperty(window, "getScreenDetails", { configurable: true, value: getScreenDetails });
    const view = renderCompanion("/studio/tools-companion?session=invalid");
    fireEvent.click(screen.getByRole("button", { name: "다른 화면으로 창 이동" }));
    view.unmount();
    await act(async () => {
      resolveDetails?.({
        currentScreen: { availLeft: 0, availTop: 0, availWidth: 1_000, availHeight: 800 },
        screens: [
          { availLeft: 0, availTop: 0, availWidth: 1_000, availHeight: 800 },
          { availLeft: 1_000, availTop: 0, availWidth: 1_000, availHeight: 800 },
        ],
      });
      await Promise.resolve();
    });
    expect(moveTo).not.toHaveBeenCalled();
  });
});
