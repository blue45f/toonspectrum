import { PanelRightOpen, X } from "lucide-react";
import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { cn } from "@/shared/lib/utils";

import type { StudioDocumentWorkspaceId } from "../studio-document-workspace";
import type { StudioProjectSection } from "../studio-project-views";

import { useStudioDocumentLayout } from "../studio-router/studio-document-layout-context";

const StudioProjectFeatureSuitePanel = lazyRetry(
  () => import("./StudioProjectFeatureSuitePanel").then((module) => ({
    default: module.StudioProjectFeatureSuitePanel,
  })),
  "StudioDocumentFeatureSuitePanel",
);
const StudioLocalizationPanel = lazyRetry(
  () => import("./StudioLocalizationPanel").then((module) => ({
    default: module.StudioLocalizationPanel,
  })),
  "StudioDocumentLocalizationPanel",
);
const StudioReviewPanel = lazyRetry(
  () => import("./StudioReviewPanel").then((module) => ({
    default: module.StudioReviewPanel,
  })),
  "StudioDocumentReviewPanel",
);

type Locale = "ko" | "en";

type WorkspaceToolProjection =
  | {
    readonly kind: "suite";
    readonly section: StudioProjectSection;
    readonly view: string;
    readonly titleKo: string;
    readonly titleEn: string;
    readonly descriptionKo: string;
    readonly descriptionEn: string;
  }
  | {
    readonly kind: "localization" | "review";
    readonly titleKo: string;
    readonly titleEn: string;
    readonly descriptionKo: string;
    readonly descriptionEn: string;
  };

const WORKSPACE_TOOL_PROJECTIONS: Partial<
  Readonly<Record<StudioDocumentWorkspaceId, WorkspaceToolProjection>>
> = Object.freeze({
  comic: {
    kind: "suite",
    section: "production",
    view: "documents",
    titleKo: "웹툰 원고 도구",
    titleEn: "Webtoon manuscript tools",
    descriptionKo: "모바일 가독성, 말풍선, 읽기 순서와 원고 품질을 현재 문서에서 확인합니다.",
    descriptionEn: "Check mobile readability, balloons, reading order and manuscript quality in context.",
  },
  design: {
    kind: "suite",
    section: "production",
    view: "documents",
    titleKo: "디자인 템플릿",
    titleEn: "Design templates",
    descriptionKo: "작품 스타일과 템플릿 슬롯을 현재 디자인 문서에 연결합니다.",
    descriptionEn: "Connect project styles and structured template slots to this design document.",
  },
  slides: {
    kind: "suite",
    section: "production",
    view: "documents",
    titleKo: "발표 자료 검사",
    titleEn: "Presentation checks",
    descriptionKo: "슬라이드 레이아웃, 글자 크기, 겹침과 에셋 권리를 확인합니다.",
    descriptionEn: "Check slide layout, type size, overlap and asset rights.",
  },
  storyboard: {
    kind: "suite",
    section: "story",
    view: "script",
    titleKo: "콘티 계획",
    titleEn: "Storyboard planning",
    descriptionKo: "대본의 장면을 샷, 카메라, 말풍선 여백과 스크롤 간격으로 변환합니다.",
    descriptionEn: "Turn story beats into shots, camera notes, dialogue space and scroll gaps.",
  },
  whiteboard: {
    kind: "suite",
    section: "story",
    view: "relations",
    titleKo: "설정·관계 확인",
    titleEn: "World and relationship checks",
    descriptionKo: "캐릭터, 장소, 사건과 연속성 정보를 자유 배치 작업과 함께 확인합니다.",
    descriptionEn: "Review characters, locations, events and continuity beside freeform planning.",
  },
  "3d": {
    kind: "suite",
    section: "production",
    view: "renders",
    titleKo: "3D 장면·분리 출력",
    titleEn: "3D scene and render passes",
    descriptionKo: "카메라, 조명, 선화, 그림자, 깊이와 마스크 출력을 계획합니다.",
    descriptionEn: "Plan camera, lighting, line art, shadow, depth and mask output.",
  },
  animation: {
    kind: "suite",
    section: "production",
    view: "renders",
    titleKo: "애니메이션 타이밍",
    titleEn: "Animation timing",
    descriptionKo: "장면 지속 시간, 전환, 음성 구간과 렌더 작업을 함께 확인합니다.",
    descriptionEn: "Review scene duration, transitions, voice segments and render work together.",
  },
  motion: {
    kind: "suite",
    section: "production",
    view: "renders",
    titleKo: "모션 웹툰 제작",
    titleEn: "Motion comic production",
    descriptionKo: "컷, 대사, 음성과 카메라 움직임을 장면 타이밍으로 연결합니다.",
    descriptionEn: "Connect panels, dialogue, voice and camera movement to scene timing.",
  },
  audio: {
    kind: "suite",
    section: "production",
    view: "renders",
    titleKo: "음성·오디오 제작",
    titleEn: "Voice and audio production",
    descriptionKo: "변경된 대사만 다시 생성하고 음성 권리와 전체 길이를 확인합니다.",
    descriptionEn: "Regenerate changed dialogue only, then verify voice rights and total duration.",
  },
  localization: {
    kind: "localization",
    titleKo: "문서 현지화",
    titleEn: "Document localization",
    descriptionKo: "번역, 원문 제거, 배경 복원, 레터링과 언어별 품질을 처리합니다.",
    descriptionEn: "Handle translation, cleanup, restoration, lettering and locale quality.",
  },
  review: {
    kind: "review",
    titleKo: "문서 검토",
    titleEn: "Document review",
    descriptionKo: "현재 원고의 댓글, 수정 요청, 버전 비교와 승인을 처리합니다.",
    descriptionEn: "Handle comments, change requests, version comparison and approval for this document.",
  },
});

function localeFromLanguage(language: string): Locale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

function DockLoading({ locale }: { readonly locale: Locale }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-2xl border border-line bg-panel/50 p-5 text-sm font-semibold text-fg-3">
      {locale === "ko" ? "문서 도구를 여는 중..." : "Opening document tools..."}
    </div>
  );
}

function ProjectionContent({
  locale,
  projectId,
  projection,
}: {
  readonly locale: Locale;
  readonly projectId: string;
  readonly projection: WorkspaceToolProjection;
}) {
  if (projection.kind === "localization") {
    return <StudioLocalizationPanel projectId={projectId} locale={locale} />;
  }
  if (projection.kind === "review") {
    return <StudioReviewPanel projectId={projectId} locale={locale} />;
  }
  return (
    <StudioProjectFeatureSuitePanel
      projectId={projectId}
      section={projection.section}
      view={projection.view}
      locale={locale}
    />
  );
}

/**
 * A non-modal, lazy document-side projection of project capabilities. It keeps specialist tools
 * reachable without creating another route or remounting the canvas. Drafts remain lightweight
 * until they are saved into a project, and drawing/image workspaces keep an uncluttered canvas.
 */
export function StudioDocumentWorkspaceDock() {
  const runtime = useStudioDocumentLayout();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const panelId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const workspace = runtime.documentWorkspace;
  const projectId = runtime.projectId;
  const projection = useMemo(
    () => workspace ? WORKSPACE_TOOL_PROJECTIONS[workspace] ?? null : null,
    [workspace],
  );

  useEffect(() => {
    setOpen(false);
  }, [projectId, workspace]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!projectId || !projection) return null;

  const title = locale === "ko" ? projection.titleKo : projection.titleEn;
  const description = locale === "ko" ? projection.descriptionKo : projection.descriptionEn;

  return (
    <>
      <div className="pointer-events-none fixed right-2 top-2 z-[119] print:hidden sm:right-3">
        <button
          type="button"
          aria-controls={panelId}
          aria-expanded={open}
          className={cn(
            buttonClass({ variant: open ? "primary" : "outline", size: "sm" }),
            "pointer-events-auto min-h-11 gap-2 rounded-2xl bg-card/95 shadow-lg backdrop-blur-xl",
          )}
          onClick={() => setOpen((value) => !value)}
        >
          <PanelRightOpen size={16} aria-hidden="true" />
          <span className="hidden sm:inline">{locale === "ko" ? "문서 도구" : "Document tools"}</span>
        </button>
      </div>

      {open ? (
        <aside
          id={panelId}
          aria-label={title}
          className="fixed inset-x-2 bottom-2 top-16 z-[118] overflow-hidden rounded-3xl border border-line bg-card/98 shadow-2xl backdrop-blur-xl print:hidden sm:left-auto sm:right-3 sm:w-[min(46rem,calc(100vw-1.5rem))]"
          data-studio-document-workspace-dock={workspace}
        >
          <div className="flex min-h-16 items-start gap-3 border-b border-line bg-panel/80 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <PanelRightOpen size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-black text-fg">{title}</h2>
              <p className="mt-1 text-xs leading-5 text-fg-3">{description}</p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label={locale === "ko" ? "문서 도구 닫기" : "Close document tools"}
              className={buttonClass({ variant: "quiet", size: "icon" })}
              onClick={() => setOpen(false)}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="h-[calc(100%-4rem)] overflow-y-auto p-3 sm:p-5">
            <Suspense fallback={<DockLoading locale={locale} />}>
              <ProjectionContent
                locale={locale}
                projectId={projectId}
                projection={projection}
              />
            </Suspense>
          </div>
        </aside>
      ) : null}
    </>
  );
}
