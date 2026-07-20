import { describe, expect, it } from "vitest";

import {
  CREATOR_ASSET_PREVIEW_MAX_BYTES,
  assertCreatorAssetPersistedIntegrity,
  inspectCreatorAssetDataUrl,
  inspectCreatorAssetPayload,
  inspectCreatorAssetPreviewDataUrl,
} from "./creator-asset-image";

const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3n0AAAAASUVORK5CYII=";

function mismatchedExtendedWebpDataUrl(): string {
  const vp8x = Buffer.alloc(18);
  vp8x.write("VP8X", 0, "ascii");
  vp8x.writeUInt32LE(10, 4);
  // Reserved/feature bytes are zero and the VP8X canvas is 1x1.
  const vp8l = Buffer.alloc(14);
  vp8l.write("VP8L", 0, "ascii");
  vp8l.writeUInt32LE(5, 4);
  // The actual lossless bitstream header declares 2x2.
  vp8l.set([0x2f, 0x01, 0x40, 0x00, 0x00], 8);
  const body = Buffer.concat([vp8x, vp8l]);
  const bytes = Buffer.alloc(12 + body.length);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WEBP", 8, "ascii");
  body.copy(bytes, 12);
  return `data:image/webp;base64,${bytes.toString("base64")}`;
}

describe("creator asset image inspection", () => {
  it("매직 바이트와 IHDR 크기를 읽고 안정적인 해시를 만든다", () => {
    const inspected = inspectCreatorAssetDataUrl(PNG_1X1, 1, 1);
    expect(inspected).toMatchObject({
      mimeType: "image/png",
      width: 1,
      height: 1,
    });
    expect(inspected.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(inspected.byteSize).toBeGreaterThan(24);
  });

  it("선언 크기 불일치와 MIME 위장을 거부한다", () => {
    expect(() => inspectCreatorAssetDataUrl(PNG_1X1, 2, 1)).toThrow("실제 크기");
    expect(() => inspectCreatorAssetDataUrl(PNG_1X1.replace("image/png", "image/webp"), 1, 1)).toThrow(
      "일치하지 않거나"
    );
  });

  it("허용하지 않은 SVG와 손상된 base64를 거부한다", () => {
    expect(() => inspectCreatorAssetDataUrl("data:image/svg+xml;base64,PHN2Zy8+", 1, 1)).toThrow(
      "PNG, JPEG 또는 WebP"
    );
    expect(() => inspectCreatorAssetDataUrl("data:image/png;base64,%%%%", 1, 1)).toThrow(
      "PNG, JPEG 또는 WebP"
    );
  });

  it("VRM 포즈만 유효하고 제한된 재편집 fragment를 보존한다", () => {
    const fragment = encodeURIComponent(JSON.stringify({ tool: "vrm-poser", version: 2 }));
    const poseDataUrl = `${PNG_1X1}#${fragment}`;

    expect(() => inspectCreatorAssetDataUrl(poseDataUrl, 1, 1)).toThrow("재편집 메타데이터");
    expect(inspectCreatorAssetDataUrl(poseDataUrl, 1, 1, {
      allowVrmPoseFragment: true,
    }).dataUrl).toBe(poseDataUrl);
    expect(() => inspectCreatorAssetDataUrl(
      `${PNG_1X1}#${encodeURIComponent(JSON.stringify({ tool: "other" }))}`,
      1,
      1,
      { allowVrmPoseFragment: true },
    )).toThrow("VRM 포즈");
    expect(() => inspectCreatorAssetDataUrl(
      `${PNG_1X1}#%7Bbroken`,
      1,
      1,
      { allowVrmPoseFragment: true },
    )).toThrow("해석할 수 없습니다");
  });

  it("vrm_pose에만 bounded vrm-poser JSON fragment를 허용하고 정규화한다", () => {
    const metadata = { tool: "vrm-poser", version: 3, pose: { head: [0, 0.1, 0] } };
    const payload = `${PNG_1X1}#${encodeURIComponent(JSON.stringify(metadata, null, 2))}`;
    const inspected = inspectCreatorAssetPayload(payload, "vrm_pose", 1, 1);

    expect(inspected.baseDataUrl).toBe(PNG_1X1);
    expect(inspected.dataUrl).toBe(`${PNG_1X1}#${encodeURIComponent(JSON.stringify(metadata))}`);
    expect(inspected.vrmMetadata).toEqual(metadata);
    expect(inspected.sha256).not.toBe(inspectCreatorAssetDataUrl(PNG_1X1, 1, 1).sha256);

    expect(() => inspectCreatorAssetPayload(payload, "image", 1, 1)).toThrow("fragment");
    expect(() => inspectCreatorAssetPayload(
      `${PNG_1X1}#${encodeURIComponent(JSON.stringify({ tool: "other" }))}`,
      "vrm_pose",
      1,
      1
    )).toThrow("도구 식별자");
  });

  it("손상되거나 과도한 VRM metadata를 원본 이미지와 별개로 거부한다", () => {
    expect(() => inspectCreatorAssetPayload(`${PNG_1X1}#%E0%A4%A`, "vrm_pose", 1, 1)).toThrow(
      "인코딩"
    );
    expect(() => inspectCreatorAssetPayload(
      `${PNG_1X1}#${"a".repeat(256 * 1024 + 1)}`,
      "vrm_pose",
      1,
      1
    )).toThrow("크기");
  });

  it("preview도 실제 헤더를 검사하고 독립적인 320px/128KiB 예산을 적용한다", () => {
    expect(inspectCreatorAssetPreviewDataUrl(PNG_1X1, 1, 1).byteSize)
      .toBeLessThan(CREATOR_ASSET_PREVIEW_MAX_BYTES);
    expect(() => inspectCreatorAssetPreviewDataUrl(PNG_1X1, 2, 1)).toThrow("실제 크기");

    const oversizedHeader = Buffer.from(PNG_1X1.split(",")[1]!, "base64");
    oversizedHeader.writeUInt32BE(321, 16);
    const oversized = `data:image/png;base64,${oversizedHeader.toString("base64")}`;
    expect(() => inspectCreatorAssetPreviewDataUrl(oversized, 321, 1)).toThrow("320px");
  });

  it("VP8X canvas와 실제 WebP payload 크기가 다른 원본·preview를 모두 거부한다", () => {
    const mismatch = mismatchedExtendedWebpDataUrl();
    expect(() => inspectCreatorAssetDataUrl(mismatch, 1, 1)).toThrow("헤더가 손상");
    expect(() => inspectCreatorAssetPreviewDataUrl(mismatch, 1, 1)).toThrow("헤더가 손상");
  });

  it("persisted MIME·byteSize·contentHash가 재검사 결과와 모두 같아야 한다", () => {
    const inspected = inspectCreatorAssetPayload(PNG_1X1, "image", 1, 1);
    const persisted = {
      mimeType: inspected.mimeType,
      byteSize: inspected.byteSize,
      contentHash: inspected.sha256,
    };
    expect(() => assertCreatorAssetPersistedIntegrity(inspected, persisted)).not.toThrow();
    expect(() => assertCreatorAssetPersistedIntegrity(inspected, {
      ...persisted,
      contentHash: "0".repeat(64),
    })).toThrow("무결성 메타데이터");
    expect(() => assertCreatorAssetPersistedIntegrity(inspected, {
      ...persisted,
      byteSize: inspected.byteSize + 1,
    })).toThrow("무결성 메타데이터");
  });
});
