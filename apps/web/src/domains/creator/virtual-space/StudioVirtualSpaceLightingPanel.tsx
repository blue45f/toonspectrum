import { Lightbulb, LightbulbOff, Moon, Sun } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  STUDIO_LIGHT_FIXTURE_KINDS,
  studioDayPhaseLabel,
  type StudioAmbientLight,
  type StudioDayPhase,
  type StudioLightFixture,
} from "./studio-virtual-space-lighting";
import {
  STUDIO_LIGHTING_PRESET_KEYS,
  STUDIO_LIGHTING_PRESETS,
  type StudioLightingPresetKey,
} from "./studio-virtual-space-lighting-presets";

/**
 * 조명 패널
 *
 * - 현재 시간대·주변광 표시 (날씨 연동)
 * - 조명 기구 켜기/끄기·밝기 조절
 * - 시간대 수동 오버라이드 (프리뷰용)
 */
export function StudioVirtualSpaceLightingPanel({
  fixtures,
  ambient,
  hour,
  hourOverride,
  onToggleFixture,
  onDimmerChange,
  onHourOverride,
  onClearHourOverride,
  onApplyPreset,
}: {
  readonly fixtures: readonly StudioLightFixture[];
  readonly ambient: StudioAmbientLight;
  /** 실제 시간 (0-23). */
  readonly hour: number;
  /** 수동 오버라이드 시간 (null이면 실제 시간). */
  readonly hourOverride: number | null;
  readonly onToggleFixture: (id: string) => void;
  readonly onDimmerChange: (id: string, dimmer: number) => void;
  readonly onHourOverride: (hour: number) => void;
  readonly onClearHourOverride: () => void;
  /** 프리셋 버튼 섹션 (없으면 숨긴다). */
  readonly onApplyPreset?: (key: StudioLightingPresetKey) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceLightingPanel");
  const phaseLabel = studioDayPhaseLabel(ambient.phase);
  const effectiveHour = hourOverride ?? hour;
  const isDay = ambient.level >= 0.7;

  const phaseOptions: readonly StudioDayPhase[] = [
    "dawn", "morning", "noon", "afternoon", "sunset", "night", "midnight",
  ];
  const phaseHour: Record<StudioDayPhase, number> = {
    dawn: 6, morning: 9, noon: 12, afternoon: 16, sunset: 19, night: 21, midnight: 2,
  };

  return (
    <section className="studio-vspace-lighting-panel" aria-label={bt("조명", "Lighting")}>
      <header className="studio-vspace-lighting-header">
        <h2>{bt("조명", "Lighting")}</h2>
        <p className="studio-vspace-lighting-phase" aria-live="polite">
          {isDay ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          <span>{bt(phaseLabel.ko, phaseLabel.en)}</span>
          <span className="studio-vspace-lighting-level">
            {bt("밝기", "Brightness")} {Math.round(ambient.level * 100)}%
          </span>
        </p>
      </header>

      <div className="studio-vspace-lighting-time" role="group" aria-label={bt("시간대 미리보기", "Time preview")}>
        <span>{bt("시간대", "Time of day")}</span>
        <div className="studio-vspace-lighting-phases">
          {phaseOptions.map((phase) => {
            const label = studioDayPhaseLabel(phase);
            const selected = ambient.phase === phase;
            return (
              <button
                key={phase}
                type="button"
                className="studio-vspace-lighting-phase-button"
                data-selected={selected}
                aria-pressed={selected}
                onClick={() => onHourOverride(phaseHour[phase])}
              >
                {bt(label.ko, label.en)}
              </button>
            );
          })}
        </div>
        {hourOverride !== null && (
          <button type="button" onClick={onClearHourOverride}>
            {bt(`실제 시간으로 (${effectiveHour}시)`, `Back to real time (${effectiveHour}:00)`)}
          </button>
        )}
      </div>

      {onApplyPreset && (
        <div className="studio-vspace-lighting-presets" role="group" aria-label={bt("조명 프리셋", "Lighting presets")}>
          <span>{bt("분위기 프리셋", "Mood presets")}</span>
          <div className="studio-vspace-lighting-preset-buttons">
            {STUDIO_LIGHTING_PRESET_KEYS.map((key) => {
              const preset = STUDIO_LIGHTING_PRESETS[key];
              return (
                <button
                  key={key}
                  type="button"
                  title={bt(preset.descriptionKo, preset.descriptionEn)}
                  onClick={() => onApplyPreset(key)}
                >
                  {bt(preset.labelKo, preset.labelEn)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ul className="studio-vspace-lighting-fixtures">
        {fixtures.map((fixture) => {
          const meta = STUDIO_LIGHT_FIXTURE_KINDS.find((kind) => kind.kind === fixture.kind);
          return (
            <li key={fixture.id} className="studio-vspace-lighting-fixture" data-on={fixture.on}>
              <button
                type="button"
                className="studio-vspace-lighting-toggle"
                aria-pressed={fixture.on}
                aria-label={bt(
                  `${meta?.labelKo ?? fixture.kind} ${fixture.on ? "끄기" : "켜기"}`,
                  `Turn ${fixture.on ? "off" : "on"} ${meta?.labelEn ?? fixture.kind}`,
                )}
                onClick={() => onToggleFixture(fixture.id)}
              >
                {fixture.on ? <Lightbulb size={18} aria-hidden /> : <LightbulbOff size={18} aria-hidden />}
                <span aria-hidden>{meta?.icon}</span>
                <span>{bt(meta?.labelKo ?? fixture.kind, meta?.labelEn ?? fixture.kind)}</span>
              </button>
              <label className="studio-vspace-lighting-dimmer">
                <span>{bt("밝기", "Dimmer")}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(fixture.dimmer * 100)}
                  disabled={!fixture.on}
                  aria-label={bt(`${meta?.labelKo ?? fixture.kind} 밝기`, `${meta?.labelEn ?? fixture.kind} brightness`)}
                  onChange={(event) => onDimmerChange(fixture.id, Number(event.target.value) / 100)}
                />
              </label>
            </li>
          );
        })}
      </ul>
      {fixtures.length === 0 && (
        <p className="studio-vspace-lighting-empty">
          {bt("배치된 조명이 없습니다. 데코레이션 에디터에서 조명을 추가하세요.", "No lights placed. Add lights from the decoration editor.")}
        </p>
      )}
    </section>
  );
}
