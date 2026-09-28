import { Image, encode } from "image-js";
import { describe, expect, it } from "vitest";

import { reencodeStudioVirtualFurniture } from "./studio-virtual-space-furniture-reencode";



/** PNG 청크 CRC-32. 잘못된 CRC를 넣으면 디코더가 파일을 버리므로 정확해야 한다. */
function pngCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** 유효한 PNG 에 IEND 바로 앞에 tEXt 청크를 끼워 넣는다. */
function withTextChunk(png: Uint8Array, keyword: string, text: string): Uint8Array {
  // 마지막 12바이트는 IEND(길이 4 + 타입 4 + CRC 4)다.
  const iendStart = png.length - 12;
  const payload = new TextEncoder().encode(`${keyword}\u0000${text}`);
  const typeAndData = new Uint8Array(4 + payload.length);
  typeAndData.set([0x74, 0x45, 0x58, 0x74], 0); // "tEXt"
  typeAndData.set(payload, 4);

  const chunk = new Uint8Array(12 + payload.length);
  const chunkView = new DataView(chunk.buffer);
  chunkView.setUint32(0, payload.length);
  chunk.set(typeAndData, 4);
  chunkView.setUint32(4 + typeAndData.length, pngCrc32(typeAndData));

  const merged = new Uint8Array(png.length + chunk.length);
  merged.set(png.subarray(0, iendStart), 0);
  merged.set(chunk, iendStart);
  merged.set(png.subarray(iendStart), iendStart + chunk.length);
  return merged;
}

function pngChunkTypes(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found: string[] = [];
  let offset = 8; // 8바이트 시그니처
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7],
    );
    found.push(type);
    offset += 12 + length; // length + type + data + crc
    if (type === "IEND") break;
  }
  return found;
}

function rgba(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    // 투명이 섞인 픽셀을 일부러 넣는다. 재인코딩 후에도 알파가 남아야 한다.
    pixels[index * 4] = 10;
    pixels[index * 4 + 1] = 20;
    pixels[index * 4 + 2] = 30;
    pixels[index * 4 + 3] = index % 2 === 0 ? 255 : 128;
  }
  return pixels;
}

function pngOf(width: number, height: number): Uint8Array {
  // image-js 1.7 의 Image 는 위치 인자를 받는다. 평범한 객체는 convertColor 가 없다.
  return new Uint8Array(encode(new Image(width, height, rgba(width, height), "RGBA") as never, { format: "png" }));
}

describe("furniture re-encode", () => {
  it("shrinks a large image so its longest edge is the render cap", async () => {
    const result = await reencodeStudioVirtualFurniture(pngOf(900, 600));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.width).toBe(256);
    expect(result.ok && result.value.height).toBe(171);
  });

  it("never upscales a small image", async () => {
    const result = await reencodeStudioVirtualFurniture(pngOf(32, 48));

    expect(result.ok && result.value.width).toBe(32);
    expect(result.ok && result.value.height).toBe(48);
  });

  it("keeps the aspect ratio of a portrait image", async () => {
    const result = await reencodeStudioVirtualFurniture(pngOf(600, 900));

    expect(result.ok && result.value.width).toBe(171);
    expect(result.ok && result.value.height).toBe(256);
  });

  it("strips a text chunk that the source actually carried", async () => {
    // 원본에 tEXt 가 실제로 들어있어야 이 검사가 의미를 가진다. 조립한 원본을 다시
    // 인코딩하면 이 청크가 사라져야 하고, 그대로 통과하면 남아야 빨개진다.
    const source = withTextChunk(pngOf(120, 90), "Comment", "private-location");
    expect(pngChunkTypes(source)).toContain("tEXt");

    const result = await reencodeStudioVirtualFurniture(source);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(pngChunkTypes(result.value.bytes)).not.toContain("tEXt");
    expect(pngChunkTypes(result.value.bytes)).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("refuses bytes that are not a decodable image", async () => {
    const notImage = new Uint8Array(128).fill(0x41);

    expect(await reencodeStudioVirtualFurniture(notImage)).toMatchObject({ ok: false });
    expect(await reencodeStudioVirtualFurniture(new Uint8Array(0))).toMatchObject({ ok: false });
  });

  it("refuses an out of range render edge instead of silently accepting it", async () => {
    for (const edge of [0, 8, 4096, 12.5]) {
      expect(await reencodeStudioVirtualFurniture(pngOf(32, 32), edge)).toMatchObject({ ok: false });
    }
  });
});
