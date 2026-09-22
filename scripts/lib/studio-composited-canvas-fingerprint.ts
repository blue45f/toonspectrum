import { decode } from "image-js";

export interface StudioCompositedCanvasFingerprint {
  readonly source: "composited-document-screenshot";
  readonly hash: string;
  readonly nonBlankSamples: number;
  readonly sampledPixels: number;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
}

export interface StudioCompositedPixelSource {
  readonly data: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly bitDepth: number;
}

function mixHash(hash: number, value: number): number {
  return Math.imul((hash ^ value) >>> 0, 0x01000193) >>> 0;
}

/**
 * Fingerprints the browser-composited document surface rather than one implementation canvas.
 *
 * Studio document pixels may be owned by Konva, CanvasKit/WebGL, or a retained DOM overlay.
 * Reading only `getImageData()` from Konva therefore reports transparent buffers even while the
 * user-visible document is correct. A page-level Playwright screenshot clipped to the document
 * surface is the common browser-compositor receipt across those renderers; this helper keeps its
 * pixel contract deterministic and independently testable.
 */
export function fingerprintStudioCompositedPixels(
  source: StudioCompositedPixelSource,
): StudioCompositedCanvasFingerprint {
  const {
    data,
    width,
    height,
    channels,
    bitDepth,
  } = source;
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new Error(`invalid composited document dimensions: ${width}x${height}`);
  }
  if (bitDepth !== 8) {
    throw new Error(`unsupported composited document bit depth: ${bitDepth}`);
  }
  if (channels !== 3 && channels !== 4) {
    throw new Error(`unsupported composited document channel count: ${channels}`);
  }
  if (data.length < width * height * channels) {
    throw new Error("composited document pixel buffer is truncated");
  }

  let hash = 0x811c9dc5;
  hash = mixHash(hash, width & 0xff);
  hash = mixHash(hash, (width >>> 8) & 0xff);
  hash = mixHash(hash, height & 0xff);
  hash = mixHash(hash, (height >>> 8) & 0xff);
  hash = mixHash(hash, channels);

  let nonBlankSamples = 0;
  let sampledPixels = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 300_000)));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offset = (y * width + x) * channels;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const alpha = channels === 4 ? (data[offset + 3] ?? 0) : 255;
      if (alpha > 4 && (red < 245 || green < 245 || blue < 245)) {
        nonBlankSamples += 1;
      }
      hash = mixHash(hash, red);
      hash = mixHash(hash, green);
      hash = mixHash(hash, blue);
      hash = mixHash(hash, alpha);
      hash = mixHash(hash, x & 0xff);
      hash = mixHash(hash, y & 0xff);
      sampledPixels += 1;
    }
  }

  return {
    source: "composited-document-screenshot",
    hash: hash.toString(16).padStart(8, "0"),
    nonBlankSamples,
    sampledPixels,
    width,
    height,
    channels,
  };
}

export function fingerprintStudioCompositedPng(
  png: Uint8Array,
): StudioCompositedCanvasFingerprint {
  const image = decode(png);
  return fingerprintStudioCompositedPixels(image.getRawImage());
}
