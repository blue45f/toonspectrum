import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createStudioBrushOriginalSource, decodeStudioBrushOriginalSource,
  requireStudioBrushOriginalSource, StudioBrushOriginalSourceError,
} from "./studio-brush-original-source";
import { STUDIO_BRUSH_PROGRAM_MAX_BYTES } from "./studio-brush-pack-format";

const bytes = new TextEncoder().encode('\r\n{ "description": "원본", "unknown": [0, 3] }\n');
const fixture = () => createStudioBrushOriginalSource(bytes, "../원본.myb", "myb");

describe("original brush bytes and bounded integrity", () => {
  it("preserves view offsets, original whitespace and detached copies", () => {
    const backing = new Uint8Array(bytes.length + 9); backing.set(bytes, 4);
    const source = createStudioBrushOriginalSource(backing.subarray(4, 4 + bytes.length), "../원본.myb", "myb");
    expect(source.fileName).toBe("원본.myb");
    expect(source.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    backing.fill(0);
    expect(decodeStudioBrushOriginalSource(source)).toEqual(bytes);
    const copy = decodeStudioBrushOriginalSource(source); copy.fill(0);
    expect(decodeStudioBrushOriginalSource(source)).toEqual(bytes);
    expect(Object.isFrozen(source)).toBe(true);
  });
  it.each(["version", "format", "encoding", "fileName", "byteLength", "sha256", "base64"])(
    "rejects damaged %s without dropping original provenance", (key) => {
      const raw = { ...fixture(), [key]: "invalid" };
      expect(() => requireStudioBrushOriginalSource(raw)).toThrow(StudioBrushOriginalSourceError);
    });
  it("detects same-length byte corruption and noncanonical base64", () => {
    const source = fixture(); if (source.encoding !== "base64") throw new Error("fixture");
    expect(() => requireStudioBrushOriginalSource({ ...source, base64: `AAAA${source.base64.slice(4)}` })).toThrow();
    expect(() => requireStudioBrushOriginalSource({ ...source, base64: source.base64.replace(/.$/u, " ") })).toThrow();
  });
  it("does not trust caller-owned objects, accessors or unknown fields", () => {
    const raw = { ...fixture() }; const result = requireStudioBrushOriginalSource(raw);
    expect(result).not.toBe(raw); raw.sha256 = "0".repeat(64);
    expect(() => requireStudioBrushOriginalSource(raw)).toThrow();
    const getter = Object.defineProperty({ ...fixture() }, "fileName", { get() { throw new Error("getter executed"); } });
    expect(() => requireStudioBrushOriginalSource(getter)).toThrow(StudioBrushOriginalSourceError);
    expect(() => requireStudioBrushOriginalSource({ ...fixture(), [Symbol("hidden")]: 1 })).toThrow();
  });
  it("bounds binary input before hashing and canonicalizes export names", () => {
    expect(() => createStudioBrushOriginalSource(new Uint8Array(), "a.myb", "myb")).toThrow();
    expect(() => createStudioBrushOriginalSource(new Uint8Array(STUDIO_BRUSH_PROGRAM_MAX_BYTES + 1), "a.myb", "myb")).toThrow();
    const source = createStudioBrushOriginalSource(bytes, "folder\\한글:원본.kpp", "kpp");
    expect(source.fileName).toBe("한글원본.kpp");
    expect(requireStudioBrushOriginalSource(JSON.parse(JSON.stringify(source)))).toEqual(source);
  });
  it("validates references but never treats them as portable original bytes", () => {
    const embedded = fixture(); const { version, format, fileName, byteLength, sha256 } = embedded;
    const ref = { version, format, fileName, byteLength, sha256, encoding: "opfs-cas" };
    expect(requireStudioBrushOriginalSource(ref)).toEqual(ref);
    expect(() => decodeStudioBrushOriginalSource(ref)).toThrow(/OPFS/u);
  });
});
