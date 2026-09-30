import { Check, CloudRain, Sun, Sparkles } from "lucide-react";
import { useEffect, useState, useId } from "react";

import {
  Studio3DAtmosphereEngine,
  type Studio3DAtmospherePreset,
  type WeatherPresetId,
} from "../scene-3d/studio-3d-atmosphere-weather";

export interface StudioBg3dAtmospherePanelProps {
  readonly currentPresetId?: WeatherPresetId;
  readonly onPresetChange?: (preset: Studio3DAtmospherePreset) => void;
  readonly onSunAngleChange?: (azimuthDeg: number, elevationDeg: number) => void;
  readonly disabled?: boolean;
}

/**
 * 12종 3D 하늘·기상 프리셋 갤러리 + 태양 고도/방위각 다이얼.
 * `currentPresetId`(LT 문서 권위)가 바뀌면 내부 선택 상태도 따라갑니다.
 */
export function StudioBg3dAtmospherePanel({
  currentPresetId = "golden-hour",
  onPresetChange,
  onSunAngleChange,
  disabled = false,
}: StudioBg3dAtmospherePanelProps) {
  const idPrefix = useId();
  const [selectedId, setSelectedId] = useState<WeatherPresetId>(currentPresetId);
  const [azimuth, setAzimuth] = useState(45);
  const [elevation, setElevation] = useState(30);

  // LT 문서 권위의 현재 프리셋이 바뀌면 내부 선택 상태도 따라갑니다.
  useEffect(() => {
    setSelectedId(currentPresetId);
  }, [currentPresetId]);

  const presets = Studio3DAtmosphereEngine.getAllPresets();
  const activePreset = Studio3DAtmosphereEngine.getPreset(selectedId);

  const handleSelectPreset = (presetId: WeatherPresetId) => {
    setSelectedId(presetId);
    const p = Studio3DAtmosphereEngine.getPreset(presetId);
    onPresetChange?.(p);
  };

  const handleElevationChange = (newElevation: number) => {
    setElevation(newElevation);
    onSunAngleChange?.(azimuth, newElevation);
  };

  const handleAzimuthChange = (newAzimuth: number) => {
    setAzimuth(newAzimuth);
    onSunAngleChange?.(newAzimuth, elevation);
  };

  const elevationId = `${idPrefix}-elevation`;
  const azimuthId = `${idPrefix}-azimuth`;
  const titleId = `${idPrefix}-title`;

  return (
    <div
      className="flex flex-col gap-3 p-3 text-xs text-fg"
      data-testid="bg3d-atmosphere-panel"
      aria-labelledby={titleId}
    >
      <div>
        <span id={titleId} className="mb-1 block text-[0.75rem] font-bold text-fg">
          3D 하늘 및 기상 분위기 프리셋 (12종)
        </span>
        <p className="mb-2 text-[0.65rem] leading-relaxed text-fg-3">
          하늘·안개·파티클이 한 세트로 바뀌는 배경 무드입니다. 먼저 골라보고,
          아래 태양 다이얼로 시간대를 더하세요.
        </p>
        <div
          className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
          role="group"
          aria-label="3D 하늘 및 기상 분위기 프리셋"
        >
          {presets.map((p) => {
            const selected = selectedId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() => handleSelectPreset(p.id)}
                title={`${p.name} — ${p.description}`}
                aria-pressed={selected}
                className={`flex min-w-0 flex-col items-stretch gap-1.5 rounded-lg border p-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 ${
                  selected
                    ? "border-accent bg-accent/15 text-accent shadow-sm"
                    : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"
                }`}
              >
                <span
                  className="h-7 w-full rounded-md border border-line/60"
                  style={{
                    background: `linear-gradient(180deg, ${p.lighting.ambientSkyColorHex} 0%, ${p.fog.colorHex} 100%)`,
                  }}
                  aria-hidden
                />
                <span className="flex min-w-0 items-center justify-between gap-1.5">
                  <span className="flex min-w-0 items-center gap-1.5 text-[0.7rem] font-bold">
                    {p.precipitation.kind !== "none" ? (
                      <CloudRain className="h-3.5 w-3.5 shrink-0 text-accent" />
                    ) : (
                      <Sun className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    )}
                    <span className="truncate">{p.name}</span>
                  </span>
                  {selected ? (
                    <Check className="h-3 w-3 shrink-0" aria-hidden />
                  ) : null}
                </span>
                <span className="line-clamp-1 text-[0.65rem] text-fg-3">
                  {p.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Atmosphere Detail Overview */}
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[0.7rem] font-semibold text-fg-2">조명 & 강수 상태</span>
          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[0.65rem] font-bold text-accent">
            {activePreset.name}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[0.68rem]">
          <div className="flex items-center gap-2">
            <span className="text-fg-3">태양광 색상:</span>
            <span
              className="inline-block h-3.5 w-3.5 rounded-full border border-line"
              style={{ backgroundColor: activePreset.lighting.sunColorHex }}
            />
            <span className="font-mono">{activePreset.lighting.sunColorHex}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-fg-3">안개 색상:</span>
            <span
              className="inline-block h-3.5 w-3.5 rounded-full border border-line"
              style={{ backgroundColor: activePreset.fog.colorHex }}
            />
            <span className="font-mono">{activePreset.fog.colorHex}</span>
          </div>
        </div>

        {activePreset.precipitation.kind !== "none" && (
          <div className="flex items-center gap-1.5 rounded-lg bg-raised/80 px-2 py-1 text-[0.65rem] text-fg-2">
            <Sparkles className="h-3 w-3 text-accent" />
            <span>
              강수 파티클: {activePreset.precipitation.kind} ({activePreset.precipitation.particleCount}개, 낙하 속도 {activePreset.precipitation.dropSpeed}m/s)
            </span>
          </div>
        )}
      </div>

      {/* Sun/Moon Position Dial Sliders */}
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-2.5">
        <div className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-fg-2">
          <Sun className="h-3.5 w-3.5 text-accent" aria-hidden />
          <span>태양 고도 및 방위각 제어</span>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor={elevationId} className="text-[0.68rem] text-fg-3">
              태양 고도 (Elevation)
            </label>
            <span className="font-mono text-[0.68rem]">{elevation}°</span>
          </div>
          <input
            id={elevationId}
            type="range"
            min={-10}
            max={90}
            step={1}
            value={elevation}
            disabled={disabled}
            onChange={(e) => handleElevationChange(Number(e.target.value))}
            className="accent-accent"
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor={azimuthId} className="text-[0.68rem] text-fg-3">
              태양 방위각 (Azimuth)
            </label>
            <span className="font-mono text-[0.68rem]">{azimuth}°</span>
          </div>
          <input
            id={azimuthId}
            type="range"
            min={0}
            max={360}
            step={5}
            value={azimuth}
            disabled={disabled}
            onChange={(e) => handleAzimuthChange(Number(e.target.value))}
            className="accent-accent"
          />
        </div>
      </div>
    </div>
  );
}
