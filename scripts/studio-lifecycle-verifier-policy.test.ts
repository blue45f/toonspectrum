import { describe, expect, it } from "vitest";

import {
  inspectPngIntegrity,
  studioLifecycleVisualViolations,
  type PixelDiffEvidence,
} from "./studio-lifecycle-verifier-policy";

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function chunk(type: string, data: number[]): number[] {
  const typeBytes = [...type].map((character) => character.charCodeAt(0));
  const crc = crc32(Uint8Array.from([...typeBytes, ...data]));
  return [...uint32(data.length), ...typeBytes, ...data, ...uint32(crc)];
}

function pngFixture(): Uint8Array {
  return Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk("IHDR", [...uint32(720), ...uint32(1080), 8, 6, 0, 0, 0]),
    ...chunk("IDAT", [120, 156, 3, 0, 0, 0, 0, 1]),
    ...chunk("IEND", []),
  ]);
}

function diff(changedPixels: number, maxChannelDelta = changedPixels > 0 ? 255 : 0): PixelDiffEvidence {
  return { changedPixels, totalPixels: 720 * 1080, maxChannelDelta };
}

describe("Studio lifecycle verifier policy", () => {
  it("accepts a structurally complete PNG with valid chunk CRCs", () => {
    expect(inspectPngIntegrity(pngFixture())).toMatchObject({
      width: 720,
      height: 1080,
      bitDepth: 8,
      colorType: 6,
      idatBytes: 8,
      chunkCount: 3,
    });
  });

  it("rejects corrupt and truncated PNG exports", () => {
    const corrupt = pngFixture();
    corrupt[corrupt.length - 1] ^= 0xff;
    expect(() => inspectPngIntegrity(corrupt)).toThrow(/CRC/u);
    expect(() => inspectPngIntegrity(pngFixture().slice(0, -2))).toThrow(/truncated/u);
  });

  it("accepts meaningful commit and equivalent undo, redo, reload, and export frames", () => {
    expect(studioLifecycleVisualViolations({
      blankToCommitted: diff(2_000),
      blankToUndone: diff(0),
      committedToRedone: diff(2, 1),
      redoneToReloaded: diff(3, 2),
      beforeToAfterReloadExport: diff(0),
    })).toEqual([]);
  });

  it("reports every broken lifecycle transition", () => {
    expect(studioLifecycleVisualViolations({
      blankToCommitted: diff(2, 2),
      blankToUndone: diff(300),
      committedToRedone: diff(300),
      redoneToReloaded: diff(300),
      beforeToAfterReloadExport: diff(1),
    })).toEqual([
      "pointer stroke did not create meaningful committed pixels",
      "undo did not restore the blank canvas",
      "redo did not restore the committed stroke",
      "reload did not restore the saved stroke",
      "PNG export pixels changed across save/reload",
    ]);
  });
});
