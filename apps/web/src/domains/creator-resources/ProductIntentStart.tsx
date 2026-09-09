import {
  ArrowRight,
  BookOpen,
  Clock3,
  Compass,
  MessageCircle,
  Palette,
  Search,
  Sparkles,
  Store,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import Link from "@/compat/router-link";
import {
  creatorDestinationDescription,
  creatorDestinationLabel,
  formatCreatorRelativeTime,
  getCreatorContinuityServerSnapshot,
  getCreatorContinuitySnapshot,
  subscribeCreatorContinuity,
  type CreatorContinuityLocale,
} from "@/shared/lib/creator-continuity";
import { useI18n } from "@/shared/lib/i18n";

const COPY = {
  ko: {
    eyebrow: "START WITH YOUR GOAL",
    title: "오늘 무엇을 하시겠어요?",
    body: "기능 이름을 찾지 않아도 됩니다. 지금 하려는 일을 고르면 필요한 화면부터 바로 시작합니다.",
    search: "작품·도구·에셋·도움말 검색",
    recent: "최근 작업 이어하기",
    recentFallback: "프로젝트 센터에서 작업 이어가기",
    recentFallbackBody: "최근 프로젝트, 로컬 초안, 공유받은 작업과 복구 항목을 한곳에서 확인하세요.",
    allProjects: "프로젝트 센터",
    secondary: "자주 찾는 곳",
    intents: [
      ["만들고 싶어요", "빈 캔버스, 컷툰, 캐릭터와 프로젝트 시작점을 한곳에서 고릅니다."],
      ["볼 작품을 찾고 싶어요", "장르·취향·랭킹·연재 일정에서 다음 작품을 찾습니다."],
      ["자료와 에셋이 필요해요", "출처가 있는 레퍼런스와 Studio에서 쓸 창작 에셋을 찾습니다."],
      ["사람들과 나누고 싶어요", "작품, 리뷰, 창작 경험과 커뮤니티 대화를 이어갑니다."],
    ],
    actions: ["만들기 시작", "작품 찾기", "리서치 열기", "커뮤니티 열기"],
    quick: ["Studio", "에셋 마켓", "내 서재", "도움말"],
  },
  en: {
    eyebrow: "START WITH YOUR GOAL",
    title: "What would you like to do?",
    body: "You do not need to memorize feature names. Choose your goal and start from the right workspace.",
    search: "Search stories, tools, assets and help",
    recent: "Continue where you left off",
    recentFallback: "Continue from Project Center",
    recentFallbackBody: "Find recent projects, local drafts, shared work and recovery items in one place.",
    allProjects: "Project Center",
    secondary: "Frequent destinations",
    intents: [
      ["I want to create", "Choose a blank canvas, comic, character or project starting point."],
      ["I want to find a story", "Discover the next story through taste, rankings and release schedules."],
      ["I need references or assets", "Find sourced references and creative assets that work in Studio."],
      ["I want to share with people", "Continue through works, reviews, creative discussions and community."],
    ],
    actions: ["Start creating", "Find stories", "Open research", "Open community"],
    quick: ["Studio", "Asset market", "My library", "Help"],
  },
} as const;

const INTENTS = [
  { href: "/make", icon: Palette },
  { href: "/explore", icon: Compass },
  { href: "/research", icon: BookOpen },
  { href: "/community", icon: MessageCircle },
] as const;

const QUICK_LINKS = [
  { href: "/studio", icon: Palette },
  { href: "/market", icon: Store },
  { href: "/library", icon: BookOpen },
  { href: "/help", icon: Sparkles },
] as const;

function localeFromLanguage(language: string): CreatorContinuityLocale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

export function ProductIntentStart() {
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const copy = COPY[locale];
  const continuity = useSyncExternalStore(
    subscribeCreatorContinuity,
    getCreatorContinuitySnapshot,
    getCreatorContinuityServerSnapshot,
  );
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const recent = continuity.recent[0] ?? null;

  return (
    <section className="relative overflow-hidden border-b border-line bg-ledger" aria-labelledby="product-intent-title">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -top-40 size-[34rem] rounded-full bg-[radial-gradient(circle,_oklch(0.72_0.185_42/0.18),_transparent_68%)] blur-2xl"
      />
      <div className="relative mx-auto max-w-[1320px] px-4 py-7 sm:px-6 sm:py-10 lg:py-12">
        <div className="grid gap-7 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)] xl:items-end">
          <div>
            <p className="eyebrow flex items-center gap-2 text-accent">
              <Sparkles size={14} aria-hidden="true" />
              {copy.eyebrow}
            </p>
            <h1
              id="product-intent-title"
              className="mt-3 max-w-3xl text-pretty font-display text-[clamp(2.2rem,6vw,4.7rem)] font-bold leading-[0.98] tracking-[-0.055em] text-fg"
            >
              {copy.title}
            </h1>
            <p className="mt-4 max-w-2xl text-pretty text-sm leading-7 text-fg-2 sm:text-base">
              {copy.body}
            </p>
            <Link
              href="/search"
              className="mt-6 flex min-h-12 max-w-2xl items-center gap-3 rounded-2xl border border-line-strong bg-card/85 px-4 text-sm text-fg-2 shadow-sm transition-colors hover:border-accent/50 hover:bg-raised/80 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <Search size={18} className="shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{copy.search}</span>
              <kbd className="hidden rounded-md border border-line bg-panel px-1.5 py-0.5 font-display text-[0.62rem] text-fg-3 sm:inline">⌘K</kbd>
            </Link>
          </div>

          <aside className="rounded-3xl border border-line/80 bg-panel/75 p-4 shadow-sm sm:p-5">
            <p className="flex items-center gap-2 text-xs font-bold text-accent">
              <Clock3 size={15} aria-hidden="true" />
              {copy.recent}
            </p>
            {recent ? (
              <Link
                href={recent.href}
                className="group mt-3 flex min-h-24 items-center gap-4 rounded-2xl border border-line bg-card p-4 transition-colors hover:border-accent/45 hover:bg-raised"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-accent/30 bg-accent-soft text-accent">
                  <Palette size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-fg group-hover:text-accent">
                    {creatorDestinationLabel(recent.id, locale)}
                  </strong>
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-fg-3">
                    {creatorDestinationDescription(recent.id, locale)}
                  </span>
                  <span className="mt-1.5 block text-[0.68rem] text-fg-3">
                    {now ? formatCreatorRelativeTime(recent.visitedAt, locale, now) : ""}
                  </span>
                </span>
                <ArrowRight size={17} className="shrink-0 text-fg-3 transition-transform group-hover:translate-x-1 group-hover:text-accent" aria-hidden="true" />
              </Link>
            ) : (
              <Link
                href="/studio/projects"
                className="group mt-3 block rounded-2xl border border-dashed border-line-strong bg-card/60 p-4 transition-colors hover:border-accent/45 hover:bg-raised"
              >
                <strong className="text-sm text-fg group-hover:text-accent">{copy.recentFallback}</strong>
                <span className="mt-1.5 block text-xs leading-5 text-fg-3">{copy.recentFallbackBody}</span>
              </Link>
            )}
            <Link href="/studio/projects" className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent-2">
              {copy.allProjects}<ArrowRight size={14} aria-hidden="true" />
            </Link>
          </aside>
        </div>

        <div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {INTENTS.map((intent, index) => {
            const Icon = intent.icon;
            return (
              <Link
                key={intent.href}
                href={intent.href}
                className="group flex min-h-40 flex-col rounded-2xl border border-line bg-card/75 p-4 transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-accent/45 hover:bg-raised/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <span className="grid size-10 place-items-center rounded-xl border border-line bg-panel text-fg-3 transition-colors group-hover:border-accent/35 group-hover:text-accent">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <strong className="mt-4 text-base text-fg">{copy.intents[index][0]}</strong>
                <span className="mt-1.5 flex-1 text-xs leading-5 text-fg-3">{copy.intents[index][1]}</span>
                <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-accent">
                  {copy.actions[index]}<ArrowRight size={14} aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2" aria-label={copy.secondary}>
          <span className="mr-1 text-[0.68rem] font-semibold text-fg-3">{copy.secondary}</span>
          {QUICK_LINKS.map((item, index) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-panel/70 px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/40 hover:text-accent"
              >
                <Icon size={14} aria-hidden="true" />{copy.quick[index]}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
