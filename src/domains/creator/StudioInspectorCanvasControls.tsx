import { Droplets } from "lucide-react";

import { BG_PRESETS, CANVAS_W, type BgPreset } from "./studio-assets";
import { GRADIENT_PRESETS, gradientToBgGrad } from "./studio-gradients";
import { type MagicResizePreset, type MagicResizeStrategy } from "./studio-magic-resize";
import { StudioMagicResizePanel } from "./StudioMagicResizePanel";

import { cn } from "@/lib/utils";

export interface StudioInspectorUserGuide {
  readonly id: string;
  readonly type: "v" | "h";
  readonly pos: number;
}

export interface StudioInspectorCanvasControlsProps {
  readonly background: string;
  readonly canvasHeight: number;
  readonly controlsDisabled: boolean;
  readonly gridSize: number;
  readonly hidden: boolean;
  readonly magicResizeStrategy: MagicResizeStrategy;
  readonly masterEditMode: boolean;
  readonly panelGutter: number;
  readonly showGrid: boolean;
  readonly showWebtoonGuides: boolean;
  readonly snapEnabled: boolean;
  readonly templateGutterAvailable: boolean;
  readonly userGuides: readonly StudioInspectorUserGuide[];
  readonly webtoonGuides: typeof import("./studio-webtoon-guides") | null;
  readonly webtoonTheme: "classic" | "soft" | "vivid";
  readonly onAddUserGuide: (type: "v" | "h") => void;
  readonly onApplyBackgroundPreset: (preset: BgPreset) => void;
  readonly onApplyMagicResizePreset: (preset: MagicResizePreset) => void;
  readonly onBackgroundChange: (color: string) => void;
  readonly onCanvasHeightDelta: (delta: number) => void;
  readonly onClearUserGuides: () => void;
  readonly onDeleteUserGuide: (id: string) => void;
  readonly onGradientChange: (gradient: string[]) => void;
  readonly onGridSizeChange: (size: number) => void;
  readonly onMagicResizeStrategyChange: (strategy: MagicResizeStrategy) => void;
  readonly onMoveUserGuide: (id: string, pos: number) => void;
  readonly onOpenBackgroundEditor: () => void;
  readonly onPanelGutterChange: (gutter: number) => void;
  readonly onShowGridChange: (visible: boolean) => void;
  readonly onShowWebtoonGuidesChange: (visible: boolean) => void;
  readonly onSnapEnabledChange: (enabled: boolean) => void;
  readonly onWarmWebtoonGuides: () => void;
  readonly onWebtoonThemeChange: (theme: "classic" | "soft" | "vivid") => void;
}

export function StudioInspectorCanvasControls({
  background,
  canvasHeight,
  controlsDisabled,
  gridSize,
  hidden,
  magicResizeStrategy,
  masterEditMode,
  panelGutter,
  showGrid,
  showWebtoonGuides,
  snapEnabled,
  templateGutterAvailable,
  userGuides,
  webtoonGuides,
  webtoonTheme,
  onAddUserGuide,
  onApplyBackgroundPreset,
  onApplyMagicResizePreset,
  onBackgroundChange,
  onCanvasHeightDelta,
  onClearUserGuides,
  onDeleteUserGuide,
  onGradientChange,
  onGridSizeChange,
  onMagicResizeStrategyChange,
  onMoveUserGuide,
  onOpenBackgroundEditor,
  onPanelGutterChange,
  onShowGridChange,
  onShowWebtoonGuidesChange,
  onSnapEnabledChange,
  onWarmWebtoonGuides,
  onWebtoonThemeChange,
}: StudioInspectorCanvasControlsProps) {
  return (
    <div
      role="tabpanel"
      aria-label="캔버스 설정"
      hidden={hidden}
      className="rounded-xl border border-line bg-panel/40 p-3"
    >
      <p className="mb-2 text-xs font-semibold text-fg-3">캔버스</p>
      <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
        배경색
        <input
          type="color"
          value={background}
          onChange={(event) => onBackgroundChange(event.currentTarget.value)}
          disabled={controlsDisabled}
          className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {BG_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={controlsDisabled}
            onClick={() => onApplyBackgroundPreset(preset)}
            title={preset.label}
            aria-label={`배경 ${preset.label}`}
            className="h-6 w-6 rounded-md border border-line disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: preset.grad
                ? `linear-gradient(${preset.grad[0]}, ${preset.grad[1]})`
                : preset.fill,
            }}
          />
        ))}
      </div>
      <div className="mt-2">
        <p className="mb-1 text-[0.68rem] font-medium text-fg-3">그라디언트 배경</p>
        <div className="flex flex-wrap gap-1.5">
          {GRADIENT_PRESETS.map((preset) => {
            const [start, end] = gradientToBgGrad(preset);
            return (
              <button
                key={preset.id}
                type="button"
                disabled={controlsDisabled}
                onClick={() => onGradientChange(gradientToBgGrad(preset))}
                title={preset.tip}
                aria-label={`그라디언트 ${preset.label}`}
                className="h-6 w-6 rounded-md border border-line disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: `linear-gradient(${start}, ${end})` }}
              />
            );
          })}
        </div>
      </div>
      <button
        type="button"
        disabled={controlsDisabled}
        onClick={onOpenBackgroundEditor}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-accent/30 bg-accent-soft px-2 py-2 text-[0.7rem] font-bold text-accent hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Droplets size={13} aria-hidden />
        배경 편집기 · 리사이저 열기
      </button>
      <div className="mt-3 flex items-center justify-between gap-2 text-sm text-fg-2">
        <span>높이</span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            aria-label="높이 240px 줄이기"
            disabled={controlsDisabled}
            onClick={() => onCanvasHeightDelta(-240)}
            className="rounded border border-line px-2 text-fg-2 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            −
          </button>
          <span
            className="numeral w-12 text-center text-xs"
            aria-label={`높이 ${canvasHeight}px`}
          >
            {canvasHeight}
          </span>
          <button
            type="button"
            aria-label="높이 240px 늘리기"
            disabled={controlsDisabled}
            onClick={() => onCanvasHeightDelta(240)}
            className="rounded border border-line px-2 text-fg-2 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            +
          </button>
        </span>
      </div>
      {!masterEditMode && (
        <div className="mt-3">
          <StudioMagicResizePanel
            currentSize={{ width: CANVAS_W, height: canvasHeight }}
            disabled={controlsDisabled}
            strategy={magicResizeStrategy}
            onStrategyChange={onMagicResizeStrategyChange}
            onApplyPreset={onApplyMagicResizePreset}
          />
        </div>
      )}
      <label className="mt-3 flex items-center justify-between gap-2 text-sm text-fg-2">
        패널 여백 (Gutter)
        <span className="flex items-center gap-1.5">
          <input
            type="range"
            min={8}
            max={48}
            step={2}
            value={panelGutter}
            onChange={(event) => onPanelGutterChange(Number(event.currentTarget.value))}
            className="w-24 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={controlsDisabled || !templateGutterAvailable}
          />
          <span className="w-5 text-right text-xs tabular-nums text-fg-3">{panelGutter}</span>
        </span>
      </label>
      <div className="mt-3 space-y-2 border-t border-line/50 pt-2">
        <label className="flex items-center justify-between text-xs text-fg-2">
          정렬 가이드 (스냅)
          <input
            type="checkbox"
            checked={snapEnabled}
            onChange={(event) => onSnapEnabledChange(event.currentTarget.checked)}
            disabled={controlsDisabled}
            className="size-3.5 accent-accent disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
        <label className="flex items-center justify-between text-xs text-fg-2">
          그리드 격자 표시
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(event) => onShowGridChange(event.currentTarget.checked)}
              disabled={controlsDisabled}
              className="size-3.5 accent-accent disabled:cursor-not-allowed disabled:opacity-60"
            />
            {showGrid && (
              <select
                value={gridSize}
                onChange={(event) => onGridSizeChange(Number(event.currentTarget.value))}
                disabled={controlsDisabled}
                className="rounded border border-line bg-card px-1 py-0.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {[20, 30, 40, 50, 60, 80].map((size) => (
                  <option key={size} value={size}>
                    {size}px
                  </option>
                ))}
              </select>
            )}
          </span>
        </label>

        <label className="flex items-center justify-between text-xs text-fg-2">
          웹툰 규격 가이드
          <input
            type="checkbox"
            checked={showWebtoonGuides}
            onChange={(event) => onShowWebtoonGuidesChange(event.currentTarget.checked)}
            onPointerEnter={onWarmWebtoonGuides}
            onFocus={onWarmWebtoonGuides}
            disabled={controlsDisabled}
            className="size-3.5 accent-accent disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
        {showWebtoonGuides && (
          <div className="rounded-md border border-line bg-card px-2 py-1.5 text-[0.68rem] leading-snug text-fg-3">
            {webtoonGuides
              ? (() => {
                  const length = webtoonGuides.episodeLengthLabel(canvasHeight);
                  return (
                    <>
                      <span className="font-semibold text-fg-2">{length.label}</span> · {length.tier}
                      <br />
                      파란 점선 = 플랫폼 표준폭(네이버 690·카카오 720), 붉은 음영 = 세이프영역.
                    </>
                  );
                })()
              : "웹툰 규격 가이드를 여는 중..."}
          </div>
        )}

        <div className="space-y-2 border-t border-line/35 pt-2">
          <p className="text-[0.65rem] font-bold text-fg-2">스냅 가이드선</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={controlsDisabled}
              onClick={() => onAddUserGuide("v")}
              className="flex-1 cursor-pointer rounded border border-line bg-card py-1 text-[0.68rem] font-semibold text-fg transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
            >
              + 세로 가이드
            </button>
            <button
              type="button"
              disabled={controlsDisabled}
              onClick={() => onAddUserGuide("h")}
              className="flex-1 cursor-pointer rounded border border-line bg-card py-1 text-[0.68rem] font-semibold text-fg transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
            >
              + 가로 가이드
            </button>
          </div>

          {userGuides.length > 0 && (
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-line bg-card/30 p-2">
              {userGuides.map((guide, index) => (
                <div
                  key={guide.id}
                  className="flex items-center justify-between gap-1.5 text-[0.65rem]"
                >
                  <span className="font-medium text-fg-2">
                    {guide.type === "v" ? "세로" : "가로"} #{index + 1} ({Math.round(guide.pos)}px)
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="range"
                      min={0}
                      max={guide.type === "v" ? CANVAS_W : canvasHeight}
                      value={guide.pos}
                      aria-label={`${guide.type === "v" ? "세로" : "가로"} 가이드 #${index + 1} 위치`}
                      onChange={(event) =>
                        onMoveUserGuide(guide.id, Number(event.currentTarget.value))
                      }
                      disabled={controlsDisabled}
                      className="h-2 w-16 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={controlsDisabled}
                      onClick={() => onDeleteUserGuide(guide.id)}
                      className="ml-1 cursor-pointer text-[9px] text-bad hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                disabled={controlsDisabled}
                onClick={onClearUserGuides}
                className="w-full cursor-pointer border-t border-line/30 pt-1 text-center text-[9px] text-bad-light hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                모든 가이드 삭제
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <span className="mb-1.5 block text-[0.66rem] font-semibold text-fg-3">
          만화/웹툰 연출 스타일
        </span>
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-card p-0.5">
          {(["classic", "soft", "vivid"] as const).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => onWebtoonThemeChange(style)}
              disabled={controlsDisabled}
              className={cn(
                "rounded py-1 text-[0.66rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                webtoonTheme === style
                  ? "bg-accent text-on-accent"
                  : "text-fg-2 hover:bg-raised"
              )}
            >
              {style === "classic" ? "출판만화" : style === "soft" ? "소프트" : "비비드"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
