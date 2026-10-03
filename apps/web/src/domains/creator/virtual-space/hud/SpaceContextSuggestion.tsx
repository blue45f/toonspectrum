import { Lightbulb, X } from "lucide-react";
import { memo } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioContextSuggestion } from "../studio-virtual-space-context-suggestions";

/**
 * 공간 맥락 제안 칩: 회의실에 들어오면 "회의 시작", 책상에 앉으면 "집중 모드"처럼
 * 지금 장소에 맞는 다음 행동을 한 번에 하나만 제안한다.
 * 수락해야만 실행되고, 닫으면 쿨다운 동안 다시 뜨지 않는다 (강제 팝업 아님).
 */
export const SpaceContextSuggestion = memo(function SpaceContextSuggestion({ suggestion, onAccept, onDismiss }: {
  readonly suggestion: StudioContextSuggestion;
  readonly onAccept: () => void;
  readonly onDismiss: () => void;
}) {
  const bt = useBilingual("SpaceContextSuggestion");
  return <section className="space-context-suggestion" aria-label={bt(suggestion.titleKo, suggestion.titleEn)} data-space-interactive="true">
    <Lightbulb size={18} aria-hidden />
    <div className="space-context-suggestion__text">
      <p role="status"><strong>{bt(suggestion.titleKo, suggestion.titleEn)}</strong></p>
      <p>{bt(suggestion.bodyKo, suggestion.bodyEn)}</p>
    </div>
    <div className="space-context-suggestion__actions">
      <button type="button" className="space-pill-button space-pill-button--primary" onClick={onAccept}>
        {bt(suggestion.acceptKo, suggestion.acceptEn)}
      </button>
      <button type="button" className="space-pill-button" aria-label={bt("제안 닫기", "Dismiss suggestion")} onClick={onDismiss}>
        <X size={16} aria-hidden />{bt("닫기", "Dismiss")}
      </button>
    </div>
  </section>;
});
