import {
  Activity,
  ChevronRight,
  CircleDot,
  Gauge,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Stamp,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { BRUSH_PRESETS } from "./studio-brush";
import {
  STUDIO_BRUSH_DYNAMICS_PRESETS,
  isStudioBrushDynamicsPresetId,
  planStudioDynamicBrush,
  studioBrushDynamicsPresetSettings,
  type NormalizedStudioBrushDynamicsSettings,
  type StudioBrushDynamicsPresetId,
} from "./studio-brush-dynamics";
import {
  findStudioBrushDynamicsMapping,
  removeStudioBrushDynamicsMapping,
  studioBrushDynamicsActiveMappingCount,
  studioBrushDynamicsPresetMatch,
  updateStudioBrushDynamicsJitter,
  updateStudioBrushDynamicsMapping,
  updateStudioBrushDynamicsPropertyBase,
  updateStudioBrushDynamicsRatio,
} from "./studio-brush-dynamics-editor";
import { StudioBrushInputControls } from "./StudioBrushInputControls";

import { cn } from "@/lib/utils";

type BrushStudioCategory = "presets" | "response" | "stamp" | "tip" | "input";

const CATEGORY_ITEMS: readonly {
  id: BrushStudioCategory;
  label: string;
  description: string;
  Icon: typeof Sparkles;
}[] = [
  { id: "presets", label: "빠른 설정", description: "용도별 시작점", Icon: Sparkles },
  { id: "response", label: "반응", description: "필압·도포량", Icon: Activity },
  { id: "stamp", label: "도장", description: "간격·산포", Icon: Stamp },
  { id: "tip", label: "촉", description: "각도·원형도", Icon: CircleDot },
  { id: "input", label: "입력", description: "전역 필압 보정", Icon: Gauge },
] as const;

export interface StudioBrushStudioProps {
  brushId: string;
  strokeWidth: number;
  color: string;
  settings: NormalizedStudioBrushDynamicsSettings;
  onSettingsChange: (settings: NormalizedStudioBrushDynamicsSettings) => void;
  onSelectDynamicsPreset: (
    id: StudioBrushDynamicsPresetId,
    settings: NormalizedStudioBrushDynamicsSettings
  ) => void;
  useVelocityPressure: boolean;
  onUseVelocityPressureChange: (value: boolean) => void;
  velocitySensitivity: number;
  onVelocitySensitivityChange: (value: number) => void;
  pressureCurve: number;
  onPressureCurveChange: (value: number) => void;
  tiltEnabled: boolean;
  onTiltEnabledChange: (value: boolean) => void;
  tipAngle: number;
  onTipAngleChange: (value: number) => void;
  tipRoundness: number;
  onTipRoundnessChange: (value: number) => void;
  density?: "compact" | "touch";
}

interface RangeRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
  hint?: string;
}

function RangeRow({ label, value, min, max, step, display, onChange, hint }: RangeRowProps) {
  return (
    <label className="block min-h-14 rounded-xl border border-line bg-card/55 px-3 py-2.5">
      <span className="flex items-center justify-between gap-3 text-xs font-semibold text-fg-2">
        <span>{label}</span>
        <span className="tabular-nums text-fg">{display}</span>
      </span>
      {hint ? <span className="mt-0.5 block text-[0.65rem] leading-relaxed text-fg-3">{hint}</span> : null}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="mt-1 h-8 w-full cursor-pointer accent-accent"
        aria-label={label}
      />
    </label>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-line bg-card/55 px-3 py-2.5 text-left transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span>
        <span className="block text-xs font-semibold text-fg-2">{label}</span>
        <span className="block text-[0.65rem] leading-relaxed text-fg-3">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-6 w-11 shrink-0 items-center rounded-full border px-0.5 transition-colors",
          checked ? "border-accent bg-accent" : "border-line-strong bg-raised"
        )}
      >
        <span
          className={cn(
            "size-4 rounded-full bg-white shadow-sm transition-transform",
            checked && "translate-x-5"
          )}
        />
      </span>
    </button>
  );
}

export function StudioBrushDynamicsPreview({
  settings,
  strokeWidth,
  color,
}: Pick<StudioBrushStudioProps, "settings" | "strokeWidth" | "color">) {
  const plan = planStudioDynamicBrush({
    points: [16, 62, 52, 35, 91, 77, 133, 27, 177, 64, 224, 42, 272, 67],
    pressures: [0.12, 0.3, 0.9, 0.55, 1, 0.42, 0.2],
    speeds: [0.15, 0.22, 0.4, 0.8, 1.2, 0.55, 0.2],
    tiltXs: [0, 8, 25, 42, 55, 24, 0],
    tiltYs: [0, 3, 14, 28, 18, 6, 0],
    twists: [0, 30, 75, 130, 210, 300, 355],
    baseWidth: Math.max(3, Math.min(28, strokeWidth)),
    baseOpacity: settings.opacity.base,
    settings,
    maxDabs: 256,
  });
  return (
    <div className="rounded-xl border border-line bg-card/55 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[0.7rem] font-semibold text-fg-2">실제 엔진 미리보기</span>
        <span className="text-[0.62rem] text-fg-3">필압 · 속도 · 기울기 · 회전</span>
      </div>
      <svg
        viewBox="0 0 288 96"
        className="h-24 w-full rounded-lg bg-panel"
        aria-hidden="true"
      >
        {plan.dabs.map((dab) => {
          // Canvas draws the clamped circular dab first, then scales its Y axis by roundness.
          // Keep the SVG preview in that exact order so very thin tips do not gain a false 0.25px ry.
          const radius = Math.max(0.25, dab.size / 2);
          return (
            <ellipse
              key={dab.index}
              cx={dab.x}
              cy={dab.y}
              rx={radius}
              ry={radius * dab.roundness}
              fill={color}
              opacity={Math.min(1, Math.max(0.02, dab.opacity * dab.flow))}
              transform={`rotate(${dab.angle} ${dab.x} ${dab.y})`}
            />
          );
        })}
      </svg>
      <p className="mt-1.5 text-[0.62rem] leading-relaxed text-fg-3">
        필압에 따라 촉 크기와 도포량이 변하고, 방향·기울기·회전 입력이 타원형 촉에 반영됩니다.
        {plan.capped ? " 미리보기 도장 수는 256개로 제한했습니다." : ""}
      </p>
    </div>
  );
}

function DynamicsRequiredNotice({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-accent/35 bg-accent-soft/35 p-4 text-xs leading-relaxed text-fg-2">
      <p className="font-semibold text-fg">입자 브러시를 먼저 선택하세요</p>
      <p className="mt-1 text-fg-3">
        빠른 설정에서 잉크 입자, 에어브러시, 드라이 미디어 중 하나를 고르면 이 설정이 실제 획에 적용됩니다.
      </p>
      {children}
    </div>
  );
}

export function StudioBrushStudio({
  brushId,
  strokeWidth,
  color,
  settings,
  onSettingsChange,
  onSelectDynamicsPreset,
  useVelocityPressure,
  onUseVelocityPressureChange,
  velocitySensitivity,
  onVelocitySensitivityChange,
  pressureCurve,
  onPressureCurveChange,
  tiltEnabled,
  onTiltEnabledChange,
  tipAngle,
  onTipAngleChange,
  tipRoundness,
  onTipRoundnessChange,
  density = "compact",
}: StudioBrushStudioProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<BrushStudioCategory>("presets");
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const tabIdBase = useId();
  const tabPanelId = useId();
  const dynamicsActive = isStudioBrushDynamicsPresetId(brushId);
  const matchedPreset = dynamicsActive ? studioBrushDynamicsPresetMatch(settings) : null;
  const mappingCount = studioBrushDynamicsActiveMappingCount(settings);
  const brushLabel = BRUSH_PRESETS.find((preset) => preset.id === brushId)?.name ?? "브러시";
  const touch = density === "touch";

  function closeStudio() {
    setOpen(false);
    globalThis.requestAnimationFrame?.(() => launcherRef.current?.focus({ preventScroll: true }));
  }

  function handleCategoryKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const tabs = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']") ?? []
    );
    const currentIndex = tabs.indexOf(event.currentTarget);
    if (currentIndex < 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const next = CATEGORY_ITEMS[nextIndex];
    if (!next) return;
    setCategory(next.id);
    tabs[nextIndex]?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const appRoot = document.getElementById("root");
    const previousRootInert = appRoot?.hasAttribute("inert") ?? false;
    document.body.style.overflow = "hidden";
    appRoot?.setAttribute("inert", "");
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeStudio();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"
        )
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (appRoot && !previousRootInert) appRoot.removeAttribute("inert");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const launcherSummary = dynamicsActive
    ? `${matchedPreset ? STUDIO_BRUSH_DYNAMICS_PRESETS.find((preset) => preset.id === matchedPreset)?.name : "사용자 지정"} · ${mappingCount}개 연결`
    : brushId === "calligraphy"
      ? `촉 ${Math.round(tipAngle)}° · 원형도 ${Math.round(tipRoundness * 100)}%`
      : "필압·속도 입력과 입자 브러시";

  const pressureWidth = findStudioBrushDynamicsMapping(settings, "width", "pressure");
  const pressureOpacity = findStudioBrushDynamicsMapping(settings, "opacity", "pressure");
  const directionAngle = findStudioBrushDynamicsMapping(settings, "angle", "direction");
  const twistAngle = findStudioBrushDynamicsMapping(settings, "angle", "twist");
  const tiltRoundness = findStudioBrushDynamicsMapping(settings, "roundness", "tilt-magnitude");

  const content = category === "presets" ? (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-bold text-fg">빠른 설정</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-fg-3">
          실제 필압·속도·기울기·회전 입력을 조합한 상용 수준 시작점입니다.
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {STUDIO_BRUSH_DYNAMICS_PRESETS.map((preset) => {
          const active = dynamicsActive && matchedPreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectDynamicsPreset(preset.id, studioBrushDynamicsPresetSettings(preset.id))}
              className={cn(
                "min-h-24 rounded-xl border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                active
                  ? "border-accent bg-accent-soft/55 text-fg"
                  : "border-line bg-card/55 text-fg-2 hover:border-accent/50 hover:bg-raised"
              )}
            >
              <span className="flex items-center justify-between gap-2 text-xs font-bold">
                {preset.name}
                {active ? <span className="rounded-full bg-accent px-2 py-0.5 text-[0.6rem] text-on-accent">사용 중</span> : null}
              </span>
              <span className="mt-1.5 block text-[0.65rem] font-normal leading-relaxed text-fg-3">
                {preset.description}
              </span>
            </button>
          );
        })}
      </div>
      <div className="rounded-xl border border-line bg-card/45 px-3 py-2.5 text-[0.68rem] leading-relaxed text-fg-3">
        프리셋을 조정하면 자동으로 사용자 지정 상태가 됩니다. 원본 프리셋은 언제든 다시 선택할 수 있습니다.
      </div>
    </div>
  ) : category === "response" ? (
    dynamicsActive ? (
      <div className="space-y-2.5">
        <div>
          <h3 className="text-sm font-bold text-fg">압력 반응과 도포량</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-3">전체 입력 보정 뒤에 각 출력 속성의 반응 범위를 적용합니다.</p>
        </div>
        <RangeRow
          label="가벼운 필압의 굵기"
          value={pressureWidth?.from ?? 0.3}
          min={0.05}
          max={1}
          step={0.05}
          display={`${Math.round((pressureWidth?.from ?? 0.3) * 100)}%`}
          onChange={(from) => onSettingsChange(updateStudioBrushDynamicsMapping(
            settings,
            "width",
            "pressure",
            { from },
            { source: "pressure", from: 0.3, to: 1.7 }
          ))}
        />
        <RangeRow
          label="강한 필압의 굵기"
          value={pressureWidth?.to ?? 1.7}
          min={0.5}
          max={2.4}
          step={0.05}
          display={`${Math.round((pressureWidth?.to ?? 1.7) * 100)}%`}
          onChange={(to) => onSettingsChange(updateStudioBrushDynamicsMapping(
            settings,
            "width",
            "pressure",
            { to },
            { source: "pressure", from: 0.3, to: 1.7 }
          ))}
        />
        <RangeRow
          label="가벼운 필압의 불투명도"
          value={pressureOpacity?.from ?? 0.5}
          min={0}
          max={1}
          step={0.05}
          display={`${Math.round((pressureOpacity?.from ?? 0.5) * 100)}%`}
          onChange={(from) => onSettingsChange(updateStudioBrushDynamicsMapping(
            settings,
            "opacity",
            "pressure",
            { from },
            { source: "pressure", from: 0.5, to: 1 }
          ))}
        />
        <RangeRow
          label="유량"
          value={settings.flow.base}
          min={0.04}
          max={1}
          step={0.02}
          display={`${Math.round(settings.flow.base * 100)}%`}
          hint="한 도장마다 쌓이는 색의 양이며, 획 투명도와 함께 최종 농도를 결정합니다."
          onChange={(base) => onSettingsChange(updateStudioBrushDynamicsPropertyBase(settings, "flow", base))}
        />
      </div>
    ) : <DynamicsRequiredNotice />
  ) : category === "stamp" ? (
    dynamicsActive ? (
      <div className="space-y-2.5">
        <div>
          <h3 className="text-sm font-bold text-fg">도장 간격과 산포</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-3">줌이 아니라 실제 촉 지름에 비례해 일관된 질감을 유지합니다.</p>
        </div>
        <RangeRow
          label="도장 간격"
          value={settings.spacingRatio ?? 0.34}
          min={0.02}
          max={1}
          step={0.01}
          display={`${Math.round((settings.spacingRatio ?? 0.34) * 100)}%`}
          hint="촉 지름 대비 이동 거리"
          onChange={(ratio) => onSettingsChange(updateStudioBrushDynamicsRatio(settings, "spacing", ratio))}
        />
        <RangeRow
          label="산포 반경"
          value={settings.scatterRatio ?? 0}
          min={0}
          max={1.2}
          step={0.01}
          display={`${Math.round((settings.scatterRatio ?? 0) * 100)}%`}
          hint="진행 경로 주변으로 퍼지는 결정론적 입자 반경"
          onChange={(ratio) => onSettingsChange(updateStudioBrushDynamicsRatio(settings, "scatter", ratio))}
        />
        <RangeRow
          label="촉 크기 무작위"
          value={settings.width.jitter?.mode === "multiply" ? settings.width.jitter.amount : 0}
          min={0}
          max={0.75}
          step={0.01}
          display={`${Math.round((settings.width.jitter?.mode === "multiply" ? settings.width.jitter.amount : 0) * 100)}%`}
          hint="같은 획은 다시 열어도 똑같이 재현됩니다."
          onChange={(amount) => onSettingsChange(updateStudioBrushDynamicsJitter(settings, "width", amount))}
        />
      </div>
    ) : <DynamicsRequiredNotice />
  ) : category === "tip" ? (
    dynamicsActive ? (
      <div className="space-y-2.5">
        <div>
          <h3 className="text-sm font-bold text-fg">방향성 펜촉</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-3">원형도가 낮을수록 각도·기울기·회전 변화가 선명해집니다.</p>
        </div>
        <RangeRow
          label="기본 촉 각도"
          value={settings.angle.base}
          min={-180}
          max={180}
          step={5}
          display={`${Math.round(settings.angle.base)}°`}
          onChange={(base) => onSettingsChange(updateStudioBrushDynamicsPropertyBase(settings, "angle", base))}
        />
        <RangeRow
          label="촉 원형도"
          value={settings.roundness.base}
          min={0.08}
          max={1}
          step={0.02}
          display={`${Math.round(settings.roundness.base * 100)}%`}
          onChange={(base) => onSettingsChange(updateStudioBrushDynamicsPropertyBase(settings, "roundness", base))}
        />
        <ToggleRow
          label="획 방향 추종"
          description="이동 방향에 맞춰 타원형 촉을 회전"
          checked={directionAngle !== null}
          onChange={(checked) => onSettingsChange(checked
            ? updateStudioBrushDynamicsMapping(
                settings,
                "angle",
                "direction",
                {},
                { source: "direction", mode: "add", from: 0, to: 360 }
              )
            : removeStudioBrushDynamicsMapping(settings, "angle", "direction"))}
        />
        <ToggleRow
          label="스타일러스 회전"
          description="지원 펜의 barrel roll·twist를 촉 각도에 반영"
          checked={twistAngle !== null}
          onChange={(checked) => onSettingsChange(checked
            ? updateStudioBrushDynamicsMapping(
                settings,
                "angle",
                "twist",
                {},
                { source: "twist", mode: "add", from: 0, to: 360 }
              )
            : removeStudioBrushDynamicsMapping(settings, "angle", "twist"))}
        />
        <ToggleRow
          label="기울기 원형도"
          description="펜을 눕힐수록 촉이 납작해지는 반응"
          checked={tiltRoundness !== null}
          onChange={(checked) => onSettingsChange(checked
            ? updateStudioBrushDynamicsMapping(
                settings,
                "roundness",
                "tilt-magnitude",
                {},
                { source: "tilt-magnitude", from: 1, to: 0.35 }
              )
            : removeStudioBrushDynamicsMapping(settings, "roundness", "tilt-magnitude"))}
        />
      </div>
    ) : brushId === "calligraphy" ? (
      <div className="space-y-2.5">
        <div>
          <h3 className="text-sm font-bold text-fg">캘리그래피 펜촉</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-3">기존 캘리그래피 획의 전용 촉 설정입니다.</p>
        </div>
        <ToggleRow
          label="스타일러스 기울기"
          description="Apple Pencil·Wacom의 tilt와 twist를 획에 저장"
          checked={tiltEnabled}
          onChange={onTiltEnabledChange}
        />
        <RangeRow
          label="기본 촉 각도"
          value={tipAngle}
          min={-180}
          max={180}
          step={5}
          display={`${Math.round(tipAngle)}°`}
          onChange={onTipAngleChange}
        />
        <RangeRow
          label="촉 원형도"
          value={tipRoundness}
          min={0.08}
          max={1}
          step={0.02}
          display={`${Math.round(tipRoundness * 100)}%`}
          onChange={onTipRoundnessChange}
        />
      </div>
    ) : <DynamicsRequiredNotice />
  ) : (
    <div>
      <div>
        <h3 className="text-sm font-bold text-fg">전역 입력 보정</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-fg-3">
          장치 입력을 먼저 보정한 뒤, 브러시별 크기·불투명도·도장 반응을 적용합니다.
        </p>
      </div>
      <StudioBrushInputControls
        density="touch"
        useVelocityPressure={useVelocityPressure}
        onUseVelocityPressureChange={onUseVelocityPressureChange}
        velocitySensitivity={velocitySensitivity}
        onVelocitySensitivityChange={onVelocitySensitivityChange}
        pressureCurve={pressureCurve}
        onPressureCurveChange={onPressureCurveChange}
      />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[0.66rem] text-fg-3 sm:grid-cols-4">
        {["필압", "속도", "기울기", "회전"].map((sensor) => (
          <span key={sensor} className="flex min-h-11 items-center justify-center rounded-lg border border-line bg-card/45 px-2 text-center">
            {sensor} 입력 준비
          </span>
        ))}
      </div>
      <p className="mt-2 text-[0.62rem] leading-relaxed text-fg-3">
        센서 지원은 브라우저와 펜 모델에 따라 다릅니다. 지원되지 않는 입력도 다른 기기에서 쓸 브러시 설정으로 저장할 수 있습니다.
      </p>
    </div>
  );

  const modal = open ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-no-fx
      className="fixed inset-0 z-[120] flex items-end justify-center bg-[oklch(0.08_0.01_70/0.78)] p-0 pb-[calc(7rem+env(safe-area-inset-bottom))] text-fg sm:items-center sm:p-4"
    >
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={closeStudio}
        className="absolute inset-0 cursor-default"
      />
      <div
        ref={dialogRef}
        className="relative flex h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-panel shadow-2xl sm:h-[min(44rem,calc(100dvh-2rem))] sm:max-w-5xl sm:rounded-2xl"
      >
        <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <SlidersHorizontal size={17} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-sm font-bold text-fg">브러시 스튜디오</h2>
            <p id={descriptionId} className="truncate text-[0.65rem] text-fg-3">
              {brushLabel} · {dynamicsActive ? `${mappingCount}개 입력 연결` : "전역 입력과 입자 브러시 설정"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const presetId = isStudioBrushDynamicsPresetId(brushId) ? brushId : "ink-particle";
              onSelectDynamicsPreset(presetId, studioBrushDynamicsPresetSettings(presetId));
            }}
            className="hidden min-h-[44px] rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised sm:block"
          >
            기본값 복원
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={closeStudio}
            aria-label="브러시 스튜디오 닫기"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X size={17} aria-hidden />
          </button>
        </header>

        <div className="shrink-0 border-b border-line p-2 sm:hidden">
          <StudioBrushDynamicsPreview settings={settings} strokeWidth={strokeWidth} color={color} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:grid sm:grid-cols-[10.5rem_minmax(0,1fr)_17rem]">
          <div
            role="tablist"
            aria-label="브러시 스튜디오 설정 분류"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 [scrollbar-width:none] sm:flex-col sm:overflow-x-visible sm:border-b-0 sm:border-r sm:p-3"
          >
            {CATEGORY_ITEMS.map(({ id, label, description, Icon }) => {
              const active = category === id;
              return (
                <button
                  key={id}
                  id={`${tabIdBase}-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={tabPanelId}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setCategory(id)}
                  onKeyDown={handleCategoryKeyDown}
                  className={cn(
                    "flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl px-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:w-full",
                    active ? "bg-accent-soft text-fg" : "text-fg-2 hover:bg-raised"
                  )}
                >
                  <Icon size={15} className={active ? "text-accent" : "text-fg-3"} aria-hidden />
                  <span>
                    <span className="block whitespace-nowrap text-xs font-semibold">{label}</span>
                    <span className="hidden text-[0.62rem] text-fg-3 sm:block">{description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <section
            id={tabPanelId}
            role="tabpanel"
            aria-labelledby={`${tabIdBase}-${category}`}
            className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4"
          >
            {content}
          </section>

          <aside className="hidden border-l border-line p-3 sm:block">
            <div className="sticky top-3 space-y-3">
              <StudioBrushDynamicsPreview settings={settings} strokeWidth={strokeWidth} color={color} />
              <div className="rounded-xl border border-line bg-card/45 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-fg-2">
                  <RotateCw size={14} className="text-accent" aria-hidden /> 재현 가능한 획
                </div>
                <p className="mt-1 text-[0.64rem] leading-relaxed text-fg-3">
                  산포와 무작위 질감은 획 ID로 고정되어 다시 열기, SVG 내보내기, 협업 재생에서도 같은 모양을 유지합니다.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-line bg-card/55 text-left transition-colors hover:border-accent/45 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
          touch ? "min-h-14 px-3 py-2" : "min-h-[44px] px-2.5 py-1.5"
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <SlidersHorizontal size={16} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-fg-2">브러시 스튜디오</span>
          <span className="block truncate text-[0.65rem] text-fg-3">{launcherSummary}</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-fg-3" aria-hidden />
      </button>
      {typeof document === "undefined" || !modal ? modal : createPortal(modal, document.body)}
    </>
  );
}
