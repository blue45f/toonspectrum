// 놀이터(아케이드) 공용 타입 — 토스앱 Title을 게임 친화 GameTitle로 정규화한다.
// 저작권: 게임은 플랫폼 표지 원본을 쓰지 않고 추상 그라디언트 + 제목/작가(사실정보)만 사용.

import { useEffect, useState } from 'react';

import { fetchTitles, type Title } from '../lib/api';

export interface GameTitle {
  id: string;
  title: string;
  author: string;
  genres: string[];
  /** OKLCH 그라디언트 2색 — 자체 타이포그래픽 커버 배경(플랫폼 표지 미사용, 저작권 안전). */
  cover: [string, string];
  views: number;
  likes: number;
  bookmarks: number;
}

function hashHue(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 360;
}

function gradientOf(t: Title): [string, string] {
  if (Array.isArray(t.cover) && t.cover.length >= 2) return [String(t.cover[0]), String(t.cover[1])];
  const h = hashHue(t.id);
  return [`oklch(0.52 0.14 ${h})`, `oklch(0.32 0.1 ${(h + 38) % 360})`];
}

export function toGameTitles(titles: Title[]): GameTitle[] {
  return titles.map((t) => ({
    id: t.id,
    title: t.title,
    author: t.author ?? '작자미상',
    genres: Array.isArray(t.genres) ? t.genres.slice(0, 4) : [],
    cover: gradientOf(t),
    views: t.stats?.views ?? 0,
    likes: t.stats?.likes ?? 0,
    bookmarks: t.stats?.bookmarks ?? 0,
  }));
}

/** 게임 소재 웹툰 로드(fetchTitles는 성인물 필터 포함). */
export function useGameTitles(): { titles: GameTitle[]; loading: boolean } {
  const [titles, setTitles] = useState<GameTitle[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetchTitles().then((ts) => {
      if (!active) return;
      setTitles(toGameTitles(ts));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
  return { titles, loading };
}

/** 게임용 rng — 라이브 플레이는 Math.random. (엔진은 순수, rng 주입식.) */
export const liveRng = (): number => Math.random();

export function formatCount(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}천`;
  return String(n);
}
