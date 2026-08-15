import { Droplets } from "lucide-react";

import { BG_PRESETS, CANVAS_W, type BgPreset } from "./studio-assets";
import { GRADIENT_PRESETS, gradientToBgGrad } from "./studio-gradients";
import { type MagicResizePreset, type MagicResizeStrategy } from "./studio-magic-resize";
import { StudioMagicResizePanel } from "./StudioMagicResizePanel";
import { StudioPaperSurfacePicker } from "./StudioPaperSurfacePicker";
import { StudioPercentGuideControls } from "./StudioPercentGuideControls";

import type { PaperGrainKind } from "./studio-paper-texture";

import { useT } from "@/lib/i18n";
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
  readonly showAlignmentGuides: boolean;
  readonly hidden: boolean;
  readonly magicResizeStrategy: MagicResizeStrategy;
  readonly masterEditMode: boolean;
  readonly panelGutter: number;
  /** Active document paper grain (brush granulation surface). */
  readonly paperGrainKind: PaperGrainKind;
  /** Stage paper-grain fill visibility (default true when unset on page). */
  readonly paperGrainVisible: boolean;
  readonly showGrid: boolean;
  readonly showWebtoonGuides: boolean;
  readonly snapEnabled: boolean;
  readonly templateGutterAvailable: boolean;
  readonly userGuides: readonly StudioInspectorUserGuide[];
  readonly webtoonGuides: typeof import("./studio-webtoon-guides") | null;
  readonly webtoonTheme: "classic" | "soft" | "vivid";
  readonly onAddUserGuide: (type: "v" | "h", pos?: number) => void;
  readonly onApplyBackgroundPreset: (preset: BgPreset) => void;
  readonly onApplyMagicResizePreset: (preset: MagicResizePreset) => void;
  readonly onBackgroundChange: (color: string) => void;
  readonly onCanvasHeightDelta: (delta: number) => void;
  readonly onClearUserGuides: () => void;
  readonly onDeleteUserGuide: (id: string) => void;
  readonly onShowAlignmentGuidesChange: (visible: boolean) => void;
  readonly onGradientChange: (gradient: string[]) => void;
  readonly onGridSizeChange: (size: number) => void;
  readonly onMagicResizeStrategyChange: (strategy: MagicResizeStrategy) => void;
  readonly onMoveUserGuide: (id: string, pos: number) => void;
  readonly onOpenBackgroundEditor: () => void;
  readonly onPanelGutterChange: (gutter: number) => void;
  readonly onPaperGrainKindChange: (kind: PaperGrainKind) => void;
  readonly onPaperGrainVisibleChange: (visible: boolean) => void;
  readonly onApplyPaperTintBackground: () => void;
  readonly onShowGridChange: (visible: boolean) => void;
  readonly onShowWebtoonGuidesChange: (visible: boolean) => void;
  readonly onSnapEnabledChange: (enabled: boolean) => void;
  readonly onWarmWebtoonGuides: () => void;
  readonly onWebtoonThemeChange: (theme: "classic" | "soft" | "vivid") => void;
}

function localizeText(
  t: (key: string) => string,
  fallback: string,
  key: string,
): string {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

export function StudioInspectorCanvasControls({
  background,
  canvasHeight,
  controlsDisabled,
  showAlignmentGuides,
  gridSize,
  hidden,
  magicResizeStrategy,
  masterEditMode,
  panelGutter,
  paperGrainKind,
  paperGrainVisible,
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
  onPaperGrainKindChange,
  onPaperGrainVisibleChange,
  onApplyPaperTintBackground,
  onShowAlignmentGuidesChange,
  onShowGridChange,
  onShowWebtoonGuidesChange,
  onSnapEnabledChange,
  onWarmWebtoonGuides,
  onWebtoonThemeChange,
}: StudioInspectorCanvasControlsProps) {
  const t = useT();
  const fixedAmount = 240;
  const guideAxisLabel = (type: StudioInspectorUserGuide["type"]) =>
    localizeText(t, type === "v" ? "세로" : "가로", `studio.canvas.guideType.${type === "v" ? "vertical" : "horizontal"}`);

  return (
    <div
      role="tabpanel"
      aria-label={localizeText(t, "캔버스 설정", "studio.canvas.aria")}
      hidden={hidden}
      className="rounded-xl border border-line bg-panel/40 p-3"
    >
      <p className="mb-2 text-xs font-semibold text-fg-3">{localizeText(t, "캔버스", "studio.canvas.section")}</p>
      <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
        {localizeText(t, "배경색", "studio.canvas.background")}
        <input
          type="color"
          value={background}
          onChange={(event) => onBackgroundChange(event.currentTarget.value)}
          disabled={controlsDisabled}
          className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
        />
      </label>

      <StudioPaperSurfacePicker
        controlsDisabled={controlsDisabled}
        paperGrainKind={paperGrainKind}
        paperGrainVisible={paperGrainVisible}
        onPaperGrainKindChange={onPaperGrainKindChange}
        onPaperGrainVisibleChange={onPaperGrainVisibleChange}
        onApplyPaperTintBackground={onApplyPaperTintBackground}
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {BG_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={controlsDisabled}
            onClick={() => onApplyBackgroundPreset(preset)}
            title={localizeText(t, `배경 ${preset.label}`, "studio.canvas.backgroundPresetAria").replace("{label}", preset.label)}
            aria-label={localizeText(t, `배경 ${preset.label}`, "studio.canvas.backgroundPresetAria").replace("{label}", preset.label)}
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
        <p className="mb-1 text-[0.68rem] font-medium text-fg-3">{localizeText(t, "그라디언트 배경", "studio.canvas.gradient")}</p>
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
                aria-label={localizeText(t, `그라디언트 ${preset.label}`, "studio.canvas.gradientPresetAria").replace("{label}", preset.label)}
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
        {localizeText(t, "배경 편집기 · 리사이저 열기", "studio.canvas.openBackgroundEditor")}
      </button>
      <div className="mt-3 flex items-center justify-between gap-2 text-sm text-fg-2">
        <span>{localizeText(t, "높이", "studio.canvas.height")}</span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            aria-label={localizeText(t, "높이 240px 줄이기", "studio.canvas.heightDecrease").replace("{amount}", String(fixedAmount))}
            disabled={controlsDisabled}
            onClick={() => onCanvasHeightDelta(-fixedAmount)}
            className="rounded border border-line px-2 text-fg-2 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            −
          </button>
          <span
            className="numeral w-12 text-center text-xs"
            aria-label={localizeText(t, "높이 240px", "studio.canvas.heightValue").replace("{height}", String(canvasHeight))}
          >
            {canvasHeight}
          </span>
          <button
            type="button"
            aria-label={localizeText(t, "높이 240px 늘리기", "studio.canvas.heightIncrease").replace("{amount}", String(fixedAmount))}
            disabled={controlsDisabled}
            onClick={() => onCanvasHeightDelta(fixedAmount)}
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
        {localizeText(t, "패널 여백 (Gutter)", "studio.canvas.panelGutter")}
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
          <span>
            {localizeText(t, "정렬 가이드 (스냅)", "studio.canvas.snapGuide")}
            <span aria-hidden className="ml-1.5 text-fg-3">
              ({snapEnabled ? t("studio.settings.state.on") : t("studio.settings.state.off")})
            </span>
          </span>
          <input
            type="checkbox"
            checked={snapEnabled}
            onChange={(event) => onSnapEnabledChange(event.currentTarget.checked)}
            disabled={controlsDisabled}
            aria-label={`${localizeText(t, "정렬 가이드 (스냅)", "studio.canvas.snapGuide")} (${snapEnabled ? t("studio.settings.state.on") : t("studio.settings.state.off")})`}
            className="size-3.5 accent-accent disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
        <label className="flex items-center justify-between text-xs text-fg-2">
          <span>
            {localizeText(t, "정렬 가이드", "studio.settings.grids.alignGuideLabel")}
            <span aria-hidden className="ml-1.5 text-fg-3">
              ({showAlignmentGuides ? t("studio.settings.state.on") : t("studio.settings.state.off")})
            </span>
          </span>
          <input
            type="checkbox"
            checked={showAlignmentGuides}
            onChange={(event) => onShowAlignmentGuidesChange(event.currentTarget.checked)}
            disabled={controlsDisabled}
            aria-label={`${localizeText(t, "정렬 가이드", "studio.settings.grids.alignGuideLabel")} (${showAlignmentGuides ? t("studio.settings.state.on") : t("studio.settings.state.off")})`}
            className="size-3.5 accent-accent disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
        <label className="flex items-center justify-between text-xs text-fg-2">
          {localizeText(t, "그리드 격자 표시", "studio.canvas.showGrid")}
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
          {localizeText(t, "웹툰 규격 가이드", "studio.canvas.webtoonGuide")}
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
                      {localizeText(
                        t,
                        "파란 점선 = 플랫폼 표준폭(네이버 690·카카오 720), 붉은 음영 = 세이프영역.",
                        "studio.canvas.webtoonGuideLegend",
                      )}
                    </>
                  );
                })()
              : localizeText(
                  t,
                  "웹툰 규격 가이드를 여는 중...",
                  "studio.canvas.webtoonGuideLoading",
                )}
          </div>
        )}

        <div className="space-y-2 border-t border-line/35 pt-2">
          <p className="text-[0.65rem] font-bold text-fg-2">{localizeText(t, "스냅 가이드선", "studio.canvas.snapGuideLines")}</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={controlsDisabled}
              onClick={() => onAddUserGuide("v")}
              className="flex-1 cursor-pointer rounded border border-line bg-card py-1 text-[0.68rem] font-semibold text-fg transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
            >
              {localizeText(t, "+ 세로 가이드", "studio.canvas.addVerticalGuide")}
            </button>
            <button
              type="button"
              disabled={controlsDisabled}
              onClick={() => onAddUserGuide("h")}
              className="flex-1 cursor-pointer rounded border border-line bg-card py-1 text-[0.68rem] font-semibold text-fg transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
            >
              {localizeText(t, "+ 가로 가이드", "studio.canvas.addHorizontalGuide")}
            </button>
          </div>

          <StudioPercentGuideControls
            canvasHeight={canvasHeight}
            disabled={controlsDisabled}
            onAddGuide={onAddUserGuide}
          />

          {userGuides.length > 0 && (
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-line bg-card/30 p-2">
              {userGuides.map((guide, index) => (
                <div
                  key={guide.id}
                  className="flex items-center justify-between gap-1.5 text-[0.65rem]"
                >
                  <span className="font-medium text-fg-2">
                    {`${guideAxisLabel(guide.type)} ${t("studio.canvas.guideLabel")} #${index + 1} (${Math.round(guide.pos)}px)`}
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="range"
                      min={0}
                      max={guide.type === "v" ? CANVAS_W : canvasHeight}
                      value={guide.pos}
                      aria-label={`${guideAxisLabel(guide.type)} ${t("studio.canvas.guideLabel")} #${index + 1} ${t("studio.canvas.guidesPosition")}`}
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
                      {localizeText(t, "삭제", "studio.canvas.guidesDelete")}
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
                {localizeText(t, "모든 가이드 삭제", "studio.canvas.guidesDeleteAll")}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <span className="mb-1.5 block text-[0.66rem] font-semibold text-fg-3">
          {localizeText(t, "만화/웹툰 연출 스타일", "studio.canvas.gutterStyle")}
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
              {style === "classic"
                ? localizeText(t, "출판만화", "studio.canvas.webtoonTheme.classic")
                : style === "soft"
                  ? localizeText(t, "소프트", "studio.canvas.webtoonTheme.soft")
                  : localizeText(t, "비비드", "studio.canvas.webtoonTheme.vivid")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
