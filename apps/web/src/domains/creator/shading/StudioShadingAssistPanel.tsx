import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
/**
 * Guided lighting and shading controls for ToonStudio.
 * The UI favors task language and Studio design tokens over benchmark-product terminology.
 */

import {
  Check,
  Compass,
  Layers,
  Moon,
  Sun,
  Sunset,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  LIGHT_DIRECTION_ANGLES_DEG,
  StudioAiShadingAssistEngine,
  type AmbientLightingTemperature,
  type ComputedShadingParams,
  type LightDirectionPreset,
  type LightSourceConfig,
} from "../ai/studio-ai-shading-assist";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export interface StudioShadingAssistPanelProps {
  readonly onApplyShading?: (params: ComputedShadingParams) => void;
  readonly onGenerateShadingLayer?: (params: ComputedShadingParams) => void;
  readonly className?: string;
}

const DIRECTION_PRESETS: readonly {
  id: LightDirectionPreset;
  label: string;
  compassDir: string;
}[] = Object.freeze([
  { id: "top-left", label: "좌상단", compassDir: "↖" },
  { id: "top", label: "상단 정면", compassDir: "↑" },
  { id: "top-right", label: "우상단", compassDir: "↗" },
  { id: "left", label: "좌측광", compassDir: "←" },
  { id: "backlight-rim", label: "역광/림", compassDir: "☼" },
  { id: "right", label: "우측광", compassDir: "→" },
  { id: "bottom-left", label: "좌하단", compassDir: "↙" },
  { id: "bottom", label: "하단 언더", compassDir: "↓" },
  { id: "bottom-right", label: "우하단", compassDir: "↘" },
]);

const AMBIENT_TEMPERATURES: readonly {
  id: AmbientLightingTemperature;
  label: string;
  icon: typeof Sun;
  desc: string;
}[] = Object.freeze([
  { id: "warm-dawn", label: "새벽 햇살", icon: Sun, desc: "따뜻한 보라빛 그림자" },
  { id: "neutral-day", label: "주간 자연광", icon: Sun, desc: "표준 그레이 블루 음영" },
  { id: "cool-moon", label: "야간 달빛", icon: Moon, desc: "차가운 네이비 블루 음영" },
  { id: "sunset-golden", label: "노을 석양", icon: Sunset, desc: "붉은 와인빛 그림자" },
]);

const engine = new StudioAiShadingAssistEngine();

export function StudioShadingAssistPanel({
  onApplyShading,
  onGenerateShadingLayer,
  className,
}: StudioShadingAssistPanelProps) {
  const [direction, setDirection] = useState<LightDirectionPreset>("top-left");
  const [intensity, setIntensity] = useState(75);
  const [softness, setSoftness] = useState(20);
  const [temperature, setTemperature] =
    useState<AmbientLightingTemperature>("neutral-day");
  const [enableRimLight, setEnableRimLight] = useState(true);
  const [appliedNotice, setAppliedNotice] = useState(false);

  const config: LightSourceConfig = useMemo(
    () => ({
      direction,
      intensityPercent: intensity,
      softnessPercent: softness,
      temperature,
      enableRimLight,
    }),
    [direction, intensity, softness, temperature, enableRimLight],
  );

  const computed = useMemo<ComputedShadingParams>(
    () => engine.compute(config),
    [config],
  );

  const handleApply = () => {
    if (onApplyShading) {
      onApplyShading(computed);
    }
    if (onGenerateShadingLayer) {
      onGenerateShadingLayer(computed);
    }
    setAppliedNotice(true);
    setTimeout(() => setAppliedNotice(false), 2000);
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-line bg-card p-3 text-xs text-fg shadow-sm",
        className,
      )}
      data-testid="studio-shading-assist-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line/60 pb-2">
        <div className="flex items-center gap-1.5 font-semibold text-fg-2">
          <Sun size={15} className="text-accent" aria-hidden />
          <span>자동 명암</span>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-fg-3">
        빛의 방향과 분위기를 고르면 원본을 유지한 채 명암 레이어를 만들어 줍니다.
      </p>

      {/* 8-Direction Compass Buttons */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] text-fg-3">
          <span className="flex items-center gap-1">
            <Compass size={13} className="text-accent" aria-hidden />
            <span>빛 방향</span>
          </span>
          <span className="font-semibold tabular-nums text-fg-2">
            {LIGHT_DIRECTION_ANGLES_DEG[direction]}°
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1 text-center font-bold">
          {DIRECTION_PRESETS.map((p) => {
            const isSelected = direction === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setDirection(p.id)}
                className={buttonClass({
                  size: "sm",
                  variant: isSelected ? "solid" : "outline",
                  className: cn(
                    "h-7 text-[10px] px-1 transition-all",
                    isSelected
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line text-fg-2 hover:bg-raised hover:text-fg",
                  ),
                })}
              >
                <span className="mr-1">{p.compassDir}</span>
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Ambient Temperature Modes */}
      <div className="flex flex-col gap-1.5 pt-1">
        <span className="text-[11px] text-fg-3">빛 분위기</span>
        <div className="grid grid-cols-2 gap-1.5">
          {AMBIENT_TEMPERATURES.map((temp) => {
            const isSelected = temperature === temp.id;
            const Icon = temp.icon;
            return (
              <button
                key={temp.id}
                type="button"
                onClick={() => setTemperature(temp.id)}
                className={cn(
                  "flex flex-col items-start p-1.5 rounded border text-left transition-colors",
                  isSelected
                    ? "border-accent/55 bg-accent-soft/35 text-fg"
                    : "border-line/70 bg-panel/45 text-fg-3 hover:bg-raised hover:text-fg",
                )}
              >
                <div className="flex items-center gap-1 text-[11px] font-semibold text-fg-2">
                  <Icon size={12} className="text-accent" aria-hidden />
                  <span>{temp.label}</span>
                </div>
                <span className="mt-0.5 text-[9px] text-fg-3">{temp.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sliders: Intensity & Softness */}
      <div className="flex flex-col gap-2 border-t border-line/60 pt-2">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-fg-3">명암 강도</span>
            <span className="font-semibold text-slate-200">{intensity}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            value={intensity}
            aria-label="명암 강도"
            onChange={(e) => setIntensity(Number(e.target.value))}
            className="h-6 w-full cursor-pointer accent-accent"
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-fg-3">그림자 부드러움</span>
            <span className="font-semibold text-slate-200">
              {softness === 0 ? "선명" : `${softness}%`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={softness}
            aria-label="그림자 부드러움"
            onChange={(e) => setSoftness(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
          />
        </div>
      </div>

      {/* Rim Light Checkbox & Preview Colors */}
      <div className="flex items-center justify-between border-t border-line/60 pt-2 text-[11px]">
        <label className="flex cursor-pointer items-center gap-1.5 text-fg-2">
          <input
            type="checkbox"
            checked={enableRimLight}
            onChange={(e) => setEnableRimLight(e.target.checked)}
            className="rounded accent-accent"
          />
          <span>가장자리 빛 포함</span>
        </label>
        <div className="flex items-center gap-1.5">
          <div
            className="size-3.5 rounded-full border border-line/70 shadow-sm"
            style={{ backgroundColor: computed.shadow1ColorHex }}
            title={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.shading.StudioShadingAssistPanel", "ko", "그림자 1단계: {v0}"), { v0: String(computed.shadow1ColorHex) })}
          />
          <div
            className="size-3.5 rounded-full border border-white/20 shadow-sm"
            style={{ backgroundColor: computed.shadow2ColorHex }}
            title={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.shading.StudioShadingAssistPanel", "ko", "그림자 2단계: {v0}"), { v0: String(computed.shadow2ColorHex) })}
          />
          {computed.rimLightColorHex && (
            <div
              className="size-3.5 rounded-full border border-white/20 shadow-sm"
              style={{ backgroundColor: computed.rimLightColorHex }}
              title={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.shading.StudioShadingAssistPanel", "ko", "림 라이트: {v0}"), { v0: String(computed.rimLightColorHex) })}
            />
          )}
        </div>
      </div>

      {/* Action Button: Generate Shading Layer */}
      <button
        type="button"
        onClick={handleApply}
        className={buttonClass({
          size: "sm",
          variant: "solid",
          className:
            "mt-1 h-8 w-full gap-1.5 bg-accent font-bold text-on-accent transition-colors hover:bg-accent-2",
        })}
      >
        {appliedNotice ? (
          <>
            <Check size={14} />
            <span>명암 레이어를 만들었어요</span>
          </>
        ) : (
          <>
            <Layers size={14} />
            <span>명암 레이어 만들기</span>
          </>
        )}
      </button>
    </div>
  );
}
