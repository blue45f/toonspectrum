/* eslint-disable react-refresh/only-export-components -- 모션 프리미티브와 useMotionInView 훅을 한 파일에 둠 */
import { Children, useEffect, useRef, useState, type JSX, type ReactNode } from "react";

import "./motion-assets-effects.css";
import {
  delayStyle,
  easeOutCubic,
  isLowPowerEnvironment,
  motionAssetClass,
  prefersReducedMotion,
  useMotionInView,
  type MotionInViewOptions,
} from "./motion-assets-engine";

/**
 * Remotion 스타일 모션 프리미티브.
 * 전부 useMotionInView 기반 + reduced-motion/저전력 대응.
 */

/* ---------------- MotionReveal ---------------- */

export type MotionRevealVariant = "up" | "fade" | "slide-left" | "slide-right" | "scale" | "blur";

export interface MotionRevealProps extends MotionInViewOptions {
  children: ReactNode;
  variant?: MotionRevealVariant;
  /** 지연 ms. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "span";
}

/**
 * 스크롤 진입 시 등장. 가장 기본적인 리빌.
 *
 * @example
 * <MotionReveal variant="up" delay={100}><HeroCard /></MotionReveal>
 */
export function MotionReveal({
  children,
  variant = "up",
  delay = 0,
  className,
  as = "div",
  once,
  threshold,
  rootMargin,
}: MotionRevealProps): JSX.Element {
  const { ref, inView } = useMotionInView<HTMLDivElement>({ once, threshold, rootMargin });
  const Tag = as as "div";
  return (
    <Tag
      ref={ref}
      className={`ma-reveal${inView ? " is-visible" : ""}${className ? ` ${className}` : ""}`}
      data-variant={variant}
      style={delayStyle(delay)}
    >
      {children}
    </Tag>
  );
}

/* ---------------- MotionSequence ---------------- */

export interface MotionSequenceProps extends MotionInViewOptions {
  children: ReactNode;
  /** 항목 간 간격 ms. 기본 120. */
  staggerMs?: number;
  /** 시작 지연 ms. */
  startDelayMs?: number;
  className?: string;
}

/**
 * Remotion 스타일 순차 등장: 자식들이 시간차를 두고 페이드+슬라이드로 나타난다.
 *
 * @example
 * <MotionSequence staggerMs={150}>
 *   <StepCard n={1} /><StepCard n={2} /><StepCard n={3} />
 * </MotionSequence>
 */
export function MotionSequence({
  children,
  staggerMs = 120,
  startDelayMs = 0,
  className,
  once,
  threshold,
  rootMargin,
}: MotionSequenceProps): JSX.Element {
  const { ref, inView } = useMotionInView<HTMLDivElement>({ once, threshold, rootMargin });
  const items = Children.toArray(children);
  return (
    <div ref={ref} className={motionAssetClass(className)} data-motion-primitive="sequence">
      {items.map((child, index) => (
        <div
          key={index}
          className={`ma-sequence-item${inView ? " is-visible" : ""}`}
          style={delayStyle(startDelayMs + index * staggerMs)}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

/* ---------------- MotionStagger ---------------- */

export interface MotionStaggerProps {
  children: ReactNode;
  /** 항목 간 간격 ms. 기본 90. */
  staggerMs?: number;
  className?: string;
}

/**
 * 즉시 재생되는 스태거 (스크롤 트리거 없이 마운트 시 순차 등장).
 * 모달·팝오버 안의 리스트에 사용.
 */
export function MotionStagger({ children, staggerMs = 90, className }: MotionStaggerProps): JSX.Element {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setMounted(true);
      return;
    }
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const items = Children.toArray(children);
  return (
    <div className={motionAssetClass(className)} data-motion-primitive="stagger">
      {items.map((child, index) => (
        <div
          key={index}
          className={`ma-sequence-item${mounted ? " is-visible" : ""}`}
          style={delayStyle(index * staggerMs)}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

/* ---------------- MotionCountUp ---------------- */

export interface MotionCountUpProps extends MotionInViewOptions {
  /** 목표 숫자. */
  to: number;
  /** 시작 숫자. 기본 0. */
  from?: number;
  /** 지속 ms. 기본 1200. */
  durationMs?: number;
  /** 포맷터. */
  format?: (value: number) => string;
  className?: string;
}

/**
 * 스크롤 진입 시 숫자가 카운트업.
 *
 * @example
 * <MotionCountUp to={1280} format={(v) => `${Math.round(v).toLocaleString()}컷`} />
 */
export function MotionCountUp({
  to,
  from = 0,
  durationMs = 1200,
  format = (v) => Math.round(v).toLocaleString(),
  className,
  once = true,
  threshold,
  rootMargin,
}: MotionCountUpProps): JSX.Element {
  const { ref, inView } = useMotionInView<HTMLSpanElement>({ once, threshold, rootMargin });
  const [value, setValue] = useState(from);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!inView || startedRef.current) return;
    startedRef.current = true;
    if (prefersReducedMotion() || durationMs <= 0) {
      setValue(to);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = () => {
      // rAF 타임스탬프 대신 performance.now()로 경과 측정 — 두 시계가 어긋나는 환경에서도 안전.
      const t = easeOutCubic((performance.now() - start) / durationMs);
      setValue(from + (to - from) * t);
      if (t < 1) frame = requestAnimationFrame(tick);
      else setValue(to);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, to, from, durationMs]);

  return (
    <span ref={ref} className={motionAssetClass(className)} data-motion-primitive="count-up">
      {format(value)}
    </span>
  );
}

/* ---------------- MotionTypewriter ---------------- */

export interface MotionTypewriterProps extends MotionInViewOptions {
  text: string;
  /** 글자당 ms. 기본 45. */
  charMs?: number;
  /** 커서 표시 여부. 기본 true. */
  cursor?: boolean;
  className?: string;
}

/**
 * 스크롤 진입 시 타이핑 효과.
 *
 * @example
 * <MotionTypewriter text="상상을 그려내세요" />
 */
export function MotionTypewriter({
  text,
  charMs = 45,
  cursor = true,
  className,
  once = true,
  threshold,
  rootMargin,
}: MotionTypewriterProps): JSX.Element {
  const { ref, inView } = useMotionInView<HTMLSpanElement>({ once, threshold, rootMargin });
  const [count, setCount] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!inView || startedRef.current) return;
    startedRef.current = true;
    if (prefersReducedMotion()) {
      setCount(text.length);
      return;
    }
    const timer = window.setInterval(() => {
      setCount((prev) => {
        if (prev >= text.length) {
          window.clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, Math.max(1, charMs));
    return () => window.clearInterval(timer);
  }, [inView, text, charMs]);

  const done = count >= text.length;
  return (
    <span
      ref={ref}
      className={motionAssetClass(className)}
      data-motion-primitive="typewriter"
      aria-label={text}
    >
      <span aria-hidden="true">
        {text.slice(0, count)}
        {cursor && !done ? (
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: "0.55em",
              height: "1.05em",
              marginLeft: 2,
              verticalAlign: "text-bottom",
              background: "currentColor",
              opacity: 0.8,
            }}
            className="ma-anim-blink"
          />
        ) : null}
      </span>
    </span>
  );
}

/* ---------------- MotionParallax ---------------- */

export interface MotionParallaxProps {
  children: ReactNode;
  /** 시차 강도 (-1 ~ 1). 양수면 스크롤과 같은 방향으로 천천히. 기본 0.25. */
  speed?: number;
  className?: string;
}

/**
 * 스크롤 패럴랙스 레이어. 저전력/모바일에서는 비활성화.
 *
 * @example
 * <MotionParallax speed={0.3}><FloatingClouds /></MotionParallax>
 */
export function MotionParallax({ children, speed = 0.25, className }: MotionParallaxProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(0);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion() || isLowPowerEnvironment()) return;
    setEnabled(true);
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportCenter = window.innerHeight / 2;
      const elementCenter = rect.top + rect.height / 2;
      setOffset((elementCenter - viewportCenter) * speed * -1);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [speed]);

  return (
    <div
      ref={ref}
      className={motionAssetClass(className)}
      data-motion-primitive="parallax"
      style={enabled ? { transform: `translate3d(0, ${offset.toFixed(1)}px, 0)`, willChange: "transform" } : undefined}
    >
      {children}
    </div>
  );
}

export { useMotionInView };
export type { MotionInViewOptions };
