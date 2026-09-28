// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductTourMp4Player } from "./ProductTourMp4Player";

const { suspendBgmForContext, resumeBgmForContext } = vi.hoisted(() => ({
  suspendBgmForContext: vi.fn(),
  resumeBgmForContext: vi.fn(),
}));

vi.mock("./use-seekable-media-asset", () => ({
  useSeekableMediaAsset: (source: string | null) => ({ source, url: source, error: null, loading: false }),
}));

vi.mock("@toonstudio/core/fx", () => ({
  suspendBgmForContext,
  resumeBgmForContext,
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/product-tour");
  suspendBgmForContext.mockReset();
  resumeBgmForContext.mockReset();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(1);
  vi.spyOn(HTMLMediaElement.prototype, "duration", "get").mockReturnValue(504);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPlayer(locale: "ko" | "en" = "ko") {
  return render(
    <MemoryRouter initialEntries={["/product-tour"]}>
      <ProductTourMp4Player locale={locale} />
    </MemoryRouter>,
  );
}

describe("ProductTourMp4Player", () => {
  it("loads the versioned narrated film on demand with both caption languages", () => {
    const { container } = renderPlayer("ko");
    expect(container.querySelector("video")).toBeNull();

    fireEvent.click(container.querySelector<HTMLButtonElement>(".product-tour-player__poster")!);
    const video = container.querySelector<HTMLVideoElement>("video")!;
    expect(video.getAttribute("src")).toMatch(
      /^\/brand\/toonstudio-product-tour\.mp4\?v=[a-f0-9]{16}$/u,
    );

    const tracks = Array.from(video.querySelectorAll("track"));
    expect(tracks).toHaveLength(2);
    expect(tracks.map((track) => track.srclang)).toEqual(["ko", "en"]);
    expect(tracks[0]?.default).toBe(true);
    expect(tracks[1]?.default).toBe(false);

    fireEvent.loadedMetadata(video);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  });

  it("suspends site BGM while playing and restores it on pause", () => {
    const { container } = renderPlayer("ko");
    fireEvent.click(container.querySelector<HTMLButtonElement>(".product-tour-player__poster")!);
    const video = container.querySelector<HTMLVideoElement>("video")!;

    fireEvent.play(video);
    expect(suspendBgmForContext).toHaveBeenCalledWith("product-tour-video");
    fireEvent.pause(video);
    expect(resumeBgmForContext).toHaveBeenCalledWith("product-tour-video");
  });

  it("recovers twice from media errors at the same position before exposing retry", async () => {
    const { container } = renderPlayer("ko");
    fireEvent.click(container.querySelector<HTMLButtonElement>(".product-tour-player__poster")!);

    let video = container.querySelector<HTMLVideoElement>("video")!;
    fireEvent.loadedMetadata(video);
    video.currentTime = 213;
    fireEvent.error(video);

    await waitFor(() => {
      expect(container.querySelector("video")?.getAttribute("src")).toContain("recovery=1");
    });
    video = container.querySelector<HTMLVideoElement>("video")!;
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(213);
    fireEvent.error(video);

    await waitFor(() => {
      expect(container.querySelector("video")?.getAttribute("src")).toContain("recovery=2");
    });
    video = container.querySelector<HTMLVideoElement>("video")!;
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(213);
    fireEvent.error(video);

    await waitFor(() => {
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("현재 위치에서 다시 시도");
  });
  it("이전 play 요청의 늦은 실패는 새로운 탐색을 되돌리지 않는다", async () => {
    let rejectPrevious: (reason: Error) => void = () => { throw new Error("play request not initialized"); };
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectPrevious = reject; }));
    const { container } = renderPlayer("ko");
    fireEvent.click(container.querySelector<HTMLButtonElement>(".product-tour-player__poster")!);
    const video = container.querySelector<HTMLVideoElement>("video")!;
    fireEvent.loadedMetadata(video);
    fireEvent.click(container.querySelectorAll<HTMLButtonElement>(".product-tour-player__chapter > button")[2]!);
    expect(video.currentTime).toBe(108);
    await act(async () => { rejectPrevious(new Error("old decode failure")); });
    expect(container.querySelector("video")).toBe(video);
    expect(video.getAttribute("src")).not.toContain("recovery=");
    expect(video.currentTime).toBe(108);
  });

});
