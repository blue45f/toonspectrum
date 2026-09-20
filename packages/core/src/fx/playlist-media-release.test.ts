import { describe, expect, it, vi } from "vitest";

import { releasePlaylistMedia } from "./playlist-media-release";

describe("playlist media release", () => {
  it("releases old sources before resetting the loader, including repeated transitions", () => {
    for (let track = 0; track < 12; track += 1) {
      const events: string[] = [];
      const media = {
        pause: () => { events.push("pause"); },
        removeAttribute: (name: string) => { events.push(`remove:${name}`); },
        load: () => { events.push("load"); },
      };
      releasePlaylistMedia(media);
      expect(events).toEqual(["pause", "remove:src", "load"]);
    }
  });

  it("still cancels loading when pause fails and tolerates a detached loader", () => {
    const media = { pause: vi.fn(() => { throw new Error("detached"); }), removeAttribute: vi.fn(), load: vi.fn() };
    expect(() => releasePlaylistMedia(media)).not.toThrow();
    expect(media.removeAttribute).toHaveBeenCalledWith("src");
    expect(media.load).toHaveBeenCalledOnce();
    media.load.mockImplementation(() => { throw new Error("closed"); });
    expect(() => releasePlaylistMedia(media)).not.toThrow();
  });
});
