/**
 * 내추럴 미디어 브러시 쇼케이스.
 *
 * 새로 통합한 무료 드로잉 라이브러리(p5.brush 어댑터)의 10종 브러시를
 * 시각적으로 탐색·선택하는 패널이다.
 *
 * 설계 원칙 (화려하면서도 직관적):
 * - 10초 규칙: 헤드라인 한 줄("마음에 드는 브러시를 하나 골라보세요")로 목적 전달
 * - 핵심 CTA 1개: 카드 클릭 = 브러시 선택. 나머지는 전부 격하
 * - 복잡한 설정(굵기·색상)은 "고급 설정"으로 접기
 * - 각 카드에 실제 벡터화 엔진으로 생성한 SVG 스트로크 프리뷰 삽입 (텍스트 설명 대신)
 * - 입장 시 스태거드 애니메이션, 호버 리프트, 선택 링 펄스
 * - reduced-motion 환경에서는 모든 모션 비활성화
 */
import { useId, useMemo, useState } from "react";
import type { ReactElement } from "react";
import {
  getCurrentUiLocale,
  translateAuthoredSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { CountUp } from "@/shared/components/count-up";
import {
  STUDIO_NATURAL_MEDIA_PRESETS,
  type StudioNaturalMediaBrushId,
  type StudioNaturalMediaPreset,
} from "./studio-natural-media-brushes";
import {
  vectorizeFreehandStroke,
  type StudioStrokePoint,
} from "./studio-stroke-vectorizer";

/* ------------------------------------------------------------------ */
/* 브러시별 프리뷰 스트로크 생성                                          */
/* ------------------------------------------------------------------ */

/** S자 샘플 포인트 (벡터화 테스트와 동일한 궤적). 프리뷰용으로 28단계로 축소. */
function sampleStrokePoints(): StudioStrokePoint[] {
  const points: StudioStrokePoint[] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = 8 + t * 104;
    const y = 30 + Math.sin(t * Math.PI * 2) * 18 * Math.sin(t * Math.PI);
    const pressure = 0.35 + 0.65 * Math.sin(t * Math.PI);
    points.push({ x, y, pressure });
  }
  return points;
}

/** 목탄처럼 거친 질감을 위해 포인트에 지터를 준다. */
function jitterPoints(
  points: StudioStrokePoint[],
  amount: number,
  seed: number,
): StudioStrokePoint[] {
  let s = seed;
  const rand = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647 - 0.5;
  };
  return points.map((p) => ({
    x: p.x + rand() * amount,
    y: p.y + rand() * amount,
    pressure: Math.max(
      0.05,
      Math.min(1, (p.pressure ?? 0.5) + rand() * amount * 0.06),
    ),
  }));
}

interface BrushPreviewStyle {
  readonly size: number;
  readonly thinning: number;
  readonly smoothing: number;
  readonly jitter: number;
  /** 스프레이처럼 점묘 효과를 낼 때 true. */
  readonly dotted: boolean;
  /** 해칭처럼 여러 겹으로 그릴 때 겹 수. */
  readonly layers: number;
}

/** 공정 태그 → 한글 라벨. */
const CRAFT_LABEL_KO: Record<string, string> = {
  sketch: "스케치",
  lineart: "선화",
  coloring: "채색",
  tone: "톤",
  effect: "효과",
};

/** 브러시 ID → 프리뷰 렌더 스타일. */
const BRUSH_PREVIEW_STYLES: Record<StudioNaturalMediaBrushId, BrushPreviewStyle> = {
  "pencil-2b": { size: 9, thinning: 0.55, smoothing: 0.6, jitter: 1.2, dotted: false, layers: 1 },
  "pencil-hb": { size: 6, thinning: 0.55, smoothing: 0.7, jitter: 0.6, dotted: false, layers: 1 },
  "color-pencil": { size: 6, thinning: 0.45, smoothing: 0.6, jitter: 1.6, dotted: false, layers: 2 },
  pen: { size: 7, thinning: 0.7, smoothing: 0.75, jitter: 0, dotted: false, layers: 1 },
  rotring: { size: 4.5, thinning: 0.12, smoothing: 0.85, jitter: 0, dotted: false, layers: 1 },
  charcoal: { size: 22, thinning: 0.35, smoothing: 0.35, jitter: 3.2, dotted: false, layers: 2 },
  marker: { size: 15, thinning: 0.12, smoothing: 0.8, jitter: 0, dotted: false, layers: 1 },
  marker2: { size: 17, thinning: 0.62, smoothing: 0.7, jitter: 0.4, dotted: false, layers: 1 },
  spray: { size: 13, thinning: 0.2, smoothing: 0.5, jitter: 2.4, dotted: true, layers: 1 },
  hatch: { size: 3, thinning: 0.3, smoothing: 0.7, jitter: 0.8, dotted: false, layers: 3 },
};

/** 브러시 프리뷰용 SVG pathData 목록을 만든다. */
function buildBrushPreviewPaths(presetId: StudioNaturalMediaBrushId): string[] {
  const style = BRUSH_PREVIEW_STYLES[presetId];
  const base = style.jitter > 0
    ? jitterPoints(sampleStrokePoints(), style.jitter, presetId.length * 7919)
    : sampleStrokePoints();
  const paths: string[] = [];
  for (let layer = 0; layer < style.layers; layer += 1) {
    const offset = (layer - (style.layers - 1) / 2) * 9;
    const points = base.map((p) => ({ ...p, y: p.y + offset }));
    const result = vectorizeFreehandStroke(points, {
      size: style.size,
      thinning: style.thinning,
      smoothing: style.smoothing,
    });
    if (result.pathData) paths.push(result.pathData);
  }
  return paths;
}

/**
 * 프리뷰 pathData 모듈 레벨 캐시.
 * 벡터화는 비용이 크므로(폴리곤 불리언 연산) 브러시당 한 번만 계산하고 재사용한다.
 */
const brushPreviewCache = new Map<StudioNaturalMediaBrushId, string[]>();

function getBrushPreviewPaths(presetId: StudioNaturalMediaBrushId): string[] {
  const cached = brushPreviewCache.get(presetId);
  if (cached) return cached;
  const paths = buildBrushPreviewPaths(presetId);
  brushPreviewCache.set(presetId, paths);
  return paths;
}

/* ------------------------------------------------------------------ */
/* 브러시 카드                                                           */
/* ------------------------------------------------------------------ */

function BrushPreviewArt({
  preset,
  selected,
}: {
  preset: StudioNaturalMediaPreset;
  selected: boolean;
}): ReactElement {
  const paths = useMemo(
    () => getBrushPreviewPaths(preset.id),
    [preset.id],
  );
  const style = BRUSH_PREVIEW_STYLES[preset.id];
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 120 60"
      className="h-16 w-full"
      role="img"
      aria-label={`${preset.labelKo} 스트로크 미리보기`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={selected ? "#a78bfa" : "#c4b5fd"} />
          <stop offset="55%" stopColor={selected ? "#f0abfc" : "#ddd6fe"} />
          <stop offset="100%" stopColor={selected ? "#67e8f9" : "#bae6fd"} />
        </linearGradient>
      </defs>
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill={`url(#${gradientId})`}
          opacity={style.dotted ? 0.55 : 0.92}
          strokeDasharray={style.dotted ? "1.6 3.2" : undefined}
        />
      ))}
    </svg>
  );
}

function BrushCard({
  preset,
  selected,
  index,
  onSelect,
  tx,
}: {
  preset: StudioNaturalMediaPreset;
  selected: boolean;
  index: number;
  onSelect: (id: StudioNaturalMediaBrushId) => void;
  tx: (source: string) => string;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={() => onSelect(preset.id)}
      aria-pressed={selected}
      aria-label={tx("브러시 선택: ") + preset.labelKo}
      style={{ animationDelay: `${Math.min(index, 9) * 70}ms` }}
      className={[
        "studio-brush-card group relative overflow-hidden rounded-2xl border p-4 text-left",
        "transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500",
        selected
          ? "border-violet-400 bg-gradient-to-br from-violet-500/25 via-fuchsia-500/15 to-cyan-400/20 shadow-lg shadow-violet-500/20"
          : "border-white/10 bg-white/[0.04] hover:border-violet-300/50 hover:bg-white/[0.07]",
      ].join(" ")}
    >
      {selected && (
        <span className="studio-brush-selected-badge absolute right-3 top-3 rounded-full bg-violet-500 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-md shadow-violet-500/40">
          {tx("선택됨")}
        </span>
      )}
      <BrushPreviewArt preset={preset} selected={selected} />
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[15px] font-bold text-white">{preset.labelKo}</span>
        <span className="text-[11px] uppercase tracking-wide text-white/40">
          {preset.labelEn}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 min-h-[2.5em] text-xs leading-relaxed text-white/60">
        {preset.descriptionKo}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {preset.crafts.slice(0, 3).map((craft) => (
          <span
            key={craft}
            className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] text-white/55"
          >
            {CRAFT_LABEL_KO[craft]}
          </span>
        ))}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 쇼케이스 본체                                                         */
/* ------------------------------------------------------------------ */

export interface StudioNaturalMediaShowcaseProps {
  readonly selectedBrushId?: StudioNaturalMediaBrushId;
  readonly onSelectBrush?: (preset: StudioNaturalMediaPreset) => void;
  readonly onStartDrawing?: (preset: StudioNaturalMediaPreset) => void;
}

export function StudioNaturalMediaShowcase({
  selectedBrushId,
  onSelectBrush,
  onStartDrawing,
}: StudioNaturalMediaShowcaseProps): ReactElement {
  useBilingualI18nRevision();
  const locale = getCurrentUiLocale();
  const tx = (source: string) =>
    translateAuthoredSourceText(locale, "ko", "StudioNaturalMediaShowcase", source);

  const [internalSelected, setInternalSelected] =
    useState<StudioNaturalMediaBrushId>("pencil-2b");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [strokeWeight, setStrokeWeight] = useState(1);

  const selectedId = selectedBrushId ?? internalSelected;
  const selectedPreset =
    STUDIO_NATURAL_MEDIA_PRESETS.find((p) => p.id === selectedId)
    ?? STUDIO_NATURAL_MEDIA_PRESETS[0];

  const handleSelect = (id: StudioNaturalMediaBrushId): void => {
    setInternalSelected(id);
    const preset = STUDIO_NATURAL_MEDIA_PRESETS.find((p) => p.id === id);
    if (preset) onSelectBrush?.(preset);
  };

  return (
    <section
      aria-label={tx("내추럴 미디어 브러시 쇼케이스")}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#171226] via-[#12101d] to-[#0d0b14] p-6 sm:p-8"
    >
      <style>{`
        @keyframes studio-brush-card-enter {
          from { opacity: 0; transform: translateY(22px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes studio-brush-badge-pop {
          0% { transform: scale(0.4); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes studio-brush-orb-drift {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(24px, -18px); }
        }
        .studio-brush-card { animation: studio-brush-card-enter 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .studio-brush-selected-badge { animation: studio-brush-badge-pop 0.35s ease-out both; }
        .studio-brush-orb { animation: studio-brush-orb-drift 9s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .studio-brush-card, .studio-brush-selected-badge, .studio-brush-orb { animation: none !important; }
        }
      `}</style>

      {/* 배경 오브 (장식) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="studio-brush-orb absolute -left-16 -top-16 h-64 w-64 rounded-full bg-violet-600/25 blur-3xl" />
        <div
          className="studio-brush-orb absolute -right-10 top-1/3 h-56 w-56 rounded-full bg-cyan-500/15 blur-3xl"
          style={{ animationDelay: "-4.5s" }}
        />
      </div>

      <div className="relative">
        {/* 헤더: 10초 안에 목적 파악 */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300/80">
              {tx("무료 내추럴 미디어")}
            </p>
            <h2 className="mt-1 bg-gradient-to-r from-white via-violet-100 to-cyan-100 bg-clip-text text-2xl font-black text-transparent sm:text-3xl">
              {tx("마음에 드는 브러시를 하나 골라보세요")}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-white/55">
              {tx("카드를 누르면 바로 선택됩니다. 굵기·색상 같은 세부 설정은 아래 고급 설정에 있습니다.")}
            </p>
          </div>
          <div
            className="rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-center"
            aria-label={tx("브러시 종류 수")}
          >
            <div className="bg-gradient-to-r from-violet-300 to-cyan-300 bg-clip-text text-3xl font-black tabular-nums text-transparent">
              <CountUp value={STUDIO_NATURAL_MEDIA_PRESETS.length} duration={0.9} />
            </div>
            <div className="text-[11px] text-white/50">{tx("종의 브러시")}</div>
          </div>
        </header>

        {/* 브러시 카드 그리드 */}
        <div
          className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          role="group"
          aria-label={tx("브러시 목록")}
        >
          {STUDIO_NATURAL_MEDIA_PRESETS.map((preset, index) => (
            <BrushCard
              key={preset.id}
              preset={preset}
              index={index}
              selected={preset.id === selectedPreset.id}
              onSelect={handleSelect}
              tx={tx}
            />
          ))}
        </div>

        {/* 핵심 CTA 1개 */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onStartDrawing?.(selectedPreset)}
            className="rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-500 bg-[length:200%_100%] px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-fuchsia-500/30 transition-all duration-300 hover:bg-[position:100%_0] hover:shadow-xl hover:shadow-fuchsia-500/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 active:scale-[0.98]"
          >
            {tx("이 브러시로 그리기 시작")}
          </button>
          <p className="text-xs text-white/45">
            {tx("선택 중:")} <span className="font-semibold text-white/75">{selectedPreset.labelKo}</span>
          </p>
        </div>

        {/* 고급 설정 (접기) */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03]">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="flex w-full items-center justify-between px-5 py-3 text-sm text-white/70 transition-colors hover:text-white"
          >
            <span className="font-semibold">{tx("고급 설정")}</span>
            <span
              aria-hidden="true"
              className={`text-white/40 transition-transform duration-300 ${showAdvanced ? "rotate-180" : ""}`}
            >
              ▾
            </span>
          </button>
          {showAdvanced && (
            <div className="space-y-4 border-t border-white/10 px-5 py-4">
              <label className="block">
                <span className="mb-2 flex justify-between text-xs text-white/60">
                  <span>{tx("스트로크 굵기 배율")}</span>
                  <span className="tabular-nums text-white/80">{strokeWeight.toFixed(1)}×</span>
                </span>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={strokeWeight}
                  onChange={(e) => setStrokeWeight(Number(e.target.value))}
                  className="w-full accent-violet-400"
                  aria-label={tx("스트로크 굵기 배율")}
                />
              </label>
              <p className="text-xs text-white/40">
                {tx("색상·질감 프리셋 등 더 많은 옵션은 브러시 스튜디오에서 조정할 수 있습니다.")}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default StudioNaturalMediaShowcase;
