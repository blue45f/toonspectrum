import { playSfx } from "@toonspectrum/core/fx";
import { Command } from "cmdk";
import { Search, TrendingUp, Library, BarChart3, Compass, CornerDownLeft, Sparkles, CalendarDays, Swords, Clock, Shuffle, Moon } from "lucide-react";
import { useEffect, useState } from "react";

import { MiniPoster } from "./rank-row";
import { RatingInline } from "./ui/stars";

import type { Title } from "@/lib/types";

import { statsAreEstimated } from "@/lib/estimate";
import { genreTextColor } from "@/lib/genre-color";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { TYPE_LABEL } from "@/lib/taxonomy";
import { useRouter } from "@/src/compat/navigation";
import { useDebouncedValue } from "@/src/hooks/use-debounced-value";
import { fetchSearchResponse, isSearchAbortError } from "@/src/infrastructure/search-client";



const QUICK = [
  { labelKey: "command.palette.quick.search", href: "/search", icon: Search, hintKey: "command.palette.quick.searchHint" },
  {
    labelKey: "command.palette.quick.ranking",
    href: "/ranking",
    icon: TrendingUp,
    hintKey: "command.palette.quick.rankingHint",
  },
  {
    labelKey: "command.palette.quick.recommend",
    href: "/recommend",
    icon: Sparkles,
    hintKey: "command.palette.quick.recommendHint",
  },
  {
    labelKey: "command.palette.quick.fortune",
    href: "/fortune",
    icon: Moon,
    hintKey: "command.palette.quick.fortuneHint",
  },
  { labelKey: "command.palette.quick.random", href: "/random", icon: Shuffle, hintKey: "command.palette.quick.randomHint" },
  {
    labelKey: "command.palette.quick.calendar",
    href: "/calendar",
    icon: CalendarDays,
    hintKey: "command.palette.quick.calendarHint",
  },
  {
    labelKey: "command.palette.quick.compare",
    href: "/compare",
    icon: Swords,
    hintKey: "command.palette.quick.compareHint",
  },
  {
    labelKey: "command.palette.quick.explore",
    href: "/explore",
    icon: Compass,
    hintKey: "command.palette.quick.exploreHint",
  },
  {
    labelKey: "command.palette.quick.insights",
    href: "/insights",
    icon: BarChart3,
    hintKey: "command.palette.quick.insightsHint",
  },
  {
    labelKey: "command.palette.quick.library",
    href: "/library",
    icon: Library,
    hintKey: "command.palette.quick.libraryHint",
  },
];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 140);
  const [results, setResults] = useState<Title[]>([]);
  const [recent, setRecent] = useState<Title[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const recentlyViewed = useApp((s) => s.recentlyViewed);
  const recentKey = recentlyViewed.slice(0, 5).join(",");
  const router = useRouter();
  const t = useT();
  const trimmedQ = q.trim();
  const debouncedTrimmedQ = debouncedQ.trim();
  const searchSettling = Boolean(trimmedQ) && trimmedQ !== debouncedTrimmedQ;
  const isSearching = Boolean(trimmedQ) && (searchSettling || searchLoading);

  useEffect(() => {
    if (open) {
      playSfx("open");
    } else {
      playSfx("close");
    }
    document.body.style.overflow = open ? "hidden" : "";
    // 닫힐 때 질의 초기화 (effect 동기 setState 회피 위해 다음 틱으로 지연)
    const id = open ? undefined : setTimeout(() => setQ(""), 0);
    return () => {
      document.body.style.overflow = "";
      if (id) clearTimeout(id);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !debouncedTrimmedQ) {
      setSearchLoading(false);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    setSearchLoading(true);
    fetchSearchResponse(`sort=relevance&q=${encodeURIComponent(debouncedTrimmedQ)}`, controller.signal)
      .then((data) => {
        if (alive) setResults(data.items.slice(0, 7));
      })
      .catch((error: unknown) => {
        if (isSearchAbortError(error)) return;
        if (alive) setResults([]);
      })
      .finally(() => {
        if (alive) setSearchLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [debouncedTrimmedQ, open]);

  // 팔레트가 열리고 질의가 없을 때만 최근 본 작품을 지연 로드(빈 상태 컨텍스트 제공).
  useEffect(() => {
    if (!open || trimmedQ || !recentKey) {
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
  }, [open, recentKey, trimmedQ]);

  const go = (href: string) => {
    playSfx("close");
    onOpenChange(false);
    router.push(href);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]">
      <button
        aria-label={t("common.close")}
        onClick={() => {
          playSfx("close");
          onOpenChange(false);
        }}
        className="absolute inset-0 bg-[oklch(0.12_0.012_70/0.72)] backdrop-blur-sm"
        style={{ animation: "fade-up 0.18s ease-out" }}
      />
      <Command
        shouldFilter={false}
        loop
        label={t("command.palette.label")}
        className="pf-popup-open relative w-full max-w-2xl overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-2xl shadow-[oklch(0.1_0.02_70/0.5)]"
        style={{ animation: "fade-up 0.22s var(--ease-out-expo)" }}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="text-fg-3" />
          <Command.Input
            value={q}
            onValueChange={(value) => {
              setQ(value);
              setResults([]);
              if (!value.trim()) setSearchLoading(false);
            }}
            placeholder={t("command.palette.placeholder")}
            className="h-14 flex-1 bg-transparent text-[0.95rem] text-fg outline-none placeholder:text-fg-3"
          />
          <kbd className="hidden rounded-md border border-line bg-card px-1.5 py-0.5 text-[0.65rem] text-fg-3 sm:block">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[52vh] overflow-y-auto overscroll-contain p-2">
          {trimmedQ && isSearching && (
            <div className="px-3 py-10 text-center text-sm text-fg-3" role="status" aria-live="polite">
              {t("common.loading.search")}
            </div>
          )}

          {trimmedQ && !isSearching && results.length === 0 && (
            <div className="px-3 py-10 text-center text-sm text-fg-3">
              <p>{t("common.notFoundWithQuery").replace("{query}", `'${q}'`)}</p>
              <button
                onClick={() => go(`/search?q=${encodeURIComponent(q)}`)}
                className="mt-2 text-accent hover:underline"
              >
                {t("common.openSearch")}
              </button>
            </div>
          )}

          {!trimmedQ && recent.length > 0 && (
            <Command.Group
              heading={t("command.palette.group.recent")}
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
                      <span style={{ color: genreTextColor(t.genres[0], 0.8) }}>{TYPE_LABEL[t.type]}</span>
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

          {!trimmedQ && (
            <Command.Group
              heading={t("command.palette.group.shortcuts")}
              className="px-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:text-fg-3"
            >
              {QUICK.map((item) => (
                <Command.Item
                  key={item.href}
                  value={item.labelKey}
                  onSelect={() => go(item.href)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm text-fg-2 transition-colors data-[selected=true]:bg-raised data-[selected=true]:text-fg"
                >
                  <item.icon size={16} className="text-fg-3" />
                  <span className="font-medium text-fg">{t(item.labelKey)}</span>
                  <span className="text-xs text-fg-3">{t(item.hintKey)}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {results.length > 0 && (
            <Command.Group
              heading={t("command.palette.group.results")}
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
                      <span style={{ color: genreTextColor(t.genres[0], 0.8) }}>
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
                {`'${q}'`} {t("common.openSearch")}
              </Command.Item>
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}
