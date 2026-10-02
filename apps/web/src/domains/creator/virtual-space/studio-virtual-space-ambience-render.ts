/**
 * 가상 스튜디오 앰비언스 렌더 소비처 (날씨 파티클·NPC/동물 순찰)
 *
 * 트랙 D에서 완성한 순수 로직 엔진 두 개(날씨 파티클 엔진
 * `studio-virtual-space-weather-particles`, 앰비언트 순찰
 * `studio-virtual-space-ambient-patrol`)의 유일한 렌더 소비처다.
 * 엔진은 상태를 계산만 하고, 이 런타임이 Phaser 스프라이트로 그린다.
 *
 * - 날씨: 비·눈·벚꽃잎 파티클을 파티클 id 키 풀로 동기화한다.
 *   예전 living world의 드리프트 스프라이트 12개는 이 런타임이 대체하므로
 *   living world에서 제거했다 (날씨 렌더 경로는 여기 하나만 남는다).
 *   전면 dim 오버레이나 블러는 쓰지 않는다 — 파티클 스프라이트만 그린다.
 * - 순찰: NPC 가이드 1명과 동물 5종이 플라자 주변을 실제로 돌아다닌다.
 *   비·눈이 오면 집으로 대피하고 밤이면 집에서 쉬는 모드는 순찰 엔진이
 *   판정하고, 이 런타임은 포즈를 스프라이트로 반영만 한다.
 *   순찰 배우는 플레이어와 충돌하지 않는다 (엔진이 보장을 제공한다).
 * - reduced-motion: 날씨 엔진이 풀을 비우고(목표 0), 순찰 엔진이 배우를
 *   정지시키며, 동물 프레임도 정지 프레임으로 고정한다.
 */

import type * as Phaser from "phaser";
import {
  buildStudioAnimalSpriteSheet,
  STUDIO_ANIMAL_SPRITE_KINDS,
  type StudioAnimalSpriteKind,
} from "./studio-virtual-space-animal-sprites";
import {
  createStudioAmbientPatrol,
  stepStudioAmbientPatrol,
  type StudioAmbientPatrolActorSpec,
  type StudioAmbientPatrolPose,
  type StudioAmbientPatrolState,
} from "./studio-virtual-space-ambient-patrol";
import type { StudioCharacterMotionState, StudioCharacterSkin } from "./studio-virtual-space-character-skins";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioParticle } from "./studio-virtual-space-particles";
import {
  buildStudioParticleSprite,
  type StudioParticleSpriteKind,
} from "./studio-virtual-space-particle-sprites";
import type { StudioSpaceObstacle } from "./studio-virtual-space-physics";
import { STUDIO_CHARACTER_FOOT_ORIGIN } from "./studio-virtual-space-presentation";
import { studioProjectTownPoint, studioTownDepthForPoint } from "./studio-virtual-space-semantic-world";
import type { StudioWeatherCondition } from "./studio-virtual-space-weather";
import {
  createStudioWeatherParticleState,
  stepStudioWeatherParticles,
  type StudioWeatherParticleCondition,
  type StudioWeatherParticleState,
  type StudioWeatherParticleViewport,
} from "./studio-virtual-space-weather-particles";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

/** 날씨 파티클 스프라이트 깊이. 주야 틴트(41_000) 위, 이름표·말풍선 아래의 기존 날씨 층과 같다. */
export const STUDIO_AMBIENCE_WEATHER_DEPTH = 42_000;

/** 날씨 엔진이 만들어 내는 파티클 종류 (스프라이트 시트를 미리 올리는 대상). */
export const STUDIO_WEATHER_PARTICLE_SPRITE_KINDS: readonly StudioParticleSpriteKind[] = Object.freeze([
  "raindrop", "snowflake", "petal",
]);

/** 종류별 스프라이트 프레임 수. `studio-virtual-space-particle-sprites`의 메타와 맞춘다. */
const WEATHER_PARTICLE_FRAMES: Readonly<Partial<Record<StudioParticleSpriteKind, number>>> = Object.freeze({
  raindrop: 2,
  snowflake: 2,
  petal: 3,
});

/** 날씨 파티클 텍스처 키. */
export function studioWeatherParticleTextureKey(kind: StudioParticleSpriteKind): string {
  return `studio-weather-particle-${kind}`;
}

/** 앰비언트 동물 텍스처 키. */
export function studioAmbientAnimalTextureKey(kind: StudioAnimalSpriteKind): string {
  return `studio-ambient-animal-${kind}`;
}

interface AmbienceTextureLoader {
  spritesheet(key: string, url: string, config: { frameWidth: number; frameHeight: number }): unknown;
}

/**
 * 날씨 파티클·동물 스프라이트 시트를 로더에 올린다.
 * 전부 기존 프로시저럴 빌더가 만드는 자체 에셋이라 외부 파일이 필요 없다.
 */
export function queueStudioAmbienceTextures(load: AmbienceTextureLoader): void {
  for (const kind of STUDIO_WEATHER_PARTICLE_SPRITE_KINDS) {
    const sprite = buildStudioParticleSprite(kind);
    load.spritesheet(studioWeatherParticleTextureKey(kind), sprite.dataUrl, {
      frameWidth: sprite.cell, frameHeight: sprite.cell,
    });
  }
  for (const kind of STUDIO_ANIMAL_SPRITE_KINDS) {
    const sheet = buildStudioAnimalSpriteSheet(kind);
    load.spritesheet(studioAmbientAnimalTextureKey(kind), sheet.dataUrl, {
      frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight,
    });
  }
}

/** 환경 설정 날씨 → 엔진 조건 + 순찰 날씨 매핑 결과. */
export interface StudioAmbienceCondition {
  /** 날씨 파티클 엔진 조건. 파티클이 없는 날씨면 null. */
  readonly particles: StudioWeatherParticleCondition | null;
  /** 순찰 대피 판정용 날씨. 벚꽃잎·맑음은 대피 사유가 아니므로 null. */
  readonly patrol: StudioWeatherCondition | null;
}

/**
 * 환경 패널의 날씨 선택(clear/rain/petals/snow)을 렌더 입력으로 바꾼다.
 * 벚꽃잎은 파티클만 내고 순찰 배우는 대피시키지 않는다.
 */
export function studioAmbienceCondition(weather: string): StudioAmbienceCondition {
  switch (weather) {
    case "rain": return Object.freeze({ particles: "rain", patrol: "rain" });
    case "snow": return Object.freeze({ particles: "snow", patrol: "snow" });
    case "petals": return Object.freeze({ particles: "petals", patrol: null });
    case "thunderstorm": return Object.freeze({ particles: "thunderstorm", patrol: "thunderstorm" });
    default: return Object.freeze({ particles: null, patrol: null });
  }
}

/** 파티클 하나의 렌더 스타일. */
export interface StudioWeatherParticleRenderStyle {
  readonly frame: number;
  readonly alpha: number;
  readonly displaySize: number;
  readonly rotation: number;
}

/**
 * 파티클 상태 → 프레임·알파·크기·회전을 계산한다 (순수 함수).
 * 알파는 등장 150ms 페이드인, 소멸 전 600ms 페이드아웃으로 갑작스러운
 * 등·퇴장을 감춘다. 빗방울은 떨어지는 방향으로 살짝 기울여 고정한다
 * (엔진의 무작위 회전을 쓰면 빗줄기가 제멋대로 돌아 보인다).
 */
export function studioWeatherParticleRenderStyle(particle: StudioParticle): StudioWeatherParticleRenderStyle {
  const frames = WEATHER_PARTICLE_FRAMES[particle.kind] ?? 1;
  const ageMs = Math.max(0, particle.ageMs);
  const frame = Math.floor(ageMs / 130) % frames;
  const fadeIn = Math.min(1, ageMs / 150);
  const fadeOut = Math.min(1, Math.max(0, particle.lifeMs - ageMs) / 600);
  return Object.freeze({
    frame,
    alpha: 0.9 * Math.min(fadeIn, fadeOut),
    displaySize: Math.max(4, particle.size * 1.8),
    rotation: particle.kind === "raindrop" ? -0.22 : particle.rotation,
  });
}

/** 동물 시트 행: down 0 · up 1 · side 2 (시트 빌더의 directions와 같다). */
function animalRow(direction: StudioAmbientPatrolPose["spriteDirection"]): number {
  if (direction === "up" || direction === "up-left" || direction === "up-right") return 1;
  if (direction === "left" || direction === "right") return 2;
  return 0;
}

/** 동물 스프라이트 프레임 선택 결과. */
export interface StudioAmbientAnimalRenderFrame {
  /** 시트 전체 프레임 인덱스 (행 × 7 + 열). */
  readonly frame: number;
  readonly flipX: boolean;
}

/**
 * 순찰 포즈 → 동물 시트 프레임을 고른다 (순수 함수).
 * 열: 걷기 0~3 (140ms 주기 순환), idle 4~6 (550ms 주기 순환).
 * reduced-motion이면 방향 행의 idle 첫 프레임으로 고정한다.
 * 왼쪽을 향하면 측면 행을 좌우 반전한다 (대각선은 상하 행이라 반전하지 않는다).
 */
export function studioAmbientAnimalFrame(
  pose: Pick<StudioAmbientPatrolPose, "spriteDirection" | "moving">,
  walkCycleMs: number,
  reducedMotion: boolean,
): StudioAmbientAnimalRenderFrame {
  const row = animalRow(pose.spriteDirection);
  const cycle = Math.max(0, walkCycleMs);
  const column = reducedMotion
    ? 4
    : pose.moving
      ? Math.floor(cycle / 140) % 4
      : 4 + (Math.floor(cycle / 550) % 3);
  return Object.freeze({
    frame: row * 7 + column,
    flipX: pose.spriteDirection === "left",
  });
}

/** 월드 콜라이더 → 순찰 물리 장애물. 순찰 배우가 가구를 통과하지 않게 한다. */
export function buildStudioAmbientPatrolObstacles(
  manifest: Pick<StudioVirtualSpaceWorldManifest, "colliders">,
): readonly StudioSpaceObstacle[] {
  return Object.freeze(manifest.colliders.map((rect) => Object.freeze({
    kind: "rect" as const, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
  })));
}

function clampPatrolPoint(point: StudioVirtualSpacePoint, manifest: StudioVirtualSpaceWorldManifest): StudioVirtualSpacePoint {
  const margin = 28;
  return Object.freeze({
    x: Math.min(manifest.width - margin, Math.max(margin, point.x)),
    y: Math.min(manifest.height - margin, Math.max(margin, point.y)),
  });
}

/**
 * 기본 순찰 배우 구성.
 * 기본 월드(일러스트)는 사람들이 모이는 플라자 주변 루프로 짜고,
 * 가구 콜라이더(분수·카페 테이블)를 피해 웨이포인트를 잡는다.
 * 타일맵 월드는 방 중심을 돌도록 파생한다 (방이 없으면 배우를 만들지 않는다).
 */
export function buildStudioAmbientPatrolSpecs(
  manifest: StudioVirtualSpaceWorldManifest,
): readonly StudioAmbientPatrolActorSpec[] {
  if (!manifest.tilemap) {
    const specs: StudioAmbientPatrolActorSpec[] = [
      { id: "ambient-guide", species: "npc", route: [
        { x: 700, y: 870 }, { x: 860, y: 860 }, { x: 860, y: 730 }, { x: 700, y: 740 },
      ] },
      { id: "ambient-cat", species: "cat", route: [
        { x: 430, y: 740 }, { x: 540, y: 740 }, { x: 540, y: 630 }, { x: 430, y: 630 },
      ] },
      { id: "ambient-fox", species: "fox", route: [
        { x: 880, y: 790 }, { x: 960, y: 700 }, { x: 900, y: 640 },
      ] },
      { id: "ambient-rabbit", species: "rabbit", route: [
        { x: 760, y: 520 }, { x: 870, y: 520 }, { x: 815, y: 405 },
      ] },
      { id: "ambient-bird", species: "bird", route: [
        { x: 300, y: 210 }, { x: 1000, y: 170 }, { x: 1120, y: 470 }, { x: 420, y: 470 },
      ] },
      { id: "ambient-butterfly", species: "butterfly", route: [
        { x: 450, y: 640 }, { x: 530, y: 705 }, { x: 475, y: 600 },
      ] },
    ];
    return Object.freeze(specs.map((spec) => Object.freeze({
      ...spec,
      route: Object.freeze(spec.route.map((point) => clampPatrolPoint(point, manifest))),
    })));
  }
  const speciesCycle: readonly StudioAmbientPatrolActorSpec["species"][] = Object.freeze([
    "npc", "cat", "fox", "rabbit", "bird", "butterfly",
  ]);
  return Object.freeze(manifest.rooms.slice(0, speciesCycle.length).map((room, index) => {
    const center = { x: room.x + room.width / 2, y: room.y + room.height / 2 };
    const route = [
      center,
      { x: center.x - room.width * 0.22, y: center.y },
      { x: center.x, y: center.y + room.height * 0.18 },
    ].map((point) => clampPatrolPoint(point, manifest));
    return Object.freeze({
      id: `ambient-room-${room.id}`,
      species: speciesCycle[index] ?? "cat",
      route: Object.freeze(route),
    });
  }));
}

/** 종류별 지상 기준 표시 크기 (시트 원본 64px 기준 축소). */
const ANIMAL_DISPLAY_SIZE: Readonly<Record<StudioAnimalSpriteKind, number>> = Object.freeze({
  cat: 46, dog: 48, fox: 48, bird: 40, butterfly: 30, rabbit: 44,
});

/** 공중을 나는 종류의 지면 대비 부유 높이. */
function flightHeight(species: StudioAmbientPatrolPose["species"]): number {
  if (species === "bird") return 30;
  if (species === "butterfly") return 16;
  return 0;
}

export interface StudioAmbienceRenderNpcOptions {
  readonly skin: StudioCharacterSkin;
  /** 스프라이트 생성 시 쓸 초기 텍스처 (캔버스의 폴백 체인으로 고른 에셋). */
  readonly textureKey: string;
  readonly textureFrame?: number;
  readonly visualWidth: number;
  readonly visualHeight: number;
  /** 캔버스의 캐릭터 비주얼 적용 함수(스킨·방향·모션 상태 → 텍스처/프레임). */
  readonly applyVisual: (
    sprite: Phaser.GameObjects.Sprite,
    skin: StudioCharacterSkin,
    facing: StudioVirtualSpaceFacing,
    state: StudioCharacterMotionState,
  ) => void;
}

export interface StudioAmbienceRenderUpdateInput {
  readonly time: number;
  readonly deltaMs: number;
  /** 날씨 파티클 스폰 영역 (카메라 worldView). */
  readonly viewport: StudioWeatherParticleViewport;
  readonly condition: StudioWeatherParticleCondition | null;
  /** 품질 등급 파티클 비율. 날씨가 꺼진 등급이면 0을 넘긴다. */
  readonly particleRatio: number;
  readonly reducedMotion: boolean;
  /** 순찰 대피 판정용 실날씨 (없으면 null). */
  readonly patrolWeather: StudioWeatherCondition | null;
  /** 주야 사이클 시각 비율 0~1. 사이클이 꺼져 있으면 null (스케줄 판정으로 대체). */
  readonly timeOfDay: number | null;
  /** 플레이어 위치들. 순찰 배우는 플레이어를 막지 않으므로 판정 참고용으로만 쓴다. */
  readonly players: readonly StudioVirtualSpacePoint[];
  /** 품질 등급에서 앰비언트 배우가 꺼져 있으면 false. */
  readonly ambientActorsEnabled: boolean;
}

interface ActorVisual {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Ellipse | null;
  walkCycleMs: number;
  distance: number;
  lastPoint: StudioVirtualSpacePoint | null;
}

/** 날씨 파티클 + 앰비언트 순찰 렌더 런타임. 생성·갱신·해제는 캔버스의 cleanup 체인을 따른다. */
export class StudioVirtualAmbienceRenderRuntime {
  private weatherState: StudioWeatherParticleState = createStudioWeatherParticleState();
  private readonly weatherSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private patrolState: StudioAmbientPatrolState;
  private readonly actorVisuals = new Map<string, ActorVisual>();
  private readonly obstacles: readonly StudioSpaceObstacle[];

  constructor(
    private readonly scene: Pick<Phaser.Scene, "add" | "textures">,
    private readonly manifest: StudioVirtualSpaceWorldManifest,
    private readonly npc: StudioAmbienceRenderNpcOptions,
  ) {
    this.obstacles = buildStudioAmbientPatrolObstacles(manifest);
    const specs = buildStudioAmbientPatrolSpecs(manifest);
    this.patrolState = createStudioAmbientPatrol(specs);
    for (const spec of specs) {
      const home = spec.route[0] ?? { x: manifest.width / 2, y: manifest.height / 2 };
      const projected = studioProjectTownPoint(manifest, home);
      const ground = flightHeight(spec.species) === 0;
      const shadow = ground
        ? scene.add.ellipse(projected.x, projected.y + 2, spec.species === "npc" ? 26 : 18, spec.species === "npc" ? 9 : 6, 0x15151c, 0.2)
          .setDepth(studioTownDepthForPoint(manifest, home, 990))
        : null;
      if (spec.species === "npc") {
        const sprite = scene.add.sprite(projected.x, projected.y, npc.textureKey, npc.textureFrame)
          .setOrigin(0.5, STUDIO_CHARACTER_FOOT_ORIGIN)
          .setData({ visualWidth: npc.visualWidth, visualHeight: npc.visualHeight, assetOwner: "ambient:npc" })
          .setDisplaySize(npc.visualWidth, npc.visualHeight)
          .setDepth(studioTownDepthForPoint(manifest, home, 1_000));
        this.actorVisuals.set(spec.id, { sprite, shadow, walkCycleMs: 0, distance: 0, lastPoint: home });
        continue;
      }
      const key = studioAmbientAnimalTextureKey(spec.species);
      if (!scene.textures.exists(key)) continue;
      const size = ANIMAL_DISPLAY_SIZE[spec.species];
      const sprite = scene.add.sprite(projected.x, projected.y - flightHeight(spec.species), key, 4)
        .setOrigin(0.5, 0.82)
        .setDisplaySize(size, size)
        .setDepth(studioTownDepthForPoint(manifest, home, 1_000));
      this.actorVisuals.set(spec.id, { sprite, shadow, walkCycleMs: 0, distance: 0, lastPoint: home });
    }
  }

  /** 생성된 순찰 배우 수 (진단·테스트용). */
  get actorCount(): number {
    return this.actorVisuals.size;
  }

  /** 현재 화면에 동기화된 날씨 파티클 스프라이트 수 (진단·테스트용). */
  get weatherSpriteCount(): number {
    return this.weatherSprites.size;
  }

  update(input: StudioAmbienceRenderUpdateInput): void {
    this.updateWeather(input);
    this.updatePatrol(input);
  }

  private updateWeather(input: StudioAmbienceRenderUpdateInput): void {
    this.weatherState = stepStudioWeatherParticles(this.weatherState, {
      condition: input.condition,
      viewport: input.viewport,
      deltaSeconds: input.deltaMs / 1000,
      particleRatio: input.particleRatio,
      reducedMotion: input.reducedMotion,
      nowMs: input.time,
    });
    const alive = new Set<number>();
    for (const particle of this.weatherState.particles) {
      const style = studioWeatherParticleRenderStyle(particle);
      const key = studioWeatherParticleTextureKey(particle.kind);
      let sprite = this.weatherSprites.get(particle.id);
      if (!sprite) {
        if (!this.scene.textures.exists(key)) continue;
        sprite = this.scene.add.sprite(particle.x, particle.y, key, style.frame)
          .setDepth(STUDIO_AMBIENCE_WEATHER_DEPTH);
        this.weatherSprites.set(particle.id, sprite);
      }
      alive.add(particle.id);
      sprite.setPosition(particle.x, particle.y)
        .setFrame(style.frame)
        .setAlpha(style.alpha)
        .setDisplaySize(style.displaySize, style.displaySize)
        .setRotation(style.rotation)
        .setVisible(style.alpha > 0.01);
    }
    for (const [id, sprite] of this.weatherSprites) {
      if (!alive.has(id)) {
        sprite.destroy();
        this.weatherSprites.delete(id);
      }
    }
  }

  private updatePatrol(input: StudioAmbienceRenderUpdateInput): void {
    if (!input.ambientActorsEnabled) {
      for (const visual of this.actorVisuals.values()) {
        visual.sprite.setVisible(false);
        visual.shadow?.setVisible(false);
      }
      return;
    }
    const deltaSeconds = Math.min(0.05, Math.max(0, input.deltaMs / 1000));
    const stepped = stepStudioAmbientPatrol(this.patrolState, {
      deltaSeconds,
      nowMs: input.time,
      obstacles: this.obstacles,
      players: input.players,
      weather: input.patrolWeather,
      timeOfDay: input.timeOfDay,
      reducedMotion: input.reducedMotion,
      scheduleElapsedMs: input.time,
    });
    this.patrolState = stepped.state;
    for (const pose of stepped.poses) {
      const visual = this.actorVisuals.get(pose.id);
      if (!visual) continue;
      const point = { x: pose.x, y: pose.y };
      if (visual.lastPoint) {
        visual.distance += Math.hypot(point.x - visual.lastPoint.x, point.y - visual.lastPoint.y);
      }
      visual.lastPoint = point;
      if (pose.moving && !input.reducedMotion) visual.walkCycleMs += input.deltaMs;
      const projected = studioProjectTownPoint(this.manifest, point);
      const fly = flightHeight(pose.species);
      const bob = fly > 0 && !input.reducedMotion ? Math.sin(input.time / 300 + visual.distance) * 4 : 0;
      visual.sprite.setPosition(projected.x, projected.y - fly + bob)
        .setDepth(studioTownDepthForPoint(this.manifest, point, 1_000))
        .setVisible(true);
      visual.shadow?.setPosition(projected.x, projected.y + 2)
        .setDepth(studioTownDepthForPoint(this.manifest, point, 990))
        .setVisible(true);
      if (pose.species === "npc") {
        visual.sprite.setData("walkDistance", visual.distance);
        this.npc.applyVisual(visual.sprite, this.npc.skin, pose.facing, pose.moving ? "walk" : "idle");
      } else {
        const frame = studioAmbientAnimalFrame(pose, visual.walkCycleMs, input.reducedMotion);
        visual.sprite.setFrame(frame.frame).setFlipX(frame.flipX);
      }
    }
  }

  destroy(): void {
    for (const sprite of this.weatherSprites.values()) sprite.destroy();
    this.weatherSprites.clear();
    for (const visual of this.actorVisuals.values()) {
      visual.sprite.destroy();
      visual.shadow?.destroy();
    }
    this.actorVisuals.clear();
  }
}
