import { useEffect, useRef, useState, type CSSProperties } from "react";

import { normalizeMotionAssetLang, type MotionAssetLang } from "./motion-assets-labels";

/**
 * motion-assets 엔진: reduced-motion 감지, 뷰포트 진입 감지, 공용 타입.
 * SVG/CSS/Canvas 기반 에셋 전용 — 외부 이미지·유료 에셋 없음.
 */

/** 사용자 OS의 reduced-motion 설정을 읽는다. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 저전력/저사양 환경 감지 (모바일 라이트 버전 분기용). */
export function isLowPowerEnvironment(): boolean {
  if (typeof navigator === "undefined") return false;
  const cores = typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return cores <= 2 || (typeof memory === "number" && memory <= 2);
}

/** easeOutCubic — 모션 프리미티브 공용 이징. */
export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3);
}

/** easeInOutQuad — 패럴랙스·게이지 공용 이징. */
export function easeInOutQuad(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped < 0.5 ? 2 * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
}

export interface MotionInViewOptions {
  /** 한 번만 트리거할지 (기본 true). */
  once?: boolean;
  /** 교차 임계값 (기본 0.2). */
  threshold?: number;
  /** rootMargin (기본 "0px 0px -8% 0px"). */
  rootMargin?: string;
}

/**
 * IntersectionObserver 기반 in-view 훅.
 * reduced-motion 환경에서는 즉시 visible=true (애니메이션 스킵용).
 */
export function useMotionInView<T extends HTMLElement = HTMLDivElement>(
  options: MotionInViewOptions = {},
): { ref: React.RefObject<T | null>; inView: boolean } {
  const { once = true, threshold = 0.2, rootMargin = "0px 0px -8% 0px" } = options;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setInView(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [once, threshold, rootMargin]);

  return { ref, inView };
}

/** 일러스트/에셋 크기 프리셋. */
export const MOTION_ASSET_SIZES = {
  xs: 32,
  sm: 48,
  md: 96,
  lg: 160,
  xl: 240,
} as const;

export type MotionAssetSize = keyof typeof MOTION_ASSET_SIZES | number;

/** 숫자·문자열 크기를 px 숫자로 정규화. */
export function resolveAssetSize(size: MotionAssetSize): number {
  return typeof size === "number" ? size : MOTION_ASSET_SIZES[size];
}

/** 에셋 래퍼 공용 클래스. */
export function motionAssetClass(extra?: string): string {
  return ["motion-asset", extra].filter(Boolean).join(" ");
}

/**
 * `--ma-delay` CSS 변수 스타일 헬퍼.
 * 리빌/시퀀스 지연을 인라인 스타일로 둘 때의 반복 캐스팅을 한 곳에 모은다.
 */
export function delayStyle(ms: number, extra: CSSProperties = {}): CSSProperties {
  return { ...extra, ["--ma-delay" as string]: `${Math.max(0, ms)}ms` } as CSSProperties;
}

/**
 * 문서 lang에서 ko/en을 읽는 훅.
 * 다이어그램·빈 상태 등 라벨이 필요한 컴포넌트에서 공용으로 사용.
 */
export function useMotionAssetLang(): MotionAssetLang {
  if (typeof window === "undefined") return "ko";
  const raw = document.documentElement.lang || "ko";
  return normalizeMotionAssetLang(raw);
}
