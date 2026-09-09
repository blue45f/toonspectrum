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
import { useI18n } from "@/shared/lib/i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";

const COPY = {
  ko: {
    eyebrow: "DISCOVER",
    title: "지금 원하는 방식으로 작품을 찾으세요.",
    body: "제목을 알고 있으면 검색하고, 취향만 있다면 탐색하거나 추천받고, 결정하기 어렵다면 랭킹·랜덤·비교를 이용하세요.",
    placeholder: "작품명·작가·태그 검색",
    search: "검색",
    open: "열기",
    section: "어떻게 찾을까요?",
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
    title: "Find a story in the way that fits your goal.",
    body: "Search when you know the title, explore or get recommendations when you only know your taste, and use rankings, random picks or comparison when choosing is hard.",
    placeholder: "Search stories, creators or tags",
    search: "Search",
    open: "Open",
    section: "How would you like to find it?",
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
      <header className="relative overflow-hidden rounded-3xl border border-line bg-panel/55 p-5 sm:p-8 lg:p-10">
        <div aria-hidden="true" className="absolute -right-28 -top-36 size-96 rounded-full bg-[radial-gradient(circle,_oklch(0.72_0.185_42/0.17),_transparent_70%)]" />
        <div className="relative max-w-3xl">
          <p className="eyebrow flex items-center gap-2 text-accent"><Compass size={14} aria-hidden="true" />{copy.eyebrow}</p>
          <h1 className="mt-3 text-pretty font-display text-[clamp(2rem,6vw,4.2rem)] font-bold leading-[1] tracking-[-0.05em] text-fg">{copy.title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-fg-2 sm:text-base">{copy.body}</p>

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
            <button type="submit" className="min-h-12 rounded-2xl bg-accent px-5 text-sm font-bold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
              {copy.search}
            </button>
          </form>
        </div>
      </header>

      <section className="mt-10" aria-labelledby="discover-paths-title">
        <h2 id="discover-paths-title" className="text-2xl font-bold tracking-tight text-fg">{copy.section}</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {copy.destinations.map(([title, body, href], index) => {
            const Icon = ICONS[index];
            return (
              <Link
                key={href}
                href={href}
                className="group flex min-h-40 flex-col rounded-2xl border border-line bg-card/75 p-4 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <span className="grid size-10 place-items-center rounded-xl border border-line bg-panel text-fg-3 group-hover:border-accent/35 group-hover:text-accent"><Icon size={18} aria-hidden="true" /></span>
                <strong className="mt-4 text-sm text-fg">{title}</strong>
                <span className="mt-1.5 flex-1 text-xs leading-5 text-fg-3">{body}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">{copy.open}<ArrowRight size={13} aria-hidden="true" /></span>
              </Link>
            );
          })}
        </div>
      </section>
    </Container>
  );
}
