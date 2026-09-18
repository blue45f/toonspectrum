"use no memo";
// The legacy editor still reuses one mutable host object. Keep this shell out of React Compiler
// memoization until the remaining document/session controllers stop mutating that identity.

import { SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useState } from "react";

import type { RefObject } from "react";

import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioWebXrSessionState } from "../studio-webxr-session";
import { StudioBg3dEditorSidebar } from "./StudioBg3dEditorSidebar";
import { StudioBg3dEditorViewport } from "./StudioBg3dEditorViewport";
import { StudioBg3dSceneOutliner } from "./StudioBg3dSceneOutliner";
import { StudioBg3dProfessionalWorkspace } from "./StudioBg3dProfessionalWorkspace";
import {
  STUDIO_BG3D_CONTROL_BUTTON,
  STUDIO_BG3D_ICON_BUTTON,
  studioBg3dClassNames,
} from "./studio-bg3d-editor-ui";

import type { StudioBg3dSceneOutlinerController } from "./studio-bg3d-scene-outliner-controller";
import type { StudioBg3dExperienceMode } from "./StudioBackground3DTypes";


interface StudioBg3dShotBatchProgress {
  readonly stage: "render" | "contact" | "archive";
  readonly completed: number;
  readonly total: number;
}

export interface StudioBg3dEditorModalHost {
  readonly open: boolean;
  readonly webXrRendererLifetimeRetained: boolean;
  readonly modalDialogRef: RefObject<HTMLDivElement | null>;
  readonly isBatchRenderingShots: boolean;
  readonly shotBatchProgress: StudioBg3dShotBatchProgress | null;
  readonly shotBatchAbortRef: RefObject<AbortController | null>;
  readonly isCapturing: boolean;
  readonly deletingModelId: string | null;
  readonly webXrSessionState: StudioWebXrSessionState;
  readonly requestUserClose: () => void;
  readonly outlinerController: StudioBg3dSceneOutlinerController;
  readonly sharedStageSessionScopeKey?: string;
  readonly [key: string]: unknown;
}

interface StudioBg3dEditorModalProps {
  readonly h: StudioBg3dEditorModalHost;
}

export function StudioBg3dEditorModal({ h }: StudioBg3dEditorModalProps) {
  "use no memo";
  const {
    open,
    webXrRendererLifetimeRetained,
    modalDialogRef,
    isBatchRenderingShots,
    shotBatchProgress,
    shotBatchAbortRef,
    isCapturing,
    deletingModelId,
    webXrSessionState,
    requestUserClose,
  } = h;
  const [experienceMode, setExperienceMode] = useState<StudioBg3dExperienceMode>("simple");
  if (!open && !webXrRendererLifetimeRetained) return null;

  return (
    <div
      ref={modalDialogRef}
      aria-hidden={!open || undefined}
      aria-modal={open ? "true" : undefined}
      aria-labelledby="studio-bg3d-dialog-title"
      data-testid="studio-bg3d-dialog"
      data-studio-bg3d-workspace="professional-v2"
      data-studio-bg3d-experience={experienceMode}
      hidden={!open}
      inert={!open ? true : undefined}
      className="fixed inset-0 z-[80] bg-[oklch(0.08_0.01_70/0.94)] p-2 text-fg sm:p-4"
      role={open ? "dialog" : undefined}
      tabIndex={-1}
      style={{
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="mx-auto flex h-full max-h-full max-w-[1800px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_24px_80px_oklch(0.05_0.01_70/0.55)]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-1.5 text-accent">
              <Sparkles size={14} aria-hidden />
              {translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dEditorModal", "ko", "웹툰 제작 도우미")}</p>
            <h2
              id="studio-bg3d-dialog-title"
              className="mt-1 truncate text-lg font-bold tracking-tight text-fg sm:text-xl"
            >
              {translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dEditorModal", "ko", "3D 장면 연출")}</h2>
            <p className="mt-1 line-clamp-1 text-xs text-fg-3">
              {translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dEditorModal", "ko", "배경·포즈·구도를 먼저 잡고 선화·톤 가이드로 작화에 바로 적용하세요.")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center rounded-lg border border-line bg-card p-0.5 sm:flex" role="group" aria-label={translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dEditorModal", "ko", "3D 편집 모드")}>
              <button
                type="button"
                aria-pressed={experienceMode === "simple"}
                className="min-h-8 rounded-md px-2.5 text-[0.65rem] font-bold text-fg-2 hover:text-fg aria-pressed:bg-accent-soft aria-pressed:text-accent"
                onClick={() => setExperienceMode("simple")}
              >
                <Sparkles size={12} className="mr-1 inline" aria-hidden />{translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dEditorModal", "ko", "간편")}</button>
              <button
                type="button"
                aria-pressed={experienceMode === "pro"}
                className="min-h-8 rounded-md px-2.5 text-[0.65rem] font-bold text-fg-2 hover:text-fg aria-pressed:bg-accent-soft aria-pressed:text-accent"
                onClick={() => setExperienceMode("pro")}
              >
                <SlidersHorizontal size={12} className="mr-1 inline" aria-hidden />{translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dEditorModal", "ko", "전문")}</button>
            </div>
            {isBatchRenderingShots ? (
              <>
                <span className="sr-only" role="status" aria-live="polite">
                  {shotBatchProgress?.stage === "render" ? translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dEditorModal", "ko", "컷 렌더") : translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dEditorModal", "ko", "ZIP 생성")}{" "}
                  {shotBatchProgress?.completed ?? 0}/{shotBatchProgress?.total ?? 0}
                </span>
                <button
                  type="button"
                  className={studioBg3dClassNames(
                    STUDIO_BG3D_CONTROL_BUTTON,
                    "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                  onClick={() => shotBatchAbortRef.current?.abort()}
                >
                  <X size={14} aria-hidden />
                  {translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dEditorModal", "ko", "일괄 렌더 취소")}</button>
              </>
            ) : null}
            <button
              type="button"
              aria-label={translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dEditorModal", "ko", "닫기")}
              data-bg3d-initial-focus="true"
              title={isCapturing || deletingModelId !== null
                ? translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dEditorModal", "ko", "진행 중인 작업이 끝난 뒤 닫을 수 있습니다")
                : webXrSessionState.status !== "idle" && webXrSessionState.status !== "error"
                  ? translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dEditorModal", "ko", "AR·VR 미리보기를 종료하고 닫기")
                  : translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dEditorModal", "ko", "닫기 (Esc)")}
              className={STUDIO_BG3D_ICON_BUTTON}
              disabled={isCapturing}
              aria-disabled={deletingModelId !== null || undefined}
              onClick={requestUserClose}
            >
              <X size={17} aria-hidden />
            </button>
          </div>
        </header>
        <div
          aria-busy={isCapturing || undefined}
          inert={isCapturing}
          data-destructive-busy={deletingModelId !== null || undefined}
          className="flex min-h-0 flex-1"
        >
          <StudioBg3dProfessionalWorkspace
            scopeKey={h.sharedStageSessionScopeKey ?? null}
            outliner={<StudioBg3dSceneOutliner controller={h.outlinerController} variant="dock" />}
            viewport={<StudioBg3dEditorViewport h={h} />}
            inspector={(
              <StudioBg3dEditorSidebar
                h={h}
                experienceMode={experienceMode}
                onOpenPro={() => setExperienceMode("pro")}
              />
            )}
          />
        </div>
      </div>
    </div>
  );
}
