/**
 * 앰비언트 파티클 캔버스 렌더러.
 *
 * - 단일 캔버스, requestAnimationFrame 루프
 * - 비/눈/벚꽃잎/단풍잎/반딧불이/눈송이 6종
 * - 성능: DPR 상한, 탭 숨김 시 정지, 파티클 수 상한
 * - reduced-motion에서는 생성하지 않음 (호출 측에서 제어)
 */

import type { AmbientParticleSpec } from "./ambient-engine";

/** 개별 파티클 상태. */
export interface AmbientParticle {
  x: number;
  y: number;
  /** 기본 속도 (px/s). */
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  rotation: number;
  rotSpeed: number;
  /** 흔들림 위상/진폭/주파수. */
  swayPhase: number;
  swayAmp: number;
  swayFreq: number;
  /** 반딧불이 깜빡임용. */
  blinkPhase: number;
}

export type AmbientRandom = () => number;

function randRange(random: AmbientRandom, min: number, max: number): number {
  return min + random() * (max - min);
}

/** 파티클 하나를 생성한다 (순수 함수 — 테스트 가능). */
export function createAmbientParticle(
  spec: AmbientParticleSpec,
  width: number,
  height: number,
  random: AmbientRandom = Math.random,
): AmbientParticle {
  const fromTop = spec.kind !== "firefly";
  return {
    x: randRange(random, 0, width),
    y: fromTop ? randRange(random, -height * 0.2, height) : randRange(random, 0, height),
    vx: randRange(random, spec.drift.min, spec.drift.max),
    vy: randRange(random, spec.fallSpeed.min, spec.fallSpeed.max),
    size: randRange(random, spec.size.min, spec.size.max),
    opacity: randRange(random, spec.opacity.min, spec.opacity.max),
    rotation: randRange(random, 0, Math.PI * 2),
    rotSpeed: randRange(random, -1.2, 1.2),
    swayPhase: randRange(random, 0, Math.PI * 2),
    swayAmp: randRange(random, 10, 50),
    swayFreq: randRange(random, 0.5, 1.8),
    blinkPhase: randRange(random, 0, Math.PI * 2),
  };
}

/**
 * 파티클 위치를 업데이트한다. 화면을 벗어나면 재배치한다 (순수 함수).
 * @returns 재배치 여부
 */
export function updateAmbientParticle(
  particle: AmbientParticle,
  spec: AmbientParticleSpec,
  dtSeconds: number,
  width: number,
  height: number,
  elapsedSeconds: number,
  random: AmbientRandom = Math.random,
): boolean {
  const sway = Math.sin(elapsedSeconds * particle.swayFreq + particle.swayPhase) * particle.swayAmp;
  particle.x += (particle.vx + sway * 0.4) * dtSeconds;
  particle.y += particle.vy * dtSeconds;
  particle.rotation += particle.rotSpeed * dtSeconds;

  // 화면 밖 → 재배치
  const margin = 40;
  let respawned = false;
  if (spec.kind === "firefly") {
    // 반딧불이는 화면 안에서 떠다님
    if (particle.x < -margin || particle.x > width + margin) {
      particle.vx *= -1;
      particle.x = Math.max(-margin, Math.min(width + margin, particle.x));
    }
    if (particle.y < -margin || particle.y > height + margin) {
      particle.vy *= -1;
      particle.y = Math.max(-margin, Math.min(height + margin, particle.y));
    }
  } else if (particle.y > height + margin || particle.x < -margin - 100 || particle.x > width + margin + 100) {
    const fresh = createAmbientParticle(spec, width, height, random);
    particle.x = fresh.x;
    particle.y = -margin + random() * 40; // 위에서 등장
    particle.vx = fresh.vx;
    particle.vy = fresh.vy;
    respawned = true;
  }
  return respawned;
}

/** 파티클의 현재 불투명도 (반딧불이 깜빡임 반영). */
export function particleOpacity(
  particle: AmbientParticle,
  spec: AmbientParticleSpec,
  elapsedSeconds: number,
): number {
  if (spec.kind !== "firefly") return particle.opacity;
  const blink = 0.5 + 0.5 * Math.sin(elapsedSeconds * 2 + particle.blinkPhase);
  return particle.opacity * (0.25 + 0.75 * blink);
}

export interface AmbientParticleRendererOptions {
  /** DPR 상한 (기본 1.5). */
  readonly maxDpr?: number;
  readonly random?: AmbientRandom;
}

/**
 * 캔버스 파티클 렌더러.
 *
 * 사용법:
 * ```
 * const renderer = new AmbientParticleRenderer(canvas, specs);
 * renderer.start();
 * // 스펙 변경 시
 * renderer.setSpecs(nextSpecs);
 * renderer.dispose();
 * ```
 */
export class AmbientParticleRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly maxDpr: number;
  private readonly random: AmbientRandom;
  private specs: readonly AmbientParticleSpec[] = [];
  private particles: Array<{ particle: AmbientParticle; spec: AmbientParticleSpec }> = [];
  private rafId: number | null = null;
  private lastTime = 0;
  private elapsed = 0;
  private disposed = false;
  private readonly onVisibilityChange: () => void;
  private readonly onResize: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    specs: readonly AmbientParticleSpec[],
    options: AmbientParticleRendererOptions = {},
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D 컨텍스트를 만들 수 없습니다");
    this.ctx = ctx;
    this.maxDpr = options.maxDpr ?? 1.5;
    this.random = options.random ?? Math.random;
    this.specs = specs;

    this.onVisibilityChange = () => {
      if (document.hidden) this.pause();
      else this.resume();
    };
    this.onResize = () => this.resize();

    this.resize();
    this.rebuild();
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("resize", this.onResize);
  }

  /** 파티클 스펙을 교체한다 (장면 전환 시). */
  setSpecs(specs: readonly AmbientParticleSpec[]): void {
    this.specs = specs;
    this.rebuild();
  }

  start(): void {
    if (this.disposed || this.rafId !== null) return;
    this.lastTime = performance.now();
    const tick = (now: number) => {
      if (this.disposed) return;
      const dt = Math.min((now - this.lastTime) / 1000, 0.1); // 최대 100ms
      this.lastTime = now;
      this.elapsed += dt;
      this.frame(dt);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  pause(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  resume(): void {
    if (!this.disposed && this.rafId === null && !document.hidden) {
      this.start();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.pause();
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("resize", this.onResize);
    this.particles = [];
  }

  /** 현재 파티클 수 (테스트/디버그용). */
  get particleCount(): number {
    return this.particles.length;
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private rebuild(): void {
    this.particles = [];
    const width = window.innerWidth;
    const height = window.innerHeight;
    // 파티클 수 상한 (성능 가드)
    const MAX_PARTICLES = 320;
    let total = 0;
    for (const spec of this.specs) {
      const count = Math.min(spec.count, MAX_PARTICLES - total);
      for (let i = 0; i < count; i++) {
        this.particles.push({
          particle: createAmbientParticle(spec, width, height, this.random),
          spec,
        });
      }
      total += count;
      if (total >= MAX_PARTICLES) break;
    }
  }

  private frame(dt: number): void {
    const { ctx } = this;
    const width = window.innerWidth;
    const height = window.innerHeight;
    ctx.clearRect(0, 0, width, height);

    for (const entry of this.particles) {
      updateAmbientParticle(entry.particle, entry.spec, dt, width, height, this.elapsed, this.random);
      this.draw(entry.particle, entry.spec);
    }
  }

  private draw(particle: AmbientParticle, spec: AmbientParticleSpec): void {
    const { ctx } = this;
    const opacity = particleOpacity(particle, spec, this.elapsed);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
    ctx.translate(particle.x, particle.y);

    switch (spec.shape) {
      case "line": {
        // 비: 기울어진 선
        ctx.rotate(spec.slant);
        ctx.strokeStyle = spec.color;
        ctx.lineWidth = particle.size;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, particle.size * 9);
        ctx.stroke();
        break;
      }
      case "circle": {
        ctx.fillStyle = spec.color;
        ctx.beginPath();
        ctx.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "petal": {
        // 벚꽃잎: 회전하는 타원
        ctx.rotate(particle.rotation);
        ctx.fillStyle = spec.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, particle.size / 2, particle.size / 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "leaf": {
        // 단풍잎: 뾰족한 타원 (간략화)
        ctx.rotate(particle.rotation);
        ctx.fillStyle = spec.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, particle.size / 2, particle.size / 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.beginPath();
        ctx.ellipse(-particle.size / 6, -particle.size / 8, particle.size / 5, particle.size / 8, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "glow": {
        // 반딧불이: 방사형 그라디언트
        const radius = particle.size * 3;
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        gradient.addColorStop(0, spec.color);
        gradient.addColorStop(1, "rgba(255, 243, 160, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }
}
