/**
 * Studio QuickShape Panel — 프리핸드→도형 자동 스냅 (AutoDraw-inspired, not a clone).
 * Icon-first commercial affordance; recognition status uses glyphs over long copy.
 */
import { Sparkles, Shapes } from "lucide-react";

import { studioSmartShapeMatchToGlyph } from "./studio-commercial-residuals";
import { StudioSmartShapeKindRow } from "./studio-creative-visuals";
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
  const highlight = studioSmartShapeMatchToGlyph(matchedKindLabel);
  return (
    <div
      data-studio-smart-shape="true"
      data-studio-smart-shape-active={active ? "true" : "false"}
      className={cn(
        "space-y-2 border-t border-line/35 pt-2.5",
        active && "rounded-lg border border-accent/30 bg-accent-soft/15 px-2 pb-2 pt-2.5",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-lg border",
              active
                ? "border-accent/45 bg-accent-soft text-accent"
                : "border-line/70 bg-card text-fg-3"
            )}
            aria-hidden
          >
            {active ? <Sparkles className="size-4" /> : <Shapes className="size-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-fg-2">스마트 도형</p>
            <p className="mt-0.5 text-[0.62rem] leading-snug text-fg-3">
              낙서 후 잠시 멈추면 깔끔한 도형으로 다듬어요.
            </p>
          </div>
        </div>
        <StudioToggleChip
          active={active}
          onClick={onToggleActive}
          title="펜으로 대충 그린 도형이 멈추는 순간 정확한 도형으로 자동 스냅됩니다."
          aria-label={active ? "스마트 도형 켜짐" : "스마트 도형 꺼짐"}
        >
          <span className="inline-flex items-center gap-1">
            <Shapes className="size-3.5" aria-hidden />
            <span className="sr-only">{active ? "켜짐" : "꺼짐"}</span>
          </span>
        </StudioToggleChip>
      </div>

      {active ? (
        <div className="space-y-1.5">
          <StudioSmartShapeKindRow highlightKind={highlight} />
          <p
            role="status"
            className="flex items-center gap-1.5 text-[0.68rem] leading-relaxed text-fg-2"
            data-studio-smart-shape-status="true"
          >
            {matchedKindLabel ? (
              <>
                <Sparkles className="size-3.5 shrink-0 text-accent" aria-hidden />
                <span className="font-semibold text-accent">{matchedKindLabel}</span>
                <span className="text-fg-3">인식 · 손을 떼면 확정</span>
              </>
            ) : (
              <span className="text-fg-3">도형을 그리고 잠시 멈춰 보세요</span>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
