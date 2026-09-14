// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StudioP2pMediaTile } from "./StudioP2pMediaTile";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("offers a user-gesture retry when browser autoplay is blocked", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError")).mockResolvedValue(undefined);
  render(<StudioP2pMediaTile name="상대" stream={{} as MediaStream} muted={false} visual />);
  fireEvent.click(await screen.findByRole("button", { name: "소리·영상 재생" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "소리·영상 재생" })).toBeNull());
  expect(play).toHaveBeenCalledTimes(2);
  expect((screen.getByLabelText("상대 영상") as HTMLVideoElement).playsInline).toBe(true);
});
it("retries media playback when the user unmutes the remote stream", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  const stream = {} as MediaStream;
  const view = render(<StudioP2pMediaTile name="상대" stream={stream} muted visual />);
  await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
  play.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
  view.rerender(<StudioP2pMediaTile name="상대" stream={stream} muted={false} visual />);
  expect(await screen.findByRole("button", { name: "소리·영상 재생" })).toBeTruthy();
  expect(play).toHaveBeenCalledTimes(2);
  view.unmount();
});
