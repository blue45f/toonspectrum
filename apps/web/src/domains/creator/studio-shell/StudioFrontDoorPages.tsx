import {
  resolveUiLocale,
  translateBilingualValueForLocale,
  translateCurrentStaticSourceText,
  translateLocaleBranchForLocale,
  getActiveI18nLocale,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision
} from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Brush,
  FileImage,
  FilePlus2,
  FileText,
  FileUp,
  FolderKanban,
  ImagePlus,
  LayoutGrid,
  Lightbulb,
  Music2,
  Palette,
  PlayCircle,
  Presentation,
  Search,
  Sparkles,
  Store,
  UserRoundPen,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { WorkflowTrustBadge } from "@/shared/components/WorkflowTrustBadge";
import { useI18n } from "@/shared/lib/i18n";

import {
  RecoverableActionNotice,
  StudioIntentLauncher,
  StudioTaskFlow,
  type StudioIntentAction,
  type StudioTaskFlowStep,
} from "./StudioTaskFlow";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioFrontDoorPages", ko, en);

type StudioFrontDoorLocale = string;
type StudioFrontDoorAuthoredLocale = "ko" | "en";

type FrontDoorCard = Readonly<{
  href: string;
  icon: LucideIcon;
  title: Readonly<Record<StudioFrontDoorAuthoredLocale, string>>;
  description: Readonly<Record<StudioFrontDoorAuthoredLocale, string>>;
  badge?: Readonly<Record<StudioFrontDoorAuthoredLocale, string>>;
}>;

/** Normalize an application language tag to a supported Studio front-door locale. */
function studioFrontDoorLocale(_language): StudioFrontDoorLocale {
  return getActiveI18nLocale();
}

function intentActions(_locale): readonly StudioIntentAction[] {
  return [
    {
      href: "/studio/new?kind=webtoon&template=webtoon-vertical",
      icon: Lightbulb,
      title: bi("아이디어만 있어요", "I only have an idea"),
      description: bi("작품 이름과 첫 회차부터 시작하고, 기획·콘티·작화 순서로 이어갑니다.", "Start with a title and first episode, then move through planning, storyboard and art."),
      badge: bi("처음 시작 추천", "Recommended first start"),
      visual: "/brand/theme-scenes/ink-studio.svg",
    },
    {
      href: "/story-lab",
      icon: FileText,
      title: bi("대본이나 콘티가 있어요", "I have a script or storyboard"),
      visual: "/brand/theme-scenes/graphite-studio.svg",
      description: bi("기존 대본·캐릭터·장면을 정리하고 바로 회차 제작으로 연결합니다.", "Organize existing scripts, characters and scenes, then connect them to production."),
    },
    {
      href: "/studio/import",
      icon: FileUp,
      title: bi("그리던 파일이 있어요", "I have work-in-progress files"),
      visual: "/brand/atelier-process-640.webp",
      description: bi("PSD·ORA·이미지·브러시·3D 파일을 분석하고 원본을 보존한 채 가져옵니다.", "Analyze PSD, ORA, image, brush and 3D files while preserving the originals."),
    },
    {
      href: "/production",
      icon: UsersRound,
      title: bi("팀 프로젝트를 시작해요", "I am starting a team project"),
      visual: "/brand/production-os-journey.svg",
      description: bi("역할·마감·작업 넘기기·검수 기준을 먼저 정하고 함께 제작합니다.", "Set roles, deadlines, handoffs and review rules before producing together."),
    },
    {
      href: "/production/projects/sample-project/overview",
      icon: PlayCircle,
      title: bi("샘플로 먼저 둘러볼게요", "Show me a sample first"),
      description: bi("기획부터 검토·연재 준비까지 연결된 샘플 프로젝트를 안전하게 체험합니다.", "Explore a safe sample project connected from planning through review and publishing."),
      badge: bi("원본 유지", "Original stays intact"),
      visual: "/brand/production-os-hero.svg",
    },
  ];
}

function productionFlow(_locale): readonly StudioTaskFlowStep[] {
  const labels = bi([
      ["plan", "기획", "작품·캐릭터·회차 기준"],
      ["storyboard", "콘티", "대본을 컷과 스크롤로 구성"],
      ["create", "2D·3D 제작", "선화·채색·배경·식자"],
      ["collaborate", "협업", "작업 배정·넘기기·버전"],
      ["review", "검토", "수정 요청·승인본 고정"],
      ["publish", "연재", "규격 검사·예약 공개"],
    ], [
      ["plan", "Plan", "Series, character and episode foundation"],
      ["storyboard", "Storyboard", "Turn the script into panels and scroll rhythm"],
      ["create", "Create in 2D & 3D", "Line art, color, backgrounds and lettering"],
      ["collaborate", "Collaborate", "Assignments, handoffs and versions"],
      ["review", "Review", "Change requests and approved revisions"],
      ["publish", "Publish", "Preflight checks and scheduled release"],
    ]);
  return labels.map(([id, label, description], index) => ({
    id,
    label,
    description,
    state: index === 0 ? "current" : "upcoming",
  }));
}

const HOME_ACTIONS: readonly FrontDoorCard[] = [
  {
    href: "/studio/projects",
    icon: FolderKanban,
    title: { ko: "이어서 작업", en: "Continue working" },
    description: {
      ko: "최근 프로젝트, 공유받은 작업과 복구 가능한 원고를 한곳에서 확인합니다.",
      en: "Open recent projects, shared work and recoverable manuscripts in one place.",
    },
  },
  {
    href: "/studio/new",
    icon: FilePlus2,
    title: { ko: "새로 만들기", en: "Create new" },
    description: {
      ko: "결과물만 고르면 적절한 문서와 작업공간을 자동으로 준비합니다.",
      en: "Choose an outcome and ToonStudio prepares the right document and workspace.",
    },
  },
  {
    href: "/studio/import",
    icon: FileUp,
    title: { ko: "파일 가져오기", en: "Import files" },
    description: {
      ko: "프로젝트, PSD·ORA 이미지, 브러시와 3D 파일을 안전하게 가져옵니다.",
      en: "Bring in projects, PSD/ORA images, brushes and 3D files safely.",
    },
  },
  {
    href: "/studio/assets",
    icon: Boxes,
    title: { ko: "소재", en: "Assets" },
    description: {
      ko: "브러시, 캐릭터, 배경, 글꼴과 오디오를 찾고 제작에 연결합니다.",
      en: "Find brushes, characters, backgrounds, fonts and audio for your project.",
    },
  },
];

const QUICK_STARTS: readonly FrontDoorCard[] = [
  {
    href: "/studio/canvas?preset=illustration",
    icon: Brush,
    title: { ko: "일러스트", en: "Illustration" },
    description: { ko: "빈 캔버스에서 바로 그리기", en: "Start drawing on a ready canvas" },
  },
  {
    href: "/studio/comic?preset=webtoon",
    icon: LayoutGrid,
    title: { ko: "세로 웹툰", en: "Vertical webtoon" },
    description: { ko: "긴 원고와 컷·말풍선으로 시작", en: "Start with a long canvas, panels and balloons" },
  },
  {
    href: "/studio/comic?preset=4cut",
    icon: ImagePlus,
    title: { ko: "4컷·컷툰", en: "Four-panel comic" },
    description: { ko: "컷과 대사를 빠르게 구성", en: "Arrange panels and dialogue quickly" },
  },
  {
    href: "/studio/assets/characters/new",
    icon: UserRoundPen,
    title: { ko: "캐릭터", en: "Character" },
    description: { ko: "표정·포즈·3D 참고 만들기", en: "Build expressions, poses and 3D reference" },
  },
  {
    href: "/studio/assets/brushes/new",
    icon: Palette,
    title: { ko: "새 브러시", en: "New brush" },
    description: { ko: "획을 시험하며 브러시 제작", en: "Design a brush while testing real strokes" },
  },
  {
    href: "/studio/assets/audio",
    icon: Music2,
    title: { ko: "음악·사운드", en: "Music & sound" },
    description: { ko: "장면과 모션에 사용할 오디오", en: "Create audio for scenes and motion" },
  },
];

const WORKFLOW_LINKS: readonly FrontDoorCard[] = [
  {
    href: "/story-lab",
    icon: BookOpen,
    title: { ko: "스토리", en: "Story" },
    description: { ko: "대본·인물·세계관을 원고와 연결", en: "Connect scripts, characters and worldbuilding to the manuscript" },
  },
  {
    href: "/studio/review",
    icon: Users,
    title: { ko: "검토", en: "Review" },
    description: { ko: "댓글·수정 요청·승인을 한 흐름으로", en: "Keep comments, change requests and approval in one flow" },
  },
  {
    href: "/studio/publish",
    icon: Presentation,
    title: { ko: "연재 준비", en: "Publishing" },
    description: { ko: "사용 목적을 고르면 규격·권리·파일을 자동 검사", en: "Choose a destination and check format, rights and files" },
  },
];

const NEW_DOCUMENTS: readonly FrontDoorCard[] = [
  ...QUICK_STARTS.slice(0, 3),
  {
    href: "/studio/canvas?preset=design",
    icon: FileImage,
    title: { ko: "표지·홍보 디자인", en: "Cover & promotion" },
    description: { ko: "작품 에셋을 활용한 표지와 SNS 디자인", en: "Create covers and social designs from project assets" },
  },
  {
    href: "/studio/canvas?preset=presentation",
    icon: Presentation,
    title: { ko: "발표 자료", en: "Presentation" },
    description: { ko: "작품 피칭·설정집·발표 자료", en: "Build pitches, bibles and presentation decks" },
  },
  {
    href: "/story-lab",
    icon: BookOpen,
    title: { ko: "스토리보드", en: "Storyboard" },
    description: { ko: "대본과 콘티에서 원고로 이어가기", en: "Move from script and storyboard into production" },
  },
];

const ASSET_CATEGORIES: readonly FrontDoorCard[] = [
  {
    href: "/studio/assets?view=essentials",
    icon: Boxes,
    title: { ko: "무료 제작 소재 48종", en: "48 free creator essentials" },
    description: { ko: "말풍선·효과·2D 포즈 시트와 3D 데생 인형·소품을 원본 파일로 저장합니다.", en: "Download original balloons, effects, 2D pose sheets, 3D mannequins and props." },
    badge: { ko: "CC0 · 무료", en: "CC0 · Free" },
  },
  {
    href: "/studio/brushes",
    icon: Brush,
    title: { ko: "브러시", en: "Brushes" },
    description: { ko: "전체 브러시를 찾고 최근·즐겨찾기·내 브러시를 관리합니다.", en: "Browse all brushes and manage recent, favorites and personal brushes." },
  },
  {
    href: "/studio/assets/brushes/new",
    icon: Palette,
    title: { ko: "브러시 만들기", en: "Create a brush" },
    description: { ko: "기본 설정부터 자연 매체와 전문 엔진까지 한 편집기에서 조절합니다.", en: "Edit quick settings, natural media and advanced engines in one editor." },
  },
  {
    href: "/studio/assets/characters/new",
    icon: UserRoundPen,
    title: { ko: "캐릭터·포즈", en: "Characters & poses" },
    description: { ko: "캐릭터, 표정, 포즈와 3D 데생 참고를 준비합니다.", en: "Prepare characters, expressions, poses and 3D drawing reference." },
  },
  {
    href: "/studio/bg3d",
    icon: Boxes,
    title: { ko: "3D 장면 연출", en: "3D scene direction" },
    description: { ko: "배경·포즈·구도를 먼저 잡고 선화·톤 가이드로 작화에 적용합니다.", en: "Block backgrounds, poses and composition, then apply line and tone guides to artwork." },
  },
  {
    href: "/studio/assets/audio",
    icon: Music2,
    title: { ko: "음악·효과음", en: "Music & sound effects" },
    description: { ko: "애니매틱·모션·피칭에 사용할 오디오를 제작합니다.", en: "Create audio for animatics, motion and pitches." },
  },
  {
    href: "/market",
    icon: Store,
    title: { ko: "소재 마켓", en: "Asset market" },
    description: { ko: "상업 이용·호환성을 확인하고 새 소재를 찾습니다.", en: "Find assets with clear commercial-use and compatibility information." },
  },
];

/** Render a localized action card for a Studio front-door destination. */
function FrontDoorCardView({ card, locale: _locale }: { readonly card: FrontDoorCard; readonly locale: StudioFrontDoorLocale }) {
  useBilingualI18nRevision();
  const Icon = card.icon;
  return (
    <Link
      href={card.href}
      className="group flex min-h-40 min-w-0 flex-col rounded-2xl border border-line bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-accent/45 hover:bg-raised hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 motion-reduce:transform-none"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-panel text-fg-3 transition-colors group-hover:border-accent/35 group-hover:text-accent">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="mt-4 flex min-w-0 flex-wrap items-start gap-2">
        <strong className="min-w-0 break-words text-sm text-fg">{bi((card.title).ko, (card.title).en)}</strong>
        {card.badge ? (
          <span className="max-w-full break-words rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[0.62rem] font-bold leading-4 text-accent">
            {bi((card.badge).ko, (card.badge).en)}
          </span>
        ) : null}
      </span>
      <span className="mt-1.5 min-w-0 flex-1 break-words text-xs leading-5 text-fg-3">{bi((card.description).ko, (card.description).en)}</span>
      <span className="mt-3 inline-flex min-w-0 items-center gap-1 text-xs font-bold text-accent">
        <span className="break-words">{bi("열기", "Open")}</span>
        <ArrowRight size={13} className="shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
      </span>
    </Link>
  );
}

/** Render the shared localized heading and command-search action for Studio entry pages. */
function PageHeader({
  eyebrow,
  title,
  description,
  locale: _locale,
  action,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly locale: StudioFrontDoorLocale;
  readonly action?: ReactNode;
}) {
  useBilingualI18nRevision();
  return (
    <header className="relative min-w-0 overflow-hidden rounded-3xl border border-line bg-panel/60 p-5 shadow-sm sm:p-8 lg:p-10">
      <div aria-hidden="true" className="absolute -right-24 -top-32 size-80 rounded-full bg-[radial-gradient(circle,_oklch(0.72_0.185_42/0.18),_transparent_70%)]" />
      <div className="relative flex min-w-0 flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          <p className="flex min-w-0 flex-wrap items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">
            <Sparkles size={14} className="shrink-0" aria-hidden="true" /> <span className="break-words">{eyebrow}</span>
          </p>
          <h1 className="mt-3 break-words text-pretty font-display text-[clamp(2rem,6vw,4.2rem)] font-bold leading-[1] tracking-[-0.05em] text-fg">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl break-words text-sm leading-7 text-fg-2 sm:text-base">{description}</p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap gap-2 lg:w-auto lg:shrink-0 lg:justify-end">
          {action ?? (
            <Link href="/studio/new" className={buttonClass({ size: "lg", className: "w-full min-w-0 gap-2 sm:w-auto" })}>
              <FilePlus2 size={17} className="shrink-0" aria-hidden="true" />
              <span className="break-words">{bi("새로 만들기", "Create new")}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/** Render the Studio home with task-first onboarding and workflow shortcuts. */
export function StudioHomePage() {
  useBilingualI18nRevision();
  const language = useI18n((state) => state.lang);
  const locale = studioFrontDoorLocale(language);
  useDocumentTitle(bi("내 작업", "My work"));

  return (
    <Container size="wide" className="min-w-0 py-7 sm:py-10 lg:py-12">
      <PageHeader
        eyebrow="TOONSTUDIO"
        title={bi("기획부터 연재까지, 필요한 다음 행동이 바로 보입니다.", "From planning to publishing, the next useful action stays clear.")}
        description={bi("현재 가진 작업물을 고르면 ToonStudio가 적절한 시작점과 작업공간을 연결합니다. 전문 기능은 필요할 때 펼치고, 저장·복구 상태는 항상 분명하게 보여 줍니다.", "Choose what you already have and ToonStudio connects the right starting point and workspace. Advanced tools appear when needed, while save and recovery status stays explicit.")}
        locale={locale}
      />

      <section className="mt-8 min-w-0" aria-labelledby="studio-starting-point-title">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">{translateCurrentStaticSourceText("domains.creator.studio.shell.StudioFrontDoorPages", "en", "START FROM WHAT YOU HAVE")}</p>
            <h2 id="studio-starting-point-title" className="mt-1 break-words text-2xl font-bold tracking-tight text-fg">
              {bi("지금 무엇을 가지고 있나요?", "What do you have right now?")}
            </h2>
            <p className="mt-1 max-w-3xl break-words text-sm leading-6 text-fg-3">
              {bi("실력 수준이 아니라 현재 재료를 기준으로 가장 짧은 시작 경로를 안내합니다.", "The shortest path is based on your current material, not a beginner or expert label.")}
            </p>
          </div>
          <button
            type="button"
            className={buttonClass({ variant: "outline", size: "sm", className: "w-full min-w-0 gap-1.5 sm:w-auto" })}
            onClick={() => globalThis.dispatchEvent(new CustomEvent("toonspectrum:command-palette:open"))}
          >
            <Search size={15} className="shrink-0" aria-hidden="true" />
            <span className="break-words">{bi("기능·작업 검색", "Search tools and work")}</span>
          </button>
        </div>
        <StudioIntentLauncher
          actions={intentActions(locale)}
          ariaLabel={bi("현재 재료별 시작 경로", "Starting paths by current material")}
          actionLabel={bi("시작", "Start")}
          className="mt-5"
        />
      </section>

      <section className="mt-8 min-w-0" aria-labelledby="studio-production-flow-title">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">{translateCurrentStaticSourceText("domains.creator.studio.shell.StudioFrontDoorPages", "en", "ONE PROJECT FLOW")}</p>
            <h2 id="studio-production-flow-title" className="mt-1 break-words text-2xl font-bold tracking-tight text-fg">
              {bi("한 작품 안에서 끝까지 이어집니다", "Stay in one project from start to finish")}
            </h2>
          </div>
          <WorkflowTrustBadge state="device-saved" locale={locale} compact={false} />
        </div>
        <StudioTaskFlow
          steps={productionFlow(locale)}
          ariaLabel={bi("웹툰 제작 전체 흐름", "Complete webtoon production flow")}
          className="mt-4"
        />
      </section>

      <section className="mt-10 min-w-0" aria-labelledby="studio-home-actions">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">{translateCurrentStaticSourceText("domains.creator.studio.shell.StudioFrontDoorPages", "en", "WORKSPACE")}</p>
          <h2 id="studio-home-actions" className="mt-1 break-words text-2xl font-bold tracking-tight text-fg">
            {bi("내 작업 관리", "Manage my work")}
          </h2>
        </div>
        <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {HOME_ACTIONS.map((card) => <FrontDoorCardView key={card.href} card={card} locale={locale} />)}
        </div>
      </section>

      <section className="mt-12 min-w-0" aria-labelledby="studio-quick-starts">
        <h2 id="studio-quick-starts" className="break-words text-2xl font-bold tracking-tight text-fg">
          {bi("바로 만들기", "Quick start")}
        </h2>
        <p className="mt-1 break-words text-sm text-fg-3">
          {bi("결과물을 고르면 필요한 편집 환경을 바로 엽니다.", "Choose an outcome and open the right editing environment.")}
        </p>
        <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_STARTS.map((card) => <FrontDoorCardView key={card.href} card={card} locale={locale} />)}
        </div>
      </section>

      <section className="mt-12 min-w-0" aria-labelledby="studio-workflow-links">
        <h2 id="studio-workflow-links" className="break-words text-2xl font-bold tracking-tight text-fg">
          {bi("기획·검토·연재 연결", "Connect planning, review and publishing")}
        </h2>
        <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-3">
          {WORKFLOW_LINKS.map((card) => <FrontDoorCardView key={card.href} card={card} locale={locale} />)}
        </div>
      </section>
    </Container>
  );
}

/** Render creation choices that route users to the appropriate Studio workspace. */
export function StudioNewPage() {
  useBilingualI18nRevision();
  const language = useI18n((state) => state.lang);
  const locale = studioFrontDoorLocale(language);
  useDocumentTitle(bi("새로 만들기", "Create new"));
  const steps: readonly StudioTaskFlowStep[] = bi([
      { id: "outcome", label: "결과물 선택", description: "웹툰·일러스트·자료", state: "current" },
      { id: "setup", label: "문서 준비", description: "추천 크기·레이어·색", state: "upcoming" },
      { id: "save", label: "자동 저장 시작", description: "기기 복구 후 클라우드", state: "upcoming" },
    ], [
      { id: "outcome", label: "Choose an outcome", description: "Webtoon, illustration or document", state: "current" },
      { id: "setup", label: "Prepare the document", description: "Recommended size, layers and color", state: "upcoming" },
      { id: "save", label: "Start autosave", description: "Device recovery, then cloud", state: "upcoming" },
    ]);

  return (
    <Container size="wide" className="min-w-0 py-7 sm:py-10 lg:py-12">
      <PageHeader
        eyebrow="CREATE"
        title={bi("만들 결과만 고르세요.", "Choose the result you want.")}
        description={bi("크기·색 공간·레이어 구조는 추천값으로 준비하고, 전문 설정은 필요할 때만 펼칩니다.", "Recommended size, color and layer structure are prepared automatically. Advanced settings stay available when needed.")}
        locale={locale}
        action={
          <Link href="/studio/projects" className={buttonClass({ variant: "outline", size: "lg", className: "w-full min-w-0 gap-2 sm:w-auto" })}>
            <FolderKanban size={17} className="shrink-0" aria-hidden="true" />
            <span className="break-words">{bi("프로젝트 보기", "View projects")}</span>
          </Link>
        }
      />
      <StudioTaskFlow steps={steps} ariaLabel={bi("새 작업 시작 단계", "New work start steps")} className="mt-5" />

      <section className="mt-8 min-w-0" aria-labelledby="studio-new-document-types">
        <h2 id="studio-new-document-types" className="sr-only">
          {bi("새 문서 종류", "New document types")}
        </h2>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NEW_DOCUMENTS.map((card) => <FrontDoorCardView key={card.href} card={card} locale={locale} />)}
        </div>
      </section>

      <RecoverableActionNotice
        tone="info"
        title={bi("기존 파일도 원본을 보존한 채 시작할 수 있습니다", "You can start from an existing file while preserving the original")}
        description={bi("프로젝트, 이미지, 브러시와 3D 파일을 먼저 분석하고 편집 가능한 범위와 변환 내용을 적용 전에 보여 줍니다.", "Projects, images, brushes and 3D files are analyzed first so editable coverage and conversions are visible before changes are applied.")}
        action={
          <Link href="/studio/import" className={buttonClass({ className: "w-full min-w-0 gap-2 sm:w-auto" })}>
            <FileUp size={16} className="shrink-0" aria-hidden="true" />
            <span className="break-words">{bi("파일 가져오기", "Import files")}</span>
          </Link>
        }
        className="mt-8"
      />
    </Container>
  );
}

/** Render supported import workflows for projects, media, brushes, and 3D assets. */
export function StudioImportPage() {
  useBilingualI18nRevision();
  const language = useI18n((state) => state.lang);
  const locale = studioFrontDoorLocale(language);
  useDocumentTitle(bi("파일 가져오기", "Import files"));
  const steps: readonly StudioTaskFlowStep[] = bi([
      { id: "choose", label: "파일 선택", description: "원본은 변경하지 않음", state: "current" },
      { id: "analyze", label: "호환성 분석", description: "보존·변환·래스터화 구분", state: "upcoming" },
      { id: "confirm", label: "가져오기 확인", description: "손실 항목 확인 후 적용", state: "upcoming" },
    ], [
      { id: "choose", label: "Choose files", description: "Originals remain unchanged", state: "current" },
      { id: "analyze", label: "Analyze compatibility", description: "Preserved, converted or rasterized", state: "upcoming" },
      { id: "confirm", label: "Confirm import", description: "Apply after reviewing losses", state: "upcoming" },
    ]);

  return (
    <Container size="wide" className="min-w-0 py-7 sm:py-10 lg:py-12">
      <PageHeader
        eyebrow="IMPORT"
        title={bi("파일 종류를 몰라도 괜찮아요.", "You do not need to know the file type.")}
        description={bi("가져올 대상을 고르면 기존 편집기와 에셋 도구로 연결하고, 손실 가능성이 있는 항목은 적용 전에 알려 줍니다.", "Choose what you are importing. ToonStudio opens the right editor and reports possible losses before applying changes.")}
        locale={locale}
      />
      <StudioTaskFlow steps={steps} ariaLabel={bi("파일 가져오기 단계", "File import steps")} className="mt-5" />

      <div className="mt-8 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            href: "/studio/canvas",
            icon: FileImage,
            title: bi("프로젝트·이미지", "Projects & images"),
            body: bi("Studio 프로젝트, PSD, ORA, CBZ와 일반 이미지를 편집기에서 가져옵니다.", "Import Studio projects, PSD, ORA, CBZ and standard images in the editor."),
          },
          {
            href: "/studio/brushes",
            icon: Brush,
            title: bi("브러시", "Brushes"),
            body: bi("ToonStudio 브러시와 ABR·MYB·KPP 파일을 내 브러시에 추가합니다.", "Add ToonStudio, ABR, MYB and KPP files to your brushes."),
          },
          {
            href: "/studio/bg3d",
            icon: Boxes,
            title: bi("3D 모델", "3D models"),
            body: bi("GLB·glTF·VRM과 지원되는 3D 파일을 배경·포즈 작업에 연결합니다.", "Connect GLB, glTF, VRM and supported 3D files to backgrounds and poses."),
          },
          {
            href: "/studio/assets/audio",
            icon: Music2,
            title: bi("오디오", "Audio"),
            body: bi("음악·효과음·음성을 애니매틱과 모션 작업에 추가합니다.", "Add music, sound effects and voice to animatics and motion work."),
          },
        ].map(({ href, icon: Icon, title, body }) => (
          <Link key={href} href={href} className="group min-w-0 rounded-2xl border border-line bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-accent/45 hover:bg-raised motion-reduce:transform-none">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={20} aria-hidden="true" /></span>
            <strong className="mt-4 block break-words text-sm text-fg">{title}</strong>
            <span className="mt-1.5 block break-words text-xs leading-5 text-fg-3">{body}</span>
            <span className="mt-4 inline-flex min-w-0 items-center gap-1 text-xs font-bold text-accent"><span className="break-words">{bi("계속", "Continue")}</span><ArrowRight size={13} className="shrink-0" aria-hidden="true" /></span>
          </Link>
        ))}
      </div>

      <RecoverableActionNotice
        tone="warning"
        title={bi("지원하지 않는 객체는 몰래 평탄화하지 않습니다", "Unsupported objects are never flattened silently")}
        description={bi("가져오기 전에 완전 보존, 편집 가능한 변환, 래스터 변환과 제외 항목을 나눠 보여 주고 원본 파일을 별도로 보관합니다.", "Before import, ToonStudio separates fully preserved, editable conversion, rasterization and excluded items while keeping the original file separately.")}
        className="mt-6"
      />
    </Container>
  );
}

/** Render the Studio asset hub and its canonical category destinations. */
export function StudioAssetsPage() {
  useBilingualI18nRevision();
  const language = useI18n((state) => state.lang);
  const locale = studioFrontDoorLocale(language);
  useDocumentTitle(bi("소재", "Materials"));
  const steps: readonly StudioTaskFlowStep[] = bi([
      { id: "find", label: "소재 찾기", description: "목적·장르·호환성 검색", state: "current" },
      { id: "rights", label: "권리 확인", description: "상업 이용·수정·크레딧", state: "upcoming" },
      { id: "insert", label: "프로젝트에 추가", description: "현재 컷 또는 팀 소재", state: "upcoming" },
      { id: "track", label: "사용 위치 기록", description: "회차·컷·게시본 추적", state: "upcoming" },
    ], [
      { id: "find", label: "Find materials", description: "Search by purpose, genre and compatibility", state: "current" },
      { id: "rights", label: "Check rights", description: "Commercial use, editing and credit", state: "upcoming" },
      { id: "insert", label: "Add to project", description: "Current panel or team library", state: "upcoming" },
      { id: "track", label: "Track usage", description: "Episode, panel and release records", state: "upcoming" },
    ]);

  return (
    <Container size="wide" className="min-w-0 py-7 sm:py-10 lg:py-12">
      <PageHeader
        eyebrow="MATERIALS"
        title={bi("찾기부터 제작·설치·사용까지 한곳에서.", "Discover, create, install and use materials in one place.")}
        description={bi("브러시·캐릭터·3D·오디오를 각각 다른 제품처럼 찾지 않고, 현재 프로젝트에 필요한 소재로 연결합니다.", "Use brushes, characters, 3D and audio as project materials instead of separate products.")}
        locale={locale}
        action={
          <Link href="/studio/assets?view=market" className={buttonClass({ size: "lg", className: "w-full min-w-0 gap-2 sm:w-auto" })}>
            <Store size={17} className="shrink-0" aria-hidden="true" />
            <span className="break-words">{bi("마켓에서 찾기", "Browse market")}</span>
          </Link>
        }
      />
      <StudioTaskFlow steps={steps} ariaLabel={bi("소재 사용 흐름", "Material usage flow")} className="mt-5" />

      <section className="mt-8 min-w-0" aria-labelledby="studio-asset-categories">
        <h2 id="studio-asset-categories" className="sr-only">{bi("소재 종류", "Material categories")}</h2>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ASSET_CATEGORIES.map((card) => <FrontDoorCardView key={card.href} card={card} locale={locale} />)}
        </div>
      </section>
    </Container>
  );
}
