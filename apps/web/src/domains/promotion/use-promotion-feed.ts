import { useCallback, useEffect, useRef, useState } from "react";

import type { PromotionPage } from "../../../../../packages/core/src/promotion";

import { promotionClient } from "@/platform/promotion-client";
import { getApiErrorMessage } from "@/platform/api";

export function usePromotionFeed(query: string, userId: string | null) {
  const key = JSON.stringify([query, userId]);
  const [snapshot, setSnapshot] = useState<{ key: string; page: PromotionPage } | null>(null);
  const [loading, setLoading] = useState(true), [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState(""), [revision, setRevision] = useState(0);
  const generation = useRef(0), busy = useRef(false), moreController = useRef<AbortController | null>(null);
  const used = useRef(new Set<string>());
  const active = snapshot?.key === key;
  useEffect(() => {
    const current = ++generation.current, controller = new AbortController();
    moreController.current?.abort(); busy.current = false; used.current.clear(); setMoreLoading(false); setLoading(true); setError("");
    promotionClient.list(Object.fromEntries(new URLSearchParams(query)), controller.signal).then((page) => {
      if (!controller.signal.aborted && current === generation.current) setSnapshot({ key, page });
    }).catch(async (cause: unknown) => {
      const message = await getApiErrorMessage(cause, "홍보 목록을 불러오지 못했어요.");
      if (!controller.signal.aborted && current === generation.current) setError(message);
    }).finally(() => { if (!controller.signal.aborted && current === generation.current) setLoading(false); });
    return () => { controller.abort(); moreController.current?.abort(); };
  }, [query, userId, key, revision]);
  const loadMore = async () => {
    const cursor = active ? snapshot.page.nextCursor : null;
    if (!cursor || busy.current || loading) return;
    busy.current = true; setMoreLoading(true); setError("");
    const current = generation.current, controller = new AbortController(); moreController.current = controller;
    try {
      const page = await promotionClient.list({ ...Object.fromEntries(new URLSearchParams(query)), cursor }, controller.signal);
      if (controller.signal.aborted || current !== generation.current) return;
      if (page.hasMore && page.nextCursor && (page.nextCursor === cursor || used.current.has(page.nextCursor))) throw new Error("목록이 변경됐어요. 새로고침 후 다시 확인해 주세요.");
      used.current.add(cursor);
      setSnapshot((previous) => previous?.key === key ? { key, page: { ...page, items: [...new Map([...previous.page.items, ...page.items].map((item) => [item.id, item])).values()] } } : previous);
    } catch (cause) {
      const message = await getApiErrorMessage(cause, "다음 게시물을 불러오지 못했어요.");
      if (!controller.signal.aborted && current === generation.current) setError(message);
    } finally { if (current === generation.current && !controller.signal.aborted) { busy.current = false; setMoreLoading(false); } }
  };
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return { page: active ? snapshot.page : null, loading, moreLoading, error, loadMore, refresh };
}
