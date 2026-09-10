import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SAMPLE_VRM_ENTRIES } from "./vrm-library";
import { isStudioVrmProductionThumbnailUrl } from "./studio-vrm-thumbnail-quality";

type Dimensions = Readonly<{ width: number; height: number }>;

function readPngDimensions(bytes: Buffer): Dimensions | null {
  const signature = "89504e470d0a1a0a";
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== signature) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function readJpegDimensions(bytes: Buffer): Dimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x00 || marker === 0xff || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += marker >= 0xd0 && marker <= 0xd7 ? 2 : 1;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + length + 2 > bytes.length) return null;
    if (startOfFrame.has(marker)) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += length + 2;
  }
  return null;
}

function readWebpDimensions(bytes: Buffer): Dimensions | null {
  if (
    bytes.length < 30
    || bytes.subarray(0, 4).toString("ascii") !== "RIFF"
    || bytes.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return null;
  }
  const chunk = bytes.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X") {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8 " && bytes.subarray(23, 26).toString("hex") === "9d012a") {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const first = bytes[21] ?? 0;
    const second = bytes[22] ?? 0;
    const third = bytes[23] ?? 0;
    const fourth = bytes[24] ?? 0;
    return {
      width: 1 + first + ((second & 0x3f) << 8),
      height: 1 + (second >> 6) + (third << 2) + ((fourth & 0x0f) << 10),
    };
  }
  return null;
}

function readImageDimensions(bytes: Buffer): Dimensions | null {
  return readPngDimensions(bytes) ?? readJpegDimensions(bytes) ?? readWebpDimensions(bytes);
}

describe("production VRM thumbnail files", () => {
  it("ships a unique, decodable, non-trivial image for every visible catalogue card", () => {
    expect(SAMPLE_VRM_ENTRIES.length).toBeGreaterThan(0);
    const hashes = new Map<string, string>();

    for (const entry of SAMPLE_VRM_ENTRIES) {
      expect(isStudioVrmProductionThumbnailUrl(entry.thumbnail), entry.id).toBe(true);
      const thumbnail = entry.thumbnail;
      if (!isStudioVrmProductionThumbnailUrl(thumbnail)) continue;

      const filePath = path.join(process.cwd(), "apps/web/public", thumbnail.slice(1));
      expect(existsSync(filePath), `${entry.id}: ${thumbnail}`).toBe(true);
      if (!existsSync(filePath)) continue;

      expect(statSync(filePath).size, `${entry.id}: file size`).toBeGreaterThanOrEqual(4_096);
      const bytes = readFileSync(filePath);
      const dimensions = readImageDimensions(bytes);
      expect(dimensions, `${entry.id}: supported PNG/JPEG/WebP header`).not.toBeNull();
      if (!dimensions) continue;

      expect(dimensions.width, `${entry.id}: width`).toBeGreaterThanOrEqual(256);
      expect(dimensions.height, `${entry.id}: height`).toBeGreaterThanOrEqual(256);
      expect(dimensions.width / dimensions.height, `${entry.id}: aspect`).toBeGreaterThanOrEqual(0.5);
      expect(dimensions.width / dimensions.height, `${entry.id}: aspect`).toBeLessThanOrEqual(2);

      const hash = createHash("sha256").update(bytes).digest("hex");
      expect(hashes.get(hash), `${entry.id}: duplicate of ${hashes.get(hash) ?? "none"}`).toBeUndefined();
      hashes.set(hash, entry.id);
    }
  });
});
