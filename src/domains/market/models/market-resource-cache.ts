import type { CreatorMarketplaceResourceRecord } from "@/lib/creator-marketplace-resource-contract";

import {
  CreatorMarketplaceResourceRecordSchema,
} from "@/lib/creator-marketplace-resource-contract";


export interface CachedMarketPage {
  readonly savedAt: string;
  readonly items: readonly CreatorMarketplaceResourceRecord[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
}

const PAGE_KEY_PREFIX = "toonspectrum.market.page.v1:";
const RESOURCE_KEY_PREFIX = "toonspectrum.resource.v1:";
const MAX_STORED_CHARACTERS = 300_000;
export const MARKET_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

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
    // 비공개 모드처럼 remove도 실패할 수 있다. 다음 읽기에서도 캐시 부재로 처리하면 충분하다.
  }
}

function readFreshSavedAt(
  storage: Storage,
  key: string,
  value: unknown,
  nowMs: number
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

export function readCachedMarketPage(
  queryKey: string,
  nowMs = Date.now()
): CachedMarketPage | null {
  if (typeof localStorage === "undefined") return null;
  const key = `${PAGE_KEY_PREFIX}${queryKey}`;
  const cached = readJson(localStorage, key);
  if (!cached || typeof cached !== "object") return null;
  const savedAt = readFreshSavedAt(
    localStorage,
    key,
    (cached as { savedAt?: unknown }).savedAt,
    nowMs
  );
  const items = parseRecords((cached as { items?: unknown }).items);
  if (!savedAt || items.length === 0) return null;
  const rawCursor = (cached as { nextCursor?: unknown }).nextCursor;
  const parsedCursor = typeof rawCursor === "string" && rawCursor.trim()
    ? rawCursor.trim()
    : null;
  // v1 캐시는 nextCursor를 저장하지 않았다. 그 레코드의 hasMore=true를 그대로 노출하면
  // 누를 수 있지만 아무 동작도 하지 않는 "더 보기"가 생기므로, cursor가 있을 때만 이어간다.
  const nextCursor = (cached as { hasMore?: unknown }).hasMore === true
    ? parsedCursor
    : null;
  const hasMore = nextCursor !== null;
  return { savedAt, items, hasMore, nextCursor };
}

export function writeCachedMarketPage(
  queryKey: string,
  payload: {
    items: readonly CreatorMarketplaceResourceRecord[];
    hasMore: boolean;
    nextCursor: string | null;
  }
): void {
  if (typeof localStorage === "undefined" || payload.items.length === 0) return;
  try {
    const nextCursor = payload.hasMore && payload.nextCursor?.trim()
      ? payload.nextCursor
      : null;
    const serialized = JSON.stringify({
      savedAt: new Date().toISOString(),
      items: payload.items,
      hasMore: nextCursor !== null,
      nextCursor,
    });
    if (serialized.length > MAX_STORED_CHARACTERS) return;
    localStorage.setItem(`${PAGE_KEY_PREFIX}${queryKey}`, serialized);
  } catch {
    // 저장 실패(비공개 모드·quota)는 캐시 부재와 동일하게 취급한다.
  }
}

export function readCachedMarketResource(
  id: string,
  nowMs = Date.now()
): { savedAt: string; record: CreatorMarketplaceResourceRecord } | null {
  if (typeof localStorage === "undefined") return null;
  const key = `${RESOURCE_KEY_PREFIX}${id}`;
  const cached = readJson(localStorage, key);
  if (!cached || typeof cached !== "object") return null;
  const savedAt = readFreshSavedAt(
    localStorage,
    key,
    (cached as { savedAt?: unknown }).savedAt,
    nowMs
  );
  const [record] = parseRecords([(cached as { record?: unknown }).record]);
  return savedAt && record ? { savedAt, record } : null;
}

export function removeCachedMarketResource(id: string): void {
  if (typeof localStorage === "undefined") return;
  removeStoredValue(localStorage, `${RESOURCE_KEY_PREFIX}${id}`);
}

export function writeCachedMarketResource(
  record: CreatorMarketplaceResourceRecord
): void {
  if (typeof localStorage === "undefined") return;
  try {
    const serialized = JSON.stringify({
      savedAt: new Date().toISOString(),
      record,
    });
    if (serialized.length > MAX_STORED_CHARACTERS) return;
    localStorage.setItem(`${RESOURCE_KEY_PREFIX}${record.id}`, serialized);
  } catch {
    // 저장 실패는 캐시 부재와 동일하게 취급한다.
  }
}
