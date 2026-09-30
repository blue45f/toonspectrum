import { useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { AiColorHintStudio } from "./AiColorHintStudio";
import { AiStrokeStudio } from "./AiStrokeStudio";
import { AiPerspectiveStudio } from "./AiPerspectiveStudio";
import { AiBalloonStudio } from "./AiBalloonStudio";
import { AiFeatureArt } from "./AiFeatureArt";
import { staggerDelay, useCountUp, useScrollReveal } from "./ai-motion";

export type AiFeatureId = "color" | "stroke" | "perspective" | "balloon";

interface AiFeatureMeta {
  readonly id: AiFeatureId;
  readonly available: boolean;
}

const FEATURES: readonly AiFeatureMeta[] = [
  { id: "color", available: true },
  { id: "stroke", available: true },
  { id: "perspective", available: true },
  { id: "balloon", available: true },
];

const STUDIOS: Record<AiFeatureId, () => React.JSX.Element> = {
  color: AiColorHintStudio,
  stroke: AiStrokeStudio,
  perspective: AiPerspectiveStudio,
  balloon: AiBalloonStudio,
};

/**
 * 카운트업 통계 — 숫자 올라가는 "보는 재미".
 */
function AiDockStats() {
  const t = useBilingual("ai-assist");
  const palettes = useCountUp(8, 1100);
  const balloonKinds = useCountUp(5, 900);
  const symmetryAxes = useCountUp(3, 700);
  const stats = [
    { value: palettes, label: t("분위기 팔레트", "Mood palettes") },
    { value: balloonKinds, label: t("말풍선 타입", "Balloon types") },
    { value: symmetryAxes, label: t("대칭 축", "Symmetry axes") },
  ];
  return (
    <div className="ai-dock__stats" aria-label={t("AI 어시스턴트 통계", "AI assistant stats")}>
      {stats.map((s) => (
        <div key={s.label} className="ai-dock__stat">
          <div className="ai-dock__stat-num">{s.value}</div>
          <div className="ai-dock__stat-label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * AI 드로잉 어시스턴트 도크 — 진입점.
 *
 * 사용성 설계 (10초 규칙):
 * - 핵심 액션 1개만 강조: "AI 자동 채색" 카드를 가장 크고 먼저 배치
 * - 2차 액션 격하: 나머지 기능은 작은 카드로
 * - 각 카드는 SVG 일러스트 + 한 줄 설명, 버튼은 "시작하기" 하나
 * - 스크롤 리빌 + 카운트업으로 "보는 재미" 제공
 */
export function AiAssistDock() {
  const t = useBilingual("ai-assist");
  const [active, setActive] = useState<AiFeatureId | null>(null);
  const gridReveal = useScrollReveal<HTMLDivElement>(0.05);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("ai-assist-page");
    return () => document.body.classList.remove("ai-assist-page");
  }, []);

  const meta: Record<AiFeatureId, { title: string; desc: string }> = {
    color: {
      title: t("AI 자동 채색", "AI auto coloring"),
      desc: t("선화에 색 힌트를 찍으면 AI가 영역을 찾아 채색", "Tap color hints on line art — AI fills the regions"),
    },
    stroke: {
      title: t("선화 정리", "Line cleanup"),
      desc: t("손떨림 보정·스무딩·대칭 그리기", "Stabilization, smoothing, symmetry"),
    },
    perspective: {
      title: t("투시 그리드", "Perspective grid"),
      desc: t("1·2·3점 투시 보조선 — 소실점 드래그", "1/2/3-point guides — drag vanishing points"),
    },
    balloon: {
      title: t("말풍선 배치", "Balloon placement"),
      desc: t("위치·타입·폰트 자동 추천", "Auto placement, type & font picks"),
    },
  };

  if (active !== null) {
    const Studio = STUDIOS[active];
    return (
      <div className="ai-dock">
        <button type="button" className="ai-dock__back" onClick={() => setActive(null)}>
          ← {t("AI 기능 목록", "AI features")}
        </button>
        <Studio />
      </div>
    );
  }

  return (
    <div className="ai-dock" role="region" aria-label={t("AI 드로잉 어시스턴트", "AI drawing assistant")}>
      <header className="ai-dock__header">
        <h2 className="ai-dock__title">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="ai-dock__title-icon">
            <path
              d="M12 2l2.4 6.2L21 9l-5 4.4L17.5 20 12 16.6 6.5 20 8 13.4 3 9l6.6-.8z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          {t("AI 드로잉 어시스턴트", "AI drawing assistant")}
        </h2>
        <p className="ai-dock__subtitle">
          {t("원하는 기능을 골라 시작하세요 — 전부 무료로 동작합니다", "Pick a feature to start — all run free, on-device")}
        </p>
      </header>

      <AiDockStats />

      <div ref={gridReveal.ref} className="ai-dock__grid">
        {FEATURES.map((f, i) => {
          const m = meta[f.id];
          const primary = f.id === "color";
          return (
            <article
              key={f.id}
              className={`ai-dock__card ai-reveal${gridReveal.visible ? " is-visible" : ""}${
                primary ? " ai-dock__card--primary" : ""
              }${!f.available ? " ai-dock__card--soon" : ""}`}
              style={staggerDelay(i)}
            >
              <AiFeatureArt feature={f.id} />
              <h3 className="ai-dock__card-title">{m.title}</h3>
              <p className="ai-dock__card-desc">{m.desc}</p>
              {f.available ? (
                <button
                  type="button"
                  className={primary ? "ai-studio__cta ai-studio__cta--primary" : "ai-studio__ghost"}
                  onClick={() => setActive(f.id)}
                  aria-label={t(`${m.title} 시작하기`, `Start ${m.title}`)}
                >
                  {t("시작하기", "Start")}
                </button>
              ) : (
                <span className="ai-dock__soon-badge">{t("준비 중", "Soon")}</span>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
