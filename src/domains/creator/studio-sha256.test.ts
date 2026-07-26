import { describe, expect, it } from "vitest";

import { sha256HexPortable } from "./studio-sha256";

const TEXT_ENCODER = new TextEncoder();

function bufferHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

describe("portable Studio SHA-256", () => {
  it.each([
    {
      label: "empty input",
      input: "",
      expected:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    {
      label: "FIPS abc vector",
      input: "abc",
      expected:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    },
    {
      label: "multi-block FIPS vector",
      input:
        "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
      expected:
        "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    },
  ])("matches the standard SHA-256 digest for $label", ({ input, expected }) => {
    expect(sha256HexPortable(TEXT_ENCODER.encode(input))).toBe(expected);
  });

  it("matches the preferred native Web Crypto implementation byte-for-byte", async () => {
    const bytes = TEXT_ENCODER.encode(
      "ToonSpectrum portable checksum parity — 한글과 🎨"
    );
    const subtle = globalThis.crypto?.subtle;
    expect(subtle).toBeDefined();
    if (!subtle) return;

    const native = await subtle.digest("SHA-256", bytes);
    expect(sha256HexPortable(bytes)).toBe(bufferHex(native));
  });
});
