/**
 * Studio QuickShape Panel — 퀵셰이프(프리핸드→도형 자동 스냅) on/off 토글.
 * 켜져 있으면 StudioPage 의 onStageDown/onStageMove/타이머가 캔버스 제스처와 인식을 전담한다
 * (마술봉·노드편집과 동일하게 "패널은 상태만 보여주고 캔버스 제스처는 상위가 처리").
 * 슬라이더가 없는 이유: 인식 문턱(정지 시간·코너 각도 등)은 studio-quickshape.ts 내부 튜닝
 * 상수일 뿐 사용자 노출 파라미터가 아니다(마술봉의 "허용 오차"처럼 실제로 사용자가 매 순간
 * 조절하는 값과는 다르다) — 상태 없는 순수 프레젠테이션.
 */
import { Shapes } from "lucide-react";

import { StudioToggleChip } from "./studio-panel-ui";

import type { ReactElement } from "react";

export type StudioQuickShapePanelProps = {
  /** 퀵셰이프 on/off. */
  active: boolean;
  /** 지금 이 순간 인식되어 미리보기 중인 도형의 한글 라벨(예: "사각형"). 인식 전/비활성이면 null. */
  matchedKindLabel: string | null;
  onToggleActive: () => void;
};

export function StudioQuickShapePanel({
  active,
  matchedKindLabel,
  onToggleActive,
}: StudioQuickShapePanelProps): ReactElement {
  return (
    // "그리기 도구 설정" 패널의 손떨림 보정/대칭 자/원근자와 같은 구분선 행 스타일(카드형 아님) —
    // StudioPerspectivePanel.tsx 와 동일 컨테이너에 들어가므로 그 wrapper 관례를 따른다.
    <div className="pt-2.5 border-t border-line/35 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-fg-3">퀵셰이프 (QuickShape)</p>
        <StudioToggleChip
          active={active}
          onClick={onToggleActive}
          title="펜으로 대충 그린 도형이 멈추는 순간 정확한 도형으로 자동 스냅됩니다."
        >
          <span className="inline-flex items-center gap-1">
            <Shapes className="size-3" aria-hidden />
            {active ? "켜짐" : "꺼짐"}
          </span>
        </StudioToggleChip>
      </div>

      {active && (
        <p role="status" className="text-[0.7rem] leading-relaxed text-fg-3">
          {matchedKindLabel
            ? `${matchedKindLabel}(으)로 인식됐어요. 손을 떼면 이 도형으로 확정돼요. 계속 멈춰 있으면 정비율로 고정됩니다.`
            : "펜으로 선·사각형·원·삼각형·다각형을 대충 그리고 그 자리에 잠시 멈춰보세요. 인식되면 정확한 도형으로 바뀝니다."}
        </p>
      )}
    </div>
  );
}
