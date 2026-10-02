/**
 * 이동 게임필 연출 런타임(main Track B 캔버스 연결 이식).
 *
 * 발밑 먼지·발걸음 조각·급정지 퍼프·미끄럼 먼지·달리기 잔상·이모트 파티클을 그린다.
 * - 개수와 시점은 footsteps·movement-particles 순수 모듈의 규칙 함수를 그대로 쓴다.
 * - 파티클 이미터 하나와 잔상 스프라이트 4개 풀을 재사용해 매 프레임 객체를 만들지 않는다.
 * - 모션 줄이기(또는 게임필 설정의 OS 연동)에서는 규칙 함수가 0을 돌려줘 아무것도 내지 않는다.
 * - 색은 바닥 재질의 픽셀 아트 팔레트다(UI 색이 아니므로 CSS 토큰을 쓰지 않는다).
 */
import type * as Phaser from "phaser";

import { CAMPUS_TERRAIN, type StudioCampusTerrain } from "./studio-virtual-space-campus-blueprint";
import {
  studioDustSpawnCount,
  studioFootstepSurfaceSpec,
  type StudioFootstepSurface,
} from "./studio-virtual-space-footsteps";
import type { StudioVirtualTerrainKind } from "./studio-virtual-space-living-world";
import { skidIntensity } from "./studio-virtual-space-locomotion-feel";
import {
  STUDIO_AFTERIMAGE_INTERVAL_MS,
  STUDIO_AFTERIMAGE_LIFETIME_MS,
  studioAfterimageFastEnough,
  studioLandingPuffCount,
  studioSkidDustAmount,
} from "./studio-virtual-space-movement-particles";
import type { StudioWorldTilemap } from "@toonstudio/studio-project-model/world-publication";

/** 규칙 함수가 맞춰진 기준 달리기 속도(main 기본 걷기 205px/s × 달리기 1.35). 아바타별 속도를 이 기준으로 정규화한다. */
export const STUDIO_MOTION_FEEL_REFERENCE_SPRINT = 205 * 1.35;

export interface StudioMotionFeelSurface {
  readonly surface: StudioFootstepSurface;
  /** 먼지 색(0xRRGGBB). */
  readonly color: number;
}

function surface(kind: StudioFootstepSurface, color: number): StudioMotionFeelSurface {
  return Object.freeze({ surface: kind, color });
}

/** 캠퍼스 바닥 재질 → 발소리 표면과 먼지 색. 모래·조약돌은 먼지가 많고 카펫·잔디는 보풀이 적다. */
const CAMPUS_SURFACES: Readonly<Record<StudioCampusTerrain, StudioMotionFeelSurface>> = Object.freeze({
  [CAMPUS_TERRAIN.grass]: surface("carpet", 0x9cc47c),
  [CAMPUS_TERRAIN.slate]: surface("tile", 0xc9ced6),
  [CAMPUS_TERRAIN.plank]: surface("wood", 0xc9a06a),
  [CAMPUS_TERRAIN.water]: surface("tile", 0xbfeeff),
  [CAMPUS_TERRAIN.cobble]: surface("tile", 0xdcd4c6),
  [CAMPUS_TERRAIN.marble]: surface("tile", 0xece7df),
  [CAMPUS_TERRAIN.walnut]: surface("wood", 0xb08458),
  [CAMPUS_TERRAIN.sand]: surface("tile", 0xe8cf9a),
  [CAMPUS_TERRAIN.oak]: surface("wood", 0xc9a06a),
  [CAMPUS_TERRAIN.lightWood]: surface("wood", 0xd8b98a),
  [CAMPUS_TERRAIN.redWood]: surface("wood", 0xb3754f),
  [CAMPUS_TERRAIN.stage]: surface("wood", 0xa59ad8),
  [CAMPUS_TERRAIN.shellSand]: surface("tile", 0xefdcb2),
  [CAMPUS_TERRAIN.lavender]: surface("carpet", 0xc7b6ee),
  [CAMPUS_TERRAIN.carpet]: surface("carpet", 0xd8a3a0),
  [CAMPUS_TERRAIN.mosaic]: surface("tile", 0xd9d0c0),
});

function hexColor(value: string): number {
  const parsed = Number.parseInt(value.replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : 0xe8e4da;
}

const TERRAIN_SURFACES: Readonly<Record<StudioVirtualTerrainKind, StudioMotionFeelSurface>> = Object.freeze({
  grass: surface("carpet", 0x9cc47c),
  path: surface("wood", hexColor(studioFootstepSurfaceSpec("wood").particleColor)),
  stone: surface("tile", hexColor(studioFootstepSurfaceSpec("tile").particleColor)),
  bridge: surface("wood", hexColor(studioFootstepSurfaceSpec("wood").particleColor)),
  boardwalk: surface("wood", hexColor(studioFootstepSurfaceSpec("wood").particleColor)),
  "shallow-water": surface("tile", 0xbfeeff),
});

/** 일반 월드의 지형 종류 → 표면(main 캔버스의 footstepSurfaceForTerrain과 같은 분류). */
export function studioMotionFeelTerrainSurface(kind: StudioVirtualTerrainKind): StudioMotionFeelSurface {
  return TERRAIN_SURFACES[kind];
}

const TILE_FLAGS = 0xe0000000;

/**
 * 캠퍼스 타일맵에서 발밑 재질을 읽는다. 위 레이어(구역 바닥)가 비었으면 아래 레이어(섬 잔디)를 본다.
 * 캠퍼스 아틀라스(firstGid 1)가 아니거나 범위 밖이면 null.
 */
export function studioCampusFloorSurface(tilemap: StudioWorldTilemap, x: number, y: number): StudioMotionFeelSurface | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const column = Math.floor(x / tilemap.tileWidth);
  const row = Math.floor(y / tilemap.tileHeight);
  if (column < 0 || row < 0 || column >= tilemap.width || row >= tilemap.height) return null;
  const index = row * tilemap.width + column;
  for (let layer = tilemap.layers.length - 1; layer >= 0; layer -= 1) {
    const gid = ((tilemap.layers[layer]!.data[index] ?? 0) & ~TILE_FLAGS) >>> 0;
    if (gid <= 0) continue;
    return CAMPUS_SURFACES[(gid - 1) as StudioCampusTerrain] ?? null;
  }
  return null;
}

/** 캔버스가 한 번 만들어 매 프레임 값만 바꿔 넣는 입력. */
export interface StudioMotionFeelFrame {
  time: number;
  deltaSeconds: number;
  /** 발밑(화면 투영) 좌표와 그 깊이. */
  x: number;
  y: number;
  depth: number;
  speed: number;
  /** 이 아바타의 달리기 최고 속도(지형 배율 포함). */
  sprintSpeed: number;
  /** 지금 입력이 요구하는 속도. 입력을 놓아 0이면 급정지 미끄럼으로 본다. */
  inputSpeed: number;
  surface: StudioMotionFeelSurface;
  /** 0~1. 게임필 설정 × 품질 단계 배율. */
  particleDensity: number;
  reducedMotion: boolean;
}

export function createStudioMotionFeelFrame(): StudioMotionFeelFrame {
  return {
    time: 0, deltaSeconds: 0, x: 0, y: 0, depth: 0, speed: 0, sprintSpeed: STUDIO_MOTION_FEEL_REFERENCE_SPRINT,
    inputSpeed: 0, surface: TERRAIN_SURFACES.path, particleDensity: 1, reducedMotion: false,
  };
}

type MotionFeelScene = Pick<Phaser.Scene, "add" | "make" | "textures">;

const DUST_TEXTURE = "studio-move-dust";
const GHOST_POOL_SIZE = 4;
const GHOST_ALPHA = 0.32;
const GHOST_TINT = 0xbfe3ff;
const LANDING_COLOR = 0xe8e4da;
/** 이동 중 보폭이 64px를 넘게 튀면(순간이동·보정) 발걸음으로 세지 않는다. */
const MAX_STEP_DELTA = 64;

interface Ghost {
  readonly sprite: Phaser.GameObjects.Sprite;
  bornAt: number;
  lifetime: number;
}

export class StudioMotionFeelRuntime {
  private readonly emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly ghosts: Ghost[] = [];
  private ghostCursor = 0;
  private nextGhostAt = 0;
  private previousSpeed = 0;
  private skidCarry = 0;
  private stepRemaining = 0;
  private lastX = Number.NaN;
  private lastY = Number.NaN;

  constructor(scene: MotionFeelScene) {
    if (!scene.textures.exists(DUST_TEXTURE)) {
      const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
      graphics.fillStyle(0xffffff, 1).fillCircle(8, 8, 7);
      graphics.fillStyle(0xffffff, 0.45).fillCircle(8, 8, 8);
      graphics.generateTexture(DUST_TEXTURE, 16, 16);
      graphics.destroy();
    }
    this.emitter = scene.add.particles(0, 0, DUST_TEXTURE, {
      speed: { min: 18, max: 70 },
      lifespan: 480,
      scale: { start: 0.55, end: 0 },
      alpha: { start: 0.55, end: 0 },
      quantity: 0,
      emitting: false,
    });
    for (let index = 0; index < GHOST_POOL_SIZE; index += 1) {
      this.ghosts.push({ sprite: scene.add.sprite(0, 0, DUST_TEXTURE).setVisible(false).setTint(GHOST_TINT), bornAt: 0, lifetime: 1 });
    }
  }

  /** 발밑 효과를 한 프레임 진행한다. source는 잔상으로 복제할 내 캐릭터 스프라이트다. */
  step(frame: StudioMotionFeelFrame, source: Phaser.GameObjects.Sprite | null): void {
    this.fadeGhosts(frame.time);
    const scale = STUDIO_MOTION_FEEL_REFERENCE_SPRINT / Math.max(1, frame.sprintSpeed);
    const speed = frame.speed * scale;
    const density = frame.reducedMotion ? 0 : Math.min(1, Math.max(0, frame.particleDensity));
    const moved = Number.isFinite(this.lastX) ? Math.hypot(frame.x - this.lastX, frame.y - this.lastY) : 0;
    this.lastX = frame.x;
    this.lastY = frame.y;
    this.emitter.setDepth(frame.depth - 2);
    // 1) 이동 먼지: 속도·표면·밀도에 비례(규칙: studioDustSpawnRule).
    const dust = density > 0 ? studioDustSpawnCount(speed, frame.surface.surface, density, frame.reducedMotion, frame.deltaSeconds) : 0;
    if (dust > 0) this.emit(dust, frame.x, frame.y + 3, frame.surface.color);
    // 2) 발걸음 조각: 표면 보폭마다 한 알(규칙: stepStudioFootsteps).
    if (density > 0 && moved > 0 && moved < MAX_STEP_DELTA && speed >= 8) {
      const stride = studioFootstepSurfaceSpec(frame.surface.surface).stridePx;
      this.stepRemaining -= moved;
      while (this.stepRemaining < 0) {
        this.stepRemaining += stride;
        this.emit(1, frame.x, frame.y + 2, frame.surface.color);
      }
    }
    // 3) 미끄럼 먼지: 입력을 놓아 급감속할 때(규칙: stepStudioSkidDust).
    const skid = skidIntensity(frame.speed, frame.inputSpeed, frame.sprintSpeed);
    this.skidCarry += density > 0 ? studioSkidDustAmount(skid, speed, frame.deltaSeconds, frame.reducedMotion) * density : 0;
    if (density <= 0 || skid < 0.15) this.skidCarry = 0;
    const skidCount = Math.floor(this.skidCarry);
    if (skidCount > 0) {
      this.skidCarry -= skidCount;
      this.emit(skidCount, frame.x, frame.y + 4, frame.surface.color);
    }
    // 4) 급정지 퍼프(규칙: stepStudioLandingPuff).
    const puff = density > 0 ? studioLandingPuffCount(this.previousSpeed, speed, frame.reducedMotion) : 0;
    this.previousSpeed = speed;
    if (puff > 0) this.emit(Math.max(1, Math.round(puff * density)), frame.x, frame.y + 4, LANDING_COLOR);
    // 5) 달리기 잔상: 달리기 최고속 80% 이상에서 90ms마다(규칙: stepStudioRunAfterimage).
    if (frame.reducedMotion || !studioAfterimageFastEnough(frame.speed, frame.sprintSpeed)) {
      if (this.nextGhostAt > frame.time) this.nextGhostAt = frame.time;
    } else if (frame.time >= this.nextGhostAt && source) {
      this.nextGhostAt = frame.time + STUDIO_AFTERIMAGE_INTERVAL_MS;
      this.spawnGhost(source, frame.time);
    }
  }

  /** 머리 위 이모트·상호작용 연출용 짧은 파티클 터뜨림. 모션 줄이기에서는 호출하지 않는다. */
  burst(x: number, y: number, depth: number, count: number, color: number): void {
    if (count <= 0) return;
    this.emitter.setDepth(depth);
    this.emit(count, x, y, color);
  }

  destroy(): void {
    this.emitter.destroy();
    for (const ghost of this.ghosts) ghost.sprite.destroy();
    this.ghosts.length = 0;
  }

  private emit(count: number, x: number, y: number, color: number): void {
    this.emitter.setParticleTint(color);
    this.emitter.explode(count, x, y);
  }

  private spawnGhost(source: Phaser.GameObjects.Sprite, time: number): void {
    const ghost = this.ghosts[this.ghostCursor];
    if (!ghost) return;
    this.ghostCursor = (this.ghostCursor + 1) % this.ghosts.length;
    ghost.bornAt = time;
    ghost.lifetime = STUDIO_AFTERIMAGE_LIFETIME_MS;
    ghost.sprite.setTexture(source.texture.key, source.frame.name)
      .setOrigin(source.originX, source.originY)
      .setDisplaySize(source.displayWidth, source.displayHeight)
      .setFlipX(source.flipX)
      .setPosition(source.x, source.y)
      .setDepth(source.depth - 1)
      .setAlpha(GHOST_ALPHA)
      .setVisible(true);
  }

  private fadeGhosts(time: number): void {
    for (const ghost of this.ghosts) {
      if (!ghost.sprite.visible) continue;
      const progress = (time - ghost.bornAt) / ghost.lifetime;
      if (progress >= 1 || progress < 0) { ghost.sprite.setVisible(false); continue; }
      // Cubic ease-out으로 빠르게 옅어진다.
      ghost.sprite.setAlpha(GHOST_ALPHA * Math.pow(1 - progress, 3));
    }
  }
}
