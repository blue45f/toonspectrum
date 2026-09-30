import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  fillColorHints,
  extractReferencePalette,
  DEFAULT_AI_COLOR_FILL_OPTIONS,
  type AiColorHint,
  type AiFilledRegion,
} from "./ai-color-hint-engine";
import { AI_MOOD_PALETTES, getMoodPalette, type AiSceneMood } from "./ai-mood-palettes";
import { AiBeforeAfter } from "./AiBeforeAfter";
import { AiIntensityControl } from "./AiIntensityControl";
import { AiEmptyStateArt } from "./AiFeatureArt";
import { AiWorkflowDiagram } from "./AiWorkflowDiagram";
import { AiLightGuidePanel } from "./AiLightGuidePanel";

const CANVAS_SIZE = 320;

/**
 * 데모 선화 그리기 — 간단한 캐릭터 (얼굴 원 + 몸 + 눈).
 * loadDemoLineArt에서 분리: 캔버스 상태 관리와 그리기 책임을 나눔.
 */
function drawDemoLineArt(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  // 머리
  ctx.beginPath();
  ctx.arc(160, 110, 62, 0, Math.PI * 2);
  ctx.stroke();
  // 몸
  ctx.beginPath();
  ctx.moveTo(110, 172);
  ctx.quadraticCurveTo(160, 160, 210, 172);
  ctx.lineTo(225, 280);
  ctx.quadraticCurveTo(160, 296, 95, 280);
  ctx.closePath();
  ctx.stroke();
  // 눈
  ctx.fillStyle = "#111111";
  ctx.beginPath();
  ctx.arc(138, 105, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(182, 105, 7, 0, Math.PI * 2);
  ctx.fill();
  // 입
  ctx.beginPath();
  ctx.arc(160, 132, 16, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  // 팔
  ctx.beginPath();
  ctx.moveTo(108, 190);
  ctx.quadraticCurveTo(70, 220, 78, 258);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(212, 190);
  ctx.quadraticCurveTo(250, 220, 242, 258);
  ctx.stroke();
}

/**
 * AI 채색 스튜디오 — 힌트 기반 자동 채색의 핵심 UX.
 *
 * 사용성 설계 (10초 규칙):
 * 1. 핵심 액션 1개: "선화에 색 힌트 찍기 → AI 채색 버튼" — 가장 크고 먼저 보임
 * 2. 2차 액션 격하: 팔레트 선택·실행 취소는 작게
 * 3. 고급 설정 접기: 선 감지 임계값 등은 <details> 안에
 * 4. 빈 상태: 데모 선화 불러오기 버튼으로 즉시 체험 가능
 */
export function AiColorHintStudio() {
  const t = useBilingual("ai-assist");
  const lineCanvasRef = useRef<HTMLCanvasElement>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement>(null);

  const [lineArt, setLineArt] = useState<Uint8ClampedArray<ArrayBuffer> | null>(null);
  const [hints, setHints] = useState<readonly AiColorHint[]>([]);
  // 힌트 히스토리 — 명확한 undo/redo
  const [past, setPast] = useState<readonly (readonly AiColorHint[])[]>([]);
  const [future, setFuture] = useState<readonly (readonly AiColorHint[])[]>([]);
  const [selectedColor, setSelectedColor] = useState("#ff6b6b");
  const [mood, setMood] = useState<AiSceneMood>("daily");
  const [intensity, setIntensity] = useState(0.7);
  const [resultUrl, setResultUrl] = useState("");
  const [beforeUrl, setBeforeUrl] = useState("");
  const [regions, setRegions] = useState<readonly AiFilledRegion[]>([]);
  const [referencePalette, setReferencePalette] = useState<readonly string[]>([]);
  const [error, setError] = useState("");

  const palette = getMoodPalette(mood);
  const regionCount = regions.length;

  /** 채색 영역들의 합집합 바운딩 박스 — 음영 가이드 기준 */
  const unionBounds = useMemo(() => {
    if (regions.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of regions) {
      minX = Math.min(minX, r.bounds.x);
      minY = Math.min(minY, r.bounds.y);
      maxX = Math.max(maxX, r.bounds.x + r.bounds.width);
      maxY = Math.max(maxY, r.bounds.y + r.bounds.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }, [regions]);

  /** 힌트 변경은 항상 히스토리에 기록 — undo/redo의 단일 진입점 */
  const commitHints = useCallback((next: readonly AiColorHint[]) => {
    setPast((prev) => [...prev.slice(-49), hints]);
    setFuture([]);
    setHints(next);
    setResultUrl("");
  }, [hints]);

  // 데모 선화 생성: 간단한 캐릭터 (얼굴 원 + 몸 + 눈)
  const loadDemoLineArt = useCallback(() => {
    const canvas = lineCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError(t("캔버스를 초기화할 수 없어요", "Could not initialize canvas"));
      return;
    }
    setError("");
    drawDemoLineArt(ctx);

    const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    setLineArt(imageData.data);
    setBeforeUrl(canvas.toDataURL());
    setHints([]);
    setPast([]);
    setFuture([]);
    setResultUrl("");
    setRegions([]);
    setReferencePalette([]);
  }, [t]);

  // 선화 캔버스 클릭 → 힌트 추가 (핵심 제스처)
  const handleCanvasTap = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!lineArt) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const scaleX = CANVAS_SIZE / rect.width;
      const scaleY = CANVAS_SIZE / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      commitHints([...hints, { x, y, color: selectedColor }]);
    },
    [lineArt, hints, selectedColor, commitHints],
  );

  // AI 채색 실행 — 핵심 액션 1개
  const runAiColoring = useCallback(() => {
    if (!lineArt || hints.length === 0) return;
    try {
      const { colorLayer, regions } = fillColorHints(lineArt, CANVAS_SIZE, CANVAS_SIZE, hints, {
        ...DEFAULT_AI_COLOR_FILL_OPTIONS,
        intensity,
      });
      // 색 레이어 + 선화 합성
      const resultCanvas = resultCanvasRef.current;
      if (!resultCanvas) return;
      const ctx = resultCanvas.getContext("2d");
      if (!ctx) return;
      const colorImage = new ImageData(
        new Uint8ClampedArray<ArrayBuffer>(colorLayer.buffer, colorLayer.byteOffset, colorLayer.length),
        CANVAS_SIZE,
        CANVAS_SIZE,
      );
      const lineImage = new ImageData(new Uint8ClampedArray(lineArt), CANVAS_SIZE, CANVAS_SIZE);
      // 합성 순서: 흰 바탕 → 색 레이어 → 선화.
      // 선화는 흰 배경이 불투명하므로 putImageData로 덮으면 색이 가려진다.
      // "darken" 합성(채널별 최소값)으로 선만 남기고 흰 배경은 색 레이어를 통과시킨다.
      const lineTile = document.createElement("canvas");
      lineTile.width = CANVAS_SIZE;
      lineTile.height = CANVAS_SIZE;
      const lineTileCtx = lineTile.getContext("2d");
      if (!lineTileCtx) return;
      lineTileCtx.putImageData(lineImage, 0, 0);
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.putImageData(colorImage, 0, 0);
      ctx.globalCompositeOperation = "darken";
      ctx.drawImage(lineTile, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      setResultUrl(resultCanvas.toDataURL());
      setRegions(regions);
      // 이전 컷 참조: 이번 채색에서 많이 쓰인 색 추출 → 다음 컷 색 일관성용
      setReferencePalette(extractReferencePalette(colorLayer, 6));
      setError("");
    } catch {
      setError(t("채색 중 오류가 발생했어요. 힌트를 다시 찍어보세요", "Coloring failed. Try placing hints again"));
    }
  }, [lineArt, hints, intensity, t]);

  const undoHint = useCallback(() => {
    if (past.length === 0) return;
    const restored = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([hints, ...future]);
    setHints(restored);
    setResultUrl("");
  }, [hints, past, future]);

  const redoHint = useCallback(() => {
    if (future.length === 0) return;
    const [restored, ...rest] = future;
    setPast([...past, hints]);
    setFuture(rest);
    setHints(restored);
    setResultUrl("");
  }, [hints, past, future]);

  const clearHints = useCallback(() => {
    if (hints.length === 0) return;
    commitHints([]);
    setRegions([]);
  }, [hints, commitHints]);

  // 힌트 마커 오버레이 렌더
  useEffect(() => {
    const canvas = lineCanvasRef.current;
    if (!canvas || !lineArt) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(lineArt), CANVAS_SIZE, CANVAS_SIZE), 0, 0);
    for (const hint of hints) {
      ctx.beginPath();
      ctx.arc(hint.x, hint.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = hint.color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }
  }, [lineArt, hints]);

  return (
    <section className="ai-studio" aria-label={t("AI 자동 채색", "AI auto coloring")}>
      {/* 1단계: 빈 상태 — 즉시 체험 유도 */}
      {!lineArt && (
        <div className="ai-studio__empty" role="status">
          <AiEmptyStateArt />
          <h3 className="ai-studio__empty-title">{t("AI 채색을 시작해 보세요", "Try AI coloring")}</h3>
          <p className="ai-studio__empty-text">
            {t(
              "선화에 색 힌트를 찍으면 AI가 영역을 찾아 자동으로 채색합니다",
              "Tap color hints on line art and AI fills the regions automatically",
            )}
          </p>
          <button type="button" className="ai-studio__cta" onClick={loadDemoLineArt}>
            {t("데모 선화로 시작하기", "Start with demo line art")}
          </button>
        </div>
      )}

      {lineArt && (
        <>
          <AiWorkflowDiagram />
          <div className="ai-studio__workspace">
          {/* 핵심 액션 영역 */}
          <div className="ai-studio__canvas-wrap">
            <canvas
              ref={lineCanvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="ai-studio__canvas"
              onPointerDown={handleCanvasTap}
              role="button"
              tabIndex={0}
              aria-label={t("선화 캔버스 — 탭해서 색 힌트 찍기", "Line art canvas — tap to place color hints")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  commitHints([...hints, { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2, color: selectedColor }]);
                }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                  e.preventDefault();
                  if (e.shiftKey) redoHint();
                  else undoHint();
                }
              }}
            />
            <canvas ref={resultCanvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} hidden aria-hidden="true" />
            <p className="ai-studio__canvas-hint">
              {hints.length === 0
                ? t("① 선화를 탭해서 색 힌트를 찍으세요", "① Tap the line art to place color hints")
                : t(`② ${hints.length}개 힌트 — AI 채색 버튼을 누르세요`, `② ${hints.length} hints — press AI Colorize`)}
            </p>
          </div>

          {/* 색상 선택 (2차 액션 — 작게) */}
          <div className="ai-studio__controls">
            <div className="ai-studio__mood-row" role="group" aria-label={t("분위기", "Mood")}>
              <label className="ai-studio__field-label" htmlFor="ai-mood-select">
                {t("분위기", "Mood")}
              </label>
              <select
                id="ai-mood-select"
                className="ai-studio__select"
                value={mood}
                onChange={(e) => setMood(e.target.value as AiSceneMood)}
              >
                {AI_MOOD_PALETTES.map((p) => (
                  <option key={p.mood} value={p.mood}>
                    {p.label.ko === p.label.en ? p.label.ko : `${p.label.ko} · ${p.label.en}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="ai-studio__swatches" role="group" aria-label={t("색상 선택", "Pick a color")}>
              {palette.colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`ai-studio__swatch${selectedColor === color ? " ai-studio__swatch--active" : ""}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedColor(color)}
                  aria-label={color}
                  aria-pressed={selectedColor === color}
                />
              ))}
            </div>

            {/* 핵심 액션 1개 — 가장 크게 */}
            <button
              type="button"
              className="ai-studio__cta ai-studio__cta--primary"
              onClick={runAiColoring}
              disabled={hints.length === 0}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path
                  d="M15 4V2m0 20v-2m5-15l1.5-1.5M7.5 20.5L9 19M20 9h2M2 9h2m14.5 11.5L20 22M4 2l1.5 1.5M12 5a7 7 0 100 14 7 7 0 000-14z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              {t("AI 채색", "AI Colorize")}
            </button>

            {/* 2차 액션 — 격하 */}
            <div className="ai-studio__secondary-row">
              <button type="button" className="ai-studio__ghost" onClick={undoHint} disabled={past.length === 0}>
                {t("되돌리기", "Undo")}
              </button>
              <button type="button" className="ai-studio__ghost" onClick={redoHint} disabled={future.length === 0}>
                {t("다시 실행", "Redo")}
              </button>
              <button type="button" className="ai-studio__ghost" onClick={clearHints} disabled={hints.length === 0}>
                {t("모두 지우기", "Clear all")}
              </button>
            </div>

            <AiIntensityControl value={intensity} onChange={setIntensity} />

            {/* 이전 컷 참조 팔레트 — 색 일관성 */}
            {referencePalette.length > 0 && (
              <div className="ai-studio__ref" role="group" aria-label={t("이전 컷 참조 팔레트", "Reference palette")}>
                <span className="ai-studio__field-label">
                  {t("이전 컷 참조", "From last coloring")}
                </span>
                <div className="ai-studio__swatches">
                  {referencePalette.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`ai-studio__swatch${selectedColor === color ? " ai-studio__swatch--active" : ""}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setSelectedColor(color)}
                      aria-label={t(`참조 색상 ${color}`, `Reference color ${color}`)}
                      aria-pressed={selectedColor === color}
                    />
                  ))}
                </div>
                <p className="ai-studio__advanced-note">
                  {t("이전 채색에서 많이 쓰인 색 — 이어 그릴 때 색감을 맞추세요", "Most-used colors from the last coloring — keep tones consistent")}
                </p>
              </div>
            )}

            {/* 고급 설정 — 접기 */}
            <details className="ai-studio__advanced">
              <summary className="ai-studio__advanced-summary">{t("고급 설정", "Advanced settings")}</summary>
              <p className="ai-studio__advanced-note">
                {t(
                  "선 감지 임계값과 채색 영역 통계를 조정합니다. 보통은 기본값 그대로 두세요",
                  "Adjust line detection threshold. Defaults work well in most cases",
                )}
              </p>
              <p className="ai-studio__stat">
                {t(`채색된 영역: ${regionCount}개`, `Colored regions: ${regionCount}`)}
              </p>
            </details>
          </div>
          </div>
        </>
      )}

      {/* 결과 비교 */}
      {resultUrl && beforeUrl && (
        <div className="ai-studio__result">
          <AiBeforeAfter beforeSrc={beforeUrl} afterSrc={resultUrl} />
        </div>
      )}

      {/* 그림자·하이라이트 가이드 */}
      {regions.length > 0 && (
        <AiLightGuidePanel bounds={unionBounds} canvasSize={CANVAS_SIZE} intensity={intensity} />
      )}

      {/* 에러 상태 — 다음 행동 가이드 */}
      {error && (
        <div className="ai-studio__error" role="alert">
          <p>{error}</p>
          <button type="button" className="ai-studio__ghost" onClick={loadDemoLineArt}>
            {t("데모 선화 다시 불러오기", "Reload demo line art")}
          </button>
        </div>
      )}
    </section>
  );
}
