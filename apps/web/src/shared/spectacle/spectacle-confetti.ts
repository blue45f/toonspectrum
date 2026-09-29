/**
 * 컨페티 파티클 물리 (순수 함수) + 캔버스 드라이버.
 *
 * - 파티클 생성·업데이트는 순수 함수로 테스트 가능
 * - launchSpectacleConfetti()는 fixed 오버레이 캔버스를 띄워 연출 후 자동 정리
 * - 스펙터클 수준이 "full"이 아니면 no-op (조용히 종료)
 */

import { createSpectacleOverlayCanvas, pickSpectacle } from "./spectacle-canvas";
import { readSpectacleLevel } from "./spectacle-engine";

/** 컨페티 파티클. */
export interface SpectacleConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  width: number;
  height: number;
  color: string;
  shape: "rect" | "circle" | "ribbon";
  life: number;
  maxLife: number;
  swayPhase: number;
  swayAmplitude: number;
}

export interface SpectacleConfettiOptions {
  /** 파티클 수 (기본 120). */
  readonly count?: number;
  /** 시작 지점 (기본 화면 상단 중앙). */
  readonly origin?: { readonly x: number; readonly y: number };
  /** 지속 시간 ms (기본 2600). */
  readonly durationMs?: number;
  /** 색상 팔레트. */
  readonly colors?: readonly string[];
  /** 중력 px/s^2 (기본 900). */
  readonly gravity?: number;
  /** 위쪽 초기 속도 범위. */
  readonly power?: { readonly min: number; readonly max: number };
}

export const SPECTACLE_CONFETTI_COLORS = [
  "#ff5d8f",
  "#ffb020",
  "#38d39f",
  "#4f8cff",
  "#b06cff",
  "#ffd23f",
  "#ffffff",
] as const;

export type SpectacleRandom = () => number;

/** 파티클 하나를 생성한다 (순수). */
export function createConfettiParticle(
  random: SpectacleRandom,
  origin: { x: number; y: number },
  colors: readonly string[],
  power: { min: number; max: number },
): SpectacleConfettiParticle {
  const angle = random() * Math.PI * 2;
  const speed = power.min + random() * (power.max - power.min);
  const shapeRoll = random();
  return {
    x: origin.x,
    y: origin.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - speed * 0.9,
    rotation: random() * Math.PI * 2,
    rotationSpeed: (random() - 0.5) * 12,
    width: 6 + random() * 6,
    height: 8 + random() * 8,
    color: pickSpectacle(random, colors),
    shape: shapeRoll < 0.55 ? "rect" : shapeRoll < 0.8 ? "circle" : "ribbon",
    life: 0,
    maxLife: 1,
    swayPhase: random() * Math.PI * 2,
    swayAmplitude: 20 + random() * 40,
  };
}

/** 파티클을 dt(초)만큼 전진시킨다 (순수). */
export function updateConfettiParticle(
  particle: SpectacleConfettiParticle,
  dt: number,
  gravity: number,
  durationMs: number,
): SpectacleConfettiParticle {
  const life = particle.life + dt * 1000;
  return {
    ...particle,
    life,
    vy: particle.vy + gravity * dt,
    x: particle.x + particle.vx * dt + Math.sin(particle.swayPhase + life / 180) * particle.swayAmplitude * dt,
    y: particle.y + particle.vy * dt,
    rotation: particle.rotation + particle.rotationSpeed * dt,
    vx: particle.vx * (1 - 0.6 * dt),
    maxLife: durationMs,
  };
}

/** 파티클이 살아있는지. */
export function isConfettiAlive(particle: SpectacleConfettiParticle): boolean {
  return particle.life < particle.maxLife && particle.y < window.innerHeight + 60;
}

/* ------------------------------------------------------------------ */
/* 캔버스 드라이버                                                       */
/* ------------------------------------------------------------------ */

function drawParticle(
  ctx: CanvasRenderingContext2D,
  particle: SpectacleConfettiParticle,
): void {
  const fade = Math.max(0, 1 - particle.life / particle.maxLife);
  ctx.save();
  ctx.globalAlpha = Math.min(1, fade * 1.5);
  ctx.translate(particle.x, particle.y);
  ctx.rotate(particle.rotation);
  ctx.fillStyle = particle.color;
  if (particle.shape === "circle") {
    ctx.beginPath();
    ctx.arc(0, 0, particle.width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (particle.shape === "ribbon") {
    ctx.fillRect(-particle.width / 2, -particle.height / 4, particle.width, particle.height / 2);
    ctx.fillRect(-particle.width / 4, -particle.height / 2, particle.width / 2, particle.height);
  } else {
    ctx.fillRect(-particle.width / 2, -particle.height / 2, particle.width, particle.height);
  }
  ctx.restore();
}

/**
 * 컨페티를 발사한다.
 * - 스펙터클 수준이 full이 아니면 아무 일도 일어나지 않는다
 * - 캔버스는 fixed 오버레이로 띄우고 연출이 끝나면 DOM에서 제거한다
 * - 반환된 stop()으로 중도 취소 가능
 */
export function launchSpectacleConfetti(options: SpectacleConfettiOptions = {}): () => void {
  if (readSpectacleLevel() !== "full") {
    return () => undefined;
  }
  if (typeof document === "undefined") return () => undefined;

  const {
    count = 120,
    durationMs = 2600,
    colors = SPECTACLE_CONFETTI_COLORS,
    gravity = 900,
    power = { min: 260, max: 620 },
  } = options;

  const overlay = createSpectacleOverlayCanvas();
  if (!overlay) {
    return () => undefined;
  }
  const { ctx, width, height } = overlay;

  let raf = 0;
  let stopped = false;
  const dispose = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    overlay.dispose();
  };

  const origin = options.origin ?? { x: width / 2, y: height * 0.25 };
  const random = Math.random;
  let particles: SpectacleConfettiParticle[] = Array.from({ length: count }, () =>
    createConfettiParticle(random, origin, colors, power),
  );

  let last = performance.now();
  const start = last;

  const tick = (now: number) => {
    if (stopped) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    ctx.clearRect(0, 0, width, height);
    particles = particles
      .map((p) => updateConfettiParticle(p, dt, gravity, durationMs))
      .filter((p) => isConfettiAlive(p));
    for (const p of particles) drawParticle(ctx, p);
    if (particles.length > 0 && now - start < durationMs + 1200) {
      raf = requestAnimationFrame(tick);
    } else {
      overlay.dispose();
    }
  };
  raf = requestAnimationFrame(tick);

  return dispose;
}
