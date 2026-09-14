import { describe, expect, it } from "vitest";
import { cameraTransform, cleanMotionCaption, motionCaptionLines, motionImageType, motionMoodDefaults, motionPreset, motionProgress, MOTION_PRESETS } from "./motion-panel-model";
import { comicCast, comicMood, comicPlayLink, comicPortrait, COMIC_CAST } from "@/shared/components/comic/comic-cast";
import { CHARACTERS } from "@toonspectrum/core/fortune";
import { playDirectorLines } from "./play-director";

describe("shared original cast and private handoff", () => {
  it("uses the existing original cast assets without importing the engine in the UI metadata", () => {
    for (const actor of COMIC_CAST) expect(CHARACTERS.find((c) => c.id === actor.id)?.avatarUrl).toBe(comicPortrait(actor.id));
  });
  it.each([null, undefined, "unknown", "../../secret", "javascript:alert(1)", { id: "danwoo" }])("rejects unrecognized presentation values: %s", (value) => {
    expect(comicCast(value).id).toBe("ara"); expect(comicMood(value)).toBe("spark");
  });
  it.each(COMIC_CAST)("hands off only presentation data for $id", ({ id }) => {
    const url = new URL(comicPlayLink(id, "heart"), "https://example.test");
    expect([...url.searchParams.keys()]).toEqual(["game", "cast", "mood"]);
    expect(url.searchParams.get("cast")).toBe(id); expect(url.searchParams.get("game")).toBe("motion-panel");
    expect(playDirectorLines("motion-panel", id).lead.length).toBeGreaterThan(12);
  });
});
describe("motion panel direction", () => {
  it.each([NaN, Infinity, -Infinity, -100, 0, .3, 1, 100])("bounds progress %s", (input) => {
    const value = motionProgress(input); expect(Number.isFinite(value)).toBe(true); expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(1);
  });
  it.each(MOTION_PRESETS)("has a distinct finite camera path for $id", ({ id }) => {
    expect(cameraTransform(id, 0)).not.toBe(cameraTransform(id, .5));
    expect(cameraTransform(id, 0)).toBe(cameraTransform(id, -1));
    expect(cameraTransform(id, 1)).toBe(cameraTransform(id, 2));
    expect(cameraTransform(id, NaN)).not.toMatch(/NaN|Infinity/);
    expect(motionPreset(id).id).toBe(id);
  });
  it("falls back safely for unknown presets and maps all moods", () => {
    expect(motionPreset("oops").id).toBe("focus");
    for (const mood of ["spark", "heart", "quest", "rest"] as const) expect(MOTION_PRESETS.some((p) => p.id === motionMoodDefaults(mood).preset)).toBe(true);
  });
  it("bounds captions without splitting surrogate pairs and strips control characters", () => {
    expect(Array.from(cleanMotionCaption("🙂".repeat(100)))).toHaveLength(60);
    expect(motionCaptionLines("가".repeat(80)).map((v) => v.length)).toEqual([20, 20, 20]);
    expect(cleanMotionCaption("안녕\n다음\u0000컷")).toBe("안녕 다음 컷");
    expect(motionCaptionLines("")).toEqual([]);
  });
  it("recognizes only supported raster signatures", () => {
    expect(motionImageType(new Uint8Array([137,80,78,71,13,10,26,10]))).toBe("image/png");
    expect(motionImageType(new Uint8Array([255,216,255]))).toBe("image/jpeg");
    expect(motionImageType(new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]))).toBe("image/webp");
    for (const invalid of ["<svg>", "GIF89a", "", "RIFF", "<script>"]) expect(motionImageType(new TextEncoder().encode(invalid))).toBeNull();
  });
});
