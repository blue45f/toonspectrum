import {
  ArrowRight,
  BookOpen,
  Boxes,
  Brush,
  CheckCircle2,
  ClipboardCheck,
  FileOutput,
  FolderKanban,
  ImagePlus,
  LayoutDashboard,
  LayoutGrid,
  MessageSquareCheck,
  MoreHorizontal,
  Palette,
  Presentation,
  Settings,
  Sparkles,
  Users,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useParams } from "react-router-dom";

import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { STUDIO_PROJECT_NAVIGATION } from "../studio-product-ia";
import { StudioProjectDiagnosticsBridge } from "./StudioProjectDiagnosticsBridge";
import { StudioProjectReadinessPanel } from "./StudioProjectReadinessPanel";

export type StudioProjectSection =
  | "overview"
  | "story"
  | "production"
  | "assets"
  | "review"
  | "export"
  | "settings";

type Locale = "ko" | "en";

type ProjectAction = Readonly<{
  title: Record<Locale, string>;
  description: Record<Locale, string>;
  href: (projectId: string) => string;
  icon: LucideIcon;
  badge?: Record<Locale, string>;
}>;

interface SectionDefinition {
  label: Record<Locale, string>;
  eyebrow: string;
  title: Record<Locale, string>;
  description: Record<Locale, string>;
  icon: LucideIcon;
  actions: readonly ProjectAction[];
}

const action = (
  icon: LucideIcon,
  koTitle: string,
  enTitle: string,
  koDescription: string,
  enDescription: string,
  href: (projectId: string) => string,
  badge?: Record<Locale, string>,
): ProjectAction => ({
  icon,
  title: { ko: koTitle, en: enTitle },
  description: { ko: koDescription, en: enDescription },
  href,
  ...(badge ? { badge } : {}),
});

function workHref(projectId: string, surface = "canvas"): string {
  return `/studio/work/${encodeURIComponent(projectId)}/${surface}`;
}

function projectViewHref(projectId: string, section: StudioProjectSection, view: string): string {
  return `/studio/p/${encodeURIComponent(projectId)}/${section}?view=${encodeURIComponent(view)}`;
}

const SECTION_DEFINITIONS: Readonly<Record<StudioProjectSection, SectionDefinition>> = {
  overview: {
    label: { ko: "개요", en: "Overview" },
    eyebrow: "PROJECT OVERVIEW",
    title: { ko: "다음 작업을 바로 이어가세요.", en: "Continue with the next useful task." },
    description: {
      ko: "진행 상황, 최근 문서, 검토 요청과 출력 준비를 한 화면에서 확인합니다.",
      en: "See progress, recent documents, review requests and export readiness in one place.",
    },
    icon: LayoutDashboard,
    actions: [
      action(Brush, "원고 이어서 작업", "Continue manuscript", "최근 캔버스와 도구 상태에서 바로 시작합니다.", "Open the latest canvas with recent tools and view restored.", (id) => workHref(id)),
      action(BookOpen, "스토리 정리", "Open story", "대본·캐릭터·세계관과 참고자료를 확인합니다.", "Review scripts, characters, worldbuilding and references.", (id) => `/studio/p/${encodeURIComponent(id)}/story`),
      action(MessageSquareCheck, "검토할 내용", "Review work", "댓글·수정 요청·승인 대기를 한 흐름으로 봅니다.", "See comments, change requests and approvals in one flow.", (id) => `/studio/p/${encodeURIComponent(id)}/review`),
      action(FileOutput, "내보내기 준비", "Prepare export", "플랫폼 규격과 사용 권리를 확인한 뒤 파일을 만듭니다.", "Check platform rules and usage rights before creating files.", (id) => `/studio/p/${encodeURIComponent(id)}/export`),
    ],
  },
  story: {
    label: { ko: "스토리", en: "Story" },
    eyebrow: "STORY",
    title: { ko: "대본과 설정을 원고에 연결하세요.", en: "Connect scripts and story data to the manuscript." },
    description: {
      ko: "에피소드·대본·캐릭터·세계관·참고자료를 흩어진 연구실 없이 한 프로젝트에서 관리합니다.",
      en: "Manage episodes, scripts, characters, worldbuilding and references without separate labs.",
    },
    icon: BookOpen,
    actions: [
      action(BookOpen, "대본·에피소드", "Scripts & episodes", "장면과 대사를 구조화하고 원고 말풍선과 연결합니다.", "Structure scenes and dialogue, then connect them to manuscript balloons.", (id) => projectViewHref(id, "story", "script")),
      action(Users, "캐릭터·관계", "Characters & relations", "말투·외형·관계·등장 이력을 작품 기준으로 정리합니다.", "Organize voice, appearance, relationships and appearances as project data.", (id) => projectViewHref(id, "story", "characters")),
      action(Sparkles, "세계관·연속성", "World & continuity", "설정 충돌과 장면 간 불일치를 근거와 함께 확인합니다.", "Review continuity and story conflicts with supporting references.", (id) => projectViewHref(id, "story", "continuity")),
      action(ImagePlus, "참고자료", "References", "출처와 사용 조건을 유지하며 자료를 모읍니다.", "Collect references while preserving source and usage information.", (id) => projectViewHref(id, "story", "references")),
    ],
  },
  production: {
    label: { ko: "제작", en: "Production" },
    eyebrow: "PRODUCTION",
    title: { ko: "같은 문서에서 작업공간만 바꾸세요.", en: "Switch workspaces without reopening the document." },
    description: {
      ko: "드로잉·웹툰·애니메이션·3D는 별도 제품이 아니라 같은 원고를 보는 전문 작업공간입니다.",
      en: "Drawing, comics, animation and 3D are professional views of the same document, not separate products.",
    },
    icon: FolderKanban,
    actions: [
      action(Brush, "드로잉", "Drawing", "브러시·레이어·선택·보정으로 원고를 제작합니다.", "Create with brushes, layers, selections and adjustments.", (id) => workHref(id, "canvas")),
      action(LayoutGrid, "웹툰·컷 편집", "Webtoon & panels", "컷·대사·말풍선과 긴 세로 원고를 편집합니다.", "Edit panels, dialogue, balloons and long vertical canvases.", (id) => workHref(id, "comic")),
      action(Presentation, "애니메이션·모션", "Animation & motion", "애니매틱, 키프레임과 장면 타이밍을 만듭니다.", "Create animatics, keyframes and scene timing.", (id) => workHref(id, "animation")),
      action(Boxes, "3D 배경·포즈", "3D backgrounds & poses", "카메라·조명·포즈를 원고의 참고와 선화로 연결합니다.", "Connect cameras, lighting and poses to reference and line-art output.", (id) => workHref(id, "bg3d")),
    ],
  },
  assets: {
    label: { ko: "에셋", en: "Assets" },
    eyebrow: "PROJECT ASSETS",
    title: { ko: "이 프로젝트의 자산을 한곳에서 관리하세요.", en: "Manage every project asset in one place." },
    description: {
      ko: "브러시·이미지·3D·글꼴·오디오와 사용 권리를 문서 사용 위치까지 연결합니다.",
      en: "Connect brushes, images, 3D, fonts, audio and usage rights to every document location.",
    },
    icon: Boxes,
    actions: [
      action(Boxes, "프로젝트 에셋", "Project assets", "현재 프로젝트에 설치·사용된 에셋을 확인합니다.", "Review installed and used assets for this project.", (id) => projectViewHref(id, "assets", "project")),
      action(Brush, "브러시", "Brushes", "전체·내 브러시·팀 브러시를 하나의 라이브러리에서 찾습니다.", "Find built-in, personal and team brushes in one library.", () => "/studio/assets/brushes"),
      action(Palette, "Series Kit", "Series Kit", "작품 로고·색상·글꼴·말풍선·출력 규칙을 재사용합니다.", "Reuse logos, colors, fonts, balloons and export rules.", (id) => projectViewHref(id, "assets", "series-kit")),
      action(WandSparkles, "새 에셋 찾기", "Discover assets", "호환성과 상업 이용 조건을 확인한 뒤 프로젝트에 설치합니다.", "Check compatibility and commercial-use terms before installing.", (id) => `/market?project=${encodeURIComponent(id)}`),
    ],
  },
  review: {
    label: { ko: "검토", en: "Review" },
    eyebrow: "REVIEW",
    title: { ko: "댓글부터 승인까지 한 흐름으로 처리하세요.", en: "Move from comments to approval in one flow." },
    description: {
      ko: "공유·댓글·수정 요청·승인·버전 비교를 서로 다른 페이지에서 찾지 않아도 됩니다.",
      en: "Keep sharing, comments, change requests, approvals and version comparison together.",
    },
    icon: ClipboardCheck,
    actions: [
      action(MessageSquareCheck, "댓글·수정 요청", "Comments & changes", "위치·컷·대사에 연결된 검토 내용을 해결합니다.", "Resolve review notes attached to positions, panels and dialogue.", (id) => projectViewHref(id, "review", "comments")),
      action(CheckCircle2, "승인", "Approvals", "단계별 승인 상태를 확인하고 승인본을 자동 보관합니다.", "Review stage approvals and preserve approved versions automatically.", (id) => projectViewHref(id, "review", "approvals")),
      action(LayoutGrid, "버전 비교", "Version comparison", "두 결과를 좌우·오버레이·변경 영역으로 비교합니다.", "Compare versions side by side, overlaid or by changed areas.", (id) => projectViewHref(id, "review", "compare")),
      action(Users, "공유·외부 검토", "Share & external review", "편집 권한 또는 가벼운 검토 링크를 만듭니다.", "Invite editors or create a lightweight review link.", (id) => projectViewHref(id, "review", "share")),
    ],
  },
  export: {
    label: { ko: "내보내기", en: "Export" },
    eyebrow: "EXPORT",
    title: { ko: "파일 형식보다 사용할 곳을 먼저 고르세요.", en: "Choose where the work will be used, not a file format first." },
    description: {
      ko: "플랫폼·SNS·인쇄·다른 편집기·백업 목적에 맞춰 규격과 파일을 자동으로 준비합니다.",
      en: "Prepare dimensions and files for platforms, social, print, other editors and backup.",
    },
    icon: FileOutput,
    actions: [
      action(LayoutGrid, "웹툰 플랫폼", "Webtoon platforms", "분할·용량·썸네일·글자 가독성을 자동 검사합니다.", "Check slicing, file size, thumbnails and text readability automatically.", (id) => projectViewHref(id, "export", "platforms")),
      action(ImagePlus, "이미지·PDF", "Images & PDF", "SNS 공유와 검토용 이미지·PDF를 만듭니다.", "Create image and PDF packages for sharing and review.", (id) => projectViewHref(id, "export", "image-pdf")),
      action(Presentation, "PPTX·피칭", "PPTX & pitch", "작품 소개와 피칭 자료를 편집 가능한 문서로 내보냅니다.", "Export project introductions and pitches as editable documents.", (id) => projectViewHref(id, "export", "presentation")),
      action(FileOutput, "전체 프로젝트 백업", "Full project backup", "원고·에셋·설정·권리 정보를 포함한 완전한 사본을 만듭니다.", "Create a complete copy with documents, assets, settings and rights data.", (id) => projectViewHref(id, "export", "archive")),
    ],
  },
  settings: {
    label: { ko: "설정", en: "Settings" },
    eyebrow: "PROJECT SETTINGS",
    title: { ko: "작품과 팀의 기본 규칙을 관리하세요.", en: "Manage project and team defaults." },
    description: {
      ko: "이름·템플릿·제작 단계·권한·자동 버전과 기본 출력 목적을 설정합니다.",
      en: "Configure name, templates, production stages, permissions, automatic versions and export defaults.",
    },
    icon: Settings,
    actions: [
      action(Settings, "프로젝트 정보", "Project information", "작품명·설명·대표 이미지와 기본 규격을 관리합니다.", "Manage title, description, cover image and default specifications.", (id) => projectViewHref(id, "settings", "general")),
      action(Users, "팀·권한", "Team & permissions", "역할과 편집·검토·게시 권한을 관리합니다.", "Manage roles and edit, review and publish permissions.", (id) => projectViewHref(id, "settings", "team")),
      action(Sparkles, "자동화", "Automation", "자동 버전·작업 단계·출력 규칙을 설정합니다.", "Configure automatic versions, workflow stages and export rules.", (id) => projectViewHref(id, "settings", "automation")),
      action(MoreHorizontal, "보관·삭제", "Archive & delete", "복구 가능한 상태로 보관하거나 휴지통으로 이동합니다.", "Archive safely or move the project to trash with recovery available.", (id) => projectViewHref(id, "settings", "lifecycle")),
    ],
  },
};

const PRIMARY_SECTIONS = STUDIO_PROJECT_NAVIGATION.map((item) => item.id)
  as readonly Exclude<StudioProjectSection, "settings">[];

function localeFromLanguage(language: string): Locale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

function projectSectionHref(projectId: string, section: StudioProjectSection): string {
  return `/studio/p/${encodeURIComponent(projectId)}/${section}`;
}

export function StudioProjectShellPage({ section }: { readonly section: StudioProjectSection }) {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const definition = SECTION_DEFINITIONS[section];
  const SectionIcon = definition.icon;
  const displayProjectId = useMemo(() => {
    try {
      return decodeURIComponent(projectId);
    } catch {
      return projectId;
    }
  }, [projectId]);

  useDocumentTitle(`${definition.label[locale]} · ToonStudio`);

  if (!projectId) {
    return (
      <Container size="wide" className="py-10">
        <section className="rounded-3xl border border-line bg-card p-6" role="alert">
          <h1 className="text-xl font-bold text-fg">
            {locale === "ko" ? "프로젝트를 찾을 수 없어요." : "Project not found."}
          </h1>
          <p className="mt-2 text-sm text-fg-3">
            {locale === "ko"
              ? "저장된 작업은 변경하지 않았습니다. 내 작업에서 프로젝트를 다시 선택하세요."
              : "No saved work was changed. Choose the project again from My work."}
          </p>
          <Link href="/studio" className={buttonClass({ className: "mt-5" })}>
            {locale === "ko" ? "내 작업으로" : "Go to My work"}
          </Link>
        </section>
      </Container>
    );
  }

  return (
    <Container size="wide" className="py-6 sm:py-8 lg:py-10">
      <header className="rounded-3xl border border-line bg-panel/60 p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/studio" className="text-xs font-semibold text-accent hover:text-accent-2">
              ← {locale === "ko" ? "내 작업" : "My work"}
            </Link>
            <p className="mt-4 text-[0.68rem] font-black uppercase tracking-[0.17em] text-accent">
              {definition.eyebrow}
            </p>
            <h1 className="mt-2 text-pretty text-2xl font-black tracking-tight text-fg sm:text-4xl">
              {definition.title[locale]}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">
              {definition.description[locale]}
            </p>
            <p className="mt-3 text-xs text-fg-3">
              {locale === "ko" ? "프로젝트" : "Project"} · {displayProjectId}
            </p>
          </div>
          <Link href={workHref(projectId)} className={buttonClass({ size: "lg", className: "gap-2" })}>
            <Brush size={17} aria-hidden="true" />
            {locale === "ko" ? "원고 열기" : "Open manuscript"}
          </Link>
        </div>
      </header>

      <nav
        aria-label={locale === "ko" ? "프로젝트 메뉴" : "Project navigation"}
        className="mt-5 overflow-x-auto rounded-2xl border border-line bg-card p-1.5"
      >
        <div className="flex min-w-max gap-1">
          {PRIMARY_SECTIONS.map((id) => {
            const active = id === section;
            return (
              <Link
                key={id}
                href={projectSectionHref(projectId, id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-xl px-3.5 text-sm font-semibold transition-colors",
                  active ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {SECTION_DEFINITIONS[id].label[locale]}
              </Link>
            );
          })}
          <Link
            href={projectSectionHref(projectId, "settings")}
            aria-current={section === "settings" ? "page" : undefined}
            aria-label={locale === "ko" ? "프로젝트 설정" : "Project settings"}
            className={cn(
              "ml-1 inline-flex size-10 items-center justify-center rounded-xl transition-colors",
              section === "settings"
                ? "bg-accent text-on-accent"
                : "text-fg-3 hover:bg-raised hover:text-fg",
            )}
          >
            <Settings size={17} aria-hidden="true" />
          </Link>
        </div>
      </nav>

      <StudioProjectDiagnosticsBridge projectId={displayProjectId} />
      <StudioProjectReadinessPanel
        projectId={displayProjectId}
        locale={locale}
        compact={section !== "overview"}
      />

      <section className="mt-6" aria-labelledby="project-section-actions">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
            <SectionIcon size={19} aria-hidden="true" />
          </span>
          <h2 id="project-section-actions" className="text-xl font-bold text-fg">
            {definition.label[locale]}
          </h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {definition.actions.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.title.ko}
                href={item.href(displayProjectId)}
                className="group flex min-h-44 flex-col rounded-2xl border border-line bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-accent/45 hover:bg-raised hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <span className="grid size-10 place-items-center rounded-xl border border-line bg-panel text-fg-3 transition-colors group-hover:border-accent/35 group-hover:text-accent">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="mt-4 flex items-center gap-2">
                  <strong className="text-sm text-fg">{item.title[locale]}</strong>
                  {item.badge ? (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.62rem] font-bold text-accent">
                      {item.badge[locale]}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1.5 flex-1 text-xs leading-5 text-fg-3">
                  {item.description[locale]}
                </span>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">
                  {locale === "ko" ? "열기" : "Open"}
                  <ArrowRight
                    size={13}
                    className="transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-panel/50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <strong className="text-sm text-fg">
              {locale === "ko" ? "기능 이름을 몰라도 괜찮아요." : "You do not need to know feature names."}
            </strong>
            <p className="mt-1 text-xs leading-5 text-fg-3">
              {locale === "ko"
                ? "⌘K 검색이나 도우미에서 하려는 일을 입력하면 현재 프로젝트에 맞는 기능을 찾습니다."
                : "Use command search or the assistant to find the right action for this project."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => globalThis.dispatchEvent(new CustomEvent("toonspectrum:command-palette:open"))}
            className={buttonClass({ variant: "outline", className: "shrink-0 gap-2" })}
          >
            <WandSparkles size={16} aria-hidden="true" />
            {locale === "ko" ? "기능 검색" : "Search commands"}
          </button>
        </div>
      </section>
    </Container>
  );
}
