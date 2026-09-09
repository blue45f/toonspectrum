from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def write(relative: str, content: str) -> None:
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def replace_once(relative: str, old: str, new: str) -> None:
    source = read(relative)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{relative}: expected one match, found {count}: {old[:140]!r}")
    write(relative, source.replace(old, new, 1))


def replace_between(relative: str, start: str, end: str, replacement: str) -> None:
    source = read(relative)
    start_index = source.find(start)
    if start_index < 0:
        raise RuntimeError(f"{relative}: start marker not found: {start!r}")
    end_index = source.find(end, start_index)
    if end_index < 0:
        raise RuntimeError(f"{relative}: end marker not found: {end!r}")
    if source.find(start, start_index + 1) >= 0:
        raise RuntimeError(f"{relative}: start marker is ambiguous: {start!r}")
    write(relative, source[:start_index] + replacement + source[end_index:])


INSPECTOR_CONTROLS = "apps/web/src/domains/creator/StudioInspectorDrawModeControls.tsx"
INSPECTOR_CONTROLS_TEST = (
    "apps/web/src/domains/creator/StudioInspectorDrawModeControls.test.tsx"
)
INSPECTOR_DRAWING = "apps/web/src/domains/creator/StudioInspectorDrawingSection.tsx"
OPTIONS = "apps/web/src/domains/creator/brush/StudioDrawOptionsBar.tsx"
MOBILE = "apps/web/src/domains/creator/StudioMobileEditingDock.tsx"
HUD = "apps/web/src/domains/creator/brush/studio-draw-hud.ts"
CANVAS_HUD = "apps/web/src/domains/creator/canvas/StudioCanvasStageHud.tsx"
BOUNDARY_TEST = (
    "apps/web/src/domains/creator/brush/"
    "studio-pixel-pencil-professional-ui-boundary.test.ts"
)

# The compact inspector component is small enough to keep as one authoritative product contract.
write(
    INSPECTOR_CONTROLS,
    '''import { Eraser, Grid3X3, Pencil, Shapes } from "lucide-react";

import type { DrawMode, DrawShapeKind } from "./studio-editor-tool-model";

import { cn } from "@/shared/lib/utils";

type InspectorDrawMode = Exclude<DrawMode, "lasso-fill">;
type InspectorSymmetryMode =
  | "none"
  | "vertical"
  | "horizontal"
  | "radial"
  | "kaleidoscope";

interface StudioInspectorDrawModeControlsProps {
  drawMode: DrawMode;
  strokeWidth?: number;
  symmetryMode?: InspectorSymmetryMode;
  onDrawModeChange: (mode: InspectorDrawMode) => void;
  onDrawShapeChange: (shape: DrawShapeKind) => void;
  /** Kept in the public boundary for callers that share one drawing-property adapter. */
  onStrokeWidthChange: (width: number) => void;
  /** Kept in the public boundary; choosing pixel mode no longer destroys user symmetry. */
  onSymmetryChange: (mode: InspectorSymmetryMode) => void;
}

const DRAW_MODES = [
  { label: "펜", value: "pen" as const, Icon: Pencil },
  { label: "픽셀 펜", value: "pixel" as const, Icon: Grid3X3 },
  { label: "지우개", value: "eraser" as const, Icon: Eraser },
  { label: "도형", value: "shape" as const, Icon: Shapes },
] as const;

const PIXEL_TRAITS = [
  ["PIXEL PERFECT", "1px 계단 모서리 자동 정리"],
  ["HARD", "안티앨리어싱 없는 단단한 가장자리"],
  ["INTEGER", "정수 문서 픽셀 단위의 팁"],
] as const;

const SYMMETRY_LABEL: Record<InspectorSymmetryMode, string> = {
  none: "없음",
  vertical: "세로",
  horizontal: "가로",
  radial: "방사",
  kaleidoscope: "만화경",
};

export function StudioInspectorDrawModeControls({
  drawMode,
  strokeWidth = 1,
  symmetryMode = "none",
  onDrawModeChange,
  onDrawShapeChange,
}: StudioInspectorDrawModeControlsProps) {
  const pixelTipSize = Math.max(1, Math.round(strokeWidth));

  return (
    <div data-testid="studio-inspector-context-drawing" className="contents">
      <p className="text-xs font-semibold text-fg-3">그리기 도구 설정</p>
      <div
        className="flex gap-1 rounded-lg border border-line bg-card p-0.5"
        role="group"
        aria-label="그리기 모드"
        data-testid="studio-inspector-draw-mode"
      >
        {DRAW_MODES.map(({ label, value, Icon }) => (
          <button
            key={value}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={drawMode === value}
            onClick={() => {
              if (drawMode === value) return;
              onDrawModeChange(value);
              if (value === "shape") onDrawShapeChange("line");
            }}
            className={cn(
              "grid min-h-11 flex-1 place-items-center rounded-md transition-colors lg:min-h-9",
              drawMode === value
                ? "bg-accent text-on-accent"
                : "text-fg-2 hover:bg-raised",
            )}
          >
            <Icon size={15} strokeWidth={1.75} aria-hidden />
          </button>
        ))}
      </div>

      {drawMode === "pixel" ? (
        <section
          aria-label={`픽셀 펜 특성, ${pixelTipSize}픽셀 정수 팁`}
          data-studio-pixel-pen-identity="true"
          data-studio-pixel-pencil-professional="true"
          className="rounded-xl border border-accent/35 bg-accent-soft/20 p-2.5"
        >
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-on-accent"
            >
              <Grid3X3 size={17} strokeWidth={1.9} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-fg">픽셀 펜 Pro</span>
              <span className="block text-[0.62rem] leading-relaxed text-fg-2">
                원본 문서 픽셀을 정수 격자에 정확히 기록해요.
              </span>
            </span>
            <span className="shrink-0 rounded-md border border-accent/35 bg-card px-1.5 py-1 text-[0.58rem] font-bold tabular-nums text-accent">
              {pixelTipSize}px
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1" aria-label="픽셀 펜 특성">
            {PIXEL_TRAITS.map(([label, description]) => (
              <span
                key={label}
                title={description}
                className="rounded-md border border-line/70 bg-card px-1.5 py-0.5 text-[0.56rem] font-bold tracking-[0.08em] text-fg-2"
              >
                {label}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[0.62rem] leading-relaxed text-fg-3">
            필압·안티앨리어싱·선 보정은 적용하지 않습니다. 크기·색상·불투명도·대칭은
            픽셀 방식 그대로 조절할 수 있어요.
          </p>
          {symmetryMode !== "none" ? (
            <p className="mt-1 text-[0.6rem] font-semibold text-accent">
              대칭 {SYMMETRY_LABEL[symmetryMode]} 적용 중
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
''',
)

write(
    INSPECTOR_CONTROLS_TEST,
    '''// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioInspectorDrawModeControls } from "./StudioInspectorDrawModeControls";

afterEach(cleanup);

describe("StudioInspectorDrawModeControls", () => {
  it("explains the professional pixel contract and current integer tip", () => {
    const props = {
      onDrawModeChange: vi.fn(),
      onDrawShapeChange: vi.fn(),
      onStrokeWidthChange: vi.fn(),
      onSymmetryChange: vi.fn(),
    };
    const { rerender } = render(
      <StudioInspectorDrawModeControls drawMode="pen" {...props} />,
    );
    expect(screen.getByTestId("studio-inspector-context-drawing")).toBeTruthy();
    expect(screen.getByTestId("studio-inspector-draw-mode")).toBeTruthy();
    expect(screen.queryByRole("region", { name: /픽셀 펜 특성/ })).toBeNull();

    rerender(
      <StudioInspectorDrawModeControls
        drawMode="pixel"
        strokeWidth={7.6}
        symmetryMode="radial"
        {...props}
      />,
    );
    const pixelContract = screen.getByRole("region", {
      name: "픽셀 펜 특성, 8픽셀 정수 팁",
    });
    expect(pixelContract.textContent).toContain("PIXEL PERFECT");
    expect(pixelContract.textContent).toContain("HARD");
    expect(pixelContract.textContent).toContain("INTEGER");
    expect(pixelContract.textContent).toContain("8px");
    expect(pixelContract.textContent).toContain("대칭 방사 적용 중");
    expect(
      screen.getByRole("button", { name: "픽셀 펜" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("preserves width and symmetry when entering pixel mode and initializes shape mode", () => {
    const onDrawModeChange = vi.fn();
    const onDrawShapeChange = vi.fn();
    const onStrokeWidthChange = vi.fn();
    const onSymmetryChange = vi.fn();
    render(
      <StudioInspectorDrawModeControls
        drawMode="pen"
        strokeWidth={12}
        symmetryMode="vertical"
        onDrawModeChange={onDrawModeChange}
        onDrawShapeChange={onDrawShapeChange}
        onStrokeWidthChange={onStrokeWidthChange}
        onSymmetryChange={onSymmetryChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "픽셀 펜" }));
    expect(onDrawModeChange).toHaveBeenLastCalledWith("pixel");
    expect(onStrokeWidthChange).not.toHaveBeenCalled();
    expect(onSymmetryChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "도형" }));
    expect(onDrawModeChange).toHaveBeenLastCalledWith("shape");
    expect(onDrawShapeChange).toHaveBeenCalledWith("line");
  });

  it("does not reset tool settings when the selected mode is clicked again", () => {
    const onDrawModeChange = vi.fn();
    const onDrawShapeChange = vi.fn();
    const onStrokeWidthChange = vi.fn();
    const onSymmetryChange = vi.fn();
    render(
      <StudioInspectorDrawModeControls
        drawMode="shape"
        onDrawModeChange={onDrawModeChange}
        onDrawShapeChange={onDrawShapeChange}
        onStrokeWidthChange={onStrokeWidthChange}
        onSymmetryChange={onSymmetryChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "도형" }));
    expect(onDrawModeChange).not.toHaveBeenCalled();
    expect(onDrawShapeChange).not.toHaveBeenCalled();
    expect(onStrokeWidthChange).not.toHaveBeenCalled();
    expect(onSymmetryChange).not.toHaveBeenCalled();
  });
});
''',
)

# Inspector: expose integer tip presets and the existing symmetry ruler for pixel strokes.
replace_once(
    INSPECTOR_DRAWING,
    'import { QUICKSHAPE_KIND_LABELS } from "./studio-quickshape-labels";\n',
    'import { QUICKSHAPE_KIND_LABELS } from "./studio-quickshape-labels";\n'
    'import { STUDIO_PIXEL_PENCIL_MAX_STROKE_WIDTH } from "./studio-pixel-pencil";\n',
)
replace_once(
    INSPECTOR_DRAWING,
    'import { cn } from "@/shared/lib/utils";\n\nexport function StudioInspectorDrawingSection',
    'import { cn } from "@/shared/lib/utils";\n\n'
    'const STUDIO_PIXEL_TIP_SIZE_PRESETS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64] as const;\n\n'
    'export function StudioInspectorDrawingSection',
)
replace_once(
    INSPECTOR_DRAWING,
    '''              <StudioInspectorDrawModeControls
                drawMode={drawMode}
                onDrawModeChange={(next) => {
''',
    '''              <StudioInspectorDrawModeControls
                drawMode={drawMode}
                strokeWidth={strokeWidth}
                symmetryMode={symmetryType}
                onDrawModeChange={(next) => {
''',
)
replace_between(
    INSPECTOR_DRAWING,
    '                {drawMode !== "pixel" ? (\n                  <div className="space-y-1.5">',
    '\n\n                {/* 불투명도 슬라이더',
    '''                {drawMode === "pixel" ? (
                  <div
                    data-studio-pixel-pencil-properties="true"
                    className="space-y-2 rounded-xl border border-accent/25 bg-accent-soft/10 p-2"
                  >
                    <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                      <span>픽셀 팁 크기</span>
                      <span className="flex items-center gap-1.5">
                        <input
                          type="range"
                          min={1}
                          max={STUDIO_PIXEL_PENCIL_MAX_STROKE_WIDTH}
                          step={1}
                          value={Math.round(strokeWidth)}
                          onChange={(event) => setStrokeWidth(Number(event.target.value))}
                          className="w-24 cursor-pointer accent-accent"
                          aria-label="픽셀 팁 크기"
                        />
                        <span className="w-8 text-right text-xs tabular-nums text-fg-3">
                          {Math.round(strokeWidth)}px
                        </span>
                      </span>
                    </label>
                    <div
                      className="grid grid-cols-6 gap-1"
                      role="group"
                      aria-label="픽셀 팁 크기 프리셋"
                    >
                      {STUDIO_PIXEL_TIP_SIZE_PRESETS.map((size) => (
                        <button
                          key={size}
                          type="button"
                          aria-pressed={Math.round(strokeWidth) === size}
                          onClick={() => setStrokeWidth(size)}
                          className={cn(
                            "min-h-8 rounded-md border px-1 text-[0.6rem] font-bold tabular-nums transition-colors",
                            Math.round(strokeWidth) === size
                              ? "border-accent bg-accent text-on-accent"
                              : "border-line bg-card text-fg-2 hover:bg-raised",
                          )}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                      <span>크기</span>
                      <span className="flex items-center gap-1.5">
                        <input
                          type="range"
                          min={STUDIO_BRUSH_SIZE_RANGE.min}
                          max={STUDIO_BRUSH_SIZE_RANGE.max}
                          value={strokeWidth}
                          onChange={(e) => setStrokeWidth(Number(e.target.value))}
                          onPointerUp={(e) => rememberRecentBrushSize(Number(e.currentTarget.value))}
                          className="w-24 accent-accent cursor-pointer"
                        />
                        <span className="w-8 text-right text-xs tabular-nums text-fg-3">{strokeWidth}px</span>
                      </span>
                    </label>
                    <StudioBrushSizePresetGrid
                      activeSize={strokeWidth}
                      recentSizes={recentBrushSizes}
                      onCommit={commitBrushSizePreset}
                    />
                  </div>
                )}''',
)
replace_between(
    INSPECTOR_DRAWING,
    '                {/* 대칭 그리기 자 (Symmetry Ruler) — RAW 픽셀 입력에는 적용하지 않는다. */}',
    '                <StudioInspectorRulersSection',
    '''                {/* 픽셀 펜도 문서 좌표의 기존 대칭 계약을 공유한다. 필압·보정만 분리한다. */}
                <StudioInspectorSymmetrySection
                  symmetryType={symmetryType}
                  symmetryRadialCount={symmetryRadialCount}
                  symmetryCenterX={symmetryCenterX}
                  symmetryCenterY={symmetryCenterY}
                  canvasH={canvasH}
                  setSymmetryType={setSymmetryType}
                  setSymmetryRadialCount={setSymmetryRadialCount}
                  setSymmetryCenterX={setSymmetryCenterX}
                  setSymmetryCenterY={setSymmetryCenterY}
                />
''',
)

# Desktop dock: dynamic integer tip, accessible size controls, pixel-specific presets, and symmetry.
replace_once(
    OPTIONS,
    'import { StudioDualColorWell } from "../StudioDualColorWell";\n',
    'import { StudioDualColorWell } from "../StudioDualColorWell";\n'
    'import { STUDIO_PIXEL_PENCIL_MAX_STROKE_WIDTH } from "../studio-pixel-pencil";\n',
)
replace_between(
    OPTIONS,
    'function SizePreview({',
    '\nconst iconBtn = cn(',
    '''function SizePreview({
  size,
  color,
  opacity,
  pixel = false,
}: {
  size: number;
  color: string;
  opacity: number;
  pixel?: boolean;
}): ReactElement {
  const d = Math.min(26, Math.max(4, size * 0.42));
  const halo = Math.min(30, d + 6);
  return (
    <span
      aria-hidden
      data-studio-size-preview="true"
      data-studio-pixel-tip-preview={pixel ? "true" : undefined}
      className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-line/80 bg-canvas/90 shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.06)]"
    >
      {!pixel ? (
        <span
          className="absolute rounded-full opacity-25 blur-[1.5px]"
          style={{ width: halo, height: halo, background: color }}
        />
      ) : (
        <span className="absolute inset-0 bg-[linear-gradient(to_right,oklch(0.65_0.02_70/0.16)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.65_0.02_70/0.16)_1px,transparent_1px)] bg-[size:6px_6px]" />
      )}
      <span
        className={cn(
          "relative ring-1 ring-black/15",
          pixel
            ? "rounded-[1px] shadow-none"
            : "rounded-full shadow-[0_1px_3px_oklch(0.1_0.01_70/0.35)]",
        )}
        style={{
          width: d,
          height: d,
          backgroundColor: color,
          opacity: Math.max(0.2, opacity),
        }}
      />
    </span>
  );
}
''',
)
replace_once(
    OPTIONS,
    'const BRUSH_OPACITY_HINT_VARIANT = {\n',
    'const PIXEL_TIP_SIZE_CHIPS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64] as const;\n\n'
    'const BRUSH_OPACITY_HINT_VARIANT = {\n',
)
replace_once(
    OPTIONS,
    '  const advancedAvailable = drawMode === "pen" || drawMode === "eraser";\n',
    '  const advancedAvailable =\n'
    '    drawMode === "pen" || drawMode === "eraser" || drawMode === "pixel";\n',
)
replace_once(
    OPTIONS,
    '''  const strokeWidthLabel =
    drawMode === "eraser"
      ? "지우개 크기"
      : drawMode === "shape"
        ? "도형 선 굵기"
        : "브러시 크기";
''',
    '''  const strokeWidthLabel =
    drawMode === "pixel"
      ? "픽셀 팁 크기"
      : drawMode === "eraser"
        ? "지우개 크기"
        : drawMode === "shape"
          ? "도형 선 굵기"
          : "브러시 크기";
''',
)
replace_once(
    OPTIONS,
    '                      ? "격자에 맞춘 1px 하드 픽셀을 그대로 찍습니다. 필압·손떨림 보정·안티앨리어싱을 사용하지 않아 도트 작업에 적합해요."\n',
    '                      ? "1–64px 정수 하드 팁을 격자에 기록합니다. 1px에서는 픽셀 퍼펙트 코너 정리를 사용하고 필압·손떨림 보정·안티앨리어싱은 적용하지 않아요."\n',
)
replace_between(
    OPTIONS,
    '        {pixelMode ? (\n          <div\n            data-studio-pixel-pencil-identity="true"',
    '\n\n        {/* Active brush pill + library',
    '''        {pixelMode ? (
          <div
            data-studio-pixel-pencil-identity="true"
            data-studio-pixel-pencil-professional="true"
            role="status"
            aria-label={`픽셀 펜 Pro, ${Math.round(strokeWidth)}픽셀 정수 팁, 픽셀 퍼펙트, 필압과 안티앨리어싱 없음`}
            data-studio-active-tool-summary="pixel"
            className="flex h-9 shrink-0 items-center gap-2 rounded-xl border border-accent/45 bg-accent-soft/35 px-2.5 text-accent shadow-[inset_0_1px_0_oklch(0.98_0.01_85/0.08)]"
          >
            <span className="grid size-6 place-items-center rounded-md bg-accent/12" aria-hidden>
              <Grid3X3 size={14} strokeWidth={2} />
            </span>
            <span className="leading-none">
              <strong className="block text-[0.68rem] font-extrabold tracking-tight">픽셀 펜 Pro</strong>
              <span className="mt-1 block text-[0.54rem] font-semibold tracking-wide text-fg-3">
                {Math.round(strokeWidth)} PX · PERFECT · HARD
              </span>
            </span>
          </div>
        ) : null}''',
)
replace_between(
    OPTIONS,
    '        {!pixelMode ? (\n          <>\n            <span data-studio-draw-size-preview="true"',
    '\n\n\n        <StudioToolHintTarget\n          className="shrink-0"\n          hint={studioToolHintFromLabel(\n            opacityLabel,',
    '''        <>
          <span data-studio-draw-size-preview="true" className="contents">
            <SizePreview
              size={strokeWidth}
              color={tipColor}
              opacity={brushOpacity}
              pixel={pixelMode}
            />
          </span>

          <StudioToolHintTarget
            className="shrink-0"
            hint={studioToolHintFromLabel(
              strokeWidthLabel,
              pixelMode
                ? `현재 ${Math.round(strokeWidth)}px 정수 팁입니다. 슬라이더나 [ · ] 단축키로 1–${STUDIO_PIXEL_PENCIL_MAX_STROKE_WIDTH}px 범위에서 조절합니다.`
                : `현재 ${strokeWidth}px입니다. 슬라이더나 [ · ] 단축키로 ${
                    drawMode === "shape" ? "새 도형의 윤곽선 굵기" : "획 굵기"
                  }를 조절하며 왼쪽 원에서 실제 상대 크기를 확인할 수 있어요.`,
              "[  ]",
              "brush-size",
            )}
          >
            <label
              data-studio-draw-primary-control="size"
              data-studio-core-draw-control="size"
              className="flex shrink-0 items-center gap-1 text-fg-3"
            >
              <Circle size={12} strokeWidth={1.75} className="shrink-0 opacity-80" aria-hidden />
              <span className="sr-only">{strokeWidthLabel}</span>
              <input
                type="range"
                min={pixelMode ? 1 : STUDIO_BRUSH_SIZE_RANGE.min}
                max={pixelMode ? STUDIO_PIXEL_PENCIL_MAX_STROKE_WIDTH : STUDIO_BRUSH_SIZE_RANGE.max}
                step={pixelMode ? 1 : undefined}
                value={strokeWidth}
                onChange={(event) => onStrokeWidthChange(Number(event.target.value))}
                className="studio-range w-16 sm:w-20"
                aria-label={strokeWidthLabel}
                aria-valuetext={`${Math.round(strokeWidth)}픽셀`}
              />
              <span className="w-9 tabular-nums text-[0.68rem] font-bold text-fg">
                {Math.round(strokeWidth)}px
              </span>
            </label>
          </StudioToolHintTarget>
        </>''',
)
replace_once(
    OPTIONS,
    '              ? `현재 ${Math.round(brushOpacity * 100)}%입니다. 픽셀 모양은 1px로 유지되고 색 농도만 바뀝니다.`\n',
    '              ? `현재 ${Math.round(brushOpacity * 100)}%입니다. ${Math.round(strokeWidth)}px 정수 팁의 모양은 유지되고 색 농도만 바뀝니다.`\n',
)
replace_between(
    OPTIONS,
    '          <div className="studio-opt-cluster shrink-0" role="group" aria-label="브러시 크기 프리셋">',
    '\n\n          {drawMode === "pen" && stampTuning',
    '''          {pixelMode ? (
            <div
              className="studio-opt-cluster shrink-0"
              role="group"
              aria-label="픽셀 팁 크기 프리셋"
            >
              {PIXEL_TIP_SIZE_CHIPS.map((size) => (
                <button
                  key={size}
                  type="button"
                  aria-label={`픽셀 팁 ${size}픽셀`}
                  aria-pressed={Math.round(strokeWidth) === size}
                  onClick={() => onStrokeWidthChange(size)}
                  className={cn(
                    "min-w-7 rounded-lg px-1 py-1 text-[0.6rem] font-bold tabular-nums",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                    Math.round(strokeWidth) === size
                      ? "bg-accent text-on-accent"
                      : "text-fg-3 hover:bg-raised hover:text-fg",
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          ) : (
            <div className="studio-opt-cluster shrink-0" role="group" aria-label="브러시 크기 프리셋">
              {STUDIO_BRUSH_SIZE_CHIPS.map((chip) => {
                const active = nearestStudioBrushSizeChip(strokeWidth) === chip.id;
                return (
                  <StudioToolHintTarget
                    key={chip.id}
                    hint={studioToolHintFromLabel(
                      `브러시 크기 · ${chip.label}`,
                      `획 굵기를 정확히 ${chip.width}px로 설정합니다. 이후 새로 그리는 획부터 이 크기가 적용돼요.`,
                      undefined,
                      "brush-size",
                      BRUSH_SIZE_HINT_VARIANT[chip.id],
                    )}
                  >
                    <button
                      type="button"
                      aria-label={`브러시 크기 ${chip.label} ${chip.width}픽셀`}
                      aria-pressed={active}
                      onClick={() => onStrokeWidthChange(chip.width)}
                      className={cn(
                        "grid size-7 place-items-center rounded-lg",
                        STUDIO_EASE,
                        STUDIO_FOCUS_RING,
                        active
                          ? "bg-accent text-on-accent"
                          : "text-fg-3 hover:bg-raised hover:text-fg",
                      )}
                    >
                      <StudioSizeChipGlyph widthPx={Math.min(chip.width, 40)} />
                    </button>
                  </StudioToolHintTarget>
                );
              })}
              {onToggleSizeLock ? (
                <StudioToolHintTarget
                  hint={studioToolHintFromLabel(
                    sizeLocked ? "브러시 크기 잠금 해제" : "브러시 크기 잠금",
                    sizeLocked
                      ? `잠금을 풀어 다음에 브러시 프리셋을 선택할 때 해당 프리셋의 기본 크기를 적용합니다. 현재 ${strokeWidth}px 값은 즉시 바뀌지 않아요.`
                      : `현재 ${strokeWidth}px을 고정해 다른 브러시 프리셋을 선택해도 그 프리셋의 기본 크기로 바뀌지 않게 합니다.`,
                    "⇧⌥S",
                    "brush-size",
                    sizeLocked ? "unlock" : "lock",
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={sizeLocked}
                    aria-label={sizeLocked ? "브러시 크기 잠금 해제" : "브러시 크기 잠금"}
                    onClick={onToggleSizeLock}
                    className={cn(
                      iconBtn,
                      "size-7 border-transparent",
                      sizeLocked
                        ? "bg-accent-soft text-accent"
                        : "text-fg-3 hover:bg-raised",
                    )}
                  >
                    {sizeLocked ? <Lock size={12} aria-hidden /> : <LockOpen size={12} aria-hidden />}
                  </button>
                </StudioToolHintTarget>
              ) : null}
            </div>
          )}''',
)
# Pixel mode keeps opacity and symmetry, but never exposes stabilizer/post-correction/pressure controls.
source = read(OPTIONS)
stabilizer_start = source.find(
    '          <StudioToolHintTarget\n            className="shrink-0"\n            hint={studioToolHintFromLabel(\n              "손떨림 보정",'
)
stabilizer_end = source.find(
    '          <p className="hidden shrink-0 text-[0.6rem] text-fg-3 sm:block">',
    stabilizer_start,
)
if stabilizer_start < 0 or stabilizer_end < 0:
    raise RuntimeError("StudioDrawOptionsBar: stabilizer block markers not found")
stabilizer_body = source[stabilizer_start:stabilizer_end]
source = (
    source[:stabilizer_start]
    + '          {!pixelMode ? (\n            <>\n'
    + stabilizer_body.replace('\n', '\n  ', 1).replace('\n          ', '\n            ', 1)
    + '            </>\n          ) : null}\n\n'
    + source[stabilizer_end:]
)
# The previous replacement only adjusts the opening indentation; Prettier owns final layout.
write(OPTIONS, source)

# Mobile draw sheet: expose the same integer tip range and truthful identity.
replace_once(
    MOBILE,
    'import { STUDIO_EASE } from "./studio-panel-ui";\n',
    'import { STUDIO_EASE } from "./studio-panel-ui";\n'
    'import { STUDIO_PIXEL_PENCIL_MAX_STROKE_WIDTH } from "./studio-pixel-pencil";\n',
)
replace_between(
    MOBILE,
    '              {drawMode !== "pixel" ? <div>\n                <span className="mb-1 flex items-center justify-between text-[0.7rem] font-medium text-fg-3">',
    '\n              {(drawMode !== "eraser" || eraserPresetActive) && (',
    '''              <div>
                <span className="mb-1 flex items-center justify-between text-[0.7rem] font-medium text-fg-3">
                  <span>
                    {drawMode === "pixel"
                      ? "픽셀 팁 크기"
                      : drawMode === "eraser"
                        ? "지우개 굵기"
                        : "굵기"}
                  </span>
                  <span className="tabular-nums text-fg-2">{Math.round(strokeWidth)}px</span>
                </span>
                <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-2">
                  <input
                    type="range"
                    min={drawMode === "pixel" ? 1 : STUDIO_BRUSH_SIZE_RANGE.min}
                    max={
                      drawMode === "pixel"
                        ? STUDIO_PIXEL_PENCIL_MAX_STROKE_WIDTH
                        : STUDIO_BRUSH_SIZE_RANGE.max
                    }
                    step={drawMode === "pixel" ? 1 : undefined}
                    value={strokeWidth}
                    onChange={(event) => setStrokeWidth(Number(event.target.value))}
                    className="h-11 w-full accent-accent"
                    aria-label={drawMode === "pixel" ? "픽셀 팁 크기 슬라이더" : "브러시 굵기 슬라이더"}
                  />
                  <label className="sr-only" htmlFor="mobile-brush-width">
                    {drawMode === "pixel" ? "픽셀 팁 크기 숫자" : "브러시 굵기 숫자"}
                  </label>
                  <input
                    id="mobile-brush-width"
                    type="number"
                    min={drawMode === "pixel" ? 1 : STUDIO_BRUSH_SIZE_RANGE.min}
                    max={
                      drawMode === "pixel"
                        ? STUDIO_PIXEL_PENCIL_MAX_STROKE_WIDTH
                        : STUDIO_BRUSH_SIZE_RANGE.max
                    }
                    step={1}
                    inputMode="numeric"
                    value={Math.round(strokeWidth)}
                    onChange={(event) => {
                      const minimum = drawMode === "pixel" ? 1 : STUDIO_BRUSH_SIZE_RANGE.min;
                      const maximum =
                        drawMode === "pixel"
                          ? STUDIO_PIXEL_PENCIL_MAX_STROKE_WIDTH
                          : STUDIO_BRUSH_SIZE_RANGE.max;
                      setStrokeWidth(
                        Math.min(maximum, Math.max(minimum, Number(event.target.value) || minimum)),
                      );
                    }}
                    className="min-h-11 w-full rounded-lg border border-line bg-card px-2 text-center text-xs tabular-nums text-fg outline-none focus:border-accent"
                  />
                </div>
              </div>''',
)
replace_between(
    MOBILE,
    '            {drawMode === "pixel" ? (\n              <div\n                data-studio-mobile-pixel-pencil-identity="true"',
    '\n\n            {drawMode === "eraser" && setEraseToIntersection ? (',
    '''            {drawMode === "pixel" ? (
              <div
                data-studio-mobile-pixel-pencil-identity="true"
                data-studio-mobile-pixel-pencil-professional="true"
                role="status"
                className="mb-2.5 flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent-soft/30 p-3"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent" aria-hidden>
                  <Grid3X3 size={20} strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <strong className="block text-xs font-extrabold text-fg">
                    픽셀 펜 Pro · {Math.round(strokeWidth)}px
                  </strong>
                  <span className="mt-1 block text-[0.68rem] leading-relaxed text-fg-3">
                    정수 격자 · 1px 픽셀 퍼펙트 · 안티앨리어싱 없음 · 필압·선 보정 없음
                  </span>
                </span>
              </div>
            ) : null}''',
)

# Status HUD remains backward-compatible for callers that omit width, while the canvas supplies it.
replace_once(
    HUD,
    '  | { mode: "pixel" }\n',
    '  | { mode: "pixel"; widthPx?: number; opacity01?: number }\n',
)
replace_once(
    HUD,
    '''    case "pixel":
      return "픽셀 펜 · 1px · HARD · RAW";
''',
    '''    case "pixel":
      return tool.widthPx === undefined
        ? "픽셀 펜 · 1px · HARD · RAW"
        : `픽셀 펜 · ${Math.max(1, Math.round(tool.widthPx))}px · PERFECT · HARD`;
''',
)
replace_once(
    CANVAS_HUD,
    '? { mode: "pixel" }\n',
    '? { mode: "pixel", widthPx: strokeWidth, opacity01: brushOpacity }\n',
)
replace_once(
    CANVAS_HUD,
    '''                : drawMode === "pixel"
                  ? "1px"
''',
    '''                : drawMode === "pixel"
                  ? `${Math.max(1, Math.round(strokeWidth))}px`
''',
)
replace_once(
    CANVAS_HUD,
    '{tool === "draw" && drawMode !== "pixel" && symmetryType !== "none" ? (',
    '{tool === "draw" && symmetryType !== "none" ? (',
)

write(
    BOUNDARY_TEST,
    '''import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

describe("professional pixel-pencil UI boundary", () => {
  it("exposes integer tip controls consistently on desktop, inspector, mobile, and HUD", () => {
    const options = source("apps/web/src/domains/creator/brush/StudioDrawOptionsBar.tsx");
    const inspector = source("apps/web/src/domains/creator/StudioInspectorDrawingSection.tsx");
    const mobile = source("apps/web/src/domains/creator/StudioMobileEditingDock.tsx");
    const canvasHud = source("apps/web/src/domains/creator/canvas/StudioCanvasStageHud.tsx");

    expect(options).toContain('data-studio-pixel-pencil-professional="true"');
    expect(options).toContain("STUDIO_PIXEL_PENCIL_MAX_STROKE_WIDTH");
    expect(options).toContain('aria-label="픽셀 팁 크기 프리셋"');
    expect(inspector).toContain('data-studio-pixel-pencil-properties="true"');
    expect(inspector).toContain("<StudioInspectorSymmetrySection");
    expect(mobile).toContain('data-studio-mobile-pixel-pencil-professional="true"');
    expect(mobile).toContain('aria-label={drawMode === "pixel" ? "픽셀 팁 크기 슬라이더"');
    expect(canvasHud).toContain('? { mode: "pixel", widthPx: strokeWidth');
    expect(canvasHud).toContain('{tool === "draw" && symmetryType !== "none" ? (');
  });

  it("never resets width or symmetry merely because pixel mode is selected", () => {
    const controls = source(
      "apps/web/src/domains/creator/StudioInspectorDrawModeControls.tsx",
    );
    expect(controls).not.toContain("onStrokeWidthChange(1)");
    expect(controls).not.toContain('onSymmetryChange("none")');
    expect(controls).toContain("PIXEL PERFECT");
  });
});
''',
)

print("Applied professional pixel-pencil controls and product contract")
