import { StudioChromePortal } from "./StudioDocumentChromeSlot";
import {
  ArrowRight,
  Download,
  Layers3,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { studioModeHandoffsFor, executeStudioModeHandoff } from "../studio-mode-handoff";
import { studioProjectFormatProfile } from "../studio-project-format-catalog";
import type { StudioWorkspaceMode } from "../studio-project-definition";
import { resolveStudioRuntimeMode, studioModeLabel, studioModeProfile } from "../studio-mode-profile";
import {
  readStudioProjectDocuments,
  STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT,
  type StudioDocumentWorkspace,
} from "../studio-project-document-store";
import {
  readStudioProjectLibrary,
  STUDIO_PROJECT_LIBRARY_UPDATED_EVENT,
} from "../studio-project-library-store";

const AI_ACTION_LABELS: Readonly<Record<string, { ko: string; en: string }>> = {
  "script-to-panels": { ko: "대본 → 컷", en: "Script → panels" },
  "panel-direction": { ko: "컷 연출", en: "Panel direction" },
  "continuity-check": { ko: "연속성 검사", en: "Continuity check" },
  "bubble-layout": { ko: "말풍선 정리", en: "Bubble layout" },
  "rough-to-line": { ko: "러프 → 선화", en: "Rough → line" },
  "pose-reference": { ko: "포즈 레퍼런스", en: "Pose reference" },
  "inpaint-selection": { ko: "선택 영역 수정", en: "Edit selection" },
  colorize: { ko: "AI 채색", en: "AI colorize" },
  "lighting-pass": { ko: "광원 제안", en: "Lighting pass" },
  "cover-layout": { ko: "표지 레이아웃", en: "Cover layout" },
  "promo-variants": { ko: "홍보 변형본", en: "Promo variants" },
  "copy-suggest": { ko: "카피 제안", en: "Copy suggestions" },
  "smart-resize": { ko: "규격 자동 변환", en: "Smart resize" },
  "pitch-outline": { ko: "피치 구성", en: "Pitch outline" },
  "slide-layout": { ko: "슬라이드 구성", en: "Slide layout" },
  "speaker-notes": { ko: "발표 노트", en: "Speaker notes" },
  "script-to-scenes": { ko: "대본 → 씬", en: "Script → scenes" },
  "scene-to-shots": { ko: "씬 → 샷", en: "Scene → shots" },
  "camera-suggest": { ko: "카메라 제안", en: "Camera suggestions" },
  "shot-duration": { ko: "샷 타이밍", en: "Shot timing" },
  "object-remove": { ko: "오브젝트 제거", en: "Object remove" },
  "generative-fill": { ko: "생성형 채우기", en: "Generative fill" },
  "expand-image": { ko: "이미지 확장", en: "Expand image" },
  cleanup: { ko: "클린업", en: "Cleanup" },
  "pose-from-text": { ko: "텍스트 → 포즈", en: "Text → pose" },
  "composition-suggest": { ko: "구도 제안", en: "Composition" },
  "lighting-preset": { ko: "조명 프리셋", en: "Lighting preset" },
  "scene-layout": { ko: "장면 배치", en: "Scene layout" },
  "panel-to-motion": { ko: "컷 → 모션", en: "Panel → motion" },
  "auto-keyframe": { ko: "자동 키프레임", en: "Auto keyframe" },
  "camera-motion": { ko: "카메라 모션", en: "Camera motion" },
  "lip-sync": { ko: "립싱크", en: "Lip sync" },
  "caption-align": { ko: "자막 정렬", en: "Caption align" },
  "music-cue": { ko: "음악 큐", en: "Music cue" },
};

const AI_ACTION_TOOL: Readonly<Record<string, "배경" | "캐릭터" | "구도" | "대사" | "팔레트">> = {
  "panel-direction": "구도",
  "bubble-layout": "대사",
  "rough-to-line": "캐릭터",
  "pose-reference": "캐릭터",
  "inpaint-selection": "배경",
  colorize: "팔레트",
  "lighting-pass": "팔레트",
  "cover-layout": "구도",
  "promo-variants": "구도",
  "copy-suggest": "대사",
  "smart-resize": "구도",
  "pitch-outline": "구도",
  "slide-layout": "구도",
  "speaker-notes": "대사",
  "script-to-scenes": "구도",
  "scene-to-shots": "구도",
  "camera-suggest": "구도",
  "shot-duration": "구도",
  "object-remove": "배경",
  "generative-fill": "배경",
  "expand-image": "배경",
  cleanup: "배경",
  "pose-from-text": "캐릭터",
  "composition-suggest": "구도",
  "lighting-preset": "팔레트",
  "scene-layout": "구도",
  "panel-to-motion": "구도",
  "auto-keyframe": "구도",
  "camera-motion": "구도",
  "lip-sync": "대사",
  "caption-align": "대사",
  "music-cue": "구도",
};

const EPISODE_AI_ACTIONS = new Set(["script-to-panels", "continuity-check"]);

type StudioLocalizedLabel = Readonly<{ ko: string; en: string }>;

const PROJECT_WORKSPACE_LABELS: Readonly<Record<StudioWorkspaceMode, StudioLocalizedLabel>> = {
  planning: { ko: "기획", en: "Planning" },
  storyboard: { ko: "스토리보드", en: "Storyboard" },
  webtoon: { ko: "웹툰 원고", en: "Webtoon artwork" },
  illustration: { ko: "일러스트", en: "Illustration" },
  image: { ko: "이미지 편집", en: "Image editing" },
  design: { ko: "표지·홍보", en: "Cover & promotion" },
  slides: { ko: "발표 자료", en: "Presentation" },
  "three-d": { ko: "3D 장면", en: "3D scene" },
  animation: { ko: "애니메이션·모션", en: "Animation & motion" },
  localization: { ko: "다국어", en: "Localization" },
  review: { ko: "검토", en: "Review" },
};

const DOCUMENT_WORKSPACE_LABELS: Readonly<Record<StudioDocumentWorkspace, StudioLocalizedLabel>> = {
  draw: { ko: "드로잉", en: "Drawing" },
  comic: { ko: "컷·웹툰", en: "Panels & webtoon" },
  image: { ko: "이미지 편집", en: "Image editing" },
  design: { ko: "디자인", en: "Design" },
  slides: { ko: "발표 자료", en: "Presentation" },
  storyboard: { ko: "스토리보드", en: "Storyboard" },
  whiteboard: { ko: "화이트보드", en: "Whiteboard" },
  "3d": { ko: "3D", en: "3D" },
  animation: { ko: "애니메이션", en: "Animation" },
  motion: { ko: "모션", en: "Motion" },
  audio: { ko: "오디오", en: "Audio" },
  localization: { ko: "다국어", en: "Localization" },
  review: { ko: "검토", en: "Review" },
};

const EXPORT_LABELS: Readonly<Record<string, StudioLocalizedLabel>> = {
  "webtoon-long-image": { ko: "긴 세로 원고", en: "Long image" },
  "episode-package": { ko: "회차 패키지", en: "Episode package" },
  "platform-preview": { ko: "플랫폼 미리보기", en: "Platform preview" },
  png: { ko: "PNG", en: "PNG" },
  jpeg: { ko: "JPEG", en: "JPEG" },
  "high-resolution": { ko: "고해상도", en: "High-res" },
  cover: { ko: "표지", en: "Cover" },
  "episode-thumbnail": { ko: "회차 썸네일", en: "Thumbnail" },
  "social-square": { ko: "SNS 정사각형", en: "Social 1:1" },
  "vertical-promo": { ko: "세로 홍보물", en: "Vertical promo" },
  "pitch-pdf": { ko: "피치 PDF", en: "Pitch PDF" },
  presentation: { ko: "발표 자료", en: "Presentation" },
  "shot-list": { ko: "샷 목록", en: "Shot list" },
  animatic: { ko: "애니매틱", en: "Animatic" },
  "edited-image": { ko: "편집 이미지", en: "Edited image" },
  "layered-image": { ko: "레이어 이미지", en: "Layered image" },
  "render-reference": { ko: "렌더 레퍼런스", en: "Render ref" },
  "background-render": { ko: "배경 렌더", en: "Background render" },
  "camera-snapshot": { ko: "카메라 스냅샷", en: "Camera snapshot" },
  mp4: { ko: "MP4", en: "MP4" },
  webm: { ko: "WebM", en: "WebM" },
  gif: { ko: "GIF", en: "GIF" },
  "vertical-short": { ko: "세로 쇼츠", en: "Vertical short" },
  "social-card-sequence": { ko: "카드 묶음", en: "Card sequence" },
  "page-pdf": { ko: "페이지 PDF", en: "Page PDF" },
  "page-images": { ko: "페이지 이미지", en: "Page images" },
  "print-package": { ko: "인쇄 패키지", en: "Print package" },
};

function applyStudioAiAction(actionId: string): boolean {
  const root = document.querySelector<HTMLElement>("[data-studio-ai-assist-hub='true']");
  if (!root) return false;
  root.scrollIntoView({ block: "nearest" });

  if (EPISODE_AI_ACTIONS.has(actionId)) {
    const production = root.querySelector<HTMLButtonElement>(
      "[data-studio-ai-episode-production-launcher='true']",
    );
    if (production) {
      production.click();
      return true;
    }
  }

  const toolLabel = AI_ACTION_TOOL[actionId];
  if (!toolLabel) return true;
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>("[role='tab']"));
  const tab = tabs.find((candidate) => (candidate.textContent ?? "").includes(toolLabel));
  if (!tab) return true;
  tab.click();
  tab.focus();
  return true;
}

function clickStudioAiSurface(actionId: string): boolean {
  if (applyStudioAiAction(actionId)) return true;

  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(
    "[data-studio-tool-rail='true'] button, [data-studio-app-menubar='true'] button, [data-studio-main-menu='true'] button",
  ));
  const trigger = buttons.find((button) => {
    const label = `${button.getAttribute("aria-label") ?? ""} ${button.textContent ?? ""}`;
    return /(?:\bAI\b|AI 어시스트|AI 도구)/iu.test(label);
  });
  if (!trigger) return false;
  trigger.click();
  globalThis.requestAnimationFrame(() => {
    if (!applyStudioAiAction(actionId)) {
      globalThis.setTimeout(() => applyStudioAiAction(actionId), 0);
    }
  });
  return true;
}

function clickStudioExportSurface(): boolean {
  const command = document.querySelector<HTMLButtonElement>(
    '[data-studio-command-bar-command="export-open"]',
  );
  if (command) {
    command.click();
    return true;
  }
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(
    "[data-studio-app-menubar='true'] button, [data-studio-main-menu='true'] button",
  ));
  const trigger = buttons.find((button) => {
    const label = `${button.getAttribute("aria-label") ?? ""} ${button.textContent ?? ""}`;
    return /내보내기|export/iu.test(label);
  });
  trigger?.click();
  return Boolean(trigger);
}

export function StudioModeExperienceBoundary({
  projectId,
  documentId,
  workspace,
  locale,
  children,
}: {
  readonly projectId: string | null;
  readonly documentId: string | null;
  readonly workspace: StudioDocumentWorkspace;
  readonly locale: "ko" | "en";
  readonly children: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(STUDIO_PROJECT_LIBRARY_UPDATED_EVENT, refresh);
    window.addEventListener(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(STUDIO_PROJECT_LIBRARY_UPDATED_EVENT, refresh);
      window.removeEventListener(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, refresh);
    };
  }, []);

  const context = useMemo(() => {
    void revision;
    if (!projectId || !documentId || typeof window === "undefined") return null;
    const project = readStudioProjectLibrary(window.localStorage).projects.find((candidate) => candidate.id === projectId);
    const documentState = readStudioProjectDocuments(window.localStorage, projectId);
    const studioDocument = documentState.documents.find((candidate) => candidate.id === documentId);
    if (!project || !studioDocument) return null;
    const mode = resolveStudioRuntimeMode(project, studioDocument);
    const formatProfile = project.definition
      ? studioProjectFormatProfile(project.definition.format)
      : null;
    return {
      project,
      document: studioDocument,
      mode,
      profile: studioModeProfile(mode),
      formatProfile,
    };
  }, [documentId, projectId, revision]);

  function switchWorkspace(nextWorkspace: StudioDocumentWorkspace) {
    const search = new URLSearchParams(location.search);
    search.set("workspace", nextWorkspace);
    navigate(`${location.pathname}?${search.toString()}`, { replace: false });
  }

  if (!context) return <>{children}</>;

  const profile = context.profile;
  const formatProfile = context.formatProfile;
  const projectDefinition = context.project.definition ?? null;
  const handoffs = studioModeHandoffsFor(context.mode).filter((handoff) => (
    !projectDefinition
    || projectDefinition.enabledWorkspaces.includes(handoff.target as StudioWorkspaceMode)
  ));
  const experienceLabel = formatProfile
    ? (locale === "ko" ? formatProfile.titleKo : formatProfile.titleEn)
    : studioModeLabel(profile, locale);
  const experienceDescription = formatProfile
    ? (locale === "ko" ? formatProfile.descriptionKo : formatProfile.descriptionEn)
    : profile.description[locale];
  const deliveryProfiles = projectDefinition?.deliveryProfileIds ?? profile.exports;

  return (
    <div data-studio-mode-runtime={context.mode} data-studio-project-format={formatProfile?.id ?? "standalone"} className="contents">
      {children}
      <StudioChromePortal targetId="studio-mode-chrome-slot">
      <details
        className="group fixed bottom-3 left-3 z-[72] max-w-[calc(100vw-1.5rem)]"
        data-studio-mode-experience="true"
      >
        <summary
          className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-line-strong bg-card/95 px-3 py-2 text-xs font-black text-fg shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          aria-label={locale === "ko" ? `${experienceLabel} 제작 모드 열기` : `Open ${experienceLabel} production mode`}
        >
          <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-accent">
            <Workflow size={13} aria-hidden="true" />
          </span>
          <span>{experienceLabel}</span>
          <span className="hidden font-medium text-fg-3 sm:inline">· {profile.headline[locale]}</span>
        </summary>

        <div className="mt-2 w-[min(38rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-card/98 p-4 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/95">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.6rem] font-black uppercase tracking-[0.15em] text-accent">{formatProfile ? "PROJECT FORMAT" : "MODE PROFILE"}</p>
              <h2 className="mt-1 text-sm font-black text-fg">{experienceLabel}</h2>
              <p className="mt-1 text-xs leading-5 text-fg-3">{experienceDescription}</p>
            </div>
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <Layers3 size={15} aria-hidden="true" />
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <section>
              <p className="text-[0.6rem] font-black uppercase tracking-wide text-fg-3">
                {locale === "ko" ? "작업공간" : "Workspaces"}
              </p>
              {projectDefinition ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5" data-studio-project-workspaces="true">
                  {projectDefinition.enabledWorkspaces.map((item) => (
                    <span key={item} className="rounded-full border border-line bg-card px-2 py-1 text-[0.62rem] font-semibold text-fg-3">
                      {PROJECT_WORKSPACE_LABELS[item][locale]}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="mt-2 text-[0.6rem] font-black uppercase tracking-wide text-fg-3">
                {locale === "ko" ? "현재 문서에서 전환" : "Switch this document"}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {context.document.allowedWorkspaces.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={workspace === item}
                    onClick={() => switchWorkspace(item)}
                    className={cn(
                      "min-h-8 rounded-full border px-2.5 text-[0.68rem] font-bold",
                      workspace === item
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-panel text-fg-2 hover:bg-raised",
                    )}
                  >
                    {DOCUMENT_WORKSPACE_LABELS[item][locale]}
                  </button>
                ))}
              </div>
            </section>

            <section data-studio-mode-landmark={profile.shell}>
              <p className="text-[0.6rem] font-black uppercase tracking-wide text-fg-3">AI</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {profile.aiActions.slice(0, 4).map((actionId) => (
                  <button
                    key={actionId}
                    type="button"
                    onClick={() => {
                      const opened = clickStudioAiSurface(actionId);
                      setNotice(opened
                        ? (locale === "ko" ? "이 작업에 맞는 AI 도구를 열었습니다." : "Opened the AI tool for this task.")
                        : (locale === "ko" ? "AI 메뉴에서 해당 작업을 이어서 선택하세요." : "Continue from the AI menu and choose the matching action."));
                    }}
                    className="min-h-8 rounded-full border border-line bg-panel px-2.5 text-[0.68rem] font-bold text-fg-2 hover:border-accent/45 hover:bg-accent-soft/50"
                  >
                    <Sparkles size={10} className="mr-1 inline text-accent" aria-hidden="true" />
                    {(AI_ACTION_LABELS[actionId] ?? { ko: actionId, en: actionId })[locale]}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-3 border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const opened = clickStudioExportSurface();
                  setNotice(opened
                    ? (locale === "ko" ? "내보내기 옵션을 열었습니다." : "Opened export options.")
                    : (locale === "ko" ? "상단 메뉴의 내보내기를 이용해 주세요." : "Use Export from the top menu."));
                }}
                className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
              >
                <Download size={13} aria-hidden="true" />
                {locale === "ko" ? "내보내기" : "Export"}
              </button>
              <span className="text-[0.65rem] text-fg-3">
                {deliveryProfiles.slice(0, 4).map((preset) => (EXPORT_LABELS[preset] ?? { ko: preset, en: preset })[locale]).join(" · ")}
              </span>
            </div>

            {handoffs.length > 0 ? (
              <div className="mt-3">
                <p className="text-[0.6rem] font-black uppercase tracking-wide text-fg-3">
                  {locale === "ko" ? "이어 만들기" : "Continue production"}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {handoffs.map((handoff) => (
                    <button
                      key={handoff.id}
                      type="button"
                      onClick={() => {
                        try {
                          const result = executeStudioModeHandoff(
                            window.localStorage,
                            context.project.id,
                            handoff,
                            locale,
                            { target: window, sourceDocumentId: context.document.id },
                          );
                          navigate(result.href);
                        } catch (error) {
                          setNotice(error instanceof Error ? error.message : (locale === "ko" ? "이어 만들기를 시작하지 못했습니다." : "Could not continue production."));
                        }
                      }}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-accent/35 bg-accent-soft/40 px-3 text-[0.7rem] font-black text-fg hover:bg-accent-soft"
                    >
                      {handoff.label[locale]}
                      <ArrowRight size={12} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {notice ? <p role="status" className="mt-3 rounded-lg bg-panel px-3 py-2 text-[0.68rem] text-fg-2">{notice}</p> : null}
        </div>
      </details>
      </StudioChromePortal>
    </div>
  );
}
