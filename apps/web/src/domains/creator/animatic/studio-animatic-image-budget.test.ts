import { describe, expect, it } from "vitest";

import { studioAnimaticPngDecodedBytes } from "./studio-animatic-image-budget";

function header(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
}

describe("animatic PNG admission before decoding", () => {
  it("reserves the complete decoded image including typed-array offsets", () => {
    const bytes = new Uint8Array(80); bytes.set(header(720, 1280), 7);
    expect(studioAnimaticPngDecodedBytes(bytes.subarray(7, 40), 720 * 1280 * 4)).toBe(720 * 1280 * 4);
  });
  it("rejects oversized compressed dimensions before calling a decoder", () => {
    expect(() => studioAnimaticPngDecodedBytes(header(16384, 100000), 256 * 1024 * 1024)).toThrow("메모리");
    expect(() => studioAnimaticPngDecodedBytes(header(720, 1280), 720 * 1280 * 4 - 1)).toThrow("메모리");
  });
  it("rejects malformed and empty dimensions", () => {
    expect(() => studioAnimaticPngDecodedBytes(new Uint8Array(33), 1000)).toThrow("헤더");
    expect(() => studioAnimaticPngDecodedBytes(header(0, 10), 1000)).toThrow();
  });
});
