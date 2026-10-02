import { describe, expect, it } from "vitest";

import { fnv1a32, fnv1a32Hex, fnv1a64Hex, isSha256Hex, sha256Hex } from "./hash";

describe("shared/hash", () => {
  it("FNV-1a 알려진 벡터", () => {
    // 표준 테스트 벡터: fnv1a32("") = 0x811c9dc5, fnv1a32("a") = 0xe40c292c
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32Hex("foobar")).toBe("bf9cf968");
    // fnv1a64("") = cbf29ce484222325, fnv1a64("a") = af63dc4c8601ec8c
    expect(fnv1a64Hex("")).toBe("cbf29ce484222325");
    expect(fnv1a64Hex("a")).toBe("af63dc4c8601ec8c");
    expect(fnv1a64Hex("foobar")).toBe("85944171f73967e8");
  });

  it("UTF-8 바이트 기준이라 한글도 결정적이다", () => {
    expect(fnv1a64Hex("한글")).toBe(fnv1a64Hex("한글"));
    expect(fnv1a64Hex("한글")).not.toBe(fnv1a64Hex("한극"));
  });

  it("sha256Hex 알려진 벡터", async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const view = new Uint8Array([0, 97, 98, 99, 0]).subarray(1, 4);
    expect(await sha256Hex(view)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(isSha256Hex("a".repeat(64))).toBe(true);
    expect(isSha256Hex("A".repeat(64))).toBe(false);
  });
});
