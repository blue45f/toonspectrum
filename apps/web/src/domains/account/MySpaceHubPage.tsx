import {
  translateBilingualValueForActiveLocale,
  translateCurrentStaticSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  BellRing,
  BookOpen,
  Clock3,
  Images,
  Layers,
  Library,
  Mail,
  PlayCircle,
  Settings,
  Store,
  UserRound,
} from "lucide-react";
import { useSyncExternalStore } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import {
  FriendlyQuickGuide,
  PurposeExperienceStage,
} from "@/shared/components/purpose-experience-stage";
import { Container } from "@/shared/components/section";
import {
  creatorDestinationLabel,
  creatorRecentDestinationDescription,
  getCreatorContinuityServerSnapshot,
  getCreatorContinuitySnapshot,
  subscribeCreatorContinuity,
} from "@/shared/lib/creator-continuity";
import { useI18n } from "@/shared/lib/i18n";
import { useApp, useHydrated } from "@/shared/lib/store";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("MySpaceHubPage", ko, en);

const COPY = {
  ko: {
    eyebrow: "MY SPACE",
    title: "내 작업과 기록을 한곳에서.",
    body: "프로젝트, 공개한 작품, 서재, 에셋, 활동과 설정을 각각 찾지 않아도 됩니다. 내 공간에서 필요한 다음 화면으로 바로 이동하세요.",
    syncLocal: "현재 기록은 이 브라우저를 중심으로 보관됩니다. 로그인하면 지원되는 데이터는 계정과 이어집니다.",
    syncAccount: "로그인한 계정과 이 브라우저의 작업을 이어서 사용할 수 있습니다. 프로젝트별 저장 위치는 각 작업공간에서 확인하세요.",
    open: "열기",
    section: "내 공간 바로가기",
    stats: ["읽기 상태", "평가", "컬렉션"],
    visualLabel: "작업을 저장하고 다른 활동으로 이어가는 내 공간 흐름 미리보기",
    visualSteps: ["작업 확인", "안전하게 저장", "다음 행동"],
    guideTitle: "내 데이터가 어디에 있는지 헷갈린다면",
    guideBody: "브라우저 기록, 계정 데이터, Studio 프로젝트는 역할이 다릅니다. 이 기준만 기억하면 됩니다.",
    guideSteps: [
      "Studio 프로젝트는 프로젝트 센터에서 저장·복구·공유 상태를 확인합니다.",
      "작품 감상 기록과 컬렉션은 내 서재에서 관리합니다.",
      "설치한 에셋과 관심 에셋은 마켓의 내 에셋에서 관리합니다.",
    ],
    continueEyebrow: "CONTINUE WORK",
    continueTitle: "가장 최근 작업부터 이어가세요",
    continueAction: "이어서 작업",
    allProjects: "모든 프로젝트",
    emptyTitle: "아직 이어갈 Studio 작업이 없습니다",
    emptyBody: "새 작품을 만들거나 기존 파일을 가져오세요. 먼저 살펴보고 싶다면 실제 제작 흐름과 분리된 샘플 프로젝트를 열 수 있습니다.",
    createAction: "새 작품 만들기",
    importAction: "기존 파일 가져오기",
    sampleAction: "10분 샘플로 보기",
    quickTitle: "바로 확인할 것",
    quickActions: [
      ["알림", "협업 요청과 프로젝트 변경을 확인", "/notifications"],
      ["학습", "막힌 제작 단계의 실습을 이어가기", "/learn"],
      ["내 에셋", "설치·저장한 작업 재료 정리", "/market/library"],
    ],
    destinations: [
      ["프로젝트", "최근 프로젝트, 로컬 초안, 공유 작업, 버전과 복구", "/studio"],
      ["내 작품", "공개한 창작물과 시리즈, 작성자 활동", "/me?tab=posts"],
      ["내 서재", "읽고 싶음·읽는 중·완독·평가·컬렉션", "/library"],
      ["내 에셋", "설치·보관한 Studio 리소스와 관심 에셋", "/market/library"],
      ["내 활동", "리뷰, 읽기 상태, 컬렉션 등 활동 요약", "/me?tab=activity"],
      ["프로필", "이름, 소개, 아바타와 공개 프로필", "/me?tab=profile"],
      ["메시지", "작품 피드백, 협업 제안과 비공개 문의", "/messages"],
      ["설정", "언어, 기록, 필터, 데이터 가져오기·내보내기", "/settings"],
    ],
  },
  en: {
    eyebrow: "MY SPACE",
    title: "Keep your work and history in one place.",
    body: "You should not have to hunt separately for projects, published work, library data, assets, activity and settings. My Space connects the next destination directly.",
    syncLocal: "Current history is primarily stored in this browser. Sign in to continue supported data with your account.",
    syncAccount: "Continue with your signed-in account and work available in this browser. Check each workspace for project-specific storage details.",
    open: "Open",
    section: "My Space destinations",
    stats: ["Reading states", "Ratings", "Collections"],
    visualLabel: "Preview of checking work, saving safely and continuing to the next task",
    visualSteps: ["Check work", "Save safely", "Continue"],
    guideTitle: "If you are unsure where your data lives",
    guideBody: "Browser history, account data and Studio projects have different roles. Remember these three rules.",
    guideSteps: [
      "Use Project Center to check save, recovery and sharing state for Studio projects.",
      "Manage reading history and collections in My Library.",
      "Manage installed and bookmarked assets in Market > My Assets.",
    ],
    continueEyebrow: "CONTINUE WORK",
    continueTitle: "Continue from your most recent work",
    continueAction: "Continue working",
    allProjects: "All projects",
    emptyTitle: "There is no Studio work to continue yet",
    emptyBody: "Create a new work or bring in an existing file. You can also open the isolated sample project to inspect the complete production flow first.",
    createAction: "Create a new work",
    importAction: "Import an existing file",
    sampleAction: "Explore the 10-minute sample",
    quickTitle: "Check next",
    quickActions: [
      ["Notifications", "Review collaboration requests and project changes", "/notifications"],
      ["Learning", "Continue a hands-on lesson for a blocked production step", "/learn"],
      ["My assets", "Organize installed and saved production materials", "/market/library"],
    ],
    destinations: [
      ["Projects", "Recent projects, local drafts, shared work, versions and recovery", "/studio"],
      ["My works", "Published creator works, series and author activity", "/me?tab=posts"],
      ["My library", "Want to read, reading, completed, ratings and collections", "/library"],
      ["My assets", "Installed and saved Studio resources plus bookmarked assets", "/market/library"],
      ["My activity", "Reviews, reading states, collections and activity summary", "/me?tab=activity"],
      ["Profile", "Name, bio, avatar and public profile", "/me?tab=profile"],
      ["Messages", "Private feedback, collaboration proposals and inquiries", "/messages"],
      ["Settings", "Language, history, filters and data import/export", "/settings"],
    ],
  },
} as const;

const ICONS = [Layers, Images, Library, Store, BookOpen, UserRound, Mail, Settings] as const;
const QUICK_ICONS = [BellRing, BookOpen, Store] as const;

function visitTimeLabel(value: number, locale: "ko" | "en"): string {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function MySpaceHubPage() {
  useBilingualI18nRevision();

  const copy = bi(COPY.ko, COPY.en);
  const locale = useI18n((state) => state.lang.startsWith("ko") ? "ko" : "en");
  const hydrated = useHydrated();
  const { status: sessionStatus } = useSession();
  const reads = useApp((state) => state.reads);
  const ratings = useApp((state) => state.ratings);
  const collections = useApp((state) => state.collections);
  const continuity = useSyncExternalStore(
    subscribeCreatorContinuity,
    getCreatorContinuitySnapshot,
    getCreatorContinuityServerSnapshot,
  );

  useDocumentTitle(bi("내 공간", "My Space"));

  const stats = hydrated
    ? [Object.keys(reads).length, Object.keys(ratings).length, collections.length]
    : [0, 0, 0];
  const hasActivity = hydrated && stats.some((value) => value > 0);
  const syncCopy = sessionStatus === "authenticated" ? copy.syncAccount : copy.syncLocal;
  const recent = continuity.recent.find((entry) => entry.id === "studio")
    ?? continuity.recent[0]
    ?? null;

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <header className="relative overflow-hidden rounded-3xl border border-line bg-panel/55 p-5 sm:p-8 lg:p-10">
        <div aria-hidden="true" className="absolute -right-24 -top-32 size-80 rounded-full bg-[radial-gradient(circle,_oklch(0.72_0.185_42/0.18),_transparent_70%)]" />
        <div className="relative grid gap-7 xl:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.92fr)] xl:items-center">
          <div className="max-w-3xl">
            <p className="eyebrow text-accent">{copy.eyebrow}</p>
            <h1 className="mt-3 text-pretty font-display text-[clamp(2rem,6vw,4.2rem)] font-bold leading-[1] tracking-[-0.05em] text-fg">{copy.title}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-fg-2 sm:text-base">{copy.body}</p>
            <p className="mt-5 max-w-2xl rounded-xl border border-line bg-card/60 px-4 py-3 text-xs leading-5 text-fg-2" aria-live="polite">
              {syncCopy}
            </p>

            {hasActivity ? (
              <dl className="mt-6 grid max-w-2xl grid-cols-3 gap-2" data-my-space-activity-summary="true">
                {copy.stats.map((label, index) => (
                  <div key={label} className="rounded-xl border border-line bg-card/70 p-3 transition-colors hover:border-accent/30 hover:bg-raised/70">
                    <dd className="numeral text-xl font-bold text-fg sm:text-2xl">{stats[index]}</dd>
                    <dt className="mt-1 text-[0.68rem] text-fg-2 sm:text-xs">{label}</dt>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>

          <PurposeExperienceStage
            variant="my"
            ariaLabel={copy.visualLabel}
            steps={copy.visualSteps}
          />
        </div>
      </header>

      <section className="mt-5" aria-label={recent ? copy.continueTitle : copy.emptyTitle} data-my-space-next-action="true">
        {recent ? (
          <div className="relative overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-accent-soft/65 via-card to-panel p-5 shadow-lg sm:p-6">
            <span aria-hidden="true" className="absolute -right-16 -top-24 size-60 rounded-full border border-accent/20" />
            <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">{copy.continueEyebrow}</p>
                <h2 className="mt-2 text-xl font-black tracking-tight text-fg sm:text-2xl">{copy.continueTitle}</h2>
                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-line bg-card/70 p-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
                    <PlayCircle size={20} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <strong className="block truncate text-sm text-fg">{creatorDestinationLabel(recent.id, locale)}</strong>
                    <p className="mt-1 text-xs leading-5 text-fg-2">{creatorRecentDestinationDescription(recent, locale)}</p>
                    <span className="mt-2 inline-flex items-center gap-1.5 text-[0.68rem] font-bold text-fg-2">
                      <Clock3 size={13} aria-hidden="true" />
                      {visitTimeLabel(recent.visitedAt, locale)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 lg:max-w-56 lg:flex-col">
                <Link href={recent.href} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-black text-on-accent shadow-sm hover:bg-accent-2 lg:w-full">
                  {copy.continueAction}<ArrowRight size={15} aria-hidden="true" />
                </Link>
                <Link href="/studio" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-line bg-card px-4 text-sm font-bold text-fg-2 hover:border-accent/35 hover:text-fg lg:w-full">
                  {copy.allProjects}
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <ActionableEmptyState
            icon={Layers}
            title={copy.emptyTitle}
            description={copy.emptyBody}
            primary={{ href: "/studio/new", label: copy.createAction }}
            secondary={{ href: "/studio/import", label: copy.importAction }}
            sample={{ href: "/production/projects/sample-project/overview", label: copy.sampleAction }}
          />
        )}

        <div className="mt-3 rounded-2xl border border-line bg-panel/45 p-4">
          <h2 className="text-sm font-black text-fg">{copy.quickTitle}</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {copy.quickActions.map(([title, body, href], index) => {
              const Icon = QUICK_ICONS[index];
              return (
                <Link key={href} href={href} className="group flex min-h-24 items-start gap-3 rounded-xl border border-line bg-card/70 p-3 transition hover:border-accent/35 hover:bg-raised">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={16} aria-hidden="true" /></span>
                  <span className="min-w-0">
                    <strong className="block text-xs text-fg">{title}</strong>
                    <span className="mt-1 block text-[0.68rem] leading-5 text-fg-2">{body}</span>
                  </span>
                  <ArrowRight size={13} className="ml-auto mt-1 shrink-0 text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <FriendlyQuickGuide
        className="mt-5"
        title={copy.guideTitle}
        description={copy.guideBody}
        steps={copy.guideSteps}
      />

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
                    ? translateCurrentStaticSourceText("domains.account.MySpaceHubPage", "en", "group relative flex min-h-40 flex-col overflow-hidden rounded-2xl border border-line bg-card p-4 transition-all hover:-translate-y-1 hover:border-accent/40 hover:bg-raised hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70")
                    : translateCurrentStaticSourceText("domains.account.MySpaceHubPage", "en", "group flex min-h-32 flex-col rounded-2xl border border-line/80 bg-panel/45 p-4 transition-all hover:-translate-y-0.5 hover:border-accent/35 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70")
                }
              >
                {primary ? <span aria-hidden="true" className="absolute -right-8 -top-8 size-24 rounded-full bg-accent/0 blur-2xl transition-colors group-hover:bg-accent/15" /> : null}
                <span className="relative grid size-10 place-items-center rounded-xl border border-line bg-panel text-fg-3 transition-all group-hover:-rotate-3 group-hover:border-accent/35 group-hover:text-accent"><Icon size={18} aria-hidden="true" /></span>
                <strong className="relative mt-4 text-sm text-fg">{title}</strong>
                <span className="relative mt-1.5 flex-1 text-xs leading-5 text-fg-2">{body}</span>
                <span className="relative mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">{copy.open}<ArrowRight size={13} className="transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
              </Link>
            );
          })}
        </div>
      </section>
    </Container>
  );
}
