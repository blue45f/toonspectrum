export const SKIA_DOCUMENT_IMAGE_MAX_ENCODED_BYTES = 32 * 1024 * 1024;
export const SKIA_DOCUMENT_IMAGE_MAX_PIXELS = 16 * 1024 * 1024;
export const SKIA_DOCUMENT_IMAGE_MAX_DIMENSION = 8192;

function assertDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0
    || width > SKIA_DOCUMENT_IMAGE_MAX_DIMENSION || height > SKIA_DOCUMENT_IMAGE_MAX_DIMENSION
    || width * height > SKIA_DOCUMENT_IMAGE_MAX_PIXELS) {
    throw new Error("GPU image exceeds the decoded pixel budget; original asset preserved");
  }
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

function pngIsAnimated(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) throw new Error("Truncated PNG asset");
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (kind === "acTL") return true;
    offset += length + 12;
    if (kind === "IEND") return false;
  }
  throw new Error("Truncated PNG asset");
}

function sniffMime(bytes: Uint8Array): "image/png" | "image/jpeg" {
  if (isPng(bytes)) {
    if (pngIsAnimated(bytes)) throw new Error("Animated images stay on the existing animation provider");
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  throw new Error("GPU image display currently requires a static PNG or JPEG asset");
}

function encodedDimensions(bytes: Uint8Array, mime: "image/png" | "image/jpeg"): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === "image/png") {
    if (bytes.length < 24 || view.getUint32(8) !== 13
      || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") {
      throw new Error("Invalid PNG header");
    }
    return [view.getUint32(16), view.getUint32(20)];
  }
  let offset = 2;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 4 <= bytes.length) {
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) throw new Error("Truncated JPEG asset");
    if (sof.has(marker)) {
      if (length < 8) throw new Error("Invalid JPEG frame");
      return [view.getUint16(offset + 3), view.getUint16(offset + 5)];
    }
    offset += length;
  }
  throw new Error("JPEG dimensions are unavailable");
}

async function readBounded(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > SKIA_DOCUMENT_IMAGE_MAX_ENCODED_BYTES) {
    throw new Error("GPU image exceeds the encoded byte budget");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > SKIA_DOCUMENT_IMAGE_MAX_ENCODED_BYTES) throw new Error("GPU image exceeds the encoded byte budget");
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > SKIA_DOCUMENT_IMAGE_MAX_ENCODED_BYTES) throw new Error("GPU image exceeds the encoded byte budget");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function loadSkiaDocumentImageBitmap(src: string, signal: AbortSignal): Promise<ImageBitmap> {
  if (!src || src.length > SKIA_DOCUMENT_IMAGE_MAX_ENCODED_BYTES * 1.5) {
    throw new Error("Invalid GPU image source");
  }
  signal.throwIfAborted();
  const response = await fetch(src, { signal, credentials: "same-origin" });
  if (!response.ok) throw new Error("GPU image asset could not be loaded");
  const bytes = await readBounded(response, signal);
  const mime = sniffMime(bytes);
  const [encodedWidth, encodedHeight] = encodedDimensions(bytes, mime);
  assertDimensions(encodedWidth, encodedHeight);
  signal.throwIfAborted();
  const encoded = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(encoded).set(bytes);
  const bitmap = await createImageBitmap(new Blob([encoded], { type: mime }), { premultiplyAlpha: "none" });
  try {
    signal.throwIfAborted();
    assertDimensions(bitmap.width, bitmap.height);
    return bitmap;
  } catch (cause) {
    bitmap.close();
    throw cause;
  }
}
