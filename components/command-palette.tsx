"use client";

import { Command } from "cmdk";
import { Search, TrendingUp, Library, BarChart3, Compass, CornerDownLeft, Sparkles, CalendarDays, Swords, Clock, Shuffle } from "lucide-react";
import { useEffect, useState } from "react";

import { MiniPoster } from "./rank-row";
import { RatingInline } from "./ui/stars";

import type { Title } from "@/lib/types";

import { statsAreEstimated } from "@/lib/estimate";
import { genreColor } from "@/lib/genre-color";
import { useApp } from "@/lib/store";
import { TYPE_LABEL } from "@/lib/taxonomy";
import { useRouter } from "@/src/compat/navigation";





const QUICK = [
  { label: "통합 검색", href: "/search", icon: Search, hint: "작품·작가·태그" },
  { label: "통합 랭킹", href: "/ranking", icon: TrendingUp, hint: "6개 축 랭킹" },
  { label: "맞춤 추천", href: "/recommend", icon: Sparkles, hint: "취향 기반 추천" },
  { label: "랜덤 작품", href: "/random", icon: Shuffle, hint: "무작위로 한 편" },
  { label: "연재 캘린더", href: "/calendar", icon: CalendarDays, hint: "요일별 연재" },
  { label: "작품 비교", href: "/compare", icon: Swords, hint: "두 작품 맞대보기" },
  { label: "탐색 / 장르", href: "/explore", icon: Compass, hint: "스펙트럼 탐색" },
  { label: "트렌드 대시보드", href: "/insights", icon: BarChart3, hint: "데이터로 보는 시장" },
  { label: "내 서재", href: "/library", icon: Library, hint: "관심·평점·취향" },
];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Title[]>([]);
  const [recent, setRecent] = useState<Title[]>([]);
  const recentlyViewed = useApp((s) => s.recentlyViewed);
  const recentKey = recentlyViewed.slice(0, 5).join(",");
  const router = useRouter();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    // 닫힐 때 질의 초기화 (effect 동기 setState 회피 위해 다음 틱으로 지연)
    const id = open ? undefined : setTimeout(() => setQ(""), 0);
    return () => {
      document.body.style.overflow = "";
      if (id) clearTimeout(id);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !q.trim()) {
      return;
    }
    let alive = true;
    const controller = new AbortController();
    fetch(`/api/search?sort=relevance&q=${encodeURIComponent(q)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("search failed");
        return res.json() as Promise<{ items: Title[] }>;
      })
      .then((data) => {
        if (alive) setResults(data.items.slice(0, 7));
      })
      .catch(() => {
        if (alive) setResults([]);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [open, q]);

  // 팔레트가 열리고 질의가 없을 때만 최근 본 작품을 지연 로드(빈 상태 컨텍스트 제공).
  useEffect(() => {
    if (!open || !recentKey) {
      return;
    }
    let alive = true;
    const controller = new AbortController();
    fetch(`/api/titles?ids=${encodeURIComponent(recentKey)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data: { items?: Title[] }) => {
        if (!alive) return;
        const byId = new Map((data.items ?? []).map((t) => [t.id, t]));
        setRecent(
          recentKey
            .split(",")
            .map((id) => byId.get(id))
            .filter((t): t is Title => Boolean(t))
        );
      })
      .catch(() => {
        if (alive) setRecent([]);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [open, recentKey]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]">
      <button
        aria-label="닫기"
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-[oklch(0.12_0.012_70/0.72)] backdrop-blur-sm"
        style={{ animation: "fade-up 0.18s ease-out" }}
      />
      <Command
        shouldFilter={false}
        loop
        label="통합 검색"
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-2xl shadow-[oklch(0.1_0.02_70/0.5)]"
        style={{ animation: "fade-up 0.22s var(--ease-out-expo)" }}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="text-fg-3" />
          <Command.Input
            value={q}
            onValueChange={(value) => {
              setQ(value);
              if (!value.trim()) setResults([]);
            }}
            placeholder="작품, 작가, 태그를 검색하세요…"
            className="h-14 flex-1 bg-transparent text-[0.95rem] text-fg outline-none placeholder:text-fg-3"
          />
          <kbd className="hidden rounded-md border border-line bg-card px-1.5 py-0.5 text-[0.65rem] text-fg-3 sm:block">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[52vh] overflow-y-auto overscroll-contain p-2">
          {q.trim() && results.length === 0 && (
            <div className="px-3 py-10 text-center text-sm text-fg-3">
              <p>{`'${q}'`} 검색 결과가 없어요.</p>
              <button
                onClick={() => go(`/search?q=${encodeURIComponent(q)}`)}
                className="mt-2 text-accent hover:underline"
              >
                전체 검색에서 다시 찾기 →
              </button>
            </div>
          )}

          {!q.trim() && recent.length > 0 && (
            <Command.Group
              heading="최근 본 작품"
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:text-fg-3"
            >
              {recent.map((t) => (
                <Command.Item
                  key={t.id}
                  value={`recent-${t.id}`}
                  onSelect={() => go(`/title/${t.slug}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors data-[selected=true]:bg-raised"
                >
                  <MiniPoster title={t} className="w-9 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{t.title}</span>
                    <span className="flex items-center gap-1.5 text-xs text-fg-3">
                      <Clock size={11} className="text-fg-3" />
                      <span style={{ color: genreColor(t.genres[0], 0.8) }}>{TYPE_LABEL[t.type]}</span>
                      · {t.author}
                    </span>
                  </span>
                  <CornerDownLeft
                    size={13}
                    className="text-fg-3 opacity-0 data-[selected=true]:opacity-100"
                  />
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {!q.trim() && (
            <Command.Group
              heading="바로가기"
              className="px-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:text-fg-3"
            >
              {QUICK.map((item) => (
                <Command.Item
                  key={item.href}
                  value={item.label}
                  onSelect={() => go(item.href)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm text-fg-2 transition-colors data-[selected=true]:bg-raised data-[selected=true]:text-fg"
                >
                  <item.icon size={16} className="text-fg-3" />
                  <span className="font-medium text-fg">{item.label}</span>
                  <span className="text-xs text-fg-3">{item.hint}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {results.length > 0 && (
            <Command.Group
              heading="작품"
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:text-fg-3"
            >
              {results.map((t) => (
                <Command.Item
                  key={t.id}
                  value={t.id}
                  onSelect={() => go(`/title/${t.slug}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors data-[selected=true]:bg-raised"
                >
                  <MiniPoster title={t} className="w-9 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{t.title}</span>
                    <span className="flex items-center gap-1.5 text-xs text-fg-3">
                      <span style={{ color: genreColor(t.genres[0], 0.8) }}>
                        {TYPE_LABEL[t.type]}
                      </span>
                      · {t.author}
                    </span>
                  </span>
                  <RatingInline value={t.stats.ratingAvg} estimated={statsAreEstimated(t)} size="xs" />
                  <CornerDownLeft
                    size={13}
                    className="text-fg-3 opacity-0 data-[selected=true]:opacity-100"
                  />
                </Command.Item>
              ))}
              <Command.Item
                value="__all"
                onSelect={() => go(`/search?q=${encodeURIComponent(q)}`)}
                className="mt-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 py-2.5 text-sm font-medium text-accent transition-colors data-[selected=true]:bg-accent-soft"
              >
                {`'${q}'`} 전체 결과 보기 →
              </Command.Item>
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}
