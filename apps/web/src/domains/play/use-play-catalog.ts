// 게임용 웹툰 목록 로더 — 정적 랭킹 스냅샷(/data/ranking/<축>-<타입>.json)을 가져와
// PlayTitle[] 로 정규화한다. 랭킹 파일은 큐레이션된 상위 ~200편이라 게임 소재로 충분하다.

import { useCallback, useEffect, useRef, useState } from "react";

import { normalizePlayTitle, type PlayTitle } from "./play-types";

export type PlayAxis = "popular" | "trending" | "rating" | "binge" | "rookie" | "favorites";
export type PlayType = "webtoon" | "webnovel" | "all";

interface PlayCatalogState {
  titles: PlayTitle[];
  loading: boolean;
  error: string | null;
  /** 캐시를 비우고 스냅샷을 다시 가져온다(에러 화면의 다시 시도용). */
  retry: () => void;
}

const cache = new Map<string, PlayTitle[]>();

/** 랭킹 스냅샷에서 게임 소재 웹툰을 로드(메모리 캐시). */
export function usePlayTitles(
  axis: PlayAxis = "popular",
  type: PlayType = "webtoon",
  limit = 120
): PlayCatalogState {
  const key = `${axis}-${type}`;
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<Omit<PlayCatalogState, "retry">>(() => {
    const cached = cache.get(key);
    return cached
      ? { titles: cached.slice(0, limit), loading: false, error: null }
      : { titles: [], loading: true, error: null };
  });
  const limitRef = useRef(limit);
  limitRef.current = limit;

  const retry = useCallback(() => {
    cache.delete(key);
    setNonce((n) => n + 1);
  }, [key]);

  useEffect(() => {
    const cached = cache.get(key);
    if (cached) {
      setData({ titles: cached.slice(0, limitRef.current), loading: false, error: null });
      return;
    }
    let active = true;
    setData({ titles: [], loading: true, error: null });
    fetch(`/data/ranking/${key}.json`, { cache: "default" })
      .then((r) => {
        if (!r.ok) throw new Error(`ranking ${r.status}`);
        return r.json();
      })
      .then((json: unknown) => {
        if (!active) return;
        const items = extractItems(json);
        const titles = items
          .map(normalizePlayTitle)
          .filter((t): t is PlayTitle => t !== null)
          // 청소년보호/법적 안전: 캐주얼 게임 풀에서 19+(성인) 작품 제외.
          .filter((t) => !/19|성인|adult/i.test(t.ageRating));
        cache.set(key, titles);
        setData({ titles: titles.slice(0, limitRef.current), loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (!active) return;
        setData({ titles: [], loading: false, error: e instanceof Error ? e.message : "load failed" });
      });
    return () => {
      active = false;
    };
  }, [key, nonce]);

  return { ...data, retry };
}

/** 랭킹 파일은 { items: [{ title: TitleCard, rank, ... }] } 형태 — title 객체를 꺼낸다. */
function extractItems(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  const obj = json as { items?: unknown[]; titles?: unknown[] };
  const arr = obj.items ?? obj.titles ?? [];
  return arr.map((it) => {
    if (it && typeof it === "object" && "title" in it && typeof (it as { title: unknown }).title === "object") {
      return (it as { title: unknown }).title;
    }
    return it;
  });
}
