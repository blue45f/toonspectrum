import type * as Phaser from "phaser";
import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import { studioCharacterAtlasGridFrames, type StudioCharacterAtlasLayout } from "./studio-virtual-space-character-atlas";
import type { StudioCharacterFramePresentation } from "./studio-virtual-space-character-skins";
import { stepStudioCatExpression, type StudioCatExpressionState } from "./studio-virtual-space-expressions";
import { studioExperienceFrameGeometry } from "./studio-virtual-space-experience-art";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioRenderViewport } from "./studio-virtual-space-presentation";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { studioVirtualWorldPresentation } from "./studio-virtual-space-world-presentation";
import { studioZoneLightModifier } from "./studio-virtual-space-lighting";
import type { StudioOfficeZoneType } from "./studio-virtual-space-office-zones";
import { studioVirtualWorldSetDressing } from "./studio-virtual-space-world-set-dressing";

export const STUDIO_EXPERIENCE_ATLAS: StudioCharacterAtlasLayout = Object.freeze({
  width: 1254, height: 1254, columns: 4, rows: 4, slicing: "rounded-grid",
});

interface RoundedTexture {
  getSourceImage(): { readonly width: number; readonly height: number };
  has(frame: string): boolean;
  add(frame: number, source: number, x: number, y: number, width: number, height: number): unknown;
}

/** 원본 크기가 계약과 일치한 image에만 프레임을 등록한다. 다른 이미지의 자동 격자 추정은 하지 않는다. */
export function registerStudioSceneAtlas(texture: RoundedTexture, atlas: StudioCharacterAtlasLayout): boolean {
  const source = texture.getSourceImage();
  const frames = studioCharacterAtlasGridFrames(atlas);
  if (source.width !== atlas.width || source.height !== atlas.height || frames.length === 0) return false;
  for (const frame of frames) if (!texture.has(String(frame.index))) {
    texture.add(frame.index, 0, frame.x, frame.y, frame.width, frame.height);
  }
  return true;
}

/** 생성 원본의 발 중심과 불투명 몸 높이를 측정했다. 기존 384×512 standing의 430px 몸 높이를 보존한다. */
export const STUDIO_ACTOR_EXPRESSION_PRESENTATION: readonly StudioCharacterFramePresentation[] = Object.freeze([
  [.656051, .964968, .890915], [.520767, .964968, .890915], [.436102, .964968, .887916], [.334395, .964968, .890915],
  [.627389, .984026, .853478], [.528754, .984026, .853478], [.423323, .984026, .853478], [.342357, .984026, .853478],
  [.625796, 1, .839844], [.527157, 1, .842536], [.4377, 1, .839844], [.343949, 1, .839844],
  [.627389, .984076, .884936], [.533546, .980892, .890915], [.4377, .980892, .887916], [.350318, .980892, .893935],
].map(([originX, originY, displayHeightRatio]) => Object.freeze({ originX: originX!, originY: originY!, displayHeightRatio: displayHeightRatio! })));

/** 생성기 표현 힌트(캠퍼스 0.65 등)를 우선하고, 없으면 장식이 있는 내장 장소만 작은 배우를 쓴다. */
export function studioSceneActorScale(world: StudioVirtualSpaceWorldManifest): number {
  const presentation = studioVirtualWorldPresentation(world);
  if (presentation) return presentation.actorScale;
  return studioVirtualWorldSetDressing(world).length > 0 ? .65 : 1;
}

/**
 * 내장 장소는 입장할 때 건축물과 남쪽 입구가 함께 보인다. 화면 밖 여백도 월드 중심에 정렬한다.
 * 추종 카메라(캠퍼스)는 고정 프레임을 쓰지 않는다.
 */
export function studioSceneCameraFrame(world: StudioVirtualSpaceWorldManifest, width: number, height: number, deviceRatio = 1) {
  if (studioVirtualWorldPresentation(world)?.camera === "follow") return null;
  if (studioVirtualWorldSetDressing(world).length === 0 || width < 760) return null;
  const viewport = studioRenderViewport(width, height, deviceRatio);
  const insetScale = Math.min(1.05, viewport.cssWidth / (world.width + 48), (viewport.cssHeight - 70) / (world.height + 48));
  // 낮은 가로 창에서는 캐릭터 가독성을 우선하고, 충분한 높이에서는 아래 조작 HUD 공간을 남긴다.
  const bottomInset = insetScale >= .6 ? 70 : 0;
  const contentHeight = viewport.cssHeight - bottomInset;
  const scale = Math.min(1.05, viewport.cssWidth / (world.width + 48), contentHeight / (world.height + 48));
  const boundsWidth = viewport.cssWidth / scale, boundsHeight = viewport.cssHeight / scale;
  return { zoom: scale * viewport.ratio, bottomInset, bounds: {
    x: (world.width - boundsWidth) / 2, y: (world.height - contentHeight / scale) / 2,
    width: boundsWidth, height: boundsHeight,
  } };
}

/** 작은 화면과 전체 보기에서 이름표를 최소 원래 CSS 글자 크기로 유지한다. */
export function studioSceneOverlayScale(actorScale: number, zoom: number, deviceRatio: number): number {
  return actorScale < 1 && Number.isFinite(zoom) && zoom > 0 && Number.isFinite(deviceRatio)
    ? Math.max(1, deviceRatio / zoom) : 1;
}

interface SceneArtKeys { readonly landmarks: string; readonly furniture?: string; readonly cat?: string; readonly artStyle?: StudioVirtualArtStyleKey }

/** 장식의 바닥 충돌은 manifest가 소유한다. 이 런타임은 이미지와 제자리 표정만 관리한다. */
export class StudioVirtualSetDressingRuntime {
  private readonly visuals: Array<Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics> = [];
  private readonly cats: Array<{ readonly id: string; readonly sprite: Phaser.GameObjects.Sprite; state: StudioCatExpressionState | null }> = [];
  private readonly arches: Array<{ readonly sprite: Phaser.GameObjects.Sprite; readonly width: number; readonly height: number; alpha: number }> = [];
  private lastUpdateTime: number | null = null;
  readonly itemCount: number;

  constructor(scene: Pick<Phaser.Scene, "add" | "textures">, world: StudioVirtualSpaceWorldManifest, keys: SceneArtKeys, palette: { readonly room: number; readonly wall: number }) {
    const items = studioVirtualWorldSetDressing(world);
    this.itemCount = items.length;
    for (const item of items) {
      const animatedCat = item.atlas === "furniture" && item.frame === 11 && keys.cat && scene.textures.exists(keys.cat);
      const key = animatedCat ? keys.cat : keys[item.atlas];
      const depth = item.depth === "y-sort" ? Math.round(item.y) + 1_000 : item.depth;
      if (key && scene.textures.exists(key)) {
        const petScale = item.atlas === "furniture" && item.frame === 11 ? Math.min(.65, 40 / item.height) : 1;
        const width = item.width * petScale, height = item.height * petScale;
        const geometry = !animatedCat && keys.artStyle
          ? studioExperienceFrameGeometry(item.atlas, keys.artStyle, item.frame, width, height, item.originX, item.originY)
          : { width, height, originX: item.originX, originY: item.originY };
        const sprite = scene.add.sprite(item.x, item.y, key, animatedCat ? 0 : item.frame)
          .setOrigin(geometry.originX, geometry.originY).setDisplaySize(geometry.width, geometry.height).setDepth(depth);
        this.visuals.push(sprite);
        if (animatedCat) this.cats.push({ id: item.id, sprite, state: null });
        if (item.atlas === "landmarks" && item.frame === 6) this.arches.push({ sprite, width: item.width, height: item.height, alpha: 1 });
      } else if (item.colliders.length > 0) {
        // 선택 아트가 실패해도 보이지 않는 벽을 남기지 않는다. 실제 바닥 면적에 낮은 입체 표식을 표시한다.
        const fallback = scene.add.graphics().setDepth(depth);
        for (const rect of item.colliders) {
          fallback.fillStyle(palette.wall, .88).fillRoundedRect(rect.x, rect.y - 18, rect.width, rect.height + 18, 8);
          fallback.fillStyle(palette.room, .92).fillRoundedRect(rect.x, rect.y - 18, rect.width, rect.height, 8);
        }
        this.visuals.push(fallback);
      }
    }
  }

  update(time: number, point: StudioVirtualSpacePoint, reducedMotion: boolean, playerSpeed: number): void {
    const delta = this.lastUpdateTime === null ? 1 : Math.min(1, Math.max(0, time - this.lastUpdateTime) / 140);
    this.lastUpdateTime = time;
    for (const arch of this.arches) {
      // 기둥 사이 통로에서만 상부 아치를 비쳐 입장 캐릭터를 보인다. 바닥 충돌이나 정렬은 바꾸지 않는다.
      const insidePassage = Math.abs(point.x - arch.sprite.x) < arch.width * .27
        && point.y <= arch.sprite.y && point.y >= arch.sprite.y - arch.height;
      const target = insidePassage ? .28 : 1;
      arch.alpha += (target - arch.alpha) * (reducedMotion ? 1 : delta);
      arch.sprite.setAlpha(arch.alpha);
    }
    for (const cat of this.cats) {
      const next = stepStudioCatExpression(cat.state, { time, distance: Math.hypot(cat.sprite.x - point.x, cat.sprite.y - point.y),
        playerSpeed, reducedMotion, identity: cat.id });
      cat.state = next.state;
      cat.sprite.setFrame(next.frame);
    }
  }

  destroy(): void {
    this.visuals.splice(0).forEach((visual) => visual.destroy());
    this.cats.splice(0);
    this.arches.splice(0);
  }
}

/**
 * 오피스 존 씬 틴트 (Track D).
 *
 * 존 종류 + 주변광 밝기 → 씬 아트에 적용할 틴트 데이터.
 * 렌더러는 이 값을 스프라이트/오버레이 틴트에 적용한다.
 * 순수 데이터 함수 — Phaser 객체를 건드리지 않는다.
 */
export interface StudioSceneZoneTint {
  /** 틴트 색상 (0xRRGGBB). */
  readonly tint: number;
  /** 틴트 강도 (0~1). */
  readonly alpha: number;
}

export function studioSceneZoneTint(
  zoneType: StudioOfficeZoneType,
  ambientLevel: number,
): StudioSceneZoneTint {
  const modifier = studioZoneLightModifier(zoneType);
  const parsed = Number.parseInt(modifier.tint.slice(1), 16);
  const clampedLevel = Math.min(1, Math.max(0, ambientLevel));
  // 어두운 시간대일수록 존 틴트를 약하게 유지해 자연스러움을 해치지 않는다.
  const alpha = Math.round(Math.min(0.35, modifier.tintStrength * (0.5 + clampedLevel * 0.5)) * 100) / 100;
  return Object.freeze({ tint: Number.isFinite(parsed) ? parsed : 0xffffff, alpha });
}
