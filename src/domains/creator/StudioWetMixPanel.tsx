/**
 * Studio Wet Mix Panel
 * 혼색 브러시 컨트롤 — 켜면 메인 캔버스에서 선택된 이미지 위 드래그가 혼색 스트로크로 처리된다.
 * 현재 그리기 색을 칠하면서 지나간 자리의 바닥색을 붓에 머금어(묻힘율) 함께 섞어(혼색율) 얹는
 * CSP 색혼합 브러시 — 기존 스머지(밀기만)와 달리 새 안료를 얹을 수 있다.
 *
 * 이 패널 자신은 드래그도 픽셀 블렌드도 하지 않는 순수 컨트롤(무장 토글 + 크기·도포량·혼색율·
 * 묻힘율·경도 슬라이더)이다 — 실제 스트로크 수집·비동기 적용은 StudioPage 의
 * onStageDown/onStageMove/onStageUp/applyWetMixStroke 가 담당한다(문지르기·닷지/번과 동일하게
 * "패널은 상태만 보여주고 캔버스 제스처는 상위가 처리").
 *
 * 실시간 픽셀 미리보기는 없다 — 브러시 반경 커서만 드래그 중 표시되고, 실제 혼색은 드래그(한
 * 스트로크) 종료 시 한 번에 적용된다(smudge/dodge-burn 과 동일한 "제스처 1회 = 커밋 1회" 관례
 * → undo 1스텝).
 *
 * 완전히 controlled — 내부 비즈니스 상태 없음(StudioSmudgePanel/StudioDodgeBurnPanel 과 동일
 * 관례). busy/disabled 잠금은 StudioDodgeBurnPanel 의 locked 규약을 따른다.
 */
import { Droplets, Loader2 } from "lucide-react";

import { StudioSliderRow, StudioToggleChip } from "./studio-panel-ui";
import {
  WET_MIX_HARDNESS_RANGE,
  WET_MIX_PICKUP_RANGE,
  WET_MIX_RADIUS_RANGE,
  WET_MIX_STRENGTH_RANGE,
  WET_MIX_WETNESS_RANGE,
} from "./studio-wet-mix";

import type { ReactElement } from "react";

export type StudioWetMixPanelProps = {
  /** 혼색 브러시가 무장(켜짐) 상태인지. */
  active: boolean;
  /** 브러시 반경(캔버스 표시 px, WET_MIX_RADIUS_RANGE). */
  radius: number;
  /** 도포량(%, WET_MIX_STRENGTH_RANGE) — 한 번 지날 때 얹히는 안료의 양. */
  strength: number;
  /** 혼색율(%, WET_MIX_WETNESS_RANGE) — 바닥색이 섞이는 비율(0=현재 색만). */
  wetness: number;
  /** 묻힘율(%, WET_MIX_PICKUP_RANGE) — 붓이 바닥색을 새로 머금는 속도. */
  pickup: number;
  /** 경도(0..1, WET_MIX_HARDNESS_RANGE) — 1=하드 엣지, 0=최대 페더. */
  hardness: number;
  /** 현재 그리기 색(CSS 색 문자열) — 어떤 안료가 섞이는지 스와치로 보여준다. */
  paintColor: string;
  /** 스트로크 커밋(픽셀 재인코딩) 진행 중 — 컨트롤을 잠그고 스피너를 표시한다. */
  busy?: boolean;
  /** 대상 없음/잠금 등 상위 게이트 — 모든 컨트롤을 비활성화한다. */
  disabled?: boolean;
  onToggleActive: () => void;
  onRadiusChange: (value: number) => void;
  onStrengthChange: (value: number) => void;
  onWetnessChange: (value: number) => void;
  onPickupChange: (value: number) => void;
  onHardnessChange: (value: number) => void;
};

export function StudioWetMixPanel({
  active,
  radius,
  strength,
  wetness,
  pickup,
  hardness,
  paintColor,
  busy = false,
  disabled = false,
  onToggleActive,
  onRadiusChange,
  onStrengthChange,
  onWetnessChange,
  onPickupChange,
  onHardnessChange,
}: StudioWetMixPanelProps): ReactElement {
  const locked = disabled || busy;
  const statusText = busy
    ? "혼색을 적용하는 중..."
    : disabled
      ? "이미지 레이어를 선택하면 혼색 브러시를 쓸 수 있습니다."
      : active
        ? "이미지 위를 드래그하면 현재 색이 칠해지며 지나간 자리의 색과 섞입니다. 혼색율을 높이면 바닥색이 더 많이 섞이고, 묻힘율을 높이면 붓이 새 색을 더 빨리 머금어요."
        : "켜고 이미지 위를 드래그하면 물감을 얹으며 바닥색과 섞는 혼색 브러시로 칠합니다.";

  return (
    <div className="mt-2.5 space-y-2 rounded-xl border border-line bg-card/45 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">
          <Droplets size={12} aria-hidden />
          혼색 브러시
        </p>
        <span className="flex items-center gap-1.5">
          {busy && <Loader2 size={13} className="animate-spin text-accent" aria-hidden />}
          <span
            aria-hidden
            title="현재 그리기 색 — 이 색이 안료로 섞입니다."
            data-testid="wet-mix-paint-swatch"
            className="size-3.5 shrink-0 rounded-md border border-line/50 shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.25),0_1px_2px_oklch(0.1_0.01_70/0.25)] ring-1 ring-black/10"
            style={{ backgroundColor: paintColor }}
          />
        </span>
      </div>

      <StudioToggleChip
        active={active}
        disabled={locked}
        onClick={onToggleActive}
        aria-label={active ? "혼색 브러시 끄기" : "혼색 브러시 켜기"}
        title="켜고 이미지를 드래그하면 현재 색을 칠하면서 지나간 자리의 색과 섞습니다."
      >
        <span className="inline-flex items-center gap-1">
          <Droplets className="size-3" aria-hidden />
          혼색 브러시로 칠하기
        </span>
      </StudioToggleChip>

      <StudioSliderRow
        label="브러시 크기"
        min={WET_MIX_RADIUS_RANGE.min}
        max={WET_MIX_RADIUS_RANGE.max}
        step={WET_MIX_RADIUS_RANGE.step}
        value={radius}
        disabled={locked}
        onChange={onRadiusChange}
        readout={`${radius}px`}
      />

      <StudioSliderRow
        label="도포량"
        min={WET_MIX_STRENGTH_RANGE.min}
        max={WET_MIX_STRENGTH_RANGE.max}
        step={WET_MIX_STRENGTH_RANGE.step}
        value={strength}
        disabled={locked}
        onChange={onStrengthChange}
        readout={`${strength}%`}
      />

      <StudioSliderRow
        label="혼색율"
        min={WET_MIX_WETNESS_RANGE.min}
        max={WET_MIX_WETNESS_RANGE.max}
        step={WET_MIX_WETNESS_RANGE.step}
        value={wetness}
        disabled={locked}
        onChange={onWetnessChange}
        readout={`${wetness}%`}
      />

      <StudioSliderRow
        label="묻힘율"
        min={WET_MIX_PICKUP_RANGE.min}
        max={WET_MIX_PICKUP_RANGE.max}
        step={WET_MIX_PICKUP_RANGE.step}
        value={pickup}
        disabled={locked}
        onChange={onPickupChange}
        readout={`${pickup}%`}
      />

      <StudioSliderRow
        label="경도"
        min={WET_MIX_HARDNESS_RANGE.min}
        max={WET_MIX_HARDNESS_RANGE.max}
        step={WET_MIX_HARDNESS_RANGE.step}
        value={hardness}
        disabled={locked}
        onChange={onHardnessChange}
        readout={`${Math.round(hardness * 100)}%`}
      />

      <p className="text-[0.72rem] leading-relaxed text-fg-3" role="status">
        {statusText}
      </p>
    </div>
  );
}
