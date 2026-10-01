/**
 * 콘텐츠 해시·정규 직렬화. Node 22와 브라우저에서 모두 동작하는 전역만 사용한다
 * (`globalThis.crypto.subtle`, `TextEncoder`).
 */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

/** FNV-1a 64비트. 16자리 소문자 hex. */
export function fnv1a64(bytes: Uint8Array): string {
  let h = FNV_OFFSET;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= BigInt(bytes[i] ?? 0);
    h = (h * FNV_PRIME) & MASK64;
  }
  return h.toString(16).padStart(16, "0");
}

/** 문자열 → UTF-8 바이트. */
export function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** SHA-256 hex(64자리). WebCrypto가 없는 환경이면 명시적으로 실패한다. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("sha256Hex: globalThis.crypto.subtle is unavailable");
  }
  const view = new Uint8Array(bytes.byteLength);
  view.set(bytes);
  const digest = await subtle.digest("SHA-256", view);
  const out = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < out.length; i += 1) {
    hex += (out[i] ?? 0).toString(16).padStart(2, "0");
  }
  return hex;
}

function canonicalize(value: unknown): unknown {
  if (typeof value === "number") {
    // -0 → 0, 비유한값은 JSON 규약대로 null
    if (Object.is(value, -0)) return 0;
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((v) => canonicalize(v));
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(value as unknown as ArrayLike<number>, (v) => canonicalize(v));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const v = record[key];
      if (v === undefined) continue;
      out[key] = canonicalize(v);
    }
    return out;
  }
  return value;
}

/** 키 정렬·-0 정규화·undefined 제거 JSON. 같은 값이면 같은 문자열이다. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
