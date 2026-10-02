/**
 * Character Shaper — the mounted surface (`/studio/character`).
 *
 * It builds the existing poser runtime (`useStudioVrmPoserController`) and the Shaper binding in
 * the *same commit* as the dialog: the shell installs its key layer on mount and reads
 * `binding.busyReason` on its first render, so a Suspense boundary between controller and dialog
 * would leave the workshop keyboard-dead for a frame. The lazy boundary therefore lives outside
 * this component (`StudioThreeDPreviewPanelStack`), exactly as it does for `StudioVrmPoser`.
 *
 * 고급 편집 swaps the whole dialog for the legacy builder over the same host — no second scene, no
 * reload — and portals a "셰이퍼로 돌아가기" button *into* the legacy dialog element so the poser's
 * own Tab trap keeps it reachable.
 */

import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { CharacterRuntimeThumbnailRecorder } from "../character-platform/thumbnail/character-runtime-thumbnail-store";
import { useCharacterAuthoringInputs } from "../character-platform/ui/use-character-authoring-inputs";
import { useCharacterPlatformWorkbench } from "../character-platform/ui/use-character-platform-workbench";
import { CharacterPlatformWorkbench } from "../character-platform/ui/CharacterPlatformWorkbench";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { StudioSurfaceErrorBoundary } from "../StudioSurfaceErrorBoundary";
import { StudioVrmPoserDialog } from "../vrm/StudioVrmPoserDialog";
import { useStudioVrmPoserController } from "../vrm/useStudioVrmPoserController";

import { StudioCharacterShaperDialog } from "./StudioCharacterShaperDialog";
import { useCharacterShaperBinding } from "./useCharacterShaperBinding";

import type { CharacterShaperOutputTarget } from "./character-shaper-ui-contract";
import type { StudioVrmPoserProps } from "../vrm/StudioVrmPoserTypes";
import type { RefObject } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export type { StudioVrmPoserProps } from "../vrm/StudioVrmPoserTypes";

const RETURN_BUTTON_CLASS = cn(
  "absolute bottom-3 left-3 z-[60] inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-accent/55 bg-panel/95 px-3 text-[0.75rem] font-semibold text-accent shadow-lg backdrop-blur",
  "transition-colors hover:bg-accent-soft motion-reduce:transition-none",
  STUDIO_FOCUS_RING,
);

export type StudioCharacterShaperProps = StudioVrmPoserProps & {
  /** Hosts without a Studio document (the character landing) save files instead of inserting. */
  readonly outputTarget?: CharacterShaperOutputTarget;
  /**
   * 3D 화면을 그리다 실패하면(그래픽 가속 꺼짐·메모리 부족) 편집기 전체가 아니라 이 작업실만 닫고
   * 이유를 알린다. 이미 자체 복구 화면을 가진 호스트(소개 페이지의 단독 편집기)는 끈다.
   */
  readonly recoverFromRenderFailure?: boolean;
};

/**
 * 스튜디오 안에서 캐릭터 셰이퍼를 여는 표면. 렌더 실패는 [StudioSurfaceErrorBoundary]가 받아
 * 원고와 편집 기록을 그대로 둔 채 "계속 열 수 없습니다" 안내와 다시 시도·닫기를 보인다.
 * 경계는 열림 여부와 상관없이 항상 같은 자리에 있어(트리 모양 불변) 닫혔다 다시 열어도 런타임 상태가 남는다.
 */
export function StudioCharacterShaper({ recoverFromRenderFailure = true, ...props }: StudioCharacterShaperProps) {
  const bt = useBilingual("StudioCharacterShaper");
  if (!recoverFromRenderFailure) return <StudioCharacterShaperSurface {...props} />;
  return (
    <StudioSurfaceErrorBoundary
      surfaceLabel={bt("캐릭터 셰이퍼", "Character Shaper")}
      detail={bt(
        "3D 화면을 그리는 중 문제가 생겨 캐릭터 셰이퍼만 닫았습니다. 그래픽 가속(WebGL)이 꺼져 있거나 메모리가 부족하면 이렇게 될 수 있습니다. 현재 원고와 편집 기록은 그대로 보존되어 있습니다.",
        "Something went wrong while drawing the 3D view, so only Character Shaper was closed. This can happen when graphics acceleration (WebGL) is off or memory is low. Your page and edit history are untouched.",
      )}
      exitLabel={bt("원고로 돌아가기", "Back to the page")}
      retryLabel={bt("다시 시도", "Try again")}
      onExit={props.onClose}
      resetKey="character-shaper"
    >
      <StudioCharacterShaperSurface {...props} />
    </StudioSurfaceErrorBoundary>
  );
}

function StudioCharacterShaperSurface({ outputTarget = "canvas", ...props }: Omit<StudioCharacterShaperProps, "recoverFromRenderFailure">) {
  const { open } = props;
  const h = useStudioVrmPoserController(props);
  const [advanced, setAdvanced] = useState(false);
  const runtimeBinding = useCharacterShaperBinding(h, { runtimeOnly: true });
  const controller = useCharacterPlatformWorkbench(h, runtimeBinding, { documentAuthority: true, legacyEditing: advanced });
  const binding = controller.binding;
  const inputHost = useCharacterAuthoringInputs(h, controller.authoring, !advanced);
  const cancelPreview = binding.cancelPreview;
  const [advancedRoot, setAdvancedRoot] = useState<HTMLElement | null>(null);
  const dialogRef = h.dialogRef as RefObject<HTMLElement | null> | undefined;

  useEffect(() => {
    if (!open) {
      cancelPreview?.();
      setAdvanced(false);
    }
  }, [cancelPreview, open]);

  // The legacy dialog owns the element; read it after its commit so the return button can be
  // portaled inside the poser's focus trap.
  useEffect(() => {
    if (!advanced) {
      setAdvancedRoot(null);
      return;
    }
    setAdvancedRoot(dialogRef?.current ?? null);
  }, [advanced, dialogRef]);

  if (!open) return null;

  if (advanced) {
    return (
      <>
        <StudioVrmPoserDialog h={h} />
        {advancedRoot
          ? createPortal(
              <button
                type="button"
                data-character-shaper-return="true"
                onClick={() => setAdvanced(false)}
                className={RETURN_BUTTON_CLASS}
              >
                <ArrowLeft size={15} aria-hidden />
                셰이퍼로 돌아가기
              </button>,
              advancedRoot,
            )
          : null}
      </>
    );
  }

  return (
    <>
      <StudioCharacterShaperDialog h={inputHost} binding={binding} outputTarget={outputTarget} onOpenAdvanced={() => setAdvanced(true)} />
      <CharacterRuntimeThumbnailRecorder h={h} binding={binding} />
      <CharacterPlatformWorkbench h={inputHost} binding={binding} controller={controller} />
    </>
  );
}
