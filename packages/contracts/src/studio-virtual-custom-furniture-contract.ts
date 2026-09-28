/**
 * 사용자가 직접 올리는 가상 스튜디오 가구 계약.
 *
 * 브라우저가 "이것은 png"라고 말하는 값을 믿지 않는다. 확장자와 Content-Type은
 * 공격자가 마음대로 고르는 문자열이므로, 바이트 시그니처로 형식을 다시 확인한 뒤에야
 * 받는다. JPEG는 알파 채널이 없어 가구 투명 배경이 깨지므로 받지 않는다.
 */

export const STUDIO_VIRTUAL_CUSTOM_FURNITURE_MIME = ["image/png", "image/webp"] as const;
export type StudioVirtualCustomFurnitureMime = (typeof STUDIO_VIRTUAL_CUSTOM_FURNITURE_MIME)[number];

/** 원본 업로드 상한. 재인코딩으로 더 작아질 수 있어 원본 기준이다. */
export const STUDIO_VIRTUAL_CUSTOM_FURNITURE_MAX_BYTES = 1024 * 1024;

/** 한 변의 최대 픽셀. 작은 파일에 거대한 픽셀 수를 숨기는 픽셀 폭탄을 막는다. */
export const STUDIO_VIRTUAL_CUSTOM_FURNITURE_MAX_EDGE = 1024;

/** 렌더에 쓰는 정사각 한 변. 서버가 이 크기로 재인코딩한다. */
export const STUDIO_VIRTUAL_CUSTOM_FURNITURE_EDGE = 256;

/** 사용자가 준 이름은 DB에 그대로 두지 않는다. 이 길이 안에서 새긴다. */
export const STUDIO_VIRTUAL_CUSTOM_FURNITURE_NAME_MAX = 40;

export const STUDIO_VIRTUAL_CUSTOM_FURNITURE_EXTENSIONS: Record<StudioVirtualCustomFurnitureMime, string> = {
  "image/png": "png",
  "image/webp": "webp",
};

export type StudioVirtualCustomFurnitureRejectReason =
  | "shape"
  | "name"
  | "mime"
  | "bytes"
  | "signature"
  | "dimensions";

export type StudioVirtualCustomFurnitureAdmission =
  | { readonly ok: true; readonly mime: StudioVirtualCustomFurnitureMime; readonly name: string }
  | { readonly ok: false; readonly reason: StudioVirtualCustomFurnitureRejectReason; readonly error: string };

/** PNG 89 50 4E 47 0D 0A 1A 0A */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** WebP 는 RIFF....WEBP */
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50];

/** PNG IHDR 는 8바이트 시그니처 뒤 8바이트 크기(너비·높이 big-endian)에 온다. */
export function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export function readWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  for (let index = 0; index < RIFF_SIGNATURE.length; index += 1) {
    if (bytes[index] !== RIFF_SIGNATURE[index]) return null;
  }
  for (let index = 0; index < WEBP_SIGNATURE.length; index += 1) {
    if (bytes[8 + index] !== WEBP_SIGNATURE[index]) return null;
  }
  const format = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === "VP8X") {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { width, height };
  }
  if (format === "VP8 ") {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (format === "VP8L") {
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

export function detectFurnitureMime(bytes: Uint8Array): StudioVirtualCustomFurnitureMime | null {
  if (readPngDimensions(bytes)) return "image/png";
  if (readWebpDimensions(bytes)) return "image/webp";
  return null;
}

function isDeclaredMime(value: unknown): value is StudioVirtualCustomFurnitureMime {
  return typeof value === "string" && (STUDIO_VIRTUAL_CUSTOM_FURNITURE_MIME as readonly string[]).includes(value);
}

/**
 * 조작 문자를 공백으로 바꾼다. 이름이 로그 줄·채팅·파일명에 그대로 실리므로 개행이나
 * ANSI 이스케이프가 섞이면 다른 사람이 조작할 수 있다.
 */
function stripControlCharacters(value: string): string {
  let out = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    out += code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? " " : character;
  }
  return out;
}

function sanitizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = stripControlCharacters(value).replace(/\s+/gu, " ").trim();
  if (!cleaned) return null;
  const sliced = [...cleaned].slice(0, STUDIO_VIRTUAL_CUSTOM_FURNITURE_NAME_MAX).join("");
  return sliced || null;
}

/**
 * 업로드 1건이 서버에 들어갈 수 있는지 판정한다. bytes 는 이미 디코딩된 원본 바이트다.
 * 형식은 시그니처로 다시 확인하고, 픽셀 폭탄은 한 변 상한으로 막는다.
 */
export function admitStudioVirtualCustomFurniture(input: {
  declaredMime: unknown;
  name: unknown;
  bytes: Uint8Array;
}): StudioVirtualCustomFurnitureAdmission {
  if (!input || !isDeclaredMime(input.declaredMime)) {
    return { ok: false, reason: "mime", error: "PNG 또는 WebP만 올릴 수 있어요." };
  }

  const name = sanitizeName(input.name);
  if (!name) {
    return { ok: false, reason: "name", error: "가구 이름을 확인해 주세요." };
  }

  if (!(input.bytes instanceof Uint8Array) || input.bytes.length === 0) {
    return { ok: false, reason: "shape", error: "업로드한 파일을 읽지 못했어요." };
  }

  if (input.bytes.length > STUDIO_VIRTUAL_CUSTOM_FURNITURE_MAX_BYTES) {
    return {
      ok: false,
      reason: "bytes",
      error: `가구 이미지는 ${Math.floor(STUDIO_VIRTUAL_CUSTOM_FURNITURE_MAX_BYTES / 1024 / 1024)}MB 이하로 올려 주세요.`,
    };
  }

  const detected = detectFurnitureMime(input.bytes);
  if (!detected) {
    return { ok: false, reason: "signature", error: "이 파일은 지원하지 않는 이미지 형식이에요." };
  }
  if (detected !== input.declaredMime) {
    return { ok: false, reason: "signature", error: "선택한 형식과 실제 파일 내용이 달라요." };
  }

  const size = detected === "image/png" ? readPngDimensions(input.bytes) : readWebpDimensions(input.bytes);
  if (!size || size.width < 1 || size.height < 1) {
    return { ok: false, reason: "dimensions", error: "이미지 크기를 읽지 못했어요." };
  }
  if (size.width > STUDIO_VIRTUAL_CUSTOM_FURNITURE_MAX_EDGE || size.height > STUDIO_VIRTUAL_CUSTOM_FURNITURE_MAX_EDGE) {
    return {
      ok: false,
      reason: "dimensions",
      error: `가구는 한 변이 ${STUDIO_VIRTUAL_CUSTOM_FURNITURE_MAX_EDGE}픽셀 이하여야 해요.`,
    };
  }

  return { ok: true, mime: detected, name };
}
