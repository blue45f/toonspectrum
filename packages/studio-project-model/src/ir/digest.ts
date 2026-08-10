/**
 * Deterministic serialization + integrity primitives for the journal layer.
 *
 * canonicalJson sorts object keys recursively so the same IR value always
 * produces the same byte sequence across JS engines. CRC32 guards individual
 * journal entries; FNV-1a 64-bit digests identify scene snapshots. Both are
 * synchronous and dependency-free so recovery can run before any engine loads.
 */

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (entry !== undefined) sorted[key] = sortValue(entry);
    }
    return sorted;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError(`non-finite number is not journal-serializable: ${value}`);
  }
  return value;
}

const CRC32_TABLE = buildCrc32Table();

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
}

export function crc32(text: string): number {
  const bytes = new TextEncoder().encode(text);
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function fnv1a64Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  // BigInt() calls (not literals) keep this file compilable under the root
  // app program's ES2017 target while behaving identically at runtime.
  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = BigInt("0xffffffffffffffff");
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

export function sceneDigest(scene: unknown): string {
  return fnv1a64Hex(canonicalJson(scene));
}
