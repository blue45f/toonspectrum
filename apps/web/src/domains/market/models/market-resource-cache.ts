import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import {
  CreatorMarketplaceResourceRecordSchema,
} from "@/shared/lib/creator-marketplace-resource-contract";

export interface CachedMarketPage {
  readonly savedAt: string;
  readonly items: readonly CreatorMarketplaceResourceRecord[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
}

export interface CachedMarketResource {
  readonly savedAt: string;
  readonly record: CreatorMarketplaceResourceRecord;
}

const PAGE_KEY_PREFIX = "toonspectrum.market.page.v1:";
const RESOURCE_KEY_PREFIX = "toonspectrum.resource.v1:";
const AUTHORITATIVE_RESOURCE_KEY_PREFIX = "toonspectrum.resource.authority.v2:";
const MAX_STORED_CHARACTERS = 300_000;
export const MARKET_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
export const MARKET_CACHE_MAX_ENTRIES = 24;
export const MARKET_CACHE_MAX_KEY_CHARACTERS = 2_048;

function isMarketCacheKey(key: string): boolean {
  return key.startsWith(PAGE_KEY_PREFIX)
    || key.startsWith(RESOURCE_KEY_PREFIX)
    || key.startsWith(AUTHORITATIVE_RESOURCE_KEY_PREFIX);
}

function readJson(storage: Storage, key: string): unknown | null {
  try {
    const raw = storage.getItem(key);
    if (!raw || raw.length > MAX_STORED_CHARACTERS) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function parseSavedAt(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime())
    ? value
    : null;
}

function removeStoredValue(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Treat failed removal as a cache miss on the next guarded read.
  }
}

function marketCacheKeys(storage: Storage): string[] {
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && isMarketCacheKey(key)) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

function pruneStoredMarketCache(
  storage: Storage,
  nowMs: number,
  maxEntries = MARKET_CACHE_MAX_ENTRIES,
): void {
  if (!Number.isFinite(nowMs)) return;
  const candidates: Array<{ key: string; savedAtMs: number }> = [];

  for (const key of marketCacheKeys(storage)) {
    if (key.length > MARKET_CACHE_MAX_KEY_CHARACTERS) {
      removeStoredValue(storage, key);
      continue;
    }
    const cached = readJson(storage, key);
    const savedAt = cached && typeof cached === "object"
      ? parseSavedAt((cached as { savedAt?: unknown }).savedAt)
      : null;
    const savedAtMs = savedAt ? new Date(savedAt).getTime() : Number.NaN;
    const ageMs = nowMs - savedAtMs;
    if (
      !savedAt
      || !Number.isFinite(savedAtMs)
      || ageMs < 0
      || ageMs > MARKET_CACHE_MAX_AGE_MS
    ) {
      removeStoredValue(storage, key);
      continue;
    }
    candidates.push({ key, savedAtMs });
  }

  candidates.sort((left, right) => {
    if (left.savedAtMs !== right.savedAtMs) return right.savedAtMs - left.savedAtMs;
    return left.key.localeCompare(right.key);
  });
  for (const candidate of candidates.slice(Math.max(0, maxEntries))) {
    removeStoredValue(storage, candidate.key);
  }
}

function prepareMarketCacheWrite(storage: Storage, key: string, nowMs: number): void {
  pruneStoredMarketCache(storage, nowMs);
  try {
    if (storage.getItem(key) === null) {
      pruneStoredMarketCache(storage, nowMs, MARKET_CACHE_MAX_ENTRIES - 1);
    }
  } catch {
    // setItem below owns failure handling.
  }
}

function readFreshSavedAt(
  storage: Storage,
  key: string,
  value: unknown,
  nowMs: number,
): string | null {
  const savedAt = parseSavedAt(value);
  const savedAtMs = savedAt ? new Date(savedAt).getTime() : Number.NaN;
  const ageMs = nowMs - savedAtMs;
  if (
    !savedAt
    || !Number.isFinite(nowMs)
    || ageMs < 0
    || ageMs > MARKET_CACHE_MAX_AGE_MS
  ) {
    removeStoredValue(storage, key);
    return null;
  }
  return savedAt;
}

function parseRecords(value: unknown): CreatorMarketplaceResourceRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = CreatorMarketplaceResourceRecordSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function readCachedResourceByPrefix(
  prefix: string,
  id: string,
  nowMs: number,
): CachedMarketResource | null {
  if (typeof localStorage === "undefined") return null;
  pruneStoredMarketCache(localStorage, nowMs);
  const key = `${prefix}${id}`;
  if (key.length > MARKET_CACHE_MAX_KEY_CHARACTERS) return null;
  const cached = readJson(localStorage, key);
  if (!cached || typeof cached !== "object") return null;
  const savedAt = readFreshSavedAt(
    localStorage,
    key,
    (cached as { savedAt?: unknown }).savedAt,
    nowMs,
  );
  const [record] = parseRecords([(cached as { record?: unknown }).record]);
  if (!savedAt) return null;
  if (!record) {
    removeStoredValue(localStorage, key);
    return null;
  }
  return { savedAt, record };
}

function writeCachedResourceByPrefix(
  prefix: string,
  record: CreatorMarketplaceResourceRecord,
): void {
  if (typeof localStorage === "undefined") return;
  const nowMs = Date.now();
  const key = `${prefix}${record.id}`;
  pruneStoredMarketCache(localStorage, nowMs);
  if (key.length > MARKET_CACHE_MAX_KEY_CHARACTERS) return;
  try {
    const serialized = JSON.stringify({
      savedAt: new Date(nowMs).toISOString(),
      record,
    });
    if (serialized.length > MAX_STORED_CHARACTERS) {
      removeStoredValue(localStorage, key);
      pruneStoredMarketCache(localStorage, nowMs);
      return;
    }
    prepareMarketCacheWrite(localStorage, key, nowMs);
    localStorage.setItem(key, serialized);
  } catch {
    // A write failure is equivalent to an absent cache.
  }
}

export function readCachedMarketPage(
  queryKey: string,
  nowMs = Date.now(),
): CachedMarketPage | null {
  if (typeof localStorage === "undefined") return null;
  pruneStoredMarketCache(localStorage, nowMs);
  const key = `${PAGE_KEY_PREFIX}${queryKey}`;
  if (key.length > MARKET_CACHE_MAX_KEY_CHARACTERS) return null;
  const cached = readJson(localStorage, key);
  if (!cached || typeof cached !== "object") return null;
  const savedAt = readFreshSavedAt(
    localStorage,
    key,
    (cached as { savedAt?: unknown }).savedAt,
    nowMs,
  );
  const items = parseRecords((cached as { items?: unknown }).items);
  if (!savedAt) return null;
  if (items.length === 0) {
    removeStoredValue(localStorage, key);
    return null;
  }
  const rawCursor = (cached as { nextCursor?: unknown }).nextCursor;
  const parsedCursor = typeof rawCursor === "string" && rawCursor.trim()
    ? rawCursor.trim()
    : null;
  const nextCursor = (cached as { hasMore?: unknown }).hasMore === true
    ? parsedCursor
    : null;
  return {
    savedAt,
    items,
    hasMore: nextCursor !== null,
    nextCursor,
  };
}

export function writeCachedMarketPage(
  queryKey: string,
  payload: {
    items: readonly CreatorMarketplaceResourceRecord[];
    hasMore: boolean;
    nextCursor: string | null;
  },
): void {
  if (typeof localStorage === "undefined") return;
  const nowMs = Date.now();
  const key = `${PAGE_KEY_PREFIX}${queryKey}`;
  pruneStoredMarketCache(localStorage, nowMs);
  if (key.length > MARKET_CACHE_MAX_KEY_CHARACTERS) return;
  if (payload.items.length === 0) {
    removeStoredValue(localStorage, key);
    return;
  }
  try {
    const nextCursor = payload.hasMore && payload.nextCursor?.trim()
      ? payload.nextCursor
      : null;
    const serialized = JSON.stringify({
      savedAt: new Date(nowMs).toISOString(),
      items: payload.items,
      hasMore: nextCursor !== null,
      nextCursor,
    });
    if (serialized.length > MAX_STORED_CHARACTERS) {
      removeStoredValue(localStorage, key);
      pruneStoredMarketCache(localStorage, nowMs);
      return;
    }
    prepareMarketCacheWrite(localStorage, key, nowMs);
    localStorage.setItem(key, serialized);
  } catch {
    // A write failure is equivalent to an absent cache.
  }
}

/** Legacy mixed cache retained only for explicit migration/eviction callers. */
export function readCachedMarketResource(
  id: string,
  nowMs = Date.now(),
): CachedMarketResource | null {
  return readCachedResourceByPrefix(RESOURCE_KEY_PREFIX, id, nowMs);
}

export function removeCachedMarketResource(id: string): void {
  if (typeof localStorage === "undefined") return;
  removeStoredValue(localStorage, `${RESOURCE_KEY_PREFIX}${id}`);
}

export function writeCachedMarketResource(
  record: CreatorMarketplaceResourceRecord,
): void {
  writeCachedResourceByPrefix(RESOURCE_KEY_PREFIX, record);
}

/** Detail fallback written only after a successful authoritative server response. */
export function readAuthoritativeCachedMarketResource(
  id: string,
  nowMs = Date.now(),
): CachedMarketResource | null {
  return readCachedResourceByPrefix(AUTHORITATIVE_RESOURCE_KEY_PREFIX, id, nowMs);
}

export function removeAuthoritativeCachedMarketResource(id: string): void {
  if (typeof localStorage === "undefined") return;
  removeStoredValue(localStorage, `${AUTHORITATIVE_RESOURCE_KEY_PREFIX}${id}`);
}

export function writeAuthoritativeCachedMarketResource(
  record: CreatorMarketplaceResourceRecord,
): void {
  writeCachedResourceByPrefix(AUTHORITATIVE_RESOURCE_KEY_PREFIX, record);
}
