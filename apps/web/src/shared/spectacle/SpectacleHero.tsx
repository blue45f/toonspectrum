import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { useSpectacle } from "./useSpectacle";

import "./spectacle-effects.css";

export interface SpectacleHeroProps {
  children: ReactNode;
  className?: string;
  /** 반짝이 파티클 밀도 (full 수준에서만 렌더). */
  sparkleCount?: number;
}

/**
 * 시네마틱 히어로 섹션 래퍼.
 *
 * - 그라데이션 오브 3개 (CSS 블러, GPU transform 드리프트)
 * - full 수준에서만 캔버스 반짝이 파티클
 * - light/none에서는 정적 그라데이션만
 */
export function SpectacleHero({ children, className, sparkleCount = 40 }: SpectacleHeroProps) {
  const { level, heavy } = useSpectacle();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!heavy) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let raf = 0;
    let stopped = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    interface Sparkle {
      x: number;
      y: number;
      r: number;
      phase: number;
      speed: number;
    }
    const random = Math.random;
    let sparkles: Sparkle[] = [];
    const seed = () => {
      const rect = canvas.getBoundingClientRect();
      sparkles = Array.from({ length: sparkleCount }, () => ({
        x: random() * rect.width,
        y: random() * rect.height,
        r: 0.8 + random() * 2.2,
        phase: random() * Math.PI * 2,
        speed: 0.4 + random() * 1.2,
      }));
    };
    seed();

    let t = 0;
    const tick = () => {
      if (stopped) return;
      t += 0.016;
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      for (const s of sparkles) {
        const twinkle = 0.25 + 0.75 * Math.abs(Math.sin(t * s.speed + s.phase));
        ctx.globalAlpha = twinkle * 0.8;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [heavy, sparkleCount]);

  return (
    <section
      className={cn(
        "spectacle-hero",
        level === "full" && "spectacle-full",
        level !== "none" && "spectacle-motion",
        className,
      )}
    >
      <div className="spectacle-hero-orbs" aria-hidden="true">
        <span className="spectacle-orb spectacle-orb-a" />
        <span className="spectacle-orb spectacle-orb-b" />
        <span className="spectacle-orb spectacle-orb-c" />
      </div>
      {heavy && (
        <canvas ref={canvasRef} className="spectacle-sparkle-canvas" aria-hidden="true" />
      )}
      {children}
    </section>
  );
}
