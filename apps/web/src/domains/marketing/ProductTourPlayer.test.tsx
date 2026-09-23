// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductTourPlayer } from "./ProductTourPlayer";

const playerHarness = vi.hoisted(() => {
  type Listener = (event: { readonly detail: unknown }) => void;
  const listeners = new Map<string, Set<Listener>>();
  const harness = {
    lastProps: null as Record<string, unknown> | null,
    currentFrame: 0,
    volume: 1,
    muted: false,
    playing: false,
    play: vi.fn(() => { harness.playing = true; }),
    pause: vi.fn(() => { harness.playing = false; }),
    seekTo: vi.fn((frame: number) => { harness.currentFrame = frame; }),
    getCurrentFrame: vi.fn(() => harness.currentFrame),
    setVolume: vi.fn((volume: number) => { harness.volume = volume; }),
    getVolume: vi.fn(() => harness.volume),
    isMuted: vi.fn(() => harness.muted),
    isPlaying: vi.fn(() => harness.playing),
    mute: vi.fn(() => { harness.muted = true; }),
    unmute: vi.fn(() => { harness.muted = false; }),
    getContainerNode: vi.fn(() => null),
    getScale: vi.fn(() => 1),
    requestFullscreen: vi.fn(),
    exitFullscreen: vi.fn(),
    isFullscreen: vi.fn(() => false),
    toggle: vi.fn(),
    pauseAndReturnToPlayStart: vi.fn(),
    addEventListener: vi.fn((name: string, listener: Listener) => {
      const bucket = listeners.get(name) ?? new Set<Listener>();
      bucket.add(listener);
      listeners.set(name, bucket);
    }),
    removeEventListener: vi.fn((name: string, listener: Listener) => {
      listeners.get(name)?.delete(listener);
    }),
    emit(name: string, detail: unknown) {
      for (const listener of listeners.get(name) ?? []) listener({ detail });
    },
    reset() {
      listeners.clear();
      harness.lastProps = null;
      harness.currentFrame = 0;
      harness.volume = 1;
      harness.muted = false;
      harness.playing = false;
      for (const value of Object.values(harness)) {
        if (typeof value === "function" && "mockReset" in value) {
          (value as ReturnType<typeof vi.fn>).mockReset();
        }
      }
      harness.play.mockImplementation(() => { harness.playing = true; });
      harness.pause.mockImplementation(() => { harness.playing = false; });
      harness.seekTo.mockImplementation((frame: number) => { harness.currentFrame = frame; });
      harness.getCurrentFrame.mockImplementation(() => harness.currentFrame);
      harness.setVolume.mockImplementation((volume: number) => { harness.volume = volume; });
      harness.getVolume.mockImplementation(() => harness.volume);
      harness.isMuted.mockImplementation(() => harness.muted);
      harness.isPlaying.mockImplementation(() => harness.playing);
      harness.unmute.mockImplementation(() => { harness.muted = false; });
    },
  };
  return harness;
});

vi.mock("@remotion/player", async () => {
  const React = await import("react");
  const Player = React.forwardRef<unknown, Record<string, unknown>>((props, ref) => {
    React.useEffect(() => {
      playerHarness.lastProps = props;
    }, [props]);
    React.useImperativeHandle(ref, () => playerHarness);
    return React.createElement("div", {
      "data-testid": "remotion-player",
      "data-controls": String(props.controls),
    });
  });
  Player.displayName = "MockRemotionPlayer";
  return { Player };
});

const { suspendBgmForContext, resumeBgmForContext } = vi.hoisted(() => ({
  suspendBgmForContext: vi.fn(),
  resumeBgmForContext: vi.fn(),
}));

vi.mock("@toonspectrum/core/fx", () => ({
  suspendBgmForContext,
  resumeBgmForContext,
}));

beforeEach(() => {
  playerHarness.reset();
  suspendBgmForContext.mockReset();
  resumeBgmForContext.mockReset();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPlayer(locale: "ko" | "en" = "ko") {
  return render(
    <MemoryRouter initialEntries={["/product-tour"]}>
      <ProductTourPlayer locale={locale} />
    </MemoryRouter>,
  );
}

function inputProps() {
  return playerHarness.lastProps?.inputProps as {
    readonly narrationEnabled: boolean;
    readonly bgmEnabled: boolean;
    readonly captionsEnabled: boolean;
    readonly onAudioIssue?: (issue: {
      channel: "narration" | "bgm";
      message: string;
    }) => void;
  };
}

describe("ProductTourPlayer Remotion runtime", () => {
  it("mounts Remotion lazily and starts audibly inside the direct user gesture", () => {
    const { container, getByTestId, queryByTestId } = renderPlayer("ko");
    expect(queryByTestId("remotion-player")).toBeNull();
    expect(container.querySelector("video")).toBeNull();

    fireEvent.click(container.querySelector<HTMLButtonElement>(".product-tour-player__poster")!);

    expect(getByTestId("remotion-player")).not.toBeNull();
    expect(playerHarness.lastProps).toMatchObject({
      initiallyMuted: false,
      initialVolume: 1,
      numberOfSharedAudioTags: 2,
      sampleRate: 48_000,
    });
    expect(playerHarness.seekTo).toHaveBeenCalledWith(0);
    expect(playerHarness.setVolume).toHaveBeenCalledWith(1);
    expect(playerHarness.unmute).toHaveBeenCalledOnce();
    expect(playerHarness.play).toHaveBeenCalledOnce();
    expect(getByTestId("remotion-player").getAttribute("data-controls")).toBe("true");
  });

  it("keeps narration, BGM and captions independently controllable", async () => {
    const { container, getByRole } = renderPlayer("ko");
    fireEvent.click(container.querySelector<HTMLButtonElement>(".product-tour-player__poster")!);
    expect(inputProps()).toMatchObject({
      narrationEnabled: true,
      bgmEnabled: true,
      captionsEnabled: true,
    });

    fireEvent.click(getByRole("button", { name: "내레이션" }));
    await waitFor(() => expect(inputProps().narrationEnabled).toBe(false));

    fireEvent.click(getByRole("button", { name: "BGM" }));
    await waitFor(() => expect(inputProps().bgmEnabled).toBe(false));

    fireEvent.click(getByRole("button", { name: "자막" }));
    await waitFor(() => expect(inputProps().captionsEnabled).toBe(false));
  });

  it("suspends site BGM during Remotion playback and restores it when paused", () => {
    const { container } = renderPlayer("ko");
    fireEvent.click(container.querySelector<HTMLButtonElement>(".product-tour-player__poster")!);

    act(() => playerHarness.emit("play", undefined));
    expect(suspendBgmForContext).toHaveBeenCalledWith("product-tour-video");

    act(() => playerHarness.emit("pause", undefined));
    expect(resumeBgmForContext).toHaveBeenCalledWith("product-tour-video");
  });

  it("seeks chapters in frames and keeps playback inside the click gesture", () => {
    const { container } = renderPlayer("ko");
    const chapterButtons = container.querySelectorAll<HTMLButtonElement>(
      ".product-tour-player__chapter > button",
    );

    fireEvent.click(chapterButtons[4]!);
    expect(playerHarness.seekTo).toHaveBeenCalledWith(228 * 30);
    expect(playerHarness.play).toHaveBeenCalledOnce();
  });

  it("offers an explicit sound recovery action when the browser mutes playback", () => {
    const { container, getByRole } = renderPlayer("ko");
    fireEvent.click(container.querySelector<HTMLButtonElement>(".product-tour-player__poster")!);

    act(() => playerHarness.emit("mutechange", { isMuted: true }));
    const recovery = getByRole("button", { name: /소리가 꺼져 있습니다/u });
    fireEvent.click(recovery);

    expect(playerHarness.setVolume).toHaveBeenLastCalledWith(1);
    expect(playerHarness.unmute).toHaveBeenCalledTimes(2);
  });

  it("falls back to the resilient MP4 player at the current position after a fatal error", async () => {
    const { container } = renderPlayer("ko");
    fireEvent.click(container.querySelector<HTMLButtonElement>(".product-tour-player__poster")!);
    playerHarness.currentFrame = 229 * 30;

    act(() => playerHarness.emit("error", { error: new Error("runtime audio failed") }));

    await waitFor(() => {
      expect(container.querySelector('[data-testid="remotion-player"]')).toBeNull();
      expect(container.querySelector(".product-tour-player__fallback-notice")).not.toBeNull();
      expect(container.querySelector("video")).not.toBeNull();
    });
    expect(container.textContent).toContain("호환 MP4");
  });

  it("falls back to MP4 when a runtime audio element fails", async () => {
    const { container } = renderPlayer("ko");
    fireEvent.click(container.querySelector<HTMLButtonElement>(".product-tour-player__poster")!);
    playerHarness.currentFrame = 191 * 30;

    act(() => inputProps().onAudioIssue?.({
      channel: "narration",
      message: "html5 audio failed",
    }));

    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
  });

});
