import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createStudioBrushOriginalSource, decodeStudioBrushOriginalSource,
  requireStudioBrushOriginalSource } from "./studio-brush-original-source";
import { STUDIO_BRUSH_PROGRAM_MAX_BYTES } from "./studio-brush-pack-format";

const bytes = () => new TextEncoder().encode(' { "version": 3, "comment": "원본", "settings": {} }\r\n');
const fixture = () => createStudioBrushOriginalSource(bytes(), "원본.myb", "myb");

describe("original brush bytes, not a reconstructed preset", () => {
  it("preserves CRLF, whitespace and Korean text with an independently checked SHA-256", () => {
    const source = fixture();
    expect(source.sha256).toBe(createHash("sha256").update(bytes()).digest("hex"));
    expect(decodeStudioBrushOriginalSource(source)).toEqual(bytes());
    expect(requireStudioBrushOriginalSource(JSON.parse(JSON.stringify(source)))).toEqual(source);
  });
  it("hashes only a Uint8Array view and returns detached bytes", () => {
    const backing = new Uint8Array([9, 137, 80, 78, 71, 0, 255, 8]);
    const view = backing.subarray(1, -1);
    const source = createStudioBrushOriginalSource(view, "preset.kpp", "kpp");
    const first = decodeStudioBrushOriginalSource(source); first[0] = 0; backing.fill(0);
    expect(decodeStudioBrushOriginalSource(source)).toEqual(new Uint8Array([137, 80, 78, 71, 0, 255]));
  });
  it("never trusts a mutable caller object after a previous validation", () => {
    const raw = JSON.parse(JSON.stringify(fixture()));
    const checked = requireStudioBrushOriginalSource(raw);
    expect(Object.isFrozen(checked)).toBe(true); raw.sha256 = "0".repeat(64);
    expect(() => requireStudioBrushOriginalSource(raw)).toThrow();
    expect(requireStudioBrushOriginalSource(checked)).toBe(checked);
  });
  it.each([
    ["version", 2], ["format", "abr"], ["byteLength", 0], ["byteLength", -1],
    ["byteLength", STUDIO_BRUSH_PROGRAM_MAX_BYTES + 1], ["sha256", "0".repeat(64)],
    ["base64", "!!!!"], ["encoding", "utf8"], ["fileName", "../source.myb"],
  ])("rejects invalid %s without dropping provenance", (key, value) => {
    expect(() => requireStudioBrushOriginalSource({ ...fixture(), [key as string]: value })).toThrow();
  });
  it("rejects unknown properties and accessors without calling them", () => {
    const source = fixture();
    expect(() => requireStudioBrushOriginalSource({ ...source, future: 1 })).toThrow();
    expect(() => requireStudioBrushOriginalSource({ ...source, [Symbol("future")]: 1 })).toThrow();
    let invoked = false;
    const raw = { ...source };
    Object.defineProperty(raw, "sha256", { get() { invoked = true; return source.sha256; } });
    expect(() => requireStudioBrushOriginalSource(raw)).toThrow(); expect(invoked).toBe(false);
  });
  it("cleans only the filename, not the source bytes", () => {
    const source = createStudioBrushOriginalSource(bytes(), "../폴더/원본\u202e?.myb", "myb");
    expect(source.fileName).toBe("원본.myb");
    expect(decodeStudioBrushOriginalSource(source)).toEqual(bytes());
  });
  it("rejects empty or oversized source buffers before hashing", () => {
    expect(() => createStudioBrushOriginalSource(new Uint8Array(), "x.myb", "myb")).toThrow();
    expect(() => createStudioBrushOriginalSource(new Uint8Array(STUDIO_BRUSH_PROGRAM_MAX_BYTES + 1), "x.kpp", "kpp")).toThrow();
  });
});
