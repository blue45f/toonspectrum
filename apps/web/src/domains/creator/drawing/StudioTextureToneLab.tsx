/**
 * StudioTextureToneLab.tsx
 *
 * "질감·톤 실험실" — Clip Studio 격차 보강(이중 브러시·스크린톤·그라데이션 맵·타임랩스)을
 * 한 곳에서 실험하는 패널.
 *
 * 10초 규칙: 헤드라인 한 줄
 * "브러시에 종이결을 입히고, 만화 톤을 붙이고, 색감을 한 번에 바꾸는 실험실"로 목적 전달.
 * 각 탭 = 기능 하나 + 실시간 캔버스 프리뷰. 복잡한 값은 슬라이더·프리셋으로 격하.
 *
 * - ko/en (translateAuthoredSourceText)
 * - 다크/라이트 테마 토글
 * - 390px 대응 (가로 스크롤 탭, 스택 레이아웃)
 * - reduced-motion: 장식 애니메이션 비활성화 (타임랩스 자동재생 없음)
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import {
  getCurrentUiLocale,
  translateAuthoredSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  STUDIO_NATURAL_MEDIA_PRESETS,
  type StudioNaturalMediaBrushId,
} from "./studio-natural-media-brushes";
import {
  STUDIO_DUAL_BRUSH_COMBOS,
  STUDIO_DUAL_BRUSH_TEXTURES,
  compositeDualBrushStroke,
  createTextureCanvasTile,
  generateTextureTile,
  getDualBrushCombo,
  type StudioDualBrushBlendMode,
  type StudioDualBrushComboId,
  type StudioDualBrushTextureId,
} from "./studio-dual-brush";
import {
  STUDIO_SCREENTONE_PRESETS,
  buildScreentoneTile,
  fillScreentoneRegion,
  hexToRgb,
  measureScreentoneCoverage,
  type ScreentonePattern,
} from "./studio-screentone";
import {
  STUDIO_GRADIENT_MAP_PRESETS,
  applyGradientMapToRgba,
  buildGradientMapLut,
  createCustomGradientModel,
  getGradientMapPreset,
  rgbToHex,
  validateGradientStops,
  type StudioGradientMapPresetId,
  type StudioGradientStop,
} from "./studio-gradient-map";
import {
  TIMELAPSE_PLAYBACK_RATES,
  advanceTimelapsePlayback,
  createTimelapseSession,
  estimateTimelapseExportSize,
  formatTimelapseTime,
  getMediaRecorderExportGuide,
  getTimelapseDurationMs,
  getTimelapseProgress,
  getTimelapseStats,
  getVisibleStrokes,
  recordStroke,
  type TimelapsePlaybackRate,
  type TimelapseSession,
  type TimelapseStroke,
  type TimelapseStrokeSample,
} from "./studio-timelapse";

/* ------------------------------------------------------------------ */
/* 공통                                                                  */
/* ------------------------------------------------------------------ */

type LabTabId = "dual-brush" | "screentone" | "gradient-map" | "timelapse";

const LAB_TABS: ReadonlyArray<LabTabId> = [
  "dual-brush",
  "screentone",
  "gradient-map",
  "timelapse",
];

const TAB_LABEL_KO: Record<LabTabId, string> = {
  "dual-brush": "이중 브러시",
  screentone: "스크린톤",
  "gradient-map": "그라데이션 맵",
  timelapse: "타임랩스",
};

const TAB_LABEL_EN: Record<LabTabId, string> = {
  "dual-brush": "Dual brush",
  screentone: "Screentone",
  "gradient-map": "Gradient map",
  timelapse: "Timelapse",
};

const PREVIEW_W = 640;
const PREVIEW_H = 300;

function useTx(): (source: string) => string {
  useBilingualI18nRevision();
  const locale = getCurrentUiLocale();
  return (source: string) =>
    translateAuthoredSourceText(locale, "ko", "StudioTextureToneLab", source);
}

/** 데이터 모듈의 labelKo/labelEn 쌍을 현재 로케일에 맞게 고르는 헬퍼. */
function useLocaleLabel(): (ko: string, en: string) => string {
  useBilingualI18nRevision();
  const locale = getCurrentUiLocale();
  const isEn = locale.startsWith("en");
  return (ko, en) => (isEn ? en : ko);
}

interface Theme {
  readonly panel: string;
  readonly card: string;
  readonly heading: string;
  readonly body: string;
  readonly muted: string;
  readonly input: string;
  readonly canvasBg: string;
}

function useTheme(dark: boolean): Theme {
  return useMemo<Theme>(
    () =>
      dark
        ? {
            panel:
              "border-white/10 bg-gradient-to-b from-[#171226] via-[#12101d] to-[#0d0b14]",
            card: "border-white/10 bg-white/[0.04]",
            heading: "text-white",
            body: "text-white/70",
            muted: "text-white/45",
            input: "border-white/15 bg-white/[0.06] text-white",
            canvasBg: "#14111f",
          }
        : {
            panel: "border-slate-900/10 bg-gradient-to-b from-[#faf8ff] to-[#f1edfb]",
            card: "border-slate-900/10 bg-white",
            heading: "text-slate-900",
            body: "text-slate-700",
            muted: "text-slate-500",
            input: "border-slate-300 bg-white text-slate-900",
            canvasBg: "#ffffff",
          },
    [dark],
  );
}

/* ------------------------------------------------------------------ */
/* 탭 1: 이중 브러시                                                      */
/* ------------------------------------------------------------------ */

function drawDualBrushPreview(
  canvas: HTMLCanvasElement,
  baseColor: string,
  textureId: StudioDualBrushTextureId,
  blendMode: StudioDualBrushBlendMode,
  strength: number,
  scale: number,
  canvasBg: string,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
  ctx.fillStyle = canvasBg;
  ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);

  // 1) 기본 팁 스트로크 (물결 + 필압 변화)
  const strokeCanvas = document.createElement("canvas");
  strokeCanvas.width = PREVIEW_W;
  strokeCanvas.height = PREVIEW_H;
  const sctx = strokeCanvas.getContext("2d");
  if (!sctx) return;
  sctx.lineCap = "round";
  sctx.lineJoin = "round";
  sctx.strokeStyle = baseColor;
  const steps = 64;
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const x0 = 48 + t0 * (PREVIEW_W - 96);
    const x1 = 48 + t1 * (PREVIEW_W - 96);
    const y0 = PREVIEW_H / 2 + Math.sin(t0 * Math.PI * 2.2) * PREVIEW_H * 0.26;
    const y1 = PREVIEW_H / 2 + Math.sin(t1 * Math.PI * 2.2) * PREVIEW_H * 0.26;
    sctx.lineWidth = 8 + 30 * Math.sin(t0 * Math.PI);
    sctx.beginPath();
    sctx.moveTo(x0, y0);
    sctx.lineTo(x1, y1);
    sctx.stroke();
  }

  // 2) 질감 타일 합성
  const tileSize = 128;
  const tile = generateTextureTile(textureId, { size: tileSize });
  const result = compositeDualBrushStroke(strokeCanvas, tile, tileSize, {
    blendMode,
    textureStrength: strength,
    textureScale: scale,
  });
  ctx.drawImage(result ?? strokeCanvas, 0, 0);

  // 3) 질감 타일 미니맵 (우하단)
  const mini = createTextureCanvasTile(tile, tileSize);
  if (mini) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(mini, PREVIEW_W - 76, PREVIEW_H - 76, 64, 64);
    ctx.restore();
  }
}

function DualBrushTab({
  tx,
  lz,
  theme,
}: {
  tx: (s: string) => string;
  lz: (ko: string, en: string) => string;
  theme: Theme;
}): ReactElement {
  const [comboId, setComboId] = useState<StudioDualBrushComboId | "custom">(
    "bristle-fibers",
  );
  const [baseBrushId, setBaseBrushId] =
    useState<StudioNaturalMediaBrushId>("charcoal");
  const [textureId, setTextureId] =
    useState<StudioDualBrushTextureId>("fibers");
  const [blendMode, setBlendMode] =
    useState<StudioDualBrushBlendMode>("overlay");
  const [strength, setStrength] = useState(0.65);
  const [scale, setScale] = useState(0.8);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const applyCombo = (id: StudioDualBrushComboId | "custom"): void => {
    setComboId(id);
    if (id === "custom") return;
    const combo = getDualBrushCombo(id);
    if (!combo) return;
    setBaseBrushId(combo.config.baseBrushId);
    setTextureId(combo.config.textureId);
    setBlendMode(combo.config.blendMode);
    setStrength(combo.config.textureStrength);
    setScale(combo.config.textureScale);
  };

  const basePreset = STUDIO_NATURAL_MEDIA_PRESETS.find((p) => p.id === baseBrushId);
  const baseColor = "#8b5cf6";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawDualBrushPreview(
      canvas,
      baseColor,
      textureId,
      blendMode,
      strength,
      scale,
      theme.canvasBg,
    );
  }, [baseBrushId, textureId, blendMode, strength, scale, theme.canvasBg]);

  const selectCls = `w-full rounded-xl border px-3 py-2 text-sm ${theme.input}`;
  const labelCls = `mb-1 block text-xs font-semibold ${theme.muted}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-4">
        <div>
          <label htmlFor="dual-combo" className={labelCls}>
            {tx("조합 프리셋")}
          </label>
          <select
            id="dual-combo"
            value={comboId}
            onChange={(e) => applyCombo(e.target.value as StudioDualBrushComboId | "custom")}
            className={selectCls}
          >
            {STUDIO_DUAL_BRUSH_COMBOS.map((c) => (
              <option key={c.id} value={c.id}>
                {lz(c.labelKo, c.labelEn)}
              </option>
            ))}
            <option value="custom">{tx("직접 조합")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="dual-base" className={labelCls}>
            {tx("기본 팁 (브러시)")}
          </label>
          <select
            id="dual-base"
            value={baseBrushId}
            onChange={(e) => {
              setBaseBrushId(e.target.value as StudioNaturalMediaBrushId);
              setComboId("custom");
            }}
            className={selectCls}
          >
            {STUDIO_NATURAL_MEDIA_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {lz(p.labelKo, p.labelEn)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dual-texture" className={labelCls}>
            {tx("질감 팁")}
          </label>
          <select
            id="dual-texture"
            value={textureId}
            onChange={(e) => {
              setTextureId(e.target.value as StudioDualBrushTextureId);
              setComboId("custom");
            }}
            className={selectCls}
          >
            {STUDIO_DUAL_BRUSH_TEXTURES.map((t) => (
              <option key={t.id} value={t.id}>
                {lz(t.labelKo, t.labelEn)} — {lz(t.descriptionKo, t.descriptionEn)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dual-blend" className={labelCls}>
            {tx("결합 모드")}
          </label>
          <select
            id="dual-blend"
            value={blendMode}
            onChange={(e) => {
              setBlendMode(e.target.value as StudioDualBrushBlendMode);
              setComboId("custom");
            }}
            className={selectCls}
          >
            <option value="multiply">{tx("곱하기 (어둡게)")}</option>
            <option value="screen">{tx("스크린 (밝게)")}</option>
            <option value="overlay">{tx("오버레이 (대비)")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="dual-strength" className={labelCls}>
            {tx("질감 강도")} — {Math.round(strength * 100)}%
          </label>
          <input
            id="dual-strength"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={strength}
            onChange={(e) => {
              setStrength(Number(e.target.value));
              setComboId("custom");
            }}
            className="w-full accent-violet-500"
          />
        </div>
        <div>
          <label htmlFor="dual-scale" className={labelCls}>
            {tx("질감 스케일")} — {scale.toFixed(2)}×
          </label>
          <input
            id="dual-scale"
            type="range"
            min={0.25}
            max={4}
            step={0.05}
            value={scale}
            onChange={(e) => {
              setScale(Number(e.target.value));
              setComboId("custom");
            }}
            className="w-full accent-violet-500"
          />
        </div>
      </div>
      <div>
        <canvas
          ref={canvasRef}
          width={PREVIEW_W}
          height={PREVIEW_H}
          className="w-full rounded-2xl border"
          style={{ borderColor: "rgba(128,128,128,0.25)" }}
          role="img"
          aria-label={tx("이중 브러시 미리보기: 기본 팁에 질감이 결합된 스트로크")}
        />
        <p className={`mt-2 text-xs ${theme.muted}`}>
          {tx("기본 팁:")}{" "}
          {basePreset ? lz(basePreset.labelKo, basePreset.labelEn) : "—"} ·{" "}
          {tx("질감:")}{" "}
          {(() => {
            const t = STUDIO_DUAL_BRUSH_TEXTURES.find((x) => x.id === textureId);
            return t ? lz(t.labelKo, t.labelEn) : "—";
          })()}{" "}
          ·{tx("우하단 미니맵은 질감 타일 원본입니다.")}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 탭 2: 스크린톤                                                         */
/* ------------------------------------------------------------------ */

function ScreentoneTab({
  tx,
  lz,
  theme,
}: {
  tx: (s: string) => string;
  lz: (ko: string, en: string) => string;
  theme: Theme;
}): ReactElement {
  const [presetId, setPresetId] = useState<string>("dot-30");
  const [pattern, setPattern] = useState<ScreentonePattern>("dot");
  const [density, setDensity] = useState(30);
  const [lines, setLines] = useState(24);
  const [angle, setAngle] = useState(45);
  const [ink, setInk] = useState("#1e1b2e");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const applyPreset = (id: string): void => {
    setPresetId(id);
    const preset = STUDIO_SCREENTONE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPattern(preset.config.pattern);
    setDensity(preset.config.density);
    setLines(preset.config.lines);
    setAngle(preset.config.angleDeg);
  };

  const measured = useMemo(() => {
    const tile = buildScreentoneTile(
      { pattern, density, lines, angleDeg: angle },
      { size: 120 },
    );
    return measureScreentoneCoverage(tile);
  }, [pattern, density, lines, angle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
    ctx.fillStyle = theme.canvasBg;
    ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
    const rgb = hexToRgb(ink);
    // 배경 톤 영역
    fillScreentoneRegion(
      ctx,
      { pattern, density, lines, angleDeg: angle },
      24,
      24,
      PREVIEW_W - 48,
      PREVIEW_H - 48,
      rgb,
    );
    // 전경: 농도 2배의 원형 하이라이트 톤
    ctx.save();
    ctx.beginPath();
    ctx.arc(PREVIEW_W / 2, PREVIEW_H / 2, 72, 0, Math.PI * 2);
    ctx.clip();
    fillScreentoneRegion(
      ctx,
      {
        pattern,
        density: Math.min(80, density * 2),
        lines: Math.max(8, lines - 6),
        angleDeg: (angle + 45) % 180,
      },
      PREVIEW_W / 2 - 72,
      PREVIEW_H / 2 - 72,
      144,
      144,
      rgb,
    );
    ctx.restore();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(PREVIEW_W / 2, PREVIEW_H / 2, 72, 0, Math.PI * 2);
    ctx.stroke();
  }, [pattern, density, lines, angle, ink, theme.canvasBg]);

  const selectCls = `w-full rounded-xl border px-3 py-2 text-sm ${theme.input}`;
  const labelCls = `mb-1 block text-xs font-semibold ${theme.muted}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-4">
        <div>
          <label htmlFor="tone-preset" className={labelCls}>
            {tx("톤 프리셋")}
          </label>
          <select
            id="tone-preset"
            value={presetId}
            onChange={(e) => applyPreset(e.target.value)}
            className={selectCls}
          >
            {STUDIO_SCREENTONE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {lz(p.labelKo, p.labelEn)}
              </option>
            ))}
          </select>
        </div>
        <fieldset>
          <legend className={labelCls}>{tx("패턴")}</legend>
          <div className="flex gap-2" role="radiogroup" aria-label={tx("패턴")}>
            {(
              [
                ["dot", tx("도트")],
                ["line", tx("사선")],
                ["cross", tx("크로스")],
              ] as Array<[ScreentonePattern, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={pattern === value}
                onClick={() => {
                  setPattern(value);
                  setPresetId("custom");
                }}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                  pattern === value
                    ? "border-violet-400 bg-violet-500/20 text-violet-200"
                    : `${theme.card} ${theme.body} hover:border-violet-300/40`
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="tone-density" className={labelCls}>
            {tx("농도")} — {density}% ({tx("실측")}{" "}
            {Math.round(measured * 100)}%)
          </label>
          <input
            id="tone-density"
            type="range"
            min={10}
            max={80}
            step={1}
            value={density}
            onChange={(e) => {
              setDensity(Number(e.target.value));
              setPresetId("custom");
            }}
            className="w-full accent-violet-500"
          />
        </div>
        <div>
          <label htmlFor="tone-lines" className={labelCls}>
            {tx("선 수")} — {lines}
          </label>
          <input
            id="tone-lines"
            type="range"
            min={8}
            max={72}
            step={1}
            value={lines}
            onChange={(e) => {
              setLines(Number(e.target.value));
              setPresetId("custom");
            }}
            className="w-full accent-violet-500"
          />
        </div>
        <div>
          <label htmlFor="tone-angle" className={labelCls}>
            {tx("각도")} — {angle}°
          </label>
          <input
            id="tone-angle"
            type="range"
            min={0}
            max={180}
            step={1}
            value={angle}
            onChange={(e) => {
              setAngle(Number(e.target.value));
              setPresetId("custom");
            }}
            className="w-full accent-violet-500"
          />
        </div>
        <div>
          <label htmlFor="tone-ink" className={labelCls}>
            {tx("잉크 색")}
          </label>
          <input
            id="tone-ink"
            type="color"
            value={ink}
            onChange={(e) => setInk(e.target.value)}
            className="h-10 w-16 cursor-pointer rounded-lg border border-white/15 bg-transparent"
          />
        </div>
      </div>
      <div>
        <canvas
          ref={canvasRef}
          width={PREVIEW_W}
          height={PREVIEW_H}
          className="w-full rounded-2xl border"
          style={{ borderColor: "rgba(128,128,128,0.25)" }}
          role="img"
          aria-label={tx("스크린톤 미리보기")}
        />
        <p className={`mt-2 text-xs ${theme.muted}`}>
          {tx("중앙 원은 농도 2배의 강조 톤입니다. 영역 채우기용 패턴 타일로 바로 쓸 수 있습니다.")}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 탭 3: 그라데이션 맵                                                     */
/* ------------------------------------------------------------------ */

function drawGradientTestScene(
  ctx: CanvasRenderingContext2D,
  lut: Uint8Array,
): void {
  // 테스트 장면: 좌측 명도 램프 + 우측 색상 스윕
  const scene = document.createElement("canvas");
  scene.width = PREVIEW_W;
  scene.height = PREVIEW_H;
  const sctx = scene.getContext("2d");
  if (!sctx) return;
  for (let x = 0; x < PREVIEW_W; x += 1) {
    const t = x / PREVIEW_W;
    if (t < 0.35) {
      // 명도 램프 (검→백)
      const g = Math.round((t / 0.35) * 255);
      sctx.fillStyle = `rgb(${g},${g},${g})`;
    } else {
      // 색상 스윕
      const h = ((t - 0.35) / 0.65) * 360;
      sctx.fillStyle = `hsl(${h}, 75%, 55%)`;
    }
    sctx.fillRect(x, 0, 1, PREVIEW_H);
  }
  // 명암 구조용 도형
  sctx.fillStyle = "rgba(0,0,0,0.55)";
  sctx.beginPath();
  sctx.arc(PREVIEW_W * 0.68, PREVIEW_H * 0.42, 58, 0, Math.PI * 2);
  sctx.fill();
  sctx.fillStyle = "rgba(255,255,255,0.75)";
  sctx.fillRect(PREVIEW_W * 0.12, PREVIEW_H * 0.62, 120, 44);

  const image = sctx.getImageData(0, 0, PREVIEW_W, PREVIEW_H);
  const mapped = applyGradientMapToRgba(image.data, lut);
  const out = new ImageData(mapped, PREVIEW_W, PREVIEW_H);
  ctx.putImageData(out, 0, 0);
}

function GradientMapTab({
  tx,
  lz,
  theme,
}: {
  tx: (s: string) => string;
  lz: (ko: string, en: string) => string;
  theme: Theme;
}): ReactElement {
  const [presetId, setPresetId] =
    useState<StudioGradientMapPresetId>("sunset");
  const [custom, setCustom] = useState(false);
  const [stops, setStops] = useState<ReadonlyArray<StudioGradientStop>>(
    () => getGradientMapPreset("sunset")?.stops ?? [],
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const validation = useMemo(() => validateGradientStops(stops), [stops]);
  const lut = useMemo(
    () => (validation.ok ? buildGradientMapLut(stops) : null),
    [stops, validation.ok],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !lut) return;
    drawGradientTestScene(ctx, lut);
  }, [lut]);

  const applyPreset = (id: StudioGradientMapPresetId): void => {
    setPresetId(id);
    setCustom(false);
    const preset = getGradientMapPreset(id);
    if (preset) setStops(preset.stops);
  };

  const updateStop = (index: number, patch: Partial<StudioGradientStop>): void => {
    setCustom(true);
    const model = createCustomGradientModel(stops);
    let next = model;
    if (patch.position !== undefined) next = next.moveStop(index, patch.position);
    if (patch.color !== undefined) next = next.recolorStop(index, patch.color);
    setStops(next.stops);
  };

  const addStop = (): void => {
    setCustom(true);
    const model = createCustomGradientModel(stops);
    setStops(model.addStop({ position: 0.5, color: [128, 128, 128] }).stops);
  };

  const removeStop = (index: number): void => {
    setCustom(true);
    setStops(createCustomGradientModel(stops).removeStop(index).stops);
  };

  const selectCls = `w-full rounded-xl border px-3 py-2 text-sm ${theme.input}`;
  const labelCls = `mb-1 block text-xs font-semibold ${theme.muted}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div className="space-y-4">
        <div>
          <label htmlFor="grad-preset" className={labelCls}>
            {tx("그라데이션 맵 프리셋")}
          </label>
          <select
            id="grad-preset"
            value={custom ? "custom" : presetId}
            onChange={(e) =>
              applyPreset(e.target.value as StudioGradientMapPresetId)
            }
            className={selectCls}
          >
            {STUDIO_GRADIENT_MAP_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {lz(p.labelKo, p.labelEn)} — {lz(p.descriptionKo, p.descriptionEn)}
              </option>
            ))}
            {custom && <option value="custom">{tx("커스텀 (편집 중)")}</option>}
          </select>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className={`text-xs font-semibold ${theme.muted}`}>
              {tx("정지점 편집")} ({stops.length})
            </span>
            <button
              type="button"
              onClick={addStop}
              disabled={stops.length >= 16}
              className="rounded-lg border border-violet-400/40 bg-violet-500/15 px-2.5 py-1 text-xs font-bold text-violet-200 transition-colors hover:bg-violet-500/25 disabled:opacity-40"
            >
              {tx("정지점 추가")}
            </button>
          </div>
          <ol className="space-y-2">
            {stops.map((stop, index) => (
              <li
                key={`${stop.position.toFixed(4)}-${index}`}
                className={`flex items-center gap-2 rounded-xl border p-2 ${theme.card}`}
              >
                <input
                  type="color"
                  value={rgbToHex(stop.color[0], stop.color[1], stop.color[2])}
                  onChange={(e) => {
                    const v = parseInt(e.target.value.slice(1), 16);
                    updateStop(index, {
                      color: [(v >> 16) & 255, (v >> 8) & 255, v & 255],
                    });
                  }}
                  aria-label={tx("정지점 색상 ") + (index + 1)}
                  className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-white/15 bg-transparent"
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={stop.position}
                  onChange={(e) =>
                    updateStop(index, { position: Number(e.target.value) })
                  }
                  aria-label={tx("정지점 위치 ") + (index + 1)}
                  className="min-w-0 flex-1 accent-violet-500"
                />
                <span className={`w-10 shrink-0 text-right text-xs tabular-nums ${theme.muted}`}>
                  {Math.round(stop.position * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => removeStop(index)}
                  disabled={stops.length <= 2}
                  aria-label={tx("정지점 삭제 ") + (index + 1)}
                  className="shrink-0 rounded-lg px-2 py-1 text-sm text-red-400 transition-colors hover:bg-red-500/15 disabled:opacity-30"
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
          {!validation.ok && (
            <p role="alert" className="mt-2 text-xs text-red-400">
              {validation.errors[0]}
            </p>
          )}
        </div>
      </div>
      <div>
        <canvas
          ref={canvasRef}
          width={PREVIEW_W}
          height={PREVIEW_H}
          className="w-full rounded-2xl border"
          style={{ borderColor: "rgba(128,128,128,0.25)" }}
          role="img"
          aria-label={tx("그라데이션 맵 미리보기: 명도가 색상으로 매핑된 테스트 장면")}
        />
        <p className={`mt-2 text-xs ${theme.muted}`}>
          {tx("좌측 명도 램프 → 그라데이션 위치, 우측 색상 스윕 → 매핑 결과. 명암 구조는 유지되고 색감만 바뀝니다.")}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 탭 4: 타임랩스                                                          */
/* ------------------------------------------------------------------ */

function buildSampleSession(): TimelapseSession {
  const wave: TimelapseStrokeSample[] = [];
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 40;
    wave.push({
      timeMs: Math.round(t * 3000),
      x: 60 + t * 520,
      y: 150 + Math.sin(t * Math.PI * 3) * 70,
      pressure: 0.4 + 0.6 * Math.sin(t * Math.PI),
    });
  }
  const spiral: TimelapseStrokeSample[] = [];
  for (let i = 0; i <= 60; i += 1) {
    const t = i / 60;
    const a = t * Math.PI * 6;
    const r = 18 + t * 80;
    spiral.push({
      timeMs: Math.round(3500 + t * 3000),
      x: 320 + Math.cos(a) * r,
      y: 150 + Math.sin(a) * r * 0.66,
      pressure: 0.7,
    });
  }
  const circle: TimelapseStrokeSample[] = [];
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 40;
    const a = t * Math.PI * 2;
    circle.push({
      timeMs: Math.round(7000 + t * 2000),
      x: 320 + Math.cos(a) * 62,
      y: 150 + Math.sin(a) * 62,
      pressure: 0.5,
    });
  }
  const defs: TimelapseStroke[] = [
    { id: "wave", color: "#8b5cf6", width: 10, startedAtMs: 0, endedAtMs: 3000, samples: wave },
    { id: "spiral", color: "#06b6d4", width: 7, startedAtMs: 3500, endedAtMs: 6500, samples: spiral },
    { id: "circle", color: "#f472b6", width: 12, startedAtMs: 7000, endedAtMs: 9000, samples: circle },
  ];
  let session = createTimelapseSession();
  for (const s of defs) session = recordStroke(session, s);
  return session;
}

function drawTimelapseFrame(
  canvas: HTMLCanvasElement,
  session: TimelapseSession,
  playbackMs: number,
  canvasBg: string,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
  ctx.fillStyle = canvasBg;
  ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
  const visible = getVisibleStrokes(session, playbackMs);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of visible) {
    ctx.strokeStyle = stroke.color;
    const n = stroke.samples.length;
    for (let i = 0; i + 1 < n; i += 1) {
      const a = stroke.samples[i];
      const b = stroke.samples[i + 1];
      ctx.lineWidth = Math.max(1, stroke.width * (a.pressure ?? 0.5));
      ctx.beginPath();
      ctx.moveTo(a.x, (a.y / 300) * PREVIEW_H);
      ctx.lineTo(b.x, (b.y / 300) * PREVIEW_H);
      ctx.stroke();
    }
  }
}

function TimelapseTab({
  tx,
  theme,
  dark,
}: {
  tx: (s: string) => string;
  theme: Theme;
  dark: boolean;
}): ReactElement {
  const [session, setSession] = useState<TimelapseSession | null>(null);
  const [playbackMs, setPlaybackMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<TimelapsePlaybackRate>(2);
  const [showGuide, setShowGuide] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<TimelapseSession | null>(null);
  sessionRef.current = session;

  const locale = getCurrentUiLocale();
  const guideLocale = locale.startsWith("en") ? "en" : "ko";
  const guide = useMemo(
    () => getMediaRecorderExportGuide(guideLocale),
    [guideLocale],
  );

  const duration = session ? getTimelapseDurationMs(session) : 0;
  const stats = useMemo(
    () => (session ? getTimelapseStats(session) : null),
    [session],
  );
  const estimate = useMemo(
    () =>
      session
        ? estimateTimelapseExportSize(session, { fps: 30 })
        : null,
    [session],
  );

  // 재생 루프
  useEffect(() => {
    if (!playing || !sessionRef.current) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number): void => {
      const dt = now - last;
      last = now;
      const current = sessionRef.current;
      if (!current) {
        setPlaying(false);
        return;
      }
      setPlaybackMs((prev) => {
        const tick = advanceTimelapsePlayback(current, prev, rate, dt);
        if (tick.finished) setPlaying(false);
        return tick.playbackTimeMs;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate]);

  // 프레임 렌더
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !session) return;
    drawTimelapseFrame(canvas, session, playbackMs, theme.canvasBg);
  }, [session, playbackMs, theme.canvasBg]);

  const startSample = (): void => {
    setSession(buildSampleSession());
    setPlaybackMs(0);
    setPlaying(false);
  };

  const seek = (ms: number): void => {
    setPlaying(false);
    setPlaybackMs(Math.max(0, Math.min(duration, ms)));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={startSample}
          className="rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          {tx("샘플 녹화 만들기")}
        </button>
        {session && (
          <>
            <button
              type="button"
              onClick={() => {
                if (playbackMs >= duration) setPlaybackMs(0);
                setPlaying((v) => !v);
              }}
              aria-pressed={playing}
              className={`rounded-2xl border px-6 py-2.5 text-sm font-bold transition-colors ${theme.card} ${theme.heading} hover:border-violet-400/50`}
            >
              {playing ? tx("일시정지") : tx("재생")}
            </button>
            <label className={`flex items-center gap-2 text-sm ${theme.body}`}>
              {tx("속도")}
              <select
                value={rate}
                onChange={(e) =>
                  setRate(Number(e.target.value) as TimelapsePlaybackRate)
                }
                aria-label={tx("재생 속도")}
                className={`rounded-xl border px-2 py-1.5 text-sm ${theme.input}`}
              >
                {TIMELAPSE_PLAYBACK_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}×
                  </option>
                ))}
              </select>
            </label>
            <span className={`text-sm tabular-nums ${theme.muted}`}>
              {formatTimelapseTime(playbackMs)} / {formatTimelapseTime(duration)}
            </span>
          </>
        )}
      </div>

      {session ? (
        <>
          <canvas
            ref={canvasRef}
            width={PREVIEW_W}
            height={PREVIEW_H}
            className="w-full rounded-2xl border"
            style={{ borderColor: "rgba(128,128,128,0.25)" }}
            role="img"
            aria-label={tx("타임랩스 재생 미리보기")}
          />
          <div>
            <label htmlFor="timelapse-seek" className="sr-only">
              {tx("재생 위치")}
            </label>
            <input
              id="timelapse-seek"
              type="range"
              min={0}
              max={Math.max(1, duration)}
              step={10}
              value={playbackMs}
              onChange={(e) => seek(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
            <div
              className="h-1.5 overflow-hidden rounded-full bg-white/10"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-100"
                style={{
                  width: `${Math.round(getTimelapseProgress(session, playbackMs) * 100)}%`,
                }}
              />
            </div>
          </div>
          {stats && estimate && (
            <dl
              className={`grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 ${theme.body}`}
            >
              <div className={`rounded-xl border p-3 ${theme.card}`}>
                <dt className={`text-xs ${theme.muted}`}>{tx("스트로크")}</dt>
                <dd className="text-lg font-bold tabular-nums">{stats.strokeCount}</dd>
              </div>
              <div className={`rounded-xl border p-3 ${theme.card}`}>
                <dt className={`text-xs ${theme.muted}`}>{tx("샘플")}</dt>
                <dd className="text-lg font-bold tabular-nums">{stats.sampleCount}</dd>
              </div>
              <div className={`rounded-xl border p-3 ${theme.card}`}>
                <dt className={`text-xs ${theme.muted}`}>{tx("녹화 길이")}</dt>
                <dd className="text-lg font-bold tabular-nums">
                  {formatTimelapseTime(stats.durationMs)}
                </dd>
              </div>
              <div className={`rounded-xl border p-3 ${theme.card}`}>
                <dt className={`text-xs ${theme.muted}`}>{tx("WebM 추정 크기")}</dt>
                <dd className="text-lg font-bold tabular-nums">
                  {estimate.humanReadable}
                </dd>
              </div>
            </dl>
          )}
          <div className={`rounded-2xl border ${theme.card}`}>
            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              aria-expanded={showGuide}
              className={`flex w-full items-center justify-between px-5 py-3 text-sm font-semibold ${theme.heading}`}
            >
              {tx("MediaRecorder WebM 내보내기 가이드")}
              <span aria-hidden="true" className={showGuide ? "rotate-180" : ""}>
                ▾
              </span>
            </button>
            {showGuide && (
              <ol className={`space-y-2 border-t px-5 py-4 text-sm ${theme.body} ${dark ? "border-white/10" : "border-slate-900/10"}`}>
                {guide.map((step, i) => (
                  <li key={i} className="leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      ) : (
        <p className={`rounded-2xl border border-dashed p-8 text-center text-sm ${theme.card} ${theme.muted}`}>
          {tx("먼저 “샘플 녹화 만들기”를 눌러 9초짜리 데모 타임라인을 생성하세요. 재생·시크·배속을 바로 실험할 수 있습니다.")}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 실험실 본체                                                           */
/* ------------------------------------------------------------------ */

export interface StudioTextureToneLabProps {
  readonly initialTab?: LabTabId;
  readonly initialDark?: boolean;
}

export function StudioTextureToneLab({
  initialTab = "dual-brush",
  initialDark = true,
}: StudioTextureToneLabProps): ReactElement {
  const tx = useTx();
  const lz = useLocaleLabel();
  const locale = getCurrentUiLocale();
  const isEn = locale.startsWith("en");
  const [tab, setTab] = useState<LabTabId>(initialTab);
  const [dark, setDark] = useState(initialDark);
  const theme = useTheme(dark);
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={`relative overflow-hidden rounded-3xl border p-6 sm:p-8 ${theme.panel}`}
    >
      <style>{`
        @keyframes studio-lab-tab-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .studio-lab-tab-panel { animation: studio-lab-tab-enter 0.35s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .studio-lab-tab-panel { animation: none !important; }
          .studio-lab-tab-panel * { transition: none !important; }
        }
      `}</style>

      <div className="relative">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <p
              className={`text-xs font-semibold uppercase tracking-[0.2em] ${
                dark ? "text-violet-300/80" : "text-violet-600"
              }`}
            >
              {tx("질감 · 톤 실험실")}
            </p>
            <h2
              id={headingId}
              className={`mt-1 text-2xl font-black sm:text-3xl ${theme.heading}`}
            >
              {tx("브러시에 종이결을 입히고, 만화 톤을 붙이고, 색감을 한 번에 바꾸는 실험실")}
            </h2>
            <p className={`mt-2 text-sm ${theme.muted}`}>
              {tx("탭을 골라 슬라이더를 움직여보세요. 모든 미리보기는 실시간으로 다시 그려집니다.")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDark((v) => !v)}
            aria-pressed={!dark}
            aria-label={dark ? tx("라이트 테마로 전환") : tx("다크 테마로 전환")}
            className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors ${theme.card} ${theme.body} hover:border-violet-400/50`}
          >
            {dark ? tx("☀ 라이트") : tx("☾ 다크")}
          </button>
        </header>

        {/* 탭 바 */}
        <div
          role="tablist"
          aria-label={tx("실험실 기능")}
          className="-mx-1 mt-6 flex gap-2 overflow-x-auto px-1 pb-1"
        >
          {LAB_TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-label={lz(TAB_LABEL_KO[id], TAB_LABEL_EN[id])}
              onClick={() => setTab(id)}
              className={`shrink-0 rounded-2xl border px-5 py-2.5 text-sm font-bold transition-all ${
                tab === id
                  ? "border-violet-400 bg-gradient-to-r from-violet-500/30 to-fuchsia-500/20 text-violet-100 shadow-lg shadow-violet-500/20"
                  : `${theme.card} ${theme.muted} hover:border-violet-300/40 ${theme.body}`
              } ${!dark && tab === id ? "!text-violet-700" : ""}`}
            >
              {tx(TAB_LABEL_KO[id])}
              {!isEn && (
                <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide opacity-60">
                  {TAB_LABEL_EN[id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 탭 패널 */}
        <div
          key={tab}
          role="tabpanel"
          className="studio-lab-tab-panel mt-6"
        >
          {tab === "dual-brush" && <DualBrushTab tx={tx} lz={lz} theme={theme} />}
          {tab === "screentone" && <ScreentoneTab tx={tx} lz={lz} theme={theme} />}
          {tab === "gradient-map" && <GradientMapTab tx={tx} lz={lz} theme={theme} />}
          {tab === "timelapse" && (
            <TimelapseTab tx={tx} theme={theme} dark={dark} />
          )}
        </div>
      </div>
    </section>
  );
}

export default StudioTextureToneLab;
