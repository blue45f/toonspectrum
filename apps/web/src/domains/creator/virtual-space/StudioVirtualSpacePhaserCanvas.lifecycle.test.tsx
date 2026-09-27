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
  fixture.scene.mockClear();
  frames.splice(0);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function props(): StudioVirtualSpacePhaserCanvasProps {
  return {
    manifest: studioVirtualPlaceWorldManifest("skyport"), bridge: new StudioVirtualSpaceEngineBridge(),
    snapshot: { self: { x: 480, y: 540, facing: "up", moving: false, avatarIndex: 0, activity: "available", zoneId: "skyport" },
      peers: [], nearbyPeers: [], selfReaction: null, peerReactions: [], direct: false },
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
});
