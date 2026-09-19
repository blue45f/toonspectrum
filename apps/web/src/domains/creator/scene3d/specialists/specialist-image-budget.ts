import {
  inspectStrictJpegDimensions,
  inspectStrictStaticWebpDimensions,
} from "@/shared/lib/strict-raster-image-inspector";
import { inspectStudioBg3dBasisKtx2 } from "../../bg3d/studio-bg3d-ktx2-validation";
import { SpecialistError } from "./specialist-contract";
import type { GLTF } from "@gltf-transform/core";

export const SPECIALIST_IMAGE_LIMITS = Object.freeze({
  count: 64,
  dimension: 4096,
  pixelsPerImage: 4096 * 4096,
  totalRgbaBytes: 64 * 1024 * 1024,
  jsonBytes: 8 * 1024 * 1024,
});
export interface SpecialistImageInfo {
  readonly width: number;
  readonly height: number;
  readonly decodedBytes: number;
  readonly mime: "image/png" | "image/jpeg" | "image/webp" | "image/ktx2";
}
const invalid = (detail: string): never => {
  throw new SpecialistError("invalid-input", detail);
};
const signature = [137, 80, 78, 71, 13, 10, 26, 10];
function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 45 || !signature.every((value, i) => bytes[i] === value))
    invalid("Invalid PNG header.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let chunks = 0;
  let width = 0;
  let height = 0;
  let data = false;
  let ended = false;
  while (offset < bytes.length) {
    if (++chunks > 8192 || offset + 12 > bytes.length)
      invalid("PNG chunk budget exceeded.");
    const length = view.getUint32(offset, false);
    const end = offset + length + 12;
    if (end > bytes.length) invalid("Truncated PNG chunk.");
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (offset === 8 && (kind !== "IHDR" || length !== 13))
      invalid("Missing PNG IHDR.");
    if (kind === "IHDR") {
      if (offset !== 8) invalid("Duplicate PNG dimensions.");
      width = view.getUint32(offset + 8, false);
      height = view.getUint32(offset + 12, false);
      if (
        !width ||
        !height ||
        bytes[offset + 18] !== 0 ||
        bytes[offset + 19] !== 0 ||
        bytes[offset + 20]! > 1
      )
        invalid("Unsupported PNG structure.");
    }
    if (kind === "acTL" || kind === "fcTL" || kind === "fdAT")
      invalid("Animated PNG textures are not supported.");
    if (kind === "IDAT") data = true;
    if (kind === "IEND") {
      if (length !== 0 || end !== bytes.length || !data)
        invalid("Invalid PNG trailer.");
      ended = true;
    }
    offset = end;
  }
  if (!ended) invalid("PNG has no complete trailer.");
  return { width, height };
}
/** Pure byte inspection: no browser image decode or GPU allocation can precede this gate. */
export function inspectSpecialistImage(
  bytes: Uint8Array,
  mime: string,
): SpecialistImageInfo {
  let size: { width: number; height: number };
  let decodedBytes: number | undefined;
  try {
    if (mime === "image/png") size = pngDimensions(bytes);
    else if (mime === "image/jpeg") size = inspectStrictJpegDimensions(bytes);
    else if (mime === "image/webp")
      size = inspectStrictStaticWebpDimensions(bytes);
    else if (mime === "image/ktx2") {
      const info = inspectStudioBg3dBasisKtx2(bytes);
      if (!info) invalid("Invalid Basis/KTX2 texture envelope.");
      size = info!;
      decodedBytes = info!.estimatedDecodedBytes;
    } else
      throw new SpecialistError(
        "unsupported",
        "Only bounded PNG, JPEG, WebP or Basis KTX2 textures are supported.",
      );
  } catch (error) {
    if (error instanceof SpecialistError) throw error;
    throw new SpecialistError(
      "invalid-input",
      "Malformed embedded raster image.",
    );
  }
  const pixels = size.width * size.height;
  if (
    !Number.isSafeInteger(pixels) ||
    pixels < 1 ||
    pixels > SPECIALIST_IMAGE_LIMITS.pixelsPerImage ||
    size.width > SPECIALIST_IMAGE_LIMITS.dimension ||
    size.height > SPECIALIST_IMAGE_LIMITS.dimension
  ) {
    throw new SpecialistError(
      "budget",
      "Texture dimensions exceed the 4096-pixel / 16-megapixel image budget. Resize the source before processing.",
    );
  }
  return {
    ...size,
    decodedBytes: decodedBytes ?? pixels * 4,
    mime: mime as SpecialistImageInfo["mime"],
  };
}
export function inspectSpecialistGlbImages(
  bytes: Uint8Array,
  parsed?: GLTF.IGLTF,
): readonly SpecialistImageInfo[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < 20 ||
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.length
  )
    invalid("Invalid preview GLB.");
  const jsonSize = view.getUint32(12, true);
  if (
    view.getUint32(16, true) !== 0x4e4f534a ||
    jsonSize > SPECIALIST_IMAGE_LIMITS.jsonBytes ||
    20 + jsonSize > bytes.length ||
    jsonSize % 4
  )
    invalid("Invalid preview JSON budget.");
  const json =
    parsed ??
    (JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(20, 20 + jsonSize),
      ),
    ) as GLTF.IGLTF);
  if (
    !json ||
    typeof json !== "object" ||
    (json.images !== undefined && !Array.isArray(json.images)) ||
    (json.images?.length ?? 0) > SPECIALIST_IMAGE_LIMITS.count
  )
    invalid("Invalid texture table.");
  const images = json.images ?? [];
  if (!images.length) return [];
  let binStart = -1;
  let binSize = 0;
  let offset = 20 + jsonSize;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) invalid("Truncated texture BIN chunk.");
    const size = view.getUint32(offset, true);
    const kind = view.getUint32(offset + 4, true);
    if (size % 4 || offset + 8 + size > bytes.length)
      invalid("Invalid texture BIN bounds.");
    if (kind === 0x004e4942) {
      if (binStart !== -1) invalid("Duplicate texture BIN.");
      binStart = offset + 8;
      binSize = size;
    }
    offset += size + 8;
  }
  let total = 0;
  return images.map((image) => {
    if (
      !image ||
      image.uri !== undefined ||
      !Number.isSafeInteger(image.bufferView)
    )
      invalid("Texture data must be embedded in a GLB bufferView.");
    const range = json.bufferViews?.[image.bufferView!];
    if (
      !range ||
      range.buffer !== 0 ||
      range.extensions?.EXT_meshopt_compression ||
      !Number.isSafeInteger(range.byteOffset ?? 0) ||
      !Number.isSafeInteger(range.byteLength) ||
      range.byteLength < 1 ||
      (range.byteOffset ?? 0) < 0 ||
      (range.byteOffset ?? 0) + range.byteLength > binSize ||
      binStart < 0
    )
      invalid("Invalid embedded image range.");
    const start = binStart + (range!.byteOffset ?? 0);
    const info = inspectSpecialistImage(
      bytes.subarray(start, start + range!.byteLength),
      image.mimeType ?? "",
    );
    total += info.decodedBytes;
    if (total > SPECIALIST_IMAGE_LIMITS.totalRgbaBytes)
      throw new SpecialistError(
        "budget",
        "Embedded textures exceed the combined 64 MiB decoded-image budget.",
      );
    return info;
  });
}
