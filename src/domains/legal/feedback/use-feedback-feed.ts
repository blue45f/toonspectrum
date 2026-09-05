import { useCallback, useEffect, useRef, useState } from "react";

import type { FeedbackEntry, FeedbackKind, FeedbackPageResult, FeedbackProgress } from "@/packages/core/src/feedback";

import { api, getApiErrorMessage } from "@/src/infrastructure/api";

export interface FeedbackFilters { category: FeedbackKind | "all"; progress: FeedbackProgress | "all"; query: string; mine: boolean; tag: string }
function validatePage(page: FeedbackPageResult): void {
  if (!page || page.contractVersion !== 2 || !Array.isArray(page.items)
    || typeof page.hasMore !== "boolean"
    || (page.hasMore && (typeof page.nextCursor !== "string" || !page.nextCursor))) {
    throw new Error("제보 기능 업데이트가 아직 반영되지 않았어요. 목록을 새로고침해 주세요.");
  }
}
export function useFeedbackFeed(filters: FeedbackFilters, userId: string | null) {
  const { category, progress, query, mine, tag } = filters;
  const [items, setItems] = useState<FeedbackEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [tick, setTick] = useState(0);
  const generation = useRef(0);
  const moreRequest = useRef<AbortController | null>(null);
  const moreBusy = useRef(false);

  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    moreRequest.current?.abort();
    moreBusy.current = false;
    setLoadingMore(false);
    setLoading(true);
    setApiReady(false);
    setError("");
    setMoreError("");
    setCanManage(false);
    setCursor(null);
    api.get<FeedbackPageResult>("/feedback/posts", {
      params: { category, progress, q: query, mine: mine && !!userId, tag, limit: 20 },
      signal: controller.signal, timeout: 20_000, referrerPolicy: "no-referrer",
    }).then((page) => {
      if (controller.signal.aborted || current !== generation.current) return;
      validatePage(page);
      setApiReady(true);
      setItems(page.items);
      setCursor(page.hasMore ? page.nextCursor : null);
      setCanManage(page.canManage === true);
    }).catch(async (cause: unknown) => {
      const message = await getApiErrorMessage(cause, "제보 목록을 불러오지 못했어요.");
      if (!controller.signal.aborted && current === generation.current) { setItems([]); setApiReady(false); setError(message); }
    }).finally(() => { if (!controller.signal.aborted && current === generation.current) setLoading(false); });
    return () => { controller.abort(); moreRequest.current?.abort(); };
  }, [category, progress, query, mine, tag, userId, tick]);

  const loadMore = useCallback(async () => {
    if (!cursor || loading || moreBusy.current) return;
    moreBusy.current = true;
    const current = generation.current;
    const controller = new AbortController();
    moreRequest.current = controller;
    setLoadingMore(true);
    setMoreError("");
    try {
      const page = await api.get<FeedbackPageResult>("/feedback/posts", {
        params: { category, progress, q: query, mine: mine && !!userId, tag, cursor, limit: 20 },
        signal: controller.signal, timeout: 20_000, referrerPolicy: "no-referrer",
      });
      if (controller.signal.aborted || current !== generation.current) return;
      validatePage(page);
      if (page.hasMore && page.nextCursor === cursor) throw new Error("다음 페이지 정보가 변경되지 않았어요. 목록을 새로고침해 주세요.");
      setApiReady(true);
      setItems((previous) => [...new Map([...previous, ...page.items].map((item) => [item.id, item])).values()]);
      setCursor(page.hasMore ? page.nextCursor : null);
    } catch (cause) {
      const message = await getApiErrorMessage(cause, "다음 제보를 불러오지 못했어요.");
      if (!controller.signal.aborted && current === generation.current) { setApiReady(false); setMoreError(message); }
    } finally {
      if (current === generation.current && !controller.signal.aborted) { moreBusy.current = false; setLoadingMore(false); }
    }
  }, [cursor, loading, category, progress, query, mine, tag, userId]);
  const refresh = useCallback(() => setTick((value) => value + 1), []);
  const update = useCallback((id: string, patch: Partial<FeedbackEntry>) => setItems((previous) => previous.map((item) => item.id === id ? { ...item, ...patch } : item)), []);
  return { items, apiReady, canManage, loading, loadingMore, error, moreError, hasMore: cursor !== null, loadMore, refresh, update };
}
