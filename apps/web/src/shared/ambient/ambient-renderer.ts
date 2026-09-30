/**
 * 배경 효과 캔버스 렌더러.
 *
 * - 캔버스 하나, requestAnimationFrame 루프 하나. 고주사율 화면에서도 60fps를 넘기지 않는다.
 * - DPR 대응(상한 지정), 탭이 숨겨지면 멈추고 다시 보이면 이어서 그린다.
 * - 장면이 바뀌면 이전 레이어는 서서히 사라지고 새 레이어가 서서히 나타난다.
 * - 부드러운 점·빛·구름·햇살은 미리 그려 둔 스프라이트를 drawImage로 찍어 매 프레임 비용을 줄인다.
 * - 2D 컨텍스트를 만들 수 없는 환경(jsdom 등)에서는 create()가 null을 돌려준다.
 */

import {
  AMBIENT_FLASH_MAX_OPACITY,
  type AmbientCloudLayerSpec,
  type AmbientFlashLayerSpec,
  type AmbientLayerSpec,
  type AmbientParticleLayerSpec,
  type AmbientRange,
  type AmbientSunRaysLayerSpec,
} from "./ambient-layers";
import {
  ambientParticleOpacity,
  createAmbientParticle,
  stepAmbientParticle,
  type AmbientParticle,
  type AmbientRandom,
} from "./ambient-particles";

export interface AmbientSurfaceSize {
  readonly width: number;
  readonly height: number;
}

/** 크기를 받아 레이어 명세를 만드는 함수. 넓이에 따라 개수가 달라지므로 크기가 바뀌면 다시 부른다. */
export type AmbientLayerSource = (size: AmbientSurfaceSize) => readonly AmbientLayerSpec[];

export interface AmbientRendererOptions {
  /** 그릴 영역 크기(CSS px). */
  readonly measure: () => AmbientSurfaceSize;
  /** 크기 변경 구독. 기본은 window resize. */
  readonly observeResize?: (onResize: () => void) => () => void;
  /** DPR 상한. 기본 2. */
  readonly maxDpr?: number;
  readonly random?: AmbientRandom;
}

/** 장면 전환 페이드 시간(초). */
const FADE_SECONDS = 0.6;
/** 한 프레임에서 진행할 최대 시간(초). 탭 복귀 직후 순간 이동을 막는다. */
const MAX_STEP_SECONDS = 0.1;
/** 60fps 상한(수직 동기 흔들림 여유 2ms). */
const MIN_FRAME_INTERVAL_MS = 1000 / 60 - 2;
/** 넓이가 이 비율 이상 바뀌면 파티클을 다시 배치한다(모바일 주소창 변화는 무시). */
const REBUILD_AREA_RATIO = 0.15;
const FLASH_RISE_SECONDS = 0.09;
const FLASH_DECAY_SECONDS = 0.45;
const SHOOTING_STAR_SECONDS = 0.9;
/** 햇살 이미지는 흐린 그림이라 절반 해상도로 미리 그려 늘려 쓴다. */
const SUNRAY_IMAGE_SCALE = 0.5;
const SPRITE_SIZE = 64;

type Context2D = CanvasRenderingContext2D;

function pick(random: AmbientRandom, value: AmbientRange): number {
  return value.min + random() * (value.max - value.min);
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): Context2D | null {
  try {
    return canvas.getContext("2d");
  } catch {
    return null;
  }
}

/** "#rrggbb" → "r, g, b" */
function hexToRgb(hex: string): string {
  const value = /^#([0-9a-f]{6})$/iu.exec(hex)?.[1];
  if (!value) return "255, 255, 255";
  const number = Number.parseInt(value, 16);
  return `${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}`;
}

type SpriteKind = "flake" | "glow" | "star" | "sparkle";

/** 부드러운 점·빛 스프라이트. 가운데가 밝고 가장자리로 갈수록 투명해진다. */
function createSprite(kind: SpriteKind, color: string): HTMLCanvasElement | null {
  const canvas = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
  const g = context2d(canvas);
  if (!g) return null;
  const c = SPRITE_SIZE / 2;
  const rgb = hexToRgb(color);
  const gradient = g.createRadialGradient(c, c, 0, c, c, c);
  if (kind === "glow") {
    // 반딧불·빛 알갱이: 밝은 심지 + 넓은 번짐.
    gradient.addColorStop(0, "rgba(255, 255, 240, 1)");
    gradient.addColorStop(0.1, `rgba(${rgb}, 1)`);
    gradient.addColorStop(0.32, `rgba(${rgb}, 0.32)`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);
  } else if (kind === "flake") {
    gradient.addColorStop(0, `rgba(${rgb}, 1)`);
    gradient.addColorStop(0.45, `rgba(${rgb}, 0.8)`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);
  } else {
    gradient.addColorStop(0, `rgba(${rgb}, 1)`);
    gradient.addColorStop(0.3, `rgba(${rgb}, 0.5)`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);
  }
  g.fillStyle = gradient;
  g.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  if (kind === "sparkle") {
    // 밝은 별: 가는 십자 빛줄기.
    for (const horizontal of [true, false]) {
      const line = horizontal
        ? g.createLinearGradient(0, c, SPRITE_SIZE, c)
        : g.createLinearGradient(c, 0, c, SPRITE_SIZE);
      line.addColorStop(0, `rgba(${rgb}, 0)`);
      line.addColorStop(0.5, `rgba(${rgb}, 0.85)`);
      line.addColorStop(1, `rgba(${rgb}, 0)`);
      g.fillStyle = line;
      if (horizontal) g.fillRect(0, c - 0.75, SPRITE_SIZE, 1.5);
      else g.fillRect(c - 0.75, 0, 1.5, SPRITE_SIZE);
    }
  }
  return canvas;
}

/** 레이어 하나를 그리는 객체. */
interface AmbientLayerPainter {
  /** 크기에 맞춰 내부 상태를 새로 만든다. */
  rebuild(size: AmbientSurfaceSize): void;
  advance(dt: number, elapsed: number, size: AmbientSurfaceSize): void;
  draw(ctx: Context2D, alpha: number, elapsed: number, size: AmbientSurfaceSize, dpr: number): void;
}

/* ------------------------------------------------------------------ */
/* 파티클(빗줄기·눈·꽃잎·낙엽·반딧불·별·빛 알갱이)                        */
/* ------------------------------------------------------------------ */

interface ShootingStar {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly speed: number;
  readonly length: number;
  readonly startedAt: number;
}

class ParticlePainter implements AmbientLayerPainter {
  private particles: AmbientParticle[] = [];
  private readonly sprites = new Map<string, HTMLCanvasElement | null>();
  private shape: Path2D | null = null;
  private shooting: ShootingStar | null = null;
  private nextShootingAt: number;

  constructor(
    private readonly spec: AmbientParticleLayerSpec,
    private readonly random: AmbientRandom,
  ) {
    this.nextShootingAt = spec.shootingStars ? pick(random, spec.shootingStars) : Number.POSITIVE_INFINITY;
  }

  rebuild(size: AmbientSurfaceSize): void {
    this.particles = Array.from({ length: this.spec.count }, () =>
      createAmbientParticle(this.spec, size.width, size.height, this.random, true),
    );
  }

  advance(dt: number, elapsed: number, size: AmbientSurfaceSize): void {
    for (const particle of this.particles) {
      stepAmbientParticle(particle, this.spec, dt, size.width, size.height, elapsed, this.random);
    }
    const range = this.spec.shootingStars;
    if (!range) return;
    if (this.shooting && elapsed - this.shooting.startedAt > SHOOTING_STAR_SECONDS) {
      this.shooting = null;
      this.nextShootingAt = elapsed + pick(this.random, range);
    } else if (!this.shooting && elapsed >= this.nextShootingAt) {
      const leftward = this.random() < 0.5;
      const angle = pick(this.random, { min: 0.16, max: 0.28 }) * Math.PI;
      this.shooting = {
        x: size.width * pick(this.random, { min: 0.2, max: 0.8 }),
        y: size.height * pick(this.random, { min: 0.04, max: 0.28 }),
        dx: Math.cos(angle) * (leftward ? -1 : 1),
        dy: Math.sin(angle),
        speed: pick(this.random, { min: 620, max: 900 }),
        length: pick(this.random, { min: 90, max: 170 }),
        startedAt: elapsed,
      };
    }
  }

  draw(ctx: Context2D, alpha: number, elapsed: number, size: AmbientSurfaceSize, dpr: number): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = this.spec.additive ? "lighter" : "source-over";
    switch (this.spec.style) {
      case "streak":
        this.drawStreaks(ctx, alpha, elapsed, size);
        break;
      case "petal":
      case "leaf":
        this.drawShapes(ctx, alpha, elapsed, size, dpr);
        break;
      default:
        this.drawSprites(ctx, alpha, elapsed, size);
    }
    this.drawShootingStar(ctx, alpha, elapsed);
    ctx.globalCompositeOperation = "source-over";
  }

  private drawStreaks(ctx: Context2D, alpha: number, elapsed: number, size: AmbientSurfaceSize): void {
    ctx.lineCap = "round";
    ctx.lineWidth = 1.15;
    for (const particle of this.particles) {
      const opacity = ambientParticleOpacity(particle, this.spec, elapsed, size.height) * alpha;
      if (opacity <= 0.01) continue;
      const speed = Math.hypot(particle.vx, particle.vy) || 1;
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = particle.color;
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(
        particle.x - (particle.vx / speed) * particle.size,
        particle.y - (particle.vy / speed) * particle.size,
      );
      ctx.stroke();
    }
  }

  private sprite(kind: SpriteKind, color: string): HTMLCanvasElement | null {
    const key = `${kind}:${color}`;
    if (!this.sprites.has(key)) this.sprites.set(key, createSprite(kind, color));
    return this.sprites.get(key) ?? null;
  }

  private drawSprites(ctx: Context2D, alpha: number, elapsed: number, size: AmbientSurfaceSize): void {
    const style = this.spec.style;
    const baseKind: SpriteKind = style === "flake" ? "flake" : style === "star" ? "star" : "glow";
    // 스프라이트 지름 배율: 반딧불은 넓게 번지고, 눈·별은 점에 가깝다.
    const spread = style === "glow" ? 6 : style === "mote" ? 3.4 : style === "star" ? 2.4 : 1.7;
    for (const particle of this.particles) {
      const opacity = ambientParticleOpacity(particle, this.spec, elapsed, size.height) * alpha;
      if (opacity <= 0.01) continue;
      const kind: SpriteKind = style === "star" && particle.size > 2.9 ? "sparkle" : baseKind;
      const image = this.sprite(kind, particle.color);
      if (!image) continue;
      const diameter = particle.size * (kind === "sparkle" ? 4.2 : spread);
      ctx.globalAlpha = opacity;
      ctx.drawImage(image, particle.x - diameter / 2, particle.y - diameter / 2, diameter, diameter);
    }
  }

  private shapePath(): Path2D | null {
    if (this.shape || typeof Path2D === "undefined") return this.shape;
    const path = new Path2D();
    if (this.spec.style === "petal") {
      // 벚꽃잎: 둥근 잎 끝에 작은 홈.
      path.moveTo(0, -0.5);
      path.bezierCurveTo(0.44, -0.42, 0.4, 0.22, 0.07, 0.48);
      path.lineTo(0, 0.38);
      path.lineTo(-0.07, 0.48);
      path.bezierCurveTo(-0.4, 0.22, -0.44, -0.42, 0, -0.5);
    } else {
      // 낙엽: 끝이 뾰족한 잎.
      path.moveTo(0, -0.5);
      path.quadraticCurveTo(0.44, -0.08, 0, 0.5);
      path.quadraticCurveTo(-0.44, -0.08, 0, -0.5);
    }
    this.shape = path;
    return path;
  }

  private drawShapes(
    ctx: Context2D,
    alpha: number,
    elapsed: number,
    size: AmbientSurfaceSize,
    dpr: number,
  ): void {
    const path = this.shapePath();
    if (!path) return;
    const leaf = this.spec.style === "leaf";
    for (const particle of this.particles) {
      const opacity = ambientParticleOpacity(particle, this.spec, elapsed, size.height) * alpha;
      if (opacity <= 0.01) continue;
      // 뒤집힘: 가로 폭을 cos로 줄여 입체적으로 팔랑이게 한다.
      const flip = Math.cos(particle.flip);
      const scaleX = (flip < 0 ? -1 : 1) * Math.max(0.22, Math.abs(flip)) * particle.size;
      const scaleY = particle.size;
      const cos = Math.cos(particle.rotation);
      const sin = Math.sin(particle.rotation);
      ctx.setTransform(
        dpr * cos * scaleX,
        dpr * sin * scaleX,
        -dpr * sin * scaleY,
        dpr * cos * scaleY,
        dpr * particle.x,
        dpr * particle.y,
      );
      ctx.globalAlpha = opacity;
      ctx.fillStyle = particle.color;
      ctx.fill(path);
      if (leaf) {
        // 잎맥과 꼭지.
        ctx.globalAlpha = opacity * 0.45;
        ctx.strokeStyle = "rgba(255, 244, 220, 0.9)";
        ctx.lineWidth = 0.07;
        ctx.beginPath();
        ctx.moveTo(0, -0.42);
        ctx.lineTo(0, 0.62);
        ctx.stroke();
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private drawShootingStar(ctx: Context2D, alpha: number, elapsed: number): void {
    const star = this.shooting;
    if (!star) return;
    const t = (elapsed - star.startedAt) / SHOOTING_STAR_SECONDS;
    if (t < 0 || t > 1) return;
    const travelled = (elapsed - star.startedAt) * star.speed;
    const headX = star.x + star.dx * travelled;
    const headY = star.y + star.dy * travelled;
    const tailX = headX - star.dx * star.length;
    const tailY = headY - star.dy * star.length;
    const rgb = hexToRgb(this.spec.colors[0] ?? "#ffffff");
    const gradient = ctx.createLinearGradient(headX, headY, tailX, tailY);
    gradient.addColorStop(0, `rgba(${rgb}, 0.9)`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.globalAlpha = alpha * Math.sin(Math.PI * t);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(headX, headY);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------ */
/* 햇살 줄기                                                           */
/* ------------------------------------------------------------------ */

class SunRaysPainter implements AmbientLayerPainter {
  private image: HTMLCanvasElement | null = null;
  private originX = 0;
  private originY = 0;

  constructor(
    private readonly spec: AmbientSunRaysLayerSpec,
    private readonly random: AmbientRandom,
  ) {}

  rebuild(size: AmbientSurfaceSize): void {
    const left = this.spec.corner === "top-left";
    this.originX = left ? -size.width * 0.05 : size.width * 1.05;
    this.originY = -size.height * 0.12;
    this.image = this.render(size);
  }

  advance(): void {
    // 햇살은 그릴 때 시간에 따라 숨쉬듯 밝기와 각도만 바꾼다.
  }

  draw(ctx: Context2D, alpha: number, elapsed: number, size: AmbientSurfaceSize, dpr: number): void {
    if (!this.image) return;
    // 아주 천천히 흔들리고(±0.7°) 밝기가 숨쉬듯 변한다.
    const angle = Math.sin(elapsed * 0.12) * 0.012;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const { originX: ox, originY: oy } = this;
    ctx.setTransform(
      dpr * cos,
      dpr * sin,
      -dpr * sin,
      dpr * cos,
      dpr * (ox - ox * cos + oy * sin),
      dpr * (oy - ox * sin - oy * cos),
    );
    ctx.globalCompositeOperation = this.spec.additive ? "lighter" : "source-over";
    ctx.globalAlpha = alpha * (0.8 + 0.2 * Math.sin(elapsed * 0.35));
    ctx.drawImage(this.image, 0, 0, size.width, size.height);
    ctx.globalCompositeOperation = "source-over";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private render(size: AmbientSurfaceSize): HTMLCanvasElement | null {
    const canvas = createCanvas(size.width * SUNRAY_IMAGE_SCALE, size.height * SUNRAY_IMAGE_SCALE);
    const g = context2d(canvas);
    if (!g) return null;
    g.scale(SUNRAY_IMAGE_SCALE, SUNRAY_IMAGE_SCALE);
    const { width, height } = size;
    const { rgb, opacity, beams } = this.spec;
    const ox = this.originX;
    const oy = this.originY;
    // 모서리 광원: 해가 있는 쪽 모서리만 은은하게 밝힌다.
    const glow = g.createRadialGradient(ox, oy, 0, ox, oy, Math.min(width, height) * 0.62);
    glow.addColorStop(0, `rgba(${rgb}, ${opacity * 1.15})`);
    glow.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = glow;
    g.fillRect(0, 0, width, height);
    // 줄기: 모서리에서 화면 안쪽 대각선으로 부채꼴처럼 퍼진다.
    const reach = Math.hypot(width, height) * 1.1;
    const center = this.spec.corner === "top-left" ? Math.PI * 0.3 : Math.PI * 0.7;
    const spread = Math.PI * 0.22;
    for (let index = 0; index < beams; index += 1) {
      const t = beams === 1 ? 0.5 : index / (beams - 1);
      const angle = center + (t - 0.5) * spread + (this.random() - 0.5) * 0.05;
      const half = 0.016 + this.random() * 0.03;
      const beamOpacity = opacity * (0.55 + this.random() * 0.45);
      const gradient = g.createLinearGradient(
        ox,
        oy,
        ox + Math.cos(angle) * reach,
        oy + Math.sin(angle) * reach,
      );
      gradient.addColorStop(0, `rgba(${rgb}, ${beamOpacity})`);
      gradient.addColorStop(0.45, `rgba(${rgb}, ${beamOpacity * 0.38})`);
      gradient.addColorStop(1, `rgba(${rgb}, 0)`);
      g.fillStyle = gradient;
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(ox + Math.cos(angle - half) * reach, oy + Math.sin(angle - half) * reach);
      g.lineTo(ox + Math.cos(angle + half) * reach, oy + Math.sin(angle + half) * reach);
      g.closePath();
      g.fill();
    }
    return canvas;
  }
}

/* ------------------------------------------------------------------ */
/* 구름                                                                */
/* ------------------------------------------------------------------ */

interface CloudInstance {
  x: number;
  y: number;
  readonly width: number;
  readonly height: number;
  readonly speed: number;
  readonly opacity: number;
  readonly sprite: HTMLCanvasElement;
}

/** 구름 스프라이트 기준 크기(px). */
const CLOUD_SPRITE_WIDTH = 360;
const CLOUD_SPRITE_HEIGHT = 150;
const CLOUD_VARIANTS = 3;

class CloudPainter implements AmbientLayerPainter {
  private clouds: CloudInstance[] = [];
  private sprites: HTMLCanvasElement[] | null = null;

  constructor(
    private readonly spec: AmbientCloudLayerSpec,
    private readonly random: AmbientRandom,
  ) {}

  rebuild(size: AmbientSurfaceSize): void {
    this.sprites ??= Array.from({ length: CLOUD_VARIANTS }, () => this.renderSprite()).filter(
      (sprite): sprite is HTMLCanvasElement => sprite !== null,
    );
    const sprites = this.sprites;
    if (sprites.length === 0) {
      this.clouds = [];
      return;
    }
    // 좁은 화면에서는 구름도 작게: 기준 폭 1440px 대비.
    const widthScale = Math.min(1.1, Math.max(0.5, size.width / 1440));
    this.clouds = Array.from({ length: this.spec.count }, (_, index) => {
      const scale = pick(this.random, this.spec.scale) * widthScale;
      const width = CLOUD_SPRITE_WIDTH * scale;
      const height = CLOUD_SPRITE_HEIGHT * scale;
      // 처음에는 화면 폭에 고르게 나눠 배치해 한쪽에 몰리지 않게 한다.
      const slot = (size.width + width) / this.spec.count;
      return {
        x: -width + slot * index + this.random() * slot * 0.6,
        y: this.cloudY(size, height),
        width,
        height,
        speed: pick(this.random, this.spec.speed) * (0.75 + scale * 0.3),
        opacity: pick(this.random, this.spec.opacity),
        sprite: sprites[index % sprites.length] ?? sprites[0],
      };
    });
  }

  advance(dt: number, _elapsed: number, size: AmbientSurfaceSize): void {
    for (const cloud of this.clouds) {
      cloud.x += cloud.speed * dt;
      if (cloud.x > size.width + 24) {
        cloud.x = -cloud.width - this.random() * size.width * 0.25;
        cloud.y = this.cloudY(size, cloud.height);
      }
    }
  }

  draw(ctx: Context2D, alpha: number, _elapsed: number, _size: AmbientSurfaceSize, dpr: number): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    for (const cloud of this.clouds) {
      ctx.globalAlpha = cloud.opacity * alpha;
      ctx.drawImage(cloud.sprite, cloud.x, cloud.y, cloud.width, cloud.height);
    }
  }

  private cloudY(size: AmbientSurfaceSize, height: number): number {
    return this.random() * size.height * this.spec.band - height * 0.35;
  }

  /** 겹친 둥근 덩어리로 구름 실루엣을 만든다(가장자리만 부드럽고 몸통은 또렷하게). */
  private renderSprite(): HTMLCanvasElement | null {
    const canvas = createCanvas(CLOUD_SPRITE_WIDTH, CLOUD_SPRITE_HEIGHT);
    const g = context2d(canvas);
    if (!g) return null;
    const { rgb } = this.spec;
    const puffs = 5 + Math.floor(this.random() * 3);
    for (let index = 0; index < puffs; index += 1) {
      const t = index / (puffs - 1);
      const arch = Math.sin(Math.PI * t);
      const cx = CLOUD_SPRITE_WIDTH * (0.17 + 0.66 * t) + (this.random() - 0.5) * 18;
      const cy = CLOUD_SPRITE_HEIGHT * (0.64 - arch * 0.2) + (this.random() - 0.5) * 8;
      const radius = CLOUD_SPRITE_HEIGHT * (0.24 + arch * 0.2) + this.random() * 8;
      const gradient = g.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, `rgba(${rgb}, 0.95)`);
      gradient.addColorStop(0.62, `rgba(${rgb}, 0.8)`);
      gradient.addColorStop(1, `rgba(${rgb}, 0)`);
      g.fillStyle = gradient;
      g.beginPath();
      g.arc(cx, cy, radius, 0, Math.PI * 2);
      g.fill();
    }
    return canvas;
  }
}

/* ------------------------------------------------------------------ */
/* 번개 번쩍임(광과민 안전: 드물게·낮은 알파·단일 펄스)                    */
/* ------------------------------------------------------------------ */

class FlashPainter implements AmbientLayerPainter {
  private nextAt: number;
  private startedAt: number | null = null;
  private centerX = 0.5;

  constructor(
    private readonly spec: AmbientFlashLayerSpec,
    private readonly random: AmbientRandom,
  ) {
    // 첫 번쩍임도 최소 간격 뒤에만 온다.
    this.nextAt = this.nextInterval();
  }

  rebuild(): void {
    // 크기와 무관한 상태만 가진다.
  }

  advance(_dt: number, elapsed: number): void {
    if (this.startedAt === null) {
      if (elapsed >= this.nextAt) {
        this.startedAt = elapsed;
        this.centerX = 0.2 + this.random() * 0.6;
      }
      return;
    }
    if (elapsed - this.startedAt > FLASH_RISE_SECONDS + FLASH_DECAY_SECONDS) {
      this.startedAt = null;
      this.nextAt = elapsed + this.nextInterval();
    }
  }

  draw(ctx: Context2D, alpha: number, elapsed: number, size: AmbientSurfaceSize, dpr: number): void {
    if (this.startedAt === null) return;
    const t = elapsed - this.startedAt;
    const envelope = t < FLASH_RISE_SECONDS
      ? t / FLASH_RISE_SECONDS
      : Math.max(0, 1 - (t - FLASH_RISE_SECONDS) / FLASH_DECAY_SECONDS);
    const peak = Math.min(this.spec.peakOpacity, AMBIENT_FLASH_MAX_OPACITY);
    const opacity = peak * envelope * alpha;
    if (opacity <= 0.002) return;
    const cx = size.width * this.centerX;
    const cy = -size.height * 0.15;
    const radius = Math.max(size.width, size.height) * 0.95;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `rgba(${this.spec.rgb}, ${opacity})`);
    gradient.addColorStop(0.55, `rgba(${this.spec.rgb}, ${opacity * 0.35})`);
    gradient.addColorStop(1, `rgba(${this.spec.rgb}, 0)`);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size.width, size.height);
  }

  private nextInterval(): number {
    return pick(this.random, { min: this.spec.minIntervalSeconds, max: this.spec.maxIntervalSeconds });
  }
}

function createPainter(spec: AmbientLayerSpec, random: AmbientRandom): AmbientLayerPainter {
  switch (spec.type) {
    case "particles":
      return new ParticlePainter(spec, random);
    case "sunrays":
      return new SunRaysPainter(spec, random);
    case "clouds":
      return new CloudPainter(spec, random);
    case "flash":
      return new FlashPainter(spec, random);
  }
}

/* ------------------------------------------------------------------ */
/* 렌더러                                                              */
/* ------------------------------------------------------------------ */

interface LayerEntry {
  readonly painter: AmbientLayerPainter;
  fade: number;
  target: 0 | 1;
}

function observeWindowResize(onResize: () => void): () => void {
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}

/** 서서히 나타나고 사라질 때 끝이 부드럽도록. */
function easeFade(value: number): number {
  return value * value * (3 - 2 * value);
}

export class AmbientRenderer {
  private entries: LayerEntry[] = [];
  private source: AmbientLayerSource | null = null;
  private size: AmbientSurfaceSize = { width: 0, height: 0 };
  private dpr = 1;
  private rafId: number | null = null;
  private running = false;
  private clockReset = true;
  private lastFrameAt = 0;
  private elapsed = 0;
  private disposed = false;
  private readonly random: AmbientRandom;
  private readonly maxDpr: number;
  private readonly unobserveResize: () => void;

  /** 2D 컨텍스트를 만들 수 없으면 null. */
  static create(canvas: HTMLCanvasElement, options: AmbientRendererOptions): AmbientRenderer | null {
    const ctx = context2d(canvas);
    return ctx ? new AmbientRenderer(canvas, ctx, options) : null;
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: Context2D,
    private readonly options: AmbientRendererOptions,
  ) {
    this.random = options.random ?? Math.random;
    this.maxDpr = options.maxDpr ?? 2;
    this.resize();
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.unobserveResize = (options.observeResize ?? observeWindowResize)(() => this.resize());
  }

  /** 현재 그리기 영역 크기(CSS px). */
  get surfaceSize(): AmbientSurfaceSize {
    return this.size;
  }

  /** 현재 레이어 수(사라지는 중인 레이어 포함). */
  get layerCount(): number {
    return this.entries.length;
  }

  /** 반복 루프가 예약되어 있는지. */
  get animating(): boolean {
    return this.rafId !== null;
  }

  /**
   * 새 장면으로 바꾼다. 이전 레이어는 서서히 사라지고 새 레이어가 서서히 나타난다.
   * immediate면 페이드 없이 바로 바꾼다(정지 미리보기 등).
   */
  setLayerSource(source: AmbientLayerSource, options: { readonly immediate?: boolean } = {}): void {
    if (this.disposed) return;
    this.source = source;
    for (const entry of this.entries) entry.target = 0;
    if (options.immediate) this.entries = [];
    for (const spec of source(this.size)) {
      const painter = createPainter(spec, this.random);
      painter.rebuild(this.size);
      this.entries.push({ painter, fade: options.immediate ? 1 : 0, target: 1 });
    }
    if (this.running) this.scheduleFrame();
  }

  /** 모든 레이어를 서서히 없앤다. 다 사라지면 루프가 멈춘다. */
  clear(): void {
    this.source = null;
    for (const entry of this.entries) entry.target = 0;
    if (this.running) this.scheduleFrame();
  }

  start(): void {
    if (this.disposed || this.running) return;
    this.running = true;
    this.clockReset = true;
    this.scheduleFrame();
  }

  stop(): void {
    this.running = false;
    this.cancelFrame();
  }

  /** 움직이지 않는 한 장면을 그린다(움직임 줄이기 사용자의 미리보기). */
  renderStill(elapsedSeconds = 1.5): void {
    if (this.disposed) return;
    this.entries = this.entries.filter((entry) => entry.target === 1);
    for (const entry of this.entries) entry.fade = 1;
    this.elapsed = elapsedSeconds;
    this.draw();
  }

  resize(): void {
    if (this.disposed) return;
    const measured = this.options.measure();
    const width = Math.max(1, Math.round(measured.width));
    const height = Math.max(1, Math.round(measured.height));
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), this.maxDpr);
    const previous = this.size;
    if (width === previous.width && height === previous.height && dpr === this.dpr) return;
    this.size = { width, height };
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    const previousArea = previous.width * previous.height;
    const areaChange = previousArea > 0 ? Math.abs(width * height - previousArea) / previousArea : 1;
    if ((width !== previous.width || areaChange > REBUILD_AREA_RATIO) && this.source) {
      // 넓이에 따라 개수가 달라지므로 새 명세로 즉시 다시 만든다.
      this.entries = this.entries.filter((entry) => entry.target === 1);
      const fades = this.entries.map((entry) => entry.fade);
      this.entries = this.source(this.size).map((spec, index) => {
        const painter = createPainter(spec, this.random);
        painter.rebuild(this.size);
        return { painter, fade: fades[index] ?? 1, target: 1 };
      });
    }
    // 캔버스 크기를 바꾸면 내용이 지워지므로 멈춰 있으면 한 번 다시 그린다.
    if (!this.running) this.draw();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.unobserveResize();
    this.entries = [];
    this.source = null;
  }

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.cancelFrame();
    } else if (this.running) {
      this.clockReset = true;
      this.scheduleFrame();
    }
  };

  private scheduleFrame(): void {
    if (this.disposed || !this.running || this.rafId !== null) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (this.entries.length === 0) return;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private cancelFrame(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private readonly tick = (now: number): void => {
    this.rafId = null;
    if (this.disposed || !this.running) return;
    if (this.clockReset) {
      this.clockReset = false;
      this.lastFrameAt = now - 1000 / 60;
    }
    const sinceLast = now - this.lastFrameAt;
    if (sinceLast < MIN_FRAME_INTERVAL_MS) {
      this.scheduleFrame();
      return;
    }
    const dt = Math.min(sinceLast / 1000, MAX_STEP_SECONDS);
    this.lastFrameAt = now;
    this.elapsed += dt;
    this.advance(dt);
    this.draw();
    this.scheduleFrame();
  };

  private advance(dt: number): void {
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      const entry = this.entries[index];
      if (!entry) continue;
      entry.fade = entry.target === 1
        ? Math.min(1, entry.fade + dt / FADE_SECONDS)
        : Math.max(0, entry.fade - dt / FADE_SECONDS);
      if (entry.target === 0 && entry.fade <= 0) {
        this.entries.splice(index, 1);
        continue;
      }
      entry.painter.advance(dt, this.elapsed, this.size);
    }
  }

  private draw(): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const entry of this.entries) {
      if (entry.fade <= 0) continue;
      entry.painter.draw(ctx, easeFade(entry.fade), this.elapsed, this.size, this.dpr);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
