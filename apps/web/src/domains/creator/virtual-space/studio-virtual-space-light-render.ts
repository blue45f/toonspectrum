/**
 * 가상 스튜디오 오브젝트 광원 렌더 런타임 (트랙 I · 광원·조명 고도화)
 *
 * 조명 기구(스탠드 램프·네온사인·천장등·스포트라이트·스트링 라이트)와
 * 월드 안 화면 오브젝트(모니터·터미널·콘솔)에 붙는 **국소** 방사형 글로우,
 * 그리고 가구 아래 블롭 섀도우를 Phaser로 그린다.
 *
 * - 전면 틴트·블러·헤이즈 같은 화면 전체 오버레이는 만들지 않는다.
 *   밤의 어둠은 기존 주야 사이클 틴트(상한 0.22)가 담당하고, 이 런타임은
 *   오브젝트 주변만 국소적으로 밝힌다.
 * - 광원 성격: 램프는 steady, 네온은 결정적 플리커, 화면은 은은한 호흡,
 *   스트링 라이트는 트윙클. 주야 보정(neonGlow)이 밤 네온을 더 도드라지게 한다.
 * - 성능 가드: 동시 광원 상한(품질 등급 `dynamicLights`가 꺼진 등급에서는 0),
 *   카메라 중심 기준 우선순위 선택, reduced-motion에서는 플리커·호흡 정지.
 * - 가구 블롭 섀도우: 캐릭터 그림자는 기존 렌더 경로(로컬·NPC·순찰)가 이미
 *   그리고 있어, 여기서는 그림자가 없던 가구(y-sort prop)만 담당한다.
 *   가장 강한 근처 광원의 반대 방향으로 살짝 밀고 늘려 광원 방향과 맞춘다.
 */

import type * as Phaser from "phaser";
import {
  defaultProceduralSheetDeps,
  type ProceduralSheetDeps,
} from "./studio-virtual-space-character-procedural";
import type { StudioLightFixture } from "./studio-virtual-space-lighting";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  studioWorldPropDepth,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldPropDefinition,
} from "./studio-virtual-space-world-manifest";

/** 오브젝트 광원 동시 렌더 상한 (성능 가드). */
export const STUDIO_OBJECT_LIGHT_MAX = 24;
/** 광원 하나의 최대 알파. 국소 효과라도 이 이상 진해지지 않는다. */
export const STUDIO_OBJECT_LIGHT_ALPHA_MAX = 0.8;
/** 오브젝트 광원 글로우 깊이. 날씨 파티클(42_000) 아래, 존 베일(40_000) 위. */
export const STUDIO_OBJECT_LIGHT_DEPTH = 41_000;
/** 방사형 글로우 텍스처 키. */
export const STUDIO_LIGHT_GLOW_TEXTURE_KEY = "studio-object-light-glow";

/** 광원의 시간적 성격. */
export type StudioObjectLightCharacter = "steady" | "neon" | "screen" | "twinkle";

/** 렌더 가능한 오브젝트 광원 하나. */
export interface StudioObjectLight {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** 글로우 반경(px). 스프라이트는 지름(radius×2)으로 그린다. */
  readonly radius: number;
  /** 글로우 색상 (16진). */
  readonly color: number;
  /** 기본 세기 0~1 (디머 반영 후). */
  readonly intensity: number;
  readonly character: StudioObjectLightCharacter;
  /** 플리커·호흡 위상 시드 (id 해시). */
  readonly seed: number;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

/** 문자열 → 결정적 시드 (파티클 모듈과 같은 FNV-1a). */
export function studioLightSeedFromText(text: string): number {
  let hash = 2166136261;
  for (const character of text) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** 정수 해시 → 0~1 결정적 난수. */
function hash01(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
  x ^= x >>> 13;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const WARM_GLOW = 0xffc384;
const COOL_GLOW = 0xd6e7ff;
/** 네온사인 색상 팔레트. id 해시로 결정적으로 고른다. */
export const STUDIO_NEON_GLOW_PALETTE: readonly number[] = Object.freeze([
  0xff5da2, 0x4de3ff, 0xb6ff5d, 0xffd75d, 0xc95dff,
]);

/**
 * 조명 기구 목록 → 오브젝트 광원.
 * 꺼진 기구·디머 0·좌표가 깨진 기구는 제외한다. 종류별로 반경·세기·성격을 준다:
 * 천장등은 넓고 약하게, 스포트라이트는 좁고 또렷하게, 네온은 팔레트 색+플리커.
 */
export function buildStudioFixtureLights(
  fixtures: readonly StudioLightFixture[],
): readonly StudioObjectLight[] {
  const lights: StudioObjectLight[] = [];
  for (const fixture of fixtures) {
    if (!fixture.on || fixture.dimmer <= 0) continue;
    const { x, y } = fixture.position;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !(fixture.radius > 0)) continue;
    const dimmer = clamp01(fixture.dimmer);
    const seed = studioLightSeedFromText(fixture.id);
    const base = { id: fixture.id, x, y, seed };
    switch (fixture.kind) {
      case "ceiling-light":
        lights.push(Object.freeze({ ...base, radius: fixture.radius * 1.1, color: fixture.warm ? 0xffe9c4 : 0xeaf3ff, intensity: dimmer * 0.75, character: "steady" as const }));
        break;
      case "floor-lamp":
        lights.push(Object.freeze({ ...base, radius: fixture.radius, color: fixture.warm ? WARM_GLOW : COOL_GLOW, intensity: dimmer * 0.95, character: "steady" as const }));
        break;
      case "desk-lamp":
        lights.push(Object.freeze({ ...base, radius: fixture.radius * 0.9, color: fixture.warm ? WARM_GLOW : COOL_GLOW, intensity: dimmer * 0.9, character: "steady" as const }));
        break;
      case "spotlight":
        lights.push(Object.freeze({ ...base, radius: fixture.radius * 0.85, color: fixture.warm ? 0xfff1cf : 0xffffff, intensity: dimmer, character: "steady" as const }));
        break;
      case "string-lights":
        lights.push(Object.freeze({ ...base, radius: fixture.radius, color: fixture.warm ? 0xffd9a0 : COOL_GLOW, intensity: dimmer * 0.8, character: "twinkle" as const }));
        break;
      case "neon-sign":
        lights.push(Object.freeze({
          ...base,
          radius: fixture.radius,
          color: STUDIO_NEON_GLOW_PALETTE[seed % STUDIO_NEON_GLOW_PALETTE.length] ?? 0xff5da2,
          intensity: dimmer,
          character: "neon" as const,
        }));
        break;
    }
  }
  return Object.freeze(lights);
}

/** 화면(모니터·터미널·콘솔·상태판)으로 볼 prop id 패턴. */
const SCREEN_PROP_PATTERN = /(monitor|terminal|console|board)/i;

/**
 * 월드 prop 중 화면 오브젝트에서 나오는 은은한 색빛.
 * 책상·테이블 같은 무광 가구는 광원이 아니므로 제외한다.
 */
export function buildStudioScreenLights(
  manifest: Pick<StudioVirtualSpaceWorldManifest, "props">,
): readonly StudioObjectLight[] {
  const lights: StudioObjectLight[] = [];
  for (const prop of manifest.props) {
    if (!SCREEN_PROP_PATTERN.test(prop.id)) continue;
    if (!Number.isFinite(prop.x) || !Number.isFinite(prop.y)) continue;
    lights.push(Object.freeze({
      id: `screen:${prop.id}`,
      x: prop.x,
      y: prop.y - 16,
      radius: 96,
      color: 0x93ccff,
      intensity: 0.5,
      character: "screen" as const,
      seed: studioLightSeedFromText(prop.id),
    }));
  }
  return Object.freeze(lights);
}

/** 품질 등급 → 동시 광원 상한. dynamicLights가 꺼진 등급(배터리·접근성)은 0. */
export function studioObjectLightBudget(input: {
  readonly dynamicLights: boolean;
  readonly particleRatio: number;
}): { readonly maxLights: number } {
  if (!input.dynamicLights) return Object.freeze({ maxLights: 0 });
  const ratio = clamp01(input.particleRatio);
  return Object.freeze({
    maxLights: clamp(Math.round(8 + 16 * ratio), 1, STUDIO_OBJECT_LIGHT_MAX),
  });
}

/**
 * 상한 안에서 렌더할 광원을 고른다.
 * 점수 = 세기 × (1 + 반경/300) ÷ (1 + 중심과의 거리/700) — 밝고 넓고 가까운 순.
 * 동점은 id 순으로 결정적으로 정렬한다.
 */
export function selectStudioObjectLights(
  lights: readonly StudioObjectLight[],
  focus: StudioVirtualSpacePoint,
  maxLights: number,
): readonly StudioObjectLight[] {
  const max = Math.max(0, Math.floor(Number.isFinite(maxLights) ? maxLights : 0));
  if (max === 0 || lights.length === 0) return Object.freeze([]);
  if (lights.length <= max) return Object.freeze([...lights]);
  const scored = lights.map((light) => {
    const distance = Math.hypot(light.x - focus.x, light.y - focus.y);
    const score = light.intensity * (1 + light.radius / 300) / (1 + distance / 700);
    return { light, score };
  });
  scored.sort((a, b) => (b.score - a.score) || (a.light.id < b.light.id ? -1 : 1));
  return Object.freeze(scored.slice(0, max).map((entry) => entry.light));
}

/**
 * 네온 플리커 배율 (결정적). 대체로 0.9 이상을 유지하고, 가끔 짧게
 * 0.55~0.8까지 떨어지는 구간이 있어 실제 네온처럼 보인다.
 */
export function studioNeonFlicker(seed: number, timeMs: number): number {
  const t = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0;
  const shimmer = 0.94 + 0.06 * Math.sin(t * 0.021 + seed * 1.7) * Math.sin(t * 0.0073 + seed * 0.31);
  const step = Math.floor(t / 110);
  const h = hash01((seed | 0) * 131 + step * 17 + 7);
  const dip = h < 0.055 ? 0.55 : h < 0.12 ? 0.8 : 1;
  return clamp(shimmer * dip, 0.5, 1);
}

/** 광원 하나의 현재 프레임 스타일. */
export interface StudioObjectLightFrame {
  readonly alpha: number;
  readonly scale: number;
}

/**
 * 광원 + 시각 + 주야 상태 → 알파·스케일.
 * 어두울수록(darkness↑) 오브젝트 광원이 도드라지고, 낮에는 30%까지 옅어진다.
 * reduced-motion이면 플리커·호흡·트윙클을 모두 멈춰 정적인 빛으로 둔다.
 */
export function studioObjectLightFrame(
  light: StudioObjectLight,
  timeMs: number,
  options: {
    readonly darkness: number;
    readonly neonGlow: number;
    readonly reducedMotion: boolean;
  },
): StudioObjectLightFrame {
  const t = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0;
  const darkness = clamp01(options.darkness);
  const base = light.intensity * (0.3 + 0.7 * darkness);
  let factor = 1;
  if (light.character === "neon") {
    const flicker = options.reducedMotion ? 1 : studioNeonFlicker(light.seed, t);
    factor = flicker * (1 + 0.35 * clamp01(options.neonGlow));
  } else if (light.character === "screen") {
    factor = options.reducedMotion ? 1 : 0.92 + 0.08 * Math.sin(t * 0.0016 + light.seed * 2.3);
  } else if (light.character === "twinkle") {
    factor = options.reducedMotion ? 0.85 : Math.max(0.44, 0.72 + 0.28 * Math.sin(t * 0.0026 + light.seed * 3.1));
  }
  const breathing = !options.reducedMotion && (light.character === "neon" || light.character === "screen")
    ? 1 + 0.03 * Math.sin(t * 0.0011 + light.seed * 0.7)
    : 1;
  return Object.freeze({
    alpha: Math.round(clamp(base * factor, 0, STUDIO_OBJECT_LIGHT_ALPHA_MAX) * 1000) / 1000,
    scale: Math.round(breathing * 1000) / 1000,
  });
}

/* ---------------- 가구 블롭 섀도우 ---------------- */

/** 가구 블롭 섀도우 정의 (바닥에 붙는 prop만). */
export interface StudioPropShadow {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** 섀도우 타원 너비(px). 높이는 너비의 16%로 파생한다. */
  readonly width: number;
  /** prop 렌더 깊이 바로 아래. */
  readonly depth: number;
}

/**
 * 바닥에 서는 가구(y-sort prop)의 섀도우 목록.
 * 벽에 붙는 fixed prop(보드·월)은 바닥 그림자가 어색해 제외한다.
 */
export function buildStudioPropShadows(
  manifest: Pick<StudioVirtualSpaceWorldManifest, "props">,
): readonly StudioPropShadow[] {
  const shadows: StudioPropShadow[] = [];
  for (const prop of manifest.props as readonly StudioWorldPropDefinition[]) {
    if (prop.depth !== "y-sort") continue;
    if (!Number.isFinite(prop.x) || !Number.isFinite(prop.y)) continue;
    const width = clamp(prop.collider?.width ?? prop.width ?? 92, 44, 190);
    shadows.push(Object.freeze({
      id: `shadow:${prop.id}`,
      x: prop.x,
      y: prop.y + 2,
      width,
      depth: studioWorldPropDepth(prop) - 2,
    }));
  }
  return Object.freeze(shadows);
}

/** 섀도우 한 프레임의 배치. */
export interface StudioPropShadowFrame {
  readonly offsetX: number;
  readonly offsetY: number;
  /** 광원 반대 방향 각도(rad). */
  readonly angle: number;
  /** 광원 방향으로의 늘어남 배율 (1 = 원형 비율 유지). */
  readonly stretch: number;
  readonly alpha: number;
}

/**
 * 가장 강한 근처 광원을 찾아, 그 반대 방향으로 섀도우를 밀고 늘린다.
 * 광원이 없으면 발밑에 옅게 깔리는 기본 그림자로 둔다.
 * 어두울수록(darkness↑) 그림자가 조금 진해진다.
 */
export function studioPropShadowFrame(
  shadow: StudioPropShadow,
  lights: readonly StudioObjectLight[],
  darkness: number,
): StudioPropShadowFrame {
  const dark = clamp01(darkness);
  let best: StudioObjectLight | null = null;
  let bestStrength = 0;
  for (const light of lights) {
    const distance = Math.hypot(light.x - shadow.x, light.y - shadow.y);
    const reach = light.radius * 1.4;
    if (distance >= reach || reach <= 0) continue;
    const strength = light.intensity * (1 - distance / reach);
    if (strength > bestStrength) {
      best = light;
      bestStrength = strength;
    }
  }
  if (!best) {
    return Object.freeze({
      offsetX: 0, offsetY: 2, angle: 0, stretch: 1,
      alpha: Math.round((0.14 + 0.04 * dark) * 1000) / 1000,
    });
  }
  const dx = shadow.x - best.x;
  const dy = shadow.y - best.y;
  const length = Math.hypot(dx, dy);
  const ux = length > 0.001 ? dx / length : 0;
  const uy = length > 0.001 ? dy / length : 1;
  const push = 2 + 7 * bestStrength;
  return Object.freeze({
    offsetX: Math.round(ux * push * 100) / 100,
    offsetY: Math.round(uy * push * 100) / 100,
    angle: Math.round(Math.atan2(uy, ux) * 1000) / 1000,
    stretch: Math.round((1 + 0.3 * bestStrength) * 1000) / 1000,
    alpha: Math.round((0.15 + 0.09 * bestStrength + 0.04 * dark) * 1000) / 1000,
  });
}

/* ---------------- 글로우 텍스처 ---------------- */

/** 방사형 글로우 스프라이트 한 변(px). 중심이 가장 밝고 가장자리에서 0으로 사라진다. */
export const STUDIO_LIGHT_GLOW_SIZE = 128;

export interface StudioLightGlowSprite {
  readonly dataUrl: string;
  readonly size: number;
}

/**
 * 방사형 그라데이션 글로우 텍스처를 프로시저럴로 만든다.
 * 흰색 그라데이션 하나를 만들고, 실제 색은 렌더 시 스프라이트 틴트로 입힌다.
 */
export function buildStudioLightGlowSprite(
  deps: ProceduralSheetDeps = defaultProceduralSheetDeps(),
): StudioLightGlowSprite {
  const size = STUDIO_LIGHT_GLOW_SIZE;
  const canvas = deps.createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D 캔버스 컨텍스트를 만들지 못했습니다.");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.85)");
  gradient.addColorStop(0.35, "rgba(255, 255, 255, 0.38)");
  gradient.addColorStop(0.7, "rgba(255, 255, 255, 0.12)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return Object.freeze({ dataUrl: canvas.toDataURL("image/png"), size });
}

interface LightTextureLoader {
  image(key: string, url: string): unknown;
}

/** 글로우 텍스처를 로더에 올린다. 자체 프로시저럴 에셋이라 외부 파일이 필요 없다. */
export function queueStudioLightTextures(
  load: LightTextureLoader,
  deps: ProceduralSheetDeps = defaultProceduralSheetDeps(),
): void {
  const glow = buildStudioLightGlowSprite(deps);
  load.image(STUDIO_LIGHT_GLOW_TEXTURE_KEY, glow.dataUrl);
}

/** 실제 시계 → 하루 중 비율 0~1 (주야 사이클이 꺼져 있을 때의 대체 시계). */
export function studioLightRenderRealTimeOfDay(date: Date): number {
  const seconds = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  return clamp01(seconds / 86_400);
}

/* ---------------- 렌더 런타임 ---------------- */

export interface StudioLightRenderUpdateInput {
  readonly time: number;
  /** 페이지가 소유한 조명 기구 상태 (프리셋·주야 보정 적용 후). */
  readonly fixtures: readonly StudioLightFixture[];
  /** 환경광 밝기 0~1 (주야 사이클 또는 실제 시계에서 파생). */
  readonly ambientLevel: number;
  /** 주야 보정의 네온 추가 발광 0~1 (밤에 커진다). */
  readonly neonGlow: number;
  /** 광원 우선순위 기준점 (카메라 중심). */
  readonly focus: StudioVirtualSpacePoint;
  /** 품질 등급의 동적 조명 허용 여부. */
  readonly dynamicLights: boolean;
  /** 품질 등급 파티클 비율 (광원 상한 스케일에 재사용). */
  readonly particleRatio: number;
  readonly reducedMotion: boolean;
}

interface ShadowVisual {
  readonly def: StudioPropShadow;
  readonly ellipse: Phaser.GameObjects.Ellipse;
}

/**
 * 오브젝트 광원 + 가구 섀도우 렌더 런타임.
 * 생성·갱신·해제는 캔버스의 cleanup 체인을 따른다.
 */
export class StudioVirtualLightRenderRuntime {
  private readonly glowSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly shadowVisuals: ShadowVisual[] = [];
  private readonly screenLights: readonly StudioObjectLight[];

  constructor(
    private readonly scene: Pick<Phaser.Scene, "add" | "textures">,
    manifest: StudioVirtualSpaceWorldManifest,
  ) {
    this.screenLights = buildStudioScreenLights(manifest);
    for (const def of buildStudioPropShadows(manifest)) {
      const height = Math.max(8, Math.round(def.width * 0.16));
      const ellipse = scene.add.ellipse(def.x, def.y + 2, def.width, height, 0x16121e, 0.16)
        .setDepth(def.depth);
      this.shadowVisuals.push({ def, ellipse });
    }
  }

  /** 현재 렌더 중인 광원 스프라이트 수 (진단·테스트용). */
  get lightSpriteCount(): number {
    return this.glowSprites.size;
  }

  /** 생성된 가구 섀도우 수 (진단·테스트용). */
  get shadowCount(): number {
    return this.shadowVisuals.length;
  }

  update(input: StudioLightRenderUpdateInput): void {
    const darkness = 1 - clamp01(input.ambientLevel);
    const budget = studioObjectLightBudget({
      dynamicLights: input.dynamicLights,
      particleRatio: input.particleRatio,
    });
    const all = [...buildStudioFixtureLights(input.fixtures), ...this.screenLights];
    const selected = selectStudioObjectLights(all, input.focus, budget.maxLights);

    const alive = new Set<string>();
    if (this.scene.textures.exists(STUDIO_LIGHT_GLOW_TEXTURE_KEY)) {
      for (const light of selected) {
        const frame = studioObjectLightFrame(light, input.time, {
          darkness,
          neonGlow: input.neonGlow,
          reducedMotion: input.reducedMotion,
        });
        let sprite = this.glowSprites.get(light.id);
        if (!sprite) {
          sprite = this.scene.add.image(light.x, light.y, STUDIO_LIGHT_GLOW_TEXTURE_KEY)
            .setDepth(STUDIO_OBJECT_LIGHT_DEPTH)
            .setBlendMode("ADD");
          this.glowSprites.set(light.id, sprite);
        }
        alive.add(light.id);
        const diameter = light.radius * 2 * frame.scale;
        sprite.setPosition(light.x, light.y)
          .setTint(light.color)
          .setDisplaySize(diameter, diameter)
          .setAlpha(frame.alpha)
          .setVisible(frame.alpha > 0.01);
      }
    }
    for (const [id, sprite] of this.glowSprites) {
      if (!alive.has(id)) {
        sprite.destroy();
        this.glowSprites.delete(id);
      }
    }

    for (const visual of this.shadowVisuals) {
      const frame = studioPropShadowFrame(visual.def, selected, darkness);
      visual.ellipse
        .setPosition(visual.def.x + frame.offsetX, visual.def.y + frame.offsetY)
        .setRotation(frame.angle)
        .setScale(frame.stretch, 1)
        .setAlpha(frame.alpha);
    }
  }

  destroy(): void {
    for (const sprite of this.glowSprites.values()) sprite.destroy();
    this.glowSprites.clear();
    for (const visual of this.shadowVisuals) visual.ellipse.destroy();
    this.shadowVisuals.length = 0;
  }
}
