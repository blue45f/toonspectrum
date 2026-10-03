// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpacePhaserCanvas, type StudioVirtualSpacePhaserCanvasProps } from "./StudioVirtualSpacePhaserCanvas";
import { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";

const fixture = vi.hoisted(() => ({ scene: vi.fn() }));
vi.mock("phaser", () => ({
  Scene: class {
    constructor() { fixture.scene(); throw new Error("fixture-renderer-unavailable"); }
  },
}));

const frames: FrameRequestCallback[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  fixture.scene.mockClear();
  frames.splice(0);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

function props(): StudioVirtualSpacePhaserCanvasProps {
  return {
    manifest: studioVirtualPlaceWorldManifest("skyport"), bridge: new StudioVirtualSpaceEngineBridge(),
    snapshot: { self: { x: 480, y: 540, facing: "up", moving: false, avatarIndex: 0, activity: "available", zoneId: "skyport" },
      peers: [], nearbyPeers: [], selfReaction: null, peerReactions: [], chatMessages: [], chatBubbles: [], selfChatBubble: null, peerTyping: [], direct: false },
    onLocalState: vi.fn(), onInteract: vi.fn(), onPeerSelect: vi.fn(), onCancelFollow: vi.fn(),
  };
}

async function nextFrame() {
  await act(async () => { frames.shift()!(0); await vi.dynamicImportSettled(); });
}

describe("Phaser 장면 초기화 진단과 재시도", () => {
  it("실제 초기화 예외를 보존하고 재시도에서는 이전 오류·장면 정보를 지운다", async () => {
    const view = render(<StudioVirtualSpacePhaserCanvas {...props()} />);
    const host = view.container.querySelector<HTMLElement>("[data-studio-phaser-runtime]")!;
    await nextFrame();
    expect(host.dataset.studioEngineStatus).toBe("error");
    expect(host.dataset.bootStage).toBe("preparing-scene");
    expect(host.dataset.engineError).toBe("fixture-renderer-unavailable");
    act(() => { vi.advanceTimersByTime(25_000); });
    expect(host.dataset.engineError).toBe("fixture-renderer-unavailable");
    host.dataset.sceneArt = "previous-theme";
    host.dataset.tileError = "previous-tiles";
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(host.dataset.studioEngineStatus).toBe("loading");
    expect(host.dataset.bootStage).toBe("waiting-frame");
    expect(host.dataset.engineError).toBeUndefined();
    expect(host.dataset.sceneArt).toBeUndefined();
    expect(host.dataset.tileError).toBeUndefined();
    act(() => { vi.advanceTimersByTime(25_000); });
    expect(host.dataset.engineError).toBe("boot-timeout:waiting-frame");
  });

  it("테마 변경으로 취소된 초기화는 새 장면의 진단이나 상태를 덮지 않는다", async () => {
    const input = props();
    const view = render(<StudioVirtualSpacePhaserCanvas {...input} artStyle="webtoon" />);
    const host = view.container.querySelector<HTMLElement>("[data-studio-phaser-runtime]")!;
    view.rerender(<StudioVirtualSpacePhaserCanvas {...input} artStyle="pastel" />);
    await nextFrame();
    expect(fixture.scene).not.toHaveBeenCalled();
    expect(host.dataset.artStyle).toBe("pastel");
    expect(host.dataset.studioEngineStatus).toBe("loading");
    expect(host.dataset.engineError).toBeUndefined();
    await nextFrame();
    expect(fixture.scene).toHaveBeenCalledOnce();
    expect(host.dataset.engineError).toBe("fixture-renderer-unavailable");
  });
  it("탭을 숨긴 시간으로 초기화 실패를 만들지 않고 복귀 후 남은 예산만 사용한다", () => {
    const visibility = vi.spyOn(document, "hidden", "get");
    const view = render(<StudioVirtualSpacePhaserCanvas {...props()} />);
    const host = view.container.querySelector<HTMLElement>("[data-studio-phaser-runtime]");
    act(() => { vi.advanceTimersByTime(5_000); visibility.mockReturnValue(true); document.dispatchEvent(new Event("visibilitychange")); });
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(host?.dataset.studioEngineStatus).toBe("loading");
    expect(host?.dataset.engineError).toBeUndefined();
    act(() => { visibility.mockReturnValue(false); document.dispatchEvent(new Event("visibilitychange")); vi.advanceTimersByTime(20_000); });
    expect(host?.dataset.engineError).toBe("boot-timeout:waiting-frame");
  });

});
