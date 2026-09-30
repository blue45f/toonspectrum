import { useEffect, useRef, useState, type CSSProperties } from "react";

import { cn } from "@/shared/lib/utils";

import { useSpectacle } from "./useSpectacle";

export interface SpectacleBarDatum {
  readonly label: string;
  readonly value: number;
  /** 막대 색상 (기본 인디고 그라데이션). */
  readonly color?: string;
}

export interface SpectacleBarChartProps {
  data: readonly SpectacleBarDatum[];
  className?: string;
  /** 차트 높이 px (기본 180). */
  height?: number;
  /** 값 포맷 (기본 천 단위 콤마). */
  format?: (value: number) => string;
  /** 최대값 (기본 데이터 최대값). */
  maxValue?: number;
}

const defaultFormat = (value: number) => value.toLocaleString("ko-KR");

/**
 * 막대 차트 등장 애니메이션.
 *
 * - 화면에 들어오면(IO) 막대가 아래에서 위로 scaleY로 자라난다 (GPU transform)
 * - 막대별 70ms stagger
 * - motion 꺼져 있으면 최종 상태 즉시 표시
 * - 값 라벨은 카운트업 없이 최종값 표시 (단순·명확)
 */
export function SpectacleBarChart({
  data,
  className,
  height = 180,
  format = defaultFormat,
  maxValue,
}: SpectacleBarChartProps) {
  const { motion } = useSpectacle();
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

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
      { threshold: 0.3 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [motion]);

  const max = maxValue ?? Math.max(1, ...data.map((d) => d.value));

  return (
    <div
      ref={ref}
      role="img"
      aria-label={data.map((d) => `${d.label}: ${format(d.value)}`).join(", ")}
      className={cn("spectacle-bar-chart", visible && "spectacle-bar-chart-visible", className)}
      style={{ height } as CSSProperties}
    >
      {data.map((datum, index) => {
        const ratio = Math.max(0, Math.min(1, datum.value / max));
        return (
          <div key={datum.label} className="spectacle-bar-group">
            <div className="spectacle-bar-track">
              <div
                className="spectacle-bar-fill"
                style={
                  {
                    "--spectacle-bar-ratio": ratio.toFixed(3),
                    "--spectacle-bar-delay": `${index * 70}ms`,
                    background: datum.color ?? undefined,
                  } as CSSProperties
                }
              />
            </div>
            <span className="spectacle-bar-value" aria-hidden="true">
              {format(datum.value)}
            </span>
            <span className="spectacle-bar-label">{datum.label}</span>
          </div>
        );
      })}
    </div>
  );
}
