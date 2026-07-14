/**
 * Studio QuickShape Panel — 프리핸드→도형 자동 스냅 (AutoDraw-inspired, not a clone).
 * 켜져 있으면 StudioPage 의 onStageDown/onStageMove/타이머가 캔버스 제스처와 인식을 전담한다.
 * 순수 프레젠테이션.
 */
import { Sparkles, Shapes } from "lucide-react";

import { StudioToggleChip } from "./studio-panel-ui";

import type { ReactElement } from "react";

import { cn } from "@/lib/utils";

export type StudioQuickShapePanelProps = {
  /** 퀵셰이프 on/off. */
  active: boolean;
  /** 지금 이 순간 인식되어 미리보기 중인 도형의 한글 라벨(예: "사각형"). 인식 전/비활성이면 null. */
  matchedKindLabel: string | null;
  onToggleActive: () => void;
  className?: string;
};

export function StudioQuickShapePanel({
  active,
  matchedKindLabel,
  onToggleActive,
  className,
}: StudioQuickShapePanelProps): ReactElement {
  return (
    <div
      data-studio-smart-shape="true"
      className={cn(
        "space-y-2 border-t border-line/35 pt-2.5",
        active && "rounded-lg border border-accent/30 bg-accent-soft/15 px-2 pb-2 pt-2.5",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1 text-xs font-semibold text-fg-2">
            <Sparkles className="size-3.5 shrink-0 text-accent" aria-hidden />
            스마트 도형
          </p>
          <p className="mt-0.5 text-[0.62rem] leading-snug text-fg-3">
            낙서를 잠시 멈추면 선·원·사각형 등 깔끔한 도형으로 다듬어요.
          </p>
        </div>
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
        <p role="status" className="text-[0.7rem] leading-relaxed text-fg-2">
          {matchedKindLabel
            ? `✨ ${matchedKindLabel}(으)로 인식됐어요. 손을 떼면 확정 · 더 멈추면 정비율 고정.`
            : "선·사각형·원·삼각형·다각형을 대충 그리고 그 자리에 잠시 멈춰 보세요."}
        </p>
      )}
    </div>
  );
}
