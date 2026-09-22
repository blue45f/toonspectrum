import { loadSkiaDocumentImageBitmap } from "./document-image-source";

import type { SkiaDocumentImage, SkiaDocumentItem } from "./document-contract";
import type { Canvas, CanvasKit, Image, Surface } from "canvaskit-wasm";

export const SKIA_DOCUMENT_IMAGE_TEXTURE_BUDGET = 64 * 1024 * 1024;

export class SkiaDocumentImageAdmissionError extends Error {
  override readonly name = "SkiaDocumentImageAdmissionError";
}

export type SkiaDocumentImageBitmapLoader = (
  src: string,
  signal: AbortSignal,
) => Promise<ImageBitmap>;

export function createSkiaDocumentImageCache(
  loader: SkiaDocumentImageBitmapLoader = loadSkiaDocumentImageBitmap,
) {
  const textures = new Map<string, { image: Image; bytes: number }>();
  let disposed = false;
  const byteSize = () => [...textures.values()].reduce((sum, entry) => sum + entry.bytes, 0);

  const disposeImage = (image: Image) => {
    try { image.delete(); } catch { /* lost context */ }
  };

  return {
    get size() { return textures.size; },
    get bytes() { return byteSize(); },

    async prepare(
      items: readonly SkiaDocumentItem[],
      surface: Surface,
      signal: AbortSignal,
    ): Promise<void> {
      const wanted = new Set(items.flatMap((item) => item.image ? [item.image.src] : []));
      for (const src of wanted) {
        signal.throwIfAborted();
        if (disposed) throw new Error("GPU image cache is disposed");
        if (textures.has(src)) continue;
        const controller = new AbortController();
        const onAbort = () => controller.abort(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(() => controller.abort(new Error("GPU image preparation timed out")), 15_000);
        const loading = loader(src, controller.signal);
        let bitmap: ImageBitmap | null = null;
        try {
          const abortPromise = new Promise<never>((_, reject) => {
            const rejectAbort = () => reject(controller.signal.reason);
            controller.signal.addEventListener("abort", rejectAbort, { once: true });
            void loading.then(
              () => controller.signal.removeEventListener("abort", rejectAbort),
              () => controller.signal.removeEventListener("abort", rejectAbort),
            );
          });
          void loading.then((late) => {
            if (controller.signal.aborted || disposed) late.close();
          }, () => undefined);
          try {
            bitmap = await Promise.race([loading, abortPromise]);
          } catch (cause) {
            if (signal.aborted || disposed) throw cause;
            throw new SkiaDocumentImageAdmissionError(
              cause instanceof Error ? cause.message : String(cause),
            );
          }
          signal.throwIfAborted();
          if (disposed) throw new Error("GPU image cache is disposed");
          const bytes = bitmap.width * bitmap.height * 4;
          if (byteSize() + bytes > SKIA_DOCUMENT_IMAGE_TEXTURE_BUDGET) {
            throw new SkiaDocumentImageAdmissionError(
              "GPU image texture budget exceeded; original asset preserved",
            );
          }
          const image = surface.makeImageFromTextureSource(bitmap);
          if (!image) throw new Error("GPU image texture allocation failed");
          textures.set(src, { image, bytes });
        } finally {
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          bitmap?.close();
        }
      }
    },

    draw(ck: CanvasKit, target: Canvas, item: SkiaDocumentImage): void {
      const texture = textures.get(item.src)?.image;
      if (!texture) throw new Error("GPU image texture is not ready");
      const paint = new ck.Paint();
      target.save();
      try {
        paint.setAntiAlias(true);
        paint.setAlphaf(item.opacity);
        target.translate(item.x, item.y);
        target.rotate(item.rotation, 0, 0);
        target.translate(item.flipX ? item.width : 0, item.flipY ? item.height : 0);
        target.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
        target.drawImageRectOptions(
          texture,
          [0, 0, texture.width(), texture.height()],
          [0, 0, item.width, item.height],
          ck.FilterMode.Linear,
          ck.MipmapMode.None,
          paint,
        );
      } finally {
        target.restore();
        paint.delete();
      }
    },

    retain(items: readonly SkiaDocumentItem[]): void {
      const wanted = new Set(items.flatMap((item) => item.image ? [item.image.src] : []));
      for (const [src, entry] of textures) {
        if (wanted.has(src)) continue;
        disposeImage(entry.image);
        textures.delete(src);
      }
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const entry of textures.values()) disposeImage(entry.image);
      textures.clear();
    },
  };
}
