/**
 * Studio Looks Panel
 * 라이트룸/인스타그램 프리셋 같은 원클릭 "룩" 인스펙터 — 큐레이티드 룩을 카테고리별로 묶어
 * 칩으로 보여주고, 누르면 onApplyLook(look)으로 해당 룩을 통째로 적용한다(부모가 reset+patch).
 * 상단 유틸 줄에서 현재 요소의 필터를 복사/붙여넣기하거나 전체 초기화한다.
 * 룩 카탈로그(STUDIO_LOOKS)와 카테고리만 읽고 콜백으로만 쓰는 순수 프레젠테이션 컴포넌트(상태 없음).
 */
import { RotateCcw } from "lucide-react";

import { buttonClass } from "@/components/ui/button";

import { STUDIO_LOOKS, type StudioLook, type StudioLookCategory } from "./studio-looks";

// StudioGrainPanel과 동일한 칩 스타일 — 룩 칩에 재사용한다.
const CHIP_CLASS =
  "rounded-md border border-line bg-card px-2 py-0.5 text-[0.6rem] text-fg-2 transition-colors hover:bg-raised hover:text-fg";

// 카테고리 표시 순서 — StudioLookCategory 유니언 순서 그대로(만화→시네마틱→빈티지→감성→흑백→실험).
const CATEGORY_ORDER: StudioLookCategory[] = ["만화", "시네마틱", "빈티지", "감성", "흑백", "실험"];

export function StudioLooksPanel({
  onApplyLook,
  onCopy,
  onPaste,
  onResetAll,
  canPaste,
}: {
  onApplyLook: (look: StudioLook) => void;
  onCopy: () => void;
  onPaste: () => void;
  onResetAll: () => void;
  canPaste: boolean;
}): React.ReactElement {
  return (
    <div className="space-y-2">
      {/* 헤더 */}
      <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">원클릭 룩 (Looks)</p>

      {/* 유틸 줄 — 현재 요소 필터 복사 / 붙여넣기(클립보드 비면 비활성) / 전체 초기화 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onCopy}
          className={buttonClass({ size: "sm", variant: "quiet" })}
          title="현재 요소의 필터를 클립보드에 복사합니다."
        >
          필터 복사
        </button>
        <button
          type="button"
          onClick={onPaste}
          disabled={!canPaste}
          className={buttonClass({ size: "sm", variant: "quiet" })}
          title="복사한 필터를 현재 요소에 붙여넣습니다."
        >
          붙여넣기
        </button>
        <button
          type="button"
          onClick={onResetAll}
          className={buttonClass({ size: "sm", variant: "quiet" })}
          title="현재 요소의 모든 필터를 제거합니다."
        >
          <RotateCcw className="size-3.5" />
          전체 초기화
        </button>
      </div>

      {/* 카테고리별 룩 칩 — 카테고리 순서대로 묶고, 비어 있는 카테고리는 건너뛴다. */}
      {CATEGORY_ORDER.map((category) => {
        const looks = STUDIO_LOOKS.filter((look) => look.category === category);
        if (looks.length === 0) return null;
        return (
          <div key={category} className="space-y-1">
            <p className="text-[0.6rem] font-medium text-fg-3 uppercase tracking-wide">{category}</p>
            <div className="flex flex-wrap gap-1.5">
              {looks.map((look) => (
                <button
                  key={look.id}
                  type="button"
                  onClick={() => onApplyLook(look)}
                  title={look.tip}
                  className={CHIP_CLASS}
                >
                  {look.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
