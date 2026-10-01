/**
 * 공중섬 캠퍼스 생동감 런타임: 낮 나비·벚꽃잎·새 떼(바닥 그림자 포함)·석호 물고기·무대 조명·분수 물보라·
 * 커피 김·해질녘·밤 반딧불.
 *
 * - 위치·주기는 시각과 슬롯 번호만으로 정해지는 순수 함수다(결정적). 테스트와 화면 재현이 쉽다.
 * - Phaser 객체는 StudioCampusLifeRuntime이 소유한다. campus-runtime이 만들고 갱신·파기한다(Canvas 비대화 방지).
 * - 모션 줄이기·접근성 품질에서는 움직이는 생물과 입자를 숨기고, 무대 조명은 쓸지 않고 제자리에 둔다.
 * - 카메라 밖(여유 160px) 개체는 숨기고 위치를 계산하지 않는다.
 * - 색은 월드 안 생물·조명의 고유 픽셀 아트 팔레트다(UI 색이 아니므로 CSS 토큰을 쓰지 않는다).
 *   흑백 원고(ink) 스타일에서만 무채색으로 바꾼다.
 */
import type * as Phaser from "phaser";

import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import type { StudioCampusLifeBeam, StudioCampusLifeSlots } from "./studio-virtual-space-campus-blueprint";
import { campusStyleColor } from "./studio-virtual-space-campus-textures";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualQualityProfile } from "./studio-virtual-space-quality";
import type { StudioWorldRect } from "./studio-virtual-space-world-manifest";

export type StudioCampusLifePhase = "dawn" | "day" | "dusk" | "night";

export interface StudioCampusLifeFlags {
  readonly butterflies: boolean;
  readonly petals: boolean;
  readonly birds: boolean;
  readonly fish: boolean;
  readonly beams: boolean;
  readonly beamSweep: boolean;
  readonly spray: boolean;
  readonly steam: boolean;
  readonly fireflies: boolean;
}

export type StudioCampusLifeQuality = Pick<StudioVirtualQualityProfile, "tier" | "particleRatio" | "dynamicLights" | "ambientActors">;

/** 시간대·모션 줄이기·품질 계층으로 켤 연출을 정한다. */
export function studioCampusLifeFlags(input: {
  readonly phase: StudioCampusLifePhase;
  readonly reducedMotion: boolean;
  readonly quality: StudioCampusLifeQuality | null;
}): StudioCampusLifeFlags {
  const still = input.reducedMotion || input.quality?.tier === "accessibility";
  const particles = !still && (input.quality?.particleRatio ?? 1) > 0;
  const critters = !still && (input.quality?.ambientActors ?? true);
  const lights = input.quality?.dynamicLights ?? true;
  const daylight = input.phase === "day" || input.phase === "dawn";
  const dark = input.phase === "dusk" || input.phase === "night";
  return Object.freeze({
    butterflies: critters && daylight,
    petals: particles && input.phase !== "night",
    birds: critters && input.phase !== "night",
    fish: particles,
    beams: lights,
    beamSweep: lights && !still,
    spray: particles,
    steam: particles,
    fireflies: lights && !still && dark,
  });
}

/** 결정적 의사난수(0 이상 1 미만). */
export function studioCampusLifeUnit(seed: number): number {
  let value = (Math.imul(seed | 0, 0x9e3779b1) + 0x6d2b79f5) >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

const unit = studioCampusLifeUnit;

/* ---------------------------------------------------------------------------------------------- */
/* 순수 위치 계산                                                                                   */
/* ---------------------------------------------------------------------------------------------- */

/** 위치 계산 결과는 out 객체에 써서 돌려준다(런타임은 같은 객체를 매 프레임 재사용한다). */
export interface StudioButterflyPose {
  x: number;
  y: number;
  /** 바닥 기준 y(깊이 정렬용). */
  groundY: number;
  /** 0 = 날개 편 모습, 1 = 접은 모습. */
  frame: 0 | 1;
  flipX: boolean;
}

/** 화단 위를 8자로 맴도는 나비. 날갯짓은 약 110ms마다 접었다 편다. */
export function studioButterflyPose(
  bed: StudioVirtualSpacePoint,
  index: number,
  time: number,
  out: StudioButterflyPose = { x: 0, y: 0, groundY: 0, frame: 0, flipX: false },
): StudioButterflyPose {
  const phase = unit(index * 7919 + 13) * Math.PI * 2;
  const speed = 0.00055 + unit(index * 104_729 + 7) * 0.00035;
  const t = time * speed + phase;
  const rx = 34 + unit(index * 31 + 3) * 26;
  const ry = 14 + unit(index * 17 + 5) * 10;
  const groundY = bed.y + Math.sin(t * 2) * ry;
  const lift = 30 + Math.sin(t * 2.3 + phase) * 8;
  out.x = bed.x + Math.sin(t) * rx;
  out.y = groundY - lift;
  out.groundY = groundY;
  out.frame = Math.floor((time + phase * 100) / 110) % 2 === 0 ? 0 : 1;
  out.flipX = Math.cos(t) < 0;
  return out;
}

export interface StudioPetalPose {
  x: number;
  y: number;
  alpha: number;
  angle: number;
}

export const STUDIO_PETAL_CYCLE_MS = 4_200;

/** 캐노피에서 떨어져 바람에 흔들리며 나무 밑동 근처 바닥까지 내려오는 꽃잎. */
export function studioPetalPose(
  tree: { readonly x: number; readonly y: number; readonly baseY: number },
  index: number,
  time: number,
  out: StudioPetalPose = { x: 0, y: 0, alpha: 0, angle: 0 },
): StudioPetalPose {
  const cycle = STUDIO_PETAL_CYCLE_MS * (0.85 + unit(index * 97 + 1) * 0.3);
  const offset = unit(index * 2_654_435 + 11) * cycle;
  const progress = ((((time + offset) % cycle) + cycle) % cycle) / cycle;
  const startX = tree.x + (unit(index * 131 + 17) - 0.5) * 110;
  const drift = 26 + unit(index * 37 + 19) * 28;
  out.alpha = progress < 0.12 ? progress / 0.12 : progress > 0.85 ? Math.max(0, (1 - progress) / 0.15) : 1;
  out.x = startX + Math.sin(progress * Math.PI * 3 + index) * 10 + progress * drift;
  out.y = tree.y + (tree.baseY + 10 - tree.y) * progress;
  out.angle = progress * 540 + index * 40;
  return out;
}

export const STUDIO_BIRD_CYCLE_MS = 26_000;
export const STUDIO_BIRD_FLIGHT_MS = 7_500;

export interface StudioBirdRoute {
  readonly cycle: number;
  readonly from: StudioVirtualSpacePoint;
  readonly to: StudioVirtualSpacePoint;
  readonly count: number;
}

/** 주기 번호와 그 순간의 카메라 화면으로, 화면을 가로지르는 새 떼 경로를 정한다(결정적). */
export function studioBirdRoute(cycle: number, view: StudioWorldRect): StudioBirdRoute {
  const leftToRight = unit(cycle * 911 + 5) < 0.5;
  const margin = 90;
  const fromY = view.y + view.height * (0.12 + unit(cycle * 613 + 3) * 0.46);
  const toY = fromY + (unit(cycle * 419 + 9) - 0.5) * view.height * 0.45;
  return {
    cycle,
    from: { x: leftToRight ? view.x - margin : view.x + view.width + margin, y: fromY },
    to: { x: leftToRight ? view.x + view.width + margin : view.x - margin, y: toY },
    count: 3 + Math.floor(unit(cycle * 271 + 1) * 3),
  };
}

/** 이번 주기에서 비행 진행률(0~1). 쉬는 구간이면 null. */
export function studioBirdProgress(time: number): { readonly cycle: number; readonly progress: number } | null {
  if (!Number.isFinite(time)) return null;
  const cycle = Math.floor(time / STUDIO_BIRD_CYCLE_MS);
  const elapsed = time - cycle * STUDIO_BIRD_CYCLE_MS;
  return elapsed <= STUDIO_BIRD_FLIGHT_MS ? { cycle, progress: elapsed / STUDIO_BIRD_FLIGHT_MS } : null;
}

export interface StudioBirdPose {
  x: number;
  y: number;
  frame: 0 | 1;
  flipX: boolean;
}

/** V자 대형. 0번이 선두이고 나머지는 좌우로 한 칸씩 뒤에 선다. */
export function studioBirdPose(
  route: StudioBirdRoute,
  progress: number,
  index: number,
  time: number,
  out: StudioBirdPose = { x: 0, y: 0, frame: 0, flipX: false },
): StudioBirdPose {
  const direction = route.to.x >= route.from.x ? 1 : -1;
  const rank = Math.ceil(index / 2);
  const side = index % 2 === 0 ? 1 : -1;
  const x = route.from.x + (route.to.x - route.from.x) * progress - direction * rank * 24;
  out.x = x;
  out.y = route.from.y + (route.to.y - route.from.y) * progress + (index === 0 ? 0 : side * rank * 15)
    + Math.sin(time / 260 + index) * 2;
  out.frame = Math.floor((time + index * 70) / 150) % 2 === 0 ? 0 : 1;
  out.flipX = direction < 0;
  return out;
}

export const STUDIO_FISH_CYCLE_MS = 5_600;
export const STUDIO_FISH_JUMP_MS = 900;
const FISH_SPLASH_MS = 520;

export interface StudioFishJump {
  cycle: number;
  /** "air"는 물 밖, "splash"는 착수 뒤 물결만 남은 구간. */
  stage: "air" | "splash";
  progress: number;
  x: number;
  y: number;
  surfaceY: number;
  startX: number;
  endX: number;
  direction: 1 | -1;
  /** 착수 물결 진행률(0~1). "air" 구간에서는 0. */
  splash: number;
}

function fishJump(): StudioFishJump {
  return { cycle: 0, stage: "air", progress: 0, x: 0, y: 0, surfaceY: 0, startX: 0, endX: 0, direction: 1, splash: 0 };
}

/** 주기마다 석호 한 곳에서 물고기가 한 번 뛰어오른다. 뛰는 중이 아니면 null. 결과는 out에 쓴다. */
export function studioFishJump(time: number, lagoons: readonly StudioWorldRect[], out: StudioFishJump = fishJump()): StudioFishJump | null {
  if (!lagoons.length || !Number.isFinite(time)) return null;
  const cycle = Math.floor(time / STUDIO_FISH_CYCLE_MS);
  const start = unit(cycle * 31 + 7) * (STUDIO_FISH_CYCLE_MS - STUDIO_FISH_JUMP_MS - FISH_SPLASH_MS);
  const elapsed = time - cycle * STUDIO_FISH_CYCLE_MS - start;
  if (elapsed < 0 || elapsed > STUDIO_FISH_JUMP_MS + FISH_SPLASH_MS) return null;
  const lagoon = lagoons[Math.floor(unit(cycle * 97 + 3) * lagoons.length)] ?? lagoons[0]!;
  const centerX = lagoon.x + 30 + unit(cycle * 53 + 11) * Math.max(0, lagoon.width - 60);
  const surfaceY = lagoon.y + 20 + unit(cycle * 71 + 13) * Math.max(0, lagoon.height - 40);
  const direction: 1 | -1 = unit(cycle * 17 + 2) < 0.5 ? -1 : 1;
  const startX = centerX - direction * 22, endX = centerX + direction * 22;
  out.cycle = cycle;
  out.surfaceY = surfaceY;
  out.startX = startX;
  out.endX = endX;
  out.direction = direction;
  if (elapsed > STUDIO_FISH_JUMP_MS) {
    out.stage = "splash";
    out.progress = 1;
    out.x = endX;
    out.y = surfaceY;
    out.splash = (elapsed - STUDIO_FISH_JUMP_MS) / FISH_SPLASH_MS;
    return out;
  }
  const progress = elapsed / STUDIO_FISH_JUMP_MS;
  out.stage = "air";
  out.progress = progress;
  out.x = startX + (endX - startX) * progress;
  out.y = surfaceY - Math.sin(progress * Math.PI) * 34;
  out.splash = 0;
  return out;
}

/** 무대 조명이 바닥을 쓸고 지나가는 가로 오프셋(px). 쓸기를 끄면 0. */
export function studioStageBeamOffset(beam: Pick<StudioCampusLifeBeam, "sweep">, index: number, time: number, sweep: boolean): number {
  return sweep ? Math.sin(time / 1_400 + index * Math.PI * 0.7) * beam.sweep : 0;
}

/** 시간대별 무대 조명 밝기. 낮에도 은은하게 보이고 해질녘·밤에 가장 밝다. */
export function studioStageBeamAlpha(phase: StudioCampusLifePhase): number {
  return phase === "night" ? 0.4 : phase === "dusk" ? 0.32 : phase === "dawn" ? 0.2 : 0.16;
}

export interface StudioLifeParticle {
  x: number;
  y: number;
  alpha: number;
  scale: number;
}

function particle(): StudioLifeParticle {
  return { x: 0, y: 0, alpha: 0, scale: 1 };
}

/** 분수 물보라 한 방울: 솟았다가 바깥으로 퍼지며 수면으로 떨어진다. */
export function studioSprayDroplet(
  fountain: { readonly x: number; readonly y: number; readonly radiusX: number; readonly radiusY: number },
  index: number,
  count: number,
  time: number,
  out: StudioLifeParticle = particle(),
): StudioLifeParticle {
  const period = 1_300 + unit(index * 7 + 1) * 500;
  const progress = ((((time + unit(index * 13 + 5) * period) % period) + period) % period) / period;
  const angle = (index / Math.max(1, count)) * Math.PI * 2 + unit(index * 3 + 1) * 0.4;
  out.x = fountain.x + Math.cos(angle) * fountain.radiusX * progress;
  out.y = fountain.y + Math.sin(angle) * fountain.radiusY * progress - Math.sin(progress * Math.PI) * 58 + progress * 22;
  out.alpha = Math.max(0, 0.95 - progress * 0.6);
  out.scale = 1 - progress * 0.3;
  return out;
}

export const STUDIO_STEAM_CYCLE_MS = 2_200;

/** 커피잔 위로 피어오르는 김 한 가닥. */
export function studioSteamPuff(source: StudioVirtualSpacePoint, index: number, time: number, out: StudioLifeParticle = particle()): StudioLifeParticle {
  const progress = ((((time + index * 530) % STUDIO_STEAM_CYCLE_MS) + STUDIO_STEAM_CYCLE_MS) % STUDIO_STEAM_CYCLE_MS) / STUDIO_STEAM_CYCLE_MS;
  out.x = source.x + Math.sin(progress * Math.PI * 2 + index) * 3;
  out.y = source.y - progress * 24;
  out.alpha = Math.sin(progress * Math.PI) * 0.55;
  out.scale = 0.6 + progress * 0.9;
  return out;
}

/** 나무 주위를 떠도는 반딧불. 밝기는 천천히 깜박인다. */
export function studioFireflyPose(grove: StudioVirtualSpacePoint, index: number, time: number, out: StudioLifeParticle = particle()): StudioLifeParticle {
  const phase = unit(index * 389 + 23) * Math.PI * 2;
  const speed = 1 + unit(index * 211 + 29);
  out.x = grove.x + Math.sin(time * 0.0007 * speed + phase) * 64;
  out.y = grove.y - 20 + Math.cos(time * 0.0009 * speed + phase * 1.3) * 30;
  out.alpha = 0.35 + 0.65 * Math.abs(Math.sin(time * 0.004 + phase));
  out.scale = 1;
  return out;
}

/** 카메라 화면(여유 margin 포함) 안인지. */
export function studioCampusLifeInView(view: StudioWorldRect, x: number, y: number, margin = 160): boolean {
  return x >= view.x - margin && x <= view.x + view.width + margin && y >= view.y - margin && y <= view.y + view.height + margin;
}

/* ---------------------------------------------------------------------------------------------- */
/* Phaser 런타임                                                                                   */
/* ---------------------------------------------------------------------------------------------- */

const BUTTERFLY_COLORS = [0xffd166, 0xff9ecb, 0x9ee6ff, 0xc8a8ff] as const;
const PALETTE = Object.freeze({
  body: 0x3b2f45, bird: 0x2b2f45, petal: 0xffc0d6, petalEdge: 0xf49ab8, koi: 0xff9a55, koiBelly: 0xfff1de,
  droplet: 0xbff4ff, steam: 0xf7f3ea, firefly: 0xfff3a8, ripple: 0xdff8ff, shadow: 0x0b0d1a,
});
const BUTTERFLIES_PER_BED = 2;
const PETALS_PER_TREE = 5;
const MAX_BIRDS = 5;
const DROPLETS_PER_FOUNTAIN = 14;
const PUFFS_PER_SOURCE = 2;
const FIREFLIES_PER_GROVE = 3;
const CRITTER_DEPTH_OFFSET = 1_060;
const BIRD_DEPTH = 41_600;
const BIRD_SHADOW_DEPTH = -899;
const FISH_DEPTH = -968;
const FIREFLY_DEPTH = 39_200;

type LifeScene = Pick<Phaser.Scene, "add" | "make" | "textures">;

/** 캠퍼스 런타임이 한 번 만들어 매 프레임 값만 바꿔 넘긴다(객체를 새로 만들지 않는다). */
export interface StudioCampusLifeUpdate {
  time: number;
  /** 카메라가 보고 있는 월드 영역(camera.worldView). */
  view: StudioWorldRect;
  phase: StudioCampusLifePhase;
  reducedMotion: boolean;
  quality: StudioCampusLifeQuality | null;
  /** 무대 앞에 다가간 정도(0~1). 무대 조명이 밝아지고 빨리 쓸린다. */
  stageBoost?: number;
}

interface Placed<T> {
  readonly object: Phaser.GameObjects.Image;
  readonly slot: T;
  readonly index: number;
}

function lifeColor(color: number, style: StudioVirtualArtStyleKey): number {
  return style === "ink" ? campusStyleColor(color, "ink") : color;
}

export class StudioCampusLifeRuntime {
  private readonly butterflies: (Placed<StudioVirtualSpacePoint> & { readonly color: number })[] = [];
  private readonly petals: Placed<StudioCampusLifeSlots["blossoms"][number]>[] = [];
  private readonly birds: { readonly bird: Phaser.GameObjects.Image; readonly shadow: Phaser.GameObjects.Image }[] = [];
  private birdRoute: StudioBirdRoute | null = null;
  private readonly fish: Phaser.GameObjects.Image;
  private readonly ripples: readonly [Phaser.GameObjects.Ellipse, Phaser.GameObjects.Ellipse];
  private readonly beams: { readonly graphics: Phaser.GameObjects.Graphics; readonly beam: StudioCampusLifeBeam; readonly index: number }[] = [];
  private readonly droplets: Placed<StudioCampusLifeSlots["fountains"][number]>[] = [];
  private readonly puffs: Placed<StudioCampusLifeSlots["steam"][number]>[] = [];
  private readonly fireflies: Placed<StudioVirtualSpacePoint>[] = [];
  private readonly keys: Readonly<Record<"butterfly" | "bird" | "fish" | "petal" | "glow" | "puff", string>>;
  /** 매 프레임 문자열을 만들지 않도록 미리 만든 텍스처 키([색][날갯짓], [날갯짓]). */
  private readonly butterflyFrames: readonly (readonly [string, string])[];
  private readonly birdFrames: readonly [string, string];
  /** 위치 계산을 받는 재사용 객체. */
  private readonly butterflyPose: StudioButterflyPose = { x: 0, y: 0, groundY: 0, frame: 0, flipX: false };
  private readonly petalPose: StudioPetalPose = { x: 0, y: 0, alpha: 0, angle: 0 };
  private readonly birdPose: StudioBirdPose = { x: 0, y: 0, frame: 0, flipX: false };
  private readonly particlePose: StudioLifeParticle = particle();
  private readonly fishPose: StudioFishJump = fishJump();
  private flagsKey = "";
  private flags: StudioCampusLifeFlags | null = null;

  constructor(scene: LifeScene, private readonly slots: StudioCampusLifeSlots, private readonly style: StudioVirtualArtStyleKey) {
    this.keys = this.createTextures(scene);
    this.butterflyFrames = BUTTERFLY_COLORS.map((_, color) => [`${this.keys.butterfly}-${color}-0`, `${this.keys.butterfly}-${color}-1`] as const);
    this.birdFrames = [`${this.keys.bird}-0`, `${this.keys.bird}-1`];
    slots.flowerBeds.forEach((bed, bedIndex) => {
      for (let wing = 0; wing < BUTTERFLIES_PER_BED; wing += 1) {
        const index = bedIndex * BUTTERFLIES_PER_BED + wing;
        const color = index % BUTTERFLY_COLORS.length;
        this.butterflies.push({ slot: bed, index, color, object: scene.add.image(bed.x, bed.y, `${this.keys.butterfly}-${color}-0`)
          .setVisible(false) });
      }
    });
    slots.blossoms.forEach((tree, treeIndex) => {
      for (let petal = 0; petal < PETALS_PER_TREE; petal += 1) {
        this.petals.push({ slot: tree, index: treeIndex * PETALS_PER_TREE + petal,
          object: scene.add.image(tree.x, tree.y, this.keys.petal).setDepth(Math.round(tree.baseY) + 1_002).setVisible(false) });
      }
    });
    for (let index = 0; index < MAX_BIRDS; index += 1) {
      this.birds.push({
        bird: scene.add.image(0, 0, `${this.keys.bird}-0`).setDepth(BIRD_DEPTH).setAlpha(0.88).setVisible(false),
        shadow: scene.add.image(0, 0, `${this.keys.bird}-shadow`).setDepth(BIRD_SHADOW_DEPTH).setAlpha(0.2).setVisible(false),
      });
    }
    this.fish = scene.add.image(0, 0, this.keys.fish).setDepth(FISH_DEPTH).setVisible(false);
    const ripple = () => scene.add.ellipse(0, 0, 24, 9).setStrokeStyle(2, PALETTE.ripple, 0.8).setDepth(FISH_DEPTH - 1).setVisible(false);
    this.ripples = [ripple(), ripple()];
    slots.stageBeams.forEach((beam, index) => {
      this.beams.push({ beam, index, graphics: scene.add.graphics().setDepth(Math.round(beam.targetY) + 1_045).setBlendMode("ADD").setVisible(false) });
    });
    for (const fountain of slots.fountains) {
      for (let index = 0; index < DROPLETS_PER_FOUNTAIN; index += 1) {
        this.droplets.push({ slot: fountain, index,
          object: scene.add.image(fountain.x, fountain.y, this.keys.glow).setDepth(Math.round(fountain.baseY) + 1_001)
            .setTint(PALETTE.droplet).setBlendMode("ADD").setVisible(false) });
      }
    }
    slots.steam.forEach((source, sourceIndex) => {
      for (let puff = 0; puff < PUFFS_PER_SOURCE; puff += 1) {
        this.puffs.push({ slot: source, index: sourceIndex * PUFFS_PER_SOURCE + puff,
          object: scene.add.image(source.x, source.y, this.keys.puff).setDepth(Math.round(source.baseY) + 1_002).setVisible(false) });
      }
    });
    slots.fireflyGroves.forEach((grove, groveIndex) => {
      for (let fly = 0; fly < FIREFLIES_PER_GROVE; fly += 1) {
        this.fireflies.push({ slot: grove, index: groveIndex * FIREFLIES_PER_GROVE + fly,
          object: scene.add.image(grove.x, grove.y, this.keys.glow).setDepth(FIREFLY_DEPTH).setTint(PALETTE.firefly)
            .setBlendMode("ADD").setVisible(false) });
      }
    });
  }

  /** 작은 생물·입자 텍스처를 한 번만 만든다(같은 키가 있으면 재사용). */
  private createTextures(scene: LifeScene): StudioCampusLifeRuntime["keys"] {
    const style = this.style;
    const keys = {
      butterfly: `campus-life-butterfly-${style}`, bird: `campus-life-bird-${style}`, fish: `campus-life-fish-${style}`,
      petal: `campus-life-petal-${style}`, glow: "campus-life-glow", puff: "campus-life-puff",
    } as const;
    const make = (key: string, width: number, height: number, draw: (graphics: Phaser.GameObjects.Graphics) => void) => {
      if (scene.textures.exists(key)) return;
      const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
      draw(graphics);
      graphics.generateTexture(key, width, height);
      graphics.destroy();
    };
    BUTTERFLY_COLORS.forEach((raw, color) => {
      const wing = lifeColor(raw, style), body = lifeColor(PALETTE.body, style);
      make(`${keys.butterfly}-${color}-0`, 14, 11, (g) => {
        g.fillStyle(wing, 1).fillEllipse(3.6, 3.8, 6.4, 6.8).fillEllipse(10.4, 3.8, 6.4, 6.8);
        g.fillStyle(wing, 0.85).fillEllipse(4.4, 8, 4.4, 4).fillEllipse(9.6, 8, 4.4, 4);
        g.fillStyle(body, 1).fillRect(6.4, 2, 1.4, 8);
      });
      make(`${keys.butterfly}-${color}-1`, 14, 11, (g) => {
        g.fillStyle(wing, 1).fillEllipse(5.6, 4.4, 2.6, 7).fillEllipse(8.4, 4.4, 2.6, 7);
        g.fillStyle(body, 1).fillRect(6.4, 2, 1.4, 8);
      });
    });
    const bird = lifeColor(PALETTE.bird, style);
    make(`${keys.bird}-0`, 18, 10, (g) => {
      g.fillStyle(bird, 1).fillTriangle(0, 1, 9, 6, 7, 8).fillTriangle(18, 1, 9, 6, 11, 8).fillEllipse(9, 6.5, 5, 3.4);
    });
    make(`${keys.bird}-1`, 18, 10, (g) => {
      g.fillStyle(bird, 1).fillTriangle(0, 8, 9, 5, 7, 3).fillTriangle(18, 8, 9, 5, 11, 3).fillEllipse(9, 5.5, 5, 3.4);
    });
    make(`${keys.bird}-shadow`, 18, 8, (g) => {
      g.fillStyle(PALETTE.shadow, 1).fillEllipse(9, 4, 16, 4.5);
    });
    make(keys.fish, 16, 9, (g) => {
      const koi = lifeColor(PALETTE.koi, style);
      g.fillStyle(koi, 1).fillEllipse(6.5, 4.5, 11, 6).fillTriangle(11, 4.5, 16, 1, 16, 8);
      g.fillStyle(lifeColor(PALETTE.koiBelly, style), 1).fillEllipse(5, 5.4, 5, 2.4);
      g.fillStyle(PALETTE.shadow, 1).fillCircle(3, 3.6, 0.9);
    });
    make(keys.petal, 7, 6, (g) => {
      g.fillStyle(lifeColor(PALETTE.petalEdge, style), 1).fillEllipse(3.5, 3.2, 6.4, 4.6);
      g.fillStyle(lifeColor(PALETTE.petal, style), 1).fillEllipse(3.2, 2.8, 4.6, 3.2);
    });
    // 흰색 둥근 빛. 반딧불·물보라는 tint로 색을 입힌다(렌더러가 tint를 못 쓰면 흰 빛으로 보인다).
    make(keys.glow, 12, 12, (g) => {
      g.fillStyle(PALETTE.steam, 0.22).fillCircle(6, 6, 6);
      g.fillStyle(PALETTE.steam, 0.45).fillCircle(6, 6, 3.8);
      g.fillStyle(PALETTE.steam, 1).fillCircle(6, 6, 1.8);
    });
    make(keys.puff, 16, 16, (g) => {
      g.fillStyle(PALETTE.steam, 0.25).fillCircle(8, 8, 8);
      g.fillStyle(PALETTE.steam, 0.4).fillCircle(8, 8, 5);
    });
    return keys;
  }

  /** 시간대·모션 줄이기·품질이 바뀔 때만 플래그를 다시 계산한다. */
  private flagsFor(input: StudioCampusLifeUpdate): StudioCampusLifeFlags {
    const quality = input.quality;
    const key = quality
      ? `${input.phase}|${input.reducedMotion ? 1 : 0}|${quality.tier}|${quality.particleRatio}|${quality.dynamicLights ? 1 : 0}|${quality.ambientActors ? 1 : 0}`
      : `${input.phase}|${input.reducedMotion ? 1 : 0}|-`;
    if (!this.flags || key !== this.flagsKey) {
      this.flagsKey = key;
      this.flags = studioCampusLifeFlags(input);
    }
    return this.flags;
  }

  update(input: StudioCampusLifeUpdate): void {
    const { time, view } = input;
    const flags = this.flagsFor(input);
    for (const item of this.butterflies) {
      const visible = flags.butterflies && studioCampusLifeInView(view, item.slot.x, item.slot.y);
      item.object.setVisible(visible);
      if (!visible) continue;
      const pose = studioButterflyPose(item.slot, item.index, time, this.butterflyPose);
      const frames = this.butterflyFrames[item.color] ?? this.butterflyFrames[0]!;
      item.object.setTexture(pose.frame === 0 ? frames[0] : frames[1])
        .setPosition(pose.x, pose.y).setFlipX(pose.flipX).setDepth(Math.round(pose.groundY) + CRITTER_DEPTH_OFFSET);
    }
    for (const item of this.petals) {
      const visible = flags.petals && studioCampusLifeInView(view, item.slot.x, item.slot.baseY);
      item.object.setVisible(visible);
      if (!visible) continue;
      const pose = studioPetalPose(item.slot, item.index, time, this.petalPose);
      item.object.setPosition(pose.x, pose.y).setAlpha(pose.alpha).setAngle(pose.angle);
    }
    this.updateBirds(input, flags.birds);
    this.updateFish(input, flags.fish);
    const boost = Math.min(1, Math.max(0, input.stageBoost ?? 0));
    const beamAlpha = Math.min(0.7, studioStageBeamAlpha(input.phase) * (1 + boost * 1.4));
    for (const { graphics, beam, index } of this.beams) {
      const visible = flags.beams && studioCampusLifeInView(view, beam.targetX, beam.targetY, 320);
      graphics.setVisible(visible);
      if (!visible) continue;
      // 무대 앞에 서면 조명이 더 빠르게 쓸린다(시간을 앞당겨 같은 곡선을 빨리 돈다).
      const offset = studioStageBeamOffset(beam, index, time * (1 + boost * 0.8), flags.beamSweep);
      const targetX = beam.targetX + offset;
      const color = lifeColor(beam.color, this.style);
      graphics.clear()
        .fillStyle(color, beamAlpha * 0.55).fillTriangle(beam.x - 6, beam.y, beam.x + 6, beam.y, targetX + 50, beam.targetY)
        .fillTriangle(beam.x - 6, beam.y, targetX + 50, beam.targetY, targetX - 50, beam.targetY)
        .fillStyle(color, beamAlpha).fillEllipse(targetX, beam.targetY, 116, 34)
        .fillStyle(color, beamAlpha * 0.7).fillCircle(beam.x, beam.y, 7);
    }
    for (const item of this.droplets) {
      const visible = flags.spray && studioCampusLifeInView(view, item.slot.x, item.slot.y);
      item.object.setVisible(visible);
      if (!visible) continue;
      const drop = studioSprayDroplet(item.slot, item.index, DROPLETS_PER_FOUNTAIN, time, this.particlePose);
      item.object.setPosition(drop.x, drop.y).setAlpha(drop.alpha).setScale(drop.scale * 0.8);
    }
    for (const item of this.puffs) {
      const visible = flags.steam && studioCampusLifeInView(view, item.slot.x, item.slot.y);
      item.object.setVisible(visible);
      if (!visible) continue;
      const puff = studioSteamPuff(item.slot, item.index, time, this.particlePose);
      item.object.setPosition(puff.x, puff.y).setAlpha(puff.alpha).setScale(puff.scale);
    }
    for (const item of this.fireflies) {
      const visible = flags.fireflies && studioCampusLifeInView(view, item.slot.x, item.slot.y);
      item.object.setVisible(visible);
      if (!visible) continue;
      const fly = studioFireflyPose(item.slot, item.index, time, this.particlePose);
      item.object.setPosition(fly.x, fly.y).setAlpha(fly.alpha);
    }
  }

  private updateBirds(input: StudioCampusLifeUpdate, enabled: boolean): void {
    // studioBirdProgress와 같은 계산을 객체 없이 한다.
    const cycle = Math.floor(input.time / STUDIO_BIRD_CYCLE_MS);
    const elapsed = input.time - cycle * STUDIO_BIRD_CYCLE_MS;
    if (!enabled || !Number.isFinite(input.time) || elapsed > STUDIO_BIRD_FLIGHT_MS) {
      if (this.birdRoute) {
        this.birdRoute = null;
        for (const { bird, shadow } of this.birds) { bird.setVisible(false); shadow.setVisible(false); }
      }
      return;
    }
    const progress = elapsed / STUDIO_BIRD_FLIGHT_MS;
    // 경로는 비행을 시작한 순간의 화면으로 정하고 그 주기 동안 유지한다(카메라가 움직여도 새가 순간이동하지 않는다).
    if (this.birdRoute?.cycle !== cycle) this.birdRoute = studioBirdRoute(cycle, input.view);
    const route = this.birdRoute;
    for (let index = 0; index < this.birds.length; index += 1) {
      const { bird, shadow } = this.birds[index]!;
      const visible = index < route.count;
      bird.setVisible(visible);
      shadow.setVisible(visible);
      if (!visible) continue;
      const pose = studioBirdPose(route, progress, index, input.time, this.birdPose);
      bird.setTexture(pose.frame === 0 ? this.birdFrames[0] : this.birdFrames[1]).setPosition(pose.x, pose.y).setFlipX(pose.flipX);
      // 높이 나는 새의 그림자는 오른쪽 아래 바닥에 떨어진다.
      shadow.setPosition(pose.x + 56, pose.y + 150);
    }
  }

  private updateFish(input: StudioCampusLifeUpdate, enabled: boolean): void {
    const jump = enabled ? studioFishJump(input.time, this.slots.lagoons, this.fishPose) : null;
    const takeoff = this.ripples[0], landing = this.ripples[1];
    if (!jump || !studioCampusLifeInView(input.view, jump.x, jump.surfaceY)) {
      this.fish.setVisible(false); takeoff.setVisible(false); landing.setVisible(false);
      return;
    }
    const inAir = jump.stage === "air";
    this.fish.setVisible(inAir);
    if (inAir) {
      // 올라갈 때는 머리를 들고 내려올 때는 숙인다.
      const tilt = (jump.progress - 0.5) * 70 * jump.direction;
      this.fish.setPosition(jump.x, jump.y).setFlipX(jump.direction > 0).setAngle(tilt);
    }
    const takeoffGrow = Math.min(1, jump.stage === "air" ? jump.progress / 0.45 : 1);
    takeoff.setVisible(jump.stage === "air" && jump.progress < 0.45)
      .setPosition(jump.startX, jump.surfaceY).setScale(0.6 + takeoffGrow * 0.9).setAlpha(1 - takeoffGrow);
    landing.setVisible(jump.stage === "splash" || jump.progress > 0.92)
      .setPosition(jump.endX, jump.surfaceY).setScale(0.6 + jump.splash * 1.1).setAlpha(1 - jump.splash * 0.9);
  }

  destroy(): void {
    for (const item of [...this.butterflies, ...this.petals, ...this.droplets, ...this.puffs, ...this.fireflies]) item.object.destroy();
    for (const { bird, shadow } of this.birds) { bird.destroy(); shadow.destroy(); }
    for (const { graphics } of this.beams) graphics.destroy();
    this.fish.destroy();
    for (const ripple of this.ripples) ripple.destroy();
    this.butterflies.length = 0;
    this.petals.length = 0;
    this.birds.length = 0;
    this.beams.length = 0;
    this.droplets.length = 0;
    this.puffs.length = 0;
    this.fireflies.length = 0;
  }
}
