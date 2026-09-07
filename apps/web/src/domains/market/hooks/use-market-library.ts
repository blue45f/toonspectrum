import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CreatorMarketplaceAcquireReceipt,
  CreatorMarketplaceCloudLibraryItem,
  CreatorMarketplaceCloudLibraryPage,
} from "@/shared/lib/creator-marketplace-cloud-library-contract";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { CreatorMarketplaceResourceRecordSchema } from "@/shared/lib/creator-marketplace-resource-contract";
import { useSession } from "@/src/compat/auth-session-store";
import {
  acquireCreatorMarketplaceCloudLibraryRelease,
  listCreatorMarketplaceCloudLibrary,
} from "@/src/infrastructure/creator-marketplace-client";

export interface AcquiredMarketItem {
  id: string;
  resourceId: string;
  acquiredAt: string;
  archived: boolean;
  resource: CreatorMarketplaceResourceRecord;
}

const CACHE_PREFIX = "toonspectrum:market:confirmed-library-cache:v3:";
export const MARKET_LIBRARY_STORAGE_KEY = CACHE_PREFIX;
export const MARKET_LIBRARY_EVENT = "toonspectrum:market:library-changed";

function cacheKey(userId: string): string {
  return `${CACHE_PREFIX}${encodeURIComponent(userId)}`;
}

function parseStoredItem(value: unknown): AcquiredMarketItem | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AcquiredMarketItem>;
  const parsedResource = CreatorMarketplaceResourceRecordSchema.safeParse(candidate.resource);
  if (
    !parsedResource.success
    || typeof candidate.id !== "string"
    || typeof candidate.resourceId !== "string"
    || typeof candidate.acquiredAt !== "string"
    || typeof candidate.archived !== "boolean"
  ) return null;
  return {
    id: candidate.id,
    resourceId: candidate.resourceId,
    acquiredAt: candidate.acquiredAt,
    archived: candidate.archived,
    resource: parsedResource.data,
  };
}

function getStoredLibraryItems(userId: string | null): AcquiredMarketItem[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.flatMap((value) => {
          const item = parseStoredItem(value);
          return item ? [item] : [];
        })
      : [];
  } catch {
    return [];
  }
}

function saveLibraryItems(userId: string, items: readonly AcquiredMarketItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(items));
  } catch {
    // The account operation already succeeded; a presentation-cache failure is non-fatal.
  }
  window.dispatchEvent(new CustomEvent(MARKET_LIBRARY_EVENT, {
    detail: { userId },
  }));
}

function collectReleaseIds(
  target: Set<string>,
  item: CreatorMarketplaceCloudLibraryItem,
): void {
  if (item.addedFrom.releaseId) target.add(item.addedFrom.releaseId);
  if (item.catalog.state === "available") target.add(item.catalog.head.id);
  if (item.confirmation.state === "confirmed" && item.confirmation.releaseId) {
    target.add(item.confirmation.releaseId);
  }
}

async function listAllLibraryItems(
  signal: AbortSignal,
): Promise<readonly CreatorMarketplaceCloudLibraryItem[]> {
  const items: CreatorMarketplaceCloudLibraryItem[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  while (!signal.aborted) {
    const page: CreatorMarketplaceCloudLibraryPage =
      await listCreatorMarketplaceCloudLibrary({
        view: "all",
        limit: 50,
        cursor,
      }, signal);
    items.push(...page.items);
    if (!page.hasMore) return items;
    const nextCursor = page.nextCursor;
    if (!nextCursor || seenCursors.has(nextCursor)) {
      throw new Error("The account library returned an incomplete pagination cursor.");
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  throw new DOMException("Library hydration was aborted", "AbortError");
}

/**
 * Compatibility hook for detail and sticky-market UI.
 *
 * Entitlement is always hydrated from the active account's cloud library. The local cache contains
 * only full records acquired in this browser so legacy card views can render them; it never creates
 * ownership, is scoped by account, and is ignored until the server hydration succeeds.
 */
export function useMarketLibrary() {
  const { data: session, ready, status } = useSession();
  const userId = ready && status === "authenticated"
    ? (session.user.id ?? null)
    : null;
  const userIdRef = useRef<string | null>(userId);
  const generationRef = useRef(0);
  const [items, setItems] = useState<AcquiredMarketItem[]>([]);
  const [releaseIds, setReleaseIds] = useState<ReadonlySet<string>>(() => new Set());
  const [serverItemCount, setServerItemCount] = useState(0);
  const [loading, setLoading] = useState(Boolean(userId));
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const hydrated = userId !== null && hydratedUserId === userId;

  useEffect(() => {
    userIdRef.current = userId;
    const generation = ++generationRef.current;
    let controller: AbortController | null = null;
    setItems(getStoredLibraryItems(userId));
    setReleaseIds(new Set());
    setServerItemCount(0);
    setHydratedUserId(null);
    setLoading(Boolean(userId));

    if (!userId) return;

    const hydrate = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setItems(getStoredLibraryItems(userId));
      setLoading(true);
      // An event only invalidates this account's cache; only the API can confirm ownership.
      void listAllLibraryItems(request.signal)
        .then((cloudItems) => {
          if (request.signal.aborted || generationRef.current !== generation) return;
          const nextReleaseIds = new Set<string>();
          for (const item of cloudItems) collectReleaseIds(nextReleaseIds, item);
          setReleaseIds(nextReleaseIds);
          setServerItemCount(cloudItems.length);
          setHydratedUserId(userId);
        })
        .catch(() => {
          if (request.signal.aborted || generationRef.current !== generation) return;
          setReleaseIds(new Set());
          setServerItemCount(0);
          setHydratedUserId(null);
        })
        .finally(() => {
          if (!request.signal.aborted && generationRef.current === generation) {
            setLoading(false);
          }
        });
    };

    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: unknown }>).detail;
      if (detail?.userId === userId) hydrate();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === cacheKey(userId)) hydrate();
    };
    window.addEventListener(MARKET_LIBRARY_EVENT, onUpdate);
    window.addEventListener("storage", onStorage);
    hydrate();
    return () => {
      controller?.abort();
      generationRef.current += 1;
      window.removeEventListener(MARKET_LIBRARY_EVENT, onUpdate);
      window.removeEventListener("storage", onStorage);
    };
  }, [userId]);

  const isAcquired = useCallback(
    (resourceId: string) => hydrated && releaseIds.has(resourceId),
    [hydrated, releaseIds],
  );

  const acquireResource = useCallback(
    async (record: CreatorMarketplaceResourceRecord): Promise<boolean> => {
      const activeUserId = userIdRef.current;
      const generation = generationRef.current;
      if (!activeUserId) return false;

      let receipt: CreatorMarketplaceAcquireReceipt;
      try {
        receipt = await acquireCreatorMarketplaceCloudLibraryRelease(record.id);
      } catch {
        return false;
      }
      if (
        userIdRef.current !== activeUserId
        || generationRef.current !== generation
      ) return false;

      setReleaseIds((current) => new Set([...current, record.id]));
      setHydratedUserId(activeUserId);
      setServerItemCount((current) => current + (receipt.changed ? 1 : 0));

      const current = getStoredLibraryItems(activeUserId);
      const existing = current.find((item) => item.resourceId === record.id);
      const next = existing
        ? current.map((item) => item.resourceId === record.id
            ? { ...item, id: receipt.libraryItemId, archived: false, resource: record }
            : item)
        : [{
            id: receipt.libraryItemId,
            resourceId: record.id,
            acquiredAt: receipt.updatedAt,
            archived: false,
            resource: record,
          }, ...current];
      saveLibraryItems(activeUserId, next);
      setItems(next);
      return true;
    },
    [],
  );

  const archiveItem = useCallback((id: string, archived: boolean) => {
    const activeUserId = userIdRef.current;
    if (!activeUserId) return;
    const current = getStoredLibraryItems(activeUserId);
    const target = current.find((item) => item.id === id || item.resourceId === id);
    if (!target) return;
    const next = current.map((item) =>
      item.id === target.id ? { ...item, archived } : item,
    );
    saveLibraryItems(activeUserId, next);
    setItems(next);
  }, []);

  const removeItem = useCallback((id: string) => {
    const activeUserId = userIdRef.current;
    if (!activeUserId) return;
    const current = getStoredLibraryItems(activeUserId);
    const next = current.filter((item) => item.id !== id && item.resourceId !== id);
    saveLibraryItems(activeUserId, next);
    setItems(next);
  }, []);

  const visibleItems = hydrated ? items : [];
  return {
    items: visibleItems,
    activeItems: visibleItems.filter((item) => !item.archived),
    archivedItems: visibleItems.filter((item) => item.archived),
    totalCount: hydrated ? serverItemCount : 0,
    loading,
    hydrated,
    isAcquired,
    acquireResource,
    archiveItem,
    removeItem,
  };
}
