import type { StudioRasterAsset } from "./studio-raster-assets";

interface StudioRasterAssetBlob {
  readonly type: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** 새 원본 팩은 다운로드한 파일도 카탈로그의 바이트·해시·픽셀 정보와 대조한다. */
export async function verifyStudioRasterAssetBlob(
  asset: StudioRasterAsset,
  blob: StudioRasterAssetBlob,
): Promise<void> {
  if (blob.type && blob.type !== asset.mimeType) {
    throw new Error("소재 파일 형식이 카탈로그 정보와 다릅니다.");
  }
  if (asset.bytes !== undefined && blob.size !== asset.bytes) {
    throw new Error("소재 파일 크기가 카탈로그 정보와 다릅니다.");
  }
  if (!asset.sha256) return;
  const bytes = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (hash !== asset.sha256) throw new Error("소재 파일이 원본과 일치하지 않습니다. 다시 선택해 주세요.");
  if (asset.mimeType === "image/png") {
    const view = new DataView(bytes);
    if (view.byteLength < 24 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) {
      throw new Error("소재 PNG 파일을 읽을 수 없습니다.");
    }
    if (view.getUint32(16) !== asset.width || view.getUint32(20) !== asset.height) {
      throw new Error("소재 해상도가 카탈로그 정보와 다릅니다.");
    }
  }
}
