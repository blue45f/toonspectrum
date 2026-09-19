/** Settled-operation PNG encoding. Never imported by the main-thread pointer hot path. */
import { NATIVE_BRUSH_DOCUMENT_MAX_PNG_BYTES } from "./studio-native-brush-probe-contract";

import type { NativeBrushDocumentClipEdges, NativeBrushProbeFrame, NativeBrushSurface } from "./studio-native-brush-probe-contract";

export async function encodeNativeBrushDocumentFrame(
  frame: NativeBrushProbeFrame | null,
  surface: NativeBrushSurface,
  clipEdges: NativeBrushDocumentClipEdges,
): Promise<{ png: ArrayBuffer; pngHash: string }> {
  if (!Array.isArray(clipEdges) || clipEdges.length !== 4 || clipEdges.some((value) => typeof value !== "boolean")) {
    if (frame?.kind === "bitmap") frame.bitmap.close();
    throw new TypeError("Invalid native document crop boundary");
  }
  let canvas: OffscreenCanvas | null = null;
  try {
    canvas = new OffscreenCanvas(surface.width, surface.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Native brush PNG surface unavailable");
    if (frame?.kind === "bitmap") {
      context.drawImage(frame.bitmap, 0, 0);
    } else if (frame?.kind === "pixels") {
      context.putImageData(new ImageData(new Uint8ClampedArray(frame.pixels), frame.width, frame.height), frame.x, frame.y);
    }
    // One final read at an explicit conversion/export boundary, not a live-frame readback.
    const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
    let visible = false;
    for (let y = 0; y < surface.height; y += 1) {
      for (let x = 0; x < surface.width; x += 1) {
        if (pixels[(y * surface.width + x) * 4 + 3] === 0) continue;
        visible = true;
        if ((x === 0 && !clipEdges[0]) || (y === 0 && !clipEdges[1])
          || (x === surface.width - 1 && !clipEdges[2]) || (y === surface.height - 1 && !clipEdges[3])) {
          throw new Error("브러시 자국이 변환 영역을 벗어나 결과를 적용하지 않았습니다. 더 작은 굵기로 다시 시도하세요.");
        }
      }
    }
    if (!visible) throw new Error("선택한 엔진이 빈 획을 반환하여 원본을 유지했습니다.");
    const blob = await canvas.convertToBlob({ type: "image/png" });
    if (blob.type !== "image/png" || blob.size > NATIVE_BRUSH_DOCUMENT_MAX_PNG_BYTES) {
      throw new Error("Native brush PNG output exceeds its encoded size budget");
    }
    const png = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", png);
    const pngHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return { png, pngHash };
  } finally {
    if (frame?.kind === "bitmap") frame.bitmap.close();
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}
