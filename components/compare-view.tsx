"use client";

import { useEffect, useState } from "react";
import Link from "@/src/compat/router-link";
import type { Title } from "@/lib/types";
import { TitlePoster } from "./title-poster";
import { MiniPoster } from "./rank-row";
import { GenreSpectrum } from "./ui/spectrum-bar";
import { GenreChip } from "./ui/chip";
import { AvailabilityDots } from "./availability";
import { TYPE_LABEL, STATUS_LABEL } from "@/lib/taxonomy";
import { statsAreEstimated } from "@/lib/estimate";
import { cn, formatCount } from "@/lib/utils";
import { Search, X, Swords } from "lucide-react";

type Metric = {
  label: string;
  get: (t: Title) => number;
  fmt: (v: number) => string;
  better: "high" | "none";
};
const METRICS: Metric[] = [
  { label: "별점", get: (t) => t.stats.ratingAvg, fmt: (v) => v.toFixed(1), better: "high" },
  { label: "평가 수", get: (t) => t.stats.ratingCount, fmt: formatCount, better: "high" },
  { label: "누적 조회", get: (t) => t.stats.views, fmt: formatCount, better: "high" },
  { label: "관심", get: (t) => t.stats.bookmarks, fmt: formatCount, better: "high" },
  { label: "완독률", get: (t) => t.stats.completionRate, fmt: (v) => `${v}%`, better: "high" },
  { label: "정주행 몰입", get: (t) => t.stats.bingeIndex, fmt: (v) => String(v), better: "high" },
  { label: "연재 시작", get: (t) => t.releaseYear, fmt: (v) => String(v), better: "none" },
];

function Picker({
  value,
  onPick,
  onClear,
}: {
  value: Title | null;
  onPick: (t: Title) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Title[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (!query) return;

    const controller = new AbortController();
    fetch(`/api/titles?q=${encodeURIComponent(query)}&limit=6`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("search failed"))))
      .then((data: { items?: Title[] }) => setResults(data.items ?? []))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setResults([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [q]);

  if (value) {
    return (
      <div className="relative">
        <button
          onClick={onClear}
          className="absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-lg border border-[oklch(0.95_0.01_85/0.22)] bg-[oklch(0.16_0.01_70/0.58)] text-[oklch(0.95_0.01_85/0.82)] backdrop-blur-md transition-colors hover:text-fg"
          aria-label="교체"
        >
          <X size={14} />
        </button>
        <TitlePoster title={value} size="md" />
        <p className="mt-2 truncate text-center text-sm font-semibold">{value.title}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-card">
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Search size={15} className="text-fg-3" />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            const next = e.target.value;
            setQ(next);
            if (!next.trim()) {
              setResults([]);
              setLoading(false);
            } else {
              setLoading(true);
            }
          }}
          placeholder="작품 검색"
          aria-label="작품 검색"
          className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-3"
        />
      </div>
      <div className="max-h-72 overflow-y-auto p-1.5" aria-busy={loading}>
        {results.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-fg-3">
            {loading ? "검색 중" : q.trim() ? "결과 없음" : "비교할 작품을 검색하세요"}
          </p>
        ) : (
          results.map((t) => (
            <button
              key={t.id}
              onClick={() => onPick(t)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-raised"
            >
              <MiniPoster title={t} className="w-8 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{t.title}</span>
                <span className="text-xs text-fg-3">
                  {TYPE_LABEL[t.type]} · ★{statsAreEstimated(t) ? "≈" : ""}{t.stats.ratingAvg.toFixed(1)}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function CompareView({ initialA, initialB }: { initialA?: string; initialB?: string }) {
  const [loading, setLoading] = useState(true);
  const [a, setA] = useState<Title | null>(null);
  const [b, setB] = useState<Title | null>(null);
  // 비교 두 작품 중 하나라도 합성 지표(카카오웹툰·웹소설)면 우열 강조를 끈다(추정값으로 우열 판정 방지)
  const eitherEstimated = !!a && !!b && (statsAreEstimated(a) || statsAreEstimated(b));

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitial() {
      const ids = [initialA, initialB].filter(Boolean).join(",");
      const [exact, popular] = await Promise.all([
        ids
          ? fetch(`/api/titles?ids=${encodeURIComponent(ids)}`, {
              cache: "no-store",
              signal: controller.signal,
            }).then((res) => (res.ok ? res.json() : { items: [] }))
          : Promise.resolve({ items: [] }),
        fetch("/api/titles?sort=popular&limit=8", {
          cache: "no-store",
          signal: controller.signal,
        }).then((res) => (res.ok ? res.json() : { items: [] })),
      ]);

      const exactItems = (exact.items ?? []) as Title[];
      const popularItems = (popular.items ?? []) as Title[];
      const pickExact = (value?: string) =>
        value ? exactItems.find((t) => t.id === value || t.slug === value) ?? null : null;
      const first = pickExact(initialA) ?? popularItems[0] ?? null;
      const second =
        pickExact(initialB) ??
        popularItems.find((t) => t.id !== first?.id) ??
        exactItems.find((t) => t.id !== first?.id) ??
        null;

      setA(first);
      setB(second);
      setLoading(false);
    }

    loadInitial().catch((error) => {
      if ((error as Error).name !== "AbortError") {
        setA(null);
        setB(null);
        setLoading(false);
      }
    });

    return () => {
      controller.abort();
    };
  }, [initialA, initialB]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <div className="skeleton aspect-[3/4]" />
        <div className="skeleton aspect-[3/4]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 sm:gap-6">
        <Picker value={a} onPick={setA} onClear={() => setA(null)} />
        <div className="mt-16 grid size-11 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent-soft text-accent">
          <Swords size={18} />
        </div>
        <Picker value={b} onPick={setB} onClear={() => setB(null)} />
      </div>

      {a && b && (
        <>
          <div className="overflow-hidden rounded-2xl border border-line bg-panel/40">
            {METRICS.map((m, i) => {
              const va = m.get(a);
              const vb = m.get(b);
              const aWin = m.better === "high" && va > vb && !eitherEstimated;
              const bWin = m.better === "high" && vb > va && !eitherEstimated;
              return (
                <div
                  key={m.label}
                  className={cn(
                    "grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3",
                    i % 2 === 1 && "bg-card/40"
                  )}
                >
                  <div className={cn("text-right numeral text-lg", aWin ? "text-accent" : "text-fg-2")}>
                    {m.fmt(va)}
                  </div>
                  <div className="w-24 text-center text-xs font-medium text-fg-3">{m.label}</div>
                  <div className={cn("text-left numeral text-lg", bWin ? "text-accent" : "text-fg-2")}>
                    {m.fmt(vb)}
                  </div>
                </div>
              );
            })}
          </div>

          {eitherEstimated && (
            <p className="-mt-4 text-center text-xs text-fg-3">
              ≈ 비교 작품 중 카카오웹툰·웹소설은 별점·조회 등이 추정값이라 우열 표시를 생략했어요.
            </p>
          )}

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
            {[a, b].flatMap((t, idx) =>
              idx === 0
                ? [
                    <CompareExtra key="a" t={a} align="right" />,
                    <div key="mid" className="w-11" />,
                  ]
                : [<CompareExtra key="b" t={b} align="left" />]
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CompareExtra({ t, align }: { t: Title; align: "left" | "right" }) {
  return (
    <div className={cn("flex flex-col gap-3", align === "right" ? "items-end" : "items-start")}>
      <GenreSpectrum genres={t.genres} height={5} />
      <div className={cn("flex flex-wrap gap-1.5", align === "right" && "justify-end")}>
        {t.genres.map((g) => (
          <GenreChip key={g} genre={g} size="sm" />
        ))}
      </div>
      <div className={cn("flex items-center gap-2", align === "right" && "flex-row-reverse")}>
        <span className="text-xs text-fg-3">{STATUS_LABEL[t.status]}</span>
        <AvailabilityDots availability={t.availability} max={4} />
      </div>
      <Link href={`/title/${t.slug}`} className="text-xs font-medium text-accent hover:underline">
        작품 상세 →
      </Link>
    </div>
  );
}
