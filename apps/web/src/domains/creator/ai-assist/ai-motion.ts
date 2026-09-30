import { useEffect, useRef, useState } from "react";

/** reduced-motion 선호 여부 — matchMedia 미지원 환경(jsdom 등)에서도 안전 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * 스크롤 리빌 훅 — 요소가 뷰포트에 들어오면 visible을 true로.
 * Remotion 스타일 등장 연출의 트리거로 사용.
 * reduced-motion 환경에서는 즉시 visible.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.15,
): { readonly ref: React.RefObject<T | null>; readonly visible: boolean } {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    if (prefersReducedMotion()) {
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
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}

/**
 * 카운트업 훅 — 숫자가 0에서 target까지 애니메이션.
 * 통계·영역 개수 등 "보는 재미"용.
 */
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      setValue(target);
      return;
    }
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    if (typeof requestAnimationFrame === "undefined") {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      // rAF 타임스탬프와 performance.now()의 클록이 다를 수 있어 [0,1]로 클램프
      const progress = Math.min(1, Math.max(0, (now - start) / durationMs));
      // easeOutCubic
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(target * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

/**
 * 스태거 딜레이 계산 — 카드 그리드 순차 등장용.
 */
export function staggerDelay(index: number, stepMs = 90): { readonly transitionDelay: string } {
  if (prefersReducedMotion()) {
    return { transitionDelay: "0ms" };
  }
  return { transitionDelay: `${index * stepMs}ms` };
}
