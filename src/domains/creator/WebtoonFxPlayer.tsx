/**
 * WebtoonFxPlayer — "무빙툰/효과툰" 리더. 정적 페이지 이미지에 동적 효과를 입힌다.
 * - 스크롤 리빌: 페이지가 화면에 들어오면 페이드업·줌 등으로 등장(IntersectionObserver).
 * - 분위기 오버레이: 비·눈·벚꽃 등 파티클을 화면 위에 sticky 캔버스로 깐다.
 * - BGM: 무드 자동생성(Web Audio) 또는 커스텀 URL을 사용자 제스처 후 재생.
 * 접근성: prefers-reduced-motion이면 리빌·파티클을 끄고 정적으로 보여준다.
 */
import { Music, Pause, Play, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { createBgmPlayer, findBgmMood, type BgmPlayer } from "./studio-bgm";
import {
  REVEAL_SHOWN_STYLE,
  buildAmbientParticles,
  findAmbientPreset,
  revealHiddenStyle,
  stepAmbientParticle,
  type AmbientParticle,
  type AmbientPreset,
  type WorkFxSettings,
} from "./studio-motion-fx";

import { CoverImage } from "@/components/cover-image";
import { cn } from "@/lib/utils";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

// 한 페이지 이미지를 감싸 스크롤 등장 효과를 적용한다.
function RevealPage({
  src,
  alt,
  reveal,
  enabled,
}: {
  src: string;
  alt: string;
  reveal: string;
  enabled: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);

  const style = enabled && !shown ? revealHiddenStyle(reveal) : REVEAL_SHOWN_STYLE;
  return (
    <div
      ref={ref}
      style={{
        ...style,
        transition: enabled
          ? "opacity 700ms ease, transform 760ms cubic-bezier(.2,.7,.2,1), filter 700ms ease"
          : undefined,
      }}
    >
      <CoverImage
        src={src}
        alt={alt}
        className="block w-full"
        fallback={
          <span className="grid aspect-[3/4] w-full place-items-center bg-raised/40 text-xs text-fg-3">
            이미지를 불러올 수 없습니다.
          </span>
        }
      />
    </div>
  );
}

function drawParticle(ctx: CanvasRenderingContext2D, p: AmbientParticle, preset: AmbientPreset, t: number) {
  const alpha = preset.twinkle ? 0.4 + 0.6 * Math.abs(Math.sin(p.phase + t * 2)) : 1;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = preset.color;
  ctx.strokeStyle = preset.color;
  switch (preset.shape) {
    case "line":
      ctx.lineWidth = Math.max(1, p.size * 0.18);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.size * 0.18, p.y + p.size);
      ctx.stroke();
      break;
    case "petal":
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    case "spark":
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "blob":
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    default: // dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
  }
}

// sticky 캔버스로 화면(뷰포트) 위에 파티클을 그린다 — 긴 스트립 전체를 덮지 않아 메모리 안전.
function AmbientCanvas({ preset }: { preset: AmbientPreset }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: AmbientParticle[] = [];
    let cssW = 0;
    let cssH = 0;
    let raf = 0;
    let last = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
      cssW = Math.max(1, Math.round(rect.width));
      cssH = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = buildAmbientParticles(preset, cssW, cssH, 12345);
    };
    resize();

    const frame = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      ctx.clearRect(0, 0, cssW, cssH);
      const t = now / 1000;
      particles = particles.map((p) => stepAmbientParticle(p, cssW, cssH, dt));
      for (const p of particles) drawParticle(ctx, p, preset, t);
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [preset]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <canvas ref={canvasRef} className="sticky top-0 h-screen w-full" aria-hidden />
    </div>
  );
}

// 화면 하단 고정 BGM 컨트롤 — 자동재생 정책상 사용자가 켜야 소리가 난다.
function BgmControl({ fx }: { fx: WorkFxSettings }) {
  const playerRef = useRef<BgmPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(fx.bgmVolume);

  useEffect(() => {
    return () => {
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, []);

  const moodLabel = fx.bgmUrl ? "내 음악" : (findBgmMood(fx.bgmMood)?.label ?? "BGM");

  const toggle = () => {
    if (!playerRef.current) {
      playerRef.current = createBgmPlayer({
        mood: fx.bgmUrl ? null : findBgmMood(fx.bgmMood),
        url: fx.bgmUrl || undefined,
        volume,
      });
    }
    if (playing) {
      playerRef.current.pause();
      setPlaying(false);
    } else {
      playerRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-line bg-panel/95 px-3 py-2 shadow-xl backdrop-blur">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={playing}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
          playing ? "bg-accent text-on-accent" : "bg-card text-fg-2 hover:bg-raised"
        )}
        title={playing ? "배경음악 멈춤" : "배경음악 재생"}
      >
        {playing ? <Pause size={13} /> : <Play size={13} />}
        <Music size={13} />
        {moodLabel}
      </button>
      <label className="flex items-center gap-1.5 text-fg-3" title="배경음악 음량">
        <Volume2 size={13} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            playerRef.current?.setVolume(v);
          }}
          className="h-1 w-20 cursor-pointer accent-[var(--color-accent)]"
          aria-label="배경음악 음량"
        />
      </label>
    </div>
  );
}

export function WebtoonFxPlayer({
  pages,
  fx,
  title,
}: {
  pages: string[];
  fx: WorkFxSettings;
  title: string;
}) {
  const reduced = usePrefersReducedMotion();
  const revealEnabled = !reduced && fx.reveal !== "none";
  const ambientPreset = reduced ? undefined : findAmbientPreset(fx.ambient);
  const ambientOn = ambientPreset && ambientPreset.id !== "none";
  const hasBgm = fx.bgmMood !== "" || fx.bgmUrl !== "";

  return (
    <>
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-line bg-[oklch(0.13_0.006_70)]">
        {pages.length === 0 ? (
          <p className="px-4 py-16 text-center text-sm text-fg-3">표시할 페이지가 없습니다.</p>
        ) : (
          pages.map((page, index) => (
            <RevealPage
              key={`${page}-${index}`}
              src={page}
              alt={`${title} ${index + 1}컷`}
              reveal={fx.reveal}
              enabled={revealEnabled}
            />
          ))
        )}
        {ambientOn && <AmbientCanvas preset={ambientPreset} />}
      </div>
      {hasBgm && <BgmControl fx={fx} />}
    </>
  );
}
