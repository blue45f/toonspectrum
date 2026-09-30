/**
 * StudioVectorLinePanel — 벡터 선 직접 편집 패널.
 *
 * 10초 규칙: "그은 뒤에도 선 굵기를 손으로 어루만지듯 조절하세요" 한 줄로 목적 전달.
 * - 핵심 CTA 1개: 구간 선택 → 굵게/가늘게/테이퍼. 나머지는 격하.
 * - 실제 `studio-vector-line-edit.ts` 커맨드 모델로 동작하는 라이브 데모
 *   (되돌리기/다시실행 포함).
 * - SVG 애니메이션 가이드: 구간 하이라이트 + 선을 따라 움직이는 터치 도트.
 * - ko/en (defineBilingualText), 라이트/다크 (테마 CSS 변수), 390px,
 *   reduced-motion 대응.
 */
import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { useT } from "@/shared/lib/i18n";
import {
  defineBilingualText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  createVectorLineCommand,
  editableLineFromVectorizerPoints,
  emptyVectorLineHistory,
  normalizeWidthRange,
  pushVectorLineCommand,
  redoVectorLine,
  scaleWidthInRange,
  taperWidthInRange,
  undoVectorLine,
  vectorLineOutlinePathData,
  type StudioEditableVectorLine,
  type StudioVectorLineHistory,
  type StudioVectorLineRange,
} from "./studio-vector-line-edit";

/* ------------------------------------------------------------------ */
/* 카피 (ko/en authored)                                                */
/* ------------------------------------------------------------------ */

const COPY = {
  panelLabel: defineBilingualText(
    "StudioVectorLinePanel",
    "panelLabel",
    "벡터 선 다듬기",
    "Vector line touch-up",
  ),
  eyebrow: defineBilingualText(
    "StudioVectorLinePanel",
    "eyebrow",
    "벡터 선 다듬기",
    "Vector line touch-up",
  ),
  headline: defineBilingualText(
    "StudioVectorLinePanel",
    "headline",
    "그은 뒤에도 선 굵기를 손으로 어루만지듯 조절하세요",
    "Reshape line weight by hand, even after you draw",
  ),
  sub: defineBilingualText(
    "StudioVectorLinePanel",
    "sub",
    "구간을 고르고 굵게·가늘게·테이퍼를 눌러보세요. 모든 편집은 되돌릴 수 있습니다.",
    "Pick a range, then widen, narrow, or taper. Every edit is undoable.",
  ),
  demoAria: defineBilingualText(
    "StudioVectorLinePanel",
    "demoAria",
    "선폭 편집 데모",
    "Line-width editing demo",
  ),
  rangeLabel: defineBilingualText(
    "StudioVectorLinePanel",
    "rangeLabel",
    "편집 구간",
    "Edit range",
  ),
  rangeAll: defineBilingualText("StudioVectorLinePanel", "rangeAll", "전체", "All"),
  rangeStart: defineBilingualText("StudioVectorLinePanel", "rangeStart", "앞", "Start"),
  rangeMiddle: defineBilingualText(
    "StudioVectorLinePanel",
    "rangeMiddle",
    "중간",
    "Middle",
  ),
  rangeEnd: defineBilingualText("StudioVectorLinePanel", "rangeEnd", "뒤", "End"),
  widen: defineBilingualText("StudioVectorLinePanel", "widen", "굵게", "Widen"),
  narrow: defineBilingualText("StudioVectorLinePanel", "narrow", "가늘게", "Narrow"),
  taper: defineBilingualText("StudioVectorLinePanel", "taper", "테이퍼", "Taper"),
  undo: defineBilingualText("StudioVectorLinePanel", "undo", "실행 취소", "Undo"),
  redo: defineBilingualText("StudioVectorLinePanel", "redo", "다시 실행", "Redo"),
  statusIdle: defineBilingualText(
    "StudioVectorLinePanel",
    "statusIdle",
    "구간을 선택하고 버튼을 눌러보세요",
    "Select a range and press a button",
  ),
  cmdWiden: defineBilingualText(
    "StudioVectorLinePanel",
    "cmdWiden",
    "구간 선폭 늘이기",
    "Widened range",
  ),
  cmdNarrow: defineBilingualText(
    "StudioVectorLinePanel",
    "cmdNarrow",
    "구간 선폭 줄이기",
    "Narrowed range",
  ),
  cmdTaper: defineBilingualText(
    "StudioVectorLinePanel",
    "cmdTaper",
    "구간 테이퍼 적용",
    "Tapered range",
  ),
  step1: defineBilingualText("StudioVectorLinePanel", "step1", "선을 그립니다", "Draw a line"),
  step2: defineBilingualText(
    "StudioVectorLinePanel",
    "step2",
    "조절할 구간을 선택합니다",
    "Select the range to adjust",
  ),
  step3: defineBilingualText(
    "StudioVectorLinePanel",
    "step3",
    "굵기를 어루만지듯 바꿉니다",
    "Reshape the weight by touch",
  ),
} as const;

/* ------------------------------------------------------------------ */
/* 데모 스트로크                                                        */
/* ------------------------------------------------------------------ */

/** S자 데모 점열 (벡터라이저 입력 형식). */
function demoInputPoints(): Array<{ x: number; y: number; pressure?: number }> {
  const points: Array<{ x: number; y: number; pressure?: number }> = [];
  const n = 24;
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    points.push({
      x: 16 + t * 288,
      y: 70 + Math.sin(t * Math.PI * 2) * 34 * Math.sin(t * Math.PI),
      pressure: 0.3 + 0.6 * Math.sin(t * Math.PI),
    });
  }
  return points;
}

function buildDemoLine(): StudioEditableVectorLine {
  const line = editableLineFromVectorizerPoints(demoInputPoints(), {
    id: "demo-vector-line",
    size: 18,
    thinning: 0.6,
    color: "#8b5cf6",
  });
  if (!line) throw new Error("데모 선 생성 실패");
  return line;
}

/** 중심선 path data (M/L). */
function centerlinePathData(line: StudioEditableVectorLine): string {
  return line.points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join("");
}

/** reduced-motion 감지. matchMedia 미지원 환경(jsdom 등)에서는 false. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (event: MediaQueryListEvent): void => setReduced(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

type RangePresetId = "all" | "start" | "middle" | "end";

function presetRange(pointCount: number, preset: RangePresetId): StudioVectorLineRange {
  switch (preset) {
    case "start":
      return normalizeWidthRange(pointCount, 0, Math.floor(pointCount / 3));
    case "middle":
      return normalizeWidthRange(
        pointCount,
        Math.floor(pointCount / 3),
        Math.floor((pointCount * 2) / 3),
      );
    case "end":
      return normalizeWidthRange(pointCount, Math.floor((pointCount * 2) / 3), pointCount - 1);
    case "all":
    default:
      return normalizeWidthRange(pointCount, 0, pointCount - 1);
  }
}

/* ------------------------------------------------------------------ */
/* 패널                                                                 */
/* ------------------------------------------------------------------ */

export function StudioVectorLinePanel(): ReactElement {
  useBilingualI18nRevision();
  const t = useT();
  const reducedMotion = usePrefersReducedMotion();

  const [line, setLine] = useState<StudioEditableVectorLine>(buildDemoLine);
  const [history, setHistory] = useState<StudioVectorLineHistory>(emptyVectorLineHistory);
  const [rangePreset, setRangePreset] = useState<RangePresetId>("middle");
  const [lastCommand, setLastCommand] = useState<string | null>(null);

  const range = useMemo(
    () => presetRange(line.points.length, rangePreset),
    [line.points.length, rangePreset],
  );

  const outlineD = useMemo(() => vectorLineOutlinePathData(line), [line]);
  const fullCenterlineD = useMemo(() => centerlinePathData(line), [line]);
  const rangeCenterlineD = useMemo(() => {
    const sliced = line.points.slice(range.startIndex, range.endIndex + 1);
    return sliced
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join("");
  }, [line, range]);

  const applyEdit = (
    labelKey: string,
    edit: (target: StudioEditableVectorLine) => StudioEditableVectorLine,
  ): void => {
    const after = edit(line);
    if (after === line) return;
    const command = createVectorLineCommand(t(labelKey), line, after);
    setHistory((h) => pushVectorLineCommand(h, command));
    setLine(after);
    setLastCommand(t(labelKey));
  };

  const handleUndo = (): void => {
    const result = undoVectorLine(history);
    if (!result) return;
    setHistory(result.history);
    setLine(result.stroke);
    setLastCommand(t(COPY.undo));
  };

  const handleRedo = (): void => {
    const result = redoVectorLine(history);
    if (!result) return;
    setHistory(result.history);
    setLine(result.stroke);
    setLastCommand(t(COPY.redo));
  };

  const rangeOptions: ReadonlyArray<{ id: RangePresetId; labelKey: string }> = [
    { id: "all", labelKey: COPY.rangeAll },
    { id: "start", labelKey: COPY.rangeStart },
    { id: "middle", labelKey: COPY.rangeMiddle },
    { id: "end", labelKey: COPY.rangeEnd },
  ];

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
        @keyframes svl-dash-flow {
          to { stroke-dashoffset: -28; }
        }
        @keyframes svl-dot-pulse {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 0.35; }
        }
        .svl-range-flow { animation: svl-dash-flow 1.1s linear infinite; }
        .svl-touch-dot { animation: svl-dot-pulse 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .svl-range-flow, .svl-touch-dot { animation: none !important; }
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

      {/* 라이브 데모 */}
      <div
        className="mt-4 overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--color-line)", background: "var(--color-canvas)" }}
      >
        <svg
          viewBox="0 0 320 140"
          className="block h-40 w-full"
          role="img"
          aria-label={t(COPY.demoAria)}
        >
          <defs>
            <linearGradient id="svl-line-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="55%" stopColor="#d946ef" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          <path d={outlineD} fill="url(#svl-line-grad)" opacity={0.9} />
          {/* 선택 구간 하이라이트 */}
          <path
            d={rangeCenterlineD}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={3}
            strokeDasharray="7 7"
            strokeLinecap="round"
            className={reducedMotion ? undefined : "svl-range-flow"}
            opacity={0.85}
          />
          {/* 선을 따라 움직이는 터치 도트 (어루만지는 손가락) */}
          {!reducedMotion && (
            <circle r={7} fill="var(--color-accent)" className="svl-touch-dot" opacity={0.85}>
              <animateMotion dur="5s" repeatCount="indefinite" path={fullCenterlineD} />
            </circle>
          )}
        </svg>
      </div>

      {/* 구간 선택 */}
      <div
        className="mt-4 flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t(COPY.rangeLabel)}
      >
        <span className="text-xs font-semibold" style={{ color: "var(--color-fg-3)" }}>
          {t(COPY.rangeLabel)}
        </span>
        {rangeOptions.map((option) => {
          const active = option.id === rangePreset;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setRangePreset(option.id)}
              aria-pressed={active}
              className="rounded-full px-3.5 py-1.5 text-xs font-bold transition-all focus-visible:outline-2 focus-visible:outline-offset-2"
              style={
                active
                  ? {
                      background: "var(--color-accent)",
                      color: "var(--color-on-accent)",
                    }
                  : {
                      background: "var(--color-raised)",
                      color: "var(--color-fg-2)",
                      border: "1px solid var(--color-line)",
                    }
              }
            >
              {t(option.labelKey)}
            </button>
          );
        })}
      </div>

      {/* 편집 액션 */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => applyEdit(COPY.cmdWiden, (target) => scaleWidthInRange(target, range, 1.4))}
          className="rounded-2xl px-3 py-2.5 text-sm font-bold transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            background: "var(--color-accent-soft)",
            color: "var(--color-accent)",
            border: "1px solid var(--color-line)",
          }}
        >
          {t(COPY.widen)}
        </button>
        <button
          type="button"
          onClick={() => applyEdit(COPY.cmdNarrow, (target) => scaleWidthInRange(target, range, 0.65))}
          className="rounded-2xl px-3 py-2.5 text-sm font-bold transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            background: "var(--color-raised)",
            color: "var(--color-fg)",
            border: "1px solid var(--color-line)",
          }}
        >
          {t(COPY.narrow)}
        </button>
        <button
          type="button"
          onClick={() =>
            applyEdit(COPY.cmdTaper, (target) =>
              taperWidthInRange(target, range, { direction: "toEnd", endFactor: 0.15 }),
            )
          }
          className="rounded-2xl px-3 py-2.5 text-sm font-bold transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            background: "var(--color-raised)",
            color: "var(--color-fg)",
            border: "1px solid var(--color-line)",
          }}
        >
          {t(COPY.taper)}
        </button>
      </div>

      {/* 되돌리기 */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={history.past.length === 0}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: "var(--color-raised)",
              color: "var(--color-fg-2)",
              border: "1px solid var(--color-line)",
            }}
          >
            {t(COPY.undo)}
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={history.future.length === 0}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: "var(--color-raised)",
              color: "var(--color-fg-2)",
              border: "1px solid var(--color-line)",
            }}
          >
            {t(COPY.redo)}
          </button>
        </div>
        <p aria-live="polite" className="text-xs" style={{ color: "var(--color-fg-3)" }}>
          {lastCommand ?? t(COPY.statusIdle)}
        </p>
      </div>

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
    </section>
  );
}

export default StudioVectorLinePanel;
