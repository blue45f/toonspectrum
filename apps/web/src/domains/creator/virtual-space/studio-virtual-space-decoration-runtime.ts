import type * as Phaser from "phaser";

import {
  STUDIO_VIRTUAL_ACCESSORY_FRAME,
  STUDIO_VIRTUAL_DECOR_FRAME,
  type StudioVirtualCharacterCustomization,
  type StudioVirtualDecorationState,
  type StudioVirtualDecorType,
} from "./studio-virtual-space-customization";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";

export interface StudioDecorationTextureKeys {
  readonly decor: string;
  readonly accessory: string;
}

interface ActorCosmeticVisual {
  readonly accessory: Phaser.GameObjects.Sprite;
  readonly aura: Phaser.GameObjects.Ellipse;
  readonly trails: Phaser.GameObjects.Arc[];
  lastTrailAt: number;
}

const SOLID_DECOR = new Set<StudioVirtualDecorType>(["tree", "bench", "market-stall", "fountain", "portal"]);
const DIRECTION_FRAME: Readonly<Record<StudioVirtualSpaceFacing, number>> = Object.freeze({ down: 0, right: 1, left: 2, up: 3 });
const AURA_COLOR = Object.freeze({ none: 0, sparkle: 0xffe58a, focus: 0x72ddc6, neon: 0x57e8ff });
const NAMEPLATE_COLOR = Object.freeze({ violet: "#d7c8ff", rose: "#ffc2db", sky: "#bde8ff", amber: "#ffe09a" });
export class StudioVirtualDecorationRuntime {
  private readonly decorationSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly decorationColliders: Phaser.Physics.Arcade.Collider[] = [];
  private readonly actorVisuals = new Map<string, ActorCosmeticVisual>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.GameObjects.GameObject,
    private readonly keys: StudioDecorationTextureKeys,
  ) {}

  syncDecorations(state: StudioVirtualDecorationState): void {
    this.decorationColliders.splice(0).forEach((collider) => collider.destroy());
    this.decorationSprites.forEach((sprite) => sprite.destroy());
    this.decorationSprites.clear();
    for (const placement of state.placements) {
      const sprite = this.scene.add.sprite(placement.x, placement.y, this.keys.decor, STUDIO_VIRTUAL_DECOR_FRAME[placement.type])
        .setDisplaySize(82 * placement.scale, 82 * placement.scale)
        .setAngle(placement.rotation)
        .setOrigin(.5, .9)
        .setDepth(Math.round(placement.y) + 948)
        .setData("decorType", placement.type);
      sprite.setData("baseScaleX", sprite.scaleX).setData("baseScaleY", sprite.scaleY);
      if (SOLID_DECOR.has(placement.type)) {
        this.scene.physics.add.existing(sprite, true);
        const body = sprite.body as Phaser.Physics.Arcade.StaticBody;
        body.setSize(sprite.displayWidth * .62, sprite.displayHeight * .36).setOffset(sprite.displayWidth * .19, sprite.displayHeight * .57);
        this.decorationColliders.push(this.scene.physics.add.collider(this.player, sprite));
      }
      this.decorationSprites.set(placement.id, sprite);
    }
  }
  update(time: number, playerPoint: StudioVirtualSpacePoint, reducedMotion: boolean): void {
    this.decorationSprites.forEach((sprite, index) => {
      const distance = Math.hypot(sprite.x - playerPoint.x, sprite.y - playerPoint.y);
      const near = distance < 92;
      const type = String(sprite.getData("decorType"));
      const pulse = reducedMotion ? 1 : 1 + Math.sin(time * .002 + index) * (near ? .035 : .012);
      const baseScaleX = Number(sprite.getData("baseScaleX") ?? sprite.scaleX);
      const baseScaleY = Number(sprite.getData("baseScaleY") ?? sprite.scaleY);
      sprite.setScale(baseScaleX * pulse, baseScaleY * pulse).setAlpha(near ? 1 : .92);
      if (type === "lamp" || type === "portal" || type === "fountain") {
        sprite.setTint(near ? 0xffffff : 0xe9f0ff);
      }
    });
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
    visual.accessory
      .setFrame(accessory * 4 + DIRECTION_FRAME[facing])
      .setPosition(point.x, point.y - sprite.displayHeight * .62)
      .setDisplaySize(48, 48)
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
    this.decorationSprites.forEach((sprite) => sprite.destroy());
    this.decorationSprites.clear();
    for (const id of [...this.actorVisuals.keys()]) this.removeActor(id);
  }
}
