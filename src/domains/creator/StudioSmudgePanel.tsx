/**
 * Studio Smudge Panel
 * 문지르기 브러시 컨트롤 — 켜면 메인 캔버스에서 선택된 이미지 위 드래그가 문지르기 스트로크로
 * 처리된다. 이 패널 자신은 드래그도 픽셀 블렌드도 하지 않는 순수 컨트롤(무장 토글 + 브러시
 * 크기·강도 슬라이더)이다 — 실제 스트로크 수집·비동기 블렌드 적용은 StudioPage 의
 * onStageDown/onStageMove/onStageUp/applySmudgeStroke 가 담당한다(크롭·마술봉과 동일하게
 * "패널은 상태만 보여주고 캔버스 제스처는 상위가 처리").
 *
 * 실시간 픽셀 미리보기는 없다 — 브러시 반경 커서만 드래그 중 표시되고, 실제 블렌드는 드래그(한
 * 스트로크) 종료 시 한 번에 적용된다(crop/픽셀 조정과 동일한 "제스처 1회 = 커밋 1회" 관례).
 */
import { Blend, Loader2 } from "lucide-react";

import { StudioSliderRow, StudioToggleChip } from "./studio-panel-ui";
import { SMUDGE_RADIUS_RANGE, SMUDGE_STRENGTH_RANGE } from "./studio-smudge";

import type { ReactElement } from "react";

export type StudioSmudgePanelProps = {
  /** 문지르기 브러시가 무장(켜짐) 상태인지. */
  active: boolean;
  /** 브러시 반경(캔버스 표시 px, SMUDGE_RADIUS_RANGE). */
  radius: number;
  /** 문지름 강도(%, SMUDGE_STRENGTH_RANGE). */
  strength: number;
  /** 스트로크 커밋(픽셀 재인코딩) 진행 중 — 다른 픽셀 도구와 동일 관례로 잠그지 않고 표시만. */
  busy?: boolean;
  onToggleActive: () => void;
  onRadiusChange: (value: number) => void;
  onStrengthChange: (value: number) => void;
};

export function StudioSmudgePanel({
  active,
  radius,
  strength,
  busy = false,
  onToggleActive,
  onRadiusChange,
  onStrengthChange,
}: StudioSmudgePanelProps): ReactElement {
  return (
    <div className="mt-2.5 space-y-2 rounded-xl border border-line bg-card/45 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">
          <Blend size={12} aria-hidden />
          문지르기 브러시
        </p>
        {busy && <Loader2 size={13} className="animate-spin text-accent" aria-hidden />}
      </div>

      <StudioToggleChip
        active={active}
        disabled={busy}
        onClick={onToggleActive}
        title={
          busy
            ? "현재 문지르기 스트로크를 반영하는 중입니다."
            : "켜고 이미지를 드래그하면 지나간 자리의 색이 옆으로 번지듯 섞입니다."
        }
      >
        <span className="inline-flex items-center gap-1">
          <Blend className="size-3" aria-hidden />
          문지르기로 칠하기
        </span>
      </StudioToggleChip>

      <StudioSliderRow
        label="브러시 크기"
        min={SMUDGE_RADIUS_RANGE.min}
        max={SMUDGE_RADIUS_RANGE.max}
        step={SMUDGE_RADIUS_RANGE.step}
        value={radius}
        disabled={busy}
        onChange={onRadiusChange}
        readout={`${radius}px`}
      />

      <StudioSliderRow
        label="강도"
        min={SMUDGE_STRENGTH_RANGE.min}
        max={SMUDGE_STRENGTH_RANGE.max}
        step={SMUDGE_STRENGTH_RANGE.step}
        value={strength}
        disabled={busy}
        onChange={onStrengthChange}
        readout={`${strength}%`}
      />

      <p className="text-[0.72rem] leading-relaxed text-fg-3" role="status">
        {busy
          ? "번짐을 적용하는 중..."
          : active
            ? "이미지 위를 드래그하면 지나간 자리의 색이 진행 방향으로 부드럽게 번집니다. 짧게 탭만 하면 변화가 없어요 — 문지르려면 드래그가 필요합니다."
            : "켜고 이미지 위를 드래그하면 손가락으로 문지르듯 색이 섞입니다."}
      </p>
    </div>
  );
}
