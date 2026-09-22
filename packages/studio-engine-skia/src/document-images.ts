import { loadSkiaDocumentImageBitmap } from "./document-image-source";

import type {
  SkiaDocumentBlendMode,
  SkiaDocumentImage,
  SkiaDocumentItem,
} from "./document-contract";
import type {
  BlendMode,
  Canvas,
  CanvasKit,
  Image,
  ImageFilter,
  Paint,
  Surface,
} from "canvaskit-wasm";

export const SKIA_DOCUMENT_IMAGE_TEXTURE_BUDGET = 64 * 1024 * 1024;
export const SKIA_DOCUMENT_IMAGE_PREPARATION_TIMEOUT_MS = 15_000;

export class SkiaDocumentImageAdmissionError extends Error {
  override readonly name = "SkiaDocumentImageAdmissionError";
}

export type SkiaDocumentImageBitmapLoader = (
  src: string,
  signal: AbortSignal,
) => Promise<ImageBitmap>;

function resolveBlendMode(
  ck: CanvasKit,
  mode: SkiaDocumentBlendMode,
): BlendMode {
  switch (mode) {
    case "multiply": return ck.BlendMode.Multiply;
    case "screen": return ck.BlendMode.Screen;
    case "overlay": return ck.BlendMode.Overlay;
    case "soft-light": return ck.BlendMode.SoftLight;
    case "hard-light": return ck.BlendMode.HardLight;
    case "darken": return ck.BlendMode.Darken;
    case "lighten": return ck.BlendMode.Lighten;
    case "color-dodge": return ck.BlendMode.ColorDodge;
    case "color-burn": return ck.BlendMode.ColorBurn;
    case "difference": return ck.BlendMode.Difference;
    case "exclusion": return ck.BlendMode.Exclusion;
    case "hue": return ck.BlendMode.Hue;
    case "saturation": return ck.BlendMode.Saturation;
    case "color": return ck.BlendMode.Color;
    case "luminosity": return ck.BlendMode.Luminosity;
    case "source-over": return ck.BlendMode.SrcOver;
  }
}

function rasterBounds(item: SkiaDocumentImage): readonly [number, number, number, number] {
  const bounds = item.rasterBounds;
  return bounds
    ? [bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height]
    : [0, 0, item.width, item.height];
}

function drawTexture(
  ck: CanvasKit,
  target: Canvas,
  texture: Image,
  item: SkiaDocumentImage,
  paint: Paint,
): void {
  const radius = Math.min(
    item.cornerRadius,
    item.width / 2,
    item.height / 2,
  );
  target.save();
  try {
    if (radius > 0) {
      target.clipRRect(
        ck.RRectXY([0, 0, item.width, item.height], radius, radius),
        ck.ClipOp.Intersect,
        true,
      );
    }
    target.drawImageRectOptions(
      texture,
      [0, 0, texture.width(), texture.height()],
      rasterBounds(item),
      ck.FilterMode.Linear,
      ck.MipmapMode.None,
      paint,
    );
  } finally {
    target.restore();
  }
}

export function createSkiaDocumentImageCache(
  loader: SkiaDocumentImageBitmapLoader = loadSkiaDocumentImageBitmap,
  preparationTimeoutMs = SKIA_DOCUMENT_IMAGE_PREPARATION_TIMEOUT_MS,
) {
  if (!Number.isFinite(preparationTimeoutMs) || preparationTimeoutMs <= 0) {
    throw new Error("Invalid GPU image preparation timeout");
  }
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
        if (signal.aborted) onAbort();
        const timer = setTimeout(
          () => controller.abort(new Error("GPU image preparation timed out")),
          preparationTimeoutMs,
        );
        const loading = Promise.resolve().then(
          () => loader(src, controller.signal),
        );
        let bitmap: ImageBitmap | null = null;
        try {
          const abortPromise = new Promise<never>((_, reject) => {
            const rejectAbort = () => reject(
              controller.signal.reason ?? new Error("GPU image preparation aborted"),
            );
            if (controller.signal.aborted) {
              rejectAbort();
              return;
            }
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
      const sourcePaint = new ck.Paint();
      const layerPaint = item.shadow ? new ck.Paint() : null;
      let shadowFilter: ImageFilter | null = null;
      target.save();
      try {
        target.translate(item.x, item.y);
        target.rotate(item.rotation, 0, 0);
        target.skew(item.skewX, item.skewY);
        target.translate(item.flipX ? item.width : 0, item.flipY ? item.height : 0);
        target.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
        sourcePaint.setAntiAlias(true);
        if (item.shadow && layerPaint) {
          layerPaint.setAntiAlias(true);
          layerPaint.setAlphaf(item.opacity);
          layerPaint.setBlendMode(resolveBlendMode(ck, item.blendMode));
          const alpha = item.shadow.color.a * item.shadow.opacity;
          shadowFilter = ck.ImageFilter.MakeDropShadow(
            item.shadow.offsetX,
            item.shadow.offsetY,
            item.shadow.blur / 2,
            item.shadow.blur / 2,
            Float32Array.of(
              item.shadow.color.r,
              item.shadow.color.g,
              item.shadow.color.b,
              alpha,
            ),
            null,
          );
          layerPaint.setImageFilter(shadowFilter);
          const padding = Math.max(
            Math.abs(item.shadow.offsetX),
            Math.abs(item.shadow.offsetY),
          ) + item.shadow.blur * 3 + 2;
          const bounds = rasterBounds(item);
          target.saveLayer(layerPaint, [
            bounds[0] - padding,
            bounds[1] - padding,
            bounds[2] + padding,
            bounds[3] + padding,
          ]);
          try {
            drawTexture(ck, target, texture, item, sourcePaint);
          } finally {
            target.restore();
          }
        } else {
          sourcePaint.setAlphaf(item.opacity);
          sourcePaint.setBlendMode(resolveBlendMode(ck, item.blendMode));
          drawTexture(ck, target, texture, item, sourcePaint);
        }
      } finally {
        target.restore();
        if (layerPaint) {
          layerPaint.setImageFilter(null);
          layerPaint.delete();
        }
        shadowFilter?.delete();
        sourcePaint.delete();
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
