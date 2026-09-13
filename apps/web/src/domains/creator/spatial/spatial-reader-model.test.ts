import { describe, expect, it } from "vitest";
import {
  SPATIAL_READER_DEFAULTS, SPATIAL_READER_STORAGE_KEY,
  isSpatialReaderImageSource, loadSpatialReaderPreferences, moveSpatialReaderCursor,
  normalizeSpatialReaderSettings, resolveSpatialReaderCursor, resolveSpatialReaderImageSource, saveSpatialReaderPreferences,
  spatialReaderCrops, spatialReaderKeyCommand, spatialReaderStickStep,
  spatialReaderTextureSize, validateSpatialReaderFiles,
} from "./spatial-reader-model";

const size = { width: 800, height: 10000 };
const sizes = { 0: size, 1: { width: 1200, height: 800 } };
function memory() {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); } };
}
describe("spatial reading contracts", () => {
  it.each([undefined, null, {}, [], "ar", 42])("normalizes invalid settings %j", (input) => {
    expect(normalizeSpatialReaderSettings(input)).toEqual(SPATIAL_READER_DEFAULTS);
  });
  it("clamps settings without carrying device data", () => {
    const s = normalizeSpatialReaderSettings({ distance: Infinity, scale: 100, layout: "arc", direction: "rtl", roomPose: [1, 2], dwell: "true", camera: {} });
    expect(s).toMatchObject({ distance: 2, scale: 1.8, layout: "arc", direction: "rtl", dwell: false });
    expect(s).not.toHaveProperty("roomPose"); expect(s).not.toHaveProperty("camera");
  });
  it.each([{ width: 800, height: 12000 }, { width: 1, height: 65536 }, { width: 1000, height: 1200 }, { width: 1, height: 1 }])("covers every row with bounded windows: %j", (input) => {
    const crops = spatialReaderCrops(input, true);
    expect(crops.length).toBeLessThanOrEqual(256); expect(crops[0]!.y).toBe(0);
    expect(crops.at(-1)!.y + crops.at(-1)!.height).toBe(input.height);
    for (let i = 1; i < crops.length; i++) {
      expect(crops[i]!.y).toBeLessThanOrEqual(crops[i - 1]!.y + crops[i - 1]!.height);
      expect(crops[i]!.y).toBeGreaterThan(crops[i - 1]!.y);
    }
  });
  it("whole-page mode never crops and unknown sizes stay navigable", () => {
    expect(spatialReaderCrops(size, false)).toEqual([{ y: 0, ...size }]);
    expect(spatialReaderCrops(undefined, true)).toHaveLength(1);
  });
  it("steps through windows before switching pages", () => {
    expect(moveSpatialReaderCursor({ page: 0, segment: 0 }, "next", 2, sizes, true)).toEqual({ page: 0, segment: 1 });
    expect(moveSpatialReaderCursor({ page: 0, segment: 999 }, "next", 2, sizes, true)).toEqual({ page: 1, segment: 0 });
    expect(moveSpatialReaderCursor({ page: 1, segment: 0 }, "next", 2, sizes, true)).toEqual({ page: 1, segment: 0 });
  });
  it("keeps last-segment intent until previous page dimensions arrive", () => {
    const cursor = moveSpatialReaderCursor({ page: 1, segment: 0 }, "previous", 2, {}, true);
    expect(resolveSpatialReaderCursor(cursor, 2, {}, true)).toEqual({ page: 0, segment: 0 });
    expect(resolveSpatialReaderCursor(cursor, 2, sizes, true).segment).toBe(spatialReaderCrops(size, true).length - 1);
  });
  it("never produces negative/NaN coordinates for invalid counts", () => {
    for (const count of [0, -1, NaN, Infinity]) expect(resolveSpatialReaderCursor({ page: NaN, segment: Infinity }, count, {}, true)).toEqual({ page: 0, segment: 0 });
  });
  it.each(["ltr", "rtl"] as const)("keeps canonical order and maps directional keys (%s)", (direction) => {
    expect(spatialReaderKeyCommand("ArrowRight", direction)).toBe(direction === "ltr" ? "next" : "previous");
    expect(spatialReaderKeyCommand("ArrowLeft", direction)).toBe(direction === "ltr" ? "previous" : "next");
    expect(spatialReaderKeyCommand("ArrowDown", direction)).toBe("next");
    expect(spatialReaderKeyCommand("Home", direction)).toBe("first");
    expect(spatialReaderKeyCommand("End", direction)).toBe("last"); expect(spatialReaderKeyCommand("a", direction)).toBeNull();
  });
  it.each([1024, 1536, 2048])("bounds texture edges to %i with correct proportions", (edge) => {
    const output = spatialReaderTextureSize({ y: 0, width: 4000, height: 12000 }, edge);
    expect(Math.max(output.width, output.height)).toBeLessThanOrEqual(edge);
    expect(output.width / output.height).toBeCloseTo(1 / 3, 2);
  });
  it.each(["javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zz4=", "file:///etc/passwd", "https://u:p@example.com/a.png", "http://other.test/a.png", "blob:https://other.test/id"])("rejects unsafe source %s", (source) => {
    expect(isSpatialReaderImageSource(source, "https://toonstudio.cloud/work/a")).toBe(false);
  });
  it.each(["/image.png", "https://cdn.example.com/a.png", "data:image/png;base64,aGVsbG8=", "blob:https://toonstudio.cloud/123"])("accepts raster source %s", (source) => {
    expect(isSpatialReaderImageSource(source, "https://toonstudio.cloud/work/a")).toBe(true);
  });
  it("accepts same-origin dev HTTP without credentials", () => {
    expect(isSpatialReaderImageSource("/a.png", "http://localhost:5173")).toBe(true);
    expect(isSpatialReaderImageSource("http://user:pass@localhost:5173/a", "http://localhost:5173")).toBe(false);
  });
  it("validates file count, size, combined budget and MIME", () => {
    const f = { name: "1.png", type: "image/png", size: 16 * 1024 * 1024 };
    expect(validateSpatialReaderFiles([f])).toBeNull(); expect(validateSpatialReaderFiles([])).toBeTruthy();
    expect(validateSpatialReaderFiles(Array(65).fill({ ...f, size: 1 }))).toMatch(/64/);
    expect(validateSpatialReaderFiles([{ ...f, size: 0 }])).toMatch(/16MB/);
    expect(validateSpatialReaderFiles([{ ...f, type: "image/svg+xml" }])).toMatch(/SVG/);
    expect(validateSpatialReaderFiles(Array(5).fill(f))).toMatch(/64MB/);
  });
  it("stores only preferences/progress and retains at most 64 works", () => {
    const storage = memory();
    for (let i = 0; i < 70; i++) saveSpatialReaderPreferences(storage, `work-${i}`, SPATIAL_READER_DEFAULTS, { page: i, segment: 1 });
    const raw = JSON.parse(storage.getItem(SPATIAL_READER_STORAGE_KEY)!);
    expect(raw.progress).toHaveLength(64); expect(raw.progress[0].id).toBe("work-6");
    expect(loadSpatialReaderPreferences(storage, "work-69").cursor.page).toBe(69);
    expect(Object.keys(raw).sort()).toEqual(["progress", "settings", "version"]);
    expect(saveSpatialReaderPreferences(storage, "local:private.png", SPATIAL_READER_DEFAULTS, { page: 8, segment: 4 })).toBe(true);
    expect(storage.getItem(SPATIAL_READER_STORAGE_KEY)).not.toContain("private.png");
  });
  it("survives corrupt, blocked and quota-exceeded storage", () => {
    const storage = memory(); storage.setItem(SPATIAL_READER_STORAGE_KEY, "{invalid}");
    expect(loadSpatialReaderPreferences(storage, "work").settings).toEqual(SPATIAL_READER_DEFAULTS);
    expect(saveSpatialReaderPreferences({ ...storage, setItem() { throw new Error("quota"); } }, "work", SPATIAL_READER_DEFAULTS, { page: 0, segment: 0 })).toBe(false);
    expect(loadSpatialReaderPreferences({ getItem() { throw new Error("blocked"); } }, "work").cursor.page).toBe(0);
  });
  it("latches held sticks until neutral without automatic movement", () => {
    expect(spatialReaderStickStep(1, false)).toEqual({ command: "next", latched: true });
    expect(spatialReaderStickStep(1, true)).toEqual({ command: null, latched: true });
    expect(spatialReaderStickStep(0, true)).toEqual({ command: null, latched: false });
    expect(spatialReaderStickStep(-1, false)).toEqual({ command: "previous", latched: true });
    expect(spatialReaderStickStep(NaN, true)).toEqual({ command: null, latched: false });
  });
});

describe("spatial image URL boundary", () => {
  const base = "https://toonstudio.cloud/work/chapter/";
  it("returns a canonical URL while preserving signed query parameters", () => {
    expect(resolveSpatialReaderImageSource("../page one.png?sig=a%2Fb&part=1", base))
      .toBe("https://toonstudio.cloud/work/page%20one.png?sig=a%2Fb&part=1");
  });
  it.each([undefined, "", "javascript:alert(1)", "java\tscript:alert(1)",
    "data:text/html;base64,PHN2Zz4=", "data:image/svg+xml;base64,PHN2Zz4=",
    "file:///tmp/page.png", "https://user:password@cdn.example/page.png",
    "http://cdn.example/page.png", "blob:https://other.test/id", "https://[invalid",
  ])("returns no renderable URL for rejected input %j", (source) => {
    expect(resolveSpatialReaderImageSource(source, base)).toBeNull();
  });
  it.each(["https://cdn.example/page.png", "data:image/png;base64,aGVsbG8=", "blob:https://toonstudio.cloud/local-id"])
    ("preserves an allowed image source %s", (source) => {
      expect(resolveSpatialReaderImageSource(source, base)).toBe(source);
    });
  it("supports same-origin development HTTP without opening mixed-origin HTTP", () => {
    expect(resolveSpatialReaderImageSource("/page.png", "http://localhost:5173/reader")).toBe("http://localhost:5173/page.png");
    expect(resolveSpatialReaderImageSource("http://localhost:5174/page.png", "http://localhost:5173/reader")).toBeNull();
  });
});
