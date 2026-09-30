import { useEffect, useState } from "react";

import { voiceGuideEngine, type VoiceSegmentProgress } from "./voice-guide";

/**
 * 현재 발화 중인 세그먼트 진행 상황.
 *
 * 자막 하이라이트 동기화용: 세그먼트가 바뀔 때마다 리렌더되어
 * 현재 읽고 있는 문장을 강조 표시할 수 있다. 발화가 끝나거나
 * 중단되면 null이 된다.
 */
export function useVoiceSegmentProgress(): VoiceSegmentProgress | null {
  const [progress, setProgress] = useState<VoiceSegmentProgress | null>(null);

  useEffect(() => voiceGuideEngine.onSegmentChange(setProgress), []);

  return progress;
}
