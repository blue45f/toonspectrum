import { useEffect, useRef, useState } from "react";

import { cn } from "@/shared/lib/utils";

import { useSpectacle } from "./useSpectacle";

import "./spectacle-effects.css";

export interface SpectacleCountUpProps {
  /** 목표 값. */
  value: number;
  className?: string;
  /** 지속 시간 ms (기본 1400). */
  duration?: number;
  /** 표시 포맷 (기본 천 단위 콤마). */
  format?: (value: number) => string;
  /** 소수점 자릿수 (format 없을 때). */
  decimals?: number;
}

const defaultFormat = (decimals: number) => (value: number) =>
  value.toLocaleString("ko-KR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

/**
 * 카운트업 숫자 애니메이션.
 *
 * - 화면에 들어오면( IO ) 0 → value로 ease-out 카운트
 * - motion 꺼져 있으면 최종값 즉시 표시
 * - tabular-nums로 자릿수 흔들림 방지
 */
export function SpectacleCountUp({
  value,
  className,
  duration = 1400,
  format,
  decimals = 0,
}: SpectacleCountUpProps) {
  const { motion } = useSpectacle();
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!motion) {
      setDisplay(value);
      return;
    }
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setStarted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setStarted(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [motion, value]);

  useEffect(() => {
    if (!started || !motion) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - t0) / duration, 1);
      // ease-out-expo
      const eased = progress >= 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(value * eased);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, motion, value, duration]);

  const formatter = format ?? defaultFormat(decimals);

  return (
    <span
      ref={ref}
      className={cn("spectacle-count-up", className)}
      aria-label={formatter(value)}
    >
      <span aria-hidden="true">{formatter(display)}</span>
    </span>
  );
}
