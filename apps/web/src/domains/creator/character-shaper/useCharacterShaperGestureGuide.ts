/** 터치 첫 사용 조작 안내의 열림 상태. 닫은 기록은 이 브라우저에만 남긴다. */
import { useCallback, useState } from "react";

export const CHARACTER_SHAPER_GESTURE_GUIDE_KEY = "toonstudio.character-shaper.gesture-guide.v1";
const SEEN = "seen";

function readGuideSeen(): boolean {
  try {
    return globalThis.localStorage?.getItem(CHARACTER_SHAPER_GESTURE_GUIDE_KEY) === SEEN;
  } catch {
    return false;
  }
}

function writeGuideSeen(): void {
  try {
    globalThis.localStorage?.setItem(CHARACTER_SHAPER_GESTURE_GUIDE_KEY, SEEN);
  } catch {
    // 저장소가 막혀 있으면 다음에 다시 안내할 뿐이다.
  }
}

/** 자동 안내는 터치 배치에서 처음 한 번만 연다. 도움말 버튼으로 언제든 다시 연다. */
export function useCharacterShaperGestureGuide(autoOpen: boolean) {
  const [dismissed, setDismissed] = useState(readGuideSeen);
  const [requested, setRequested] = useState(false);
  const open = requested || (autoOpen && !dismissed);
  const show = useCallback(() => setRequested(true), []);
  const dismiss = useCallback(() => {
    writeGuideSeen();
    setDismissed(true);
    setRequested(false);
  }, []);
  return { open, show, dismiss };
}
