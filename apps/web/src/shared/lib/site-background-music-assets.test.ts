import { readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseSiteBgmManifest } from "./site-background-music";

const AUDIO_DIRECTORY = new URL("../../../public/audio/", import.meta.url);

function hasMp3Signature(bytes: Uint8Array): boolean {
  return (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
    || (bytes[0] === 0xff && (bytes[1] ?? 0) >= 0xe0);
}

describe("site background music assets", () => {
  it("ships a reviewed, playable same-origin vocal playlist", () => {
    const manifest = JSON.parse(readFileSync(new URL("playlist.json", AUDIO_DIRECTORY), "utf8")) as unknown;
    const tracks = parseSiteBgmManifest(manifest);

    expect(tracks.length).toBeGreaterThanOrEqual(3);
    expect(new Set(tracks.map((track) => track.title)).size).toBe(tracks.length);

    for (const track of tracks) {
      const filename = track.src.replace(/^\/audio\//u, "");
      const fileUrl = new URL(filename, AUDIO_DIRECTORY);
      const bytes = readFileSync(fileUrl);
      const size = statSync(fileUrl).size;

      expect(filename).toMatch(/\.(?:mp3|ogg|wav|m4a)$/u);
      expect(size).toBeGreaterThan(16_000);
      expect(size).toBeLessThan(10_000_000);
      if (filename.endsWith(".mp3")) expect(hasMp3Signature(bytes)).toBe(true);
    }
  });
});
