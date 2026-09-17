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

const EXPORT_LABELS: Readonly<Record<string, string>> = {
  "webtoon-long-image": "Long image",
  "episode-package": "Episode package",
  "platform-preview": "Platform preview",
  png: "PNG",
  jpeg: "JPEG",
  "high-resolution": "High-res",
  cover: "Cover",
  "episode-thumbnail": "Thumbnail",
  "social-square": "Social 1:1",
  "vertical-promo": "Vertical promo",
  "pitch-pdf": "Pitch PDF",
  presentation: "Presentation",
  "shot-list": "Shot list",
  animatic: "Animatic",
  "edited-image": "Edited image",
  "layered-image": "Layered image",
  "render-reference": "Render ref",
  "background-render": "Background render",
  "camera-snapshot": "Camera snapshot",
  mp4: "MP4",
  webm: "WebM",
  gif: "GIF",
  "vertical-short": "Vertical short",
};

function clickStudioAiSurface(actionId: string): boolean {
  const root = document.querySelector<HTMLElement>("[data-studio-ai-assist-hub='true']");
  if (root) {
    root.scrollIntoView({ block: "nearest" });
    window.dispatchEvent(new CustomEvent("toonspectrum:studio-mode-ai-action", { detail: { actionId } }));
    return true;
  }
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(
    "[data-studio-tool-rail='true'] button, [data-studio-app-menubar='true'] button, [data-studio-main-menu='true'] button",
  ));
  const trigger = buttons.find((button) => {
    const label = `${button.getAttribute("aria-label") ?? ""} ${button.textContent ?? ""}`;
    return /(?:\bAI\b|AI 어시스트|AI 도구)/iu.test(label);
  });
  trigger?.click();
  window.dispatchEvent(new CustomEvent("toonspectrum:studio-mode-ai-action", { detail: { actionId } }));
  return Boolean(trigger);
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
    return {
      project,
      document: studioDocument,
      mode,
      profile: studioModeProfile(mode),
    };
  }, [documentId, projectId, revision]);

  function switchWorkspace(nextWorkspace: StudioDocumentWorkspace) {
    const search = new URLSearchParams(location.search);
    search.set("workspace", nextWorkspace);
    navigate(`${location.pathname}?${search.toString()}`, { replace: false });
  }

  if (!context) return <>{children}</>;

  const handoffs = studioModeHandoffsFor(context.mode);
  const profile = context.profile;

  return (
    <div data-studio-mode-runtime={context.mode} className="contents">
      {children}
      <details
        className="group fixed bottom-3 left-3 z-[72] max-w-[calc(100vw-1.5rem)]"
        data-studio-mode-experience="true"
      >
        <summary
          className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-line-strong bg-card/95 px-3 py-2 text-xs font-black text-fg shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          aria-label={locale === "ko" ? `${studioModeLabel(profile, locale)} 제작 모드 열기` : `Open ${studioModeLabel(profile, locale)} production mode`}
        >
          <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-accent">
            <Workflow size={13} aria-hidden="true" />
          </span>
          <span>{studioModeLabel(profile, locale)}</span>
          <span className="hidden font-medium text-fg-3 sm:inline">· {profile.headline[locale]}</span>
        </summary>

        <div className="mt-2 w-[min(38rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-card/98 p-4 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/95">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.6rem] font-black uppercase tracking-[0.15em] text-accent">MODE PROFILE</p>
              <h2 className="mt-1 text-sm font-black text-fg">{profile.headline[locale]}</h2>
              <p className="mt-1 text-xs leading-5 text-fg-3">{profile.description[locale]}</p>
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
                    {item}
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
                        ? (locale === "ko" ? "AI 작업 패널을 열었습니다." : "Opened the AI work panel.")
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
                {profile.exports.slice(0, 4).map((preset) => EXPORT_LABELS[preset] ?? preset).join(" · ")}
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
                            { target: window },
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
    </div>
  );
}
