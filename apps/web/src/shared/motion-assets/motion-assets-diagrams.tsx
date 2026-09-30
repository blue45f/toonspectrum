import type { CSSProperties, JSX, ReactNode } from "react";

import "./motion-assets-effects.css";
import {
  delayStyle,
  motionAssetClass,
  useMotionAssetLang,
  useMotionInView,
} from "./motion-assets-engine";
import { getMotionAssetLabels } from "./motion-assets-labels";

/**
 * 도식/다이어그램 컴포넌트: 단계 플로우, 비교 도식, 타임라인, 게이지.
 * 스크롤 등장 애니메이션 내장 (useMotionInView 기반, reduced-motion 대응).
 * before/after 슬롯에는 기존 생성 에셋(절차적 SVG 배경, FX 오버레이 등)의
 * 렌더 결과물을 그대로 넣어 재활용할 수 있다.
 */

/* ---------------- 단계 플로우 ---------------- */

export interface MotionStep {
  title: string;
  description?: string;
  /** 단계 아이콘 슬롯 (일러스트/이모지 등). */
  icon?: ReactNode;
}

export interface MotionStepFlowProps {
  steps: MotionStep[];
  /** 현재 활성 단계 (0-based). 미지정 시 전부 표시. */
  activeStep?: number;
  className?: string;
}

/**
 * 1→2→3 단계 플로우 다이어그램. 스크롤 진입 시 스태거로 등장.
 *
 * @example
 * <MotionStepFlow steps={[{title:"스케치"},{title:"선화"},{title:"채색"}]} activeStep={1} />
 */
export function MotionStepFlow({ steps, activeStep, className }: MotionStepFlowProps): JSX.Element {
  const { ref, inView } = useMotionInView<HTMLDivElement>();
  const labels = getMotionAssetLabels(useMotionAssetLang());
  return (
    <div ref={ref} className={motionAssetClass(className)} data-motion-diagram="step-flow">
      <ol
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 0,
          listStyle: "none",
          margin: 0,
          padding: 0,
          flexWrap: "wrap",
        }}
      >
        {steps.map((step, index) => {
          const isActive = activeStep === index;
          const isDone = activeStep !== undefined && index < activeStep;
          return (
            <li
              key={index}
              className={`ma-sequence-item${inView ? " is-visible" : ""}`}
              style={delayStyle(index * 140, { flex: "1 1 140px", minWidth: 120 })}
              aria-current={isActive ? "step" : undefined}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: "50%",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: 17,
                    flexShrink: 0,
                    background: isActive
                      ? "currentColor"
                      : isDone
                        ? "color-mix(in srgb, currentColor 22%, transparent)"
                        : "color-mix(in srgb, currentColor 10%, transparent)",
                    color: isActive ? "var(--ma-step-contrast, #fff)" : "inherit",
                    border: "2px solid color-mix(in srgb, currentColor 30%, transparent)",
                    transition: "transform 0.3s",
                    transform: isActive ? "scale(1.12)" : undefined,
                  }}
                >
                  {step.icon ?? index + 1}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 14 }}>{step.title}</span>
                  {step.description ? (
                    <span style={{ display: "block", fontSize: 12.5, opacity: 0.65, marginTop: 2 }}>
                      {step.description}
                    </span>
                  ) : null}
                  <span style={{ display: "block", fontSize: 11, opacity: 0.45, marginTop: 2 }}>
                    {labels.stepOf(index + 1, steps.length)}
                  </span>
                </span>
                {index < steps.length - 1 ? (
                  <svg width="34" height="20" viewBox="0 0 34 20" aria-hidden="true" style={{ flexShrink: 0 }}>
                    <line x1="2" y1="10" x2="28" y2="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.45" className="ma-step-connector" />
                    <polygon points="28,4 34,10 28,16" fill="currentColor" opacity="0.45" />
                  </svg>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------------- 비교 도식 ---------------- */

export interface MotionCompareDiagramProps {
  /** 왼쪽 패널 (Before). */
  before: ReactNode;
  /** 오른쪽 패널 (After). */
  after: ReactNode;
  beforeLabel: string;
  afterLabel: string;
  /** 가운데 VS 배지 텍스트. 기본 "VS". */
  versusLabel?: string;
  className?: string;
}

/**
 * Before/After 비교 도식. 양쪽이 스크롤 진입 시 좌우에서 슬라이드 등장.
 * 520px 이하에서는 세로로 쌓인다 (390px 대응).
 *
 * @example
 * // 기존 생성 에셋 재활용: 절차적 SVG 배경 before/after 비교
 * <MotionCompareDiagram
 *   before={<GeneratedBackground scene="bg-rain-platform" />}
 *   after={<GeneratedBackground scene="bg-sunset-canyon" />}
 *   beforeLabel="비 오는 승강장"
 *   afterLabel="석양 협곡"
 * />
 */
export function MotionCompareDiagram({
  before,
  after,
  beforeLabel,
  afterLabel,
  versusLabel = "VS",
  className,
}: MotionCompareDiagramProps): JSX.Element {
  const { ref, inView } = useMotionInView<HTMLDivElement>();
  return (
    <div ref={ref} className={motionAssetClass(className)} data-motion-diagram="compare">
      <div className="ma-compare-grid">
        <figure
          className={`ma-compare-figure ma-reveal${inView ? " is-visible" : ""}`}
          data-variant="slide-left"
        >
          <div className="ma-compare-panel">{before}</div>
          <figcaption className="ma-compare-caption">{beforeLabel}</figcaption>
        </figure>
        <span
          className={`ma-compare-vs ma-reveal${inView ? " is-visible" : ""}`}
          data-variant="scale"
          style={delayStyle(160)}
          aria-hidden="true"
        >
          {versusLabel}
        </span>
        <figure
          className={`ma-compare-figure ma-reveal${inView ? " is-visible" : ""}`}
          data-variant="slide-right"
          style={delayStyle(80)}
        >
          <div className="ma-compare-panel">{after}</div>
          <figcaption className="ma-compare-caption">{afterLabel}</figcaption>
        </figure>
      </div>
    </div>
  );
}

/* ---------------- 타임라인 ---------------- */

export interface MotionTimelineItem {
  title: string;
  description?: string;
  /** 시점 라벨 (예: "2026-09-30", "1일차"). */
  meta?: string;
  icon?: ReactNode;
}

export interface MotionTimelineProps {
  items: MotionTimelineItem[];
  className?: string;
}

/**
 * 세로 타임라인. 스크롤 진입 시 항목이 순차 등장, 도트가 팝.
 */
export function MotionTimeline({ items, className }: MotionTimelineProps): JSX.Element {
  const { ref, inView } = useMotionInView<HTMLDivElement>();
  return (
    <div ref={ref} className={motionAssetClass(className)} data-motion-diagram="timeline">
      <ol style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}>
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 15,
            top: 8,
            bottom: 8,
            width: 2,
            background: "color-mix(in srgb, currentColor 18%, transparent)",
            borderRadius: 2,
          }}
        />
        {items.map((item, index) => (
          <li
            key={index}
            className={`ma-timeline-item ma-sequence-item${inView ? " is-visible" : ""}`}
            style={delayStyle(index * 120, {
              position: "relative",
              paddingLeft: 46,
              paddingBottom: index < items.length - 1 ? 22 : 0,
            } as CSSProperties)}
          >
            <span
              className="ma-timeline-dot"
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 7,
                top: 2,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "currentColor",
                border: "4px solid color-mix(in srgb, currentColor 14%, transparent)",
                backgroundClip: "padding-box",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--ma-step-contrast, #fff)",
                fontSize: 0,
              }}
            >
              {item.icon}
            </span>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {item.title}
              {item.meta ? (
                <span style={{ fontWeight: 500, fontSize: 12, opacity: 0.55, marginLeft: 8 }}>{item.meta}</span>
              ) : null}
            </div>
            {item.description ? (
              <div style={{ fontSize: 13, opacity: 0.68, marginTop: 3, lineHeight: 1.55 }}>{item.description}</div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------------- 게이지 ---------------- */

export interface MotionGaugeProps {
  /** 현재 값. */
  value: number;
  /** 최대값. 기본 100. */
  max?: number;
  /** 지름 px. 기본 120. */
  size?: number;
  /** 중앙 라벨. 미지정 시 퍼센트. */
  label?: string;
  className?: string;
}

/**
 * 원형 게이지/프로그레스 링. 스크롤 진입 시 값이 차오른다.
 *
 * @example
 * <MotionGauge value={72} label="채색 진행률" />
 */
export function MotionGauge({ value, max = 100, size = 120, label, className }: MotionGaugeProps): JSX.Element {
  const { ref, inView } = useMotionInView<HTMLDivElement>();
  const labels = getMotionAssetLabels(useMotionAssetLang());
  const clamped = Math.min(max, Math.max(0, value));
  const ratio = max > 0 ? clamped / max : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const shown = inView ? ratio : 0;
  const displayLabel = label ?? `${Math.round(ratio * 100)}%`;
  return (
    <div
      ref={ref}
      className={motionAssetClass(className)}
      data-motion-diagram="gauge"
      role="img"
      aria-label={labels.gaugeOf(Math.round(clamped), max)}
    >
      <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" strokeWidth="11" opacity="0.14" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown)}
          transform="rotate(-90 60 60)"
          className="ma-gauge-track"
          opacity="0.9"
        />
        <text x="60" y="58" textAnchor="middle" fontSize="21" fontWeight="800" fill="currentColor">
          {displayLabel}
        </text>
        <text x="60" y="78" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.55">
          {labels.gaugeOf(Math.round(clamped), max)}
        </text>
      </svg>
    </div>
  );
}
