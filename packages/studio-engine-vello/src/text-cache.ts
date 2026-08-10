import { shapeTextToGlyphPaths } from "./text";

import type { ShapeTextOptions, ShapedText } from "./text";

/**
 * Glifo lane (V12 gate matrix): repeated-text shaping cache.
 *
 * Speech bubbles, SFX lettering, UI chrome and timeline labels re-shape the
 * same (text, font, size, wrap-width) tuples every frame. Each shaping call
 * crosses the wasm boundary (font-byte copy + parley layout + JSON round
 * trip), so identical requests are pure waste. This module memoizes shaping
 * results in an LRU keyed by every parameter of {@link shapeTextToGlyphPaths}
 * — omitting any parameter from the key would let two different requests
 * collide and poison the cache.
 *
 * Pollution guard: cached values are **deep-frozen** (not defensively
 * copied). Hits return the same frozen object; any caller mutation attempt
 * throws a TypeError in strict mode instead of silently corrupting later
 * hits. Freezing is chosen over copying because the hot path (a hit) must
 * stay allocation-free.
 */

export interface TextShapeCacheOptions {
  /** Maximum resident entries before LRU eviction. Must be a positive integer. */
  maxEntries: number;
  /** Approximate resident-byte budget before LRU eviction. Must be positive. */
  maxBytes: number;
}

export interface TextShapeCacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  entries: number;
  approxBytes: number;
}

export interface TextShapeCache {
  readonly maxEntries: number;
  readonly maxBytes: number;
  /**
   * LRU lookup: refreshes recency and counts a hit or a miss. Returns the
   * deep-frozen cached value, or undefined on miss.
   */
  lookup(key: string): ShapedText | undefined;
  /**
   * Deep-freezes and admits a shaping result, evicting least-recently-used
   * entries until both budgets hold. An entry whose lone estimate already
   * exceeds maxBytes is returned frozen but never admitted (admitting it
   * would evict the whole cache and still bust the budget). Returns the
   * frozen value so callers always hand out the canonical frozen object.
   */
  store(key: string, value: ShapedText): ShapedText;
  metrics(): TextShapeCacheMetrics;
  /** Drops all resident entries; cumulative hit/miss/eviction counters remain. */
  clear(): void;
}

/**
 * 32-bit FNV-1a over raw bytes. Deterministic across runs/platforms —
 * offset basis 0x811c9dc5, prime 0x01000193 (via Math.imul for exact
 * 32-bit wraparound).
 */
export function fnv1a32(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Content hash of a font buffer, memoized per buffer instance. Font assets
 * are loaded once and treated as immutable afterwards, so hashing the same
 * Uint8Array repeatedly (hundreds of KB per glance) would dominate the hit
 * path; the WeakMap makes steady-state key derivation O(text) instead of
 * O(fontBytes). A *different* buffer instance with identical content hashes
 * to the same key (content-addressed), so re-reads of the same font file
 * still hit.
 */
const fontKeyByBuffer = new WeakMap<Uint8Array, string>();

function fontContentKey(fontBytes: Uint8Array): string {
  let key = fontKeyByBuffer.get(fontBytes);
  if (key === undefined) {
    key = `${fnv1a32(fontBytes).toString(16)}-${fontBytes.byteLength}`;
    fontKeyByBuffer.set(fontBytes, key);
  }
  return key;
}

/**
 * Cache key covering **every** shaping parameter of shapeTextToGlyphPaths:
 * font bytes (content hash + length), fontSizePx, maxWidthPx, and the text
 * itself. Text is the final segment so embedded separators cannot collide
 * with the numeric fields.
 */
export function computeTextShapeKey(
  text: string,
  fontBytes: Uint8Array,
  options: ShapeTextOptions,
): string {
  return `${fontContentKey(fontBytes)}|${options.fontSizePx}|${options.maxWidthPx}|${text}`;
}

// Approximate resident size of a cached ShapedText. This is a documented
// estimate, not a measurement (V8 exposes no per-object sizes):
//   BYTES_PER_VERB  = 96 — worst-case "C" verb object: 6 float64 coords + the
//                          verb tag (7 properties × 8B slots ≈ 56B payload),
//                          rounded up to 96B for object header/shape overhead.
//   BYTES_PER_GLYPH = 64 — glyph record: id/x/y numbers + the path wrapper.
//   BYTES_PER_ENTRY = 128 — key string + entry record + Map slot overhead.
// estimate = BYTES_PER_ENTRY + glyphs × BYTES_PER_GLYPH + Σverbs × BYTES_PER_VERB
const BYTES_PER_VERB = 96;
const BYTES_PER_GLYPH = 64;
const BYTES_PER_ENTRY = 128;

export function estimateShapedTextBytes(shaped: ShapedText): number {
  let verbCount = 0;
  for (const glyph of shaped.glyphs) {
    verbCount += glyph.path.verbs.length;
  }
  return (
    BYTES_PER_ENTRY +
    shaped.glyphs.length * BYTES_PER_GLYPH +
    verbCount * BYTES_PER_VERB
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

interface CacheEntry {
  value: ShapedText;
  bytes: number;
}

export function createTextShapeCache(
  options: TextShapeCacheOptions,
): TextShapeCache {
  const { maxEntries, maxBytes } = options;
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError(
      `maxEntries must be a positive integer, got ${maxEntries}`,
    );
  }
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new RangeError(`maxBytes must be a positive number, got ${maxBytes}`);
  }

  // Map iteration order is insertion order; re-inserting on hit makes the
  // first key the least recently used, so eviction pops from the front.
  const entries = new Map<string, CacheEntry>();
  let approxBytes = 0;
  let hits = 0;
  let misses = 0;
  let evictions = 0;

  const evictWhileOverBudget = (): void => {
    while (entries.size > maxEntries || approxBytes > maxBytes) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = entries.get(oldestKey);
      entries.delete(oldestKey);
      approxBytes -= oldest?.bytes ?? 0;
      evictions += 1;
    }
  };

  return {
    maxEntries,
    maxBytes,
    lookup(key: string): ShapedText | undefined {
      const entry = entries.get(key);
      if (entry === undefined) {
        misses += 1;
        return undefined;
      }
      hits += 1;
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    store(key: string, value: ShapedText): ShapedText {
      const frozen = deepFreeze(value);
      const bytes = estimateShapedTextBytes(frozen);
      if (bytes > maxBytes) return frozen;
      const previous = entries.get(key);
      if (previous !== undefined) {
        entries.delete(key);
        approxBytes -= previous.bytes;
      }
      entries.set(key, { value: frozen, bytes });
      approxBytes += bytes;
      evictWhileOverBudget();
      return frozen;
    },
    metrics(): TextShapeCacheMetrics {
      return { hits, misses, evictions, entries: entries.size, approxBytes };
    },
    clear(): void {
      entries.clear();
      approxBytes = 0;
    },
  };
}

/**
 * Cached front of {@link shapeTextToGlyphPaths}: a miss shapes through the
 * wasm lane and admits the result; a hit returns the canonical deep-frozen
 * value without touching wasm. Results are always deep-frozen, on both the
 * hit and the miss path.
 */
export function shapeTextCached(
  cache: TextShapeCache,
  text: string,
  fontBytes: Uint8Array,
  options: ShapeTextOptions,
): ShapedText {
  const key = computeTextShapeKey(text, fontBytes, options);
  const cached = cache.lookup(key);
  if (cached !== undefined) return cached;
  return cache.store(key, shapeTextToGlyphPaths(text, fontBytes, options));
}
