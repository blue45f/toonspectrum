// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioP2pMediaTile } from "./StudioP2pMediaTile";

class TestStream {
  constructor(private tracks: MediaStreamTrack[] = []) {}
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter(track => track.kind === "audio"); }
  getVideoTracks() { return this.tracks.filter(track => track.kind === "video"); }
}
const audioTrack = { kind: "audio", stop: vi.fn() } as unknown as MediaStreamTrack;
const videoTrack = { kind: "video", stop: vi.fn() } as unknown as MediaStreamTrack;
const streamOf = (...tracks: MediaStreamTrack[]) => new TestStream(tracks) as unknown as MediaStream;
beforeEach(() => { vi.stubGlobal("MediaStream", TestStream); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("offers a user-gesture retry when browser audio autoplay is blocked", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError")).mockResolvedValue(undefined);
  render(<StudioP2pMediaTile name="상대" stream={streamOf(audioTrack)} muted={false} visual={false} />);
  fireEvent.click(await screen.findByRole("button", { name: "소리·영상 재생" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "소리·영상 재생" })).toBeNull());
  expect(play).toHaveBeenCalledTimes(2);
  expect((screen.getByLabelText("상대 영상") as HTMLVideoElement).playsInline).toBe(true);
});
it("retries audio when the user unmutes without assigning a video track to its sink", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  const stream = streamOf(audioTrack, videoTrack);
  const view = render(<StudioP2pMediaTile name="상대" stream={stream} muted visual={false} />);
  await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
  play.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
  view.rerender(<StudioP2pMediaTile name="상대" stream={stream} muted={false} visual={false} />);
  expect(await screen.findByRole("button", { name: "소리·영상 재생" })).toBeTruthy();
  expect(play).toHaveBeenCalledTimes(2);
  const audio = screen.getByLabelText("상대 음성") as HTMLAudioElement;
  expect((audio.srcObject as MediaStream).getTracks()).toEqual([audioTrack]);
  expect(audio.muted).toBe(false);
  expect((screen.getByLabelText("상대 영상") as HTMLVideoElement).srcObject).toBeNull();
});

it("plays voice independently of an inactive camera and detaches sinks without stopping owned tracks", () => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  const view = render(<StudioP2pMediaTile name="상대" stream={streamOf(audioTrack, videoTrack)} muted={false} visual />);
  const audio = screen.getByLabelText("상대 음성") as HTMLAudioElement;
  const video = screen.getByLabelText("상대 영상") as HTMLVideoElement;
  expect((audio.srcObject as MediaStream).getTracks()).toEqual([audioTrack]);
  expect((video.srcObject as MediaStream).getTracks()).toEqual([videoTrack]);
  expect(video.muted).toBe(true);
  view.unmount();
  expect(audio.srcObject).toBeNull(); expect(video.srcObject).toBeNull();
  expect(audioTrack.stop).not.toHaveBeenCalled(); expect(videoTrack.stop).not.toHaveBeenCalled();
});
