import { useEffect, useId, useRef, type CSSProperties, type JSX } from "react";

import "./motion-assets-effects.css";
import {
  isLowPowerEnvironment,
  motionAssetClass,
  prefersReducedMotion,
} from "./motion-assets-engine";

/**
 * 섹션 배경 에셋: 그라데이션 오브, 노이즈, 빛줄기, 파티클 캔버스.
 * 전부 pointer-events:none, absolute 배치 — 부모에 position:relative 필요.
 */

/* ---------------- 그라데이션 오브 ---------------- */

export interface MotionOrbsProps {
  /** 오브 색상 목록 (CSS 색상). 기본 3색. */
  colors?: [string, string, string];
  /** 불투명도. 기본 0.5. */
  opacity?: number;
  /** 모바일/저전력에서 오브 개수 축소 여부. 기본 true. */
  liteOnLowPower?: boolean;
  className?: string;
}

/**
 * 블러 처리된 그라데이션 오브 3개. 둥실거리는 배경.
 *
 * @example
 * <section style={{position:"relative"}}><MotionOrbs /><Content /></section>
 */
export function MotionOrbs({
  colors = ["#8b5cf6", "#3b82f6", "#ec4899"],
  opacity = 0.5,
  liteOnLowPower = true,
  className,
}: MotionOrbsProps): JSX.Element {
  const lite = liteOnLowPower && isLowPowerEnvironment();
  const shown = lite ? colors.slice(0, 2) : colors;
  const positions: Array<CSSProperties> = [
    { width: "46%", aspectRatio: "1", left: "-8%", top: "-12%", background: shown[0] },
    { width: "38%", aspectRatio: "1", right: "-6%", top: "22%", background: shown[1] },
    { width: "42%", aspectRatio: "1", left: "28%", bottom: "-18%", background: shown[2] },
  ];
  return (
    <div
      className={`ma-bg-orbs${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      data-motion-bg="orbs"
      style={{ ["--ma-orb-opacity" as string]: String(opacity) } as CSSProperties}
    >
      {shown.map((_, i) => (
        <span key={i} className="ma-bg-orb" data-orb={String(i)} style={positions[i]} />
      ))}
    </div>
  );
}

/* ---------------- 노이즈 텍스처 ---------------- */

export interface MotionNoiseProps {
  /** 불투명도. 기본 0.05. */
  opacity?: number;
  className?: string;
}

/** SVG feTurbulence 기반 필름 그레인 오버레이. */
export function MotionNoise({ opacity = 0.05, className }: MotionNoiseProps): JSX.Element {
  // 여러 인스턴스가 한 페이지에 있어도 필터 ID가 충돌하지 않게 고유화.
  const filterId = `ma-noise-filter-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div
      className={`ma-bg-noise${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      data-motion-bg="noise"
      style={{ ["--ma-noise-opacity" as string]: String(opacity) } as CSSProperties}
    >
      <svg width="100%" height="100%" aria-hidden="true">
        <filter id={filterId}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${filterId})`} />
      </svg>
    </div>
  );
}

/* ---------------- 빛줄기 ---------------- */

export interface MotionLightRaysProps {
  /** 빛줄기 색상. 기본 흰색 7%. */
  color?: string;
  /** 회전 속도 배율. 기본 1. */
  speed?: number;
  className?: string;
}

/** 천천히 회전하는 빛줄기 (conic-gradient). */
export function MotionLightRays({ color = "rgba(255,255,255,0.07)", speed = 1, className }: MotionLightRaysProps): JSX.Element {
  return (
    <div className={motionAssetClass(className)} style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }} aria-hidden="true" data-motion-bg="rays">
      <div
        className="ma-bg-rays"
        style={
          {
            ["--ma-ray-color" as string]: color,
            animationDuration: `${60 / Math.max(0.2, speed)}s`,
          } as CSSProperties
        }
      />
    </div>
  );
}

/* ---------------- 파티클 캔버스 ---------------- */

export interface MotionParticlesProps {
  /** 파티클 수. 기본 42 (저전력 18). */
  count?: number;
  /** 파티클 색상. 기본 currentColor. */
  color?: string;
  /** 최대 크기 px. 기본 3. */
  maxSize?: number;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  twinkle: number;
}

/**
 * 떠다니는 파티클 캔버스. reduced-motion/저전력에서는 정적 렌더 1회.
 *
 * @example
 * <section style={{position:"relative"}}><MotionParticles count={60} /><Content /></section>
 */
export function MotionParticles({ count = 42, color, maxSize = 3, className }: MotionParticlesProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    const lowPower = isLowPowerEnvironment();
    const total = lowPower ? Math.min(count, 18) : count;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();

    const rand = (min: number, max: number) => min + Math.random() * (max - min);
    const particles: Particle[] = Array.from({ length: total }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: rand(-0.00012, 0.00012),
      vy: rand(-0.00022, -0.00004),
      r: rand(0.8, maxSize),
      alpha: rand(0.25, 0.8),
      twinkle: rand(0, Math.PI * 2),
    }));

    const styleColor = color ?? getComputedStyle(canvas).color ?? "#888";

    const draw = (time: number) => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        const tw = 0.6 + 0.4 * Math.sin(time / 900 + p.twinkle);
        ctx.globalAlpha = p.alpha * tw;
        ctx.fillStyle = styleColor;
        ctx.beginPath();
        ctx.arc(p.x * width, p.y * height, p.r * (width / 800 + 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const step = (time: number) => {
      const { width, height } = canvas;
      for (const p of particles) {
        p.x += p.vx * width * 0.016 * 60;
        p.y += p.vy * height * 0.016 * 60;
        if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
        if (p.x < -0.05) p.x = 1.05;
        if (p.x > 1.05) p.x = -0.05;
      }
      draw(time);
    };

    if (reduced || lowPower) {
      draw(0);
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }

    let frame = 0;
    const loop = (time: number) => {
      step(time);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [count, color, maxSize]);

  return (
    <canvas
      ref={canvasRef}
      className={`ma-bg-particles${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      data-motion-bg="particles"
      style={color ? { color } : undefined}
    />
  );
}
