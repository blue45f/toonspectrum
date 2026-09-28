import type * as Phaser from "phaser";
import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";

import {
  STUDIO_VIRTUAL_ACCESSORY_FRAME,
  STUDIO_VIRTUAL_DECOR_FRAME,
  type StudioVirtualCharacterCustomization,
  type StudioVirtualDecorationState,
  type StudioVirtualDecorPlacement,
  type StudioVirtualDecorType,
} from "./studio-virtual-space-customization";
import { studioVirtualDecorCollider } from "./studio-virtual-space-decoration-layout";
import { stepStudioCatExpression, type StudioCatExpressionState } from "./studio-virtual-space-expressions";
import { studioExperienceFrameGeometry } from "./studio-virtual-space-experience-art";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";

export interface StudioDecorationTextureKeys {
  readonly decor: string;
  readonly accessory: string;
  readonly furniture?: string;
  readonly cat?: string;
  readonly illustratedFurniture?: boolean;
  readonly artStyle?: StudioVirtualArtStyleKey;
  /**
   * assetId → 이미 로드된 커스텀 가구 텍스처 키.
   *
   * 아틀라스 키에 섞지 않는다. furniture/landmark 키는 테마별 아틀라스 전체를 가리켜야
   * 하고, 그 계약이 깨지면 이전 테마의 사각형이 남는다. 커스텀 가구는 호출자가
   * 별도로 등록한 키를 쓴다.
   */
  readonly customFurniture?: Readonly<Record<string, string>>;
}

interface ActorCosmeticVisual {
  readonly accessory: Phaser.GameObjects.Sprite;
  readonly aura: Phaser.GameObjects.Ellipse;
  readonly trails: Phaser.GameObjects.Arc[];
  lastTrailAt: number;
}

const DIRECTION_FRAME: Readonly<Record<StudioVirtualSpaceFacing, number>> = Object.freeze({ down: 0, right: 1, left: 2, up: 3 });
const AURA_COLOR = Object.freeze({ none: 0, sparkle: 0xffe58a, focus: 0x72ddc6, neon: 0x57e8ff });
const NAMEPLATE_COLOR = Object.freeze({ violet: "#d7c8ff", rose: "#ffc2db", sky: "#bde8ff", amber: "#ffe09a" });
export class StudioVirtualDecorationRuntime {
  private readonly decorationSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly decorationColliders: Phaser.Physics.Arcade.Collider[] = [];
  private readonly decorationBodies: Phaser.GameObjects.Zone[] = [];
  private readonly actorVisuals = new Map<string, ActorCosmeticVisual>();
  private readonly catExpressions = new Map<string, StudioCatExpressionState>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.GameObjects.GameObject,
    private readonly keys: StudioDecorationTextureKeys,
  ) {}

  /**
   * 커스텀 가구는 아틀라스 프레임이 없다. 로드된 텍스처가 없으면 null 을 돌려
   * 스프라이트를 만들지 않는다. 아틀라스 번호로 대신 그리면 엉뚱한 가구가 서게 된다.
   */
  private textureFor(placement: Pick<StudioVirtualDecorPlacement, "type" | "assetId">) {
    const type = placement.type;
    if (type === "custom") {
      const assetId = placement.assetId;
      const key = assetId ? this.keys.customFurniture?.[assetId] : undefined;
      if (!key || !this.scene.textures.exists(key)) return null;
      return { frame: 0, texture: key, cat: false, furniture: false, custom: true };
    }
    const cat = type === "pet" && this.keys.cat && this.scene.textures.exists(this.keys.cat) ? this.keys.cat : null;
    const requestedFrame = STUDIO_VIRTUAL_DECOR_FRAME[type];
    const furniture = this.keys.furniture && this.scene.textures.exists(this.keys.furniture)
      && (this.keys.illustratedFurniture || requestedFrame >= 12) ? this.keys.furniture : null;
    const frame = cat ? 0 : furniture || requestedFrame < 12 ? requestedFrame
      : requestedFrame === 15 ? 2 : requestedFrame === 12 ? 5 : 9;
    return { frame, texture: cat ?? furniture ?? this.keys.decor, cat: Boolean(cat), furniture: Boolean(furniture && !cat), custom: false };
  }

  private geometryFor(visual: NonNullable<ReturnType<StudioVirtualDecorationRuntime["textureFor"]>>, size: number) {
    return visual.furniture && this.keys.artStyle
      ? studioExperienceFrameGeometry("furniture", this.keys.artStyle, visual.frame, size, size, .5, .9)
      : { width: size, height: size, originX: .5, originY: .9 };
  }

  /** 늦게 도착한 선택 아트만 교체한다. 배치·각도·크기·물리 body는 다시 만들지 않는다. */
  refreshTextures(): void {
    for (const sprite of this.decorationSprites.values()) {
      const visual = this.textureFor({
        type: sprite.getData("decorType") as StudioVirtualDecorType,
        assetId: sprite.getData("decorAssetId") as string | undefined,
      });
      if (!visual || sprite.texture.key === visual.texture) continue;
      const geometry = this.geometryFor(visual, Number(sprite.getData("decorNominalSize")));
      sprite.setTexture(visual.texture, visual.frame).setDisplaySize(geometry.width, geometry.height)
        .setOrigin(geometry.originX, geometry.originY).setData("catExpressionAtlas", visual.cat);
      sprite.setData("baseScaleX", sprite.scaleX).setData("baseScaleY", sprite.scaleY);
    }
  }

  syncDecorations(state: StudioVirtualDecorationState): void {
    this.decorationColliders.splice(0).forEach((collider) => collider.destroy());
    this.decorationBodies.splice(0).forEach((body) => body.destroy());
    this.decorationSprites.forEach((sprite) => sprite.destroy());
    this.decorationSprites.clear();
    const catIds = new Set(state.placements.filter((item) => item.type === "pet").map((item) => item.id));
    for (const id of this.catExpressions.keys()) if (!catIds.has(id)) this.catExpressions.delete(id);
    for (const placement of state.placements) {
      const visual = this.textureFor(placement);
      // 아직 로드되지 않은 커스텀 가구는 화면에 올리지 않는다.
      if (!visual) continue;
      const geometry = this.geometryFor(visual, 82 * placement.scale);
      const sprite = this.scene.add.sprite(placement.x, placement.y, visual.texture, visual.frame)
        .setDisplaySize(geometry.width, geometry.height)
        .setAngle(placement.rotation)
        .setOrigin(geometry.originX, geometry.originY)
        .setDepth(Math.round(placement.y) + 948)
        .setData("decorType", placement.type)
        .setData("decorAssetId", placement.assetId ?? "")
        .setData("decorNominalSize", 82 * placement.scale)
        .setData("catExpressionAtlas", visual.cat);
      sprite.setData("baseScaleX", sprite.scaleX).setData("baseScaleY", sprite.scaleY);
      const collider = studioVirtualDecorCollider(placement);
      if (collider) {
        // 연출용 회전·펄스와 분리한 발밑 충돌 면적을 길찾기와 공유한다.
        const body = this.scene.add.zone(collider.x, collider.y, collider.width, collider.height).setOrigin(0);
        this.scene.physics.add.existing(body, true);
        this.decorationBodies.push(body);
        this.decorationColliders.push(this.scene.physics.add.collider(this.player, body));
      }
      this.decorationSprites.set(placement.id, sprite);
    }
  }
  update(time: number, playerPoint: StudioVirtualSpacePoint, reducedMotion: boolean, playerSpeed = 0): void {
    let visualIndex = 0;
    for (const [id, sprite] of this.decorationSprites) {
      const index = visualIndex++;
      const distance = Math.hypot(sprite.x - playerPoint.x, sprite.y - playerPoint.y);
      const near = distance < 92;
      const type = String(sprite.getData("decorType"));
      const animatedCat = type === "pet" && Boolean(sprite.getData("catExpressionAtlas"));
      if (animatedCat) {
        const next = stepStudioCatExpression(this.catExpressions.get(id) ?? null, { time, distance, playerSpeed, reducedMotion, identity: id });
        this.catExpressions.set(id, next.state);
        sprite.setFrame(next.frame);
      }
      const pulse = reducedMotion || animatedCat ? 1 : 1 + Math.sin(time * .002 + index) * (near ? .035 : .012);
      const baseScaleX = Number(sprite.getData("baseScaleX") ?? sprite.scaleX);
      const baseScaleY = Number(sprite.getData("baseScaleY") ?? sprite.scaleY);
      sprite.setScale(baseScaleX * pulse, baseScaleY * pulse).setAlpha(near ? 1 : .92);
      if (type === "lamp" || type === "portal" || type === "fountain") {
        sprite.setTint(near ? 0xffffff : 0xe9f0ff);
      }
    }
    for (const visual of this.actorVisuals.values()) {
      for (let index = visual.trails.length - 1; index >= 0; index -= 1) {
        const trail = visual.trails[index]!;
        const bornAt = Number(trail.getData("bornAt") ?? time);
        const progress = Math.max(0, Math.min(1, (time - bornAt) / 680));
        trail.setAlpha((1 - progress) * .72).setScale(1 + progress * 1.7);
        if (progress >= 1) { trail.destroy(); visual.trails.splice(index, 1); }
      }
    }
  }

  syncActor(
    id: string,
    sprite: Phaser.GameObjects.Sprite,
    label: Phaser.GameObjects.Text,
    point: StudioVirtualSpacePoint,
    facing: StudioVirtualSpaceFacing,
    moving: boolean,
    customization: StudioVirtualCharacterCustomization,
    time: number,
  ): void {
    let visual = this.actorVisuals.get(id);
    if (!visual) {
      visual = {
        accessory: this.scene.add.sprite(point.x, point.y, this.keys.accessory, 0).setVisible(false),
        aura: this.scene.add.ellipse(point.x, point.y, 62, 18, 0xffffff, 0).setBlendMode("ADD"),
        trails: [],
        lastTrailAt: -Infinity,
      };
      this.actorVisuals.set(id, visual);
    }
    const accessory = STUDIO_VIRTUAL_ACCESSORY_FRAME[customization.accessoryKey];
    const headY = point.y - sprite.displayHeight * sprite.originY;
    const accessorySize = Math.max(24, Math.min(48, sprite.displayHeight * .39));
    visual.accessory
      .setFrame(accessory * 4 + DIRECTION_FRAME[facing])
      .setPosition(point.x, headY + sprite.displayHeight * .22)
      .setDisplaySize(accessorySize, accessorySize)
      .setDepth(sprite.depth + 2)
      .setVisible(accessory > 0);
    const auraColor = AURA_COLOR[customization.auraKey];
    visual.aura
      .setPosition(point.x, point.y + 2)
      .setDepth(sprite.depth - 2)
      .setFillStyle(auraColor || 0xffffff, auraColor ? .2 : 0)
      .setStrokeStyle(auraColor ? 2 : 0, auraColor || 0xffffff, auraColor ? .65 : 0)
      .setScale(customization.auraKey === "focus" ? .84 : customization.auraKey === "neon" ? 1.15 : 1);
    label.setColor(NAMEPLATE_COLOR[customization.nameplateKey]);
    if (moving && customization.trailKey !== "none" && time - visual.lastTrailAt > 135) {
      visual.lastTrailAt = time;
      this.spawnTrail(visual, point, customization.trailKey, sprite.depth - 3, time);
    }
  }
  removeActor(id: string): void {
    const visual = this.actorVisuals.get(id);
    if (!visual) return;
    visual.accessory.destroy(); visual.aura.destroy(); visual.trails.forEach((trail) => trail.destroy());
    this.actorVisuals.delete(id);
  }

  private spawnTrail(visual: ActorCosmeticVisual, point: StudioVirtualSpacePoint,
    trail: StudioVirtualCharacterCustomization["trailKey"], depth: number, time: number): void {
    const color = trail === "petal" ? 0xff9fc8 : trail === "pixel" ? 0x67e9ff : 0xffe173;
    const mark = this.scene.add.circle(point.x + (Math.random() - .5) * 16, point.y + 3, trail === "pixel" ? 3 : 4,
      color, .72).setDepth(depth).setData("bornAt", time);
    if (trail === "star") mark.setStrokeStyle(1, 0xffffff, .8);
    visual.trails.push(mark);
    if (visual.trails.length > 16) visual.trails.shift()?.destroy();
  }

  destroy(): void {
    this.decorationColliders.splice(0).forEach((collider) => collider.destroy());
    this.decorationBodies.splice(0).forEach((body) => body.destroy());
    this.decorationSprites.forEach((sprite) => sprite.destroy());
    this.decorationSprites.clear();
    this.catExpressions.clear();
    for (const id of [...this.actorVisuals.keys()]) this.removeActor(id);
  }
}
