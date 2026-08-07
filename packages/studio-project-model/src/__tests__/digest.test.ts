import { describe, expect, it } from "vitest";

import { canonicalJson, crc32, fnv1a64Hex, sceneDigest } from "../ir/digest";
import { createEmptyScene } from "../ir/scene";

describe("canonicalJson", () => {
  it("sorts object keys recursively and preserves array order", () => {
    const a = canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 2 } });
    const b = canonicalJson({ a: { c: 2, d: [3, { y: 2, z: 1 }] }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":2,"d":[3,{"y":2,"z":1}]},"b":1}');
  });

  it("rejects non-finite numbers instead of silently corrupting the journal", () => {
    expect(() => canonicalJson({ x: Number.NaN })).toThrow(TypeError);
    expect(() => canonicalJson({ x: Number.POSITIVE_INFINITY })).toThrow(TypeError);
  });
});

describe("crc32", () => {
  it("matches the standard check vector", () => {
    // IEEE 802.3 CRC-32 of "123456789" is 0xCBF43926.
    expect(crc32("123456789")).toBe(0xcbf43926);
  });

  it("detects single-character changes", () => {
    expect(crc32("toonstudio-v11")).not.toBe(crc32("toonstudio-v12"));
  });
});

describe("fnv1a64Hex", () => {
  it("is stable and 16 hex chars", () => {
    const digest = fnv1a64Hex("");
    expect(digest).toBe("cbf29ce484222325");
    expect(fnv1a64Hex("a")).toHaveLength(16);
  });
});

describe("sceneDigest", () => {
  it("is invariant to key insertion order but sensitive to values", () => {
    const scene = createEmptyScene(64, 64);
    const digest = sceneDigest(scene);
    expect(sceneDigest(JSON.parse(canonicalJson(scene)))).toBe(digest);
    expect(sceneDigest({ ...scene, width: 65 })).not.toBe(digest);
  });
});
