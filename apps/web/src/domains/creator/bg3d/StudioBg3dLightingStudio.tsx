import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { Check, ChevronDown, Lightbulb, SunMedium } from "lucide-react";
import { useId } from "react";

import {
  LtRangeControl,
  LtToggleRow,
} from "./studio-bg3d-control-fields";
import {
  STUDIO_BG3D_CONTROL_BUTTON,
  roundStudioBg3dNumber,
  studioBg3dClassNames as cx,
} from "./studio-bg3d-editor-ui";
import {
  STUDIO_BG3D_LIGHT_AZIMUTH_MAX_DEG,
  STUDIO_BG3D_LIGHT_AZIMUTH_MIN_DEG,
  STUDIO_BG3D_LIGHT_ELEVATION_MAX_DEG,
  STUDIO_BG3D_LIGHT_ELEVATION_MIN_DEG,
  studioBg3dLightAnglesToDirection,
  studioBg3dLightDirectionToAngles,
} from "./studio-bg3d-light-direction";
import {
  STUDIO_BG3D_LIGHTING_STUDIO_PRESETS,
  resolveStudioBg3dLightingStudioPreset,
} from "./studio-bg3d-lighting-studio";

import type { StudioBg3dLightAngles } from "./studio-bg3d-light-direction";
import type {
  StudioBg3dDirectionalLightSettings,
  StudioBg3dLightingSettings,
} from "./studio-bg3d-scene-document";

const HEX_COLOR_PATTERN = /^#[\da-f]{6}$/iu;

export interface StudioBg3dLightingStudioProps {
  readonly lighting: StudioBg3dLightingSettings;
  readonly exposure: number;
  readonly disabled?: boolean;
  readonly onUpdateLighting: (patch: Partial<StudioBg3dLightingSettings>) => void;
  readonly onUpdateExposure: (value: number) => void;
}

function clamp(value: number, minimum: number, maximum: number, fallback: number): number {
  const finite = Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, finite));
}

function safeColor(value: string): string {
  return HEX_COLOR_PATTERN.test(value) ? value.toLowerCase() : "#ffffff";
}

function StudioBg3dLightColorField({
  id,
  label,
  value,
  disabled = false,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}) {
  const color = safeColor(value);
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 items-center justify-between gap-3 border-b border-line/70 py-2 text-xs font-semibold text-fg-2"
    >
      <span>{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <output
          className="truncate font-mono text-[0.625rem] uppercase tabular-nums text-fg-3"
        >
          {color}
        </output>
        <input
          id={id}
          type="color"
          aria-label={label}
          value={color}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="size-11 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 sm:size-9 pointer-coarse:size-11"
        />
      </span>
    </label>
  );
}

function StudioBg3dDirectionalLightEditor({
  idPrefix,
  label,
  description,
  light,
  disabled = false,
  onUpdate,
}: {
  readonly idPrefix: string;
  readonly label: string;
  readonly description: string;
  readonly light: StudioBg3dDirectionalLightSettings;
  readonly disabled?: boolean;
  readonly onUpdate: (patch: Partial<StudioBg3dDirectionalLightSettings>) => void;
}) {
  const angles = studioBg3dLightDirectionToAngles(light.direction);
  const updateDirection = (patch: Partial<StudioBg3dLightAngles>) => {
    onUpdate({
      direction: studioBg3dLightAnglesToDirection({
        azimuthDeg: patch.azimuthDeg ?? angles.azimuthDeg,
        elevationDeg: patch.elevationDeg ?? angles.elevationDeg,
      }),
    });
  };

  return (
    <section aria-labelledby={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "en", "{v0}-title"), { v0: String(idPrefix) })} className="border-t border-line/70 pt-3">
      <div className="mb-1 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "en", "{v0}-title"), { v0: String(idPrefix) })} className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <SunMedium size={14} className="shrink-0 text-accent" aria-hidden />
            {label}
          </h4>
          <p className="mt-0.5 text-[0.625rem] leading-relaxed text-fg-3">
            {description}
          </p>
        </div>
        <span
          className="mt-0.5 size-4 shrink-0 rounded-full border border-line-strong"
          style={{ backgroundColor: safeColor(light.color) }}
          aria-hidden
        />
      </div>

      <StudioBg3dLightColorField
        id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "en", "{v0}-color"), { v0: String(idPrefix) })}
        label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "{v0} 색상"), { v0: String(label) })}
        value={light.color}
        disabled={disabled}
        onChange={(color) => onUpdate({ color })}
      />
      <LtRangeControl
        id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "en", "{v0}-intensity"), { v0: String(idPrefix) })}
        label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "{v0} 세기"), { v0: String(label) })}
        min={0}
        max={20}
        step={0.05}
        value={clamp(light.intensity, 0, 20, 1)}
        valueText={light.intensity.toFixed(2)}
        disabled={disabled}
        onChange={(intensity) => onUpdate({ intensity })}
      />
      <LtRangeControl
        id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "en", "{v0}-azimuth"), { v0: String(idPrefix) })}
        label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "{v0} 방위각"), { v0: String(label) })}
        min={STUDIO_BG3D_LIGHT_AZIMUTH_MIN_DEG}
        max={STUDIO_BG3D_LIGHT_AZIMUTH_MAX_DEG}
        step={1}
        value={roundStudioBg3dNumber(angles.azimuthDeg, 1)}
        valueText={`${Math.round(angles.azimuthDeg)}°`}
        disabled={disabled}
        onChange={(azimuthDeg) => updateDirection({ azimuthDeg })}
      />
      <LtRangeControl
        id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "en", "{v0}-elevation"), { v0: String(idPrefix) })}
        label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "{v0} 고도각"), { v0: String(label) })}
        min={STUDIO_BG3D_LIGHT_ELEVATION_MIN_DEG}
        max={STUDIO_BG3D_LIGHT_ELEVATION_MAX_DEG}
        step={1}
        value={roundStudioBg3dNumber(angles.elevationDeg, 1)}
        valueText={`${Math.round(angles.elevationDeg)}°`}
        disabled={disabled}
        onChange={(elevationDeg) => updateDirection({ elevationDeg })}
      />
      <LtToggleRow
        label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "{v0} 그림자"), { v0: String(label) })}
        checked={light.castsShadow}
        disabled={disabled}
        onChange={(castsShadow) => onUpdate({ castsShadow })}
      />
    </section>
  );
}

export function StudioBg3dLightingStudio({
  lighting,
  exposure,
  disabled = false,
  onUpdateLighting,
  onUpdateExposure,
}: StudioBg3dLightingStudioProps) {
  const id = useId().replaceAll(":", "");
  const panelId = `${id}-bg3d-lighting-studio`;
  const activePreset = resolveStudioBg3dLightingStudioPreset(lighting, exposure);

  const updateDirectionalLight = (
    channel: "key" | "fill",
    patch: Partial<StudioBg3dDirectionalLightSettings>,
  ) => {
    const light = { ...lighting[channel], ...patch };
    if (channel === "key") onUpdateLighting({ key: light });
    else onUpdateLighting({ fill: light });
  };

  return (
    <details
      data-testid="bg3d-lighting-studio"
      className="group mt-4 overflow-hidden rounded-lg border border-line bg-card/45 open:bg-card/70"
    >
      <summary
        className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-panel text-accent">
            <Lightbulb size={15} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "조명 스튜디오")}</span>
            <span className="block truncate text-[0.625rem] tabular-nums text-fg-3">
              {activePreset?.label ?? translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "사용자 조명")} {translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "· 키 ")}{lighting.key.intensity.toFixed(2)}
              {" · "}{translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "필 ")}{lighting.fill.intensity.toFixed(2)}
              {" · "}{translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "노출 ")}{exposure.toFixed(2)}
            </span>
          </span>
        </span>
        <ChevronDown
          size={15}
          className="shrink-0 text-fg-3 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>

      <div id={panelId} className="border-t border-line/70 px-3 pb-3 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "스튜디오 라이트 프리셋")}</h3>
            <p className="mt-0.5 text-[0.625rem] leading-relaxed text-fg-3">
              {translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "배경·안개·시간대는 유지하고 조명과 렌더 노출만 바꿉니다.")}</p>
          </div>
          <span className="shrink-0 rounded-full border border-line bg-panel px-2 py-1 text-[0.5625rem] font-semibold text-fg-3">
            {translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "비파괴")}</span>
        </div>

        <div className="mt-2 grid min-w-0 grid-cols-2 gap-1.5" role="group" aria-label={translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "스튜디오 조명 프리셋")}>
          {STUDIO_BG3D_LIGHTING_STUDIO_PRESETS.map((preset) => {
            const selected = preset.id === activePreset?.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "{v0} 조명 프리셋 적용"), { v0: String(preset.label) })}
                aria-pressed={selected}
                title={preset.description}
                disabled={disabled}
                className={cx(
                  STUDIO_BG3D_CONTROL_BUTTON,
                  "relative min-w-0 flex-col items-stretch gap-1 border-line bg-panel px-2.5 text-left text-fg-2 hover:bg-raised hover:text-fg",
                  selected && "border-accent/60 bg-accent-soft text-accent",
                )}
                onClick={() => {
                  onUpdateLighting(preset.lighting);
                  onUpdateExposure(preset.exposure);
                }}
              >
                <span className="flex min-w-0 items-center justify-between gap-1.5">
                  <span className="truncate">{preset.label}</span>
                  {selected ? <Check size={12} className="shrink-0" aria-hidden /> : null}
                </span>
                <span className="flex h-1.5 overflow-hidden rounded-full border border-line/70" aria-hidden>
                  <span className="flex-1" style={{ backgroundColor: preset.lighting.ambientColor }} />
                  <span className="flex-1" style={{ backgroundColor: preset.lighting.key.color }} />
                  <span className="flex-1" style={{ backgroundColor: preset.lighting.fill.color }} />
                </span>
              </button>
            );
          })}
        </div>

        <section aria-labelledby={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "en", "{v0}-ambient-title"), { v0: String(panelId) })} className="mt-3 border-t border-line/70 pt-3">
          <h4 id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "en", "{v0}-ambient-title"), { v0: String(panelId) })} className="text-xs font-bold text-fg">
            {translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "주변광")}</h4>
          <p className="mt-0.5 text-[0.625rem] leading-relaxed text-fg-3">
            {translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "장면 전체의 어두운 면을 열어 주는 기본광입니다.")}</p>
          <StudioBg3dLightColorField
            id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "en", "{v0}-ambient-color"), { v0: String(panelId) })}
            label={translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "주변광 색상")}
            value={lighting.ambientColor}
            disabled={disabled}
            onChange={(ambientColor) => onUpdateLighting({ ambientColor })}
          />
          <LtRangeControl
            id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "en", "{v0}-ambient-intensity"), { v0: String(panelId) })}
            label={translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "주변광 세기")}
            min={0}
            max={10}
            step={0.05}
            value={clamp(lighting.ambientIntensity, 0, 10, 0.75)}
            valueText={lighting.ambientIntensity.toFixed(2)}
            disabled={disabled}
            onChange={(ambientIntensity) => onUpdateLighting({ ambientIntensity })}
          />
        </section>

        <StudioBg3dDirectionalLightEditor
          idPrefix={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "en", "{v0}-key"), { v0: String(panelId) })}
          label={translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "키 라이트")}
          description={translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "형태와 주된 그림자 방향을 결정하는 핵심광입니다.")}
          light={lighting.key}
          disabled={disabled}
          onUpdate={(patch) => updateDirectionalLight("key", patch)}
        />
        <StudioBg3dDirectionalLightEditor
          idPrefix={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "en", "{v0}-fill"), { v0: String(panelId) })}
          label={translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "필 라이트")}
          description={translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "키 라이트 반대편의 명암 대비를 조절하는 보조광입니다.")}
          light={lighting.fill}
          disabled={disabled}
          onUpdate={(patch) => updateDirectionalLight("fill", patch)}
        />

        <section aria-labelledby={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "en", "{v0}-render-title"), { v0: String(panelId) })} className="border-t border-line/70 pt-3">
          <h4 id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "en", "{v0}-render-title"), { v0: String(panelId) })} className="text-xs font-bold text-fg">
            {translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "렌더 노출")}</h4>
          <p className="mt-0.5 text-[0.625rem] leading-relaxed text-fg-3">
            {translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "라이트 세기는 유지한 채 최종 화면의 전체 밝기를 조정합니다.")}</p>
          <LtRangeControl
            id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "en", "{v0}-exposure"), { v0: String(panelId) })}
            label={translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dLightingStudio", "ko", "노출")}
            min={0.1}
            max={8}
            step={0.05}
            value={clamp(exposure, 0.1, 8, 1)}
            valueText={`${exposure.toFixed(2)}×`}
            disabled={disabled}
            onChange={onUpdateExposure}
          />
        </section>
      </div>
    </details>
  );
}
