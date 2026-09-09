import {
  ArrowRight,
  BookOpen,
  CircleHelp,
  Database,
  FileWarning,
  Layers,
  Search,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";

const TOPICS = [
  {
    id: "start",
    icon: BookOpen,
    href: "/make",
    ko: ["처음 시작하기", "무엇을 만들지 고르고 빠르게 첫 작업을 시작합니다.", "시작 만들기 프로젝트"],
    en: ["Getting started", "Choose what to make and begin your first task quickly.", "start create project"],
  },
  {
    id: "studio",
    icon: Layers,
    href: "/studio/manual",
    ko: ["Studio 사용법", "캔버스, 레이어, 브러시, 말풍선, 3D와 내보내기를 찾아봅니다.", "스튜디오 캔버스 레이어 브러시 3d 내보내기"],
    en: ["Using Studio", "Learn canvas, layers, brushes, balloons, 3D and export workflows.", "studio canvas layers brushes 3d export"],
  },
  {
    id: "projects",
    icon: FileWarning,
    href: "/studio/projects",
    ko: ["프로젝트·저장·복구", "최근 프로젝트, 로컬 초안, 버전, 백업과 복구 경로를 확인합니다.", "프로젝트 저장 동기화 복구 백업 오프라인"],
    en: ["Projects, save & recovery", "Find recent projects, local drafts, versions, backup and recovery paths.", "project save sync recovery backup offline"],
  },
  {
    id: "market",
    icon: Store,
    href: "/market",
    ko: ["에셋과 사용권", "Studio 에셋의 호환성, 라이선스, 설치와 배포 방법을 확인합니다.", "에셋 마켓 라이선스 사용권 설치 배포"],
    en: ["Assets & licenses", "Understand compatibility, licenses, installation and distribution.", "assets market license install publish"],
  },
  {
    id: "account",
    icon: UserRound,
    href: "/settings",
    ko: ["계정과 내 데이터", "언어, 기록, 서재 데이터, 가져오기·내보내기와 계정 설정을 관리합니다.", "계정 설정 데이터 서재 가져오기 내보내기"],
    en: ["Account & data", "Manage language, history, library data, import/export and account preferences.", "account settings data library import export"],
  },
  {
    id: "data",
    icon: Database,
    href: "/about/data",
    ko: ["작품 데이터와 출처", "랭킹·통계·추정값이 어디에서 왔는지 확인합니다.", "데이터 출처 랭킹 통계 추정값"],
    en: ["Story data & sources", "See where rankings, statistics and estimated values come from.", "data sources ranking stats estimated"],
  },
  {
    id: "rights",
    icon: ShieldCheck,
    href: "/copyright",
    ko: ["저작권과 신고", "콘텐츠 권리, 공개 데이터 정책, 신고와 문의 경로를 확인합니다.", "저작권 권리 신고 정책 개인정보"],
    en: ["Copyright & reporting", "Review content rights, public-data policy, reports and contact paths.", "copyright rights report policy privacy"],
  },
] as const;

const COPY = {
  ko: {
    eyebrow: "HELP CENTER",
    title: "막힌 지점에서 바로 해결하세요.",
    body: "메뉴 이름을 몰라도 괜찮습니다. 하고 싶은 일이나 문제를 검색하면 관련 기능과 안내로 연결합니다.",
    placeholder: "예: 저장이 안 돼요, 말풍선, 에셋 라이선스",
    results: "도움말 주제",
    empty: "일치하는 주제를 찾지 못했습니다.",
    emptyBody: "다른 표현으로 검색하거나 제보·제안에서 상황을 알려주세요.",
    feedback: "제보·제안 보내기",
    support: "이용 문의",
    accessibility: "접근성 안내",
  },
  en: {
    eyebrow: "HELP CENTER",
    title: "Solve the problem from where you got stuck.",
    body: "You do not need to know the menu name. Search for a task or problem and jump to the right feature or guide.",
    placeholder: "e.g. save failed, speech balloon, asset license",
    results: "Help topics",
    empty: "No matching help topic found.",
    emptyBody: "Try another phrase or tell us what happened through Feedback.",
    feedback: "Send feedback",
    support: "Contact support",
    accessibility: "Accessibility",
  },
} as const;

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function HelpCenterPage() {
  const language = useI18n((state) => state.lang);
  const locale = language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
  const copy = COPY[locale];
  const [query, setQuery] = useState("");
  const normalizedQuery = normalize(query);
  const filtered = useMemo(
    () => TOPICS.filter((topic) => {
      if (!normalizedQuery) return true;
      const haystack = topic[locale].join(" ").toLocaleLowerCase();
      return normalizedQuery.split(/\s+/u).every((token) => haystack.includes(token));
    }),
    [locale, normalizedQuery],
  );

  useDocumentTitle(locale === "ko" ? "도움말" : "Help Center");

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <header className="relative overflow-hidden rounded-3xl border border-line bg-panel/55 p-5 sm:p-8 lg:p-10">
        <div aria-hidden="true" className="absolute -right-20 -top-28 size-72 rounded-full bg-[radial-gradient(circle,_oklch(0.72_0.185_42/0.18),_transparent_70%)]" />
        <div className="relative max-w-3xl">
          <p className="eyebrow flex items-center gap-2 text-accent"><CircleHelp size={14} aria-hidden="true" />{copy.eyebrow}</p>
          <h1 className="mt-3 text-pretty font-display text-[clamp(2rem,6vw,4.1rem)] font-bold leading-[1] tracking-[-0.05em] text-fg">{copy.title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-fg-2 sm:text-base">{copy.body}</p>
          <label className="mt-6 flex min-h-12 max-w-2xl items-center gap-3 rounded-2xl border border-line-strong bg-card/90 px-4 focus-within:border-accent/55 focus-within:ring-2 focus-within:ring-accent/25">
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
        </div>
      </header>

      <section className="mt-10" aria-labelledby="help-topics-title">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow text-accent">01 · TOPICS</p>
            <h2 id="help-topics-title" className="mt-2 text-2xl font-bold tracking-tight text-fg">{copy.results}</h2>
          </div>
          <span className="numeral rounded-full border border-line bg-card px-3 py-1 text-xs text-fg-3" aria-live="polite">{filtered.length}</span>
        </div>

        {filtered.length ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((topic) => {
              const Icon = topic.icon;
              const [title, description] = topic[locale];
              return (
                <Link key={topic.id} href={topic.href} className="group flex min-h-36 flex-col rounded-2xl border border-line bg-card/75 p-4 transition-colors hover:border-accent/40 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
                  <span className="grid size-10 place-items-center rounded-xl border border-line bg-panel text-fg-3 group-hover:border-accent/35 group-hover:text-accent"><Icon size={18} aria-hidden="true" /></span>
                  <strong className="mt-4 text-sm text-fg">{title}</strong>
                  <span className="mt-1.5 flex-1 text-xs leading-5 text-fg-3">{description}</span>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">Open<ArrowRight size={13} aria-hidden="true" /></span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-line bg-panel/40 p-8 text-center">
            <CircleHelp size={26} className="mx-auto text-fg-3" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-fg">{copy.empty}</p>
            <p className="mt-1 text-xs leading-5 text-fg-3">{copy.emptyBody}</p>
          </div>
        )}
      </section>

      <footer className="mt-10 flex flex-wrap gap-2 border-t border-line pt-6">
        <Link href="/feedback" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent">{copy.feedback}<ArrowRight size={14} aria-hidden="true" /></Link>
        <Link href="/support" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-4 text-sm font-semibold text-fg-2 hover:border-line-strong hover:text-fg">{copy.support}</Link>
        <Link href="/accessibility" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-4 text-sm font-semibold text-fg-2 hover:border-line-strong hover:text-fg">{copy.accessibility}</Link>
      </footer>
    </Container>
  );
}
