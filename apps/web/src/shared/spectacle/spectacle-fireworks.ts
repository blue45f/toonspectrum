/**
 * 폭죽 연출 (순수 함수) + 캔버스 드라이버.
 *
 * 컨페티와 다른 점: 폭죽은 한 점에서 방사형으로 터지는 버스트.
 * - 파티클 생성·업데이트는 순수 함수로 테스트 가능
 * - launchSpectacleFireworks()는 fixed 오버레이 캔버스를 띄워 연출 후 자동 정리
 * - 스펙터클 수준이 "full"이 아니면 no-op
 */

import { createSpectacleOverlayCanvas, pickSpectacle } from "./spectacle-canvas";
import { readSpectacleLevel } from "./spectacle-engine";

/** 폭죽 파티클 (불꽃 하나). */
export interface SpectacleFireworkSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  /** 불꽃 굵기. */
  size: number;
  /** 꼬리 길이 (속도 방향). */
  trail: number;
  life: number;
  maxLife: number;
}

/** 폭죽 버스트 하나 (터지는 지점 + 불꽃들). */
export interface SpectacleFireworkBurst {
  sparks: SpectacleFireworkSpark[];
  /** 다음 버스트까지 남은 시간 (초). */
  delayLeft: number;
}

export interface SpectacleFireworksOptions {
  /** 버스트 횟수 (기본 5). */
  readonly burstCount?: number;
  /** 버스트당 불꽃 수 (기본 60). */
  readonly sparksPerBurst?: number;
  /** 버스트 간격 ms (기본 450). */
  readonly burstIntervalMs?: number;
  /** 전체 지속 시간 ms (기본 3200). */
  readonly durationMs?: number;
  /** 색상 팔레트. */
  readonly colors?: readonly string[];
  /** 중력 px/s^2 (기본 320 — 불꽃은 천천히 떨어진다). */
  readonly gravity?: number;
}

export const SPECTACLE_FIREWORKS_COLORS = [
  "#ffd23f",
  "#ff5d8f",
  "#4f8cff",
  "#38d39f",
  "#b06cff",
  "#ffffff",
] as const;

export type SpectacleRandom = () => number;

/**
 * 버스트 하나를 생성한다 (순수).
 * origin에서 방사형으로 sparksPerBurst개의 불꽃이 퍼진다.
 */
export function createFireworkBurst(
  random: SpectacleRandom,
  origin: { x: number; y: number },
  colors: readonly string[],
  sparksPerBurst: number,
): SpectacleFireworkSpark[] {
  const burstColor = pickSpectacle(random, colors);
  return Array.from({ length: sparksPerBurst }, () => {
    const angle = random() * Math.PI * 2;
    // 같은 버스트 내 속도 분산: 안쪽·바깥쪽 불꽃
    const speed = 120 + random() * 320;
    return {
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: random() < 0.75 ? burstColor : pickSpectacle(random, colors),
      size: 1.6 + random() * 2.4,
      trail: 0.02 + random() * 0.05,
      life: 0,
      maxLife: 0.9 + random() * 0.9,
    };
  });
}

/** 불꽃을 dt(초)만큼 전진시킨다 (순수). 공기 저항으로 감속. */
export function updateFireworkSpark(
  spark: SpectacleFireworkSpark,
  dt: number,
  gravity: number,
): SpectacleFireworkSpark {
  const drag = Math.max(0, 1 - 1.8 * dt);
  return {
    ...spark,
    life: spark.life + dt,
    vx: spark.vx * drag,
    vy: spark.vy * drag + gravity * dt,
    x: spark.x + spark.vx * dt,
    y: spark.y + spark.vy * dt,
  };
}

/** 불꽃이 살아있는지. */
export function isSparkAlive(spark: SpectacleFireworkSpark): boolean {
  return spark.life < spark.maxLife;
}

/**
 * 버스트 지점을 화면 상단 2/3 영역에서 무작위로 정한다 (순수).
 * 지면 근처에서는 터지지 않게 한다.
 */
export function randomBurstOrigin(
  random: SpectacleRandom,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: width * 0.15 + random() * width * 0.7,
    y: height * 0.08 + random() * height * 0.45,
  };
}

/* ------------------------------------------------------------------ */
/* 캔버스 드라이버                                                       */
/* ------------------------------------------------------------------ */

function drawSpark(ctx: CanvasRenderingContext2D, spark: SpectacleFireworkSpark): void {
  const fade = Math.max(0, 1 - spark.life / spark.maxLife);
  ctx.save();
  ctx.globalAlpha = Math.min(1, fade * 1.6);
  ctx.strokeStyle = spark.color;
  ctx.lineWidth = spark.size;
  ctx.lineCap = "round";
  // 꼬리: 현재 위치 → 속도 반대 방향으로 짧게
  ctx.beginPath();
  ctx.moveTo(spark.x, spark.y);
  ctx.lineTo(spark.x - spark.vx * spark.trail, spark.y - spark.vy * spark.trail);
  ctx.stroke();
  ctx.restore();
}

/**
 * 폭죽을 발사한다.
 * - 스펙터클 수준이 full이 아니면 아무 일도 일어나지 않는다
 * - 캔버스는 fixed 오버레이로 띄우고 연출이 끝나면 DOM에서 제거한다
 * - 반환된 stop()으로 중도 취소 가능
 */
export function launchSpectacleFireworks(
  options: SpectacleFireworksOptions = {},
): () => void {
  if (readSpectacleLevel() !== "full") {
    return () => undefined;
  }
  if (typeof document === "undefined") return () => undefined;

  const {
    burstCount = 5,
    sparksPerBurst = 60,
    burstIntervalMs = 450,
    durationMs = 3200,
    colors = SPECTACLE_FIREWORKS_COLORS,
    gravity = 320,
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

  const random = Math.random;
  let sparks: SpectacleFireworkSpark[] = [];
  let burstsLeft = burstCount;
  let nextBurstIn = 0;

  let last = performance.now();
  const start = last;

  const tick = (now: number) => {
    if (stopped) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    ctx.clearRect(0, 0, width, height);

    // 다음 버스트 발사
    nextBurstIn -= dt * 1000;
    if (burstsLeft > 0 && nextBurstIn <= 0) {
      const origin = randomBurstOrigin(random, width, height);
      sparks = sparks.concat(createFireworkBurst(random, origin, colors, sparksPerBurst));
      burstsLeft -= 1;
      nextBurstIn = burstIntervalMs;
    }

    sparks = sparks
      .map((s) => updateFireworkSpark(s, dt, gravity))
      .filter((s) => isSparkAlive(s));
    for (const s of sparks) drawSpark(ctx, s);

    if ((sparks.length > 0 || burstsLeft > 0) && now - start < durationMs + 1500) {
      raf = requestAnimationFrame(tick);
    } else {
      overlay.dispose();
    }
  };
  raf = requestAnimationFrame(tick);

  return dispose;
}
