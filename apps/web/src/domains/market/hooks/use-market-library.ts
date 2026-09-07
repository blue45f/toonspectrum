import { useCallback, useEffect, useState } from "react";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { acquireCreatorMarketplaceCloudLibraryRelease } from "@/src/infrastructure/creator-marketplace-client";

export interface AcquiredMarketItem {
  id: string;
  resourceId: string;
  acquiredAt: string;
  archived: boolean;
  resource: CreatorMarketplaceResourceRecord;
}

/**
 * This browser cache is written only after the server confirms account acquisition. It is a
 * presentation cache for legacy detail/sticky components, never an entitlement authority.
 * The v2 namespace deliberately ignores records created by the previous fail-open implementation.
 */
export const MARKET_LIBRARY_STORAGE_KEY =
  "toonspectrum:market:confirmed-library-cache:v2";
export const MARKET_LIBRARY_EVENT = "toonspectrum:market:library-changed";

function getStoredLibraryItems(): AcquiredMarketItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MARKET_LIBRARY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AcquiredMarketItem[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // A corrupt or unavailable cache cannot create account entitlement.
  }
  return [];
}

function saveLibraryItems(items: AcquiredMarketItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MARKET_LIBRARY_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(MARKET_LIBRARY_EVENT));
  } catch {
    // Server acquisition has already succeeded; a presentation-cache failure is non-fatal.
  }
}

export function useMarketLibrary() {
  const [items, setItems] = useState<AcquiredMarketItem[]>(getStoredLibraryItems);

  useEffect(() => {
    const onUpdate = () => {
      setItems(getStoredLibraryItems());
    };
    window.addEventListener(MARKET_LIBRARY_EVENT, onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener(MARKET_LIBRARY_EVENT, onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const isAcquired = useCallback(
    (resourceId: string) => items.some((item) => item.resourceId === resourceId),
    [items],
  );

  const acquireResource = useCallback(
    async (record: CreatorMarketplaceResourceRecord): Promise<boolean> => {
      try {
        // The server validates authentication, current package head, moderation and publisher
        // state. Never write the local cache before this authoritative operation succeeds.
        await acquireCreatorMarketplaceCloudLibraryRelease(record.id);
      } catch {
        return false;
      }

      const current = getStoredLibraryItems();
      const existing = current.find((item) => item.resourceId === record.id);
      if (existing) {
        if (existing.archived) {
          const next = current.map((item) =>
            item.resourceId === record.id ? { ...item, archived: false } : item,
          );
          saveLibraryItems(next);
          setItems(next);
        }
        return true;
      }

      const newItem: AcquiredMarketItem = {
        id: `lib-cache-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        resourceId: record.id,
        acquiredAt: new Date().toISOString(),
        archived: false,
        resource: record,
      };
      const next = [newItem, ...current];
      saveLibraryItems(next);
      setItems(next);
      return true;
    },
    [],
  );

  const archiveItem = useCallback((id: string, archived: boolean) => {
    const current = getStoredLibraryItems();
    const target = current.find((item) => item.id === id || item.resourceId === id);
    if (!target) return;
    const next = current.map((item) =>
      item.id === target.id ? { ...item, archived } : item,
    );
    saveLibraryItems(next);
    setItems(next);
  }, []);

  const removeItem = useCallback((id: string) => {
    const current = getStoredLibraryItems();
    const filtered = current.filter((item) => item.id !== id && item.resourceId !== id);
    saveLibraryItems(filtered);
    setItems(filtered);
  }, []);

  return {
    items,
    activeItems: items.filter((item) => !item.archived),
    archivedItems: items.filter((item) => item.archived),
    totalCount: items.filter((item) => !item.archived).length,
    isAcquired,
    acquireResource,
    archiveItem,
    removeItem,
  };
}
