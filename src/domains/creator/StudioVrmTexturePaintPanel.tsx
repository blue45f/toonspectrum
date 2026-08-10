import {
  AlertTriangle,
  Eraser,
  PaintBucket,
  Paintbrush,
  Pipette,
  Redo2,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";

import type {
  StudioStampBrushKind,
  StudioStampBrushTuning,
} from "./studio-brush-stamp-engine";
import type { StudioVrmTextureFillScope } from "./studio-vrm-texture-fill";
import type { StudioVrmTexturePaintBlendMode } from "./studio-vrm-texture-paint-ops";

import { cn } from "@/lib/utils";

export interface StudioVrmTexturePaintPanelSettings {
  readonly tool: "surface-brush" | "brush" | "fill";
  readonly brushKind: StudioStampBrushKind;
  readonly color: string;
  /** Texture-space diameter in texels. */
  readonly sizeTexels: number;
  readonly opacity: number;
  readonly blend: StudioVrmTexturePaintBlendMode;
  readonly fillScope: StudioVrmTextureFillScope;
  readonly fillTolerance: number;
  readonly tuning: Required<StudioStampBrushTuning>;
}

export interface StudioVrmTexturePaintPanelProps {
  readonly hidden: boolean;
  readonly disabled: boolean;
  readonly settings: StudioVrmTexturePaintPanelSettings;
  readonly activeTargetId: string | null;
  readonly activeTextureLabel: string | null;
  readonly status: string;
  readonly restoreError?: string | null;
  readonly strokeActive: boolean;
  readonly targetCount: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly eyedropperActive: boolean;
  readonly onSettingsChange: (
    update: Partial<Omit<StudioVrmTexturePaintPanelSettings, "tuning">> & {
      tuning?: Partial<StudioVrmTexturePaintPanelSettings["tuning"]>;
    },
  ) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onEyedropperToggle: () => void;
  readonly onResetActiveTexture: () => void;
  readonly onRetryRestore?: () => void;
}

const BRUSHES: ReadonlyArray<{
  readonly id: StudioStampBrushKind;
  readonly label: string;
  readonly description: string;
}> = [
  { id: "ink", label: "잉크", description: "선명하고 압력 반응이 큰 채색" },
  { id: "pencil", label: "연필", description: "입자가 남는 거친 덧칠" },
  { id: "airbrush", label: "에어", description: "부드러운 명암과 그라데이션" },
  { id: "watercolor", label: "수채", description: "겹칠수록 농도가 쌓이는 워시" },
];

const BLENDS: ReadonlyArray<{
  readonly id: StudioVrmTexturePaintBlendMode;
  readonly label: string;
}> = [
  { id: "normal", label: "일반" },
  { id: "multiply", label: "곱하기" },
  { id: "screen", label: "스크린" },
  { id: "overlay", label: "오버레이" },
  { id: "erase", label: "지우개" },
];

const HEX_COLOR = /^#[0-9a-f]{6}$/iu;

interface StudioVrmTexturePaintColorDraft {
  readonly sourceColor: string;
  readonly value: string;
}

function PercentageSlider({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly disabled: boolean;
  readonly onChange: (value: number) => void;
}) {
  return (
    <label htmlFor={id} className="grid grid-cols-[3rem_minmax(0,1fr)_2.7rem] items-center gap-2 text-xs">
      <span className="font-semibold text-fg-2">{label}</span>
      <input
        id={id}
        type="range"
        min="0.03"
        max="1"
        step="0.01"
        value={value}
        disabled={disabled}
        aria-label={label}
        className="h-2 min-w-0 accent-accent disabled:cursor-not-allowed disabled:opacity-45"
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output htmlFor={id} className="text-right text-[0.68rem] tabular-nums text-fg-3">
        {Math.round(value * 100)}%
      </output>
    </label>
  );
}

export function StudioVrmTexturePaintPanel({
  hidden,
  disabled,
  settings,
  activeTargetId,
  activeTextureLabel,
  status,
  restoreError,
  strokeActive,
  targetCount,
  canUndo,
  canRedo,
  eyedropperActive,
  onSettingsChange,
  onUndo,
  onRedo,
  onEyedropperToggle,
  onResetActiveTexture,
  onRetryRestore,
}: StudioVrmTexturePaintPanelProps) {
  const editingDisabled = disabled || strokeActive;
  const brushTool = settings.tool !== "fill";
  const surfaceBrushTool = settings.tool === "surface-brush";
  const hasActiveTexture = activeTargetId !== null;
  const [resetConfirmationTarget, setResetConfirmationTarget] = useState<string | null>(null);
  const resetArmed =
    activeTargetId !== null && resetConfirmationTarget === activeTargetId;
  useEffect(() => {
    setResetConfirmationTarget(null);
  }, [activeTargetId]);
  useEffect(() => {
    if (resetConfirmationTarget === null) return;
    const timer = window.setTimeout(() => setResetConfirmationTarget(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [resetConfirmationTarget]);
  const settingsColor = settings.color.toUpperCase();
  const [colorDraftState, setColorDraftState] = useState<StudioVrmTexturePaintColorDraft>(
    () => ({
      sourceColor: settingsColor,
      value: settingsColor,
    }),
  );
  const colorDraft =
    colorDraftState.sourceColor === settingsColor
      ? colorDraftState.value
      : settingsColor;
  const colorDraftIsValid = HEX_COLOR.test(colorDraft);
  const updateColorDraft = (value: string) => {
    setColorDraftState({
      sourceColor: settingsColor,
      value: value.toUpperCase(),
    });
  };
  const resetColorDraft = () => {
    setColorDraftState({
      sourceColor: settingsColor,
      value: settingsColor,
    });
  };
  const commitColorDraft = () => {
    if (!colorDraftIsValid) {
      resetColorDraft();
      return;
    }
    const color = colorDraft.toLowerCase();
    setColorDraftState({
      sourceColor: settingsColor,
      value: colorDraft.toUpperCase(),
    });
    if (color !== settings.color.toLowerCase()) {
      onSettingsChange({ color });
    }
  };

  return (
    <section
      id="vrm-character-section-surface"
      role="tabpanel"
      aria-labelledby="vrm-character-subtab-surface"
      hidden={hidden}
      className="space-y-4"
    >
      <div className="border-b border-line pb-3">
        <div className="flex items-start gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-accent/35 bg-accent-soft text-accent">
            <Paintbrush size={17} aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-fg">3D 표면 페인트</h3>
            <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
              표면을 직접 칠하거나 ColorDrop으로 연결 영역을 한 번에 채웁니다. UV 아일랜드를
              감지해 멀리 떨어진 면 사이의 선 연결을 막고, 결과는 삽입 이미지와 캡처에 바로
              반영됩니다. 스포이드 버튼 또는 Alt+클릭으로 현재 baseColor 색을 가져올 수 있습니다.
            </p>
          </div>
        </div>
        <div
          className={cn(
            "mt-3 flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[0.68rem]",
            status
              ? "border-accent/30 bg-accent-soft/35 text-fg-2"
              : "border-line bg-card/60 text-fg-3",
          )}
          role="status"
          aria-live="polite"
        >
          <span className="min-w-0">
            <span className="block truncate font-bold text-fg">
              {activeTextureLabel ?? "칠할 표면을 선택하세요"}
            </span>
            <span className="mt-0.5 block leading-relaxed">
              {status || "뷰포트에서 옷·피부·머리 표면을 누르면 해당 텍스처가 선택됩니다."}
            </span>
          </span>
          <span className="shrink-0 tabular-nums" aria-label={`편집 중인 텍스처 ${targetCount}개`}>
            {targetCount}개 텍스처
          </span>
        </div>
        {restoreError && onRetryRestore ? (
          <div
            className="mt-2 flex items-start justify-between gap-3 rounded-lg border border-bad/45 bg-[oklch(0.66_0.20_25/0.10)] px-3 py-2.5 text-[0.68rem] text-fg-2"
            role="alert"
          >
            <span className="flex min-w-0 items-start gap-2 leading-relaxed">
              <AlertTriangle className="mt-0.5 shrink-0 text-bad" size={14} aria-hidden />
              <span>
                <span className="block font-bold text-fg">원본 텍스처 복원이 중단됐습니다.</span>
                <span className="mt-0.5 block">{restoreError}</span>
              </span>
            </span>
            <button
              type="button"
              className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-md border border-bad/45 bg-card px-2.5 font-bold text-bad transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              onClick={onRetryRestore}
            >
              <RotateCcw size={13} aria-hidden />
              다시 시도
            </button>
          </div>
        ) : null}
      </div>

      <fieldset disabled={editingDisabled} className="space-y-2 disabled:opacity-60">
        <legend className="mb-2 text-xs font-bold text-fg">표면 도구</legend>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="표면 페인트 도구">
          <button
            type="button"
            aria-pressed={surfaceBrushTool}
            title="실제 R3F ray hit를 UV chart별로 나눠 한 번의 atlas transaction으로 저장합니다."
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border px-1 text-[0.64rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              surfaceBrushTool
                ? "border-accent/60 bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
            onClick={() => onSettingsChange({ tool: "surface-brush" })}
          >
            <Paintbrush size={14} aria-hidden />
            V12 UV
          </button>
          <button
            type="button"
            aria-pressed={settings.tool === "brush"}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-2 text-[0.68rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              settings.tool === "brush"
                ? "border-accent/60 bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
            onClick={() => onSettingsChange({ tool: "brush" })}
          >
            <Paintbrush size={14} aria-hidden />
            호환
          </button>
          <button
            type="button"
            aria-pressed={settings.tool === "fill"}
            title="표면의 비슷한 색 영역을 서버 전송 없이 로컬 Worker에서 채웁니다."
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-2 text-[0.68rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              settings.tool === "fill"
                ? "border-accent/60 bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
            onClick={() => onSettingsChange({ tool: "fill" })}
          >
            <PaintBucket size={14} aria-hidden />
            ColorDrop
          </button>
        </div>
        <p className="text-[0.64rem] leading-relaxed text-fg-3">
          {settings.tool === "fill"
            ? "표면을 한 번 눌러 채웁니다. 계산은 기기 안에서 처리되며 텍스처 경계를 넘어 번지지 않습니다."
            : surfaceBrushTool
              ? "R3F 포인터 획을 BrushProgramIR·StrokeIR로 보존하고 UV chart 경계에서 run을 나눈 뒤 한 번만 저장합니다."
              : "기존 라운드 팁 경로로 표면을 끌어 칠합니다. V12 UV 경로를 사용할 수 없을 때의 호환 폴백입니다."}
        </p>
      </fieldset>

      {surfaceBrushTool ? (
        <div
          className="rounded-lg border border-line bg-card/60 px-3 py-2.5 text-[0.64rem] leading-relaxed text-fg-3"
          role="note"
          data-testid="vrm-surface-brush-capability"
        >
          <span className="block font-bold text-fg-2">지원 범위: round 촉 · 혼색 없음</span>
          stamp/image 촉과 smudge/wet 혼색은 검증된 sampler·texture-neighborhood backend가 없어
          명시적으로 지원하지 않습니다. 이 의미를 호환 브러시로 조용히 바꾸지 않습니다.
        </div>
      ) : null}

      {settings.tool === "brush" ? (
        <fieldset disabled={editingDisabled} className="space-y-3 disabled:opacity-60">
          <legend className="mb-2 text-xs font-bold text-fg">브러시 촉</legend>
          <div className="grid grid-cols-4 gap-1" role="group" aria-label="표면 페인트 브러시">
            {BRUSHES.map((brush) => {
              const selected = settings.brushKind === brush.id;
              return (
                <button
                  key={brush.id}
                  type="button"
                  aria-pressed={selected}
                  title={brush.description}
                  className={cn(
                    "min-h-11 rounded-lg border px-1 text-[0.66rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                    selected
                      ? "border-accent/60 bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                  onClick={() => onSettingsChange({ brushKind: brush.id })}
                >
                  {brush.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="space-y-3 border-t border-line pt-3">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
          <label htmlFor="vrm-surface-paint-color" className="text-xs font-bold text-fg">
            색상
          </label>
          <div className="flex min-w-0 items-center gap-2">
            <input
              id="vrm-surface-paint-color"
              type="color"
              value={settings.color}
              disabled={
                editingDisabled || (settings.tool === "brush" && settings.blend === "erase")
              }
              aria-label="표면 페인트 색상 선택"
              className="size-11 shrink-0 cursor-pointer rounded-lg border border-line bg-card p-1 disabled:cursor-not-allowed disabled:opacity-45"
              onChange={(event) => {
                updateColorDraft(event.target.value);
                onSettingsChange({ color: event.target.value });
              }}
            />
            <button
              type="button"
              disabled={editingDisabled}
              aria-label={eyedropperActive ? "표면 스포이드 취소" : "표면 스포이드"}
              aria-pressed={eyedropperActive}
              title="한 번 눌러 표면 색을 선택합니다. 데스크톱에서는 Alt+클릭으로 잠시 사용할 수 있습니다."
              className={cn(
                "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
                eyedropperActive
                  ? "border-accent/60 bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
              )}
              onClick={onEyedropperToggle}
            >
              <Pipette size={17} aria-hidden />
            </button>
            <input
              type="text"
              value={colorDraft}
              disabled={
                editingDisabled || (settings.tool === "brush" && settings.blend === "erase")
              }
              inputMode="text"
              maxLength={7}
              pattern="#[0-9A-Fa-f]{6}"
              aria-label="표면 페인트 HEX 색상"
              aria-describedby="vrm-surface-paint-hex-hint"
              aria-invalid={!colorDraftIsValid}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-card px-3 text-xs font-semibold uppercase tabular-nums text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
              onChange={(event) => updateColorDraft(event.target.value)}
              onBlur={commitColorDraft}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitColorDraft();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  resetColorDraft();
                }
              }}
            />
            <span id="vrm-surface-paint-hex-hint" className="sr-only">
              7자리 HEX 색상을 입력한 뒤 Enter를 누르거나 입력란 밖으로 이동하세요.
            </span>
          </div>
        </div>

        {brushTool ? (
          <>
            <label htmlFor="vrm-surface-paint-size" className="grid grid-cols-[3rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs">
              <span className="font-semibold text-fg-2">크기</span>
              <input
                id="vrm-surface-paint-size"
                type="range"
                min="2"
                max="256"
                step="1"
                value={settings.sizeTexels}
                disabled={editingDisabled}
                aria-label="크기"
                className="h-2 min-w-0 accent-accent disabled:cursor-not-allowed disabled:opacity-45"
                onChange={(event) => onSettingsChange({ sizeTexels: Number(event.target.value) })}
              />
              <output htmlFor="vrm-surface-paint-size" className="text-right text-[0.68rem] tabular-nums text-fg-3">
                {Math.round(settings.sizeTexels)} px
              </output>
            </label>

            <PercentageSlider
              id="vrm-surface-paint-opacity"
              label="불투명"
              value={settings.opacity}
              disabled={editingDisabled}
              onChange={(opacity) => onSettingsChange({ opacity })}
            />
            <PercentageSlider
              id="vrm-surface-paint-flow"
              label="도포량"
              value={settings.tuning.flow}
              disabled={editingDisabled}
              onChange={(flow) => onSettingsChange({ tuning: { flow } })}
            />
            <PercentageSlider
              id="vrm-surface-paint-hardness"
              label="경도"
              value={settings.tuning.hardness}
              disabled={editingDisabled}
              onChange={(hardness) => onSettingsChange({ tuning: { hardness } })}
            />
            <PercentageSlider
              id="vrm-surface-paint-min-size"
              label="최소 굵기"
              value={settings.tuning.minSize}
              disabled={editingDisabled}
              onChange={(minSize) => onSettingsChange({ tuning: { minSize } })}
            />
          </>
        ) : (
          <>
            <label htmlFor="vrm-surface-fill-tolerance" className="grid grid-cols-[3rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs">
              <span className="font-semibold text-fg-2">허용치</span>
              <input
                id="vrm-surface-fill-tolerance"
                type="range"
                min="0"
                max="255"
                step="1"
                value={settings.fillTolerance}
                disabled={editingDisabled}
                aria-label="ColorDrop 색상 허용치"
                className="h-2 min-w-0 accent-accent disabled:cursor-not-allowed disabled:opacity-45"
                onChange={(event) =>
                  onSettingsChange({ fillTolerance: Number(event.target.value) })}
              />
              <output htmlFor="vrm-surface-fill-tolerance" className="text-right text-[0.68rem] tabular-nums text-fg-3">
                {Math.round(settings.fillTolerance)}
              </output>
            </label>
            <fieldset disabled={editingDisabled} className="space-y-2 disabled:opacity-60">
              <legend className="text-xs font-semibold text-fg-2">채울 범위</legend>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="ColorDrop 채울 범위">
                {([
                  ["contiguous", "연결 영역"],
                  ["whole-material", "텍스처 전체"],
                ] as const).map(([scope, label]) => (
                  <button
                    key={scope}
                    type="button"
                    aria-pressed={settings.fillScope === scope}
                    className={cn(
                      "min-h-11 rounded-lg border px-2 text-[0.66rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                      settings.fillScope === scope
                        ? "border-accent/60 bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                    )}
                    onClick={() => onSettingsChange({ fillScope: scope })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[0.62rem] leading-relaxed text-fg-3">
                {settings.fillScope === "contiguous"
                  ? "누른 지점과 이어진 비슷한 색만 채웁니다."
                  : "현재 텍스처 전체에서 비슷한 색을 찾습니다. 떨어진 UV 조각도 함께 바뀔 수 있습니다."}
              </p>
            </fieldset>
          </>
        )}
      </div>

      {settings.tool === "brush" ? (
        <fieldset disabled={editingDisabled} className="border-t border-line pt-3 disabled:opacity-60">
          <legend className="mb-2 text-xs font-bold text-fg">합성 방식</legend>
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-5" role="group" aria-label="표면 페인트 합성 방식">
            {BLENDS.map((blend) => {
              const selected = settings.blend === blend.id;
              return (
                <button
                  key={blend.id}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    "inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border px-1 text-[0.64rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                    selected
                      ? "border-accent/60 bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                  onClick={() => onSettingsChange({ blend: blend.id })}
                >
                  {blend.id === "erase" ? <Eraser size={12} aria-hidden /> : null}
                  {blend.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="grid grid-cols-3 gap-2 border-t border-line pt-3">
        <button
          type="button"
          disabled={disabled || strokeActive || !canUndo}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2 text-[0.68rem] font-bold text-fg-2 transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          onClick={onUndo}
        >
          <Undo2 size={14} aria-hidden />
          취소
        </button>
        <button
          type="button"
          disabled={disabled || strokeActive || !canRedo}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2 text-[0.68rem] font-bold text-fg-2 transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          onClick={onRedo}
        >
          <Redo2 size={14} aria-hidden />
          재실행
        </button>
        <button
          type="button"
          disabled={disabled || strokeActive || !hasActiveTexture}
          aria-pressed={resetArmed}
          title={resetArmed
            ? "한 번 더 누르면 선택한 텍스처를 원본으로 복원하고 편집 기록을 비웁니다."
            : "원본 복원은 되돌릴 수 없습니다. 실수를 막기 위해 두 번 눌러 확인합니다."}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 text-[0.68rem] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            resetArmed
              ? "border-bad/60 bg-[oklch(0.66_0.20_25/0.12)] text-bad"
              : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
          )}
          onClick={() => {
            if (!resetArmed) {
              setResetConfirmationTarget(activeTargetId);
              return;
            }
            setResetConfirmationTarget(null);
            onResetActiveTexture();
          }}
        >
          <RotateCcw size={14} aria-hidden />
          {resetArmed ? "한 번 더" : "원본"}
        </button>
      </div>
    </section>
  );
}
