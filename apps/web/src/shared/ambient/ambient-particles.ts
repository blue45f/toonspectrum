/**
 * 배경 파티클의 생성·이동 규칙(순수 함수, DOM 없음).
 *
 * - 떨어지는 효과(빗줄기·눈·꽃잎·낙엽)는 화면 아래로 나가면 위쪽에서 다시 나타난다.
 * - 떠오르는 빛 알갱이는 위로 나가면 아래에서 다시 나타난다.
 * - 반딧불은 영역 안을 천천히 떠돌고, 별은 제자리에서 반짝인다.
 */

import type { AmbientParticleLayerSpec, AmbientParticleRegion, AmbientRange } from "./ambient-layers";

export type AmbientRandom = () => number;

/** 개별 파티클 상태(성능을 위해 제자리에서 갱신한다). */
export interface AmbientParticle {
  x: number;
  y: number;
  /** 속도(px/s). */
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
  rotation: number;
  spin: number;
  /** 꽃잎·낙엽이 뒤집히는 위상(가로 폭 = cos(flip)). */
  flip: number;
  flipSpeed: number;
  swayPhase: number;
  swayAmp: number;
  swayFreq: number;
  twinklePhase: number;
  twinkleSpeed: number;
}

/** 화면 밖 여유 폭(px). */
const EDGE_MARGIN = 40;

function pick(random: AmbientRandom, value: AmbientRange): number {
  return value.min + random() * (value.max - value.min);
}

function pickColor(random: AmbientRandom, colors: readonly string[]): string {
  return colors[Math.min(colors.length - 1, Math.floor(random() * colors.length))] ?? "#ffffff";
}

function regionBounds(region: AmbientParticleRegion, height: number): { top: number; bottom: number } {
  if (region === "upper") return { top: 0, bottom: height * 0.7 };
  if (region === "lower") return { top: height * 0.3, bottom: height };
  return { top: 0, bottom: height };
}

function isFalling(spec: AmbientParticleLayerSpec): boolean {
  return spec.style === "streak" || spec.style === "flake" || spec.style === "petal" || spec.style === "leaf";
}

/** 바람 때문에 화면 높이를 지나는 동안 옆으로 밀리는 거리. 바람 반대편에서 생성해 빈 곳을 없앤다. */
function windTravel(spec: AmbientParticleLayerSpec, height: number): number {
  const fall = (spec.fall.min + spec.fall.max) / 2;
  if (fall <= 0) return 0;
  const drift = (spec.drift.min + spec.drift.max) / 2;
  return Math.max(-height, Math.min(height, (drift / fall) * height));
}

function spawnX(spec: AmbientParticleLayerSpec, width: number, height: number, random: AmbientRandom): number {
  const travel = windTravel(spec, height);
  const from = Math.min(0, -travel);
  const to = width + Math.max(0, -travel);
  return from + random() * (to - from);
}

/**
 * 파티클 하나를 만든다.
 * @param scatter true면 영역 전체에 흩뿌리고(첫 화면), false면 들어오는 가장자리에서 만든다(재등장).
 */
export function createAmbientParticle(
  spec: AmbientParticleLayerSpec,
  width: number,
  height: number,
  random: AmbientRandom = Math.random,
  scatter = true,
): AmbientParticle {
  const size = pick(random, spec.size);
  const bounds = regionBounds(spec.region, height);
  let y: number;
  if (isFalling(spec)) {
    y = scatter ? pick(random, { min: -height * 0.1, max: height }) : -size - EDGE_MARGIN * random();
  } else if (spec.fall.max < 0) {
    y = scatter ? pick(random, { min: bounds.top, max: bounds.bottom }) : bounds.bottom + size;
  } else {
    y = pick(random, { min: bounds.top, max: bounds.bottom });
  }
  return {
    x: isFalling(spec) ? spawnX(spec, width, height, random) : random() * width,
    y,
    vx: pick(random, spec.drift),
    vy: pick(random, spec.fall),
    size,
    opacity: pick(random, spec.opacity),
    color: pickColor(random, spec.colors),
    rotation: random() * Math.PI * 2,
    spin: pick(random, { min: -1.1, max: 1.1 }),
    flip: random() * Math.PI * 2,
    flipSpeed: pick(random, { min: 0.8, max: 2.2 }),
    swayPhase: random() * Math.PI * 2,
    swayAmp: pick(random, spec.sway),
    swayFreq: pick(random, { min: 0.45, max: 1.3 }),
    twinklePhase: random() * Math.PI * 2,
    twinkleSpeed: spec.twinkle ? pick(random, spec.twinkle) : 0,
  };
}

function respawn(
  particle: AmbientParticle,
  spec: AmbientParticleLayerSpec,
  width: number,
  height: number,
  random: AmbientRandom,
): void {
  Object.assign(particle, createAmbientParticle(spec, width, height, random, false));
}

/**
 * 파티클을 dt초만큼 움직인다. 화면을 벗어나면 다시 들어오는 위치로 옮긴다.
 * @returns 다시 배치했으면 true
 */
export function stepAmbientParticle(
  particle: AmbientParticle,
  spec: AmbientParticleLayerSpec,
  dt: number,
  width: number,
  height: number,
  elapsed: number,
  random: AmbientRandom = Math.random,
): boolean {
  // 흔들림: 위치 sin 곡선의 미분을 속도에 더해 매끄럽게 좌우로 흔든다.
  const swayVelocity =
    Math.cos(elapsed * particle.swayFreq + particle.swayPhase) * particle.swayAmp * particle.swayFreq;
  particle.rotation += particle.spin * dt;
  particle.flip += particle.flipSpeed * dt;

  if (spec.style === "glow") {
    // 반딧불: 속도를 조금씩 바꿔 떠돌고, 영역 가장자리에서 부드럽게 되돌아온다.
    particle.vx = clamp(particle.vx + (random() - 0.5) * 18 * dt, spec.drift.min, spec.drift.max);
    particle.vy = clamp(particle.vy + (random() - 0.5) * 18 * dt, spec.fall.min, spec.fall.max);
    particle.x += (particle.vx + swayVelocity) * dt;
    particle.y += particle.vy * dt;
    const bounds = regionBounds(spec.region, height);
    if (particle.x < -EDGE_MARGIN) particle.vx = Math.abs(particle.vx);
    if (particle.x > width + EDGE_MARGIN) particle.vx = -Math.abs(particle.vx);
    if (particle.y < bounds.top) particle.vy = Math.abs(particle.vy);
    if (particle.y > bounds.bottom) particle.vy = -Math.abs(particle.vy);
    return false;
  }

  particle.x += (particle.vx + swayVelocity) * dt;
  particle.y += particle.vy * dt;

  if (spec.style === "star") {
    // 별은 아주 느리게 흐르다 옆으로 나가면 반대편에서 이어진다.
    if (particle.x < -EDGE_MARGIN) particle.x += width + EDGE_MARGIN * 2;
    else if (particle.x > width + EDGE_MARGIN) particle.x -= width + EDGE_MARGIN * 2;
    return false;
  }

  const horizontalLimit = EDGE_MARGIN + Math.abs(windTravel(spec, height)) + particle.swayAmp;
  const outside =
    particle.x < -horizontalLimit
    || particle.x > width + horizontalLimit
    || (particle.vy >= 0 && particle.y - particle.size > height + EDGE_MARGIN)
    || (particle.vy < 0 && particle.y + particle.size < regionBounds(spec.region, height).top - EDGE_MARGIN);
  if (outside) {
    respawn(particle, spec, width, height, random);
    return true;
  }
  return false;
}

/** 떠오르는 파티클이 영역 가장자리에서 서서히 나타나고 사라지는 거리(px). */
const RISING_EDGE_FADE = 90;

/** 현재 불투명도(반짝임과 떠오르는 파티클의 가장자리 페이드 반영). */
export function ambientParticleOpacity(
  particle: AmbientParticle,
  spec: AmbientParticleLayerSpec,
  elapsed: number,
  height: number,
): number {
  let opacity = particle.opacity;
  if (spec.twinkle) {
    const wave = 0.5 + 0.5 * Math.sin(elapsed * particle.twinkleSpeed * Math.PI * 2 + particle.twinklePhase);
    opacity *= 0.3 + 0.7 * wave;
  }
  if (spec.fall.max < 0) {
    const bounds = regionBounds(spec.region, height);
    const edge = Math.min(particle.y - bounds.top, bounds.bottom - particle.y);
    opacity *= clamp(edge / RISING_EDGE_FADE, 0, 1);
  }
  return opacity;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
