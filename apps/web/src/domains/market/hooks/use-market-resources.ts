import { useCallback, useEffect, useRef, useState } from "react";

import {
  authoritativeMarketCacheKey,
} from "../models/market-authority";
import {
  readCachedMarketPage,
  writeCachedMarketPage,
} from "../models/market-resource-cache";
import { listCreatorMarketplaceResources } from "../remotes/market-resource-remote";

import type {
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceLicense,
  CreatorMarketplaceResourceRecord,
  CreatorMarketplaceResourceSort,
} from "@/shared/lib/creator-marketplace-resource-contract";

export interface MarketResourceQuery {
  readonly search?: string;
  readonly kind?: CreatorMarketplaceResourceKind;
  readonly license?: CreatorMarketplaceResourceLicense;
  readonly tag?: string;
  readonly publisher?: string;
  readonly sort: CreatorMarketplaceResourceSort;
  readonly limit: number;
}

export interface MarketResourcesPage {
  readonly items: readonly CreatorMarketplaceResourceRecord[];
  /** 첫 페이지 로딩. 커서 "더 보기" 로딩은 loadingMore로 구분한다. */
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly error: string | null;
  readonly loadMoreError: string | null;
  readonly hasMore: boolean;
  /** 네트워크 실패로 저장된 서버 목록을 보여주는 저하 상태. */
  readonly stale: boolean;
  readonly staleSavedAt: string | null;
  readonly loadMore: () => void;
  readonly reload: () => void;
}

const MARKET_RETRY_HINT = "공개 마켓을 불러올 수 없어요. 잠시 후 다시 시도해 주세요.";
const MARKET_LOAD_MORE_RETRY_HINT = "추가 리소스를 불러오지 못했어요.";

function remoteQuery(
  query: MarketResourceQuery,
  cursor?: string,
) {
  return {
    limit: query.limit,
    search: query.search,
    kind: query.kind,
    license: query.license,
    tag: query.tag,
    publisher: query.publisher,
    sort: query.sort,
    cursor,
  };
}

/**
 * Server catalog authority wrapper.
 *
 * Public results come only from the server or a cache written by a previous successful server
 * response. Local authoring drafts and bundled starter fixtures are intentionally excluded.
 */
export function useMarketResources(query: MarketResourceQuery | null): MarketResourcesPage {
  const [items, setItems] = useState<readonly CreatorMarketplaceResourceRecord[]>([]);
  const [loading, setLoading] = useState(Boolean(query));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [stale, setStale] = useState(false);
  const [staleSavedAt, setStaleSavedAt] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const activeQueryRef = useRef<string | null>(null);
  const requestGenerationRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const serializedQuery = query ? JSON.stringify(query) : null;
  const cacheKey = serializedQuery
    ? authoritativeMarketCacheKey(serializedQuery)
    : null;

  useEffect(() => {
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    activeQueryRef.current = serializedQuery;
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    loadingMoreRef.current = false;

    if (!serializedQuery || !cacheKey) {
      cursorRef.current = null;
      setItems([]);
      setLoading(false);
      setLoadingMore(false);
      setError(null);
      setLoadMoreError(null);
      setHasMore(false);
      setStale(false);
      setStaleSavedAt(null);
      return;
    }

    const parsedQuery = JSON.parse(serializedQuery) as MarketResourceQuery;
    const controller = new AbortController();
    cursorRef.current = null;
    setItems([]);
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setLoadMoreError(null);
    setHasMore(false);
    setStale(false);
    setStaleSavedAt(null);

    listCreatorMarketplaceResources(remoteQuery(parsedQuery), controller.signal)
      .then((page) => {
        if (controller.signal.aborted || requestGenerationRef.current !== generation) return;
        const nextCursor = page.hasMore ? page.nextCursor : null;
        const pageHasMore = nextCursor !== null;
        setItems(page.items);
        cursorRef.current = nextCursor;
        setHasMore(pageHasMore);
        setLoading(false);
        writeCachedMarketPage(cacheKey, {
          items: page.items,
          hasMore: pageHasMore,
          nextCursor,
        });
      })
      .catch(() => {
        if (controller.signal.aborted || requestGenerationRef.current !== generation) return;
        const cached = readCachedMarketPage(cacheKey);
        if (cached) {
          setItems(cached.items);
          // A cached first page must never be combined with a newly fetched tail.
          setHasMore(false);
          cursorRef.current = null;
          setStale(true);
          setStaleSavedAt(cached.savedAt);
          setLoading(false);
          return;
        }
        setError(MARKET_RETRY_HINT);
        setLoading(false);
      });

    return () => {
      controller.abort();
      loadMoreControllerRef.current?.abort();
      if (requestGenerationRef.current === generation) {
        requestGenerationRef.current += 1;
        activeQueryRef.current = null;
        loadMoreControllerRef.current = null;
        loadingMoreRef.current = false;
      }
    };
  }, [cacheKey, refreshToken, serializedQuery]);

  const loadMore = useCallback(() => {
    if (
      !serializedQuery
      || !cacheKey
      || activeQueryRef.current !== serializedQuery
      || loadingMoreRef.current
      || !cursorRef.current
    ) return;

    const parsedQuery = JSON.parse(serializedQuery) as MarketResourceQuery;
    const cursor = cursorRef.current;
    const generation = requestGenerationRef.current;
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);

    listCreatorMarketplaceResources(
      remoteQuery(parsedQuery, cursor),
      controller.signal,
    )
      .then((page) => {
        if (
          controller.signal.aborted
          || requestGenerationRef.current !== generation
          || activeQueryRef.current !== serializedQuery
        ) return;

        const nextCursor = page.hasMore ? page.nextCursor : null;
        const pageHasMore = nextCursor !== null;
        setItems((previous) => {
          if (
            requestGenerationRef.current !== generation
            || activeQueryRef.current !== serializedQuery
          ) return previous;
          const seen = new Set(previous.map((record) => record.id));
          const merged = [
            ...previous,
            ...page.items.filter((record) => !seen.has(record.id)),
          ];
          writeCachedMarketPage(cacheKey, {
            items: merged,
            hasMore: pageHasMore,
            nextCursor,
          });
          return merged;
        });
        cursorRef.current = nextCursor;
        setHasMore(pageHasMore);
      })
      .catch(() => {
        if (
          controller.signal.aborted
          || requestGenerationRef.current !== generation
          || activeQueryRef.current !== serializedQuery
        ) return;
        setLoadMoreError(MARKET_LOAD_MORE_RETRY_HINT);
      })
      .finally(() => {
        if (
          requestGenerationRef.current !== generation
          || activeQueryRef.current !== serializedQuery
          || loadMoreControllerRef.current !== controller
        ) return;
        loadMoreControllerRef.current = null;
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [cacheKey, serializedQuery]);

  const reload = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  return {
    items,
    loading,
    loadingMore,
    error,
    loadMoreError,
    hasMore,
    stale,
    staleSavedAt,
    loadMore,
    reload,
  };
}
