import { useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import {
  CHARACTER_SHAPER_EDITOR_HISTORY_MARK,
  characterShaperEditorSearch,
  hasCharacterShaperEditorHistoryMark,
  isCharacterShaperEditorRequested,
  probeCharacterShaperWebGl,
} from "../character-shaper-entry";

/**
 * 편집기 열기 상태는 URL(`?editor=open`)이 소유한다. 뒤로 가기·새로고침·공유가 같은 화면을 낸다.
 *
 * - `editorOpen`: 편집기를 요청했고 WebGL이 확인된 경우에만 true.
 * - `webglBlocked`: 요청했지만 WebGL을 쓸 수 없어 안내만 보여야 하는 경우.
 * - `openLink`: 여는 동작은 주소 변경이라 링크로 둔다(새 탭 열기·주소 복사가 그대로 동작한다).
 */
export function useCharacterShaperEditorEntry() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requested = isCharacterShaperEditorRequested(searchParams);
  // WebGL 확인은 편집기를 요청했을 때만 한 번 한다. 확인용 컨텍스트는 즉시 반납한다.
  const webgl = useMemo(() => (requested ? probeCharacterShaperWebGl() : null), [requested]);
  const openLink = {
    to: { search: characterShaperEditorSearch(searchParams, true) },
    state: { [CHARACTER_SHAPER_EDITOR_HISTORY_MARK]: true },
  } as const;
  const close = () => {
    // 이 페이지에서 연 편집기는 뒤로 가기와 같게 닫아 기록이 쌓이지 않게 한다.
    if (hasCharacterShaperEditorHistoryMark(location.state)) navigate(-1);
    else navigate({ search: characterShaperEditorSearch(searchParams, false) }, { replace: true });
  };
  return {
    editorOpen: requested && webgl === "supported",
    webglBlocked: requested && webgl === "unsupported",
    openLink,
    close,
  };
}

export type CharacterShaperEditorEntry = ReturnType<typeof useCharacterShaperEditorEntry>;
