/**
 * 스튜디오 진입 페이지 모음 중 실제로 라우트가 쓰는 가져오기·소재 페이지만 남긴 파일.
 * 과거 이 파일에 함께 있던 홈(StudioHomePage)과 새 작품(StudioNewPage) 표면은
 * 프로젝트 라이브러리+로비(/studio)와 통합 새 작품 화면(/studio/new)으로 단일화되면서
 * 라우트 연결이 없는 중복 표면이라 2026-10-02에 제거했다. 딥링크는 두 표면 모두
 * 원래 라우트에 연결된 적이 없어 영향이 없다.
 */
import { getActiveI18nLocale, translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { ArrowRight, Boxes, Brush, FileImage, FilePlus2, Music2, Palette, Sparkles, Store, UserRoundPen, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { Container } from "@/shared/components/section";
import { TypographicCover } from "@/shared/components/typographic-cover";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";

import {
  CREATOR_ESSENTIALS,
  ESSENTIALS_KINDS,
  ESSENTIALS_LABELS,
  essentialsFormat,
  type CreatorEssential,
} from "./creator-essentials/creator-essentials-catalog";
import { RecoverableActionNotice, StudioTaskFlow, type StudioTaskFlowStep } from "./StudioTaskFlow";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioFrontDoorPages", ko, en);

type StudioFrontDoorLocale = "ko" | "en";
type StudioFrontDoorAuthoredLocale = "ko" | "en";

const FRONT_DOOR_ART: Readonly<Record<string, string>> = {
  "/studio/assets?view=essentials": "canvas-noir",
  "/studio/brushes": "project-crimson",
  "/studio/assets/brushes/new": "canvas-noir",
  "/studio/assets/characters/new": "character-pink",
  "/studio/bg3d": "background-city",
  "/studio/assets/audio": "character-blue",
  "/market": "project-romance",
};

type FrontDoorCard = Readonly<{
  href: string;
  icon: LucideIcon;
  title: Readonly<Record<StudioFrontDoorAuthoredLocale, string>>;
  description: Readonly<Record<StudioFrontDoorAuthoredLocale, string>>;
  badge?: Readonly<Record<StudioFrontDoorAuthoredLocale, string>>;
}>;

/** Normalize an application language tag to a supported Studio front-door locale. */
function studioFrontDoorLocale(_language: string): StudioFrontDoorLocale {
  return getActiveI18nLocale() === "ko" ? "ko" : "en";
}

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
    title: { ko: "장면 도우미", en: "Scene assistant" },
    description: { ko: "장소·인물·소품을 고르고 구도와 작화 스타일을 정해 현재 컷에 적용합니다.", en: "Choose a place, character or prop, frame the shot, and apply it to the current panel." },
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

/**
 * 소재 홈 전용 카테고리 타일 — D-1(리소스 카드)과 같은 문법으로, 아트가 카드 상단을
 * 4:3 풀블리드로 채우고 배지는 아트 하단 스크림 위에 얹는다. 아트 배정이 없는
 * 카테고리는 타이포그래픽 커버로 대체해 빈 칸처럼 보이지 않게 한다.
 * (홈·새로 만들기 표면이 쓰던 공용 카드는 그 표면들과 함께 제거됐다.)
 */
function AssetCategoryTile({ card, locale: _locale }: { readonly card: FrontDoorCard; readonly locale: StudioFrontDoorLocale }) {
  useBilingualI18nRevision();
  const Icon = card.icon;
  const art = FRONT_DOOR_ART[card.href];
  const title = bi((card.title).ko, (card.title).en);
  return (
    <Link
      href={card.href}
      className="group flex min-w-0 flex-col overflow-hidden rounded-3xl border border-line bg-card transition-all hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 motion-reduce:transform-none"
    >
      <span className="relative block aspect-[4/3] overflow-hidden bg-panel">
        {art ? (
          <img
            src={`/brand/illustrated-20260928/${art}.webp`}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover object-[center_35%] transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transform-none"
          />
        ) : (
          <TypographicCover title={title} seed={card.href} className="absolute inset-0" />
        )}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/45 to-transparent" />
        {card.badge ? (
          <span className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] break-words rounded-full bg-black/45 px-2 py-0.5 text-[0.62rem] font-bold leading-4 text-white backdrop-blur-sm">
            {bi((card.badge).ko, (card.badge).en)}
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-panel text-fg-3 transition-colors group-hover:border-accent/35 group-hover:text-accent">
            <Icon size={17} aria-hidden="true" />
          </span>
          <strong className="min-w-0 break-words text-[0.95rem] leading-snug text-fg">{title}</strong>
        </span>
        <span className="mt-2.5 min-w-0 flex-1 break-words text-xs leading-5 text-fg-3">{bi((card.description).ko, (card.description).en)}</span>
        <span className="mt-3 inline-flex min-w-0 items-center gap-1 text-xs font-bold text-accent">
          <span className="break-words">{bi("열기", "Open")}</span>
          <ArrowRight size={13} className="shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}

/** 종류별로 두 점씩 고른 무료 소재 미리보기 — 실제 카탈로그의 preview 이미지를 그대로 쓴다. */
const ESSENTIALS_PREVIEW: readonly CreatorEssential[] = ESSENTIALS_KINDS.flatMap((kind) =>
  CREATOR_ESSENTIALS.filter((asset) => asset.kind === kind).slice(0, 2),
);

/** 소재 홈에서 실제 무료 소재를 그림으로 먼저 보여 주는 스트립. 전체 목록은 essentials 뷰가 맡는다. */
function AssetEssentialsPreview({ locale: _locale }: { readonly locale: StudioFrontDoorLocale }) {
  useBilingualI18nRevision();
  return (
    <section className="mt-10 min-w-0" aria-labelledby="studio-asset-essentials-preview">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="studio-asset-essentials-preview" className="break-words text-lg font-black text-fg">
            {bi("무료 소재, 먼저 그림으로 보기", "Free essentials, pictures first")}
          </h2>
          <p className="mt-1 break-words text-sm leading-6 text-fg-3">
            {bi("전부 CC0예요. 저장해 두면 캔버스와 3D 장면에서 바로 꺼내 쓸 수 있어요.", "All CC0. Save one and it is ready to use on the canvas and in 3D scenes.")}
          </p>
        </div>
        <Link
          href="/studio/assets?view=essentials"
          className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-bold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          <span className="break-words">{bi(`${CREATOR_ESSENTIALS.length}종 전체 보기`, `Browse all ${CREATOR_ESSENTIALS.length}`)}</span>
          <ArrowRight size={15} className="shrink-0" aria-hidden="true" />
        </Link>
      </div>
      <ul className="mt-4 grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4">
        {ESSENTIALS_PREVIEW.map((asset) => (
          <li key={asset.id} className="min-w-0">
            <Link
              href="/studio/assets?view=essentials"
              className="group block min-w-0 overflow-hidden rounded-2xl border border-line bg-card transition-all hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 motion-reduce:transform-none"
            >
              <span className="relative block aspect-[4/3] bg-panel">
                <img
                  src={asset.preview}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-contain p-3"
                />
                <span className="absolute right-2.5 top-2.5 rounded-full border border-line bg-card/90 px-1.5 py-0.5 text-[0.6rem] font-black tracking-wide text-fg-2">
                  {essentialsFormat(asset)}
                </span>
              </span>
              <span className="block min-w-0 p-3">
                <span className="block break-words text-xs font-bold leading-5 text-fg">{bi((asset.label).ko, (asset.label).en)}</span>
                <span className="mt-0.5 block break-words text-[0.68rem] leading-4 text-fg-3">{bi(ESSENTIALS_LABELS[asset.kind].ko, ESSENTIALS_LABELS[asset.kind].en)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Render the shared localized heading and command-search action for Studio entry pages. */
function PageHeader({
  eyebrow,
  title,
  description,
  locale: _locale,
  action,
  crumbs,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly locale: StudioFrontDoorLocale;
  readonly action?: ReactNode;
  readonly crumbs?: readonly { readonly label: string; readonly href?: string }[];
}) {
  useBilingualI18nRevision();
  return (
    <header className="relative min-w-0 overflow-hidden rounded-3xl border border-line bg-panel/60 p-5 shadow-sm sm:p-8 lg:p-10">
      <div aria-hidden="true" className="absolute -right-24 -top-32 size-80 rounded-full bg-[radial-gradient(circle,_oklch(0.72_0.185_42/0.18),_transparent_70%)]" />
      {crumbs && crumbs.length > 0 ? (
        <nav aria-label={bi("현재 위치", "Current location")} className="relative mb-6 flex min-w-0 flex-wrap items-center gap-2 text-xs text-fg-3">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <span key={crumb.label} className="flex min-w-0 items-center gap-2">
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {crumb.href && !last ? (
                  <Link href={crumb.href} className="shrink-0 font-semibold hover:text-accent">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className="min-w-0 truncate font-semibold text-fg-2">
                    {crumb.label}
                  </span>
                )}
              </span>
            );
          })}
        </nav>
      ) : null}
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
        crumbs={[
          { label: bi("내 작업", "My work"), href: "/studio" },
          { label: bi("파일 가져오기", "Import files") },
        ]}
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
        crumbs={[
          { label: bi("내 작업", "My work"), href: "/studio" },
          { label: bi("소재", "Materials") },
        ]}
        action={
          <Link href="/studio/assets?view=market" className={buttonClass({ size: "lg", className: "w-full min-w-0 gap-2 sm:w-auto" })}>
            <Store size={17} className="shrink-0" aria-hidden="true" />
            <span className="break-words">{bi("마켓에서 찾기", "Browse market")}</span>
          </Link>
        }
      />
      <section className="mt-8 min-w-0" aria-labelledby="studio-asset-categories">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="studio-asset-categories" className="break-words text-lg font-black text-fg">{bi("소재 종류", "Material categories")}</h2>
            <p className="mt-1 break-words text-sm leading-6 text-fg-3">
              {bi("그림으로 골라 들어가세요. 종류마다 찾는 법과 넣는 법이 같습니다.", "Pick by picture — every category works the same way once you are in.")}
            </p>
          </div>
        </div>
        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ASSET_CATEGORIES.map((card) => <AssetCategoryTile key={card.href} card={card} locale={locale} />)}
        </div>
      </section>

      <AssetEssentialsPreview locale={locale} />

      <StudioTaskFlow steps={steps} ariaLabel={bi("소재 사용 흐름", "Material usage flow")} className="mt-10" />
    </Container>
  );
}
