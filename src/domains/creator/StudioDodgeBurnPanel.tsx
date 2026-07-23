/**
 * Studio Dodge/Burn Panel
 * 닷지·번·스펀지 브러시 컨트롤 — 켜면 메인 캔버스에서 선택된 이미지 위 드래그가 톤/채도 보정
 * 스트로크로 처리된다. 이 패널 자신은 드래그도 픽셀 보정도 하지 않는 순수 컨트롤(무장 토글 +
 * 모드/톤 범위/스펀지 방향 선택 + 크기·경도·노출 슬라이더)이다 — 실제 스트로크 수집·비동기
 * 적용은 StudioPage 의 onStageDown/onStageMove/onStageUp/applyDodgeBurnStroke 가 담당한다
 * (문지르기·복구 브러시와 동일하게 "패널은 상태만 보여주고 캔버스 제스처는 상위가 처리").
 *
 * 실시간 픽셀 미리보기는 없다 — 브러시 반경 커서만 드래그 중 표시되고, 실제 보정은 드래그(한
 * 스트로크) 종료 시 한 번에 적용된다(smudge 와 동일한 "제스처 1회 = 커밋 1회" 관례 → undo 1스텝).
 *
 * 완전히 controlled — 내부 비즈니스 상태 없음(StudioSmudgePanel/StudioHealClonePanel 과 동일
 * 관례). 톤 범위 칩은 닷지/번 모드에서만, 스펀지 방향 칩은 스펀지 모드에서만 노출된다.
 */
import { Contrast, Loader2 } from "lucide-react";

import {
  DODGE_BURN_EXPOSURE_RANGE,
  DODGE_BURN_HARDNESS_RANGE,
  DODGE_BURN_MODES,
  DODGE_BURN_RADIUS_RANGE,
  DODGE_BURN_RANGES,
  DODGE_BURN_SPONGE_MODES,
  type DodgeBurnMode,
  type DodgeBurnRange,
  type DodgeBurnSpongeMode,
} from "./studio-dodge-burn";
import { StudioSliderRow, StudioToggleChip } from "./studio-panel-ui";

import type { ReactElement } from "react";

export type StudioDodgeBurnPanelProps = {
  /** 닷지/번 브러시가 무장(켜짐) 상태인지. */
  active: boolean;
  /** 현재 모드 — 닷지(밝게)/번(어둡게)/스펀지(채도). */
  mode: DodgeBurnMode;
  /** 닷지/번의 톤 범위(스펀지 모드에선 숨김). */
  range: DodgeBurnRange;
  /** 스펀지 하위 동작(닷지/번 모드에선 숨김). */
  sponge: DodgeBurnSpongeMode;
  /** 브러시 반경(캔버스 표시 px, DODGE_BURN_RADIUS_RANGE). */
  radiusPx: number;
  /** 경도(0..1, DODGE_BURN_HARDNESS_RANGE) — 1=하드 엣지, 0=최대 페더. */
  hardness: number;
  /** 노출(%, DODGE_BURN_EXPOSURE_RANGE). */
  exposure: number;
  /** 스트로크 커밋(픽셀 재인코딩) 진행 중 — 컨트롤을 잠그고 스피너를 표시한다. */
  busy?: boolean;
  /** 대상 없음/잠금 등 상위 게이트 — 모든 컨트롤을 비활성화한다. */
  disabled?: boolean;
  onToggleActive: () => void;
  onModeChange: (mode: DodgeBurnMode) => void;
  onRangeChange: (range: DodgeBurnRange) => void;
  onSpongeChange: (sponge: DodgeBurnSpongeMode) => void;
  onRadiusChange: (value: number) => void;
  onHardnessChange: (value: number) => void;
  onExposureChange: (value: number) => void;
};

export function StudioDodgeBurnPanel({
  active,
  mode,
  range,
  sponge,
  radiusPx,
  hardness,
  exposure,
  busy = false,
  disabled = false,
  onToggleActive,
  onModeChange,
  onRangeChange,
  onSpongeChange,
  onRadiusChange,
  onHardnessChange,
  onExposureChange,
}: StudioDodgeBurnPanelProps): ReactElement {
  const locked = disabled || busy;
  const statusText = busy
    ? "톤 보정을 적용하는 중..."
    : disabled
      ? "이미지 레이어를 선택하면 닷지/번 브러시를 쓸 수 있습니다."
      : active
        ? mode === "sponge"
          ? sponge === "saturate"
            ? "이미지 위를 드래그하면 지나간 자리의 색이 더 선명해집니다."
            : "이미지 위를 드래그하면 지나간 자리의 색이 회색 쪽으로 빠집니다."
          : mode === "dodge"
            ? "이미지 위를 드래그하면 지나간 자리의 선택한 톤이 밝아집니다. 같은 자리를 여러 번 지나면 점점 더 진하게 적용돼요."
            : "이미지 위를 드래그하면 지나간 자리의 선택한 톤이 어두워집니다. 같은 자리를 여러 번 지나면 점점 더 진하게 적용돼요."
        : "켜고 이미지 위를 드래그하면 지나간 자리가 밝아지거나(닷지) 어두워지고(번), 채도를 조절할 수 있습니다(스펀지).";

  return (
    <div className="mt-2.5 space-y-2 rounded-xl border border-line bg-card/45 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">
          <Contrast size={12} aria-hidden />
          닷지 / 번 / 스펀지
        </p>
        {busy && <Loader2 size={13} className="animate-spin text-accent" aria-hidden />}
      </div>

      <StudioToggleChip
        active={active}
        disabled={locked}
        onClick={onToggleActive}
        aria-label={active ? "닷지/번 브러시 끄기" : "닷지/번 브러시 켜기"}
        title="켜고 이미지를 드래그하면 지나간 자리의 톤·채도가 보정됩니다."
      >
        <span className="inline-flex items-center gap-1">
          <Contrast className="size-3" aria-hidden />
          닷지/번으로 보정하기
        </span>
      </StudioToggleChip>

      <div className="flex flex-wrap gap-1.5">
        {DODGE_BURN_MODES.map((m) => (
          <StudioToggleChip
            key={m.id}
            active={mode === m.id}
            disabled={locked}
            onClick={() => onModeChange(m.id)}
            title={m.tip}
          >
            {m.label}
          </StudioToggleChip>
        ))}
      </div>

      {mode === "sponge" ? (
        <div className="flex flex-wrap gap-1.5">
          {DODGE_BURN_SPONGE_MODES.map((m) => (
            <StudioToggleChip
              key={m.id}
              active={sponge === m.id}
              disabled={locked}
              onClick={() => onSpongeChange(m.id)}
              title={m.tip}
            >
              {m.label}
            </StudioToggleChip>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {DODGE_BURN_RANGES.map((r) => (
            <StudioToggleChip
              key={r.id}
              active={range === r.id}
              disabled={locked}
              onClick={() => onRangeChange(r.id)}
              title={r.tip}
            >
              {r.label}
            </StudioToggleChip>
          ))}
        </div>
      )}

      <StudioSliderRow
        label="브러시 크기"
        min={DODGE_BURN_RADIUS_RANGE.min}
        max={DODGE_BURN_RADIUS_RANGE.max}
        step={DODGE_BURN_RADIUS_RANGE.step}
        value={radiusPx}
        disabled={locked}
        onChange={onRadiusChange}
        readout={`${radiusPx}px`}
      />

      <StudioSliderRow
        label="경도"
        min={DODGE_BURN_HARDNESS_RANGE.min}
        max={DODGE_BURN_HARDNESS_RANGE.max}
        step={DODGE_BURN_HARDNESS_RANGE.step}
        value={hardness}
        disabled={locked}
        onChange={onHardnessChange}
        readout={`${Math.round(hardness * 100)}%`}
      />

      <StudioSliderRow
        label="노출"
        min={DODGE_BURN_EXPOSURE_RANGE.min}
        max={DODGE_BURN_EXPOSURE_RANGE.max}
        step={DODGE_BURN_EXPOSURE_RANGE.step}
        value={exposure}
        disabled={locked}
        onChange={onExposureChange}
        readout={`${exposure}%`}
      />

      <p className="text-[0.72rem] leading-relaxed text-fg-3" role="status">
        {statusText}
      </p>
    </div>
  );
}
