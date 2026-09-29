/**
 * ScreentoneLayerPanel.tsx (T6)
 *
 * 스크린톤 레이어 패널 — 선택 영역에 붙이는 톤 레이어의 파라미터 편집 UI.
 * 기존 layer/StudioLayerTonePanel(픽셀 하프톤 필터용)과 달리
 * screentone/ 네임스페이스의 ScreentoneLayer 모델을 다룬다.
 * 한국어 라벨은 컴포넌트 내 상수로 둔다(i18n 파일 수정 없음).
 */

import { useEffect, useRef } from "react";
import { Layers } from "lucide-react";

import {
  DEFAULT_SCREENTONE_LAYER,
  SCREENTONE_ANGLE_RANGE,
  SCREENTONE_DENSITY_RANGE,
  SCREENTONE_GRADIENT_DIRECTION_RANGE,
  SCREENTONE_LINES_RANGE,
  isIdentityScreentoneLayer,
  normalizeScreentoneLayer,
  type ScreentoneGradientKind,
  type ScreentoneLayer,
  type ScreentoneToneKind,
} from "./screentone-layer";
import { renderScreentone } from "./screentone-render";

import { cn } from "@/shared/lib/utils";

// --- 컴포넌트 내 한국어 라벨 상수 ---
const KIND_OPTIONS: ReadonlyArray<{ id: ScreentoneToneKind; label: string; tip: string }> = [
  { id: "dot", label: "도트", tip: "원형 도트 격자 — 표준 만화 스크린톤" },
  { id: "line", label: "사선", tip: "평행선 — 농도에 따라 선 두께 변화" },
  { id: "sand", label: "모래망점", tip: "시드 기반 노이즈 입자 — 거친 질감" },
  { id: "cross", label: "격자", tip: "십자 교차선 — 촘촘한 해치 질감" },
];

const GRADIENT_OPTIONS: ReadonlyArray<{ id: ScreentoneGradientKind; label: string; tip: string }> = [
  { id: "none", label: "없음", tip: "균일 농도 톤" },
  { id: "linear", label: "선형", tip: "방향을 따라 시작→끝 농도로 변하는 톤" },
  { id: "radial", label: "방사형", tip: "중심→바깥으로 시작→끝 농도로 변하는 톤" },
];

const LABEL_ROW = "flex items-center justify-between gap-2 text-xs text-fg-2";
const RANGE_CLASS = "w-24 accent-sky-500 cursor-pointer";
const READOUT_CLASS = "w-10 text-right text-[10px] tabular-nums text-fg-3";
const SECTION_LABEL = "text-[11px] text-fg-3";

const KIND_BUTTON_BASE =
  "rounded border px-1 py-1 text-[10px] text-center transition-colors truncate";
const KIND_BUTTON_ACTIVE = "border-sky-500 bg-sky-500/20 text-sky-200 font-medium";
const KIND_BUTTON_IDLE = "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg";

const PREVIEW_WIDTH = 240;
const PREVIEW_HEIGHT = 96;

export function ScreentoneLayerPanel({
  value,
  disabled,
  onChange,
}: {
  readonly value?: Partial<ScreentoneLayer> | null;
  readonly disabled?: boolean;
  readonly onChange: (next: ScreentoneLayer) => void;
}) {
  const current = normalizeScreentoneLayer(value);
  const isEnabled = !isIdentityScreentoneLayer(current);
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  // 미리보기 — 파라미터가 바뀔 때마다 다시 그린다.
  // jsdom 등 canvas 미지원 환경에서는 getContext가 null을 돌려주므로 가드한다.
  // current는 렌더마다 normalize로 새로 만들어지므로, 사실상 파라미터 변경 시에만 다시 그린다.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    // 흰 바탕 위에 톤 렌더 (검정 잉크 + alpha).
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    renderScreentone(ctx, canvas.width, canvas.height, current);
  }, [current]);

  const patch = (partial: Partial<ScreentoneLayer>): void => {
    onChange(normalizeScreentoneLayer({ ...current, ...partial }));
  };

  const patchGradient = (partial: Partial<ScreentoneLayer["gradient"]>): void => {
    patch({ gradient: { ...current.gradient, ...partial } });
  };

  const handleToggle = (): void => {
    if (isEnabled) {
      patch({ density: 0, gradient: { ...current.gradient, fromDensity: 0, toDensity: 0 } });
    } else {
      patch({
        ...DEFAULT_SCREENTONE_LAYER,
        kind: current.kind,
        lines: current.lines,
        angle: current.angle,
        seed: current.seed,
        density: 40,
      });
    }
  };

  const reshuffleSeed = (): void => {
    patch({ seed: Math.floor(Math.random() * 10000) });
  };

  const gradientOn = current.gradient.kind !== "none";

  return (
    <div className="rounded-xl border border-line bg-panel/40 p-3 space-y-2 select-none text-xs">
      {/* 헤더 & 토글 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Layers size={14} className="text-sky-400 shrink-0" aria-hidden />
          <span className="font-semibold text-fg truncate">스크린톤 레이어</span>
          <span className="px-1 py-0.2 text-[10px] rounded font-medium bg-sky-500/20 text-sky-300 border border-sky-500/30 shrink-0">
            CSP
          </span>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          aria-pressed={isEnabled}
          className={cn(
            "rounded-md border px-2 py-0.5 text-[0.66rem] font-medium transition-colors",
            isEnabled
              ? "border-sky-500/50 bg-sky-500/15 text-sky-300"
              : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          {isEnabled ? "톤 On" : "톤 Off"}
        </button>
      </div>

      {isEnabled && (
        <div className="space-y-2 pt-1 border-t border-line/40">
          {/* 미리보기 */}
          <div className="space-y-1">
            <p className={SECTION_LABEL}>미리보기</p>
            <canvas
              ref={previewRef}
              width={PREVIEW_WIDTH}
              height={PREVIEW_HEIGHT}
              className="h-24 w-full rounded-md border border-line bg-white"
              aria-label="스크린톤 미리보기"
            />
          </div>

          {/* 망점 종류 */}
          <div className="space-y-1">
            <p className={SECTION_LABEL}>망점 종류</p>
            <div className="grid grid-cols-4 gap-1">
              {KIND_OPTIONS.map((opt) => {
                const active = current.kind === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patch({ kind: opt.id })}
                    disabled={disabled}
                    title={opt.tip}
                    aria-pressed={active}
                    className={cn(KIND_BUTTON_BASE, active ? KIND_BUTTON_ACTIVE : KIND_BUTTON_IDLE)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 선 수 */}
          <div className={LABEL_ROW}>
            <label htmlFor="screentone-lines" className="text-[11px]">
              선 수
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id="screentone-lines"
                type="range"
                min={SCREENTONE_LINES_RANGE.min}
                max={SCREENTONE_LINES_RANGE.max}
                step={SCREENTONE_LINES_RANGE.step}
                value={current.lines}
                disabled={disabled}
                onChange={(e) => patch({ lines: Number(e.target.value) })}
                className={RANGE_CLASS}
                aria-label="선 수 조절"
              />
              <span className={READOUT_CLASS}>{current.lines}선</span>
            </div>
          </div>

          {/* 농도 */}
          <div className={LABEL_ROW}>
            <label htmlFor="screentone-density" className="text-[11px]">
              농도
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id="screentone-density"
                type="range"
                min={SCREENTONE_DENSITY_RANGE.min}
                max={SCREENTONE_DENSITY_RANGE.max}
                step={SCREENTONE_DENSITY_RANGE.step}
                value={current.density}
                disabled={disabled}
                onChange={(e) => patch({ density: Number(e.target.value) })}
                className={RANGE_CLASS}
                aria-label="농도 조절"
              />
              <span className={READOUT_CLASS}>{current.density}%</span>
            </div>
          </div>

          {/* 각도 */}
          <div className={LABEL_ROW}>
            <label htmlFor="screentone-angle" className="text-[11px]">
              각도
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id="screentone-angle"
                type="range"
                min={SCREENTONE_ANGLE_RANGE.min}
                max={SCREENTONE_ANGLE_RANGE.max}
                step={SCREENTONE_ANGLE_RANGE.step}
                value={current.angle}
                disabled={disabled}
                onChange={(e) => patch({ angle: Number(e.target.value) })}
                className={RANGE_CLASS}
                aria-label="각도 조절"
              />
              <span className={READOUT_CLASS}>{current.angle}°</span>
            </div>
          </div>

          {/* 모래망점 시드 */}
          {current.kind === "sand" && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-fg-3">노이즈 시드: {current.seed}</span>
              <button
                type="button"
                onClick={reshuffleSeed}
                disabled={disabled}
                className="rounded-md border border-line bg-card px-2 py-0.5 text-[10px] text-fg-2 transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
              >
                다시 섞기
              </button>
            </div>
          )}

          {/* 그라데이션 */}
          <div className="space-y-1 pt-1 border-t border-line/40">
            <p className={SECTION_LABEL}>그라데이션 톤</p>
            <div className="grid grid-cols-3 gap-1">
              {GRADIENT_OPTIONS.map((opt) => {
                const active = current.gradient.kind === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patchGradient({ kind: opt.id })}
                    disabled={disabled}
                    title={opt.tip}
                    aria-pressed={active}
                    className={cn(KIND_BUTTON_BASE, active ? KIND_BUTTON_ACTIVE : KIND_BUTTON_IDLE)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {gradientOn && (
              <div className="space-y-2 pt-1">
                {current.gradient.kind === "linear" && (
                  <div className={LABEL_ROW}>
                    <label htmlFor="screentone-gradient-direction" className="text-[11px]">
                      그라데이션 방향
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id="screentone-gradient-direction"
                        type="range"
                        min={SCREENTONE_GRADIENT_DIRECTION_RANGE.min}
                        max={SCREENTONE_GRADIENT_DIRECTION_RANGE.max}
                        step={SCREENTONE_GRADIENT_DIRECTION_RANGE.step}
                        value={current.gradient.direction}
                        disabled={disabled}
                        onChange={(e) => patchGradient({ direction: Number(e.target.value) })}
                        className={RANGE_CLASS}
                        aria-label="그라데이션 방향 조절"
                      />
                      <span className={READOUT_CLASS}>{current.gradient.direction}°</span>
                    </div>
                  </div>
                )}
                <div className={LABEL_ROW}>
                  <label htmlFor="screentone-gradient-from" className="text-[11px]">
                    시작 농도
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="screentone-gradient-from"
                      type="range"
                      min={SCREENTONE_DENSITY_RANGE.min}
                      max={SCREENTONE_DENSITY_RANGE.max}
                      step={SCREENTONE_DENSITY_RANGE.step}
                      value={current.gradient.fromDensity}
                      disabled={disabled}
                      onChange={(e) => patchGradient({ fromDensity: Number(e.target.value) })}
                      className={RANGE_CLASS}
                      aria-label="그라데이션 시작 농도 조절"
                    />
                    <span className={READOUT_CLASS}>{current.gradient.fromDensity}%</span>
                  </div>
                </div>
                <div className={LABEL_ROW}>
                  <label htmlFor="screentone-gradient-to" className="text-[11px]">
                    끝 농도
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="screentone-gradient-to"
                      type="range"
                      min={SCREENTONE_DENSITY_RANGE.min}
                      max={SCREENTONE_DENSITY_RANGE.max}
                      step={SCREENTONE_DENSITY_RANGE.step}
                      value={current.gradient.toDensity}
                      disabled={disabled}
                      onChange={(e) => patchGradient({ toDensity: Number(e.target.value) })}
                      className={RANGE_CLASS}
                      aria-label="그라데이션 끝 농도 조절"
                    />
                    <span className={READOUT_CLASS}>{current.gradient.toDensity}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
