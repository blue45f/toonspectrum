import type { CreatorMarketplaceResourceRecord } from "@/lib/creator-marketplace-resource-contract";

import {
  CreatorMarketplaceResourceRecordSchema,
} from "@/lib/creator-marketplace-resource-contract";


export interface CachedMarketPage {
  readonly savedAt: string;
  readonly items: readonly CreatorMarketplaceResourceRecord[];
  readonly hasMore: boolean;
}

const PAGE_KEY_PREFIX = "toonspectrum.market.page.v1:";
const RESOURCE_KEY_PREFIX = "toonspectrum.resource.v1:";
const MAX_STORED_CHARACTERS = 300_000;

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

function parseRecords(value: unknown): CreatorMarketplaceResourceRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = CreatorMarketplaceResourceRecordSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function readCachedMarketPage(queryKey: string): CachedMarketPage | null {
  if (typeof localStorage === "undefined") return null;
  const cached = readJson(localStorage, `${PAGE_KEY_PREFIX}${queryKey}`);
  if (!cached || typeof cached !== "object") return null;
  const savedAt = parseSavedAt((cached as { savedAt?: unknown }).savedAt);
  const items = parseRecords((cached as { items?: unknown }).items);
  if (!savedAt || items.length === 0) return null;
  const hasMore = (cached as { hasMore?: unknown }).hasMore === true;
  return { savedAt, items, hasMore };
}

export function writeCachedMarketPage(
  queryKey: string,
  payload: { items: readonly CreatorMarketplaceResourceRecord[]; hasMore: boolean }
): void {
  if (typeof localStorage === "undefined" || payload.items.length === 0) return;
  try {
    const serialized = JSON.stringify({
      savedAt: new Date().toISOString(),
      items: payload.items,
      hasMore: payload.hasMore,
    });
    if (serialized.length > MAX_STORED_CHARACTERS) return;
    localStorage.setItem(`${PAGE_KEY_PREFIX}${queryKey}`, serialized);
  } catch {
    // 저장 실패(비공개 모드·quota)는 캐시 부재와 동일하게 취급한다.
  }
}

export function readCachedMarketResource(
  id: string
): { savedAt: string; record: CreatorMarketplaceResourceRecord } | null {
  if (typeof localStorage === "undefined") return null;
  const cached = readJson(localStorage, `${RESOURCE_KEY_PREFIX}${id}`);
  if (!cached || typeof cached !== "object") return null;
  const savedAt = parseSavedAt((cached as { savedAt?: unknown }).savedAt);
  const [record] = parseRecords([(cached as { record?: unknown }).record]);
  return savedAt && record ? { savedAt, record } : null;
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
