/**
 * 캐릭터 소재 랜딩에서 바로 여는 캐릭터 셰이퍼.
 *
 * 편집 문서·Undo·렌더러·내보내기 권한은 스튜디오 안의 셰이퍼와 같다(`StudioCharacterShaper`).
 * 다른 점은 넣을 원고가 없다는 것뿐이라, 출력 대상을 파일로 두어 "캔버스에 추가" 대신 PNG·PSD
 * 저장을 주 동작으로 보여 준다. 렌더 실패는 랜딩 전체가 아니라 이 편집기만 닫는다.
 */
import { useCallback } from "react";

import { StudioSurfaceErrorBoundary } from "../StudioSurfaceErrorBoundary";

import { StudioCharacterShaper } from "./StudioCharacterShaper";

import type { StudioVrmPoserInsertResult } from "../scene-3d/studio-3d-insert-contract";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 호스트가 삽입 경로를 호출하는 예외 흐름에서도 결과를 버리지 않고 파일로 남긴다. */
function downloadCharacterPng(result: StudioVrmPoserInsertResult): boolean {
  if (typeof document === "undefined" || !result.pngDataUrl) return false;
  const anchor = document.createElement("a");
  anchor.href = result.pngDataUrl;
  anchor.download = `toonstudio-character-${Date.now()}.png`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
}

export function CharacterShaperStandaloneEditor({ onClose }: { readonly onClose: () => void }) {
  const bt = useBilingual("CharacterShaperStandaloneEditor");
  const handleInsert = useCallback((result: StudioVrmPoserInsertResult) => downloadCharacterPng(result), []);
  return (
    <StudioSurfaceErrorBoundary
      surfaceLabel={bt("캐릭터 셰이퍼", "Character Shaper")}
      detail={bt(
        "3D 편집기를 여는 중 문제가 생겨 편집기만 닫았습니다. 그래픽 가속(WebGL)이 꺼져 있거나 메모리가 부족하면 이렇게 될 수 있습니다. 다시 시도하거나 안내 페이지로 돌아가 주세요.",
        "Something went wrong while opening the 3D editor, so only the editor was closed. This can happen when graphics acceleration (WebGL) is off or memory is low. Try again or go back to the guide page.",
      )}
      exitLabel={bt("안내 페이지로 돌아가기", "Back to the guide")}
      retryLabel={bt("다시 시도", "Try again")}
      onExit={onClose}
      resetKey="character-shaper-standalone"
    >
      <StudioCharacterShaper open outputTarget="file" recoverFromRenderFailure={false} onClose={onClose} onInsert={handleInsert} />
    </StudioSurfaceErrorBoundary>
  );
}
