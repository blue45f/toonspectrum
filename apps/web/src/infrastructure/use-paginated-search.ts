import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSearchResponse, isSearchAbortError } from "./search-client";

import type { SearchResponse } from "./search-client";
import type { Title } from "@/shared/lib/types";

const PAGE_SIZE = 24;
type State = {
  key: string;
  data: SearchResponse | null;
  items: Title[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  failed: boolean;
  moreFailed: boolean;
};
type Session = {
  key: string;
  busy: boolean;
  nextPage: number | null;
  controller: AbortController;
  load: (page: number) => Promise<void>;
};

/** Query-scoped pagination. Late responses never append into a different search. */
export function usePaginatedSearch(query: string, enabled: boolean, retryKey: number) {
  const key = `${retryKey}:${query}`;
  const active = useRef<Session | null>(null);
  const [state, setState] = useState<State>({
    key: "", data: null, items: [], total: 0, hasMore: false,
    loading: true, loadingMore: false, failed: false, moreFailed: false,
  });

  useEffect(() => {
    if (!enabled) return;
    const session: Session = {
      key, busy: false, nextPage: 1, controller: new AbortController(), load: async () => undefined,
    };
    active.current = session;
    setState({ key, data: null, items: [], total: 0, hasMore: false,
      loading: true, loadingMore: false, failed: false, moreFailed: false });
    session.load = async (page: number) => {
      if (session.busy || session.controller.signal.aborted || active.current !== session) return;
      session.busy = true;
      setState((previous) => previous.key === key ? {
        ...previous, loading: page === 1, loadingMore: page !== 1, failed: false, moreFailed: false,
      } : previous);
      const params = new URLSearchParams(query);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      try {
        const data = await fetchSearchResponse(params, session.controller.signal);
        if (active.current !== session || session.controller.signal.aborted) return;
        const paged = data.pagination;
        if (paged && (
          paged.page !== page || paged.pageSize !== PAGE_SIZE || data.items.length > PAGE_SIZE
          || !Number.isSafeInteger(paged.total) || paged.total < 0
          || (paged.nextPage !== null && paged.nextPage !== page + 1)
          || paged.hasMore !== (paged.nextPage !== null)
        )) throw new Error("Invalid search pagination response");
        // During a rolling deployment an old server may still return the full array.
        // Keep that path usable without rendering an unbounded number of cards.
        const saved = params.has("ids") ? new Set((params.get("ids") ?? "").split(",").filter(Boolean)) : null;
        const legacyItems = !paged && saved ? data.items.filter((item) => saved.has(item.id)) : data.items;
        const items = paged ? data.items : legacyItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        const total = paged?.total ?? legacyItems.length;
        session.nextPage = paged ? paged.nextPage : page * PAGE_SIZE < total ? page + 1 : null;
        setState((previous) => {
          if (previous.key !== key) return previous;
          const merged = page === 1 ? [] : [...previous.items];
          const seen = new Set(merged.map((item) => item.id));
          for (const item of items) {
            if (!seen.has(item.id)) { merged.push(item); seen.add(item.id); }
          }
          return { key, data, items: merged, total, hasMore: session.nextPage !== null,
            loading: false, loadingMore: false, failed: false, moreFailed: false };
        });
      } catch (error) {
        if (active.current !== session || session.controller.signal.aborted || isSearchAbortError(error)) return;
        setState((previous) => previous.key === key ? {
          ...previous, loading: false, loadingMore: false, failed: page === 1, moreFailed: page !== 1,
        } : previous);
      } finally {
        session.busy = false;
      }
    };
    void session.load(1);
    return () => {
      session.controller.abort();
      if (active.current === session) active.current = null;
    };
  }, [key, query, enabled]);

  const loadMore = useCallback(() => {
    const session = active.current;
    if (session?.key === key && session.nextPage !== null) void session.load(session.nextPage);
  }, [key]);
  const current = enabled && state.key === key;
  return {
    items: current ? state.items : [],
    total: current ? state.total : 0,
    data: current ? state.data : null,
    loading: !current || state.loading,
    loadingMore: current && state.loadingMore,
    failed: current && state.failed,
    moreFailed: current && state.moreFailed,
    hasMore: current && state.hasMore,
    loadMore,
  };
}
