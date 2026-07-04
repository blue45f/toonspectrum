/**
 * Studio Bubble Shape Panel
 * 말풍선 "커스텀 모양(폴리곤 점 편집)" 인스펙터 — 전환 버튼 + 편집 모드 토글 + 되돌리기.
 *
 * StudioNodeEditPanel 과 동일한 관례를 따르는 fully-controlled 프레젠테이션 컴포넌트다:
 * 파괴적 "적용" 단계가 없다(전환은 즉시 patchEl 커밋 1건, 점 드래그도 제스처당 1건) — 상위
 * (StudioPage)가 상태를 전부 소유한다. 3가지 표시 상태:
 *   1) hasCustomShape=false        → "커스텀 모양으로 전환" 버튼만 노출.
 *   2) hasCustomShape=true,  !active → 편집 시작 토글 + 되돌리기 버튼.
 *   3) hasCustomShape=true,  active  → 편집 중 안내(핸들 개수) + 편집 종료 토글 + 되돌리기.
 */
import { Shapes, Undo2 } from "lucide-react";

import { StudioToggleChip } from "./studio-panel-ui";

import type { ReactElement } from "react";

export type StudioBubbleShapePanelProps = {
  /** 이 말풍선이 이미 커스텀 폴리곤 모양으로 전환돼 있는지. */
  hasCustomShape: boolean;
  /** 점 편집 모드 on/off — hasCustomShape=false 면 의미 없음(전환 전에는 편집할 점이 없다). */
  active: boolean;
  /** 현재 폴리곤의 점 개수(편집 중 핸들 개수와 동일) — 안내 문구에만 쓰인다. */
  pointCount: number;
  /** "커스텀 모양으로 전환" — 현재 테마/꼬리 설정 기준 윤곽을 폴리곤으로 샘플링해 저장. */
  onConvert: () => void;
  /** 점 편집 모드 토글. */
  onToggleEdit: () => void;
  /** customShapePoints 를 지우고 원래 variant 렌더링(둥근사각형/별/하트 등)으로 되돌린다. */
  onRevert: () => void;
};

export function StudioBubbleShapePanel({
  hasCustomShape,
  active,
  pointCount,
  onConvert,
  onToggleEdit,
  onRevert,
}: StudioBubbleShapePanelProps): ReactElement {
  return (
    <div className="mt-2.5 space-y-2 rounded-xl border border-line bg-card/45 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.72rem] font-semibold text-fg-3 uppercase tracking-wider">커스텀 모양</p>
        {hasCustomShape && (
          <button
            type="button"
            onClick={onRevert}
            title="기본 모양(테마·꼬리 설정 기반)으로 되돌립니다."
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.68rem] font-medium text-fg-3 hover:bg-raised hover:text-fg"
          >
            <Undo2 className="size-3" aria-hidden />
            되돌리기
          </button>
        )}
      </div>

      {!hasCustomShape ? (
        <>
          <p className="text-[0.72rem] leading-relaxed text-fg-3">
            말풍선 외곽선을 촘촘한 점 배열로 바꿔 자유롭게 모양을 조각할 수 있습니다. 전환하면 현재
            테두리 둥글기·꼬리 위치를 그대로 반영한 윤곽에서 시작하며, 별·하트 등 특수 모양은 조각의
            출발점이 되지 않고 둥근사각형(+꼬리) 윤곽으로 대체됩니다.
          </p>
          <button
            type="button"
            onClick={onConvert}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-raised px-3 py-1.5 text-[0.72rem] font-semibold text-fg transition-colors hover:bg-accent hover:text-on-accent"
          >
            <Shapes className="size-3.5" aria-hidden />
            커스텀 모양으로 전환
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-fg-2">점 편집</span>
            <StudioToggleChip
              active={active}
              onClick={onToggleEdit}
              title={active ? "점 편집을 끕니다." : "점 편집을 켜고 폴리곤 위의 점을 조절합니다."}
            >
              {active ? "편집 중" : "편집 시작"}
            </StudioToggleChip>
          </div>

          {active ? (
            pointCount < 3 ? (
              <p role="status" className="text-[0.72rem] text-fg-3">
                편집할 점이 부족합니다.
              </p>
            ) : (
              <p className="text-[0.72rem] leading-relaxed text-fg-3" role="status">
                점 {pointCount}개를 끌어 외곽선 모양을 바꿉니다. 편집은 즉시 반영되며 ⌘Z로 되돌릴 수
                있습니다. 점을 추가/삭제할 수는 없습니다(위치만 이동).
              </p>
            )
          ) : (
            <p className="text-[0.72rem] leading-relaxed text-fg-3">
              편집을 시작하면 폴리곤 위에 조절 핸들 {pointCount}개가 나타납니다.
            </p>
          )}
        </>
      )}
    </div>
  );
}
