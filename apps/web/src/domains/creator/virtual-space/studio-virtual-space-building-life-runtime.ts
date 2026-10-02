/**
 * 가상 스튜디오 건물 생동감 렌더 런타임 (건물 생동감 트랙)
 *
 * 창문 점등·가로등 빛 웅덩이·오브젝트 블롭 섀도우·건물 접지 AO를 Phaser로 그린다.
 * 순수 계산은 `studio-virtual-space-building-life`가 맡고, 이 런타임은 소유·갱신·해제만 한다.
 *
 * - GPU 원칙: 그라디언트·창문·글로우는 생성 시점에 텍스처로 한 번만 굽고,
 *   프레임 중에는 스프라이트의 알파·스케일·텍스처 교체만 한다 (CPU 재드로우 없음).
 *   발광 표현은 전부 같은 글로우 텍스처 1장을 틴트·ADD 블렌드로 공유한다.
 * - 갱신은 150ms tick으로 제한하고, 카메라 밖 스프라이트는 숨긴다.
 * - 시간대 전환은 목표값을 지수 감쇠로 잇는다 (약 1.4초). reduced-motion에서는
 *   감쇠·깜빡임·호흡 없이 정적 상태로 즉시 고정한다 (켜진 상태 자체는 유지).
 * - 전면 틴트·오버레이는 만들지 않는다. 하늘 틴트는 Canvas가 지평선 아트워크에
 *   위상 변경 시 1회만 적용한다 (이 런타임 소관이 아니다).
 */

import type * as Phaser from "phaser";

import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import {
  STUDIO_BUILDING_LIFE_LEVELS,
  STUDIO_BUILDING_WINDOW_TICK_MS,
  STUDIO_STREET_LAMP_HEAD_GLOW,
  STUDIO_STREET_LAMP_POOL_SIZE,
  buildStudioBuildingAoStrips,
  buildStudioBuildingObjectShadows,
  buildStudioBuildingWindows,
  buildStudioStreetLampAnchors,
  studioBuildingLifeBudget,
  studioBuildingLifeLerpLevels,
  studioBuildingLifePhaseFor,
  studioBuildingShadowFrame,
  studioBuildingWindowState,
  type StudioBuildingAoStrip,
  type StudioBuildingLifeLevels,
  type StudioBuildingObjectShadow,
  type StudioBuildingWindow,
  type StudioStreetLampAnchor,
} from "./studio-virtual-space-building-life";
import type { StudioCampusLifePhase, StudioCampusLifeQuality } from "./studio-virtual-space-campus-life";
import { CAMPUS_TILE } from "./studio-virtual-space-campus-blueprint";
import {
  CAMPUS_ART,
  campusGradientStripTexture,
  campusRadialGlowTexture,
  campusWindowTexture,
} from "./studio-virtual-space-campus-textures";
import type { StudioCampusScene } from "./studio-virtual-space-campus-world";
import type { StudioWorldRect } from "./studio-virtual-space-world-manifest";

type BuildingLifeScene = Pick<Phaser.Scene, "add" | "textures">;

/** 빛 웅덩이 깊이: 바닥 데칼(-900) 위, 게이트 고리(-898) 위. */
const POOL_DEPTH = -897;
/** 뷰 컬링 여유(px). 이만큼 밖의 스프라이트는 숨기고 갱신하지 않는다. */
const VIEW_MARGIN = 160;
/** 시간대 전환 감쇠 시간 상수(ms). */
const LEVEL_EASE_MS = 450;

/** 캠퍼스 런타임이 한 번 만들어 값만 바꿔 넣는 입력 (lifeFrame과 같은 패턴이라 가변이다). */
export interface StudioBuildingLifeFrame {
  time: number;
  phase: StudioCampusLifePhase;
  reducedMotion: boolean;
  quality: StudioCampusLifeQuality | null;
  view: StudioWorldRect;
}

interface WindowVisual {
  readonly def: StudioBuildingWindow;
  readonly image: Phaser.GameObjects.Image;
  readonly litTint: number;
  lit: boolean;
}

interface LampVisual {
  readonly def: StudioStreetLampAnchor;
  readonly pool: Phaser.GameObjects.Image;
  readonly head: Phaser.GameObjects.Image;
}

interface ShadowVisual {
  readonly def: StudioBuildingObjectShadow;
  readonly image: Phaser.GameObjects.Image;
  /** setDisplaySize가 만든 기본 배율. 시간대 늘어남은 여기에 곱한다. */
  readonly baseScaleX: number;
  readonly baseScaleY: number;
}

interface AoVisual {
  readonly def: StudioBuildingAoStrip;
  readonly image: Phaser.GameObjects.Image;
}

/** 따뜻한 색온도 변형: 창마다 틴트를 조금씩 달리해 같은 창이 반복돼 보이지 않게 한다. */
function litTintOf(warmth: number): number {
  const mix = (from: number, to: number) => Math.round(from + (to - from) * warmth);
  return (mix(255, 255) << 16) | (mix(255, 226) << 8) | mix(255, 176);
}

function inView(x: number, y: number, view: StudioWorldRect): boolean {
  return x >= view.x - VIEW_MARGIN && x <= view.x + view.width + VIEW_MARGIN
    && y >= view.y - VIEW_MARGIN && y <= view.y + view.height + VIEW_MARGIN;
}

export class StudioBuildingLifeRuntime {
  private readonly windows: WindowVisual[] = [];
  private readonly lamps: LampVisual[] = [];
  private readonly shadows: ShadowVisual[] = [];
  private readonly aoStrips: AoVisual[] = [];
  private readonly darkWindowKey: string;
  private readonly litWindowKey: string;
  private currentLevels: StudioBuildingLifeLevels = STUDIO_BUILDING_LIFE_LEVELS.day;
  private lastTime: number | null = null;
  private lastTick = Number.NEGATIVE_INFINITY;
  private litCount = 0;

  constructor(
    scene: BuildingLifeScene,
    campus: StudioCampusScene,
    options: { readonly style: StudioVirtualArtStyleKey },
  ) {
    this.darkWindowKey = campusWindowTexture(scene, false, options.style);
    this.litWindowKey = campusWindowTexture(scene, true, options.style);
    const glowKey = campusRadialGlowTexture(scene);
    const stripKey = campusGradientStripTexture(scene);

    for (const def of buildStudioBuildingWindows(campus.walls)) {
      const image = scene.add.image(def.x, def.y, this.darkWindowKey).setDepth(def.depth);
      this.windows.push({ def, image, litTint: litTintOf(def.warmth), lit: false });
    }
    for (const def of buildStudioStreetLampAnchors(campus.objects)) {
      const pool = scene.add.image(def.baseX, def.baseY + 4, glowKey)
        .setDepth(POOL_DEPTH).setTint(0xffc384).setBlendMode("ADD").setAlpha(0).setVisible(false);
      const head = scene.add.image(def.headX, def.headY, glowKey)
        .setDepth(Math.round(def.baseY) + 1_001).setTint(0xffd9a0).setBlendMode("ADD").setAlpha(0).setVisible(false)
        .setDisplaySize(STUDIO_STREET_LAMP_HEAD_GLOW, STUDIO_STREET_LAMP_HEAD_GLOW);
      this.lamps.push({ def, pool, head });
    }
    for (const def of buildStudioBuildingObjectShadows(campus.objects)) {
      const image = scene.add.image(def.x, def.y, glowKey)
        .setDepth(def.depth).setTint(CAMPUS_ART.shadow)
        .setDisplaySize(def.width, Math.max(10, Math.round(def.width * 0.34)));
      this.shadows.push({ def, image, baseScaleX: image.scaleX, baseScaleY: image.scaleY });
    }
    for (const def of buildStudioBuildingAoStrips(campus.zones, CAMPUS_TILE)) {
      const image = scene.add.image(def.x, def.y, stripKey)
        .setOrigin(0, 0).setDepth(def.depth).setTint(CAMPUS_ART.shadow).setAlpha(0.32)
        .setDisplaySize(def.width, def.length);
      this.aoStrips.push({ def, image });
    }
  }

  /** 현재(감쇠 적용 후) 생동감 목표값. 캠퍼스 런타임이 네온 강조에 쓴다. */
  get levels(): StudioBuildingLifeLevels {
    return this.currentLevels;
  }

  /** 진단·테스트용 스프라이트 집계. */
  get diagnostics(): {
    readonly windows: number; readonly litWindows: number; readonly lamps: number;
    readonly shadows: number; readonly aoStrips: number; readonly sprites: number;
  } {
    return Object.freeze({
      windows: this.windows.length,
      litWindows: this.litCount,
      lamps: this.lamps.length,
      shadows: this.shadows.length,
      aoStrips: this.aoStrips.length,
      sprites: this.windows.length + this.lamps.length * 2 + this.shadows.length + this.aoStrips.length,
    });
  }

  update(frame: StudioBuildingLifeFrame): void {
    const { time, reducedMotion } = frame;
    const dt = this.lastTime === null ? 0 : Math.max(0, Math.min(1000, time - this.lastTime));
    this.lastTime = time;
    const target = STUDIO_BUILDING_LIFE_LEVELS[studioBuildingLifePhaseFor(frame.phase)];
    const factor = reducedMotion ? 1 : 1 - Math.exp(-dt / LEVEL_EASE_MS);
    this.currentLevels = studioBuildingLifeLerpLevels(this.currentLevels, target, factor);

    if (time - this.lastTick < STUDIO_BUILDING_WINDOW_TICK_MS && this.lastTick !== Number.NEGATIVE_INFINITY) return;
    this.lastTick = time;

    const budget = studioBuildingLifeBudget({
      dynamicLights: frame.quality?.dynamicLights ?? true,
      particleRatio: frame.quality?.particleRatio ?? 1,
    });
    const levels = this.currentLevels;
    const view = frame.view;

    // 창문: 뷰 안쪽을 먼저 처리해 발광 예산을 보이는 창에 우선 쓴다.
    let litBudget = budget.dynamic ? budget.maxLitWindows : 0;
    let litTotal = 0;
    const ordered = [...this.windows].sort((a, b) => {
      const aIn = inView(a.def.x, a.def.y, view) ? 0 : 1;
      const bIn = inView(b.def.x, b.def.y, view) ? 0 : 1;
      return aIn - bIn;
    });
    for (const visual of ordered) {
      const visible = inView(visual.def.x, visual.def.y, view);
      visual.image.setVisible(visible);
      if (!visible) continue;
      const state = studioBuildingWindowState(visual.def, levels, time, reducedMotion);
      const lit = state.lit && litBudget > 0;
      if (lit) { litBudget -= 1; litTotal += 1; }
      if (lit !== visual.lit) {
        visual.lit = lit;
        visual.image.setTexture(lit ? this.litWindowKey : this.darkWindowKey);
        visual.image.setTint(lit ? visual.litTint : 0xffffff);
      }
      visual.image.setAlpha(lit ? state.alpha : 1);
    }
    this.litCount = litTotal;

    // 가로등: 켜짐 세기는 시간대 목표값을 그대로 따른다 (상시 번쩍임 없음).
    let pools = budget.dynamic ? budget.maxPools : 0;
    for (const lamp of this.lamps) {
      const visible = inView(lamp.def.baseX, lamp.def.baseY, view);
      const on = visible && levels.lampGlow > 0.02 && pools > 0;
      if (on) pools -= 1;
      const poolAlpha = on ? Math.round(0.5 * levels.lampGlow * 1000) / 1000 : 0;
      lamp.pool.setVisible(poolAlpha > 0.01)
        .setAlpha(poolAlpha)
        .setDisplaySize(
          STUDIO_STREET_LAMP_POOL_SIZE.width * budget.glowScale,
          STUDIO_STREET_LAMP_POOL_SIZE.height * budget.glowScale,
        );
      const headAlpha = on ? Math.round(0.8 * levels.lampGlow * 1000) / 1000 : 0;
      lamp.head.setVisible(headAlpha > 0.01).setAlpha(headAlpha);
    }

    // 오브젝트 블롭 섀도우: 시간대 방향·길이·진하기를 일괄 적용한다.
    const shadowFrame = studioBuildingShadowFrame(levels);
    for (const shadow of this.shadows) {
      const visible = inView(shadow.def.x, shadow.def.y, view);
      shadow.image.setVisible(visible);
      if (!visible) continue;
      shadow.image
        .setPosition(shadow.def.x + shadowFrame.offsetX, shadow.def.y + shadowFrame.offsetY)
        .setScale(shadow.baseScaleX * shadowFrame.scaleX, shadow.baseScaleY)
        .setAlpha(shadowFrame.alpha);
    }

    // 접지 AO: 길이만 시간대를 따라 늘었다 줄었다 한다. 띠는 구역 전체 폭이라
    // 중심점이 아니라 구간 겹침으로 컬링한다.
    for (const strip of this.aoStrips) {
      const visible = strip.def.x + strip.def.width >= view.x - VIEW_MARGIN
        && strip.def.x <= view.x + view.width + VIEW_MARGIN
        && strip.def.y + strip.def.length * levels.aoLength >= view.y - VIEW_MARGIN
        && strip.def.y <= view.y + view.height + VIEW_MARGIN;
      strip.image.setVisible(visible);
      if (!visible) continue;
      strip.image.setDisplaySize(strip.def.width, Math.round(strip.def.length * levels.aoLength));
    }
  }

  destroy(): void {
    for (const visual of this.windows) visual.image.destroy();
    for (const lamp of this.lamps) { lamp.pool.destroy(); lamp.head.destroy(); }
    for (const shadow of this.shadows) shadow.image.destroy();
    for (const strip of this.aoStrips) strip.image.destroy();
    this.windows.length = 0;
    this.lamps.length = 0;
    this.shadows.length = 0;
    this.aoStrips.length = 0;
  }
}
