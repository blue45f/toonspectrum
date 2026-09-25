import {
  useBilingual,
  type BilingualText,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Brush,
  CheckCircle2,
  ChevronDown,
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
import { Navigate, useLocation, useParams } from "react-router-dom";


import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { Container } from "@/shared/components/section";
import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";

import { cn } from "@/shared/lib/utils";

import {
  STUDIO_PROJECT_SECTION_VIEWS,
  resolveStudioProjectView,
  studioProjectDefaultView,
  type StudioProjectSection as StudioProjectSectionId,
} from "../studio-project-views";
import { resolveStudioProjectViewDestination } from "../studio-project-view-destinations";
import { StudioProjectDiagnosticsBridge } from "./StudioProjectDiagnosticsBridge";
import { StudioProjectReadinessPanel } from "./StudioProjectReadinessPanel";


export type StudioProjectSection = StudioProjectSectionId;

type ProjectAction = Readonly<{
  title: BilingualText;
  description: BilingualText;
  href: (projectId: string) => string;
  icon: LucideIcon;
  badge?: BilingualText;
}>;

interface SectionDefinition {
  label: BilingualText;
  eyebrow: string;
  title: BilingualText;
  description: BilingualText;
  icon: LucideIcon;
  actions: readonly ProjectAction[];
}

function action(
  icon: LucideIcon,
  koTitle: string,
  enTitle: string,
  koDescription: string,
  enDescription: string,
  href: (projectId: string) => string,
  badge?: BilingualText,
): ProjectAction {
  return {
    icon,
    title: { ko: koTitle, en: enTitle },
    description: { ko: koDescription, en: enDescription },
    href,
    ...(badge ? { badge } : {}),
  };
}

function workHref(projectId: string, surface = "canvas"): string {
  return `/studio/work/${encodeURIComponent(projectId)}/${surface}`;
}

function queryHref(pathname: string, values: Readonly<Record<string, string>>): string {
  const params = new URLSearchParams(values);
  params.sort();
  return `${pathname}?${params.toString()}`;
}

function projectViewHref(
  projectId: string,
  section: StudioProjectSection,
  view: string,
  currentSearch = "",
): string {
  const params = new URLSearchParams(currentSearch);
  params.delete("view");
  params.set("view", view);
  params.sort();
  return `/studio/p/${encodeURIComponent(projectId)}/${section}?${params.toString()}`;
}

const SECTION_DEFINITIONS: Readonly<Record<StudioProjectSection, SectionDefinition>> = {
  overview: {
    label: { ko: "홈", en: "Home" },
    eyebrow: "PROJECT OVERVIEW",
    title: { ko: "이어서 할 일을 바로 확인하세요.", en: "See what to do next." },
    description: {
      ko: "최근 원고, 검토 요청과 배포 준비만 간단히 확인합니다.",
      en: "See recent work, review requests and delivery readiness without extra dashboards.",
    },
    icon: LayoutDashboard,
    actions: [
      action(Brush, "원고 이어서 작업", "Continue manuscript", "최근 캔버스와 도구 상태에서 바로 시작합니다.", "Open the latest canvas with recent tools and view restored.", (id) => workHref(id)),
      action(BookOpen, "기획 정리", "Open planning", "대본·캐릭터·세계관과 참고자료를 확인합니다.", "Review scripts, characters, worldbuilding and references.", (id) => `/studio/p/${encodeURIComponent(id)}/story`),
      action(MessageSquareCheck, "검토할 내용", "Review work", "댓글·수정 요청·승인 대기를 한 흐름으로 봅니다.", "See comments, change requests and approvals in one flow.", (id) => `/studio/p/${encodeURIComponent(id)}/review`),
      action(FileOutput, "배포 준비", "Prepare delivery", "플랫폼 규격과 사용 권리를 확인한 뒤 파일을 만듭니다.", "Check platform rules and usage rights before creating files.", (id) => `/studio/p/${encodeURIComponent(id)}/export`),
    ],
  },
  story: {
    label: { ko: "기획", en: "Planning" },
    eyebrow: "STORY",
    title: { ko: "대본과 작품 설정을 정리하세요.", en: "Organize scripts and project details." },
    description: {
      ko: "회차, 대본, 캐릭터와 세계관을 원고 가까이에서 관리합니다.",
      en: "Keep episodes, scripts, characters and worldbuilding close to the manuscript.",
    },
    icon: BookOpen,
    actions: [
      action(BookOpen, "대본·에피소드", "Scripts & episodes", "장면과 대사를 구조화하고 원고 말풍선과 연결합니다.", "Structure scenes and dialogue, then connect them to manuscript balloons.", (id) => queryHref("/story-lab", { project: id })),
      action(Users, "캐릭터·관계", "Characters & relations", "말투·외형·관계·등장 이력을 작품 기준으로 정리합니다.", "Organize voice, appearance, relationships and appearances as project data.", (id) => queryHref("/studio/assets/characters/new", { project: id })),
      action(Sparkles, "세계관·연속성", "World & continuity", "설정 충돌과 장면 간 불일치를 근거와 함께 확인합니다.", "Review continuity and story conflicts with supporting references.", (id) => workHref(id, "storyworld")),
      action(ImagePlus, "참고자료", "References", "출처와 사용 조건을 유지하며 자료를 모읍니다.", "Collect references while preserving source and usage information.", (id) => queryHref(workHref(id, "storyworld"), { focus: "references" })),
    ],
  },
  production: {
    label: { ko: "제작", en: "Production" },
    eyebrow: "PRODUCTION",
    title: { ko: "원고를 만들고 다듬으세요.", en: "Create and refine the manuscript." },
    description: {
      ko: "드로잉, 컷 편집, 3D 참고와 모션 도구를 같은 프로젝트에서 사용합니다.",
      en: "Use drawing, panel editing, 3D reference and motion tools in the same project.",
    },
    icon: FolderKanban,
    actions: [
      action(Brush, "드로잉", "Drawing", "브러시·레이어·선택·보정으로 원고를 제작합니다.", "Create with brushes, layers, selections and adjustments.", (id) => workHref(id, "canvas")),
      action(LayoutGrid, "웹툰·컷 편집", "Webtoon & panels", "컷·대사·말풍선과 긴 세로 원고를 편집합니다.", "Edit panels, dialogue, balloons and long vertical canvases.", (id) => workHref(id, "comic")),
      action(Presentation, "애니메이션·모션", "Animation & motion", "애니매틱, 키프레임과 장면 타이밍을 만듭니다.", "Create animatics, keyframes and scene timing.", (id) => workHref(id, "animation")),
      action(Boxes, "3D 장면 연출", "3D scene direction", "배경·포즈·구도를 먼저 잡고 원고의 작화 가이드로 적용합니다.", "Block backgrounds, poses and composition, then apply them as drawing guides.", (id) => workHref(id, "bg3d")),
    ],
  },
  assets: {
    label: { ko: "소재", en: "Assets" },
    eyebrow: "PROJECT ASSETS",
    title: { ko: "이 프로젝트에 쓰는 소재를 관리하세요.", en: "Manage the assets used by this project." },
    description: {
      ko: "브러시, 이미지, 3D, 글꼴과 사용 권리를 한곳에서 확인합니다.",
      en: "Review brushes, images, 3D, fonts and usage rights in one place.",
    },
    icon: Boxes,
    actions: [
      action(Boxes, "사용 중인 소재", "Assets in use", "현재 프로젝트에 설치·사용된 에셋을 확인합니다.", "Review installed and used assets for this project.", (id) => queryHref("/studio/assets", { project: id })),
      action(Brush, "브러시", "Brushes", "전체·내 브러시·팀 브러시를 하나의 라이브러리에서 찾습니다.", "Find built-in, personal and team brushes in one library.", () => "/studio/assets/brushes"),
      action(Palette, "작품 스타일", "Project style", "작품 로고·색상·글꼴·말풍선·출력 규칙을 재사용합니다.", "Reuse logos, colors, fonts, balloons and export rules.", (id) => queryHref("/studio/assets", { project: id, view: "series-kit" })),
      action(WandSparkles, "새 소재 찾기", "Find assets", "호환성과 상업 이용 조건을 확인한 뒤 프로젝트에 설치합니다.", "Check compatibility and commercial-use terms before installing.", (id) => queryHref("/market", { project: id })),
    ],
  },
  review: {
    label: { ko: "검토", en: "Review" },
    eyebrow: "REVIEW",
    title: { ko: "피드백을 확인하고 마무리하세요.", en: "Review feedback and finish the work." },
    description: {
      ko: "댓글, 수정 요청, 승인과 버전 비교를 한곳에서 처리합니다.",
      en: "Handle comments, change requests, approvals and version comparison in one place.",
    },
    icon: ClipboardCheck,
    actions: [
      action(MessageSquareCheck, "댓글·수정 요청", "Comments & changes", "위치·컷·대사에 연결된 검토 내용을 해결합니다.", "Resolve review notes attached to positions, panels and dialogue.", (id) => workHref(id, "review")),
      action(CheckCircle2, "승인", "Approvals", "단계별 승인 상태를 확인하고 승인본을 자동 보관합니다.", "Review stage approvals and preserve approved versions automatically.", (id) => workHref(id, "review")),
      action(LayoutGrid, "버전 비교", "Version comparison", "두 결과를 좌우·오버레이·변경 영역으로 비교합니다.", "Compare versions side by side, overlaid or by changed areas.", (id) => workHref(id, "versions")),
      action(Users, "공유·외부 검토", "Share & external review", "편집 권한 또는 가벼운 검토 링크를 만듭니다.", "Invite editors or create a lightweight review link.", (id) => queryHref("/studio/share", { scope: `work:${id}` })),
    ],
  },
  export: {
    label: { ko: "배포", en: "Delivery" },
    eyebrow: "EXPORT",
    title: { ko: "연재할 곳에 맞는 파일을 만드세요.", en: "Create files for where the work will be published." },
    description: {
      ko: "플랫폼, SNS, 인쇄 목적을 고르면 필요한 규격과 파일을 준비합니다.",
      en: "Choose a platform, social or print destination and prepare the required files.",
    },
    icon: FileOutput,
    actions: [
      action(LayoutGrid, "연재본 만들기", "Create release files", "분할·용량·썸네일·글자 가독성을 자동 검사합니다.", "Check slicing, file size, thumbnails and text readability automatically.", (id) => workHref(id, "publish")),
      action(ImagePlus, "이미지·PDF", "Images & PDF", "SNS 공유와 검토용 이미지·PDF를 만듭니다.", "Create image and PDF packages for sharing and review.", (id) => workHref(id, "publish")),
      action(Presentation, "PPTX·피칭", "PPTX & pitch", "작품 소개와 피칭 자료를 편집 가능한 문서로 내보냅니다.", "Export project introductions and pitches as editable documents.", (id) => workHref(id, "present")),
      action(FileOutput, "전체 프로젝트 백업", "Full project backup", "원고·에셋·설정·권리 정보를 포함한 완전한 사본을 만듭니다.", "Create a complete copy with documents, assets, settings and rights data.", (id) => workHref(id, "publish")),
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
      action(Users, "팀·권한", "Team & permissions", "역할과 편집·검토·게시 권한을 관리합니다.", "Manage roles and edit, review and publish permissions.", (id) => queryHref("/studio/share", { scope: `work:${id}` })),
      action(Sparkles, "자동화", "Automation", "자동 버전·작업 단계·출력 규칙을 설정합니다.", "Configure automatic versions, workflow stages and export rules.", (id) => projectViewHref(id, "settings", "automation")),
      action(MoreHorizontal, "보관·삭제", "Archive & delete", "복구 가능한 상태로 보관하거나 휴지통으로 이동합니다.", "Archive safely or move the project to trash with recovery available.", (id) => projectViewHref(id, "settings", "archive")),
    ],
  },
};

const PRIMARY_SECTIONS = [
  "overview",
  "story",
  "production",
  "review",
  "export",
] as const satisfies readonly StudioProjectSection[];

const SECONDARY_SECTIONS = ["assets", "settings"] as const satisfies readonly StudioProjectSection[];

function localeFromLanguage(language: string) {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

function projectSectionHref(projectId: string, section: StudioProjectSection): string {
  return `/studio/p/${encodeURIComponent(projectId)}/${section}`;
}

function InvalidProject() {
  const bt = useBilingual("StudioProjectShellPage.InvalidProject");
  return (
    <Container size="wide" className="py-10">
      <section className="rounded-3xl border border-line bg-card p-6" role="alert">
        <h1 className="text-xl font-bold text-fg">
          {bt("프로젝트를 찾을 수 없어요.", "Project not found.")}
        </h1>
        <p className="mt-2 text-sm text-fg-3">
          {bt("저장된 작업은 변경하지 않았습니다. 내 작업에서 프로젝트를 다시 선택하세요.", "No saved work was changed. Choose the project again from My work.")}
        </p>
        <Link href="/studio" className={buttonClass({ className: "mt-5" })}>
          {bt("내 작업으로", "Go to My work")}
        </Link>
      </section>
    </Container>
  );
}

export function StudioProjectShellPage({ section }: { readonly section: StudioProjectSection }) {
  const bt = useBilingual("StudioProjectShellPage");
  const { projectId = "" } = useParams<{ projectId: string }>();
  const location = useLocation();
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
  const viewResolution = useMemo(() => {
    try {
      return resolveStudioProjectView(displayProjectId, section, location.search);
    } catch {
      return null;
    }
  }, [displayProjectId, location.search, section]);
  const selectedView = viewResolution?.view ?? studioProjectDefaultView(section);
  const destination = useMemo(() => {
    try {
      return resolveStudioProjectViewDestination(displayProjectId, section, selectedView);
    } catch {
      return null;
    }
  }, [displayProjectId, section, selectedView]);

  useDocumentTitle(`${bt(definition.label.ko, definition.label.en)} · ToonStudio`);

  if (!projectId || !viewResolution || !destination) return <InvalidProject />;
  if (viewResolution.changed) return <Navigate to={viewResolution.canonicalHref} replace />;

  const sectionViews = STUDIO_PROJECT_SECTION_VIEWS[section];
  const primaryAction = definition.actions[0] ?? null;
  const secondaryActions = definition.actions.slice(1);
  const PrimaryActionIcon = primaryAction?.icon ?? SectionIcon;
  const secondaryNavigationActive = section === "assets" || section === "settings";

  return (
    <Container
      size="wide"
      className="py-4 sm:py-6 lg:py-8"
      data-studio-project-shell="simple"
    >
      <CampusObjectSource objects={[
        {
          id: displayProjectId,
          title: displayProjectId,
          href: `/studio/p/${encodeURIComponent(displayProjectId)}/overview`,
          kind: "project",
          exposure: "private",
        },
        {
          id: `${displayProjectId}.review`,
          title: `${displayProjectId} · Review`,
          href: `/studio/p/${encodeURIComponent(displayProjectId)}/review`,
          kind: "review",
          exposure: "private",
        },
      ]} />
      <header
        className="rounded-2xl border border-line bg-panel/65 p-4 shadow-sm sm:p-6"
        data-studio-project-simple-header="true"
      >
        <nav
          aria-label={bt("현재 위치", "Current location")}
          className="flex items-center gap-2 text-xs text-fg-3"
        >
          <Link href="/studio" className="font-semibold hover:text-accent">
            {bt("프로젝트", "Projects")}
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{bt(definition.label.ko, definition.label.en)}</span>
        </nav>
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
              <SectionIcon size={14} aria-hidden="true" />
              {bt(definition.label.ko, definition.label.en)}
            </span>
            <h1 className="mt-3 text-pretty text-2xl font-black tracking-tight text-fg sm:text-3xl">
              {bt(definition.title.ko, definition.title.en)}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-2">
              {bt(definition.description.ko, definition.description.en)}
            </p>
            <p className="mt-2 truncate text-xs text-fg-3">
              {bt("프로젝트", "Project")} · {displayProjectId}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={workHref(displayProjectId)}
              className={buttonClass({ size: "lg", variant: "outline", className: "gap-2" })}
            >
              <Brush size={17} aria-hidden="true" />
              {bt("원고 열기", "Open manuscript")}
            </Link>
            <Link
              href={`/studio/p/${encodeURIComponent(displayProjectId)}/space`}
              className={buttonClass({ size: "lg", variant: "quiet", className: "gap-2 text-fg" })}
              data-studio-enter-virtual-space="true"
            >
              <Users size={17} aria-hidden="true" />
              {bt("팀 공간", "Team space")}
            </Link>
          </div>
        </div>
      </header>

      <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
        <nav
          aria-label={bt("프로젝트 주요 단계", "Main project stages")}
          className="overflow-x-auto rounded-2xl border border-line bg-card p-1.5"
          data-studio-project-primary-navigation="true"
        >
          <div className="flex min-w-max gap-1">
            {PRIMARY_SECTIONS.map((id) => {
              const active = id === section;
              return (
                <Link
                  key={id}
                  href={projectSectionHref(displayProjectId, id)}
                  aria-current={active ? "page" : undefined}
                  data-studio-project-primary-section={id}
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-xl px-3.5 text-sm font-semibold transition-colors",
                    active ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  {bt(SECTION_DEFINITIONS[id].label.ko, SECTION_DEFINITIONS[id].label.en)}
                </Link>
              );
            })}
          </div>
        </nav>

        <details
          open={secondaryNavigationActive || undefined}
          className={cn(
            "group rounded-2xl border bg-card p-1.5",
            secondaryNavigationActive ? "border-accent/55" : "border-line",
          )}
          data-studio-project-secondary-navigation="true"
        >
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 text-sm font-semibold text-fg-2 hover:bg-raised hover:text-fg lg:min-w-40">
            <span className="inline-flex items-center gap-2">
              <MoreHorizontal size={16} aria-hidden="true" />
              {bt("소재·설정", "Assets & settings")}
            </span>
            <ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-1 grid gap-1 border-t border-line pt-1">
            {SECONDARY_SECTIONS.map((id) => {
              const active = id === section;
              const Icon = SECTION_DEFINITIONS[id].icon;
              return (
                <Link
                  key={id}
                  href={projectSectionHref(displayProjectId, id)}
                  aria-current={active ? "page" : undefined}
                  data-studio-project-secondary-section={id}
                  className={cn(
                    "flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors",
                    active ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  <Icon size={15} aria-hidden="true" />
                  {bt(SECTION_DEFINITIONS[id].label.ko, SECTION_DEFINITIONS[id].label.en)}
                </Link>
              );
            })}
          </div>
        </details>
      </div>

      <details
        className="group mt-3 rounded-2xl border border-line bg-card"
        data-studio-project-view-picker="true"
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5">
          <span className="text-xs font-semibold text-fg-3">
            {bt("현재 화면", "Current view")}
          </span>
          <strong className="min-w-0 flex-1 truncate text-sm text-fg">
            {bt(destination.labelKo, destination.labelEn)}
          </strong>
          <span className="text-xs text-fg-3">
            {bt("화면 바꾸기", "Change view")}
          </span>
          <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <nav
          aria-label={bt(`${definition.label.ko} 세부 화면`, `${definition.label.en} views`)}
          className="grid gap-1 border-t border-line p-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          {sectionViews.map((view) => {
            const active = view === selectedView;
            const viewLabel = resolveStudioProjectViewDestination(displayProjectId, section, view);
            return (
              <Link
                key={view}
                href={projectViewHref(displayProjectId, section, view, location.search)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold transition-colors",
                  active ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {bt(viewLabel.labelKo, viewLabel.labelEn)}
              </Link>
            );
          })}
        </nav>
      </details>

      <section
        data-studio-project-view={selectedView}
        className="mt-4 rounded-2xl border border-accent/25 bg-accent-soft/20 p-4 sm:p-5"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-bold text-accent">
              {bt("현재 화면", "Current view")}
            </p>
            <h2 className="mt-1 text-lg font-black text-fg">
              {bt(destination.labelKo, destination.labelEn)}
            </h2>
            <p className="mt-1 text-sm leading-6 text-fg-2">
              {bt(destination.descriptionKo, destination.descriptionEn)}
            </p>
          </div>
          {destination.href ? (
            <Link
              href={destination.href}
              className={buttonClass({ variant: "outline", className: "shrink-0 gap-2" })}
            >
              {bt(destination.ctaKo, destination.ctaEn)}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ) : (
            <span className="rounded-full border border-line bg-card px-3 py-2 text-xs font-bold text-fg-2">
              {bt(destination.ctaKo, destination.ctaEn)}
            </span>
          )}
        </div>
      </section>

      <StudioProjectDiagnosticsBridge projectId={displayProjectId} />

      {primaryAction ? (
        <section className="mt-5" aria-labelledby="project-next-action">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
              <SectionIcon size={18} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold text-fg-3">{bt("추천", "Recommended")}</p>
              <h2 id="project-next-action" className="text-lg font-black text-fg">
                {bt("다음 작업", "Next action")}
              </h2>
            </div>
          </div>
          <Link
            href={primaryAction.href(displayProjectId)}
            data-studio-project-primary-action="true"
            className="group mt-3 flex min-h-28 items-center gap-4 rounded-2xl border border-accent/35 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:bg-raised hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 sm:p-5"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-on-accent">
              <PrimaryActionIcon size={22} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-base text-fg">
                {bt(primaryAction.title.ko, primaryAction.title.en)}
              </strong>
              <span className="mt-1 block text-sm leading-6 text-fg-3">
                {bt(primaryAction.description.ko, primaryAction.description.en)}
              </span>
            </span>
            <ArrowRight
              size={18}
              className="shrink-0 text-accent transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>

          {secondaryActions.length > 0 ? (
            <details
              className="group mt-3 rounded-2xl border border-line bg-card"
              data-studio-project-more-actions="true"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-fg-2 hover:text-fg">
                <span>{bt(`다른 작업 ${secondaryActions.length}개`, `${secondaryActions.length} more actions`)}</span>
                <ChevronDown
                  size={16}
                  className="transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="grid gap-1 border-t border-line p-2 sm:grid-cols-2 lg:grid-cols-3">
                {secondaryActions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.title.ko}
                      href={item.href(displayProjectId)}
                      className="group flex min-h-16 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-panel text-fg-3 group-hover:text-accent">
                        <Icon size={17} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block text-sm text-fg">
                          {bt(item.title.ko, item.title.en)}
                        </strong>
                        <span className="mt-0.5 line-clamp-1 block text-xs text-fg-3">
                          {bt(item.description.ko, item.description.en)}
                        </span>
                      </span>
                      <ArrowRight size={14} className="shrink-0 text-fg-3" aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      <details
        className="group mt-4 rounded-2xl border border-line bg-panel/45"
        data-studio-project-health="true"
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5">
          <CheckCircle2 size={18} className="text-good" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <strong className="block text-sm text-fg">
              {bt("프로젝트 상태", "Project status")}
            </strong>
            <span className="block text-xs text-fg-3">
              {bt("저장, 검토와 배포 준비를 필요할 때 확인하세요.", "Check saving, review and delivery readiness when needed.")}
            </span>
          </span>
          <ChevronDown
            size={16}
            className="transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="border-t border-line p-2">
          <StudioProjectReadinessPanel
            projectId={displayProjectId}
            locale={locale}
            compact={section !== "overview"}
          />
        </div>
      </details>

      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-line bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <strong className="text-sm text-fg">
            {bt("원하는 작업이 보이지 않나요?", "Cannot find the task you need?")}
          </strong>
          <p className="mt-0.5 text-xs leading-5 text-fg-3">
            {bt("하려는 일을 입력하면 현재 프로젝트에 맞는 기능을 찾습니다.", "Describe the task to find the right feature for this project.")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => globalThis.dispatchEvent(new CustomEvent("toonspectrum:command-palette:open"))}
          className={buttonClass({ variant: "outline", className: "shrink-0 gap-2" })}
        >
          <WandSparkles size={16} aria-hidden="true" />
          {bt("기능 찾기", "Find a feature")}
        </button>
      </div>
    </Container>
  );
}
