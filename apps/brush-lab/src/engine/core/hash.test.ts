import { describe, expect, it } from "vitest";

import { canonicalJson, fnv1a64, sha256Hex, utf8Bytes } from "./hash";

describe("콘텐츠 해시", () => {
  it("fnv1a64 알려진 벡터", () => {
    expect(fnv1a64(utf8Bytes(""))).toBe("cbf29ce484222325");
    expect(fnv1a64(utf8Bytes("a"))).toBe("af63dc4c8601ec8c");
    expect(fnv1a64(utf8Bytes("foobar"))).toBe("85944171f73967e8");
    expect(fnv1a64(new Uint8Array([0]))).toBe("af63bd4c8601b7df");
  });

  it("sha256 알려진 벡터(abc, 빈 문자열)", async () => {
    expect(await sha256Hex(utf8Bytes("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await sha256Hex(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("canonicalJson은 키 순서와 무관하고 -0·undefined·비유한값을 정규화한다", () => {
    const a = { b: 1, a: { d: [1, 2], c: "x" }, z: undefined };
    const b = { a: { c: "x", d: [1, 2] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson({ v: -0 })).toBe('{"v":0}');
    expect(canonicalJson({ v: Number.NaN })).toBe('{"v":null}');
    expect(canonicalJson({ v: 1n })).toBe('{"v":"1"}');
    expect(canonicalJson(new Float32Array([1, 2]))).toBe("[1,2]");
    expect(canonicalJson([3, { y: 1, x: 2 }])).toBe('[3,{"x":2,"y":1}]');
  });
});
