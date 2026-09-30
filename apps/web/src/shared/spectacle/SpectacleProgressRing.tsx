import { useEffect, useRef, useState } from "react";

import { cn } from "@/shared/lib/utils";

import { useSpectacle } from "./useSpectacle";

import "./spectacle-effects.css";

export interface SpectacleProgressRingProps {
  /** 0~1 진행률. */
  value: number;
  className?: string;
  size?: number;
  strokeWidth?: number;
  /** 중앙 라벨 (없으면 퍼센트). */
  label?: string;
}

/**
 * 프로그레스 링 (SVG).
 *
 * - 화면 진입 시 stroke-dashoffset 트랜지션으로 차오름
 * - motion 꺼져 있으면 최종 상태 즉시 표시
 * - role="progressbar" 접근성 지원
 */
export function SpectacleProgressRing({
  value,
  className,
  size = 96,
  strokeWidth = 10,
  label,
}: SpectacleProgressRingProps) {
  const { motion } = useSpectacle();
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(!motion);
  const clamped = Math.min(Math.max(value, 0), 1);

  useEffect(() => {
    if (!motion) {
      setVisible(true);
      return;
    }
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [motion]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = visible ? clamped : 0;

  return (
    <div
      ref={ref}
      className={cn("relative inline-flex items-center justify-center", className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `${Math.round(clamped * 100)}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="spectacle-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
        />
        <circle
          className="spectacle-ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown)}
        />
      </svg>
      <span className="absolute text-sm font-semibold tabular-nums" aria-hidden="true">
        {label ?? `${Math.round(clamped * 100)}%`}
      </span>
    </div>
  );
}
