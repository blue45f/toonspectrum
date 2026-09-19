/** Settled-operation PNG encoding. Never imported by the main-thread pointer hot path. */
import { NATIVE_BRUSH_DOCUMENT_MAX_PNG_BYTES, validateNativeBrushSurface } from "./studio-native-brush-probe-contract";

import { validateNativeBrushClipEdges, validateNativeBrushOutputPixels } from "./studio-native-brush-output-validation";

import type { NativeBrushDocumentClipEdges, NativeBrushProbeFrame, NativeBrushSurface } from "./studio-native-brush-probe-contract";

export async function encodeNativeBrushDocumentFrame(
  frame: NativeBrushProbeFrame | null,
  surface: NativeBrushSurface,
  clipEdges: NativeBrushDocumentClipEdges,
): Promise<{ png: ArrayBuffer; pngHash: string }> {
  let canvas: OffscreenCanvas | null = null;
  try {
    validateNativeBrushSurface(surface);
    validateNativeBrushClipEdges(clipEdges);
    if (!frame) throw new Error("선택한 엔진이 빈 획을 반환하여 원본을 유지했습니다.");
    if (frame.kind === "pixels") {
      // The packed WASM output already contains straight RGBA8 alpha. Do not expand/read an
      // entire 2048² canvas just to rediscover its visibility and boundary contact.
      validateNativeBrushOutputPixels(frame.pixels, frame, surface, clipEdges);
    } else if (frame.bitmap.width !== surface.width || frame.bitmap.height !== surface.height) {
      throw new Error("Native brush bitmap dimensions do not match the requested surface");
    }
    canvas = new OffscreenCanvas(surface.width, surface.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Native brush PNG surface unavailable");
    if (frame?.kind === "bitmap") {
      context.drawImage(frame.bitmap, 0, 0);
    } else if (frame?.kind === "pixels") {
      context.putImageData(new ImageData(new Uint8ClampedArray(frame.pixels), frame.width, frame.height), frame.x, frame.y);
    }
    if (frame.kind === "bitmap") {
      // GPU output needs one settled validation read. Native packed pixels need none.
      // This still says nothing about browser-internal PNG encoder GPU/CPU transfers.
      const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
      validateNativeBrushOutputPixels(pixels, { x: 0, y: 0, ...surface }, surface, clipEdges);
    }
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
