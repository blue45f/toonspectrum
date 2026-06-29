import {
  PlayCircle,
  BookOpen,
  Newspaper,
  FileText,
  Mic,
  LayoutGrid,
  ArrowUpRight,
  Play,
} from "lucide-react";
import { useState, useMemo } from "react";

import { Section } from "./section";

import type { Title } from "@/lib/types";

import {
  getRelatedInfoForTitle,
  CATEGORY_LABELS,
  type RelatedCategory,
  type RelatedInfoItem,
} from "@/lib/title-related-info";
import { cn } from "@/lib/utils";

function getCategoryIcon(cat: RelatedCategory) {
  switch (cat) {
    case "youtube":
      return PlayCircle;
    case "blog":
      return BookOpen;
    case "news":
      return Newspaper;
    case "wiki":
      return FileText;
    case "interview":
      return Mic;
    default:
      return LayoutGrid;
  }
}

function getPlatformBadgeStyle(cat: RelatedInfoItem["category"]) {
  switch (cat) {
    case "youtube":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    case "blog":
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "news":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "wiki":
      return "bg-green-600/10 text-green-600 border-green-600/20";
    case "interview":
      return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    default:
      return "bg-accent-soft text-accent border-accent/20";
  }
}

export function TitleExternal({ title }: { title: Title }) {
  const [activeCategory, setActiveCategory] = useState<RelatedCategory>("all");

  // 작품별 항목화된 크롤·큐레이션 데이터 로드
  const items = useMemo(() => getRelatedInfoForTitle(title), [title]);

  // 카테고리별 개수 계산
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const item of items) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, [items]);

  // 활성 탭 필터링
  const filteredItems = useMemo(() => {
    if (activeCategory === "all") return items;
    return items.filter((it) => it.category === activeCategory);
  }, [items, activeCategory]);

  const categories: RelatedCategory[] = ["all", "youtube", "blog", "news", "wiki", "interview"];

  return (
    <Section
      className="mt-14"
      eyebrow="RELATED MEDIA & LINKS"
      title="관련 정보 더 보기"
      desc="크롤링 및 큐레이션된 데이터를 바탕으로 개별 유튜브 리뷰 영상, 블로그 후기, 뉴스 기사, 나무위키 문서로 직접 연결합니다."
    >
      {/* 항목별 필터 탭 바 */}
      <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-line pb-3">
        {categories.map((cat) => {
          const count = categoryCounts[cat] || 0;
          if (cat !== "all" && count === 0) return null; // 데이터 없는 탭은 숨김

          const meta = CATEGORY_LABELS[cat];
          const Icon = getCategoryIcon(cat);
          const isActive = activeCategory === cat;

          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all duration-150",
                isActive
                  ? "bg-accent text-white shadow-sm shadow-accent/20 font-semibold"
                  : "bg-card/50 text-fg-2 hover:bg-card hover:text-fg border border-line/60"
              )}
            >
              <Icon size={14} className={isActive ? "text-white" : "text-fg-3"} />
              <span>{meta.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[0.68rem]",
                  isActive ? "bg-white/20 text-white" : "bg-bg text-fg-3"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 항목별 목록 리스트 카드 */}
      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card/30 p-8 text-center text-sm text-fg-3">
          선택한 카테고리의 관련 정보가 아직 집계되지 않았습니다.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => {
            const CatIcon = getCategoryIcon(item.category);
            const badgeStyle = getPlatformBadgeStyle(item.category);

            return (
              <li key={item.id} className="h-full">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-line bg-card/40 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:bg-card hover:shadow-lg hover:shadow-black/5"
                >
                  <div>
                    {/* 썸네일 (유튜브 등 이미지가 있을 경우) */}
                    {item.thumbnail ? (
                      <div className="relative mb-3.5 aspect-video w-full overflow-hidden rounded-xl bg-bg">
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-80 transition-opacity group-hover:opacity-100">
                          <span className="flex size-10 items-center justify-center rounded-full bg-red-600 text-white shadow-md transition-transform group-hover:scale-110">
                            <Play size={18} className="ml-0.5 fill-current" />
                          </span>
                        </div>
                        {item.badge && (
                          <span className="absolute left-2 top-2 rounded-md bg-black/75 px-2 py-0.5 text-[0.68rem] font-medium text-white backdrop-blur-sm">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    ) : (
                      /* 썸네일 없는 텍스트 카드 헤더 */
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[0.7rem] font-semibold",
                            badgeStyle
                          )}
                        >
                          <CatIcon size={12} />
                          {item.sourceName}
                        </span>
                        {item.badge && (
                          <span className="text-[0.68rem] font-medium text-fg-3">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}

                    {/* 제목 및 출처 */}
                    <h3 className="line-clamp-2 text-sm font-bold text-fg transition-colors group-hover:text-accent">
                      {item.title}
                    </h3>

                    {/* 요약 / 설명 */}
                    {item.snippet && (
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-fg-2">
                        {item.snippet}
                      </p>
                    )}
                  </div>

                  {/* 카드 하단 메타 데이터 & 클릭 연결 표시 */}
                  <div className="mt-4 flex items-center justify-between border-t border-line/40 pt-3 text-[0.72rem] text-fg-3">
                    <span className="truncate">
                      {item.thumbnail ? item.sourceName : item.dateOrViews || "상세 페이지"}
                    </span>
                    <span className="flex items-center gap-1 font-medium text-accent opacity-80 group-hover:opacity-100">
                      이동하기
                      <ArrowUpRight size={14} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </span>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
