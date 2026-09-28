import { useCallback, useEffect, useState } from "react";

import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";

import { findMergedMarketResourceById } from "../models/market-custom-registry";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

const WISHLIST_STORAGE_KEY = "toonspectrum:market:wishlist";
export const MARKET_WISHLIST_EVENT = "toonspectrum:market:wishlist-changed";

function storageFailureMessage(): string {
  return translateCurrentStaticSourceText("domains.market.wishlist", "ko", "찜 목록을 브라우저에 저장하지 못했어요. 저장 공간·사이트 권한을 확인한 뒤 다시 시도해 주세요.");
}

function getStoredWishlistIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WISHLIST_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.filter((id): id is string =>
          typeof id === "string" && id.trim().length > 0,
        ))];
      }
    }
  } catch {
    // quota
  }
  return [];
}

function saveWishlistIds(ids: string[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent(MARKET_WISHLIST_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function useMarketWishlist() {
  const [storageError, setStorageError] = useState<string | null>(null);
  const [wishlistIds, setWishlistIds] = useState<string[]>(getStoredWishlistIds);

  useEffect(() => {
    const onUpdate = () => {
      setWishlistIds(getStoredWishlistIds());
    };
    window.addEventListener(MARKET_WISHLIST_EVENT, onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener(MARKET_WISHLIST_EVENT, onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const isWishlisted = useCallback(
    (id: string) => wishlistIds.includes(id),
    [wishlistIds],
  );

  const toggleWishlist = useCallback((record: CreatorMarketplaceResourceRecord): boolean => {
    const current = getStoredWishlistIds();
    const exists = current.includes(record.id);
    let next: string[];
    if (exists) {
      next = current.filter((id) => id !== record.id);
    } else {
      next = [record.id, ...current];
    }
    if (!saveWishlistIds(next)) {
      setStorageError(storageFailureMessage());
      return exists;
    }
    setStorageError(null);
    setWishlistIds(next);
    return !exists;
  }, []);

  const removeFromWishlist = useCallback((id: string): void => {
    const next = getStoredWishlistIds().filter((candidate) => candidate !== id);
    if (!saveWishlistIds(next)) {
      setStorageError(storageFailureMessage());
      return;
    }
    setStorageError(null);
    setWishlistIds(next);
  }, []);

  const wishlistItems: CreatorMarketplaceResourceRecord[] = wishlistIds
    .map((id) => findMergedMarketResourceById(id))
    .filter((item): item is CreatorMarketplaceResourceRecord => item !== null);

  return {
    wishlistIds,
    wishlistItems,
    wishlistCount: wishlistIds.length,
    isWishlisted,
    toggleWishlist,
    removeFromWishlist,
    storageError,
  };
}
