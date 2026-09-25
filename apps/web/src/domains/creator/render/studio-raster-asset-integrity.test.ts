import { Blob as NodeBlob } from "node:buffer";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyStudioRasterAssetBlob } from "./studio-raster-asset-integrity";
import { STUDIO_LEGACY_RASTER_ASSETS } from "./studio-raster-assets";

import type { StudioRasterAsset } from "./studio-raster-assets";

const header = Buffer.alloc(24);
header.writeUInt32BE(0x89504e47, 0);
header.writeUInt32BE(0x0d0a1a0a, 4);
header.writeUInt32BE(640, 16);
header.writeUInt32BE(480, 20);
const asset: StudioRasterAsset = {
  ...STUDIO_LEGACY_RASTER_ASSETS[0],
  mimeType: "image/png",
  width: 640,
  height: 480,
  bytes: header.length,
  sha256: createHash("sha256").update(header).digest("hex"),
};

describe("원본 소재 다운로드 검증", () => {
  it("바이트·해시·PNG 픽셀 크기가 맞으면 원본을 허용한다", async () => {
    await expect(verifyStudioRasterAssetBlob(asset, new NodeBlob([header], { type: "image/png" }))).resolves.toBeUndefined();
  });

  it("같은 URL에서 받은 HTML 오류 페이지와 손상된 파일을 삽입 전에 거부한다", async () => {
    await expect(verifyStudioRasterAssetBlob(asset, new NodeBlob(["<html>error</html>"], { type: "text/html" }))).rejects.toThrow("형식");
    await expect(verifyStudioRasterAssetBlob(asset, new NodeBlob([header.subarray(0, 20)], { type: "image/png" }))).rejects.toThrow("크기");
    const changed = Buffer.from(header);
    changed[10] = 1;
    await expect(verifyStudioRasterAssetBlob(asset, new NodeBlob([changed], { type: "image/png" }))).rejects.toThrow("원본");
    await expect(verifyStudioRasterAssetBlob({ ...asset, width: 500 }, new NodeBlob([header], { type: "image/png" }))).rejects.toThrow("해상도");
  });

  it("과거 WebP 카탈로그는 기존 형식 검사를 유지한다", async () => {
    await expect(verifyStudioRasterAssetBlob(STUDIO_LEGACY_RASTER_ASSETS[0], new NodeBlob(["legacy"], { type: "image/webp" }))).resolves.toBeUndefined();
  });
});
