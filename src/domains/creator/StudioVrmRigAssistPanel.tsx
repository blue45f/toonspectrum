import { useId } from "react";

import {
  STUDIO_VRM_RIG_PROFILES,
  STUDIO_VRM_RIG_PROFILE_IDS,
  normalizeStudioVrmRigProfile,
  type StudioVrmRigProfileId,
} from "./studio-vrm-rig-profile";

export interface StudioVrmRigAssistPanelProps {
  readonly disabled: boolean;
  readonly jointProfile: StudioVrmRigProfileId;
  readonly fullBodyIk: boolean;
  readonly footPlant: boolean;
  readonly floorHeight: number;
  readonly onJointProfileChange: (profile: StudioVrmRigProfileId) => void;
  readonly onFullBodyIkChange: (enabled: boolean) => void;
  readonly onFootPlantChange: (enabled: boolean) => void;
  readonly onFloorHeightChange: (height: number) => void;
}

/** Controlled product panel for the versioned VRM drawing-assist rig settings. */
export function StudioVrmRigAssistPanel({
  disabled,
  jointProfile,
  fullBodyIk,
  footPlant,
  floorHeight,
  onJointProfileChange,
  onFullBodyIkChange,
  onFootPlantChange,
  onFloorHeightChange,
}: StudioVrmRigAssistPanelProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="mb-3 rounded-lg border border-line/60 bg-panel/35 p-2.5"
    >
      <h3 id={headingId} className="text-[0.7rem] font-bold text-fg">
        드로잉 관절 보조
      </h3>
      <p className="mt-1 text-[0.62rem] leading-relaxed text-fg-3">
        스타일화된 그림 참고용 프리셋입니다. 실제 사람의 연령·건강·장애·해부학적 특성이나
        안전한 관절 가동 범위를 판단하는 의료 기능이 아닙니다.
      </p>

      <label className="mt-2.5 block text-[0.68rem] font-semibold text-fg-2">
        관절 드로잉 프로필
        <select
          aria-label="관절 드로잉 프로필"
          className="mt-1 min-h-9 w-full rounded-md border border-line bg-card px-2 text-[0.68rem] text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45 pointer-coarse:min-h-11"
          disabled={disabled}
          value={jointProfile}
          onChange={(event) => {
            const profile = normalizeStudioVrmRigProfile(event.target.value);
            if (profile) onJointProfileChange(profile.id);
          }}
        >
          {STUDIO_VRM_RIG_PROFILE_IDS.map((id) => (
            <option key={id} value={id}>{STUDIO_VRM_RIG_PROFILES[id].label}</option>
          ))}
        </select>
      </label>

      <div className="mt-2.5 grid gap-2">
        <label className="flex min-h-9 cursor-pointer items-center justify-between gap-3 text-[0.68rem] font-semibold text-fg-2 pointer-coarse:min-h-11">
          <span>
            전신 IK 보조
            <span className="ml-1 font-normal text-fg-3">발 보정 일부를 골반 높이에 분담</span>
          </span>
          <input
            type="checkbox"
            aria-label="전신 IK 보조"
            checked={fullBodyIk}
            disabled={disabled}
            className="size-3.5 accent-accent"
            onChange={(event) => onFullBodyIkChange(event.target.checked)}
          />
        </label>
        <label className="flex min-h-9 cursor-pointer items-center justify-between gap-3 text-[0.68rem] font-semibold text-fg-2 pointer-coarse:min-h-11">
          <span>
            발 바닥 고정
            <span className="ml-1 font-normal text-fg-3">발 핸들 목표를 바닥 높이에 맞춤</span>
          </span>
          <input
            type="checkbox"
            aria-label="발 바닥 고정"
            checked={footPlant}
            disabled={disabled}
            className="size-3.5 accent-accent"
            onChange={(event) => onFootPlantChange(event.target.checked)}
          />
        </label>
      </div>

      <label className="mt-2.5 block text-[0.68rem] font-semibold text-fg-2">
        <span className="flex items-center justify-between gap-2">
          <span>바닥 높이</span>
          <output className="numeral text-fg-3">{floorHeight.toFixed(2)}m</output>
        </span>
        <input
          type="range"
          aria-label="발 고정 바닥 높이"
          min="-10"
          max="10"
          step="0.01"
          value={floorHeight}
          disabled={disabled || !footPlant}
          className="mt-1.5 h-2 w-full accent-accent disabled:opacity-45"
          onChange={(event) => onFloorHeightChange(Number(event.target.value))}
        />
      </label>
      {fullBodyIk && !footPlant ? (
        <p className="mt-1.5 text-[0.62rem] leading-relaxed text-fg-3" role="status">
          전신 보조는 발 바닥 고정을 켠 뒤 발 핸들을 움직일 때 적용됩니다.
        </p>
      ) : null}
    </section>
  );
}
