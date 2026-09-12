import {
  ArrowRight,
  CalendarDays,
  Compass,
  Library,
  Search,
  Shuffle,
  Sparkles,
  Swords,
  TrendingUp,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { PublicStoryHero } from "@/shared/components/public-story-hero";
import {
  FriendlyQuickGuide,
} from "@/shared/components/purpose-experience-stage";
import { useI18n } from "@/shared/lib/i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";

const COPY = {
  ko: {
    eyebrow: "DISCOVER",
    title: "다음 컷의 영감은, 새로운 이야기에서.",
    body: "마음을 움직이는 연출, 오래 남는 캐릭터, 다음에 읽을 이야기. 작품을 검색하고 취향을 좁혀 발견하세요. 창작에 필요한 자료는 참고자료 작업실로 이어집니다.",
    placeholder: "작품명·작가·태그 검색",
    search: "검색",
    open: "열기",
    section: "어떻게 찾을까요?",
    visualLabel: "취향과 조건을 거쳐 작품을 발견하는 흐름 미리보기",
    visualSteps: ["원하는 느낌", "조건 좁히기", "작품 발견"],
    guideTitle: "처음이라면 30초만 보고 시작하세요",
    guideBody: "기능 이름을 외우지 않아도 됩니다. 지금 상황에 맞는 방법만 고르면 됩니다.",
    guideSteps: [
      "찾는 제목이 있으면 위 검색창에 바로 입력합니다.",
      "제목이 없으면 취향 탐색 또는 맞춤 추천을 선택합니다.",
      "결정이 어렵다면 랭킹·랜덤·비교로 후보를 줄입니다.",
    ],
    destinations: [
      ["정확히 검색", "찾고 있는 작품·작가·태그가 있을 때", "/search"],
      ["취향으로 탐색", "장르·태그·상태·플랫폼 조건을 좁혀 발견", "/explore"],
      ["맞춤 추천", "내 평가와 선호 장르를 반영한 개인화 추천", "/recommend"],
      ["통합 랭킹", "인기·급상승·평점 등 여러 신호로 비교", "/ranking"],
      ["연재 캘린더", "오늘과 이번 주에 업데이트되는 작품 확인", "/calendar"],
      ["랜덤 발견", "결정 피로가 올 때 한 편씩 미리 보고 다시 뽑기", "/random"],
      ["두 작품 비교", "고민되는 두 작품의 주요 지표와 제공처 비교", "/compare"],
      ["내 서재", "저장·평가·읽기 상태와 취향 분석으로 돌아가기", "/library"],
    ],
  },
  en: {
    eyebrow: "DISCOVER",
    title: "Find the story that sparks your next panel.",
    body: "Memorable characters, visual storytelling and your next great read. Search for stories or explore by taste, then visit the reference atelier for your own creative work.",
    placeholder: "Search stories, creators or tags",
    search: "Search",
    open: "Open",
    section: "How would you like to find it?",
    visualLabel: "Preview of moving from taste and filters to a story discovery",
    visualSteps: ["Your mood", "Narrow it down", "Find a story"],
    guideTitle: "New here? Start with this 30-second guide",
    guideBody: "You do not need to memorize feature names. Pick the route that matches your situation.",
    guideSteps: [
      "If you know the title, type it directly into the search field above.",
      "If you only know your taste, choose Explore or Recommendations.",
      "If choosing is hard, use Rankings, Random or Compare to narrow candidates.",
    ],
    destinations: [
      ["Exact search", "When you know a story, creator or tag", "/search"],
      ["Explore by taste", "Narrow by genre, tag, status and platform", "/explore"],
      ["Recommendations", "Personalized picks from ratings and preferred genres", "/recommend"],
      ["Rankings", "Compare popularity, momentum, ratings and other signals", "/ranking"],
      ["Release calendar", "See what updates today and this week", "/calendar"],
      ["Random discovery", "Preview one pick at a time and reroll when choosing is hard", "/random"],
      ["Compare two", "Compare key signals and availability for two stories", "/compare"],
      ["My library", "Return to saved, rated and reading-state history", "/library"],
    ],
  },
} as const;

const ICONS = [Search, Compass, Sparkles, TrendingUp, CalendarDays, Shuffle, Swords, Library] as const;

export function DiscoverHubPage() {
  const language = useI18n((state) => state.lang);
  const locale = language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
  const copy = COPY[locale];
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useDocumentTitle(locale === "ko" ? "찾기" : "Discover");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  };

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <PublicStoryHero
        eyebrow="DISCOVER · STORIES & INSPIRATION"
        title={copy.title}
        description={copy.body}
        image="world"
        imageAlt={locale === "ko" ? "따뜻한 빛과 도시의 풍경이 펼쳐지는 웹툰 장면 콘셉트 아트" : "Webtoon concept art of a city scene in warm light"}
        caption={locale === "ko" ? "READ THE SCENE · 웹툰 장면 콘셉트 아트" : "READ THE SCENE · Webtoon concept art"}
      >
            <form onSubmit={submit} role="search" className="mt-6 grid max-w-2xl gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="flex min-h-12 min-w-0 items-center gap-3 rounded-2xl border border-line-strong bg-card/90 px-4 focus-within:border-accent/55 focus-within:ring-2 focus-within:ring-accent/25">
                <Search size={18} className="shrink-0 text-accent" aria-hidden="true" />
                <span className="sr-only">{copy.placeholder}</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={copy.placeholder}
                  className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
                />
              </label>
              <button type="submit" className="min-h-12 rounded-2xl bg-accent px-5 text-sm font-bold text-on-accent transition-all hover:-translate-y-0.5 hover:opacity-95 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
                {copy.search}
              </button>
            </form>
        <Link href="/research" className="mt-4 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-accent">{locale === "ko" ? "내 웹툰을 위한 참고자료 찾기" : "Find references for your webtoon"}<ArrowRight size={14} aria-hidden="true" /></Link>
      </PublicStoryHero>

      <FriendlyQuickGuide
        className="mt-5"
        title={copy.guideTitle}
        description={copy.guideBody}
        steps={copy.guideSteps}
      />

      <section className="mt-10" aria-labelledby="discover-paths-title">
        <h2 id="discover-paths-title" className="text-2xl font-bold tracking-tight text-fg">{copy.section}</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {copy.destinations.map(([title, body, href], index) => {
            const Icon = ICONS[index];
            return (
              <Link
                key={href}
                href={href}
                className="group relative flex min-h-40 flex-col overflow-hidden rounded-2xl border border-line bg-card/75 p-4 transition-all motion-safe:hover:-translate-y-1 hover:border-accent/40 hover:bg-raised hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <span aria-hidden="true" className="absolute -right-7 -top-7 size-20 rounded-full bg-accent/0 blur-2xl transition-colors duration-300 group-hover:bg-accent/15" />
                <span className="relative grid size-10 place-items-center rounded-xl border border-line bg-panel text-fg-3 transition-all group-hover:-rotate-3 group-hover:border-accent/35 group-hover:text-accent"><Icon size={18} aria-hidden="true" /></span>
                <strong className="relative mt-4 text-sm text-fg">{title}</strong>
                <span className="relative mt-1.5 flex-1 text-xs leading-5 text-fg-3">{body}</span>
                <span className="relative mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">{copy.open}<ArrowRight size={13} className="transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
              </Link>
            );
          })}
        </div>
      </section>
    </Container>
  );
}
