import {
  Blend,
  ChevronDown,
  Circle,
  Cloud,
  Copy,
  Grip,
  Layers,
  Palette,
  RectangleHorizontal,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { Switch } from "@/shared/components/ui/switch";
import { cn } from "@/shared/lib/utils";

import {
  SUBTOOL_BLEND_MODE_LABELS,
  SUBTOOL_BLEND_MODES,
  SUBTOOL_TEXTURE_MODE_LABELS,
  SUBTOOL_TEXTURE_MODES,
  SUBTOOL_TIP_SHAPE_LABELS,
  SUBTOOL_TIP_SHAPES,
  type SubToolBlendMode,
  type SubToolTextureMode,
  type SubToolTipShape,
} from "./subtool-params";
import { renameSubTool, updateSubToolParams, type SubTool } from "./subtool-store";
import { SubToolStrokePreview } from "./SubToolStrokePreview";

/**
 * 서브툴 상세 패널.
 *
 * 6개 파라미터 그룹(팁 모양 / 스트로크 간격 / 질감 오버레이 / 듀얼 브러시 /
 * 색상 지터 / 혼합 모드)을 아코디언 섹션으로 보여주고, 상단에 파라미터가
 * 반영된 획 미리보기를 렌더한다.
 *
 * 라벨은 컴포넌트 내 상수로 둔다 (i18n JSON 충돌 방지).
 */

interface SubToolDetailPanelProps {
  readonly subTool: SubTool;
  readonly onSubToolChange: (next: SubTool) => void;
  readonly className?: string;
}

const SECTION_TITLES = {
  tip: { title: "팁 모양", description: "펜촉 모양 · 각도 · 둥글기 · 크기" },
  spacing: { title: "스트로크 간격", description: "연속 도장 사이의 거리와 무작위 변화" },
  texture: { title: "질감 오버레이", description: "획 위에 얹는 종이/질감 패턴" },
  dualBrush: { title: "듀얼 브러시", description: "두 번째 팁을 함께 찍는 이중 브러시" },
  colorJitter: { title: "색상 지터", description: "도장마다 바뀌는 색조 · 채도 · 명도 · 불투명도" },
  blending: { title: "혼합 모드", description: "캔버스와 섞이는 방식과 전체 불투명도" },
} as const;

const TIP_SHAPE_ICONS: Readonly<Record<SubToolTipShape, LucideIcon>> = {
  round: Circle,
  flat: RectangleHorizontal,
  textured: Cloud,
  particle: Sparkles,
  neon: Zap,
};

function ParamSection({
  icon: Icon,
  title,
  description,
  badge,
  children,
  defaultOpen = false,
  testId,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly badge: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  readonly testId?: string;
}): ReactElement {
  return (
    <details
      className="group rounded-xl border border-line bg-card/45"
      data-testid={testId}
      open={defaultOpen || undefined}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <Icon size={15} className="shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.72rem] font-bold text-fg-2">{title}</span>
          <span className="block text-[0.61rem] text-fg-3">{description}</span>
        </span>
        <span className="max-w-36 truncate rounded-full border border-line bg-raised px-2 py-0.5 text-[0.6rem] tabular-nums text-fg-3">
          {badge}
        </span>
        <ChevronDown
          size={14}
          className="shrink-0 text-fg-3 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-1.5 border-t border-line p-2">{children}</div>
    </details>
  );
}

function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  testId,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly display: string;
  readonly onChange: (value: number) => void;
  readonly testId?: string;
}): ReactElement {
  const sliderId = useId();
  return (
    <div className="rounded-lg border border-line bg-card/55 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={sliderId}
          className="text-[0.68rem] font-semibold text-fg-2"
        >
          {label}
        </label>
        <span className="text-[0.68rem] tabular-nums text-fg">{display}</span>
      </div>
      <input
        id={sliderId}
        type="range"
        aria-label={label}
        data-testid={testId}
        className="mt-1 w-full accent-accent"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function OptionRadioGroup<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
  columns = 3,
}: {
  readonly ariaLabel: string;
  readonly options: ReadonlyArray<{
    readonly value: T;
    readonly label: string;
    readonly icon?: LucideIcon;
    readonly hint?: string;
  }>;
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly columns?: 2 | 3 | 4;
}): ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "grid gap-1.5",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-3",
        columns === 4 && "grid-cols-4",
      )}
    >
      {options.map((option) => {
        const OptionIcon = option.icon;
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.hint ?? option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 py-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              selected
                ? "border-accent/50 bg-accent-soft/30 text-fg"
                : "border-line bg-card/55 text-fg-2 hover:border-line-strong",
            )}
          >
            {OptionIcon ? (
              <OptionIcon size={15} aria-hidden className="shrink-0" />
            ) : null}
            <span className="text-[0.64rem] font-bold leading-tight">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SubToolDetailPanel({
  subTool,
  onSubToolChange,
  className,
}: SubToolDetailPanelProps): ReactElement {
  const [draftName, setDraftName] = useState(subTool.name);

  useEffect(() => {
    setDraftName(subTool.name);
  }, [subTool.name, subTool.id]);

  const params = subTool.params;

  const patchParams = (patch: Record<string, unknown>): void => {
    onSubToolChange(updateSubToolParams(subTool, patch));
  };

  const commitName = (): void => {
    if (draftName === subTool.name) return;
    try {
      onSubToolChange(renameSubTool(subTool, draftName));
    } catch {
      setDraftName(subTool.name);
    }
  };

  const tipBadge = `${SUBTOOL_TIP_SHAPE_LABELS[params.tip.shape]} · ${Math.round(params.tip.size)}px`;
  const spacingBadge = `${Math.round(params.spacing.percent)}%`;
  const textureBadge =
    params.texture.strength > 0
      ? `${Math.round(params.texture.strength * 100)}%`
      : "꺼짐";
  const dualBadge = params.dualBrush.enabled ? "켜짐" : "꺼짐";
  const jitterActive =
    params.colorJitter.hue > 0 ||
    params.colorJitter.saturation > 0 ||
    params.colorJitter.value > 0 ||
    params.colorJitter.opacity > 0;
  const jitterBadge = jitterActive ? "활성" : "꺼짐";
  const blendingBadge = `${SUBTOOL_BLEND_MODE_LABELS[params.blending.mode]} · ${Math.round(params.blending.opacity * 100)}%`;

  return (
    <section
      aria-label="서브툴 상세"
      data-testid="subtool-detail-panel"
      className={cn("space-y-2", className)}
    >
      <header className="rounded-xl border border-line bg-card/60 p-2.5">
        <div className="flex items-center gap-2">
          <input
            aria-label="서브툴 이름"
            data-testid="subtool-name-input"
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-[0.85rem] font-bold text-fg hover:border-line focus:border-accent focus:outline-none"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                (event.target as HTMLInputElement).blur();
              }
            }}
            maxLength={60}
          />
          {subTool.isPreset ? (
            <span className="shrink-0 rounded-full border border-line bg-raised px-2 py-0.5 text-[0.6rem] font-bold text-fg-3">
              프리셋
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate px-2 text-[0.62rem] text-fg-3">
          기준 브러시: <span className="font-mono">{subTool.baseBrushId}</span>
        </p>
        <SubToolStrokePreview params={params} className="mt-2" />
      </header>

      <ParamSection
        icon={Circle}
        title={SECTION_TITLES.tip.title}
        description={SECTION_TITLES.tip.description}
        badge={tipBadge}
        testId="subtool-section-tip"
        defaultOpen
      >
        <OptionRadioGroup<SubToolTipShape>
          ariaLabel="팁 모양"
          value={params.tip.shape}
          onChange={(shape) => patchParams({ tip: { ...params.tip, shape } })}
          columns={3}
          options={SUBTOOL_TIP_SHAPES.map((shape) => ({
            value: shape,
            label: SUBTOOL_TIP_SHAPE_LABELS[shape],
            icon: TIP_SHAPE_ICONS[shape],
          }))}
        />
        <div className="grid gap-1.5 sm:grid-cols-2">
          <ParamSlider
            label="팁 크기"
            value={params.tip.size}
            min={1}
            max={200}
            step={1}
            display={`${Math.round(params.tip.size)}px`}
            testId="subtool-tip-size"
            onChange={(size) => patchParams({ tip: { ...params.tip, size } })}
          />
          <ParamSlider
            label="팁 각도"
            value={params.tip.angle}
            min={0}
            max={360}
            step={1}
            display={`${Math.round(params.tip.angle)}°`}
            testId="subtool-tip-angle"
            onChange={(angle) => patchParams({ tip: { ...params.tip, angle } })}
          />
          <ParamSlider
            label="팁 둥글기"
            value={params.tip.roundness}
            min={0}
            max={1}
            step={0.01}
            display={`${Math.round(params.tip.roundness * 100)}%`}
            testId="subtool-tip-roundness"
            onChange={(roundness) =>
              patchParams({ tip: { ...params.tip, roundness } })
            }
          />
        </div>
      </ParamSection>

      <ParamSection
        icon={Grip}
        title={SECTION_TITLES.spacing.title}
        description={SECTION_TITLES.spacing.description}
        badge={spacingBadge}
        testId="subtool-section-spacing"
      >
        <div className="grid gap-1.5 sm:grid-cols-2">
          <ParamSlider
            label="간격"
            value={params.spacing.percent}
            min={1}
            max={200}
            step={1}
            display={`${Math.round(params.spacing.percent)}%`}
            testId="subtool-spacing-percent"
            onChange={(percent) =>
              patchParams({ spacing: { ...params.spacing, percent } })
            }
          />
          <ParamSlider
            label="간격 지터"
            value={params.spacing.jitter}
            min={0}
            max={1}
            step={0.01}
            display={`${Math.round(params.spacing.jitter * 100)}%`}
            testId="subtool-spacing-jitter"
            onChange={(jitter) =>
              patchParams({ spacing: { ...params.spacing, jitter } })
            }
          />
        </div>
      </ParamSection>

      <ParamSection
        icon={Layers}
        title={SECTION_TITLES.texture.title}
        description={SECTION_TITLES.texture.description}
        badge={textureBadge}
        testId="subtool-section-texture"
      >
        <OptionRadioGroup<SubToolTextureMode>
          ariaLabel="질감 혼합 모드"
          value={params.texture.mode}
          onChange={(mode) =>
            patchParams({ texture: { ...params.texture, mode } })
          }
          columns={2}
          options={SUBTOOL_TEXTURE_MODES.map((mode) => ({
            value: mode,
            label: SUBTOOL_TEXTURE_MODE_LABELS[mode],
          }))}
        />
        <div className="grid gap-1.5 sm:grid-cols-2">
          <ParamSlider
            label="질감 강도"
            value={params.texture.strength}
            min={0}
            max={1}
            step={0.01}
            display={`${Math.round(params.texture.strength * 100)}%`}
            testId="subtool-texture-strength"
            onChange={(strength) =>
              patchParams({ texture: { ...params.texture, strength } })
            }
          />
          <ParamSlider
            label="질감 스케일"
            value={params.texture.scale}
            min={0.25}
            max={4}
            step={0.05}
            display={`${params.texture.scale.toFixed(2)}×`}
            testId="subtool-texture-scale"
            onChange={(scale) =>
              patchParams({ texture: { ...params.texture, scale } })
            }
          />
        </div>
      </ParamSection>

      <ParamSection
        icon={Copy}
        title={SECTION_TITLES.dualBrush.title}
        description={SECTION_TITLES.dualBrush.description}
        badge={dualBadge}
        testId="subtool-section-dual-brush"
      >
        <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-card/55 px-2.5 py-2">
          <span className="text-[0.68rem] font-semibold text-fg-2">
            듀얼 브러시 사용
          </span>
          <Switch
            checked={params.dualBrush.enabled}
            onCheckedChange={(enabled) =>
              patchParams({ dualBrush: { ...params.dualBrush, enabled } })
            }
            aria-label="듀얼 브러시 사용"
            data-testid="subtool-dual-enabled"
          />
        </div>
        <div
          className={cn(
            "grid gap-1.5 sm:grid-cols-2",
            !params.dualBrush.enabled && "pointer-events-none opacity-50",
          )}
          aria-disabled={!params.dualBrush.enabled}
        >
          <ParamSlider
            label="듀얼 크기 비율"
            value={params.dualBrush.sizeRatio}
            min={0.1}
            max={1}
            step={0.01}
            display={`${Math.round(params.dualBrush.sizeRatio * 100)}%`}
            testId="subtool-dual-size-ratio"
            onChange={(sizeRatio) =>
              patchParams({ dualBrush: { ...params.dualBrush, sizeRatio } })
            }
          />
          <ParamSlider
            label="듀얼 간격"
            value={params.dualBrush.spacingPercent}
            min={1}
            max={200}
            step={1}
            display={`${Math.round(params.dualBrush.spacingPercent)}%`}
            testId="subtool-dual-spacing"
            onChange={(spacingPercent) =>
              patchParams({ dualBrush: { ...params.dualBrush, spacingPercent } })
            }
          />
        </div>
        <OptionRadioGroup<SubToolBlendMode>
          ariaLabel="듀얼 브러시 혼합 모드"
          value={params.dualBrush.blendMode}
          onChange={(blendMode) =>
            patchParams({ dualBrush: { ...params.dualBrush, blendMode } })
          }
          columns={4}
          options={SUBTOOL_BLEND_MODES.map((mode) => ({
            value: mode,
            label: SUBTOOL_BLEND_MODE_LABELS[mode],
          }))}
        />
      </ParamSection>

      <ParamSection
        icon={Palette}
        title={SECTION_TITLES.colorJitter.title}
        description={SECTION_TITLES.colorJitter.description}
        badge={jitterBadge}
        testId="subtool-section-color-jitter"
      >
        <div className="grid gap-1.5 sm:grid-cols-2">
          <ParamSlider
            label="색조 지터"
            value={params.colorJitter.hue}
            min={0}
            max={180}
            step={1}
            display={`${Math.round(params.colorJitter.hue)}°`}
            testId="subtool-jitter-hue"
            onChange={(hue) =>
              patchParams({ colorJitter: { ...params.colorJitter, hue } })
            }
          />
          <ParamSlider
            label="채도 지터"
            value={params.colorJitter.saturation}
            min={0}
            max={1}
            step={0.01}
            display={`${Math.round(params.colorJitter.saturation * 100)}%`}
            testId="subtool-jitter-saturation"
            onChange={(saturation) =>
              patchParams({
                colorJitter: { ...params.colorJitter, saturation },
              })
            }
          />
          <ParamSlider
            label="명도 지터"
            value={params.colorJitter.value}
            min={0}
            max={1}
            step={0.01}
            display={`${Math.round(params.colorJitter.value * 100)}%`}
            testId="subtool-jitter-value"
            onChange={(value) =>
              patchParams({ colorJitter: { ...params.colorJitter, value } })
            }
          />
          <ParamSlider
            label="불투명도 지터"
            value={params.colorJitter.opacity}
            min={0}
            max={1}
            step={0.01}
            display={`${Math.round(params.colorJitter.opacity * 100)}%`}
            testId="subtool-jitter-opacity"
            onChange={(opacity) =>
              patchParams({ colorJitter: { ...params.colorJitter, opacity } })
            }
          />
        </div>
      </ParamSection>

      <ParamSection
        icon={Blend}
        title={SECTION_TITLES.blending.title}
        description={SECTION_TITLES.blending.description}
        badge={blendingBadge}
        testId="subtool-section-blending"
      >
        <OptionRadioGroup<SubToolBlendMode>
          ariaLabel="혼합 모드"
          value={params.blending.mode}
          onChange={(mode) =>
            patchParams({ blending: { ...params.blending, mode } })
          }
          columns={4}
          options={SUBTOOL_BLEND_MODES.map((mode) => ({
            value: mode,
            label: SUBTOOL_BLEND_MODE_LABELS[mode],
          }))}
        />
        <ParamSlider
          label="불투명도"
          value={params.blending.opacity}
          min={0}
          max={1}
          step={0.01}
          display={`${Math.round(params.blending.opacity * 100)}%`}
          testId="subtool-blending-opacity"
          onChange={(opacity) =>
            patchParams({ blending: { ...params.blending, opacity } })
          }
        />
      </ParamSection>
    </section>
  );
}
