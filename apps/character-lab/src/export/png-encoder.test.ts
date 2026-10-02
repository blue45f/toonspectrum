import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { checkerRaster, fillRaster, rasterEquals } from "../testing/raster-fixtures";

import { buildScanlines, crc32, decodePng, encodePng, isPng, parseIhdr, readPngChunks } from "./png-encoder";

describe("crc32", () => {
  it("표준 벡터와 일치한다", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
    // IEND 청크 CRC(타입 4바이트만)
    expect(crc32(new TextEncoder().encode("IEND"))).toBe(0xae426082);
  });
});

describe("encodePng", () => {
  const raster = fillRaster(4, 4, (x, y) => [x * 60, y * 60, 255 - x * 30, y === 0 ? 0 : x === 3 ? 128 : 255]);

  it("4×4 RGBA → 청크 구조·CRC·node:zlib 원본 일치", async () => {
    const bytes = await encodePng(raster);
    expect(isPng(bytes)).toBe(true);
    const chunks = readPngChunks(bytes);
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "sRGB", "gAMA", "IDAT", "IEND"]);
    expect(chunks.every((c) => c.crcOk)).toBe(true);
    const ihdr = chunks[0];
    if (!ihdr) throw new Error("IHDR 없음");
    expect(parseIhdr(ihdr.data)).toEqual({ width: 4, height: 4, bitDepth: 8, colorType: 6, interlace: 0 });
    expect(Array.from(chunks[1]?.data ?? [])).toEqual([0]);
    expect(Array.from(chunks[2]?.data ?? [])).toEqual([0, 0, 0xb1, 0x8f]);
    const idat = chunks[3];
    if (!idat) throw new Error("IDAT 없음");
    const inflated = inflateSync(Buffer.from(idat.data));
    expect(Array.from(inflated)).toEqual(Array.from(buildScanlines(raster, "none")));
    // 필터 0: 행마다 0 바이트 + 16바이트
    expect(inflated.length).toBe((4 * 4 + 1) * 4);
    expect(inflated[0]).toBe(0);
    expect(Array.from(inflated.subarray(1, 5))).toEqual([0, 0, 255, 0]);
  });

  it("디코드 왕복이 바이트 단위로 같다(필터 none·adaptive, 투명 보존)", async () => {
    for (const filter of ["none", "adaptive"] as const) {
      const bytes = await encodePng(raster, { filter });
      const decoded = await decodePng(bytes);
      expect(decoded.width).toBe(4);
      expect(rasterEquals(decoded, raster)).toBe(true);
    }
    const checker = checkerRaster(33, 17, 5, [10, 200, 30, 255], [0, 0, 0, 0]);
    const adaptive = await encodePng(checker, { filter: "adaptive" });
    expect(rasterEquals(await decodePng(adaptive), checker)).toBe(true);
    const none = await encodePng(checker, { filter: "none", srgb: false });
    expect(readPngChunks(none).map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(rasterEquals(await decodePng(none), checker)).toBe(true);
  });

  it("CRC가 깨지면 디코드를 거부한다", async () => {
    const bytes = await encodePng(raster);
    const corrupted = new Uint8Array(bytes);
    corrupted[24] = (corrupted[24] ?? 0) ^ 0xff; // IHDR 데이터(bitDepth 바이트) — CRC 불일치
    await expect(decodePng(corrupted)).rejects.toThrow(/CRC/u);
    await expect(decodePng(new Uint8Array([1, 2, 3]))).rejects.toThrow(/서명/u);
  });

  it("크기·길이 오류는 throw한다", async () => {
    await expect(encodePng({ width: 0, height: 1, rgba: new Uint8ClampedArray(0) })).rejects.toThrow(/크기/u);
    await expect(encodePng({ width: 2, height: 2, rgba: new Uint8ClampedArray(3) })).rejects.toThrow(/길이/u);
  });
});
