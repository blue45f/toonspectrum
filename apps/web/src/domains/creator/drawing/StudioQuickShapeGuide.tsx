/**
 * StudioQuickShapeGuide — 퀵쉐이프 안내 패널.
 *
 * 10초 규칙: "그리고 잠깐 누르고 있으면 삐뚤빼뚤한 선이 반듯한 도형으로" 한 줄로 목적 전달.
 * - 실제 `quick-shape.ts` 분류기로 만든 SVG 애니메이션 가이드:
 *   삐뚤빼뚤한 타원 그리기 → 0.5초 홀드 링 → 반듯한 타원으로 보정 (6초 루프).
 * - "완벽 도형" 토글: 두 번째 손가락을 댄 것처럼 타원→원으로 바꾼다.
 * - ko/en (defineBilingualText), 라이트/다크 (테마 CSS 변수), 390px,
 *   reduced-motion 대응 (모션 끄면 최종 보정 상태만 표시).
 */
import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { useT } from "@/shared/lib/i18n";
import {
  defineBilingualText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  classifyQuickShape,
  perfectifyQuickShape,
  quickShapeGeometryToSvgPathData,
  type QuickShapePoint,
} from "./quick-shape";

/* ------------------------------------------------------------------ */
/* 카피 (ko/en authored)                                                */
/* ------------------------------------------------------------------ */

const COPY = {
  panelLabel: defineBilingualText(
    "StudioQuickShapeGuide",
    "panelLabel",
    "퀵쉐이프 안내",
    "QuickShape guide",
  ),
  eyebrow: defineBilingualText(
    "StudioQuickShapeGuide",
    "eyebrow",
    "퀵쉐이프",
    "QuickShape",
  ),
  headline: defineBilingualText(
    "StudioQuickShapeGuide",
    "headline",
    "그리고 잠깐 누르고 있으면 삐뚤빼뚤한 선이 반듯한 도형으로",
    "Draw, hold a moment, and a wobbly line becomes a clean shape",
  ),
  sub: defineBilingualText(
    "StudioQuickShapeGuide",
    "sub",
    "펜을 떼지 않고 0.5초만 누르고 계세요. 직선·타원·사각형·삼각형으로 자동 보정됩니다.",
    "Keep the pen down for half a second. Auto-corrects to line, ellipse, rectangle, or triangle.",
  ),
  demoAria: defineBilingualText(
    "StudioQuickShapeGuide",
    "demoAria",
    "퀵쉐이프 동작 데모: 삐뚤빼뚤한 타원이 홀드 후 반듯한 타원으로 보정됩니다",
    "QuickShape demo: a wobbly ellipse is corrected to a clean ellipse after holding",
  ),
  perfectToggle: defineBilingualText(
    "StudioQuickShapeGuide",
    "perfectToggle",
    "완벽 도형",
    "Perfect shape",
  ),
  perfectOn: defineBilingualText(
    "StudioQuickShapeGuide",
    "perfectOn",
    "두 번째 손가락을 댄 상태 — 완벽한 원이 됩니다",
    "Second finger down — becomes a perfect circle",
  ),
  perfectOff: defineBilingualText(
    "StudioQuickShapeGuide",
    "perfectOff",
    "두 번째 손가락을 대면 완벽한 원·정사각형·정삼각형이 됩니다",
    "Touch a second finger for a perfect circle, square, or equilateral triangle",
  ),
  replay: defineBilingualText("StudioQuickShapeGuide", "replay", "다시 보기", "Replay"),
  confidence: defineBilingualText(
    "StudioQuickShapeGuide",
    "confidence",
    "인식 신뢰도",
    "Recognition confidence",
  ),
  holdCaption: defineBilingualText(
    "StudioQuickShapeGuide",
    "holdCaption",
    "홀딩 중…",
    "Holding…",
  ),
  step1: defineBilingualText(
    "StudioQuickShapeGuide",
    "step1",
    "대충 그립니다",
    "Sketch roughly",
  ),
  step2: defineBilingualText(
    "StudioQuickShapeGuide",
    "step2",
    "펜을 떼지 말고 0.5초 유지",
    "Hold 0.5s without lifting",
  ),
  step3: defineBilingualText(
    "StudioQuickShapeGuide",
    "step3",
    "반듯한 도형으로 보정",
    "Snaps to a clean shape",
  ),
  note: defineBilingualText(
    "StudioQuickShapeGuide",
    "note",
    "애매하면 원본을 그대로 둡니다. 직선은 15° 단위로 스냅됩니다.",
    "Keeps your original when unsure. Lines snap to 15° steps.",
  ),
} as const;

/* ------------------------------------------------------------------ */
/* 데모 스트로크 (결정적 시드)                                           */
/* ------------------------------------------------------------------ */

function wobblyEllipsePoints(): QuickShapePoint[] {
  let seed = 987654321;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  const points: QuickShapePoint[] = [];
  const n = 44;
  for (let i = 0; i <= n; i += 1) {
    const angle = (i / n) * Math.PI * 2;
    const wobble = 1 + rand() * 0.14;
    points.push({
      x: 160 + Math.cos(angle) * 95 * wobble,
      y: 85 + Math.sin(angle) * 52 * wobble,
    });
  }
  return points;
}

function polylinePathData(points: ReadonlyArray<QuickShapePoint>): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join("");
}

/* ------------------------------------------------------------------ */
/* 패널                                                                 */
/* ------------------------------------------------------------------ */

export function StudioQuickShapeGuide(): ReactElement {
  useBilingualI18nRevision();
  const t = useT();
  const [perfect, setPerfect] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  const wobblyPoints = useMemo(() => wobblyEllipsePoints(), []);
  const wobblyD = useMemo(() => polylinePathData(wobblyPoints), [wobblyPoints]);
  const classified = useMemo(() => classifyQuickShape(wobblyPoints), [wobblyPoints]);
  const displayed = useMemo(
    () => (perfect ? perfectifyQuickShape(classified) : classified),
    [classified, perfect],
  );
  const cleanD = useMemo(
    () => quickShapeGeometryToSvgPathData(displayed.geometry),
    [displayed],
  );
  const endPoint = wobblyPoints[wobblyPoints.length - 1]!;

  return (
    <section
      aria-label={t(COPY.panelLabel)}
      className="w-full max-w-[420px] rounded-3xl border p-5 sm:p-6"
      style={{
        background: "var(--color-panel)",
        borderColor: "var(--color-line)",
        color: "var(--color-fg)",
      }}
    >
      <style>{`
        @keyframes qsg-draw {
          0% { stroke-dashoffset: 1000; }
          28% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes qsg-wobbly-visibility {
          0%, 46% { opacity: 1; }
          58%, 100% { opacity: 0; }
        }
        @keyframes qsg-holdring {
          0%, 30% { opacity: 0; transform: scale(0.5); }
          38% { opacity: 0.95; transform: scale(1); }
          48% { opacity: 0.95; transform: scale(1.4); }
          56%, 100% { opacity: 0; transform: scale(1.6); }
        }
        @keyframes qsg-clean-visibility {
          0%, 50% { opacity: 0; }
          62%, 90% { opacity: 1; }
          100% { opacity: 0; }
        }
        .qsg-anim { animation-duration: 6s; animation-iteration-count: infinite; }
        .qsg-draw { animation-name: qsg-draw; }
        .qsg-wobbly { animation-name: qsg-wobbly-visibility; }
        .qsg-holdring {
          animation-name: qsg-holdring;
          transform-box: fill-box;
          transform-origin: center;
        }
        .qsg-clean { animation-name: qsg-clean-visibility; }
        @media (prefers-reduced-motion: reduce) {
          .qsg-anim { animation: none !important; }
          .qsg-wobbly { opacity: 0 !important; }
          .qsg-holdring { display: none !important; }
          .qsg-clean { opacity: 1 !important; }
        }
      `}</style>

      <p
        className="text-xs font-semibold uppercase tracking-[0.18em]"
        style={{ color: "var(--color-accent)" }}
      >
        {t(COPY.eyebrow)}
      </p>
      <h2 className="mt-1 text-xl font-black leading-snug sm:text-2xl">
        {t(COPY.headline)}
      </h2>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--color-fg-2)" }}>
        {t(COPY.sub)}
      </p>

      {/* 애니메이션 데모 */}
      <div
        className="mt-4 overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--color-line)", background: "var(--color-canvas)" }}
      >
        <svg
          key={replayKey}
          viewBox="0 0 320 170"
          className="block h-44 w-full"
          role="img"
          aria-label={t(COPY.demoAria)}
        >
          {/* 삐뚤빼뚤한 원본 스트로크 */}
          <path
            d={wobblyD}
            fill="none"
            stroke="var(--color-fg-3)"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1000}
            strokeDasharray={1000}
            className="qsg-anim qsg-draw qsg-wobbly"
          />
          {/* 홀드 링 */}
          <circle
            cx={endPoint.x}
            cy={endPoint.y}
            r={16}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={3}
            className="qsg-anim qsg-holdring"
          />
          {/* 보정된 도형 */}
          <path
            d={cleanD}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={5}
            strokeLinecap="round"
            className="qsg-anim qsg-clean"
          />
        </svg>
        <div
          className="flex items-center justify-between border-t px-4 py-2.5"
          style={{ borderColor: "var(--color-line)" }}
        >
          <p className="text-xs" style={{ color: "var(--color-fg-3)" }}>
            <span aria-hidden="true">◉ </span>
            {t(COPY.holdCaption)}{" "}
            <span className="tabular-nums">
              {t(COPY.confidence)} {Math.round(displayed.confidence * 100)}%
            </span>
          </p>
          <button
            type="button"
            onClick={() => setReplayKey((k) => k + 1)}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: "var(--color-raised)",
              color: "var(--color-fg-2)",
              border: "1px solid var(--color-line)",
            }}
          >
            {t(COPY.replay)}
          </button>
        </div>
      </div>

      {/* 완벽 도형 토글 */}
      <button
        type="button"
        onClick={() => setPerfect((v) => !v)}
        aria-pressed={perfect}
        className="mt-3 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-transform active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          background: perfect ? "var(--color-accent-soft)" : "var(--color-raised)",
          borderColor: "var(--color-line)",
        }}
      >
        <span>
          <span className="block text-sm font-bold">{t(COPY.perfectToggle)}</span>
          <span className="mt-0.5 block text-xs" style={{ color: "var(--color-fg-2)" }}>
            {t(perfect ? COPY.perfectOn : COPY.perfectOff)}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
          style={{ background: perfect ? "var(--color-accent)" : "var(--color-line)" }}
        >
          <span
            className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
            style={{ left: perfect ? "1.375rem" : "0.125rem" }}
          />
        </span>
      </button>

      {/* 3단계 안내 */}
      <ol className="mt-4 space-y-1.5 border-t pt-4" style={{ borderColor: "var(--color-line)" }}>
        {[
          { n: "1", labelKey: COPY.step1 },
          { n: "2", labelKey: COPY.step2 },
          { n: "3", labelKey: COPY.step3 },
        ].map((step) => (
          <li key={step.n} className="flex items-center gap-2.5 text-[13px]">
            <span
              aria-hidden="true"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
            >
              {step.n}
            </span>
            <span style={{ color: "var(--color-fg-2)" }}>{t(step.labelKey)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--color-fg-3)" }}>
        {t(COPY.note)}
      </p>
    </section>
  );
}

export default StudioQuickShapeGuide;
