import { describe, expect, it } from "vitest";

import { importExternalMusicTrack } from "./studio-music-import";

import { defaultMusicBrief } from "@toonspectrum/core/studio-music";

function brief() {
  return {
    ...defaultMusicBrief(),
    title: "별빛 작업실",
    scene: "밤새 원고를 마친 작가가 창문을 열고 조용히 숨을 고른다.",
    mood: "healing",
    purpose: "bgm",
    seconds: 30,
    bpm: 72,
    instruments: ["piano", "bells"],
    rightsConfirmed: false,
  };
}

function namedBlob(bytes: Uint8Array, name: string, type: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return Object.assign(new Blob([copy.buffer], { type }), { name });
}

function mp3Bytes() {
  return new Uint8Array([73, 68, 51, ...Array<number>(61).fill(0)]);
}

function wavBytes() {
  const bytes = new Uint8Array(64);
  bytes.set([82, 73, 70, 70], 0);
  bytes.set([87, 65, 86, 69], 8);
  return bytes;
}

describe("external music import", () => {
  it("imports MP3 bytes with provider, source and SHA-256 provenance", async () => {
    const track = await importExternalMusicTrack(
      namedBlob(mp3Bytes(), "firefly-result.mp3", "audio/mpeg"),
      "adobe-firefly",
      brief(),
      "owner-a",
      new Date("2026-09-25T00:00:00.000Z"),
    );

    expect(track.audio.type).toBe("audio/mpeg");
    expect(track.metadata).toMatchObject({
      createdAt: "2026-09-25T00:00:00.000Z",
      provider: "adobe-firefly",
      model: "external",
      format: "mp3_external",
      source: "imported",
      sourceFilename: "firefly-result.mp3",
    });
    expect(track.metadata.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(track.metadata.termsUrl).toMatch(/^https:/u);
    expect(track.metadata.brief.rightsConfirmed).toBe(true);
  });

  it("preserves WAV format and sanitizes the recorded source filename", async () => {
    const track = await importExternalMusicTrack(
      namedBlob(wavBytes(), "../local-ace-step.wav", "audio/wav"),
      "ace-step-local",
      brief(),
      "owner-a",
    );

    expect(track.audio.type).toBe("audio/wav");
    expect(track.metadata.format).toBe("wav_external");
    expect(track.metadata.sourceFilename).toBe("local-ace-step.wav");
  });

  it("rejects invalid accounts, oversized files and disguised audio", async () => {
    await expect(importExternalMusicTrack(
      namedBlob(mp3Bytes(), "track.mp3", "audio/mpeg"),
      "ace-step-local",
      brief(),
      "../owner",
    )).rejects.toThrow(/계정/u);

    await expect(importExternalMusicTrack(
      namedBlob(new Uint8Array(20_000_001), "huge.mp3", "audio/mpeg"),
      "ace-step-local",
      brief(),
      "owner-a",
    )).rejects.toThrow(/20MB/u);

    await expect(importExternalMusicTrack(
      namedBlob(new TextEncoder().encode("<html>not audio</html>"), "fake.mp3", "audio/mpeg"),
      "stable-audio",
      brief(),
      "owner-a",
    )).rejects.toThrow(/MP3 또는 WAV/u);
  });
});
