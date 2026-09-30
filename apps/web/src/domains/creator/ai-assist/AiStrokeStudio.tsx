import { useCallback, useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { AiBeforeAfter } from "./AiBeforeAfter";
import { AiIntensityControl } from "./AiIntensityControl";
import {
  mirrorStrokeSymmetric,
  normalizeStrokePressure,
  smoothStrokeChaikin,
  stabilizeStroke,
  type AiStrokePoint,
  type AiSymmetryAxis,
} from "./ai-stroke-assist";

const CANVAS_SIZE = 320;

const SYMMETRY_OPTIONS: readonly { value: AiSymmetryAxis; ko: string; en: string }[] = [
  { value: "none", ko: "끄기", en: "Off" },
  { value: "vertical", ko: "좌우 대칭", en: "Vertical mirror" },
  { value: "horizontal", ko: "상하 대칭", en: "Horizontal mirror" },
  { value: "both", ko: "양쪽 대칭", en: "Both axes" },
];

/** 스트로크 폴리라인을 캔버스에 그린다 */
function drawStrokePath(
  ctx: CanvasRenderingContext2D,
  points: readonly AiStrokePoint[],
  color: string,
  baseWidth: number,
): void {
  if (points.length === 0) return;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (points.length === 1) {
    const p = points[0];
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(p.x, p.y, (baseWidth * (0.4 + p.pressure)) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    ctx.lineWidth = baseWidth * (0.4 + cur.pressure);
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(cur.x, cur.y);
    ctx.stroke();
  }
}

/**
 * AI 선화 정리 스튜디오 — 손떨림 보정·스무딩·대칭 체험.
 *
 * 사용성 (10초 규칙):
 * 1. "캔버스에 그려보세요"가 첫 화면 — 즉시 체험
 * 2. 핵심 액션 1개: "AI 정리 적용" — 가장 크게
 * 3. 결과는 Before/After 슬라이더로 즉시 비교
 */
export function AiStrokeStudio() {
  const t = useBilingual("ai-assist");
  const rawCanvasRef = useRef<HTMLCanvasElement>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<AiStrokePoint[][]>([]);
  const currentStrokeRef = useRef<AiStrokePoint[] | null>(null);

  const [strokeCount, setStrokeCount] = useState(0);
  const [intensity, setIntensity] = useState(0.7);
  const [symmetry, setSymmetry] = useState<AiSymmetryAxis>("none");
  const [smoothIterations, setSmoothIterations] = useState(2);
  const [beforeUrl, setBeforeUrl] = useState("");
  const [afterUrl, setAfterUrl] = useState("");
  const [cleanedCount, setCleanedCount] = useState(0);

  // 원본 캔버스 다시 그리기
  const redrawRaw = useCallback(() => {
    const canvas = rawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    // 대칭 축 가이드
    if (symmetry === "vertical" || symmetry === "both") {
      ctx.strokeStyle = "#7c5cff";
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(CANVAS_SIZE / 2, 0);
      ctx.lineTo(CANVAS_SIZE / 2, CANVAS_SIZE);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (symmetry === "horizontal" || symmetry === "both") {
      ctx.strokeStyle = "#7c5cff";
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, CANVAS_SIZE / 2);
      ctx.lineTo(CANVAS_SIZE / 2, CANVAS_SIZE / 2);
      ctx.lineTo(CANVAS_SIZE, CANVAS_SIZE / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const stroke of strokesRef.current) {
      drawStrokePath(ctx, stroke, "#1a1a2e", 5);
      // 대칭 미러는 연한 보라로 미리보기
      if (symmetry !== "none") {
        const mirrored = mirrorStrokeSymmetric(stroke, symmetry, CANVAS_SIZE / 2, CANVAS_SIZE / 2).slice(stroke.length);
        drawStrokePath(ctx, mirrored, "rgba(124, 92, 255, 0.45)", 4);
      }
    }
    if (currentStrokeRef.current) {
      drawStrokePath(ctx, currentStrokeRef.current, "#1a1a2e", 5);
    }
  }, [symmetry]);

  useEffect(() => {
    redrawRaw();
  }, [redrawRaw, strokeCount]);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): AiStrokePoint => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = CANVAS_SIZE / rect.width;
    return {
      x: (e.clientX - rect.left) * scale,
      y: (e.clientY - rect.top) * scale,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
      timestamp: performance.now(),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    currentStrokeRef.current = [pointFromEvent(e)];
    redrawRaw();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!currentStrokeRef.current) return;
    currentStrokeRef.current.push(pointFromEvent(e));
    redrawRaw();
  };

  const handlePointerUp = (): void => {
    if (currentStrokeRef.current && currentStrokeRef.current.length > 0) {
      strokesRef.current.push(currentStrokeRef.current);
      setStrokeCount(strokesRef.current.length);
    }
    currentStrokeRef.current = null;
    setAfterUrl("");
  };

  /** AI 정리 적용 — 핵심 액션 */
  const applyAiCleanup = useCallback(() => {
    const canvas = resultCanvasRef.current;
    const rawCanvas = rawCanvasRef.current;
    if (!canvas || !rawCanvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    let total = 0;
    for (const stroke of strokesRef.current) {
      const stabilized = stabilizeStroke(stroke, intensity);
      const smoothed = smoothStrokeChaikin(stabilized, smoothIterations);
      const normalized = normalizeStrokePressure(smoothed, intensity * 0.6);
      const final = mirrorStrokeSymmetric(normalized, symmetry, CANVAS_SIZE / 2, CANVAS_SIZE / 2);
      drawStrokePath(ctx, final, "#7c5cff", 5);
      total += 1;
    }
    setBeforeUrl(rawCanvas.toDataURL());
    setAfterUrl(canvas.toDataURL());
    setCleanedCount(total);
  }, [intensity, smoothIterations, symmetry]);

  const clearAll = useCallback(() => {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    setStrokeCount(0);
    setBeforeUrl("");
    setAfterUrl("");
    setCleanedCount(0);
  }, []);

  const undoStroke = useCallback(() => {
    strokesRef.current.pop();
    setStrokeCount(strokesRef.current.length);
    setAfterUrl("");
  }, []);

  return (
    <section className="ai-studio" aria-label={t("AI 선화 정리", "AI line cleanup")}>
      <div className="ai-studio__workspace">
        <div className="ai-studio__canvas-wrap">
          <canvas
            ref={rawCanvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="ai-studio__canvas ai-studio__canvas--draw"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            aria-label={t("그리기 캔버스 — 마우스나 손가락으로 선을 그어보세요", "Drawing canvas — draw lines with mouse or finger")}
            style={{ touchAction: "none" }}
          />
          <canvas ref={resultCanvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} hidden aria-hidden="true" />
          <p className="ai-studio__canvas-hint">
            {strokeCount === 0
              ? t("① 캔버스에 자유롭게 선을 그어보세요", "① Draw freely on the canvas")
              : t(`② ${strokeCount}개 스트로크 — AI 정리 적용을 눌러보세요`, `② ${strokeCount} strokes — press Apply AI Cleanup`)}
          </p>
        </div>

        <div className="ai-studio__controls">
          <div className="ai-studio__mood-row" role="group" aria-label={t("대칭 그리기", "Symmetry")}>
            <label className="ai-studio__field-label" htmlFor="ai-symmetry-select">
              {t("대칭 그리기", "Symmetry")}
            </label>
            <select
              id="ai-symmetry-select"
              className="ai-studio__select"
              value={symmetry}
              onChange={(e) => setSymmetry(e.target.value as AiSymmetryAxis)}
            >
              {SYMMETRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.ko === o.en ? o.ko : `${o.ko} · ${o.en}`}
                </option>
              ))}
            </select>
          </div>

          <AiIntensityControl
            value={intensity}
            onChange={setIntensity}
            label={t("손떨림 보정", "Shake stabilization")}
          />

          <div className="ai-studio__mood-row" role="group" aria-label={t("스무딩", "Smoothing")}>
            <label className="ai-studio__field-label" htmlFor="ai-smooth-select">
              {t("스무딩", "Smoothing")}
            </label>
            <select
              id="ai-smooth-select"
              className="ai-studio__select"
              value={smoothIterations}
              onChange={(e) => setSmoothIterations(Number(e.target.value))}
            >
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {t(`레벨 ${n}`, `Level ${n}`)}
                </option>
              ))}
            </select>
          </div>

          {/* 핵심 액션 1개 */}
          <button
            type="button"
            className="ai-studio__cta ai-studio__cta--primary"
            onClick={applyAiCleanup}
            disabled={strokeCount === 0}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M12 2l2.4 6.2L21 9l-5 4.4L17.5 20 12 16.6 6.5 20 8 13.4 3 9l6.6-.8z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
            {t("AI 정리 적용", "Apply AI cleanup")}
          </button>

          <div className="ai-studio__secondary-row">
            <button type="button" className="ai-studio__ghost" onClick={undoStroke} disabled={strokeCount === 0}>
              {t("되돌리기", "Undo")}
            </button>
            <button type="button" className="ai-studio__ghost" onClick={clearAll} disabled={strokeCount === 0}>
              {t("모두 지우기", "Clear all")}
            </button>
          </div>

          <details className="ai-studio__advanced">
            <summary className="ai-studio__advanced-summary">{t("고급 설정", "Advanced settings")}</summary>
            <p className="ai-studio__advanced-note">
              {t(
                "손떨림 보정은 One Euro 필터, 스무딩은 Chaikin 코너 커팅으로 처리됩니다. 전부 기기 안에서 동작합니다",
                "Shake stabilization uses a One Euro filter, smoothing uses Chaikin corner cutting — all on-device",
              )}
            </p>
            <p className="ai-studio__stat">{t(`정리된 스트로크: ${cleanedCount}개`, `Cleaned strokes: ${cleanedCount}`)}</p>
          </details>
        </div>
      </div>

      {afterUrl && beforeUrl && (
        <div className="ai-studio__result">
          <AiBeforeAfter
            beforeSrc={beforeUrl}
            afterSrc={afterUrl}
            beforeLabel={t("원본", "Original")}
            afterLabel={t("AI 정리", "AI cleaned")}
          />
        </div>
      )}
    </section>
  );
}
