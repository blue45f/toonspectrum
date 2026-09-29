/**
 * 스타일 프로필 출처 표시 배지(UI).
 * 그림체 매칭 렌더 결과에 본인 작품 출처를 항상 노출합니다.
 */

import type { StudioStyleAttribution } from "./studio-shaper-style-render";

export interface StudioStyleAttributionBadgeProps {
  readonly attribution: StudioStyleAttribution;
  /** 렌더에 적용된 스타일 이름(선택). */
  readonly styleName?: string;
}

export function StudioStyleAttributionBadge({ attribution, styleName }: StudioStyleAttributionBadgeProps) {
  return (
    <p role="note" aria-label="스타일 출처 표시" data-testid="studio-style-attribution-badge">
      <span>적용된 그림체: </span>
      <strong>{attribution.ownerLabel}</strong>
      {styleName ? <span> · {styleName}</span> : null}
      {attribution.workTitle ? <span> · 「{attribution.workTitle}」</span> : null}
      <span> (본인 작품 확인 완료)</span>
    </p>
  );
}
