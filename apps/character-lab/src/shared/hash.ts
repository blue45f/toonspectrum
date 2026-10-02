/**
 * 결정적 해시 유틸. 외부 의존성 없음.
 * - fnv1a32/fnv1a64: 레시피 digest·캐시 키·PRNG 시드용(암호학적 아님)
 * - sha256Hex: 제작 패키지 파일 검증·물리 영수증용(`crypto.subtle`)
 */
const UTF8 = new TextEncoder();

const FNV32_OFFSET = 0x811c9dc5;
const FNV32_PRIME = 0x01000193;

/** 바이트 열의 FNV-1a 32bit(부호 없는 정수) */
export function fnv1a32Bytes(bytes: Uint8Array): number {
  let hash = FNV32_OFFSET;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, FNV32_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** 문자열(UTF-8)의 FNV-1a 32bit */
export function fnv1a32(input: string): number {
  return fnv1a32Bytes(UTF8.encode(input));
}

/** 8자리 소문자 hex */
export function fnv1a32Hex(input: string): string {
  return fnv1a32(input).toString(16).padStart(8, "0");
}

const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

/** 바이트 열의 FNV-1a 64bit → 16자리 소문자 hex */
export function fnv1a64HexBytes(bytes: Uint8Array): string {
  let hash = FNV64_OFFSET;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= BigInt(bytes[i] ?? 0);
    hash = (hash * FNV64_PRIME) & MASK64;
  }
  return hash.toString(16).padStart(16, "0");
}

/** 문자열(UTF-8)의 FNV-1a 64bit → 16자리 소문자 hex */
export function fnv1a64Hex(input: string): string {
  return fnv1a64HexBytes(UTF8.encode(input));
}

function toArrayBufferCopy(bytes: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) return bytes;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/** SHA-256 → 64자리 소문자 hex. Node 22와 브라우저 모두 전역 `crypto.subtle`을 쓴다. */
export async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("이 환경에는 crypto.subtle이 없어 SHA-256을 계산할 수 없습니다.");
  }
  const digest = await subtle.digest("SHA-256", toArrayBufferCopy(bytes));
  const view = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < view.length; i += 1) {
    hex += (view[i] ?? 0).toString(16).padStart(2, "0");
  }
  return hex;
}

export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u;

export function isSha256Hex(value: string): boolean {
  return SHA256_HEX_PATTERN.test(value);
}
