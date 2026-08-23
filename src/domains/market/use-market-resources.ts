import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CreatorMarketplaceResourceLicense,
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceRecord,
} from "@/lib/creator-marketplace-resource-contract";

import { listCreatorMarketplaceResources } from "@/src/infrastructure/creator-marketplace-client";

export interface MarketResourceQuery {
  readonly search?: string;
  readonly kind?: CreatorMarketplaceResourceKind;
  readonly license?: CreatorMarketplaceResourceLicense;
  readonly tag?: string;
  readonly limit: number;
}

export interface MarketResourcesPage {
  readonly items: readonly CreatorMarketplaceResourceRecord[];
  /** 첫 페이지 로딩. 커서 "더 보기" 로딩은 loadingMore로 구분한다. */
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly error: string | null;
  readonly hasMore: boolean;
  readonly loadMore: () => void;
  readonly reload: () => void;
}

const MARKET_LIST_ERROR = "마켓 리소스를 불러오지 못했습니다.";

/**
 * creator-marketplace list API를 커서 페이지네이션과 함께 래핑한다.
 * query가 null이면 비활성화(요청 없음)하고, 바뀌면 상태를 초기화해 첫 페이지부터 다시 불러온다.
 */
export function useMarketResources(query: MarketResourceQuery | null): MarketResourcesPage {
  const [items, setItems] = useState<readonly CreatorMarketplaceResourceRecord[]>([]);
  const [loading, setLoading] = useState(Boolean(query));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const queryKey = query ? JSON.stringify(query) : null;

  useEffect(() => {
    if (!queryKey) {
      cursorRef.current = null;
      setItems([]);
      setLoading(false);
      setLoadingMore(false);
      setError(null);
      setHasMore(false);
      return;
    }
    const parsedQuery = JSON.parse(queryKey) as MarketResourceQuery;
    const controller = new AbortController();
    cursorRef.current = null;
    setItems([]);
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setHasMore(false);

    listCreatorMarketplaceResources(
      {
        limit: parsedQuery.limit,
        search: parsedQuery.search,
        kind: parsedQuery.kind,
        license: parsedQuery.license,
        tag: parsedQuery.tag,
      },
      controller.signal
    )
      .then((page) => {
        if (controller.signal.aborted) return;
        setItems(page.items);
        cursorRef.current = page.nextCursor;
        setHasMore(page.hasMore);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error && cause.message ? cause.message : MARKET_LIST_ERROR);
        setLoading(false);
      });

    return () => controller.abort();
  }, [queryKey, refreshToken]);

  const loadMore = useCallback(() => {
    if (!queryKey || loading || loadingMore || !cursorRef.current) return;
    const parsedQuery = JSON.parse(queryKey) as MarketResourceQuery;
    const cursor = cursorRef.current;
    setLoadingMore(true);
    listCreatorMarketplaceResources(
      {
        limit: parsedQuery.limit,
        search: parsedQuery.search,
        kind: parsedQuery.kind,
        license: parsedQuery.license,
        tag: parsedQuery.tag,
        cursor,
      }
    )
      .then((page) => {
        setItems((previous) => {
          const seen = new Set(previous.map((record) => record.id));
          return [...previous, ...page.items.filter((record) => !seen.has(record.id))];
        });
        cursorRef.current = page.nextCursor;
        setHasMore(page.hasMore);
        setLoadingMore(false);
      })
      .catch(() => {
        setLoadingMore(false);
        setError(MARKET_LIST_ERROR);
      });
  }, [loading, loadingMore, queryKey]);
  const reload = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  return { items, loading, loadingMore, error, hasMore, loadMore, reload };
}
