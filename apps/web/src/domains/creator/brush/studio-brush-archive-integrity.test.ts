import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrush, DEFAULT_STUDIO_BRUSH_SNAPSHOT, importBrushFromJson, writeBrushJson } from "./studio-brush-library";
import { BRUSH_SOURCE_ARCHIVE_MAX_BYTES, BRUSH_SOURCE_ARCHIVE_MAX_CHARACTERS,
  BRUSH_SOURCE_SETTINGS_MAX_CHARACTERS, createStudioBrushOriginalSource,
  decodeStudioBrushOriginalSource } from "./studio-brush-original-source";

afterEach(() => vi.restoreAllMocks());

describe("brush archive transport uses the same bounded UTF-8 contract", () => {
  it("does not export settings that its own importer would reject for size", () => {
    const brush = createBrush("가".repeat(Math.ceil(BRUSH_SOURCE_SETTINGS_MAX_CHARACTERS / 3)), DEFAULT_STUDIO_BRUSH_SNAPSHOT);
    const before = { ...brush };
    expect(() => writeBrushJson(brush)).toThrow(/크기|2M/u);
    expect(brush).toEqual(before);
  });
  it("rejects oversized UTF-8 before JSON parsing, even below the character bound", () => {
    const text = JSON.stringify("가".repeat(Math.ceil(BRUSH_SOURCE_ARCHIVE_MAX_BYTES / 3)));
    expect(text.length).toBeLessThan(BRUSH_SOURCE_ARCHIVE_MAX_CHARACTERS);
    const parse = vi.spyOn(JSON, "parse");
    expect(() => importBrushFromJson(text)).toThrow(/크기/u);
    expect(parse).not.toHaveBeenCalled();
  });
  it("keeps normal settings bytes and source-free schema unchanged", () => {
    const brush = createBrush("한글 펜", DEFAULT_STUDIO_BRUSH_SNAPSHOT);
    const serialized = writeBrushJson(brush);
    const restored = importBrushFromJson(serialized).brush;
    expect(writeBrushJson(restored)).toBe(serialized);
    expect(restored).not.toHaveProperty("originalSource");
  });
  it("retains canonical source bytes when archived settings are changed", () => {
    const bytes = new TextEncoder().encode(' {"version":3,"comment":"원본"}\r\n');
    const originalSource = createStudioBrushOriginalSource(bytes, "원본.myb", "myb");
    const brush = { ...createBrush("수정 펜", DEFAULT_STUDIO_BRUSH_SNAPSHOT), strokeWidth: 27, originalSource };
    const serialized = writeBrushJson(brush);
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThan(BRUSH_SOURCE_ARCHIVE_MAX_BYTES);
    const restored = importBrushFromJson(serialized).brush;
    expect(restored.strokeWidth).toBe(27);
    expect(createHash("sha256").update(decodeStudioBrushOriginalSource(restored.originalSource)).digest("hex"))
      .toBe(originalSource.sha256);
  });
});
