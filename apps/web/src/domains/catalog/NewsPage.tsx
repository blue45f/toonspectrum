import { BookOpen, CalendarClock, Compass, ExternalLink, MessagesSquare, Newspaper, Search } from "lucide-react";
import { useState } from "react";

import { SiteFilterChips, type SiteFilterChip } from "@/domains/legal/public/site-filter-chips";
import { SiteLinkCard } from "@/domains/legal/public/site-link-card";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { sitePageHeaderArtFor } from "@/domains/legal/public/site-page-header-art";
import { SiteShowMoreButton } from "@/domains/legal/public/site-rail";
import { useShowMore } from "@/domains/legal/public/site-show-more";
import { useApiResource } from "@/platform/use-api-resource";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { Container } from "@/shared/components/section";
import { formatI18nTemplate, getCurrentUiLocale, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { relativeDate } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

// 카테고리는 scripts/news-gen.ts 의 NewsCategory 와 동일 키 — 정적 JSON 경계라 타입만 복제.
type NewsCategory = "industry" | "adaptation" | "event" | "novel" | "title";
type CategoryFilter = NewsCategory | "all";

interface NewsRelatedTitle {
  slug: string;
  title: string;
}
interface NewsItem {
  title: string;
  source: string;
  url: string;
  date: string;
  category?: NewsCategory; // 구버전 news.json 호환(없을 수 있음)
  related?: NewsRelatedTitle[]; // 카탈로그 작품 매칭(최대 2)
}
interface NewsResponse {
  items: NewsItem[];
  generatedAt: string;
}

/** 처음 보여 주는 소식 수 — 80건을 한 번에 펼치면 모바일에서 13화면이 넘는다. */
const NEWS_PAGE_SIZE = 8;

const CATEGORY_LABEL: Readonly<Record<NewsCategory, readonly [ko: string, en: string]>> = {
  industry: ["산업", "Industry"],
  adaptation: ["영상화", "Adaptations"],
  event: ["공모전·행사", "Contests & events"],
  novel: ["웹소설", "Web novels"],
  title: ["신작", "New releases"],
};
const CATEGORY_ORDER: readonly NewsCategory[] = ["industry", "adaptation", "event", "novel", "title"];

// RSS pubDate(RFC822)·ISO 모두 받아 "오늘/어제/n일 전" 상대시간으로. 파싱 불가면 숨김.
function newsDateLabel(raw: string, locale: string): string {
  const time = new Date(raw).getTime();
  if (Number.isNaN(time)) return "";
  return relativeDate(new Date(time).toISOString(), new Date(), locale);
}

function fmtGeneratedAt(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 매체 이름의 첫 글자 — 외부 파비콘을 불러오지 않고(방문 추적 없이) 매체를 한눈에 구분하는 표지. */
function sourceInitial(source: string): string {
  const match = /[\p{L}\p{N}]/u.exec(source);
  return match ? match[0].toUpperCase() : "N";
}

function NewsRow({ item, categoryLabel, dateLabel, openLabel }: {
  readonly item: NewsItem;
  readonly categoryLabel: string | null;
  readonly dateLabel: string;
  readonly openLabel: string;
}) {
  const related = item.related ?? [];
  return (
    <li className="rounded-2xl border border-line bg-card/40 transition-colors hover:border-line-strong hover:bg-card/70">
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="group flex min-h-11 items-start gap-3 rounded-2xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent-soft text-base font-bold text-accent">
          {sourceInitial(item.source)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-3 block text-pretty break-keep text-base font-semibold leading-snug text-fg group-hover:text-accent">
            {item.title}
            <span className="sr-only"> ({openLabel})</span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-2">
            {categoryLabel ? <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-fg-2">{categoryLabel}</span> : null}
            {item.source ? <span className="font-medium">{item.source}</span> : null}
            {dateLabel ? <span className="tnum">{dateLabel}</span> : null}
          </span>
        </span>
        <ExternalLink size={15} className="mt-1 shrink-0 text-fg-3 transition-colors group-hover:text-accent" aria-hidden="true" />
      </a>
      {related.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3.5 sm:pl-[4.5rem]">
          {related.map((entry) => (
            <Link
              key={entry.slug}
              href={`/title/${encodeURIComponent(entry.slug)}`}
              className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border border-accent/25 bg-accent-soft/40 px-3 text-sm font-medium text-accent transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <BookOpen size={13} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{entry.title}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </li>
  );
}

// 웹툰·웹소설 뉴스 — 공개 뉴스 피드(Google News)에서 받은 헤드라인을 발행처로 링크아웃.
// 저작권 안전: 헤드라인·출처·날짜만 표기하고 본문은 담지 않으며, 클릭 시 원 발행처로 이동.
// 카테고리 칩·키워드 검색은 클라이언트에서, 관련 작품 칩은 카탈로그 매칭(빌드 시) 결과.
// 처음 8건만 보여 주고 "더 보기"로 늘려 모바일 길이를 줄인다. 끝에는 소식에서 이어지는 다음 행동을 둔다.
export function NewsPage() {
  const bt = useBilingual("NewsPage");
  const { data, loading, error, reload } = useApiResource<NewsResponse>(
    "/data/news.json",
    bt("뉴스를 불러오지 못했습니다.", "Couldn't load the news."),
  );
  const [tab, setTab] = useState<CategoryFilter>("all");
  const [q, setQ] = useState("");

  const items = data?.items ?? [];
  const query = q.trim().toLowerCase();

  const countByCategory: Partial<Record<NewsCategory, number>> = {};
  for (const item of items) {
    if (item.category) countByCategory[item.category] = (countByCategory[item.category] ?? 0) + 1;
  }

  const filtered = items.filter((item) => {
    if (tab !== "all" && item.category !== tab) return false;
    if (!query) return true;
    const haystack = `${item.title} ${item.source} ${(item.related ?? []).map((entry) => entry.title).join(" ")}`.toLowerCase();
    return haystack.includes(query);
  });
  const feed = useShowMore(filtered.length, NEWS_PAGE_SIZE, `${tab}|${query}`);

  const filterActive = tab !== "all" || query.length > 0;
  const generatedAtLabel = data?.generatedAt ? fmtGeneratedAt(data.generatedAt) : "";
  const chips: readonly SiteFilterChip<CategoryFilter>[] = [
    { id: "all", label: bt("전체", "All"), count: items.length },
    ...CATEGORY_ORDER.map((id) => ({ id, label: bt(...CATEGORY_LABEL[id]), count: countByCategory[id] ?? 0 })),
  ];
  const resetFilters = () => {
    setTab("all");
    setQ("");
  };
  // 소식에서 이어지는 행동 — 공모전 소식은 작가 기회센터, 작품 소식은 탐색·커뮤니티로 잇는다.
  const discoverStep = { href: "/discover", icon: Compass, title: bt("작품 탐색", "Discover stories"), body: bt("소식에 나온 작품을 검색하고 비슷한 작품을 찾아요.", "Search the stories in the news and find similar ones.") };
  const opportunityStep = { href: "/opportunities", icon: CalendarClock, title: bt("작가 기회센터", "Creator opportunities"), body: bt("공모전·지원사업을 저장하고 접수를 준비해요.", "Save contests and grants and prepare your entry.") };
  const communityStep = { href: "/community", icon: MessagesSquare, title: bt("커뮤니티", "Community"), body: bt("읽은 소식과 작품 이야기를 함께 나눠요.", "Talk about what you read with other fans and creators.") };
  const nextSteps = tab === "event" ? [opportunityStep, discoverStep, communityStep] : [discoverStep, opportunityStep, communityStep];
  const locale = getCurrentUiLocale();

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <SitePageHeader
        surface="plain"
        icon={Newspaper}
        eyebrow="NEWS"
        title={bt("웹툰·웹소설 소식", "Webtoon & web novel news")}
        description={bt(
          "산업·영상화·공모전·신작 소식을 한곳에. 제목을 누르면 원 기사로, 작품 칩을 누르면 작품 상세로 이동해요.",
          "Industry, adaptation, contest and release news in one place. Titles open the original article; story chips open the story page.",
        )}
        art={sitePageHeaderArtFor("/news")}
      />

      {!loading && !error && items.length > 0 ? (
        <div className="mt-5 flex flex-col gap-3" data-news-filters="">
          <SiteFilterChips chips={chips} value={tab} onChange={setTab} label={bt("소식 카테고리", "News categories")} />
          <label className="flex min-h-12 max-w-md items-center gap-2.5 rounded-2xl border border-line bg-canvas px-4 transition-colors focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/25">
            <Search size={16} className="shrink-0 text-fg-3" aria-hidden="true" />
            <span className="sr-only">{bt("뉴스 키워드 검색", "Search the news")}</span>
            <input
              type="search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={bt("헤드라인·매체·작품 검색", "Search headlines, outlets or stories")}
              autoComplete="off"
              enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-3"
            />
          </label>
        </div>
      ) : null}

      <div className="mt-5">
        {loading ? (
          <ul className="grid gap-2.5 lg:grid-cols-2" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <li key={index} className="skeleton h-20 rounded-2xl" />
            ))}
          </ul>
        ) : error ? (
          <ErrorState title={bt("뉴스를 불러오지 못했습니다.", "Couldn't load the news.")} message={error} onRetry={reload} />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-card/40 px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-raised text-fg-3"><Newspaper size={22} aria-hidden="true" /></span>
            <div>
              <p className="font-semibold text-fg">{bt("표시할 소식이 없어요", "No news to show")}</p>
              <p className="mt-1 max-w-xs text-sm text-fg-2">{bt("새 헤드라인이 모이면 이곳에 표시됩니다. 잠시 후 다시 확인해 주세요.", "New headlines will appear here. Please check back in a moment.")}</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-card/40 px-6 py-12 text-center" role="status">
            <span className="grid size-12 place-items-center rounded-2xl bg-raised text-fg-3"><Search size={20} aria-hidden="true" /></span>
            <div>
              <p className="font-semibold text-fg">{bt("조건에 맞는 소식이 없어요", "No news matches")}</p>
              <p className="mt-1 max-w-xs text-sm text-fg-2">{bt("다른 카테고리를 고르거나 검색어를 바꿔 보세요.", "Pick another category or change the search.")}</p>
            </div>
            {filterActive ? (
              <button type="button" onClick={resetFilters} className="min-h-11 rounded-full border border-line bg-card px-4 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
                {bt("필터 초기화", "Reset filters")}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <p className="mb-2.5 text-sm text-fg-2" role="status">
              {formatI18nTemplate(bt("소식 {v0}건 중 {v1}건 표시", "Showing {v1} of {v0} stories"), { v0: filtered.length, v1: feed.visible })}
            </p>
            <ul className="grid gap-2.5 lg:grid-cols-2" aria-label={bt("소식 목록", "News list")}>
              {filtered.slice(0, feed.visible).map((item, index) => {
                const label = item.category ? bt(...CATEGORY_LABEL[item.category]) : null;
                return (
                  <NewsRow
                    key={`${index}-${item.url}`}
                    item={item}
                    categoryLabel={label}
                    dateLabel={newsDateLabel(item.date, locale)}
                    openLabel={bt("새 창에서 열림", "opens in a new tab")}
                  />
                );
              })}
            </ul>
            <SiteShowMoreButton
              remaining={feed.remaining}
              onClick={() => feed.showMore()}
              label={formatI18nTemplate(bt("소식 더 보기 · {v0}건 남음", "Show more · {v0} left"), { v0: feed.remaining })}
            />
          </>
        )}
      </div>

      <section className="mt-10 sm:mt-12" aria-labelledby="news-next-title">
        <h2 id="news-next-title" className="text-lg font-bold text-fg sm:text-xl">{bt("소식을 읽은 다음엔", "After the news")}</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {nextSteps.map((step) => (
            <SiteLinkCard key={step.href} layout="compact" href={step.href} icon={step.icon} title={step.title} description={step.body} />
          ))}
        </div>
      </section>

      <p className="mt-6 text-sm leading-relaxed text-fg-2">
        {bt("헤드라인·출처·날짜만 표기하며 본문은 각 발행처에 있습니다. 출처: Google News.", "Only headlines, sources and dates are shown; full articles stay with each publisher. Source: Google News.")}
        {generatedAtLabel ? <span className="tnum"> · {generatedAtLabel} {bt("갱신", "updated")}</span> : null}
      </p>
    </Container>
  );
}
