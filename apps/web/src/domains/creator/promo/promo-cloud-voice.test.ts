import { describe, expect, it } from "vitest";

import { decodeBase64Audio, encodeMonoPcm16Wave } from "./promo-cloud-voice";

describe("promo cloud voice audio helpers", () => {
  it("decodes base64 without changing the payload", () => {
    const source = Uint8Array.from([0, 1, 2, 127, 128, 255]);
    const encoded = btoa(String.fromCharCode(...source));
    expect(Array.from(new Uint8Array(decodeBase64Audio(encoded)))).toEqual(Array.from(source));
  });

  it("encodes clamped mono PCM as a RIFF/WAVE file", async () => {
    const blob = encodeMonoPcm16Wave(Float32Array.from([-2, -1, 0, 1, 2]), 24_000);
    expect(blob.type).toBe("audio/wav");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(bytes.subarray(8, 12))).toBe("WAVE");
    expect(new DataView(bytes.buffer).getUint32(40, true)).toBe(10);
    expect(new DataView(bytes.buffer).getInt16(44, true)).toBe(-32_768);
    expect(new DataView(bytes.buffer).getInt16(50, true)).toBe(32_767);
  });
});
