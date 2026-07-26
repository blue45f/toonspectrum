import { Eraser, Paintbrush, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  StudioStampBrushKind,
  StudioStampBrushTuning,
} from "./studio-brush-stamp-engine";
import type { StudioVrmTexturePaintBlendMode } from "./studio-vrm-texture-paint-ops";

import { cn } from "@/lib/utils";

export interface StudioVrmTexturePaintPanelSettings {
  readonly brushKind: StudioStampBrushKind;
  readonly color: string;
  /** Texture-space diameter in texels. */
  readonly sizeTexels: number;
  readonly opacity: number;
  readonly blend: StudioVrmTexturePaintBlendMode;
  readonly tuning: Required<StudioStampBrushTuning>;
}

export interface StudioVrmTexturePaintPanelProps {
  readonly hidden: boolean;
  readonly disabled: boolean;
  readonly settings: StudioVrmTexturePaintPanelSettings;
  readonly activeTargetId: string | null;
  readonly activeTextureLabel: string | null;
  readonly status: string;
  readonly strokeActive: boolean;
  readonly targetCount: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onSettingsChange: (
    update: Partial<Omit<StudioVrmTexturePaintPanelSettings, "tuning">> & {
      tuning?: Partial<StudioVrmTexturePaintPanelSettings["tuning"]>;
    },
  ) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onResetActiveTexture: () => void;
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
  strokeActive,
  targetCount,
  canUndo,
  canRedo,
  onSettingsChange,
  onUndo,
  onRedo,
  onResetActiveTexture,
}: StudioVrmTexturePaintPanelProps) {
  const editingDisabled = disabled || strokeActive;
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
              캐릭터 표면을 직접 끌어 색·명암·질감을 칠합니다. UV 심을 자동으로 감지하며 현재
              삽입 이미지와 캡처에 바로 반영됩니다.
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
      </div>

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
              disabled={editingDisabled || settings.blend === "erase"}
              aria-label="표면 페인트 색상 선택"
              className="size-11 shrink-0 cursor-pointer rounded-lg border border-line bg-card p-1 disabled:cursor-not-allowed disabled:opacity-45"
              onChange={(event) => {
                updateColorDraft(event.target.value);
                onSettingsChange({ color: event.target.value });
              }}
            />
            <input
              type="text"
              value={colorDraft}
              disabled={editingDisabled || settings.blend === "erase"}
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
      </div>

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
