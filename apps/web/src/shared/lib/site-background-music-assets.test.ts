import { readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseSiteBgmManifest } from "./site-background-music";

const AUDIO_DIRECTORY = new URL("../../../public/audio/", import.meta.url);

function hasMp3Signature(bytes: Uint8Array): boolean {
  return (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
    || (bytes[0] === 0xff && (bytes[1] ?? 0) >= 0xe0);
}

describe("site background music assets", () => {
  it("publishes twelve approved originals including the six Prism Awakening masters", () => {
    const manifest = JSON.parse(readFileSync(new URL("playlist.json", AUDIO_DIRECTORY), "utf8")) as {
      version?: unknown;
      publishedAt?: unknown;
      tracks?: unknown;
    };

    expect(manifest.version).toBe(3);
    expect(typeof manifest.publishedAt).toBe("string");
    const tracks = parseSiteBgmManifest(manifest);
    expect(tracks).toHaveLength(12);
    const ids = new Set(tracks.map((track) => track.id));
    for (const id of ["spectrum-breaker-vocal", "wings-of-the-unwritten-vocal", "oath-of-a-thousand-lights-vocal", "where-the-stars-return-vocal", "atlas-of-starlight-instrumental", "dawnfall-protocol-instrumental"]) {
      expect(ids.has(id)).toBe(true);
    }
    expect(parseSiteBgmManifest({ version: 2, publishedAt: null, tracks: [] })).toEqual([]);
  });

  it("validates every explicitly published entry against its same-origin media file", () => {
    const manifest = JSON.parse(readFileSync(new URL("playlist.json", AUDIO_DIRECTORY), "utf8")) as unknown;
    const tracks = parseSiteBgmManifest(manifest);

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

  it("accepts a deterministic approved-catalog metadata fixture without publishing fixture media", () => {
    const [track] = parseSiteBgmManifest({
      tracks: [{
        id: "approved-metadata-fixture",
        src: "/audio/original/approved-metadata-fixture.mp3",
        title: "Approved metadata fixture",
        artist: "ToonSpectrum test fixture",
        role: "opening",
        origin: "original",
        vocalMode: "vocal",
        language: "ko",
        summary: "Deterministic fixture for the approved manifest path.",
        license: "Test fixture only; no media is published by this test.",
        creditUrl: "https://example.invalid/toonspectrum-ost-fixture",
        profiles: ["animation"],
        intensity: "normal",
        durationMs: 210_000,
        bpm: 128,
        provider: "elevenlabs",
        model: "music_v2_5",
        sha256: "a".repeat(64),
        generatedAt: "2026-09-18T00:00:00.000Z",
        provenance: "c2pa-requested",
        c2paRequested: true,
        status: "published",
      }],
    });

    expect(track).toMatchObject({
      id: "approved-metadata-fixture",
      src: "/audio/original/approved-metadata-fixture.mp3",
      origin: "original",
      status: "published",
    });
  });
});
