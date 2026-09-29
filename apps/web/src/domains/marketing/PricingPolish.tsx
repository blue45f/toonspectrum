import { useEffect, useRef, useState, type ReactNode } from "react";

import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";

import Link from "@/shared/navigation/router-link";
import { cx } from "@/shared/lib/cx";

/**
 * 요금제 페이지 폴리시 컴포넌트 — 3D 틸트 카드, 숫자 카운트업, 펄스 CTA.
 *
 * 모든 모션은 `useReducedMotion()`으로 분기한다: reduced-motion 환경에서는
 * 정적 렌더·즉시 표시로 폴백하고, 애니메이션 관련 핸들러를 붙이지 않는다.
 */

const TILT_MAX_DEG = 8;

export interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** 추천 플랜 등 강조가 필요하면 글로우 테두리(액센트 그림자)를 더한다. */
  glow?: boolean;
  /** 스크린리더용 카드 라벨. */
  label?: string;
}

/**
 * 마우스 위치에 따라 rotateX/rotateY가 기울어지는 3D 틸트 카드.
 * perspective는 motion의 transformPerspective로 카드 자체에 적용한다.
 */
export function TiltCard({ children, className, glow = false, label }: TiltCardProps) {
  const reduceMotion = useReducedMotion();
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 260, damping: 22 });
  const springY = useSpring(rotateY, { stiffness: 260, damping: 22 });

  const cardClassName = cx(
    "relative",
    glow && "shadow-[0_0_36px_oklch(0.7_0.18_315/0.28)]",
    className,
  );

  if (reduceMotion) {
    return (
      <article aria-label={label} data-tilt="static" className={cardClassName}>
        {children}
      </article>
    );
  }

  return (
    <motion.article
      aria-label={label}
      data-tilt="animated"
      className={cardClassName}
      style={{ rotateX: springX, rotateY: springY, transformPerspective: 1000 }}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const px = (event.clientX - rect.left) / rect.width - 0.5;
        const py = (event.clientY - rect.top) / rect.height - 0.5;
        rotateY.set(px * TILT_MAX_DEG * 2);
        rotateX.set(-py * TILT_MAX_DEG * 2);
      }}
      onMouseLeave={() => {
        rotateX.set(0);
        rotateY.set(0);
      }}
    >
      {children}
    </motion.article>
  );
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

function nextFrame(callback: () => void): () => void {
  if (typeof requestAnimationFrame === "function") {
    const id = requestAnimationFrame(() => callback());
    return () => cancelAnimationFrame(id);
  }
  const id = setTimeout(callback, 16);
  return () => clearTimeout(id);
}

export interface CountUpProps {
  /** 목표 숫자. */
  value: number;
  /** 표시 포맷 — 기본값은 ko-KR 자릿수 구분. */
  format?: (n: number) => string;
  /** 애니메이션 길이(ms). 기본 1000. */
  duration?: number;
  className?: string;
}

/**
 * 화면에 들어오면 0부터 목표 숫자까지 카운트업한다.
 * reduced-motion이면 즉시 최종 값을 표시하고, IntersectionObserver가 없으면
 * 마운트 시 바로 시작한다.
 */
export function CountUp({ value, format, duration = 1000, className }: CountUpProps) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const render = format ?? ((n: number) => new Intl.NumberFormat("ko-KR").format(Math.round(n)));

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    let cancelled = false;
    let cancelFrame: (() => void) | null = null;
    let started = false;

    const begin = () => {
      if (started || cancelled) return;
      started = true;
      const startAt = performance.now();
      const tick = () => {
        if (cancelled) return;
        const progress = Math.min(1, (performance.now() - startAt) / duration);
        setDisplay(value * easeOutCubic(progress));
        if (progress < 1) {
          cancelFrame = nextFrame(tick);
        }
      };
      cancelFrame = nextFrame(tick);
    };

    if (typeof IntersectionObserver === "undefined") {
      begin();
      return () => {
        cancelled = true;
        cancelFrame?.();
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          begin();
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    const element = ref.current;
    if (element) observer.observe(element);
    return () => {
      cancelled = true;
      cancelFrame?.();
      observer.disconnect();
    };
  }, [value, duration, reduceMotion]);

  return (
    <span ref={ref} className={className}>
      {render(display)}
    </span>
  );
}

export interface PulseCtaProps {
  href: string;
  children: ReactNode;
  className?: string;
}

/**
 * 펄스 링 + 호버 리프트가 적용된 주요 CTA.
 * reduced-motion이면 펄스 링을 렌더하지 않는다.
 */
export function PulseCta({ href, children, className }: PulseCtaProps) {
  const reduceMotion = useReducedMotion();

  return (
    <Link
      href={href}
      className={cx(
        "relative inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-fg px-5 py-3 text-sm font-bold text-canvas",
        "transition-transform hover:-translate-y-0.5 motion-reduce:transform-none",
        className,
      )}
    >
      {reduceMotion ? null : (
        <motion.span
          aria-hidden="true"
          data-testid="pulse-ring"
          className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-accent"
          initial={{ scale: 1, opacity: 0.55 }}
          animate={{ scale: 1.45, opacity: 0 }}
          transition={{ duration: 1.9, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span className="relative inline-flex items-center gap-2">{children}</span>
    </Link>
  );
}
