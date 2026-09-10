import {
  ArrowRight,
  BookOpen,
  Boxes,
  Brush,
  FileImage,
  FilePlus2,
  FileUp,
  FolderKanban,
  ImagePlus,
  LayoutGrid,
  Music2,
  Palette,
  Presentation,
  Search,
  Sparkles,
  Store,
  UserRoundPen,
  Users,
} from "lucide-react";

import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";

import type { LucideIcon } from "lucide-react";

type StudioFrontDoorLocale = "ko" | "en";

type FrontDoorCard = Readonly<{
  href: string;
  icon: LucideIcon;
  title: Readonly<Record<StudioFrontDoorLocale, string>>;
  description: Readonly<Record<StudioFrontDoorLocale, string>>;
  badge?: Readonly<Record<StudioFrontDoorLocale, string>>;
}>;

function studioFrontDoorLocale(language: string): StudioFrontDoorLocale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
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
    title: { ko: "에셋", en: "Assets" },
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
    title: { ko: "내보내기", en: "Export" },
    description: { ko: "사용 목적을 고르면 규격과 파일을 자동 준비", en: "Choose a destination and prepare the right files automatically" },
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
    title: { ko: "3D 배경·소품", en: "3D backgrounds & props" },
    description: { ko: "카메라·조명·선화 출력까지 웹툰 배경 작업을 연결합니다.", en: "Connect cameras, lighting and line-art output for webtoon backgrounds." },
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
    title: { ko: "에셋 마켓", en: "Asset market" },
    description: { ko: "상업 이용·호환성을 확인하고 새 에셋을 찾습니다.", en: "Find assets with clear commercial-use and compatibility information." },
  },
];

function FrontDoorCardView({ card, locale }: { readonly card: FrontDoorCard; readonly locale: StudioFrontDoorLocale }) {
  const Icon = card.icon;
  return (
    <Link
      href={card.href}
      className="group flex min-h-40 flex-col rounded-2xl border border-line bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-accent/45 hover:bg-raised hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
    >
      <span className="grid size-10 place-items-center rounded-xl border border-line bg-panel text-fg-3 transition-colors group-hover:border-accent/35 group-hover:text-accent">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="mt-4 flex items-center gap-2">
        <strong className="text-sm text-fg">{card.title[locale]}</strong>
        {card.badge ? (
          <span className="rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[0.62rem] font-bold text-accent">
            {card.badge[locale]}
          </span>
        ) : null}
      </span>
      <span className="mt-1.5 flex-1 text-xs leading-5 text-fg-3">{card.description[locale]}</span>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">
        {locale === "ko" ? "열기" : "Open"}
        <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
      </span>
    </Link>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  locale,
  action,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly locale: StudioFrontDoorLocale;
  readonly action?: React.ReactNode;
}) {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-line bg-panel/60 p-5 shadow-sm sm:p-8 lg:p-10">
      <div aria-hidden="true" className="absolute -right-24 -top-32 size-80 rounded-full bg-[radial-gradient(circle,_oklch(0.72_0.185_42/0.18),_transparent_70%)]" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">
            <Sparkles size={14} aria-hidden="true" /> {eyebrow}
          </p>
          <h1 className="mt-3 text-pretty font-display text-[clamp(2rem,6vw,4.2rem)] font-bold leading-[1] tracking-[-0.05em] text-fg">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-fg-2 sm:text-base">{description}</p>
        </div>
        {action ?? (
          <Link href="/studio/new" className={buttonClass({ size: "lg", className: "gap-2" })}>
            <FilePlus2 size={17} aria-hidden="true" />
            {locale === "ko" ? "새로 만들기" : "Create new"}
          </Link>
        )}
      </div>
    </header>
  );
}

export function StudioHomePage() {
  const language = useI18n((state) => state.lang);
  const locale = studioFrontDoorLocale(language);
  useDocumentTitle(locale === "ko" ? "내 작업" : "My work");

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <PageHeader
        eyebrow="TOONSTUDIO"
        title={locale === "ko" ? "작업은 한곳에서, 기능은 필요한 순간에." : "One place for the work. The right tools when you need them."}
        description={locale === "ko"
          ? "무엇을 만들지만 고르세요. 저장·복구·작업공간과 전문 기능은 ToonStudio가 자연스럽게 연결합니다."
          : "Choose what you want to make. ToonStudio connects saving, recovery, workspaces and professional tools for you."}
        locale={locale}
      />

      <section className="mt-8" aria-labelledby="studio-home-actions">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">START</p>
            <h2 id="studio-home-actions" className="mt-1 text-2xl font-bold tracking-tight text-fg">
              {locale === "ko" ? "어디서 시작할까요?" : "Where should we start?"}
            </h2>
          </div>
          <button
            type="button"
            className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
            onClick={() => globalThis.dispatchEvent(new CustomEvent("toonspectrum:command-palette:open"))}
          >
            <Search size={15} aria-hidden="true" />
            {locale === "ko" ? "기능 검색" : "Search commands"}
          </button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {HOME_ACTIONS.map((card) => <FrontDoorCardView key={card.href} card={card} locale={locale} />)}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="studio-quick-starts">
        <h2 id="studio-quick-starts" className="text-2xl font-bold tracking-tight text-fg">
          {locale === "ko" ? "바로 만들기" : "Quick start"}
        </h2>
        <p className="mt-1 text-sm text-fg-3">
          {locale === "ko" ? "결과물을 고르면 필요한 편집 환경을 바로 엽니다." : "Choose an outcome and open the right editing environment."}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_STARTS.map((card) => <FrontDoorCardView key={card.href} card={card} locale={locale} />)}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="studio-workflow-links">
        <h2 id="studio-workflow-links" className="text-2xl font-bold tracking-tight text-fg">
          {locale === "ko" ? "한 프로젝트에서 끝까지" : "Finish in one project"}
        </h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {WORKFLOW_LINKS.map((card) => <FrontDoorCardView key={card.href} card={card} locale={locale} />)}
        </div>
      </section>
    </Container>
  );
}

export function StudioNewPage() {
  const language = useI18n((state) => state.lang);
  const locale = studioFrontDoorLocale(language);
  useDocumentTitle(locale === "ko" ? "새로 만들기" : "Create new");

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <PageHeader
        eyebrow="CREATE"
        title={locale === "ko" ? "만들 결과만 고르세요." : "Choose the result you want."}
        description={locale === "ko"
          ? "크기·색 공간·레이어 구조는 추천값으로 준비하고, 전문 설정은 필요할 때만 펼칩니다."
          : "Recommended size, color and layer structure are prepared automatically. Advanced settings stay available when needed."}
        locale={locale}
        action={
          <Link href="/studio/projects" className={buttonClass({ variant: "outline", size: "lg", className: "gap-2" })}>
            <FolderKanban size={17} aria-hidden="true" />
            {locale === "ko" ? "프로젝트 보기" : "View projects"}
          </Link>
        }
      />

      <section className="mt-8" aria-labelledby="studio-new-document-types">
        <h2 id="studio-new-document-types" className="sr-only">
          {locale === "ko" ? "새 문서 종류" : "New document types"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NEW_DOCUMENTS.map((card) => <FrontDoorCardView key={card.href} card={card} locale={locale} />)}
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-line bg-panel/50 p-5">
        <h2 className="text-base font-bold text-fg">{locale === "ko" ? "기존 파일로 시작" : "Start from an existing file"}</h2>
        <p className="mt-1 text-sm leading-6 text-fg-3">
          {locale === "ko"
            ? "프로젝트, 이미지, 브러시와 3D 파일을 분석해 편집 가능한 범위와 변환 내용을 먼저 보여 줍니다."
            : "Analyze projects, images, brushes and 3D files before showing what remains editable and what will be converted."}
        </p>
        <Link href="/studio/import" className={buttonClass({ className: "mt-4 gap-2" })}>
          <FileUp size={16} aria-hidden="true" />
          {locale === "ko" ? "파일 가져오기" : "Import files"}
        </Link>
      </section>
    </Container>
  );
}

export function StudioImportPage() {
  const language = useI18n((state) => state.lang);
  const locale = studioFrontDoorLocale(language);
  useDocumentTitle(locale === "ko" ? "파일 가져오기" : "Import files");

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <PageHeader
        eyebrow="IMPORT"
        title={locale === "ko" ? "파일 종류를 몰라도 괜찮아요." : "You do not need to know the file type."}
        description={locale === "ko"
          ? "가져올 대상을 고르면 기존 편집기와 에셋 도구로 연결하고, 손실 가능성이 있는 항목은 적용 전에 알려 줍니다."
          : "Choose what you are importing. ToonStudio opens the right editor and reports possible losses before applying changes."}
        locale={locale}
      />

      <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            href: "/studio/canvas",
            icon: FileImage,
            title: locale === "ko" ? "프로젝트·이미지" : "Projects & images",
            body: locale === "ko" ? "Studio 프로젝트, PSD, ORA, CBZ와 일반 이미지를 편집기에서 가져옵니다." : "Import Studio projects, PSD, ORA, CBZ and standard images in the editor.",
          },
          {
            href: "/studio/brushes",
            icon: Brush,
            title: locale === "ko" ? "브러시" : "Brushes",
            body: locale === "ko" ? "ToonStudio 브러시와 ABR·MYB·KPP 파일을 내 브러시에 추가합니다." : "Add ToonStudio, ABR, MYB and KPP files to your brushes.",
          },
          {
            href: "/studio/bg3d",
            icon: Boxes,
            title: locale === "ko" ? "3D 모델" : "3D models",
            body: locale === "ko" ? "GLB·glTF·VRM과 지원되는 3D 파일을 배경·포즈 작업에 연결합니다." : "Connect GLB, glTF, VRM and supported 3D files to backgrounds and poses.",
          },
          {
            href: "/studio/assets/audio",
            icon: Music2,
            title: locale === "ko" ? "오디오" : "Audio",
            body: locale === "ko" ? "음악·효과음·음성을 애니매틱과 모션 작업에 추가합니다." : "Add music, sound effects and voice to animatics and motion work.",
          },
        ].map(({ href, icon: Icon, title, body }) => (
          <Link key={href} href={href} className="group rounded-2xl border border-line bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-accent/45 hover:bg-raised">
            <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={20} aria-hidden="true" /></span>
            <strong className="mt-4 block text-sm text-fg">{title}</strong>
            <span className="mt-1.5 block text-xs leading-5 text-fg-3">{body}</span>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-accent">{locale === "ko" ? "계속" : "Continue"}<ArrowRight size={13} aria-hidden="true" /></span>
          </Link>
        ))}
      </div>
    </Container>
  );
}

export function StudioAssetsPage() {
  const language = useI18n((state) => state.lang);
  const locale = studioFrontDoorLocale(language);
  useDocumentTitle(locale === "ko" ? "에셋" : "Assets");

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <PageHeader
        eyebrow="ASSETS"
        title={locale === "ko" ? "찾기부터 제작·설치·사용까지 한곳에서." : "Discover, create, install and use assets in one place."}
        description={locale === "ko"
          ? "브러시·캐릭터·3D·오디오를 각각 다른 제품처럼 찾지 않고, 현재 프로젝트에 필요한 자산으로 연결합니다."
          : "Use brushes, characters, 3D and audio as project assets instead of separate products."}
        locale={locale}
        action={
          <Link href="/market" className={buttonClass({ size: "lg", className: "gap-2" })}>
            <Store size={17} aria-hidden="true" />
            {locale === "ko" ? "마켓에서 찾기" : "Browse market"}
          </Link>
        }
      />

      <section className="mt-8" aria-labelledby="studio-asset-categories">
        <h2 id="studio-asset-categories" className="sr-only">{locale === "ko" ? "에셋 종류" : "Asset categories"}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ASSET_CATEGORIES.map((card) => <FrontDoorCardView key={card.href} card={card} locale={locale} />)}
        </div>
      </section>
    </Container>
  );
}
