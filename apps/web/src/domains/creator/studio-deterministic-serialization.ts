export const STUDIO_DETERMINISTIC_SERIALIZATION_VERSION = 1 as const;

export type StudioJsonPrimitive = string | number | boolean | null;
export type StudioJsonValue =
  | StudioJsonPrimitive
  | readonly StudioJsonValue[]
  | { readonly [key: string]: StudioJsonValue };

function normalizeNumber(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError("Deterministic JSON does not accept non-finite numbers.");
  }
  return Object.is(value, -0) ? 0 : value;
}

function normalizeValue(value: unknown, seen: Set<object>): StudioJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return normalizeNumber(value);
  if (typeof value === "bigint" || typeof value === "symbol" || typeof value === "function" || typeof value === "undefined") {
    throw new TypeError(`Unsupported deterministic JSON value: ${typeof value}`);
  }
  if (value instanceof Date) return value.toISOString();
  if (ArrayBuffer.isView(value)) {
    return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }
  if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
  if (typeof value !== "object") throw new TypeError("Unsupported deterministic JSON value.");
  if (seen.has(value)) throw new TypeError("Deterministic JSON does not accept cyclic values.");
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((entry) => normalizeValue(entry, seen));
    const object = value as Record<string, unknown>;
    const result: Record<string, StudioJsonValue> = {};
    for (const key of Object.keys(object).sort()) {
      const entry = object[key];
      if (entry === undefined) continue;
      result[key] = normalizeValue(entry, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

export function studioDeterministicJson(value: unknown): string {
  return JSON.stringify(normalizeValue(value, new Set<object>()));
}

function fnv1a(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function hex32(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/**
 * Stable non-cryptographic content address for local cache and deduplication.
 * Security boundaries must still use SHA-256 on the server.
 */
export function studioDeterministicContentId(value: unknown): string {
  const json = studioDeterministicJson(value);
  return `${hex32(fnv1a(json, 0x811c9dc5))}${hex32(fnv1a(json, 0x9e3779b9))}`;
}

export function parseStudioDeterministicJson<T>(serialized: string, maxBytes = 1_048_576): T {
  if (new TextEncoder().encode(serialized).byteLength > maxBytes) {
    throw new RangeError("Serialized Studio payload exceeds its byte budget.");
  }
  const parsed = JSON.parse(serialized) as unknown;
  normalizeValue(parsed, new Set<object>());
  return parsed as T;
}
