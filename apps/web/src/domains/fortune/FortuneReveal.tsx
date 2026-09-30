import { useEffect, useRef, useState } from "react";

import { getCurrentUiLocale, translateAuthoredSourceText } from "@/shared/lib/i18n-bilingual-copy";

// 운세 결과 시네마틱 리빌 — 점수 게이지 카운트업 + 별빛 캔버스 + 순차 등장.
// prefers-reduced-motion이면 애니메이션 없이 즉시 표시한다.

export interface FortuneRevealProps {
  /** 운세 점수 (0~100) */
  score: number;
  /** 점수 라벨 (예: "오늘의 운세 지수") */
  label: string;
  /** 추가로 순차 등장시킬 자식 */
  children?: React.ReactNode;
  className?: string;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function Starfield({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const stars = Array.from({ length: 70 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: (Math.random() * 1.4 + 0.4) * dpr,
      phase: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 1.4,
    }));
    let raf = 0;
    let t = 0;
    const tick = () => {
      t += 0.016;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
        ctx.globalAlpha = tw;
        ctx.fillStyle = "#ffe9a8";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}

export function FortuneReveal({ score, label, children, className }: FortuneRevealProps) {
  const locale = getCurrentUiLocale();
  const tx = (source: string) => translateAuthoredSourceText(locale, "ko", "FortuneReveal", source);
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? score : 0);
  const [revealed, setRevealed] = useState(reduced);

  useEffect(() => {
    if (reduced) {
      setDisplay(score);
      setRevealed(true);
      return;
    }
    setDisplay(0);
    setRevealed(false);
    const duration = 1400;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(eased * score));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setRevealed(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score, reduced]);

  const pct = Math.max(0, Math.min(100, display));

  return (
    <section
      className={className}
      aria-label={label}
      style={{ position: "relative", overflow: "hidden" }}
    >
      <Starfield active={!reduced} />
      <div style={{ position: "relative", textAlign: "center", padding: "1.5rem 1rem" }}>
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", opacity: 0.8 }}>{label}</p>
        <div
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.max(0, Math.min(100, Math.round(score)))}
          aria-label={label}
          style={{ fontSize: "3rem", fontWeight: 800, lineHeight: 1.1 }}
        >
          {pct}
          <span style={{ fontSize: "1.25rem", fontWeight: 600 }}>%</span>
        </div>
        <div
          aria-hidden="true"
          style={{
            height: 8,
            borderRadius: 999,
            background: "rgba(127,127,160,0.25)",
            marginTop: "0.75rem",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: 999,
              background: "linear-gradient(90deg, #8b5cf6, #ec4899, #f59e0b)",
              transition: reduced ? "none" : "width 120ms linear",
            }}
          />
        </div>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", opacity: 0.7 }}>
          {score >= 85 ? tx("별들이 당신 편이에요 ✨") : score >= 70 ? tx("흐름이 좋은 날이에요 🌙") : tx("차분히 내실을 다지는 날이에요 🌿")}
        </p>
      </div>
      <div
        style={{
          position: "relative",
          opacity: revealed ? 1 : 0,
          transform: revealed || reduced ? "none" : "translateY(12px)",
          transition: reduced ? "none" : "opacity 600ms ease, transform 600ms ease",
        }}
      >
        {children}
      </div>
    </section>
  );
}
