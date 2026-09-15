import { describe, expect, it, vi } from "vitest";
import { sha256HexPortable } from "../studio-sha256";
import { DEFAULT_CONVERSION_SETTINGS, isModelFilename, validateConversionSettings, validateReferenceSet, type CharacterView, type PreparedCharacterImage } from "./conversion-contract";
import { buildCharacterImageGraph } from "./conversion-graph";
import { buildCharacterKit } from "./conversion-kit";
import { characterCameraPosition, renderCharacterGlb } from "./conversion-renderer";
import { deriveCharacterPasses, fitSubject, subjectBounds } from "./conversion-raster";

const reference = (view: CharacterView, hash: string = view): PreparedCharacterImage => ({ view, sha256: hash, png: new Uint8Array([1, 2, 3]), width: 512, height: 512, notices: [] });
function storedZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const files: Record<string, Uint8Array> = {};
  for (let offset = 0; view.getUint32(offset, true) === 0x04034b50;) {
    const size = view.getUint32(offset + 18, true); const nameSize = view.getUint16(offset + 26, true); const extra = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameSize)); const start = offset + 30 + nameSize + extra;
    files[name] = bytes.subarray(start, start + size); offset = start + size;
  }
  return files;
}
describe("character conversion contracts", () => {
  it("accepts the bounded default recipe", () => expect(() => validateConversionSettings(DEFAULT_CONVERSION_SETTINGS)).not.toThrow());
  it.each([-1, 1.5, NaN, Infinity, 2147483648])("rejects invalid seed %s", (seed) => expect(() => validateConversionSettings({ ...DEFAULT_CONVERSION_SETTINGS, seed })).toThrow());
  it.each([0, 0.9, NaN, Infinity])("rejects unsafe denoise %s", (strength) => expect(() => validateConversionSettings({ ...DEFAULT_CONVERSION_SETTINGS, strength })).toThrow());
  it.each(["../model.safetensors", "/model.safetensors", "https://a/model.safetensors", "model.ckpt", "a\\b.safetensors", "a/./b.safetensors"])("rejects model path %s", (name) => expect(isModelFilename(name)).toBe(false));
  it("permits an installed nested safetensors name", () => expect(isModelFilename("sdxl/character-v1.safetensors")).toBe(true));
  it("requires a real front view and engine-specific view count", () => {
    expect(() => validateReferenceSet("triposr", [reference("front")])).not.toThrow();
    expect(() => validateReferenceSet("triposr", [reference("front"), reference("left")])).toThrow();
    expect(() => validateReferenceSet("trellis", [reference("left")])).toThrow();
    expect(() => validateReferenceSet("trellis", [reference("front", "same"), reference("left", "same")])).toThrow();
  });
  it("accepts genuinely distinct multi-view references", () => expect(() => validateReferenceSet("trellis", [reference("front"), reference("left"), reference("back"), reference("right")])).not.toThrow());
});
describe("character raster preparation", () => {
  it("keeps disconnected accessories inside the crop", () => {
    const pixels = new Uint8ClampedArray(6 * 4 * 4); pixels[(1 * 6 + 1) * 4 + 3] = 255; pixels[(3 * 6 + 5) * 4 + 3] = 255;
    expect(subjectBounds({ width: 6, height: 4, pixels })).toEqual({ x: 1, y: 1, width: 5, height: 3, opaque: false });
  });
  it("rejects invisible and malformed sources", () => {
    expect(() => subjectBounds({ width: 2, height: 2, pixels: new Uint8ClampedArray(16) })).toThrow();
    expect(() => subjectBounds({ width: 2, height: 2, pixels: new Uint8ClampedArray(4) })).toThrow();
  });
  it("letterboxes without stretching or cutting off the subject", () => {
    const fit = fitSubject({ x: 0, y: 0, width: 50, height: 100, opaque: false }, 512);
    expect(fit.width / fit.height).toBeCloseTo(0.5); expect(fit.y).toBeCloseTo(51.2);
    expect(() => fitSubject({ x: 0, y: 0, width: 0, height: 100, opaque: false }, 512)).toThrow();
  });
  it("includes painted facial/garment boundaries in lineart", () => {
    const color = new Uint8ClampedArray(5 * 5 * 4).fill(255); const center = (2 * 5 + 2) * 4;
    color[center] = 0; color[center + 1] = 0; color[center + 2] = 0;
    const before = color.slice(); const constant = new Uint8ClampedArray(color.length).fill(128);
    const passes = deriveCharacterPasses(color, constant, constant, 5, 5);
    expect(passes.lineart[center]).toBe(0); expect(color).toEqual(before);
  });
  it("preserves source alpha and exports an opaque grayscale mask", () => {
    const source = new Uint8ClampedArray([100, 80, 60, 128, 0, 0, 0, 0]);
    const passes = deriveCharacterPasses(source, source, source, 2, 1);
    expect(passes.cel[3]).toBe(128); expect(passes.cel[7]).toBe(0); expect([...passes.mask.slice(0, 4)]).toEqual([128, 128, 128, 255]);
  });
  it("rejects oversized render rasters before allocating output", () => expect(() => deriveCharacterPasses(new Uint8ClampedArray(4), new Uint8ClampedArray(4), new Uint8ClampedArray(4), 2048, 2048)).toThrow());
});
describe("local AI graph and reproducible kits", () => {
  it("uses only explicit local models and deterministic bounded sampling", () => {
    const graph = buildCharacterImageGraph(DEFAULT_CONVERSION_SETTINGS, "front");
    expect(graph["6"].inputs).toMatchObject({ seed: 73, denoise: 0.35, steps: 28, sampler_name: "dpmpp_2m" });
    expect(graph["2"].inputs.image).toBe("input/front.png");
    expect(graph["9"]).toBeUndefined();
    expect(JSON.stringify(graph)).not.toMatch(/https?:/u);
  });
  it("wires both conditioning outputs through optional depth ControlNet", () => {
    const graph = buildCharacterImageGraph({ ...DEFAULT_CONVERSION_SETTINGS, controlNet: "sdxl/depth.safetensors" }, "back");
    expect(graph["10"].inputs.image).toBe("depth/back.png");
    expect(graph["6"].inputs.positive).toEqual(["11", 0]); expect(graph["6"].inputs.negative).toEqual(["11", 1]);
    expect(graph["11"].inputs).toMatchObject({ start_percent: 0, end_percent: 0.85, strength: 0.8 });
  });
  it("labels preparation honestly and hashes the exported input", async () => {
    const input = { kind: "shape" as const, engine: "triposr" as const, settings: DEFAULT_CONVERSION_SETTINGS, images: [reference("front")], renders: [] };
    const bytes = await buildCharacterKit(input, new AbortController().signal);
    const files = storedZip(bytes); const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
    expect(manifest.status).toBe("prepared-not-inferred");
    expect(manifest.checksums["input/front.png"]).toBe(sha256HexPortable(files["input/front.png"]));
    expect(new TextDecoder().decode(files["run-character-ai.py"])).toContain("def validate_graph");
    expect(await buildCharacterKit(input, new AbortController().signal)).toEqual(bytes);
  });
  it("cancels kit preparation before producing an artifact", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(buildCharacterKit({ kind: "shape", engine: "triposr", settings: DEFAULT_CONVERSION_SETTINGS, images: [reference("front")], renders: [] }, controller.signal)).rejects.toThrow();
  });
});
describe("bounded character rendering", () => {
  it("keeps four cardinal cameras at the same distance and scale", () => {
    expect(characterCameraPosition("front", 2).toArray()).toEqual([0, 0, 6]);
    expect(characterCameraPosition("left", 2).x).toBeCloseTo(-6);
    expect(characterCameraPosition("right", 2).x).toBeCloseTo(6);
    expect(characterCameraPosition("back", 2).z).toBeCloseTo(-6);
    expect(characterCameraPosition("front", 2, 45, 30).length()).toBeCloseTo(6);
  });
  it("rejects invalid camera bounds", () => {
    expect(() => characterCameraPosition("front", NaN)).toThrow();
    expect(() => characterCameraPosition("front", 1, 181)).toThrow();
    expect(() => characterCameraPosition("front", 1, 0, 61)).toThrow();
  });
  it("rejects oversized files before reading their bytes", async () => {
    const read = vi.fn(); const file = { size: 65 * 1024 * 1024, arrayBuffer: read } as unknown as File;
    await expect(renderCharacterGlb(file, 512, ["front"], { yaw: 0, pitch: 0, animationTime: 0 }, new AbortController().signal, vi.fn())).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects cancelled rendering before reading or loading a model", async () => {
    const read = vi.fn(); const file = { size: 100, arrayBuffer: read } as unknown as File;
    const controller = new AbortController(); controller.abort();
    await expect(renderCharacterGlb(file, 512, ["front"], { yaw: 0, pitch: 0, animationTime: 0 }, controller.signal, vi.fn())).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
});
