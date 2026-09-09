import {
  ArrowRight,
  BellRing,
  BookOpen,
  Images,
  Layers,
  Library,
  Settings,
  Store,
  UserRound,
} from "lucide-react";

import Link from "@/compat/router-link";
import { useSession } from "@/compat/auth-session-store";
import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";
import { useApp, useHydrated } from "@/shared/lib/store";
import { useDocumentTitle } from "@/hooks/use-document-title";

const COPY = {
  ko: {
    eyebrow: "MY SPACE",
    title: "내 작업과 기록을 한곳에서.",
    body: "프로젝트, 공개한 작품, 서재, 에셋, 활동과 설정을 각각 찾지 않아도 됩니다. 내 공간에서 필요한 다음 화면으로 바로 이동하세요.",
    syncLocal: "현재 기록은 이 브라우저를 중심으로 보관됩니다. 로그인하면 지원되는 데이터는 계정과 이어집니다.",
    syncAccount: "로그인한 계정과 이 브라우저의 작업을 이어서 사용할 수 있습니다. 프로젝트별 저장 위치는 각 작업공간에서 확인하세요.",
    syncLoading: "계정과 이 브라우저의 기록 상태를 확인하고 있습니다.",
    open: "열기",
    section: "내 공간 바로가기",
    stats: ["읽기 상태", "평가", "컬렉션"],
    destinations: [
      ["프로젝트", "최근 프로젝트, 로컬 초안, 공유 작업, 버전과 복구", "/studio/projects"],
      ["내 작품", "공개한 창작물과 시리즈, 작성자 활동", "/me?tab=posts"],
      ["내 서재", "읽고 싶음·읽는 중·완독·평가·컬렉션", "/library"],
      ["내 에셋", "설치·보관한 Studio 리소스와 관심 에셋", "/market/library"],
      ["내 활동", "리뷰, 읽기 상태, 컬렉션 등 활동 요약", "/me?tab=activity"],
      ["프로필", "이름, 소개, 아바타와 공개 프로필", "/me?tab=profile"],
      ["설정", "언어, 기록, 필터, 데이터 가져오기·내보내기", "/settings"],
      ["알림 확인", "연재 알림은 서재에서, 협업·프로젝트 알림은 해당 작업공간에서 확인", "/library?tab=alerts"],
    ],
  },
  en: {
    eyebrow: "MY SPACE",
    title: "Keep your work and history in one place.",
    body: "You should not have to hunt separately for projects, published work, library data, assets, activity and settings. My Space connects the next destination directly.",
    syncLocal: "Current history is primarily stored in this browser. Sign in to continue supported data with your account.",
    syncAccount: "Continue with your signed-in account and work available in this browser. Check each workspace for project-specific storage details.",
    syncLoading: "Checking account and browser history status.",
    open: "Open",
    section: "My Space destinations",
    stats: ["Reading states", "Ratings", "Collections"],
    destinations: [
      ["Projects", "Recent projects, local drafts, shared work, versions and recovery", "/studio/projects"],
      ["My works", "Published creator works, series and author activity", "/me?tab=posts"],
      ["My library", "Want to read, reading, completed, ratings and collections", "/library"],
      ["My assets", "Installed and saved Studio resources plus bookmarked assets", "/market/library"],
      ["My activity", "Reviews, reading states, collections and activity summary", "/me?tab=activity"],
      ["Profile", "Name, bio, avatar and public profile", "/me?tab=profile"],
      ["Settings", "Language, history, filters and data import/export", "/settings"],
      ["Notifications", "Release alerts live in Library; collaboration and project alerts stay with their workspace", "/library?tab=alerts"],
    ],
  },
} as const;

const ICONS = [Layers, Images, Library, Store, BookOpen, UserRound, Settings, BellRing] as const;

export function MySpaceHubPage() {
  const language = useI18n((state) => state.lang);
  const locale = language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
  const copy = COPY[locale];
  const hydrated = useHydrated();
  const { status: sessionStatus } = useSession();
  const reads = useApp((state) => state.reads);
  const ratings = useApp((state) => state.ratings);
  const collections = useApp((state) => state.collections);

  useDocumentTitle(locale === "ko" ? "내 공간" : "My Space");

  const stats = hydrated
    ? [Object.keys(reads).length, Object.keys(ratings).length, collections.length]
    : [0, 0, 0];
  const syncCopy = sessionStatus === "loading"
    ? copy.syncLoading
    : sessionStatus === "authenticated"
      ? copy.syncAccount
      : copy.syncLocal;

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <header className="relative overflow-hidden rounded-3xl border border-line bg-panel/55 p-5 sm:p-8 lg:p-10">
        <div aria-hidden="true" className="absolute -right-24 -top-32 size-80 rounded-full bg-[radial-gradient(circle,_oklch(0.72_0.185_42/0.18),_transparent_70%)]" />
        <div className="relative max-w-3xl">
          <p className="eyebrow text-accent">{copy.eyebrow}</p>
          <h1 className="mt-3 text-pretty font-display text-[clamp(2rem,6vw,4.2rem)] font-bold leading-[1] tracking-[-0.05em] text-fg">{copy.title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-fg-2 sm:text-base">{copy.body}</p>
          <p className="mt-5 max-w-2xl rounded-xl border border-line bg-card/60 px-4 py-3 text-xs leading-5 text-fg-3" aria-live="polite">
            {syncCopy}
          </p>
        </div>

        <dl className="relative mt-6 grid max-w-2xl grid-cols-3 gap-2">
          {copy.stats.map((label, index) => (
            <div key={label} className="rounded-xl border border-line bg-card/70 p-3">
              <dd className="numeral text-xl font-bold text-fg sm:text-2xl">{hydrated ? stats[index] : "·"}</dd>
              <dt className="mt-1 text-[0.68rem] text-fg-3 sm:text-xs">{label}</dt>
            </div>
          ))}
        </dl>
      </header>

      <section className="mt-10" aria-labelledby="my-space-destinations">
        <h2 id="my-space-destinations" className="text-2xl font-bold tracking-tight text-fg">{copy.section}</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {copy.destinations.map(([title, body, href], index) => {
            const Icon = ICONS[index];
            const primary = index < 4;
            return (
              <Link
                key={href}
                href={href}
                className={
                  primary
                    ? "group flex min-h-40 flex-col rounded-2xl border border-line bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                    : "group flex min-h-32 flex-col rounded-2xl border border-line/80 bg-panel/45 p-4 transition-colors hover:border-accent/35 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                }
              >
                <span className="grid size-10 place-items-center rounded-xl border border-line bg-panel text-fg-3 transition-colors group-hover:border-accent/35 group-hover:text-accent"><Icon size={18} aria-hidden="true" /></span>
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
