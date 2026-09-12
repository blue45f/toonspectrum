import type { CharacterPsdExportReceipt, CharacterSemanticPass, CharacterSemanticPassId } from "./character-shaper-contract";
import type { CharacterSemanticSkip } from "./character-shaper-psd-assembly";

export const CHARACTER_PSD_WORKER_VERSION = 1;
export const CHARACTER_PSD_MAX_EDGE = 2048;
export const CHARACTER_PSD_MAX_PASSES = 14;
/** 14 RGBA8 passes at 2K; assembly temporaries and the PSD writer are additional Worker memory. */
export const CHARACTER_PSD_MAX_INPUT_BYTES = CHARACTER_PSD_MAX_PASSES * CHARACTER_PSD_MAX_EDGE ** 2 * 4;
export const CHARACTER_PSD_MAX_OUTPUT_BYTES = 256 * 1024 * 1024;
const PASS_IDS: ReadonlySet<string> = new Set([
  "beauty", "flat", "shadow", "highlight", "line", "surface-paint",
  "mask-face", "mask-eyes", "mask-hair", "mask-skin", "mask-top", "mask-bottom", "mask-shoes", "mask-accessory",
]);

export interface CharacterPsdWorkerPass {
  readonly id: CharacterSemanticPassId;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
}
export interface CharacterPsdWorkerRequest {
  readonly version: typeof CHARACTER_PSD_WORKER_VERSION;
  readonly kind: "assemble";
  readonly requestId: number;
  readonly title: string;
  readonly passes: readonly CharacterPsdWorkerPass[];
  readonly skipped: readonly CharacterSemanticSkip[];
}
export type CharacterPsdWorkerResponse =
  | { readonly version: typeof CHARACTER_PSD_WORKER_VERSION; readonly kind: "ready" }
  | { readonly version: typeof CHARACTER_PSD_WORKER_VERSION; readonly kind: "error"; readonly requestId: number; readonly code: "protocol" | "assembly-failed" }
  | { readonly version: typeof CHARACTER_PSD_WORKER_VERSION; readonly kind: "result"; readonly requestId: number; readonly blob: Blob; readonly receipt: CharacterPsdExportReceipt };

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}
function dimension(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= CHARACTER_PSD_MAX_EDGE;
}
function requestId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}
function validSkipped(value: unknown): value is readonly CharacterSemanticSkip[] {
  if (!Array.isArray(value) || value.length > CHARACTER_PSD_MAX_PASSES) return false;
  const seen = new Set<string>();
  return value.every((entry: unknown) => {
    if (!object(entry) || !keys(entry, ["pass", "reason"]) || typeof entry.pass !== "string"
      || !PASS_IDS.has(entry.pass) || seen.has(entry.pass) || typeof entry.reason !== "string"
      || entry.reason.length < 1 || entry.reason.length > 1024) return false;
    seen.add(entry.pass);
    return true;
  });
}

/** Validate before allocating/copying/transferring. No pixel scan and no renderer imports. */
export function validateCharacterPsdPasses(
  passes: readonly CharacterSemanticPass[], skipped: readonly CharacterSemanticSkip[], title: string,
): void {
  if (!Array.isArray(passes) || passes.length < 1 || passes.length > CHARACTER_PSD_MAX_PASSES
    || typeof title !== "string" || title.length > 512 || !validSkipped(skipped)) {
    throw new TypeError("PSD 패스·제목·건너뛴 항목이 올바르지 않습니다.");
  }
  let width = 0;
  let height = 0;
  let bytes = 0;
  const seen = new Set<string>();
  for (const raw of passes as readonly unknown[]) {
    if (!object(raw) || !keys(raw, ["id", "width", "height", "rgba"]) || typeof raw.id !== "string"
      || !PASS_IDS.has(raw.id) || seen.has(raw.id) || !dimension(raw.width) || !dimension(raw.height)
      || !(raw.rgba instanceof Uint8ClampedArray) || !(raw.rgba.buffer instanceof ArrayBuffer)
      || raw.rgba.byteLength !== raw.width * raw.height * 4) {
      throw new TypeError("PSD 렌더 패스 저장소가 올바르지 않습니다.");
    }
    if (seen.size === 0) { width = raw.width; height = raw.height; }
    if (raw.width !== width || raw.height !== height) throw new TypeError("렌더 패스 크기가 서로 달라 PSD를 만들 수 없습니다.");
    seen.add(raw.id);
    bytes += raw.rgba.byteLength;
    if (bytes > CHARACTER_PSD_MAX_INPUT_BYTES) throw new RangeError("PSD 패스 바이트 예산을 초과했습니다.");
  }
}

export function isCharacterPsdWorkerRequest(value: unknown): value is CharacterPsdWorkerRequest {
  try {
    if (!object(value) || !keys(value, ["version", "kind", "requestId", "title", "passes", "skipped"])
      || value.version !== CHARACTER_PSD_WORKER_VERSION || value.kind !== "assemble" || !requestId(value.requestId)) return false;
    validateCharacterPsdPasses(value.passes as readonly CharacterSemanticPass[], value.skipped as readonly CharacterSemanticSkip[], value.title as string);
    const buffers = new Set<ArrayBuffer>();
    for (const pass of value.passes as readonly CharacterPsdWorkerPass[]) {
      // Wire storage is exact and exclusive: reject aliasing or oversized backing allocations.
      if (pass.rgba.byteOffset !== 0 || pass.rgba.byteLength !== pass.rgba.buffer.byteLength || buffers.has(pass.rgba.buffer)) return false;
      buffers.add(pass.rgba.buffer);
    }
    return true;
  } catch { return false; }
}

export function isCharacterPsdWorkerResponse(value: unknown): value is CharacterPsdWorkerResponse {
  try {
    if (!object(value) || value.version !== CHARACTER_PSD_WORKER_VERSION) return false;
    if (value.kind === "ready") return keys(value, ["version", "kind"]);
    if (!requestId(value.requestId)) return false;
    if (value.kind === "error") return keys(value, ["version", "kind", "requestId", "code"])
      && (value.code === "protocol" || value.code === "assembly-failed");
    if (value.kind !== "result" || !keys(value, ["version", "kind", "requestId", "blob", "receipt"])
      || !(value.blob instanceof Blob) || value.blob.type !== "image/vnd.adobe.photoshop"
      || value.blob.size < 40 || value.blob.size > CHARACTER_PSD_MAX_OUTPUT_BYTES) return false;
    const receipt = value.receipt;
    return object(receipt) && keys(receipt, ["width", "height", "layerNames", "skipped", "byteLength"])
      && dimension(receipt.width) && dimension(receipt.height) && receipt.byteLength === value.blob.size
      && Array.isArray(receipt.layerNames) && receipt.layerNames.length >= 1 && receipt.layerNames.length <= 32
      && receipt.layerNames.every((name: unknown) => typeof name === "string" && name.length >= 1 && name.length <= 128)
      && validSkipped(receipt.skipped);
  } catch { return false; }
}

/** PSD v1, RGB, 8-bit channels; dimensions must match the admitted capture, not only the receipt. */
export function isCharacterPsdHeader(bytes: Uint8Array, width: number, height: number): boolean {
  if (bytes.byteLength < 26) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0) === 0x38425053 && view.getUint16(4) === 1
    && bytes.subarray(6, 12).every((byte) => byte === 0)
    && (view.getUint16(12) === 3 || view.getUint16(12) === 4)
    && view.getUint32(14) === height && view.getUint32(18) === width
    && view.getUint16(22) === 8 && view.getUint16(24) === 3;
}
